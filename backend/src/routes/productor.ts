import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { notificar } from '../utils/notificacion';
import { reverseGeocode, canonicalizarEstado } from '../utils/geocode';
import { consultarPersonaPorCURP } from '../services/saderService';
import { consultarCURPEnRENAPO } from '../services/renapoService';
import { verificarBloqueo, registrarIntentoFallido, limpiarIntentosFallidos } from '../utils/loginLockout';
import { authLimiter } from '../middleware/rateLimiters';
import crypto from 'crypto';

// Directorio de almacenamiento para verificaciones biométricas
const UPLOAD_DIR = process.env.NODE_ENV === 'production'
  ? '/var/www/Simulador/uploads/verificacion'
  : path.join(__dirname, '../../../uploads/verificacion');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storageVerificacion = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    cb(null, `vrf_${ts}_${rand}.jpg`);
  },
});
const uploadVerificacion = multer({
  storage: storageVerificacion,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

const router = Router();

// Normalizar texto: MAYÚSCULAS y sin tildes/acentos
function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

// ─────────────────────────────────────────────
// POST /api/productor/auth/upload-verificacion
// Sube la foto de verificación biométrica del titular antes del registro.
// Devuelve la ruta relativa para incluirla en el payload de registro.
// ─────────────────────────────────────────────
router.post('/auth/upload-verificacion', uploadVerificacion.single('foto'), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ error: 'No se recibió ninguna imagen' });
    return;
  }
  res.json({ path: `verificacion/${req.file.filename}` });
});

// ─────────────────────────────────────────────
// AUTH — Activación por CURP (Tipo A)
// ─────────────────────────────────────────────

