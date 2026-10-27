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
import { aplicarEdicionDirecta, registrarCambioSinGastar, ErrorEdicion } from '../services/edicionUnica';
import { requierePrograma } from '../middleware/programa';
import { perfilProgramasDeTecnico, soloMaiz, tecnicoDeMaiz, parcelaDeMaiz, PROGRAMA_MAIZ } from '../utils/programas';
import {
  EncuestaError, determinarContextoTerritorial, guardarEncuestaEnTransaccion,
  obtenerRespuestaProductor, obtenerEdicionVigente,
} from '../services/encuestaService';

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
      "SELECT * FROM usuarios WHERE correo_electronico = $1 AND activo = true AND rol = 'capturista'",
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
    pool.query('UPDATE usuarios SET sesion_activa_id_jwt=$1, ultimo_login=NOW() WHERE id=$2', [jti, usuario.id]).catch(() => {});

    const perfilProg = await perfilProgramasDeTecnico(usuario.id);
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
        // Programas con los que puede trabajar; el frontend decide a dónde entra con esto
        programas: perfilProg.programas.length > 0 ? perfilProg.programas : [PROGRAMA_MAIZ],
        tipo_tecnico: perfilProg.tipo_tecnico,
        tipo_tecnico_etiqueta: perfilProg.tipo_tecnico_etiqueta,
        zona: perfilProg.zona,
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
router.post('/consultar-curp', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
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
        `SELECT p.productor_id, u.id AS usuario_id, p.nombres, p.apellido_paterno
         FROM productor p LEFT JOIN usuarios u ON u.id = p.usuario_id
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
          error: 'Esta CURP ya tiene cuenta en Maíz.',
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
        error: 'Esta CURP ya tiene cuenta en Maíz.',
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
router.post('/registro-alterno', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const {
      curp, nombres, apellido_paterno, apellido_materno, telefono, state_id, municipality_id,
      sexo, fecha_nac, fuente,
      producer_id_existente,
    } = req.body;
    // MEN (revisión Fase 5, 2026-09-22): antes solo se validaba que la fecha
    // fuera parseable — una fecha futura o del siglo pasado (año 1850, por
    // ejemplo) pasaba directo a producer.fecha_nacimiento sin detectarse.
    const fechaNacParsed = fecha_nac ? Date.parse(fecha_nac) : NaN;
    const HACE_100_ANIOS = Date.now() - 100 * 365.25 * 24 * 60 * 60 * 1000;
    const fechaNacValida = !Number.isNaN(fechaNacParsed) && fechaNacParsed <= Date.now() && fechaNacParsed >= HACE_100_ANIOS
      ? fecha_nac
      : null;

    if (!producer_id_existente) {
      if (!curp || String(curp).trim().length !== 18) {
        res.status(400).json({ error: 'CURP inválida' });
        return;
      }
      if (!nombres || !apellido_paterno) {
        res.status(400).json({ error: 'nombres y apellido_paterno son obligatorios' });
        return;
      }
    }
    if (!req.body.estado_up || !req.body.municipio_up) {
      res.status(400).json({ error: 'estado_up y municipio_up son obligatorios para registrar la UP' });
      return;
    }

    await client.query('BEGIN');
    const tecnicoId = req.user!.userId;
    let producerId: number;

    if (producer_id_existente) {
      // CRIT-02 (auditoría seguridad 2026-09-21): sin este chequeo, cualquier
      // técnico autenticado podía iterar producer_id y reasignarse como
      // capturista de un productor que ya gestiona otro técnico, o de uno
      // que ya tiene cuenta propia activa (secuestro de productor).
      const propietarioActual = await client.query(
        `SELECT productor_id, usuario_id, usuario_capturista_id FROM productor WHERE productor_id = $1`,
        [producer_id_existente]
      );
      if (propietarioActual.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'El productor indicado no existe' });
        return;
      }
      const { usuario_id: usuarioIdPropio } = propietarioActual.rows[0];
      if (usuarioIdPropio) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Este productor ya tiene cuenta propia activa' });
        return;
      }
      // La propiedad para MAÍZ se valida contra el programa simac_maiz: un productor que llegó primero por Frijol
      // (dueño de producer = técnico de frijol) puede ser tomado por un técnico de maíz sin bloqueo.
      const progMaiz = await client.query(
        `SELECT usuario_capturista_id FROM productor_programa WHERE productor_id = $1 AND programa = 'simac_maiz'`,
        [producer_id_existente]
      );
      const dueñoMaiz = progMaiz.rows.length > 0 ? progMaiz.rows[0].usuario_capturista_id : null;
      if (dueñoMaiz && dueñoMaiz !== tecnicoId) {
        await client.query('ROLLBACK');
        res.status(403).json({ error: 'Este productor ya está asignado a otro técnico' });
        return;
      }
      // (Si no está en maíz y su capturista es de otro programa —frijol— se permite: abajo se crea su renglón de maíz.)

      producerId = producer_id_existente;
      // T10: teléfono, sexo y fecha de nacimiento de un productor que ya existía son datos personales: pasan por la edición única
      // (solo cuentan si el valor realmente cambia) y dejan historial. Estado y municipio solo dejan historial.
      const antes = (await client.query('SELECT estado_id, municipio_id FROM productor WHERE productor_id = $1', [producerId])).rows[0];
      await aplicarEdicionDirecta(client, {
        producerId, usuarioId: tecnicoId, programa: PROGRAMA_MAIZ,
        cambios: { ...(telefono ? { telefono } : {}), ...(sexo ? { sexo } : {}), ...(fechaNacValida ? { fecha_nacimiento: fechaNacValida } : {}) },
        contexto: 'registro',
      });
      if (antes) {
        if (state_id) await registrarCambioSinGastar(client, producerId, 'estado_id', antes.state_id, state_id, tecnicoId, PROGRAMA_MAIZ);
        if (municipality_id) await registrarCambioSinGastar(client, producerId, 'municipio_id', antes.municipality_id, municipality_id, tecnicoId, PROGRAMA_MAIZ);
      }
      const r = await client.query(
        `UPDATE productor SET
           estado_id = COALESCE($1, estado_id),
           municipio_id = COALESCE($2, municipio_id),
           fuente_registro = COALESCE($3, fuente_registro),
           usuario_capturista_id = COALESCE(usuario_capturista_id, $4),
           estatus_registro = 'alterno',
           fecha_captura = COALESCE(fecha_captura, CURRENT_TIMESTAMP)
         WHERE productor_id = $5
         RETURNING productor_id`,
        [state_id || null, municipality_id || null, fuente || null, tecnicoId, producerId]
      );
      if (r.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'El productor indicado no existe' });
        return;
      }
      // Renglón de maíz (si llegó por frijol no lo tenía); no pisa al técnico que ya sea responsable
      await client.query(
        `INSERT INTO productor_programa (productor_id, programa, usuario_capturista_id) VALUES ($1, 'simac_maiz', $2)
         ON CONFLICT (productor_id, programa) DO UPDATE SET usuario_capturista_id = COALESCE(productor_programa.usuario_capturista_id, EXCLUDED.usuario_capturista_id)`,
        [producerId, tecnicoId]
      );
    } else {
      const curpN = String(curp).toUpperCase().trim();
      const existe = await client.query(
        `SELECT productor_id FROM productor WHERE UPPER(curp) = $1`,
        [curpN]
      );
      if (existe.rows.length > 0) {
        await client.query('ROLLBACK');
        res.status(409).json({ error: 'Esta CURP ya está registrada' });
        return;
      }

      const r = await client.query(
        `INSERT INTO productor
           (curp, nombres, apellido_paterno, apellido_materno, telefono,
            estado_id, municipio_id, sexo, fecha_nacimiento, fuente_registro,
            usuario_capturista_id, estatus_registro, fecha_captura)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'alterno', CURRENT_TIMESTAMP)
         RETURNING productor_id`,
        [curpN, nombres, apellido_paterno, apellido_materno || null,
         telefono || null, state_id || null, municipality_id || null,
         sexo || null, fechaNacValida, fuente || null, tecnicoId]
      );
      producerId = r.rows[0].producer_id;
      // Programa: el técnico de maíz queda como responsable en 'simac_maiz'.
      await client.query(
        `INSERT INTO productor_programa (productor_id, programa, usuario_capturista_id)
         VALUES ($1, 'simac_maiz', $2) ON CONFLICT DO NOTHING`,
        [producerId, tecnicoId]
      );
    }

    const upId = await insertarUP(client, producerId, req.body);

    // Encuesta de insumos: a diferencia del alta que hace el propio
    // productor, aquí NO es obligatoria en la misma llamada — el técnico
    // puede capturarla por etapas en otra sesión (ticket 04). Si la manda
    // en este mismo POST, se guarda ya dentro de la transacción del alta;
    // si no, el registro queda "pendiente de encuesta" (se resuelve más
    // tarde vía POST /tecnico/productor/:id/encuesta-insumos).
    let encuestaGuardada: boolean | null = null;
    if (req.body.encuesta_insumos && typeof req.body.encuesta_insumos === 'object') {
      const r = await guardarEncuestaEnTransaccion(client, producerId, req.body.encuesta_insumos, {
        canal: 'tecnico', capturistaId: tecnicoId,
      });
      encuestaGuardada = r.elegible;
    }

    await client.query('COMMIT');
    const contextoFinal = await determinarContextoTerritorial(pool, producerId);
    res.status(201).json({
      producer_id: producerId,
      up_id: upId,
      message: 'Registro alterno creado',
      encuesta_aplicable: contextoFinal.elegible,
      encuesta_pendiente: contextoFinal.elegible && encuestaGuardada === null,
    });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e instanceof EncuestaError) {
      res.status(e.status).json({ error: e.message, codigo: e.codigo, campo: e.campo });
      return;
    }
    if (e instanceof ErrorEdicion) {
      res.status(e.status).json({ error: e.message, codigo: e.codigo, campo: e.campo, ...(e.extra || {}) });
      return;
    }
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
router.get('/mis-registros', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const edicion = await obtenerEdicionVigente();
    const result = await pool.query(
      `SELECT p.productor_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno,
              p.telefono AS telefono, p.estado_id, p.municipio_id, p.estatus_registro, p.fecha_captura,
              COUNT(DISTINCT u.up_id) AS total_ups, COUNT(DISTINCT c.ciclo_id) AS total_ciclos,
              BOOL_OR(u.estado_id = '25') AS encuesta_aplica,
              EXISTS (
                SELECT 1 FROM encuesta_respuestas er
                WHERE er.productor_id = p.productor_id AND er.edicion_id = $2
              ) AS encuesta_respondida
       FROM productor p
       LEFT JOIN up u ON u.productor_id = p.productor_id AND ${parcelaDeMaiz('u')}
       LEFT JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'maiz'
       WHERE ${tecnicoDeMaiz('p', '$1')}
       GROUP BY p.productor_id
       ORDER BY p.fecha_captura DESC`,
      [tecnicoId, edicion?.id || 0]
    );
    const registros = result.rows.map(r => ({
      ...r,
      encuesta_estado: !r.encuesta_aplica ? 'no_aplica' : r.encuesta_respondida ? 'respondida' : 'pendiente',
    }));
    res.json({ registros });
  } catch (error) {
    console.error('Error en mis-registros de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET/POST /api/tecnico/productor/:producer_id/encuesta-insumos
// Captura por etapas (ticket 04): el técnico puede responder la encuesta en
// una sesión distinta a la del alta. No pide NIP ni suplanta el login del
// productor — la propiedad se valida por usuario_capturista_id. Si el
// productor ya respondió (por su cuenta o en otra visita del técnico), se
// reemplaza dentro de una transacción con control de concurrencia.
// =============================================
router.get('/productor/:producer_id/encuesta-insumos', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;
    const own = await pool.query(
      `SELECT p.productor_id FROM productor p WHERE p.productor_id = $1 AND ${tecnicoDeMaiz('p', '$2')}`,
      [producer_id, tecnicoId]
    );
    if (own.rows.length === 0) { res.status(403).json({ error: 'Este productor no fue registrado por ti' }); return; }
    const datos = await obtenerRespuestaProductor(Number(producer_id));
    res.json(datos || { elegible: false });
  } catch (error) {
    console.error('Error al obtener encuesta de insumos (técnico):', error);
    res.status(500).json({ error: 'Error al obtener la encuesta' });
  }
});

router.post('/productor/:producer_id/encuesta-insumos', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;
    const own = await pool.query(
      `SELECT p.productor_id FROM productor p WHERE p.productor_id = $1 AND ${tecnicoDeMaiz('p', '$2')}`,
      [producer_id, tecnicoId]
    );
    if (own.rows.length === 0) { res.status(403).json({ error: 'Este productor no fue registrado por ti' }); return; }

    await client.query('BEGIN');
    const resultado = await guardarEncuestaEnTransaccion(client, Number(producer_id), req.body, {
      canal: 'tecnico', capturistaId: tecnicoId,
    });
    await client.query('COMMIT');
    res.json(resultado);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error instanceof EncuestaError) {
      res.status(error.status).json({ error: error.message, codigo: error.codigo, campo: error.campo });
      return;
    }
    console.error('Error al guardar encuesta de insumos (técnico):', error);
    res.status(500).json({ error: 'Error al guardar la encuesta' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/tecnico/productor/:producer_id/ups
// =============================================
router.get('/productor/:producer_id/ups', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;

    const own = await pool.query(
      `SELECT p.productor_id FROM productor p WHERE p.productor_id = $1 AND ${tecnicoDeMaiz('p', '$2')}`,
      [producer_id, tecnicoId]
    );
    if (own.rows.length === 0) {
      res.status(403).json({ error: 'Este productor no fue registrado por ti' });
      return;
    }

    const result = await pool.query(
      `SELECT up_id, nombre_up, nombre_estado, nombre_municipio, estado_id, municipio_id,
              ubicacion_confirmada, origen_centroide,
              ST_Y(centroide::geometry) AS lat,
              ST_X(centroide::geometry) AS lng,
              superficie_ha_calculada, superficie_ha_real, coincide_superficie,
              CASE WHEN geometria IS NOT NULL THEN ST_AsGeoJSON(geometria)::json ELSE NULL END AS geom_geojson,
              creado_en
       FROM up
       WHERE productor_id = $1 AND ${parcelaDeMaiz('up')}
       ORDER BY creado_en DESC`,
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
router.post('/productor/:producer_id/ups', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const tecnicoId = req.user!.userId;
    const { producer_id } = req.params;

    const own = await client.query(
      `SELECT p.productor_id FROM productor p WHERE p.productor_id = $1 AND ${tecnicoDeMaiz('p', '$2')}`,
      [producer_id, tecnicoId]
    );
    if (own.rows.length === 0) {
      res.status(403).json({ error: 'Este productor no fue registrado por ti' });
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
router.patch('/productor/:producer_id', authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_MAIZ), async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const tecnicoId = req.user!.userId;
    const producerId = Number(req.params.producer_id);
    const { nombres, apellido_paterno, apellido_materno, telefono, state_id, municipality_id, sexo, fecha_nacimiento, correo } = req.body;

    if ([nombres, apellido_paterno, apellido_materno, telefono, state_id, municipality_id, sexo, fecha_nacimiento, correo].every(x => x === undefined)) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }
    if (!Number.isInteger(producerId) || producerId <= 0) { res.status(404).json({ error: 'Productor no encontrado' }); return; }
    const propio = await client.query(`SELECT estado_id, municipio_id FROM productor WHERE productor_id = $1 AND ${tecnicoDeMaiz('producer', '$2')}`, [producerId, tecnicoId]);
    if (propio.rows.length === 0) { res.status(403).json({ error: 'Este productor no fue registrado por ti' }); return; }

    // T10: nombres, apellidos y teléfono entran en la edición única (una vez, con historial; teléfono con cuenta solo por solicitud al administrador).
    // Estado y municipio no entran en la regla (los fija la parcela, no identifican a la persona ni sirven para recuperar el NIP): solo dejan historial.
    await client.query('BEGIN');
    await aplicarEdicionDirecta(client, {
      producerId, usuarioId: tecnicoId, programa: PROGRAMA_MAIZ,
      cambios: { nombres, apellido_paterno, apellido_materno, telefono, sexo, fecha_nacimiento, correo },
    });
    const ub: string[] = [];
    const uv: unknown[] = [];
    if (state_id !== undefined) { uv.push(state_id); ub.push(`estado_id = $${uv.length}`); await registrarCambioSinGastar(client, producerId, 'estado_id', propio.rows[0].state_id, state_id, tecnicoId, PROGRAMA_MAIZ); }
    if (municipality_id !== undefined) { uv.push(municipality_id); ub.push(`municipio_id = $${uv.length}`); await registrarCambioSinGastar(client, producerId, 'municipio_id', propio.rows[0].municipality_id, municipality_id, tecnicoId, PROGRAMA_MAIZ); }
    if (ub.length > 0) { uv.push(producerId); await client.query(`UPDATE productor SET ${ub.join(', ')} WHERE productor_id = $${uv.length}`, uv); }
    const result = await client.query(
      `SELECT productor_id, curp, nombres, apellido_paterno, apellido_materno, telefono AS telefono, estado_id, municipio_id FROM productor WHERE productor_id = $1`, [producerId]);
    await client.query('COMMIT');
    res.json({ productor: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof ErrorEdicion) {
      res.status(error.status).json({ error: error.message, codigo: error.codigo, campo: error.campo, ...(error.extra || {}) });
      return;
    }
    console.error('Error al editar productor (técnico):', (error as Error)?.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/tecnico/perfil
// =============================================
router.get('/perfil', authMiddleware, requiereCapturista, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tecnicoId = req.user!.userId;

    const usuario = await pool.query(
      `SELECT id, correo_electronico, nombre_completo, telefono, activo, creado_en, debe_cambiar_contrasena
       FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
      [tecnicoId]
    );
    if (usuario.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    const stats = await pool.query(
      `SELECT COUNT(DISTINCT p.productor_id) AS total_registros,
              COUNT(DISTINCT u.up_id) AS total_ups,
              COUNT(DISTINCT c.ciclo_id) AS total_ciclos
       FROM productor p
       LEFT JOIN up u ON u.productor_id = p.productor_id AND ${parcelaDeMaiz('u')}
       LEFT JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'maiz'
       WHERE ${tecnicoDeMaiz('p', '$1')}`,
      [tecnicoId]
    );
    const perfilProg = await perfilProgramasDeTecnico(tecnicoId);

    res.json({
      ...usuario.rows[0], ...stats.rows[0],
      programas: perfilProg.programas.length > 0 ? perfilProg.programas : [PROGRAMA_MAIZ],
      tipo_tecnico: perfilProg.tipo_tecnico,
      tipo_tecnico_etiqueta: perfilProg.tipo_tecnico_etiqueta,
      zona: perfilProg.zona,
    });
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
       RETURNING id, correo_electronico, nombre_completo, telefono`,
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
      `SELECT id, hash_contrasena FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
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

    // MEN (revisión Fase 5, 2026-09-22): sin este chequeo, un técnico con
    // debe_cambiar_pass=true podía "cambiar" la contraseña a la misma que
    // ya tenía y el gate de CRIT-05 se daba por satisfecho sin rotación real.
    const mismaPassword = await bcrypt.compare(password_nueva, usuario.rows[0].password_hash);
    if (mismaPassword) {
      res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
      return;
    }

    const nuevoHash = await bcrypt.hash(password_nueva, 12);
    await pool.query(
      `UPDATE usuarios SET hash_contrasena = $1, debe_cambiar_contrasena = false WHERE id = $2`,
      [nuevoHash, tecnicoId]
    );

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al cambiar contraseña de técnico:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
