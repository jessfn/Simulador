import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database';
import { authMiddleware, requiereCapturista, AuthRequest } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiters';
import { consultarPersonaPorCURP } from '../services/saderService';
import { consultarCURPEnRENAPO } from '../services/renapoService';
import { verificarBloqueo, registrarIntentoFallido, limpiarIntentosFallidos } from '../utils/loginLockout';
import { insertarUP } from '../utils/ups';

const router = Router();

// =============================================
// POST /api/tecnico/auth/login
// Login exclusivo para técnicos ECA (rol = 'capturista'). Copia el patrón
// de POST /api/auth/login (backend/src/routes/auth.ts) pero solo acepta
// cuentas con rol capturista.
// =============================================
router.post('/auth/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email y contraseña son obligatorios' });
      return;
    }

    const result = await pool.query(
      "SELECT * FROM usuarios WHERE email = $1 AND activo = true AND rol = 'capturista'",
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const usuario = result.rows[0];

    // Bloqueo por intentos fallidos
    const minutosBloqueo = await verificarBloqueo(usuario.id);
    if (minutosBloqueo !== null) {
      res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutosBloqueo} minuto(s).` });
      return;
    }

    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      await registrarIntentoFallido(usuario.id);
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }
    await limpiarIntentosFallidos(usuario.id);

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET no está definida en las variables de entorno.');
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { userId: usuario.id, email: usuario.email, rol: 'capturista', jti },
      secret,
      { expiresIn: '12h' }
    );

    // Sesión única por cuenta — igual que en /api/auth/login, capturista no
    // está excluida de la regla (solo admin/responsable lo están).
    pool.query('UPDATE usuarios SET sesion_activa_jti=$1, ultimo_login=NOW() WHERE id=$2', [jti, usuario.id]).catch(() => {});

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nombre_completo: usuario.nombre_completo,
        telefono: usuario.telefono,
        rol: 'capturista',
        debe_cambiar_pass: !!usuario.debe_cambiar_pass,
      },
    });
  } catch (error) {
    console.error('Error en login de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/tecnico/consultar-curp
// Misma lógica de validación de CURP que POST /api/productor/auth/consultar-curp
// (backend/src/routes/productor.ts), adaptada para el flujo de técnico:
//  - Cuenta activa (usuario_id no nulo) → sigue bloqueando 409 CURP_DUPLICADA
//  - En padrón interno SIN cuenta (PUEDE_ACTIVAR) → 200 en vez de bloquear
//  - No está en el padrón pero SADER/RENAPO valida la identidad → 200 con
//    codigo NO_EN_PADRON (en vez de 404)
//  - No existe en ningún lado → sigue bloqueando igual que hoy
// =============================================
router.post('/consultar-curp', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  const { curp } = req.body;

  const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
  if (!curp || !CURP_RE.test(curp.toUpperCase().trim())) {
    res.status(400).json({ error: 'CURP inválida. Verifica el formato (18 caracteres).' });
    return;
  }
  const curpN = curp.toUpperCase().trim();

  const saderPromise = consultarPersonaPorCURP(curpN);

  try {
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
        // Cuenta completa activa — sigue bloqueando igual que el flujo productor
        res.status(409).json({
          error: 'Esta CURP ya tiene cuenta en SIMAC.',
          codigo: 'CURP_DUPLICADA',
          nombres: row.nombres,
        });
        return;
      }
      // Está en el padrón interno pero sin cuenta — el técnico SÍ puede
      // activarla (flujo distinto al del productor, que aquí bloquearía).
      res.json({
        codigo: 'PUEDE_ACTIVAR',
        nombres: row.nombres,
        apellido_paterno: row.apellido_paterno,
        producer_id: row.producer_id,
        fuente: 'padron_sader',
      });
      return;
    }
    if (usuResult.rows.length > 0) {
      res.status(409).json({
        error: 'Esta CURP ya tiene cuenta en SIMAC.',
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
      // SADER no lo tiene — RENAPO debe confirmar que la persona existe y está viva
      const renapo = await consultarCURPEnRENAPO(curpN);

      if (!renapo.encontrado) {
        const esPorNoExistir = renapo.codigo === 'NO_EN_RENAPO';
        res.status(404).json({
          error: esPorNoExistir
            ? 'Esta CURP no existe en el Registro Nacional de Población. Verifica que esté bien escrita.'
            : 'No es posible verificar la identidad en este momento. Intenta más tarde.',
          codigo: esPorNoExistir ? 'CURP_NO_VALIDA_RENAPO' : 'VERIFICACION_NO_DISPONIBLE',
        });
        return;
      }

      if (renapo.fallecido) {
        res.status(403).json({
          error: 'La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.',
          codigo: 'CURP_FALLECIDO',
        });
        return;
      }

      // RENAPO confirma persona viva y válida, aunque no esté en el padrón
      // SADER — el técnico puede seguir con el registro alterno (200, no 404).
      res.json({
        codigo: 'NO_EN_PADRON',
        fuente: 'renapo',
        datos_renapo: {
          nombres: renapo.datos!.nombres,
          apellido_pat: renapo.datos!.apellidoPat,
          apellido_mat: renapo.datos!.apellidoMat,
          sexo: renapo.datos!.sexo,
          fecha_nac: renapo.datos!.fechaNac,
          entidad_nac: renapo.datos!.entidadNac,
        },
      });
      return;
    }

    if (!datos.activo_padron) {
      const renapoInactivo = await consultarCURPEnRENAPO(curpN);
      if (renapoInactivo.encontrado && renapoInactivo.fallecido) {
        res.status(403).json({
          error: 'La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.',
          codigo: 'CURP_FALLECIDO',
        });
        return;
      }
      res.status(403).json({
        error: 'El registro de esta CURP en el padrón no está activo.',
        codigo: 'INACTIVO_PADRON',
      });
      return;
    }

    res.json({
      codigo: 'PUEDE_ACTIVAR',
      fuente: 'padron_sader',
      nombres: datos.nombres,
      apellido_paterno: datos.apellido_paterno,
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
        localidad_padron: datos.localidad,
      },
    });
  } catch (error: any) {
    console.warn('[SADER] No disponible, verificando con RENAPO:', error.message);

    const renapo = await consultarCURPEnRENAPO(curpN);

    if (!renapo.encontrado) {
      const esPorNoExistir = renapo.codigo === 'NO_EN_RENAPO';
      res.status(404).json({
        error: esPorNoExistir
          ? 'Esta CURP no existe en el Registro Nacional de Población. Verifica que esté bien escrita.'
          : 'No es posible verificar la identidad en este momento. Intenta más tarde.',
        codigo: esPorNoExistir ? 'CURP_NO_VALIDA_RENAPO' : 'VERIFICACION_NO_DISPONIBLE',
      });
      return;
    }

    if (renapo.fallecido) {
      res.status(403).json({
        error: 'La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.',
        codigo: 'CURP_FALLECIDO',
      });
      return;
    }

    res.json({
      codigo: 'NO_EN_PADRON',
      fuente: 'renapo',
      datos_renapo: {
        nombres: renapo.datos!.nombres,
        apellido_pat: renapo.datos!.apellidoPat,
        apellido_mat: renapo.datos!.apellidoMat,
        sexo: renapo.datos!.sexo,
        fecha_nac: renapo.datos!.fechaNac,
        entidad_nac: renapo.datos!.entidadNac,
      },
    });
  }
});

// =============================================
// POST /api/tecnico/registro-alterno
// Crea el productor (o actualiza uno existente en estado PUEDE_ACTIVAR) + su
// primera UP, dentro de una transacción.
// =============================================
router.post('/registro-alterno', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const {
      curp, nombres, apellido_paterno, apellido_materno, telefono, state_id, municipality_id,
      producer_id_existente,
    } = req.body;

    if (!producer_id_existente) {
      if (!curp || String(curp).trim().length !== 18) {
        res.status(400).json({ error: 'CURP inválida' });
        client.release();
        return;
      }
      if (!nombres || !apellido_paterno) {
        res.status(400).json({ error: 'nombres y apellido_paterno son obligatorios' });
        client.release();
        return;
      }
    }
    if (!req.body.estado_up || !req.body.municipio_up) {
      res.status(400).json({ error: 'estado_up y municipio_up son obligatorios para registrar la UP' });
      client.release();
      return;
    }

    await client.query('BEGIN');
    const tecnicoId = req.user!.userId;
    let producerId: number;

    if (producer_id_existente) {
      producerId = producer_id_existente;
      const r = await client.query(
        `UPDATE producer SET
           phone = COALESCE($1, phone),
           state_id = COALESCE($2, state_id),
           municipality_id = COALESCE($3, municipality_id),
           usuario_capturista_id = $4,
           estatus_registro = 'alterno',
           fecha_captura = COALESCE(fecha_captura, CURRENT_TIMESTAMP)
         WHERE producer_id = $5
         RETURNING producer_id`,
        [telefono || null, state_id || null, municipality_id || null, tecnicoId, producerId]
      );
      if (r.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'El productor indicado no existe' });
        client.release();
        return;
      }
    } else {
      const curpN = String(curp).toUpperCase().trim();
      const existe = await client.query(
        `SELECT producer_id FROM producer WHERE UPPER(curp) = $1`,
        [curpN]
      );
      if (existe.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Esta CURP ya está registrada' });
        client.release();
        return;
      }

      const r = await client.query(
        `INSERT INTO producer
           (curp, nombres, apellido_paterno, apellido_materno, phone,
            state_id, municipality_id, usuario_capturista_id, estatus_registro, fecha_captura)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'alterno', CURRENT_TIMESTAMP)
         RETURNING producer_id`,
        [curpN, nombres, apellido_paterno, apellido_materno || null,
         telefono || null, state_id || null, municipality_id || null, tecnicoId]
      );
      producerId = r.rows[0].producer_id;
    }

    const upId = await insertarUP(client, producerId, req.body);

    await client.query('COMMIT');
    res.status(201).json({ producer_id: producerId, up_id: upId, message: 'Registro alterno creado' });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === 'UP_OVERLAP') {
      res.status(409).json({
        error: `La parcela se intersecta con otra parcela ya registrada ("${e.up_conflicto}").`,
        up_conflicto: e.up_conflicto,
      });
      return;
    }
    if (e.code === 'UP_OVERLAP_CROSS') {
      res.status(409).json({
        error: 'El polígono se superpone significativamente con la parcela de otro productor.',
        codigo: 'UP_OVERLAP_CROSS',
      });
      return;
    }
    if (e.code === '23505') {
      res.status(409).json({ error: 'Esta CURP ya está registrada en el sistema' });
      return;
    }
    console.error('Error en registro-alterno:', e);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/tecnico/mis-registros
// =============================================
router.get('/mis-registros', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const result = await pool.query(
      `SELECT p.producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno,
              p.phone AS telefono, p.state_id, p.municipality_id, p.estatus_registro, p.fecha_captura,
              COUNT(DISTINCT u.up_id) AS total_ups, COUNT(DISTINCT c.cycle_id) AS total_ciclos
       FROM producer p
       LEFT JOIN up u ON u.producer_id = p.producer_id
       LEFT JOIN cycle c ON c.up_id = u.up_id
       WHERE p.usuario_capturista_id = $1
       GROUP BY p.producer_id
       ORDER BY p.fecha_captura DESC`,
      [tecnicoId]
    );
    res.json({ registros: result.rows });
  } catch (error) {
    console.error('Error en mis-registros de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/tecnico/productor/:producer_id/ups
// =============================================
router.get('/productor/:producer_id/ups', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;

    const own = await pool.query(
      'SELECT producer_id FROM producer WHERE producer_id = $1 AND usuario_capturista_id = $2',
      [producer_id, tecnicoId]
    );
    if (own.rows.length === 0) {
      res.status(403).json({ error: 'Este productor no fue registrado por ti' });
      return;
    }

    const result = await pool.query(
      `SELECT up_id, up_name, state_name, municipality_name, state_id, municipality_id,
              location_confirmed, centroid_source,
              ST_Y(centroid::geometry) AS lat,
              ST_X(centroid::geometry) AS lng,
              area_ha_calc, area_ha_real, coincide_area,
              CASE WHEN geom IS NOT NULL THEN ST_AsGeoJSON(geom)::json ELSE NULL END AS geom_geojson,
              created_at
       FROM up
       WHERE producer_id = $1
       ORDER BY created_at DESC`,
      [producer_id]
    );
    res.json({ ups: result.rows });
  } catch (error) {
    console.error('Error al listar UPs del productor (técnico):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/tecnico/productor/:producer_id/ups
// =============================================
router.post('/productor/:producer_id/ups', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;

    const own = await client.query(
      'SELECT producer_id FROM producer WHERE producer_id = $1 AND usuario_capturista_id = $2',
      [producer_id, tecnicoId]
    );
    if (own.rows.length === 0) {
      res.status(403).json({ error: 'Este productor no fue registrado por ti' });
      client.release();
      return;
    }

    await client.query('BEGIN');
    const upId = await insertarUP(client, Number(producer_id), req.body);
    await client.query('COMMIT');
    res.status(201).json({ up_id: upId, message: 'UP agregada' });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e.code === 'UP_OVERLAP') {
      res.status(409).json({
        error: `La parcela se intersecta con otra parcela ya registrada ("${e.up_conflicto}").`,
        up_conflicto: e.up_conflicto,
      });
      return;
    }
    if (e.code === 'UP_OVERLAP_CROSS') {
      res.status(409).json({
        error: 'El polígono se superpone significativamente con la parcela de otro productor.',
        codigo: 'UP_OVERLAP_CROSS',
      });
      return;
    }
    console.error('Error al agregar UP (técnico):', e);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// PATCH /api/tecnico/productor/:producer_id
// =============================================
router.patch('/productor/:producer_id', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;
    const { nombres, apellido_paterno, apellido_materno, telefono, state_id, municipality_id } = req.body;

    const updates: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (nombres !== undefined) { updates.push(`nombres = $${idx++}`); vals.push(nombres); }
    if (apellido_paterno !== undefined) { updates.push(`apellido_paterno = $${idx++}`); vals.push(apellido_paterno); }
    if (apellido_materno !== undefined) { updates.push(`apellido_materno = $${idx++}`); vals.push(apellido_materno); }
    if (telefono !== undefined) { updates.push(`phone = $${idx++}`); vals.push(telefono); }
    if (state_id !== undefined) { updates.push(`state_id = $${idx++}`); vals.push(state_id); }
    if (municipality_id !== undefined) { updates.push(`municipality_id = $${idx++}`); vals.push(municipality_id); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    vals.push(producer_id, tecnicoId);
    const result = await pool.query(
      `UPDATE producer SET ${updates.join(', ')}
       WHERE producer_id = $${idx++} AND usuario_capturista_id = $${idx}
       RETURNING producer_id, curp, nombres, apellido_paterno, apellido_materno, phone AS telefono, state_id, municipality_id`,
      vals
    );

    if (result.rows.length === 0) {
      res.status(403).json({ error: 'Este productor no fue registrado por ti' });
      return;
    }

    res.json({ productor: result.rows[0] });
  } catch (error) {
    console.error('Error al editar productor (técnico):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/tecnico/perfil
// =============================================
router.get('/perfil', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;

    const usuario = await pool.query(
      `SELECT id, email, nombre_completo, telefono, activo, created_at
       FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
      [tecnicoId]
    );
    if (usuario.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    const stats = await pool.query(
      `SELECT COUNT(DISTINCT p.producer_id) AS total_registros,
              COUNT(DISTINCT u.up_id) AS total_ups,
              COUNT(DISTINCT c.cycle_id) AS total_ciclos
       FROM producer p
       LEFT JOIN up u ON u.producer_id = p.producer_id
       LEFT JOIN cycle c ON c.up_id = u.up_id
       WHERE p.usuario_capturista_id = $1`,
      [tecnicoId]
    );

    res.json({ ...usuario.rows[0], ...stats.rows[0] });
  } catch (error) {
    console.error('Error en get perfil de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/tecnico/perfil
// Solo permite actualizar el propio teléfono. NO permite cambiar email ni rol.
// =============================================
router.patch('/perfil', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const { telefono } = req.body;

    const updates: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (telefono !== undefined) { updates.push(`telefono = $${idx++}`); vals.push(telefono); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    vals.push(tecnicoId);
    const result = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')}
       WHERE id = $${idx} AND rol = 'capturista'
       RETURNING id, email, nombre_completo, telefono`,
      vals
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    res.json({ usuario: result.rows[0] });
  } catch (error) {
    console.error('Error al editar perfil de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/tecnico/perfil/cambiar-password
// =============================================
router.post('/perfil/cambiar-password', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const { password_actual, password_nueva } = req.body;

    if (!password_actual || !password_nueva) {
      res.status(400).json({ error: 'password_actual y password_nueva son obligatorios' });
      return;
    }
    if (String(password_nueva).length < 8) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
      return;
    }

    const usuario = await pool.query(
      `SELECT id, password_hash FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
      [tecnicoId]
    );
    if (usuario.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    const passwordValido = await bcrypt.compare(password_actual, usuario.rows[0].password_hash);
    if (!passwordValido) {
      res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      return;
    }

    const nuevoHash = await bcrypt.hash(password_nueva, 12);
    await pool.query(
      `UPDATE usuarios SET password_hash = $1, debe_cambiar_pass = false WHERE id = $2`,
      [nuevoHash, tecnicoId]
    );

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