// POST /api/productor/auth/buscar-curp
router.post('/auth/buscar-curp', authLimiter, async (req, res): Promise<void> => {
  try {
    const { curp } = req.body;
    if (!curp || curp.length !== 18) {
      res.status(400).json({ error: 'CURP inválida' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT p.producer_id, p.nombres, p.apellido_paterno, p.estado_validacion,
              u.id AS usuario_id
       FROM producer p
       LEFT JOIN usuarios u ON u.id = p.usuario_id
       WHERE UPPER(p.curp) = UPPER($1)`,
      [curp]
    );

    if (!rows.length) {
      res.json({ encontrado: false });
      return;
    }

    res.json({
      encontrado: true,
      nombres: rows[0].nombres,
      apellido: rows[0].apellido_paterno,
      producer_id: rows[0].producer_id,
      ya_tiene_cuenta: !!rows[0].usuario_id,
    });
  } catch (error) {
    console.error('Error en buscar-curp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/auth/activar-cuenta
router.post('/auth/activar-cuenta', authLimiter, async (req, res): Promise<void> => {
  try {
    const { producer_id, pin } = req.body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos' });
      return;
    }

    const existing = await pool.query(
      `SELECT u.id FROM usuarios u JOIN producer p ON p.usuario_id = u.id WHERE p.producer_id = $1`,
      [producer_id]
    );
    if (existing.rows.length) {
      res.status(409).json({ error: 'Este productor ya tiene cuenta activa' });
      return;
    }

    // Obtener datos del productor para el INSERT de usuarios
    const prodInfo = await pool.query(
      `SELECT curp, nombres, apellido_paterno, apellido_materno,
              COALESCE(phone, '') AS telefono
       FROM producer WHERE producer_id = $1`,
      [producer_id]
    );
    if (!prodInfo.rows.length) {
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }
    const prod = prodInfo.rows[0];
    const nombreCompleto = [prod.nombres, prod.apellido_paterno, prod.apellido_materno]
      .filter(Boolean).join(' ');

    const hashedPin = await bcrypt.hash(pin, 10);

    // Transacción: crear usuario + vincular productor
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const u = await client.query(
        `INSERT INTO usuarios (curp, nombre_completo, password_hash, pin_texto, telefono, rol, activo)
         VALUES ($1, $2, $3, $4, $5, 'productor', true) RETURNING id`,
        [prod.curp, nombreCompleto, hashedPin, String(pin), prod.telefono]
      );

      const producer = await client.query(
        `UPDATE producer
         SET usuario_id = $1, tipo_registro = 'A', estado_validacion = 'activo'
         WHERE producer_id = $2 RETURNING nombres, apellido_paterno, apellido_materno`,
        [u.rows[0].id, producer_id]
      );

      await client.query('COMMIT');

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('FATAL: JWT_SECRET no definida en variables de entorno. El servidor no puede arrancar sin esta variable.');
      }
      const token = jwt.sign(
        { userId: u.rows[0].id, rol: 'productor', producer_id, jti: crypto.randomUUID() },
        secret,
        { expiresIn: '7d' }
      );

      const p0 = producer.rows[0];
      res.json({
        token,
        user: {
          id: u.rows[0].id,
          rol: 'productor',
          producer_id,
          nombre_completo: nombreCompleto,
          nombres: p0?.nombres,
          apellido_paterno: p0?.apellido_paterno,
          apellido_materno: p0?.apellido_materno,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error en activar-cuenta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/auth/login-pin
// Login con CURP + PIN (para productores)
router.post('/auth/login-pin', authLimiter, async (req, res): Promise<void> => {
  try {
    const { curp, pin } = req.body;
    if (!curp || !pin) {
      res.status(400).json({ error: 'CURP y PIN son obligatorios' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT p.producer_id, p.nombres, p.apellido_paterno, p.apellido_materno, p.estado_validacion,
              u.id AS user_id, u.password_hash, u.rol, u.nombre_completo
       FROM producer p
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE UPPER(p.curp) = UPPER($1) AND u.activo = true`,
      [curp]
    );

    // Mensaje genérico: no revelar si la CURP existe, está inactiva o el PIN
    // es incorrecto — evita que un atacante enumere CURPs válidas.
    const MSG_GENERICO = { error: 'CURP o NIP incorrectos.' };

    if (!rows.length) {
      res.status(401).json(MSG_GENERICO);
      return;
    }

    const user = rows[0];

    const minutosBloqueo = await verificarBloqueo(user.user_id);
    if (minutosBloqueo !== null) {
      res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutosBloqueo} minuto(s).` });
      return;
    }

    const pinValido = await bcrypt.compare(pin, user.password_hash);
    if (!pinValido) {
      await registrarIntentoFallido(user.user_id);
      res.status(401).json(MSG_GENERICO);
      return;
    }
    await limpiarIntentosFallidos(user.user_id);

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET no definida en variables de entorno. El servidor no puede arrancar sin esta variable.');
    }
    const token = jwt.sign(
      { userId: user.user_id, rol: 'productor', producer_id: user.producer_id, jti: crypto.randomUUID() },
      secret,
      { expiresIn: '7d' }
    );

    // nombre_completo preferido desde usuarios (puede incluir ediciones del perfil);
    // si está vacío (registros muy antiguos) se construye desde el padrón.
    const nombreCompleto = user.nombre_completo?.trim() ||
      [user.nombres, user.apellido_paterno, user.apellido_materno].filter(Boolean).join(' ');

    res.json({
      token,
      user: {
        id: user.user_id,
        rol: 'productor',
        producer_id: user.producer_id,
        nombre_completo: nombreCompleto,
        nombres: user.nombres,
        apellido_paterno: user.apellido_paterno,
        apellido_materno: user.apellido_materno,
        estado_validacion: user.estado_validacion,
      },
    });
  } catch (error) {
    console.error('Error en login-pin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/productor/geo/reverse?lat=&lng= — reverse-geocoding público
// Devuelve el estado y municipio exactos según las coordenadas marcadas.
// Público porque se usa también durante el registro (sin sesión).
router.get('/geo/reverse', async (req, res): Promise<void> => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'lat y lng son requeridos' });
    return;
  }
  try {
    const g = await reverseGeocode(lat, lng);
    res.json({
      estado: g.state_name,
      municipio: g.municipality_name,
      state_id: g.state_id,
      municipality_id: g.municipality_id,
      source: g.source,
    });
  } catch (error) {
    console.error('Error en geo/reverse:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/auth/consultar-curp
// Verifica la CURP contra el padrón de SADER/RENAPO y precarga los datos.
// El chequeo de BD y la llamada a SADER corren en PARALELO para mayor velocidad.
router.post('/auth/consultar-curp', authLimiter, async (req, res): Promise<void> => {
  const { curp } = req.body;

  const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
  if (!curp || !CURP_RE.test(curp.toUpperCase().trim())) {
    res.status(400).json({ error: 'CURP inválida. Verifica el formato (18 caracteres).' });
    return;
  }
  const curpN = curp.toUpperCase().trim();

  // Lanzar chequeo BD y llamada SADER simultáneamente
  const saderPromise = consultarPersonaPorCURP(curpN);

  try {
    // Revisar producer (incluye admin-registrados sin cuenta) Y usuarios en una sola query
    const [prodResult, usuResult] = await Promise.all([
      pool.query(
        `SELECT p.producer_id, u.id AS usuario_id, p.nombres, p.apellido_paterno
         FROM producer p LEFT JOIN usuarios u ON u.id = p.usuario_id
         WHERE UPPER(p.curp) = $1 LIMIT 1`,
        [curpN]
      ),
      pool.query(
        'SELECT id FROM usuarios WHERE UPPER(curp) = $1 LIMIT 1',
        [curpN]
      ),
    ]);

    if (prodResult.rows.length > 0) {
      const row = prodResult.rows[0];
      if (row.usuario_id) {
        // Cuenta completa activa
        res.status(409).json({
          error: `Esta CURP ya tiene cuenta en SIMAC. Inicia sesión con tu CURP y NIP.`,
          codigo: 'CURP_DUPLICADA',
          nombres: row.nombres,
        });
      } else {
        // Está en el padrón interno pero sin cuenta — debe activarla
        res.status(409).json({
          error: 'Tu CURP ya está registrada en SIMAC pero aún no tienes cuenta activa. Contacta a tu técnico territorial.',
          codigo: 'PUEDE_ACTIVAR',
          nombres: row.nombres,
        });
      }
      return;
    }
    if (usuResult.rows.length > 0) {
      res.status(409).json({
        error: 'Esta CURP ya tiene cuenta en SIMAC. Inicia sesión con tu CURP y NIP.',
        codigo: 'CURP_DUPLICADA',
      });
      return;
    }
  } catch (e) {
    res.status(500).json({ error: 'Error interno.' });
    return;
  }

  // BD no tiene esta CURP — esperar resultado de SADER (ya estaba corriendo en paralelo)
  try {
    const datos = await saderPromise;

    if (!datos) {
      // SIGAP no lo tiene — RENAPO debe confirmar que la persona existe y está viva
      const renapo = await consultarCURPEnRENAPO(curpN);

      // RENAPO no disponible por cualquier razón → bloquear (no se puede verificar identidad)
      if (!renapo.encontrado) {
        const esPorNoExistir = renapo.codigo === 'NO_EN_RENAPO';
        console.warn(`[RENAPO] Bloqueando registro — código: ${renapo.codigo}`);
        res.status(404).json({
          error: esPorNoExistir
            ? 'Tu CURP no existe en el Registro Nacional de Población. Verifica que la escribiste correctamente.'
            : 'No es posible verificar tu identidad en este momento. Intenta más tarde.',
          codigo: esPorNoExistir ? 'CURP_NO_VALIDA_RENAPO' : 'VERIFICACION_NO_DISPONIBLE'
        });
        return;
      }

      // CURP de persona fallecida → bloquear
      if (renapo.fallecido) {
        res.status(403).json({
          error: 'La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.',
          codigo: 'CURP_FALLECIDO'
        });
        return;
      }

      // RENAPO confirma que es persona viva y válida → abrir formulario manual con datos
      res.status(404).json({
        error: 'Tu CURP no está en el padrón de SADER. Puedes completar tu registro manualmente.',
        codigo: 'NO_EN_PADRON',
        datos_renapo: {
          nombres:      renapo.datos!.nombres,
          apellido_pat: renapo.datos!.apellidoPat,
          apellido_mat: renapo.datos!.apellidoMat,
          sexo:         renapo.datos!.sexo,
          fecha_nac:    renapo.datos!.fechaNac,
          entidad_nac:  renapo.datos!.entidadNac,
        },
      });
      return;
    }

    // Si ya está en el padrón de SADER (activo_padron), se registra directo —
    // el padrón es la fuente de verdad. El estatus interno de cruce con RENAPO
    // ("PR" pendiente, etc.) es informativo y NO bloquea el registro: solo se
    // usa para decidir si hay que verificar viva/fallecida cuando NO está en
    // el padrón (rama de arriba, datos === null).
    if (!datos.activo_padron) {
      // No está activa en el padrón de SADER (dada de baja) → confirmar si es
      // por fallecimiento antes de dar el mensaje genérico.
      const renapoInactivo = await consultarCURPEnRENAPO(curpN);
      if (renapoInactivo.encontrado && renapoInactivo.fallecido) {
        res.status(403).json({
          error: 'La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.',
          codigo: 'CURP_FALLECIDO'
        });
        return;
      }
      res.status(403).json({
        error: 'Tu registro en el padrón no está activo. Contacta a tu técnico territorial.',
        codigo: 'INACTIVO_PADRON'
      });
      return;
    }

    res.json({
      encontrado: true,
      datos: {
        curp: datos.curp,
        nombres: datos.nombres,
        apellido_paterno: datos.apellido_paterno,
        apellido_materno: datos.apellido_materno,
        fecha_nacimiento: datos.fecha_nacimiento,
        genero: datos.genero,
        telefono: datos.telefono,
        correo: datos.correo,
        estado_padron: datos.estado,
        municipio_padron: datos.municipio,
        localidad_padron: datos.localidad
      }
    });
  } catch (error: any) {
    // SADER lanzó error (timeout, caído, auth) → verificar identidad con RENAPO
    console.warn('[SADER] No disponible, verificando con RENAPO:', error.message);

    const renapo = await consultarCURPEnRENAPO(curpN);

    if (!renapo.encontrado) {
      const esPorNoExistir = renapo.codigo === 'NO_EN_RENAPO';
      res.status(404).json({
        error: esPorNoExistir
          ? 'Tu CURP no existe en el Registro Nacional de Población. Verifica que la escribiste correctamente.'
          : 'No es posible verificar tu identidad en este momento. Intenta más tarde.',
        codigo: esPorNoExistir ? 'CURP_NO_VALIDA_RENAPO' : 'VERIFICACION_NO_DISPONIBLE'
      });
      return;
    }

    if (renapo.fallecido) {
      res.status(403).json({
        error: 'La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.',
        codigo: 'CURP_FALLECIDO'
      });
      return;
    }

    // RENAPO confirma persona viva → formulario manual
    res.status(404).json({
      error: 'Tu CURP no está en el padrón de SADER. Puedes completar tu registro manualmente.',
      codigo: 'NO_EN_PADRON',
      datos_renapo: {
        nombres:      renapo.datos!.nombres,
        apellido_pat: renapo.datos!.apellidoPat,
        apellido_mat: renapo.datos!.apellidoMat,
        sexo:         renapo.datos!.sexo,
        fecha_nac:    renapo.datos!.fechaNac,
        entidad_nac:  renapo.datos!.entidadNac,
      },
    });
  }
});


// Cap de área a NUMERIC(10,4) → máx 999999.9999 ha (evita overflow 22003)
function capAreaHa(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 999999.9999);
}

// Crea una UP para un productor dentro de una transacción.
// Lanza Error con .code='UP_OVERLAP' y .up_conflicto si el polígono se intersecta con otra UP del productor.
async function crearUP(client: any, producerId: number, up: any): Promise<number> {
  const { lat, lng, poligono, area_calc_ha, area_real_ha, coincide_area } = up;
  const upName = (up.nombre_up && String(up.nombre_up).trim()) || 'Mi Parcela';
  let estadoFinal = up.estado_up;
  let municipioFinal = up.municipio_up;
  let stateIdFinal: string | null = null;
  let municipalityIdFinal: string | null = null;

  const hasCoords = lat != null && lng != null && lat !== 0 && lng !== 0;
  const hasPoligono = poligono && Array.isArray(poligono) && poligono.length >= 3;
  const postgisActivo = process.env.POSTGIS_ENABLED === 'true';

  if (hasCoords) {
    const g = await reverseGeocode(Number(lat), Number(lng));
    if (g.state_name) estadoFinal = g.state_name;
    if (g.municipality_name) municipioFinal = g.municipality_name;
    stateIdFinal = g.state_id;
    municipalityIdFinal = g.municipality_id;
  } else if (estadoFinal) {
    // Sin coordenadas: canonicalizar contra geo_state para evitar guardar nombres en mayúsculas del padrón
    const c = await canonicalizarEstado(estadoFinal, municipioFinal);
    estadoFinal = c.state_name;
    if (c.municipality_name) municipioFinal = c.municipality_name;
    stateIdFinal = c.state_id;
    municipalityIdFinal = c.municipality_id;
  }

  const areaCalc = capAreaHa(area_calc_ha);
  const areaReal = capAreaHa(area_real_ha);
  const geojson = hasPoligono ? JSON.stringify({
    type: 'Polygon',
    coordinates: [[
      ...poligono.map(([plat, plng]: [number, number]) => [plng, plat]),
      [poligono[0][1], poligono[0][0]],
    ]],
  }) : null;

  // Overlap con UPs existentes del mismo productor
  if (hasPoligono && postgisActivo) {
    const ov = await client.query(
      `SELECT up_id, up_name FROM up
       WHERE producer_id = $1 AND geom IS NOT NULL
         AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
       LIMIT 1`,
      [producerId, geojson]
    );
    if (ov.rows.length > 0) {
      const e: any = new Error('overlap');
      e.code = 'UP_OVERLAP';
      e.up_conflicto = ov.rows[0].up_name;
      throw e;
    }
  }

  // Overlap con UPs de OTROS productores (no bloqueante — se guarda con bandera para revisión admin)
  let traslapeProducerId: number | null = null;
  if (hasPoligono && postgisActivo) {
    const ovCruz = await client.query(
      `SELECT traslape_producer_id FROM (
         SELECT u.producer_id AS traslape_producer_id,
           ST_Area(ST_Intersection(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))::geography)
           / NULLIF(ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326)::geography), 0) AS pct
         FROM up u
         WHERE u.producer_id != $1 AND u.geom IS NOT NULL
           AND ST_Overlaps(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
       ) t WHERE t.pct > 0.10 LIMIT 1`,
      [producerId, geojson]
    );
    if (ovCruz.rows.length > 0) traslapeProducerId = ovCruz.rows[0].traslape_producer_id;
  }

  let upId: number;
  if (hasCoords) {
    const useGeom = hasPoligono && postgisActivo;
    const geomSql = useGeom ? `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))` : 'NULL';
    const aIdx = useGeom ? 7 : 6;
    const params = [
      producerId, estadoFinal, municipioFinal, lng, lat,
      ...(useGeom ? [geojson] : []),
      areaCalc, areaReal, coincide_area ?? null, upName,
    ];
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid, geom,
          area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
       VALUES ($1, $${aIdx + 3}, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), ${geomSql},
               $${aIdx}, $${aIdx + 1}, $${aIdx + 2}, TRUE, 'productor')
       RETURNING up_id`,
      params
    );
    upId = r.rows[0].up_id;
  } else if (hasPoligono && postgisActivo) {
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid, geom,
          area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
       VALUES ($1, $8, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3,
               ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
               ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
               $5, $6, $7, TRUE, 'poligono_calculado')
       RETURNING up_id`,
      [producerId, estadoFinal, municipioFinal, geojson, areaCalc, areaReal, coincide_area ?? null, upName]
    );
    upId = r.rows[0].up_id;
  } else {
    let centroidVal = null;
    try {
      const muni = await client.query(
        `SELECT centroid::geometry AS centroid FROM municipios_referencia
         WHERE LOWER(nombre) = LOWER($1) AND LOWER(estado) = LOWER($2) LIMIT 1`,
        [municipioFinal, estadoFinal]
      );
      centroidVal = muni.rows[0]?.centroid || null;
    } catch { /* tabla opcional */ }
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid,
          location_confirmed, centroid_source)
       VALUES ($1, $5, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3, $4::geometry, FALSE, 'municipio')
       RETURNING up_id`,
      [producerId, estadoFinal, municipioFinal, centroidVal, upName]
    );
    upId = r.rows[0].up_id;
  }

  if (stateIdFinal || municipalityIdFinal) {
    await client.query(
      `UPDATE up SET state_id = COALESCE($1, state_id), municipality_id = COALESCE($2, municipality_id)
       WHERE up_id = $3`,
      [stateIdFinal, municipalityIdFinal, upId]
    );
  }

  if (traslapeProducerId !== null) {
    await client.query(
      `UPDATE up SET posible_traslape_producer_id = $1, traslape_revisado = false WHERE up_id = $2`,
      [traslapeProducerId, upId]
    );
  }

  return upId;
}

