import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import pool from '../config/database';
import { soloMaiz } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { enviarPushNativa } from '../utils/webpush';

const router = Router();

const UPLOAD_DIR = process.env.NODE_ENV === 'production'
  ? '/var/www/Simulador/uploads/senasica'
  : path.join(__dirname, '../../../uploads/senasica');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => cb(null, `senasica_${Date.now()}_${file.originalname}`)
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.csv$/i)) return cb(new Error('Solo se permiten archivos CSV'));
    cb(null, true);
  },
  limits: { fileSize: Infinity }
});

// ─── Normaliza texto para comparar (sin tildes, minúsculas) ──────────
function norm(s: string) {
  return s.toLowerCase()
    .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u');
}

// ─── Parsea CSV detectando columnas por nombre ────────────────────────
interface Punto {
  cve_geo: string; cve_ent: string; cve_mun: string;
  lng: number; lat: number; hectareas: number; riesgo: string;
}

async function parsearCSV(filePath: string): Promise<Punto[]> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'latin1' }),
      crlfDelay: Infinity
    });

    let isHeader = true;
    let iCveGeo = -1, iCveEnt = -1, iCveMun = -1;
    let iX = -1, iY = -1, iHect = -1, iRiesgo = -1;

    const puntos: Punto[] = [];

    rl.on('line', (raw) => {
      const cols = raw.split(',');

      if (isHeader) {
        isHeader = false;
        const h = cols.map(c => norm(c.trim()));
        iCveGeo = h.findIndex(c => c === 'cvegeo');
        iCveEnt = h.findIndex(c => c === 'cve_ent');
        iCveMun = h.findIndex(c => c === 'cve_mun');
        iX      = h.findIndex(c => c === 'x');
        iY      = h.findIndex(c => c === 'y');
        iHect   = h.findIndex(c => c === 'hectareas');
        iRiesgo = h.findIndex(c => c === 'riesgo');
        return;
      }

      if (iX < 0 || iY < 0 || iRiesgo < 0) return;
      if (cols.length <= Math.max(iX, iY, iRiesgo)) return;

      const lng = parseFloat(cols[iX]);
      const lat = parseFloat(cols[iY]);
      if (isNaN(lng) || isNaN(lat)) return;

      puntos.push({
        cve_geo:  iCveGeo >= 0 ? (cols[iCveGeo]?.trim() ?? '') : '',
        cve_ent:  iCveEnt >= 0 ? (cols[iCveEnt]?.trim() ?? '') : '',
        cve_mun:  iCveMun >= 0 ? (cols[iCveMun]?.trim() ?? '') : '',
        lng, lat,
        hectareas: iHect >= 0 ? (parseFloat(cols[iHect]) || 0) : 0,
        riesgo:    cols[iRiesgo]?.trim().toLowerCase() ?? 'medio'
      });
    });

    rl.on('close', () => resolve(puntos));
    rl.on('error', reject);
  });
}

// ─── Deduplica por (cve_geo, nivel) promediando coordenadas ──────────
interface Grupo {
  cve_geo: string; cve_ent: string; cve_mun: string;
  lng: number; lat: number; hectareas: number; nivel: string; count: number;
}

function deduplicar(puntos: Punto[]): Grupo[] {
  const map = new Map<string, Grupo>();

  for (const p of puntos) {
    const nivelNorm = norm(p.riesgo);
    const nivel = nivelNorm.includes('alto') ? 'alto'
                : nivelNorm.includes('medio') ? 'medio' : 'bajo';
    const key = `${p.cve_geo}|${nivel}`;

    const ex = map.get(key);
    if (!ex) {
      map.set(key, { cve_geo: p.cve_geo, cve_ent: p.cve_ent, cve_mun: p.cve_mun,
                     lng: p.lng, lat: p.lat, hectareas: p.hectareas, nivel, count: 1 });
    } else {
      // Promedio acumulativo de coordenadas
      ex.lng       = (ex.lng * ex.count + p.lng) / (ex.count + 1);
      ex.lat       = (ex.lat * ex.count + p.lat) / (ex.count + 1);
      ex.hectareas += p.hectareas;
      ex.count++;
    }
  }

  return Array.from(map.values());
}

