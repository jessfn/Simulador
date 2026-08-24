import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { notificar } from '../utils/notificacion';

const router = Router();

// GET /api/senales-compra
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { bodega_id, tipo_maiz } = req.query;
  const userId = req.user!.userId;
  try {
    // Cada bodeguero solo ve SUS propios requerimientos, nunca los de otros bodegueros
    let where = 'WHERE sc.activa = TRUE AND sc.usuario_id = $1';
    const params: any[] = [userId];
    if (bodega_id) { params.push(bodega_id); where += ` AND sc.bodega_id = $${params.length}`; }
    if (tipo_maiz) { params.push(tipo_maiz); where += ` AND sc.tipo_maiz = $${params.length}`; }

    const result = await pool.query(
      `SELECT sc.*, b.nombre AS bodega_nombre, b.municipio, b.estado
       FROM senales_compra sc
       JOIN bodegas b ON b.id = sc.bodega_id
       ${where}
       ORDER BY sc.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/senales-compra
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { bodega_id, tipo_maiz, variedad_code, volumen_ton, precio_ofrecido, radio_km,
          vigencia, vigencia_inicio, vigencia_fin, variedades,
          humedad_max_pct, impurezas_max_pct, grano_quebrado_max_pct } = req.body;

  if (!bodega_id || !tipo_maiz || !precio_ofrecido) {
    res.status(400).json({ error: 'Campos requeridos: bodega_id, tipo_maiz, precio_ofrecido' });
    return;
  }

  try {
    // Validar máx 5 requerimientos activos por bodega
    const count = await pool.query(
      'SELECT COUNT(*) FROM senales_compra WHERE bodega_id = $1 AND activa = TRUE',
      [bodega_id]
    );
    if (parseInt(count.rows[0].count) >= 5) {
      res.status(400).json({ error: 'Ya tienes 5 requerimientos activos. Cancela uno antes de publicar un nuevo.' });
      return;
    }

    // Calcular fecha_vencimiento: usar vigencia_fin si se proporciona, si no según vigencia
    let fechaVenc: string;
    if (vigencia_fin) {
      fechaVenc = vigencia_fin;
    } else if (vigencia === 'esta_semana') {
      // Domingo de esta semana
      const d = new Date();
      d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7);
      fechaVenc = d.toISOString().slice(0, 10);
    } else {
      // Default: 15 días
      const d = new Date();
      d.setDate(d.getDate() + 15);
      fechaVenc = d.toISOString().slice(0, 10);
    }

    // Mapear vigencia a valores permitidos por el CHECK constraint
    const vigenciaDb = vigencia === 'rango' || vigencia === 'esta_semana' ? vigencia
      : '15_dias';

    const numOrNull = (v: any) => (v != null && v !== '' ? Number(v) : null);

    const result = await pool.query(
      `INSERT INTO senales_compra
         (bodega_id, usuario_id, tipo_maiz, variedad_code, volumen_ton, precio_ofrecido,
          radio_km, vigencia, vigencia_inicio, fecha_vencimiento,
          humedad_max_pct, impurezas_max_pct, grano_quebrado_max_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [bodega_id, userId, tipo_maiz, variedad_code || null, volumen_ton || null,
       precio_ofrecido, radio_km || 50, vigenciaDb,
       vigencia_inicio || null, fechaVenc,
       numOrNull(humedad_max_pct), numOrNull(impurezas_max_pct), numOrNull(grano_quebrado_max_pct)]
    );

    const senal = result.rows[0];

    // Guardar variedades múltiples solicitadas (tabla senal_variedades)
    if (Array.isArray(variedades) && variedades.length > 0) {
      for (const v of variedades) {
        if (!v || !v.code) continue;
        try {
          await pool.query(
            `INSERT INTO senal_variedades (senal_id, variedad_code, variedad_libre)
             VALUES ($1, $2, $3)
             ON CONFLICT (senal_id, variedad_code) DO NOTHING`,
            [senal.id, v.code, v.libre || null]
          );
        } catch (_) { /* best-effort por variedad */ }
      }
    }

    // C-14 + B-05 + F-06: Notificar productores filtrados por radio con info completa
    try {
      const bodegaR = await pool.query(
        `SELECT b.nombre, b.municipio, b.estado, b.localidad, b.latitud, b.longitud,
                ic.telefono, ic.correo, ic.nombre AS contacto_nombre
         FROM bodegas b
         LEFT JOIN infraestructura_contactos ic ON ic.bodega_id = b.id AND ic.es_principal = TRUE
         WHERE b.id = $1 LIMIT 1`,
        [bodega_id]
      );
      const b = bodegaR.rows[0];
      if (b) {
        const tipoLabel: Record<string, string> = { blanco: 'Maíz Blanco', amarillo: 'Maíz Amarillo', criollo: 'Criollo / Local' };
        const vigLabel = vigencia_fin
          ? `del ${(vigencia_inicio || '').slice(0,10)} al ${vigencia_fin.slice(0,10)}`
          : '15 días';
        const radioReal = Number(radio_km) || 50;
        const radioMetros = radioReal * 1000;

        // Intentar filtrar por radio si hay coordenadas
        let productoresNotif: { usuario_id: number; distancia_km: number }[] = [];
        if (b.latitud && b.longitud) {
          try {
            const pgR = await pool.query(`
              SELECT DISTINCT u2.id AS usuario_id,
                ROUND((ST_Distance(
                  u.centroid::geography,
                  ST_SetSRID(ST_Point($1, $2), 4326)::geography
                ) / 1000)::numeric, 0) AS distancia_km
              FROM up u
              JOIN producer p ON p.producer_id = u.producer_id
              JOIN usuarios u2 ON (u2.id = p.usuario_id OR u2.curp = p.curp OR u2.email = p.correo)
              WHERE u2.rol = 'productor' AND u2.activo = TRUE
                AND u.centroid IS NOT NULL
                AND ST_DWithin(
                  u.centroid::geography,
                  ST_SetSRID(ST_Point($1, $2), 4326)::geography,
                  $3
                )
              ORDER BY distancia_km ASC
            `, [b.longitud, b.latitud, radioMetros]);
            productoresNotif = pgR.rows;
          } catch (_) { /* PostGIS no disponible */ }
        }

        // Fallback al estado si PostGIS no disponible o pocos resultados (P-06: con LIMIT)
        if (productoresNotif.length < 5) {
          const fallR = await pool.query(`
            SELECT DISTINCT u2.id AS usuario_id, 0 AS distancia_km
            FROM up u
            JOIN producer p ON p.producer_id = u.producer_id
            JOIN usuarios u2 ON (u2.id = p.usuario_id OR u2.curp = p.curp OR u2.email = p.correo)
            WHERE u2.rol = 'productor' AND u2.activo = TRUE
              AND u.state_name ILIKE $1
            LIMIT 500
          `, [b.estado]);
          productoresNotif = fallR.rows;
        }

        // Insertar notificación por productor con distancia real
        for (const prod of productoresNotif) {
          const distTxt = prod.distancia_km > 0
            ? `a ${prod.distancia_km} km de tu parcela`
            : `en tu estado`;
          const msg =
            `La bodega "${b.nombre}" busca maíz ${distTxt}.\n\n` +
            `Ubicación: ${b.municipio}, ${b.estado}\n` +
            (b.telefono ? `Contacto: ${b.contacto_nombre || b.nombre} — ${b.telefono}\n` : '') +
            `Precio ofrecido: $${Number(precio_ofrecido).toLocaleString()}/ton\n` +
            `Busca: ${volumen_ton || '?'} ton de ${tipoLabel[tipo_maiz] || tipo_maiz}\n` +
            `Vigencia: ${vigLabel}`;
          const datosExtra = JSON.stringify({
            bodega_nombre: b.nombre,
            bodega_lat: b.latitud,
            bodega_lng: b.longitud,
            bodega_municipio: b.municipio,
            bodega_estado: b.estado,
            precio_ofrecido,
            tipo_maiz,
          });
          notificar({
            usuarioId: prod.usuario_id,
            tipo: 'senal_compra',
            titulo: '🌽 Nueva señal de compra cerca de ti',
            mensaje: msg,
            referenciaId: senal.id,
            referenciaTipo: 'senales_compra',
            datosExtra,
          }).catch(() => {});
        }
      }
    } catch (_) { /* best-effort */ }

    res.status(201).json(senal);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/senales-compra/:id (desactivar)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `UPDATE senales_compra SET activa = FALSE WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Señal no encontrada o sin permiso' }); return; }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/senales-compra/:id/interes
router.post('/:id/interes', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const senal = await pool.query(
      `UPDATE senales_compra SET interesados_count = interesados_count + 1
       WHERE id = $1 AND activa = TRUE RETURNING *`,
      [req.params.id]
    );
    if (senal.rows.length === 0) { res.status(404).json({ error: 'Señal no encontrada o inactiva' }); return; }

    const s = senal.rows[0];

    // Guardar QUIÉN respondió (para que el bodeguero pueda verlo y contactarlo)
    try {
      const productorData = await pool.query(
        `SELECT
            p.producer_id,
            TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS nombre_completo,
            up.municipality_name AS municipio,
            up.state_name AS estado,
            COALESCE(p.phone, usr.telefono) AS telefono
         FROM producer p
         JOIN usuarios usr ON usr.id = p.usuario_id
         LEFT JOIN up ON up.producer_id = p.producer_id
         WHERE usr.id = $1
         ORDER BY up.created_at DESC NULLS LAST
         LIMIT 1`,
        [userId]
      );
      const prod = productorData.rows[0];
      if (prod) {
        await pool.query(
          `INSERT INTO senal_interesados
             (senal_id, producer_id, usuario_id, municipio, estado, telefono, nombre_productor)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (senal_id, producer_id) DO NOTHING`,
          [req.params.id, prod.producer_id, userId, prod.municipio, prod.estado, prod.telefono, prod.nombre_completo]
        );
      }
    } catch (_) { /* best-effort: tabla puede no existir aún */ }

    notificar({
      usuarioId: s.usuario_id,
      tipo: 'interes_senal',
      titulo: '📩 Nuevo interesado en tu señal',
      mensaje: `Un productor respondió a tu señal. Ya tienes ${s.interesados_count} interesado${s.interesados_count !== 1 ? 's' : ''}.`,
      referenciaId: s.id,
      referenciaTipo: 'senales_compra',
    }).catch(() => {});

    res.json({ ok: true, interesados_count: s.interesados_count });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/senales-compra/:id/interesados
// Bodeguero ve quién respondió a su señal (solo el dueño de la señal)
router.get('/:id/interesados', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const isAdmin = ['admin', 'responsable'].includes(req.user!.rol);
  try {
    const { id } = req.params;

    // Verificar que la señal pertenece al bodeguero autenticado (admin puede ver cualquiera)
    const senal = await pool.query(
      `SELECT sc.id, sc.usuario_id FROM senales_compra sc WHERE sc.id = $1`,
      [id]
    );
    if (senal.rows.length === 0) {
      res.status(404).json({ error: 'Señal no encontrada' });
      return;
    }
    if (!isAdmin && senal.rows[0].usuario_id !== userId) {
      res.status(403).json({ error: 'No tienes acceso a esta señal' });
      return;
    }

    const result = await pool.query(
      `SELECT
          si.id,
          si.nombre_productor AS nombre,
          si.municipio,
          si.estado,
          si.telefono,
          si.created_at AS fecha_interes
       FROM senal_interesados si
       WHERE si.senal_id = $1
       ORDER BY si.created_at DESC`,
      [id]
    );

    res.json({ total: result.rows.length, interesados: result.rows });
  } catch (err: any) {
    console.error('Error al obtener interesados:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