// POST /api/productor/auth/registro-nuevo
// Registro con datos del padrón SADER — la cuenta queda ACTIVA automáticamente.
// Acepta un array `ups` (múltiples parcelas) o los campos de una sola UP (compatibilidad).
router.post('/auth/registro-nuevo', authLimiter, async (req, res): Promise<void> => {
  try {
    const {
      curp, nombres, apellido_paterno, apellido_materno, genero,
      estado_up, municipio_up,
      lat, lng, poligono, area_calc_ha, area_real_ha, coincide_area,
      telefono, pin, programas_beneficiario, correo,
      ups,
      aviso_privacidad_aceptado,
      aviso_privacidad_fecha,
      aviso_privacidad_lat,
      aviso_privacidad_lng,
      aviso_privacidad_version,
      aviso_privacidad_foto_url,
    } = req.body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'El PIN debe ser 4 dígitos' });
      return;
    }

    if (!curp || curp.length !== 18) {
      res.status(400).json({ error: 'CURP inválida' });
      return;
    }

    if (aviso_privacidad_aceptado !== true) {
      res.status(400).json({ error: 'Debe aceptar el aviso de privacidad para continuar' });
      return;
    }

    const existe = await pool.query(
      `SELECT producer_id FROM producer WHERE UPPER(curp) = UPPER($1)`, [curp]
    );
    if (existe.rows.length) {
      res.status(409).json({ error: 'Esta CURP ya está registrada' });
      return;
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    // Lista de UPs a crear: usar `ups` (array, flujo nuevo) o la UP única (compatibilidad).
    const upsList: any[] = (Array.isArray(ups) && ups.length > 0)
      ? ups
      : [{ lat, lng, poligono, area_calc_ha, area_real_ha, coincide_area, estado_up, municipio_up }];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Normalizar nombres: MAYÚSCULAS sin acentos
      const nombresN = normalizeText(nombres || '');
      const apPaternoN = normalizeText(apellido_paterno || '');
      const apMaternoN = normalizeText(apellido_materno || '');
      const curpN = curp.toUpperCase().trim();
      const nombreCompleto = [nombresN, apPaternoN, apMaternoN].filter(Boolean).join(' ');

      const u = await client.query(
        `INSERT INTO usuarios (curp, nombre_completo, password_hash, pin_texto, rol, telefono, activo)
         VALUES ($1, $2, $3, $4, 'productor', $5, true) RETURNING id`,
        [curpN, nombreCompleto, hashedPin, String(pin), telefono]
      );

      // Cuenta ACTIVA automáticamente (validada por el padrón SADER). sexo desde el padrón.
      const p = await client.query(
        `INSERT INTO producer
           (usuario_id, curp, nombres, apellido_paterno, apellido_materno,
            phone, sexo, tipo_registro, estado_validacion, programas_beneficiario, correo,
            aviso_privacidad_aceptado, aviso_privacidad_fecha, aviso_privacidad_lat,
            aviso_privacidad_lng, aviso_privacidad_version, aviso_privacidad_foto_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'B','activo',$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING producer_id`,
        [
          u.rows[0].id, curpN, nombresN, apPaternoN, apMaternoN,
          telefono, genero || null, programas_beneficiario || [], correo || null,
          true,
          aviso_privacidad_fecha || new Date().toISOString(),
          aviso_privacidad_lat || null,
          aviso_privacidad_lng || null,
          aviso_privacidad_version || '1.0',
          aviso_privacidad_foto_url || null,
        ]
      );
      const producerId = p.rows[0].producer_id;

      // Crear TODAS las UPs (array o única). crearUP hace reverse-geocode, overlap e ids canónicos.
      for (const upData of upsList) {
        await crearUP(client, producerId, upData);
      }

      await client.query('COMMIT');

      res.status(201).json({
        mensaje: 'Registro completo. Tu cuenta ya está activa. Inicia sesión con tu CURP y PIN.',
        activo: true,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error en registro-nuevo:', error);
    if (error.code === 'UP_OVERLAP') {
      res.status(409).json({
        error: `Una de tus parcelas se intersecta con otra que dibujaste ("${error.up_conflicto}"). Dibújala en un área diferente.`,
        up_conflicto: error.up_conflicto,
      });
      return;
    }
    if (error.code === '23505') {
      res.status(409).json({ error: 'Esta CURP ya está registrada en el sistema' });
      return;
    }
    if (error.code === '42P01') {
      res.status(500).json({ error: 'Configuración de base de datos incompleta. Contacta al administrador.' });
      return;
    }
    if (error.message?.includes('ST_SetSRID') || error.message?.includes('ST_GeomFromGeoJSON') || error.message?.includes('PostGIS')) {
      console.warn('PostGIS no disponible — registro sin polígono');
      res.status(201).json({ mensaje: 'Registro enviado. La ubicación se actualizará después.' });
      return;
    }
    res.status(500).json({ error: 'Error al registrar. Intenta de nuevo.' });
  }
});