// ─── Procesamiento principal (corre en background) ───────────────────
async function procesarCSV(
  filePath: string,
  cargaId: number,
  nombrePlaga: string,
  totalPuntosCSV: number
) {
  try {
    const puntos = await parsearCSV(filePath);

    // Actualizar total de puntos leídos
    await pool.query(
      `UPDATE senasica_cargas SET total_puntos = $1 WHERE id = $2`,
      [puntos.length, cargaId]
    );

    // Desactivar alertas anteriores de SENASICA
    await pool.query(`UPDATE alertas_externas SET activa = FALSE WHERE fuente = 'SENASICA'`);

    // Parámetros de radio
    const radiosRes = await pool.query(
      `SELECT nivel_riesgo, radio_km FROM senasica_parametros WHERE activo = TRUE`
    );
    const radios: Record<string, number> = { alto: 50, medio: 25, bajo: 10 };
    for (const r of radiosRes.rows) radios[r.nivel_riesgo] = r.radio_km;

    // Deduplicar por municipio × nivel
    const grupos = deduplicar(puntos);

    let totalUps = 0;
    let totalNotif = 0;

    for (const g of grupos) {
      const radioKm = radios[g.nivel] ?? 25;

      const desc  = `Detección de ${nombrePlaga} en cultivo de maíz. ` +
                    `Superficie estimada: ${Math.round(g.hectareas).toLocaleString('es-MX')} ha (${g.count} puntos).`;
      const recom = g.nivel === 'alto'  ? 'Inspecciona tu cultivo de inmediato y contacta a tu técnico de campo.'
                  : g.nivel === 'medio' ? 'Revisa tu cultivo en los próximos días y mantente alerta.'
                  :                       'Mantente informado. El riesgo es bajo en este momento.';

      const alertaRes = await pool.query(
        `INSERT INTO alertas_externas
           (tipo_alerta, subtipo, nivel_riesgo, descripcion, recomendacion,
            cultivo_afectado, coordenada, radio_km, estado, municipio,
            fecha_deteccion, fuente, id_alerta_origen, activa)
         VALUES
           ('fitosanitaria', $1, $2, $3, $4, 'maiz',
            ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
            $7, $8, $9, NOW()::date, 'SENASICA', $10, TRUE)
         ON CONFLICT (id_alerta_origen) DO UPDATE
           SET activa = TRUE, nivel_riesgo = EXCLUDED.nivel_riesgo,
               descripcion = EXCLUDED.descripcion
         RETURNING id`,
        [
          nombrePlaga, g.nivel, desc, recom,
          g.lng, g.lat, radioKm,
          g.cve_ent, g.cve_mun,
          `SENASICA-${g.cve_geo}-${g.nivel}-${cargaId}`
        ]
      );

      const alertaId = alertaRes.rows[0]?.id;
      if (!alertaId) continue;

      // Buscar UPs dentro del radio (una sola query por grupo)
      const upsRes = await pool.query(
        `SELECT
           u.up_id, p.producer_id,
           us.id AS usuario_id,
           us.push_endpoint, us.push_p256dh, us.push_auth, us.push_activo,
           ROUND(
             (ST_Distance(
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
               u.geom::geography
             ) / 1000.0)::numeric
           , 1) AS distancia_km
         FROM up u
         JOIN producer p  ON p.producer_id = u.producer_id AND ${soloMaiz('p')}
         JOIN usuarios us ON us.id = p.usuario_id
         WHERE ST_DWithin(
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
           u.geom::geography,
           $3 * 1000
         )
         AND us.activo = TRUE
         AND u.geom IS NOT NULL`,
        [g.lng, g.lat, radioKm]
      );

      const emoji = g.nivel === 'alto' ? '🔴' : g.nivel === 'medio' ? '🟡' : '🟢';
      const titulo = `${emoji} Alerta fitosanitaria — ${nombrePlaga}`;

      for (const up of upsRes.rows) {
        totalUps++;

        await pool.query(
          `INSERT INTO alertas_up (alerta_id, up_id, distancia_km, notificado)
           VALUES ($1, $2, $3, FALSE)
           ON CONFLICT (alerta_id, up_id) DO NOTHING`,
          [alertaId, up.up_id, up.distancia_km]
        );

        const mensaje = g.nivel === 'alto'
          ? `Se detectó ${nombrePlaga} con riesgo ALTO a ${up.distancia_km} km de tu parcela. Inspecciona tu cultivo de inmediato.`
          : g.nivel === 'medio'
          ? `Se detectó ${nombrePlaga} con riesgo MEDIO a ${up.distancia_km} km de tu parcela. Revisa tu cultivo pronto.`
          : `Se detectó ${nombrePlaga} cerca de tu zona (${up.distancia_km} km). Riesgo BAJO. Mantente informado.`;

        await pool.query(
          `INSERT INTO notificaciones (usuario_id, alerta_externa_id, titulo, mensaje, tipo, leida)
           VALUES ($1, $2, $3, $4, 'alerta_sanitaria', FALSE)`,
          [up.usuario_id, alertaId, titulo, mensaje]
        );

        await pool.query(
          `UPDATE alertas_up SET notificado = TRUE WHERE alerta_id = $1 AND up_id = $2`,
          [alertaId, up.up_id]
        );

        if (up.push_activo && up.push_endpoint) {
          await enviarPushNativa(
            { endpoint: up.push_endpoint, p256dh: up.push_p256dh, auth: up.push_auth },
            { titulo, mensaje, tipo: 'alerta_sanitaria', nivel: g.nivel }
          ).catch(err => console.error(`Push fallida usuario ${up.usuario_id}:`, err));
        }

        totalNotif++;
      }
    }

    await pool.query(
      `UPDATE senasica_cargas SET
         estado = 'completado',
         total_puntos = $1,
         total_ups_afectadas = $2,
         total_notificaciones = $3,
         completado_en = NOW()
       WHERE id = $4`,
      [puntos.length, totalUps, totalNotif, cargaId]
    );

  } catch (err) {
    console.error('Error procesando CSV SENASICA:', err);
    await pool.query(
      `UPDATE senasica_cargas SET estado = 'error', error_detalle = $1 WHERE id = $2`,
      [String(err), cargaId]
    ).catch(() => {});
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/senasica/cargar-csv  — recibe archivo, responde INMEDIATO
// ─────────────────────────────────────────────────────────────────────
router.post('/cargar-csv', authMiddleware, upload.single('archivo'), async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }

  const usuarioId  = req.user?.userId;
  const filePath   = req.file.path;
  const nombrePlaga = req.file.originalname
    .replace(/-(Riego|Temporal|Mixto)/i, '')
    .replace(/\.csv$/i, '')
    .trim() || 'Plaga detectada';

  try {
    const cargaRes = await pool.query(
      `INSERT INTO senasica_cargas (nombre_archivo, usuario_id, estado)
       VALUES ($1, $2, 'procesando') RETURNING id`,
      [req.file.originalname, usuarioId]
    );
    const cargaId = cargaRes.rows[0].id;

    // Responder de inmediato — el procesamiento sigue en background
    res.json({ ok: true, cargaId, mensaje: 'Archivo recibido. Procesando en background.' });

    // Procesar sin bloquear
    procesarCSV(filePath, cargaId, nombrePlaga, 0).catch(() => {});

  } catch (err) {
    console.error('Error registrando carga:', err);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: 'Error al registrar la carga' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/senasica/estado/:id  — polling del estado de procesamiento
// ─────────────────────────────────────────────────────────────────────
router.get('/estado/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT id, nombre_archivo, estado, total_puntos, total_ups_afectadas,
              total_notificaciones, error_detalle, created_at, completado_en
       FROM senasica_cargas WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) { res.status(404).json({ error: 'No encontrado' }); return; }
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/senasica/historial
// ─────────────────────────────────────────────────────────────────────
router.get('/historial', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT sc.*, u.nombre_completo AS subido_por
       FROM senasica_cargas sc
       LEFT JOIN usuarios u ON u.id = sc.usuario_id
       ORDER BY sc.created_at DESC LIMIT 20`
    );
    res.json({ cargas: result.rows });
  } catch {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/senasica/parametros
// ─────────────────────────────────────────────────────────────────────
router.get('/parametros', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`SELECT * FROM senasica_parametros ORDER BY radio_km DESC`);
    res.json({ parametros: result.rows });
  } catch {
    res.status(500).json({ error: 'Error al obtener parámetros' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PATCH /api/senasica/parametros/:nivel
// ─────────────────────────────────────────────────────────────────────
router.patch('/parametros/:nivel', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nivel } = req.params;
    const { radio_km } = req.body;
    if (!['alto', 'medio', 'bajo'].includes(nivel)) { res.status(400).json({ error: 'Nivel inválido' }); return; }
    if (!radio_km || radio_km < 1 || radio_km > 500) { res.status(400).json({ error: 'Radio debe ser entre 1 y 500 km' }); return; }
    await pool.query(
      `UPDATE senasica_parametros SET radio_km = $1, updated_at = NOW() WHERE nivel_riesgo = $2`,
      [radio_km, nivel]
    );
    res.json({ ok: true, nivel, radio_km });
  } catch {
    res.status(500).json({ error: 'Error al actualizar parámetro' });
  }
});

export default router;