// ─────────────────────────────────────────────
// PRODUCTOR — Endpoints protegidos
// ─────────────────────────────────────────────

// Helper para obtener producer_id del token
async function getProducerId(userId: number): Promise<number | null> {
  const r = await pool.query('SELECT producer_id FROM producer WHERE usuario_id = $1 LIMIT 1', [userId]);
  return r.rows[0]?.producer_id || null;
}

// GET /api/productor/dashboard
router.get('/dashboard', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    // UP del productor (ubicación principal)
    const upRes = await pool.query(
      `SELECT state_name, municipality_name, location_confirmed, centroid_source,
              ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lng
       FROM up WHERE producer_id = $1 LIMIT 1`,
      [producerId]
    );
    const up = upRes.rows[0];

    // Todas las parcelas del productor — siempre, con o sin polígono
    const parcelasRes = await pool.query(
      `SELECT up_id as id,
              ST_Y(centroid::geometry) AS lat, ST_X(centroid::geometry) AS lng,
              CASE WHEN geom IS NOT NULL THEN ST_AsGeoJSON(geom)::json ELSE NULL END AS poligono,
              geom IS NOT NULL AS tiene_poligono
       FROM up WHERE producer_id = $1 AND centroid IS NOT NULL`,
      [producerId]
    );
    const parcelas = parcelasRes.rows;


    // Precio promedio regional (últimos 7 días)
    let precio_hoy: number | null = null;
    let precio_ayer: number | null = null;
    try {
      const precioRes = await pool.query(
        `SELECT ROUND(AVG(latest_precio)::numeric, 2) AS precio_hoy
         FROM (
           SELECT b.id, 
                  (SELECT pr.precio FROM precios pr 
                   WHERE pr.bodega_id = b.id AND pr.tipo_precio = 'bodega' 
                   ORDER BY pr.created_at DESC LIMIT 1) as latest_precio
           FROM bodegas b
           WHERE b.estado ILIKE $1
         ) sub
         WHERE latest_precio IS NOT NULL`,
        [up?.state_name || '']
      );
      precio_hoy = precioRes.rows[0]?.precio_hoy;

      const ayerRes = await pool.query(
        `SELECT ROUND(AVG(latest_precio)::numeric, 2) AS precio_ayer
         FROM (
           SELECT b.id, 
                  (SELECT pr.precio FROM precios pr 
                   WHERE pr.bodega_id = b.id AND pr.tipo_precio = 'bodega' 
                     AND pr.created_at < CURRENT_DATE
                   ORDER BY pr.created_at DESC LIMIT 1) as latest_precio
           FROM bodegas b
           WHERE b.estado ILIKE $1
         ) sub
         WHERE latest_precio IS NOT NULL`,
        [up?.state_name || '']
      );
      precio_ayer = ayerRes.rows[0]?.precio_ayer;
    } catch (_) { /* ignore */ }

    // Alerta activa más reciente sin leer
    let alerta_activa: any = null;
    try {
      const alertaRes = await pool.query(
        `SELECT mensaje, tipo FROM notificaciones
         WHERE usuario_id = $1
           AND tipo IN ('alerta_climatica','alerta_sanitaria')
           AND leida = FALSE
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      alerta_activa = alertaRes.rows[0] || null;
    } catch (_) { /* ignore */ }

    // 3 bodegas cercanas — distancia real con Haversine si el productor tiene centroide;
    // si no, fallback por estado (sin distancia)
    let bodegas_cercanas: any[] = [];
    try {
      const tieneCoordsUP = up?.lat != null && up?.lng != null;

      const bodegasQuery = tieneCoordsUP ? `
        SELECT b.id, b.nombre, b.municipio,
               COALESCE((SELECT pr.precio FROM precios pr
                 WHERE pr.bodega_id = b.id AND pr.tipo_precio = 'bodega'
                 ORDER BY pr.created_at DESC LIMIT 1), 0) AS precio_compra_hoy,
               FALSE AS is_ventanilla,
               CASE b.semaforo_compra
                 WHEN 'verde'    THEN 'comprando'
                 WHEN 'amarillo' THEN 'limitado'
                 WHEN 'rojo'     THEN 'no_compra'
                 ELSE 'sin_actividad'
               END AS estado_compra,
               ROUND((6371 * acos(
                 LEAST(1.0, cos(radians($1)) * cos(radians(b.latitud)) *
                 cos(radians(b.longitud) - radians($2)) +
                 sin(radians($1)) * sin(radians(b.latitud)))
               ))::numeric, 1) AS distancia_km
        FROM bodegas b
        WHERE b.latitud IS NOT NULL AND b.longitud IS NOT NULL
        ORDER BY distancia_km ASC
        LIMIT 3
      ` : `
        SELECT b.id, b.nombre, b.municipio,
               COALESCE((SELECT pr.precio FROM precios pr
                 WHERE pr.bodega_id = b.id AND pr.tipo_precio = 'bodega'
                 ORDER BY pr.created_at DESC LIMIT 1), 0) AS precio_compra_hoy,
               FALSE AS is_ventanilla,
               CASE b.semaforo_compra
                 WHEN 'verde'    THEN 'comprando'
                 WHEN 'amarillo' THEN 'limitado'
                 WHEN 'rojo'     THEN 'no_compra'
                 ELSE 'sin_actividad'
               END AS estado_compra,
               NULL AS distancia_km
        FROM bodegas b
        WHERE b.estado ILIKE $1
        LIMIT 3
      `;
      const bodegasParams = tieneCoordsUP ? [up.lat, up.lng] : [up?.state_name || ''];
      const bodegasRes = await pool.query(bodegasQuery, bodegasParams);
      bodegas_cercanas = bodegasRes.rows;
    } catch (_) { /* ignore */ }

    // Datos del productor (nombres, estado_validacion)
    const prodRes = await pool.query(
      `SELECT nombres, apellido_paterno, apellido_materno, estado_validacion FROM producer WHERE producer_id = $1`,
      [producerId]
    );

    res.json({
      municipio: up?.municipality_name,
      estado: up?.state_name,
      location_confirmed: up?.location_confirmed || false,
      centroid_source: up?.centroid_source,
      lat: up?.lat ?? null,
      lng: up?.lng ?? null,
      parcelas,
      precio_hoy,
      precio_ayer,
      alerta_activa,
      bodegas_cercanas,
      nombres: prodRes.rows[0]?.nombres,
      apellido_paterno: prodRes.rows[0]?.apellido_paterno,
      apellido_materno: prodRes.rows[0]?.apellido_materno,
      estado_validacion: prodRes.rows[0]?.estado_validacion,
    });
  } catch (error) {
    console.error('Error en dashboard productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/productor/precios
router.get('/precios', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    const upData = await pool.query(
      `SELECT state_name FROM up WHERE producer_id = $1 LIMIT 1`, [producerId]
    );
    const estado = upData.rows[0]?.state_name;

    // Precio de compra promedio regional (hoy)
    let precio_compra: number | null = null;
    let precio_bodega: number | null = null;
    let precio_mercado: number | null = null;
    try {
      const precioRes = await pool.query(
        `SELECT ROUND(AVG(pr.precio)::numeric, 2) AS po_hoy
         FROM precios pr
         JOIN bodegas b ON b.id = pr.bodega_id
         WHERE pr.created_at >= CURRENT_DATE - INTERVAL '7 days'
           AND pr.tipo_precio = 'bodega'
           AND b.estado ILIKE $1`,
        [estado || '']
      );
      precio_compra = precioRes.rows[0]?.po_hoy;
      if (precio_compra) {
        precio_bodega = Math.round(Number(precio_compra) * 1.08 * 100) / 100;
        precio_mercado = Math.round(Number(precio_compra) * 1.15 * 100) / 100;
      }
    } catch (_) { /* ignore */ }

    // Tendencia 30 días
    let tendencia: any[] = [];
    try {
      const tendenciaRes = await pool.query(
        `SELECT pr.created_at::date AS fecha, ROUND(AVG(pr.precio)::numeric, 2) AS precio_compra
         FROM precios pr
         JOIN bodegas b ON b.id = pr.bodega_id
         WHERE pr.created_at >= CURRENT_DATE - INTERVAL '30 days'
           AND pr.tipo_precio = 'bodega'
           AND b.estado ILIKE $1
         GROUP BY pr.created_at::date
         ORDER BY fecha ASC`,
        [estado || '']
      );
      tendencia = tendenciaRes.rows;
    } catch (_) { /* ignore */ }

    // FIRA
    let fira: any = null;
    try {
      const firaRes = await pool.query(
        `SELECT costo_por_ha, precio_fira, pct_ganancia, modalidad
         FROM costos_fira WHERE estado ILIKE $1 AND activo = TRUE
         ORDER BY vigente_desde DESC LIMIT 1`,
        [estado || '']
      );
      fira = firaRes.rows[0] || null;
    } catch (_) { /* ignore */ }

    // Referencias externas (Chicago y Tipo de Cambio)
    let precio_chicago_usd_bushel: number | null = null;
    let tipo_cambio_mxn: number | null = null;
    try {
      const refRes = await pool.query(
        `SELECT chicago_usd_bushel, tc_banxico FROM precio_referencias_externas ORDER BY created_at DESC LIMIT 1`
      );
      if (refRes.rows.length > 0) {
        precio_chicago_usd_bushel = Number(refRes.rows[0].chicago_usd_bushel);
        tipo_cambio_mxn = Number(refRes.rows[0].tc_banxico);
      }
    } catch (_) { /* ignore */ }

    // Calcular promedio real de tarifarios activos en los últimos 60 días
    let servicios_promedio = 0;
    try {
      const serviciosResult = await pool.query(`
        SELECT COALESCE(AVG(total_por_bodega), 0) AS promedio
        FROM (
          SELECT ts.bodega_id, SUM(ts.precio) AS total_por_bodega
          FROM tarifario_servicios ts
          JOIN bodeguero_bodegas bb ON bb.bodega_id = ts.bodega_id
          WHERE ts.updated_at >= NOW() - INTERVAL '60 days'
            AND ts.activo = true
          GROUP BY ts.bodega_id
        ) AS totales_por_bodega
      `);
      servicios_promedio = parseFloat(serviciosResult.rows[0]?.promedio || '0');
    } catch (_) { /* ignore */ }

    res.json({
      estado,
      fecha: new Date().toISOString().split('T')[0],
      precio_compra,
      precio_bodega,
      precio_mercado,
      servicios_promedio: Math.round(servicios_promedio),
      precio_chicago_usd_bushel,
      tipo_cambio_mxn,
      fira,
      tendencia,
    });
  } catch (error) {
    console.error('Error en precios productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/productor/ubicacion
router.patch('/ubicacion', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lat, lng, poligono, area_calc_ha, area_real_ha, coincide_area, up_id } = req.body;
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    // Resolver la parcela a actualizar: la indicada (up_id) o, si no, la principal
    // (la más antigua). Así editar una parcela NO sobreescribe las demás.
    const upRes = await pool.query(
      up_id
        ? `SELECT up_id FROM up WHERE up_id = $1 AND producer_id = $2`
        : `SELECT up_id FROM up WHERE producer_id = $2 ORDER BY created_at ASC LIMIT 1`,
      up_id ? [up_id, producerId] : [null, producerId]
    );
    const targetUpId = upRes.rows[0]?.up_id;
    if (!targetUpId) { res.status(404).json({ error: 'Parcela no encontrada' }); return; }

    const hasPoligono = poligono && Array.isArray(poligono) && poligono.length >= 3;
    if (hasPoligono) {
      const geomGeoJSON = JSON.stringify({
        type: 'Polygon',
        coordinates: [[
          ...poligono.map(([plat, plng]: [number, number]) => [plng, plat]),
          [poligono[0][1], poligono[0][0]],
        ]],
      });
      await pool.query(
        `UPDATE up SET
           centroid = ST_SetSRID(ST_MakePoint($1, $2), 4326),
           geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3::text), 4326)),
           area_ha_calc = $4, area_ha_real = $5, coincide_area = $6,
           location_confirmed = TRUE,
           centroid_source = 'productor'
         WHERE up_id = $7`,
        [lng, lat, geomGeoJSON, area_calc_ha || null, area_real_ha || null, coincide_area ?? null, targetUpId]
      );
    } else {
      await pool.query(
        `UPDATE up SET
           centroid = ST_SetSRID(ST_MakePoint($1, $2), 4326),
           location_confirmed = TRUE,
           centroid_source = 'productor'
         WHERE up_id = $3`,
        [lng, lat, targetUpId]
      );
    }

    // Reverse-geocoding: el estado y municipio se derivan de DÓNDE quedó la parcela.
    let geo = null;
    if (lat != null && lng != null) {
      const g = await reverseGeocode(Number(lat), Number(lng));
      if (g.state_name || g.municipality_name) {
        // Actualizar la UP con el estado/municipio reales de la ubicación marcada
        await pool.query(
          `UPDATE up SET
             state_name = COALESCE($1, state_name),
             municipality_name = COALESCE($2, municipality_name),
             state_id = COALESCE($3, state_id),
             municipality_id = COALESCE($4, municipality_id),
             updated_at = NOW()
           WHERE up_id = $5`,
          [g.state_name, g.municipality_name, g.state_id, g.municipality_id, targetUpId]
        );
        // Mantener el producer en sintonía (state_id/municipality_id)
        await pool.query(
          `UPDATE producer SET
             state_id = COALESCE($1, state_id),
             municipality_id = COALESCE($2, municipality_id)
           WHERE producer_id = $3`,
          [g.state_id, g.municipality_id, producerId]
        );
        geo = { estado: g.state_name, municipio: g.municipality_name };
      }
    }

    res.json({ ok: true, geo });
  } catch (error) {
    console.error('Error en ubicacion:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/productor/mi-up — retorna la UP del productor con geom + centroide
router.get('/mi-up', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    // Consultar con funciones PostGIS si están disponibles, sino usar columnas lat/lng directas
    let rows: any[] = [];
    try {
      // Intentar primero con PostGIS (centroid geometry)
      const r = await pool.query(
        `SELECT up_id, up_name, state_name, municipality_name,
                location_confirmed, centroid_source,
                ST_Y(centroid::geometry) AS lat,
                ST_X(centroid::geometry) AS lng,
                area_ha_calc, area_ha_real, coincide_area,
                ST_AsGeoJSON(geom)::json AS geom_geojson,
                NULL AS geom_coordenadas
         FROM up WHERE producer_id = $1
         LIMIT 1`,
        [producerId]
      );
      rows = r.rows;
    } catch (e1) {
      console.error('Error en mi-up (query simple):', e1);
    }

    // Si no hay columnas lat/lng, intentar extraer de centroid geometry
    if (rows.length === 0 || (rows[0].lat === 0 && rows[0].lng === 0)) {
      try {
        const r2 = await pool.query(
          `SELECT up_id, up_name, state_name, municipality_name,
                  location_confirmed, centroid_source,
                  area_ha_calc, area_ha_real, coincide_area
           FROM up WHERE producer_id = $1 LIMIT 1`,
          [producerId]
        );
        if (r2.rows.length > 0) {
          rows = r2.rows.map((row: any) => ({ ...row, lat: null, lng: null, geom_geojson: null, geom_coordenadas: null }));
        }
      } catch (e2) {
        console.error('Error en mi-up (fallback):', e2);
      }
    }

    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error en mi-up:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/solicitar-apoyo
router.post('/solicitar-apoyo', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { infraestructura_id, tipo_apoyo, notas } = req.body;
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }
    if (!infraestructura_id) { res.status(400).json({ error: 'infraestructura_id requerido' }); return; }

    // El esquema real de solicitudes_apoyo es ventanilla-based:
    // (ventanilla_id, apoyo_id, producer_id, estado, notas). Resolvemos la
    // ventanilla activa de la bodega y un apoyo (preferimos el del tipo pedido).
    const nombreApoyo =
      tipo_apoyo === 'incentivo' || tipo_apoyo === 'incentivos' ? 'incentivos' :
      tipo_apoyo === 'cobertura' || tipo_apoyo === 'coberturas' ? 'coberturas' : null;

    const resolve = await pool.query(
      `SELECT v.id AS ventanilla_id,
              (SELECT a.id FROM apoyos_ventanilla a
                 WHERE a.ventanilla_id = v.id
                   AND ($2::text IS NULL OR a.nombre_apoyo = $2)
                 ORDER BY a.created_at DESC LIMIT 1) AS apoyo_id_tipo,
              (SELECT a2.id FROM apoyos_ventanilla a2
                 WHERE a2.ventanilla_id = v.id
                 ORDER BY a2.created_at DESC LIMIT 1) AS apoyo_id_any
         FROM ventanillas v
        WHERE v.bodega_id = $1 AND v.estatus = 'activa'
        ORDER BY v.created_at DESC LIMIT 1`,
      [infraestructura_id, nombreApoyo]
    );
    if (resolve.rows.length === 0) {
      res.status(404).json({ error: 'Esta bodega no tiene una ventanilla de apoyos activa' });
      return;
    }
    const apoyoId = resolve.rows[0].apoyo_id_tipo || resolve.rows[0].apoyo_id_any;
    const solicitud = await pool.query(
      `INSERT INTO solicitudes_apoyo (ventanilla_id, apoyo_id, producer_id, estado, notas)
       VALUES ($1, $2, $3, 'recibida', $4) RETURNING id`,
      [resolve.rows[0].ventanilla_id, apoyoId || null, producerId, notas || null]
    );

    // Notificar al bodeguero dueño de la bodega/ventanilla (best-effort)
    try {
      const bodegaUsuario = await pool.query(
        `SELECT usuario_id FROM bodeguero_bodegas
         WHERE bodega_id = $1 AND estatus = 'aprobada' LIMIT 1`,
        [infraestructura_id]
      );
      if (bodegaUsuario.rows.length > 0) {
        notificar({
          usuarioId: bodegaUsuario.rows[0].usuario_id,
          tipo: 'solicitud_apoyo',
          titulo: '📋 Nueva solicitud de apoyo',
          mensaje: 'Un productor solicitó información sobre tu ventanilla de apoyo.',
          referenciaId: solicitud.rows[0].id,
          referenciaTipo: 'solicitudes',
        }).catch(() => {});
      }
    } catch (_) { /* best-effort */ }

    res.status(201).json({ solicitud_id: solicitud.rows[0].id });
  } catch (error) {
    console.error('Error en solicitar-apoyo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/productor/mis-solicitudes
router.get('/mis-solicitudes', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    // Esquema real (ventanilla-based): solicitudes_apoyo(ventanilla_id, apoyo_id,
    // producer_id, estado, notas, created_at, updated_at)
    const r = await pool.query(
      `SELECT s.id, s.estado,
              s.notas,
              s.notas AS notas_ventanilla,
              s.created_at, s.updated_at,
              COALESCE(a.nombre_apoyo, 'Solicitud') AS tipo_apoyo,
              v.nombre_ventanilla AS ventanilla_nombre,
              b.nombre AS bodega_nombre
       FROM solicitudes_apoyo s
       LEFT JOIN ventanillas v ON v.id = s.ventanilla_id
       LEFT JOIN apoyos_ventanilla a ON a.id = s.apoyo_id
       LEFT JOIN bodegas b ON b.id = v.bodega_id
       WHERE s.producer_id = $1
       ORDER BY s.created_at DESC`,
      [producerId]
    );

    res.json(r.rows);
  } catch (error) {
    console.error('Error en mis-solicitudes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/productor/perfil
const CAMPOS_PRIVILEGIADOS_PERFIL = ['rol', 'isAdmin', 'es_admin', 'estado_validacion', 'activo', 'es_panel_usuario', 'password_hash', 'pin_texto', 'producer_id', 'usuario_id', 'id'];

router.patch('/perfil', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campoNoPermitido = CAMPOS_PRIVILEGIADOS_PERFIL.find(c => req.body[c] !== undefined);
    if (campoNoPermitido) {
      res.status(400).json({ error: `El campo "${campoNoPermitido}" no puede modificarse desde este endpoint.` });
      return;
    }

    const { telefono, programas_beneficiario, correo } = req.body;
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    await pool.query(
      `UPDATE producer SET
         phone                  = COALESCE($1, phone),
         programas_beneficiario = COALESCE($2, programas_beneficiario),
         correo                 = COALESCE($3, correo)
       WHERE producer_id = $4`,
      [telefono, programas_beneficiario, correo || null, producerId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error en perfil productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/productor/perfil/ubicacion
router.patch('/perfil/ubicacion', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user!.userId;
    const { state_name, municipality_name } = req.body;

    if (!state_name?.trim() || !municipality_name?.trim()) {
      res.status(400).json({ error: 'Estado y municipio son obligatorios' });
      return;
    }

    const producerId = await getProducerId(usuarioId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    const result = await pool.query(
      `UPDATE up
       SET state_name                = $1,
           municipality_name         = $2,
           location_confirmed        = TRUE,
           domicilio_actualizado_en  = NOW(),
           domicilio_actualizado_por = 'productor'
       WHERE up_id = (
         SELECT up_id FROM up
         WHERE producer_id = $3
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING up_id, state_name, municipality_name, domicilio_actualizado_en`,
      [state_name.trim(), municipality_name.trim(), producerId]
    );

    if (!result.rows.length) {
      res.status(404).json({ error: 'No se encontró una parcela asociada al productor' });
      return;
    }

    res.json({ ok: true, ubicacion: result.rows[0], mensaje: 'Ubicación actualizada correctamente' });
  } catch (error) {
    console.error('Error al actualizar ubicación del productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/productor/perfil
router.get('/perfil', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    const { rows } = await pool.query(
      `SELECT p.producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno,
              p.phone AS telefono, p.estado_validacion, p.tipo_registro,
              p.programas_beneficiario, p.correo,
              u.up_id, u.state_name AS state_name, u.municipality_name AS municipality_name,
              u.location_confirmed, u.centroid_source,
              u.area_ha_calc, u.area_ha_real,
              ST_Y(u.centroid::geometry) AS lat,
              ST_X(u.centroid::geometry) AS lng
       FROM producer p
       LEFT JOIN up u ON u.producer_id = p.producer_id
       WHERE p.producer_id = $1`,
      [producerId]
    );
    res.json(rows[0] || {});
  } catch (error) {
    console.error('Error en get perfil productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/productor/mi-ciclo — ciclo activo del productor
router.get('/mi-ciclo', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    // Obtener up_id
    const upRes = await pool.query('SELECT up_id FROM up WHERE producer_id = $1 LIMIT 1', [producerId]);
    if (!upRes.rows[0]) { res.json(null); return; }
    const upId = upRes.rows[0].up_id;

    const { rows } = await pool.query(
      `SELECT c.cycle_id, c.cycle_year, c.cycle_type,
              cc.area_sown_ha AS hectareas_sembradas,
              cc.planting_date AS fecha_siembra,
              COALESCE(cc.variety_other, cc.variety_id) AS variedad_nombre
       FROM cycle c
       LEFT JOIN cycle_crop cc ON cc.cycle_id = c.cycle_id
       WHERE c.up_id = $1
       ORDER BY c.cycle_year DESC, c.cycle_id DESC
       LIMIT 1`,
      [upId]
    );
    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error en mi-ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/ciclo — declarar ciclo productivo
router.post('/ciclo', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cycle_year, cycle_type, hectareas_sembradas, fecha_siembra, variedad_nombre } = req.body;
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    if (!cycle_year || !cycle_type) {
      res.status(400).json({ error: 'cycle_year y cycle_type son requeridos' });
      return;
    }

    const upRes = await pool.query('SELECT up_id FROM up WHERE producer_id = $1 LIMIT 1', [producerId]);
    if (!upRes.rows[0]) { res.status(404).json({ error: 'UP no encontrada' }); return; }
    const upId = upRes.rows[0].up_id;

    // Validar que no exista ya un ciclo activo del mismo tipo+año en esta UP
    const existente = await pool.query(
      `SELECT cycle_id FROM cycle
       WHERE up_id = $1 AND cycle_type = $2 AND cycle_year = $3
         AND COALESCE(estado_ciclo, 'activo') = 'activo'
       LIMIT 1`,
      [upId, cycle_type, cycle_year]
    );
    if (existente.rows.length > 0) {
      res.status(409).json({
        error: `Ya tienes un ciclo ${cycle_type} ${cycle_year} activo en esta UP`,
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO cycle
         (up_id, cycle_year, cycle_type, declarado_por_productor,
          hectareas_sembradas, fecha_siembra, variedad_nombre, estado_ciclo)
       VALUES ($1, $2, $3, TRUE, $4, $5, $6, 'activo')
       RETURNING cycle_id, cycle_year, cycle_type`,
      [upId, cycle_year, cycle_type, hectareas_sembradas || null,
       fecha_siembra || null, variedad_nombre || null]
    );

    res.status(201).json({ ok: true, ciclo: result.rows[0] });
  } catch (error) {
    console.error('Error en ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/productor/ups — agregar UP adicional a un productor existente
// =============================================
router.post('/ups', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const usuarioId = req.user!.userId;
    const { lat, lng, poligono, area_calc_ha, area_real_ha, coincide_area,
            estado_up, municipio_up, nombre_up } = req.body;

    const prodResult = await client.query(
      'SELECT producer_id FROM producer WHERE usuario_id = $1', [usuarioId]
    );
    if (prodResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }
    const producer_id = prodResult.rows[0].producer_id;
    const postgisActivo = process.env.POSTGIS_ENABLED === 'true';
    const hasCoords = lat != null && lng != null && lat !== 0 && lng !== 0;
    const hasPoligono = poligono && Array.isArray(poligono) && poligono.length >= 3;
    const upName = (nombre_up && String(nombre_up).trim()) || 'Mi Parcela';

    // Evitar nombre duplicado para este productor
    const nombreDup = await client.query(
      `SELECT up_id FROM up WHERE producer_id = $1 AND LOWER(up_name) = LOWER($2) LIMIT 1`,
      [producer_id, upName]
    );
    if (nombreDup.rows.length > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: `Ya tienes una parcela con el nombre "${upName}". Usa un nombre diferente.` });
      return;
    }

    const geojson = hasPoligono ? JSON.stringify({
      type: 'Polygon',
      coordinates: [[
        ...poligono.map(([plat, plng]: [number, number]) => [plng, plat]),
        [poligono[0][1], poligono[0][0]],
      ]],
    }) : null;

    // Canonicalizar estado/municipio contra geo_state para evitar guardar nombres del padrón en mayúsculas
    let estadoCanon = estado_up;
    let municipioCanon = municipio_up;
    if (estadoCanon) {
      const c = await canonicalizarEstado(estadoCanon, municipioCanon);
      estadoCanon = c.state_name;
      if (c.municipality_name) municipioCanon = c.municipality_name;
    }

    // Validar overlap con UPs existentes del mismo productor
    if (hasPoligono && postgisActivo) {
      const overlap = await client.query(
        `SELECT up_id, up_name FROM up
         WHERE producer_id = $1 AND geom IS NOT NULL
           AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
         LIMIT 1`,
        [producer_id, geojson]
      );
      if (overlap.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({
          error: `El polígono que dibujaste se intersecta con tu parcela "${overlap.rows[0].up_name}". Por favor dibuja en un área diferente.`,
          up_conflicto: overlap.rows[0].up_name,
        });
        return;
      }
    }

    // Overlap con UPs de OTROS productores (no bloqueante — bandera para revisión admin)
    let traslapeProducerId2: number | null = null;
    if (hasPoligono && postgisActivo) {
      const ovCruz = await client.query(
        `SELECT traslape_producer_id FROM (
           SELECT u.producer_id AS traslape_producer_id,
             ST_Area(ST_Intersection(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))::geography)
             / NULLIF(ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326)::geography), 0) AS pct
           FROM up u
           WHERE u.producer_id != $1 AND u.geom IS NOT NULL
             AND ST_Overlaps(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
         ) t WHERE t.pct > 0.10 LIMIT 1`,
        [producer_id, geojson]
      );
      if (ovCruz.rows.length > 0) traslapeProducerId2 = ovCruz.rows[0].traslape_producer_id;
    }

    let upResult;
    if (hasCoords) {
      const useGeom = hasPoligono && postgisActivo;
      const geomSql = useGeom ? `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))` : 'NULL';
      const aIdx = useGeom ? 7 : 6;
      const params = [
        producer_id, estadoCanon, municipioCanon, lng, lat,
        ...(useGeom ? [geojson] : []),
        area_calc_ha || null, area_real_ha || null, coincide_area ?? null, upName,
      ];
      upResult = await client.query(
        `INSERT INTO up
           (producer_id, up_name, up_type, production_system, water_regime,
            state_name, municipality_name, centroid, geom,
            area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
         VALUES ($1, $${aIdx + 3}, 'temporal', 'tradicional', 'temporal',
                 $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), ${geomSql},
                 $${aIdx}, $${aIdx + 1}, $${aIdx + 2}, TRUE, 'productor')
         RETURNING up_id, up_name`,
        params
      );
    } else if (hasPoligono && postgisActivo) {
      upResult = await client.query(
        `INSERT INTO up
           (producer_id, up_name, up_type, production_system, water_regime,
            state_name, municipality_name, centroid, geom,
            area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
         VALUES ($1, $5, 'temporal', 'tradicional', 'temporal',
                 $2, $3,
                 ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
                 ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
                 $6, $7, $8, TRUE, 'poligono_calculado')
         RETURNING up_id, up_name`,
        [producer_id, estadoCanon, municipioCanon, geojson, upName,
         area_calc_ha || null, area_real_ha || null, coincide_area ?? null]
      );
    } else {
      let centroidVal = null;
      try {
        const muni = await client.query(
          `SELECT centroid::geometry AS centroid FROM municipios_referencia
           WHERE LOWER(nombre) = LOWER($1) AND LOWER(estado) = LOWER($2) LIMIT 1`,
          [municipioCanon, estadoCanon]
        );
        centroidVal = muni.rows[0]?.centroid || null;
      } catch { /* tabla opcional */ }
      upResult = await client.query(
        `INSERT INTO up
           (producer_id, up_name, up_type, production_system, water_regime,
            state_name, municipality_name, centroid, geom,
            area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
         VALUES ($1, $5, 'temporal', 'tradicional', 'temporal',
                 $2, $3, $4::geometry, NULL,
                 $6, $7, $8, FALSE, 'municipio')
         RETURNING up_id, up_name`,
        [producer_id, estadoCanon, municipioCanon, centroidVal, upName,
         area_calc_ha || null, area_real_ha || null, coincide_area ?? null]
      );
    }

    if (traslapeProducerId2 !== null) {
      await client.query(
        `UPDATE up SET posible_traslape_producer_id = $1, traslape_revisado = false WHERE up_id = $2`,
        [traslapeProducerId2, upResult.rows[0].up_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, up: upResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al agregar UP:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/productor/mis-ups-con-ciclos — UPs del productor con sus ciclos activos
// =============================================
router.get('/mis-ups-con-ciclos', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user!.userId;
    const result = await pool.query(
      `SELECT
         u.up_id, u.up_name, u.municipality_name, u.state_name,
         u.area_ha_calc, u.area_ha_real, u.location_confirmed,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'cycle_id', c.cycle_id,
               'cycle_type', c.cycle_type,
               'cycle_year', c.cycle_year,
               'area_sown_ha', COALESCE(cr.area_sown_ha, c.hectareas_sembradas),
               'variedad_code', cr.variety_id,
               'variedad_nombre', COALESCE(cv.label, cr.variety_id, c.variedad_nombre),
               'variedad_other', cr.variety_other,
               'estado_ciclo', COALESCE(c.estado_ciclo, 'activo')
             )
           ) FILTER (WHERE c.cycle_id IS NOT NULL),
           '[]'
         ) AS ciclos_activos
       FROM up u
       JOIN producer p ON p.producer_id = u.producer_id
       LEFT JOIN cycle c ON c.up_id = u.up_id AND COALESCE(c.estado_ciclo, 'activo') = 'activo'
       LEFT JOIN cycle_crop cr ON cr.cycle_id = c.cycle_id
       LEFT JOIN cat_crop_variety cv ON cv.code = cr.variety_id AND cv.is_active = TRUE
       WHERE p.usuario_id = $1
       GROUP BY u.up_id, u.up_name, u.municipality_name, u.state_name,
                u.area_ha_calc, u.area_ha_real, u.location_confirmed, u.created_at
       ORDER BY u.created_at ASC`,
      [usuarioId]
    );
    res.json({ ups: result.rows });
  } catch (error) {
    console.error('Error al obtener UPs con ciclos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// POST /api/productor/ups/validar-overlap — valida en vivo que un polígono no se intersecte
// con UPs ya registradas del mismo productor (se usa al cerrar el polígono en el mapa).
router.post('/ups/validar-overlap', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user!.userId;
    const { poligono } = req.body;
    const postgisActivo = process.env.POSTGIS_ENABLED === 'true';
    if (!postgisActivo || !poligono || !Array.isArray(poligono) || poligono.length < 3) {
      res.json({ valido: true });
      return;
    }
    const geojson = JSON.stringify({
      type: 'Polygon',
      coordinates: [[
        ...poligono.map(([lat, lng]: [number, number]) => [lng, lat]),
        [poligono[0][1], poligono[0][0]],
      ]],
    });
    const result = await pool.query(
      `SELECT u.up_id, u.up_name
       FROM up u JOIN producer p ON p.producer_id = u.producer_id
       WHERE p.usuario_id = $1 AND u.geom IS NOT NULL
         AND ST_Intersects(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
       LIMIT 1`,
      [usuarioId, geojson]
    );
    if (result.rows.length > 0) {
      res.status(409).json({
        valido: false,
        error: `Este polígono se intersecta con tu parcela "${result.rows[0].up_name}". Dibújala en un área diferente.`,
      });
      return;
    }
    res.json({ valido: true });
  } catch (error) {
    console.error('[OVERLAP]', error);
    res.json({ valido: true });
  }
});

// POST /api/productor/aviso-privacidad
// Registra la aceptación del aviso de privacidad con coordenadas y timestamp
// Usado por productores ya autenticados que necesiten re-registrar su aceptación
router.post('/aviso-privacidad', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const producerId = await getProducerId(userId);
    if (!producerId) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    const { latitud, longitud } = req.body;

    await pool.query(
      `UPDATE producer SET
         aviso_privacidad_aceptado = TRUE,
         aviso_privacidad_fecha    = NOW(),
         aviso_privacidad_lat      = $2,
         aviso_privacidad_lng      = $3,
         aviso_privacidad_version  = '1.0'
       WHERE producer_id = $1`,
      [producerId, latitud ?? null, longitud ?? null]
    );

    res.json({ ok: true, mensaje: 'Aviso de privacidad registrado' });
  } catch (error) {
    console.error('Error al registrar aviso de privacidad:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────
// POST /api/productor/push/suscribir
// Registra suscripción push del dispositivo del productor
// ─────────────────────────────────────────────
router.post('/push/suscribir', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { endpoint, p256dh, auth } = req.body;
    const usuarioId = req.user?.userId;
    if (!endpoint || !p256dh || !auth) { res.status(400).json({ error: 'Suscripción incompleta' }); return; }
    await pool.query(
      `UPDATE usuarios SET push_endpoint = $1, push_p256dh = $2, push_auth = $3, push_activo = TRUE WHERE id = $4`,
      [endpoint, p256dh, auth, usuarioId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al registrar suscripción push:', error);
    res.status(500).json({ error: 'Error al registrar suscripción' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/productor/push/cancelar
// Desactiva las notificaciones push del productor
// ─────────────────────────────────────────────
router.delete('/push/cancelar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuarioId = req.user?.userId;
    await pool.query(`UPDATE usuarios SET push_activo = FALSE WHERE id = $1`, [usuarioId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al cancelar suscripción push:', error);
    res.status(500).json({ error: 'Error al cancelar suscripción' });
  }
});

// ─────────────────────────────────────────────────────────────────
// RECUPERACIÓN DE NIP — 3 pasos sin email ni SMS
// ─────────────────────────────────────────────────────────────────


// POST /api/productor/auth/recuperar-nip/verificar-curp
// Paso 1: ingresa CURP → devuelve teléfono enmascarado + challenge_token
router.post('/auth/recuperar-nip/verificar-curp', async (req, res): Promise<void> => {
  try {
    const { curp } = req.body;
    if (!curp || curp.length !== 18) {
      res.status(400).json({ error: 'CURP inválida' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT p.producer_id, p.nombres, p.apellido_paterno,
              u.id AS usuario_id, u.activo,
              COALESCE(p.phone, u.telefono) AS telefono
       FROM producer p
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE UPPER(p.curp) = UPPER($1)`,
      [curp]
    );

    // Respuesta genérica: no revelar si la CURP existe o no
    if (!rows.length || !rows[0].activo) {
      res.json({ ok: true, telefono_enmascarado: null });
      return;
    }

    const user = rows[0];
    const tel = (user.telefono || '').replace(/\D/g, '');
    const telEnmascarado = tel.length >= 2
      ? '●● ●●●● ●●' + tel.slice(-2)
      : null;

    const secret = process.env.JWT_SECRET!;
    const challengeToken = jwt.sign(
      { producer_id: user.producer_id, usuario_id: user.usuario_id, action: 'nip_challenge', tel_last4: tel.slice(-4) },
      secret,
      { expiresIn: '5m' }
    );

    res.json({ ok: true, telefono_enmascarado: telEnmascarado, challenge_token: challengeToken });
  } catch (error) {
    console.error('Error en verificar-curp:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/auth/recuperar-nip/confirmar-telefono
// Paso 2: confirma últimos 4 dígitos → devuelve reset_token (15 min)
router.post('/auth/recuperar-nip/confirmar-telefono', async (req, res): Promise<void> => {
  try {
    const { challenge_token, ultimos4 } = req.body;
    if (!challenge_token || !ultimos4) {
      res.status(400).json({ error: 'Datos incompletos' });
      return;
    }

    const secret = process.env.JWT_SECRET!;
    let payload: any;
    try {
      payload = jwt.verify(challenge_token, secret);
    } catch {
      res.status(400).json({ error: 'Token inválido o expirado. Vuelve a intentar.' });
      return;
    }

    if (payload.action !== 'nip_challenge') {
      res.status(400).json({ error: 'Token inválido' });
      return;
    }

    if (payload.tel_last4 !== String(ultimos4).trim()) {
      res.status(400).json({ error: 'Los últimos 4 dígitos no coinciden' });
      return;
    }

    const resetToken = jwt.sign(
      { producer_id: payload.producer_id, usuario_id: payload.usuario_id, action: 'reset_nip' },
      secret,
      { expiresIn: '15m' }
    );

    res.json({ ok: true, reset_token: resetToken });
  } catch (error) {
    console.error('Error en confirmar-telefono:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/productor/auth/recuperar-nip/nuevo-nip
// Paso 3: guarda nuevo NIP con el reset_token verificado
router.post('/auth/recuperar-nip/nuevo-nip', async (req, res): Promise<void> => {
  try {
    const { reset_token, nuevo_pin } = req.body;
    if (!reset_token || !nuevo_pin) {
      res.status(400).json({ error: 'Datos incompletos' });
      return;
    }
    if (!/^\d{4}$/.test(String(nuevo_pin))) {
      res.status(400).json({ error: 'El NIP debe ser exactamente 4 dígitos' });
      return;
    }

    const secret = process.env.JWT_SECRET!;
    let payload: any;
    try {
      payload = jwt.verify(reset_token, secret);
    } catch {
      res.status(400).json({ error: 'Token inválido o expirado. Vuelve a intentar desde el inicio.' });
      return;
    }

    if (payload.action !== 'reset_nip') {
      res.status(400).json({ error: 'Token inválido' });
      return;
    }

    const hash = await bcrypt.hash(String(nuevo_pin), 12);
    await pool.query(
      `UPDATE usuarios SET password_hash = $1, pin_texto = $2, reset_pin_forced = FALSE WHERE id = $3`,
      [hash, String(nuevo_pin), payload.usuario_id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Error en nuevo-nip:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
