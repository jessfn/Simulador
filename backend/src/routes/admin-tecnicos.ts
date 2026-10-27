import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/database';
import { soloMaiz, parcelaDeMaiz, PROGRAMA_FRIJOL } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';
import { enviarCredencialesTecnico } from '../utils/mailer';

const router = Router();

const verTecnicos = checkPermiso('tecnicos', 'ver');
const verDetalleTecnicos = checkPermiso('tecnicos', 'ver_detalle');
const crearTecnicos = checkPermiso('tecnicos', 'crear');
const editarTecnicos = checkPermiso('tecnicos', 'editar');
const eliminarTecnicos = checkPermiso('tecnicos', 'eliminar');

const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Contraseña temporal de 12 caracteres para técnicos (alta y reinicio): criptográficamente aleatoria (crypto) y con mayúscula, minúscula y número.
// T09 §9.7: el reinicio usaba Math.random() (no es seguro); ahora usa este mismo generador y se quitó la función vieja.
export function passTemporalTecnico(): string {
  const may = 'ABCDEFGHJKLMNPQRSTUVWXYZ', min = 'abcdefghjkmnpqrstuvwxyz', num = '23456789', todo = may + min + num;
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  const chars = [pick(may), pick(min), pick(num)];
  while (chars.length < 12) chars.push(pick(todo));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

interface ZonaEntrada { state_id: string; municipality_id: string | null }
interface DatosTecnico {
  nombre_completo?: string; curp?: string; email?: string; telefono?: string;
  tipo_tecnico?: string; programas?: string[]; zona?: ZonaEntrada[];
}

/**
 * Valida el cuerpo de alta/edición de un técnico. En alta (`parcial = false`) todo es obligatorio;
 * en edición solo se valida lo que viene. Devuelve el mensaje de error o null.
 */
async function validarTecnico(b: DatosTecnico, parcial: boolean): Promise<string | null> {
  const falta = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

  if (!parcial || b.nombre_completo !== undefined) {
    if (falta(b.nombre_completo)) return 'El nombre completo es obligatorio';
  }
  if (!parcial) {
    if (falta(b.curp)) return 'La CURP es obligatoria';
    if (!CURP_RE.test(String(b.curp).toUpperCase().trim())) return 'La CURP no tiene un formato válido';
  }
  if (!parcial || b.email !== undefined) {
    if (falta(b.email)) return 'El correo es obligatorio';
    if (!EMAIL_RE.test(String(b.email).trim())) return 'El correo no tiene un formato válido';
  }
  if (!parcial || b.telefono !== undefined) {
    if (!/^\d{10}$/.test(String(b.telefono ?? '').trim())) return 'El teléfono debe tener 10 dígitos';
  }
  if (!parcial || b.tipo_tecnico !== undefined) {
    if (falta(b.tipo_tecnico)) return 'El tipo de técnico es obligatorio';
    const t = await pool.query(`SELECT 1 FROM cat_catalogo WHERE catalogo = 'tipo_tecnico' AND codigo = $1 AND activo = true`, [b.tipo_tecnico]);
    if (t.rows.length === 0) return 'El tipo de técnico no es válido';
  }
  if (!parcial || b.programas !== undefined) {
    if (!Array.isArray(b.programas) || b.programas.length === 0) return 'Elige al menos un programa';
    const p = await pool.query(`SELECT clave FROM cat_programa WHERE clave = ANY($1::text[]) AND activo = true`, [b.programas]);
    if (p.rows.length !== new Set(b.programas).size) return 'Alguno de los programas no es válido';
  }
  if (!parcial || b.zona !== undefined) {
    if (!Array.isArray(b.zona) || b.zona.length === 0) return 'Agrega al menos un estado a la zona de operación';
    for (const z of b.zona) {
      if (!z || falta(z.state_id)) return 'Cada renglón de la zona necesita un estado';
      const e = await pool.query('SELECT 1 FROM geo_estado WHERE estado_id = $1', [z.state_id]);
      if (e.rows.length === 0) return `El estado ${z.state_id} no existe`;
      if (z.municipality_id) {
        const m = await pool.query('SELECT 1 FROM geo_municipio WHERE municipio_id = $1 AND estado_id = $2', [z.municipality_id, z.state_id]);
        if (m.rows.length === 0) return `El municipio ${z.municipality_id} no pertenece al estado ${z.state_id}`;
      }
    }
  }
  return null;
}

type Db = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> };

async function guardarProgramasYZona(db: Db, id: number, programas?: string[], zona?: ZonaEntrada[]): Promise<void> {
  if (programas !== undefined) {
    await db.query('DELETE FROM usuario_programa WHERE usuario_id = $1', [id]);
    for (const p of new Set(programas)) {
      await db.query('INSERT INTO usuario_programa (usuario_id, programa) VALUES ($1, $2)', [id, p]);
    }
  }
  if (zona !== undefined) {
    await db.query('DELETE FROM tecnico_zona WHERE usuario_id = $1', [id]);
    for (const z of zona) {
      await db.query(
        `INSERT INTO tecnico_zona (usuario_id, estado_id, municipio_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, z.state_id, z.municipality_id || null]
      );
    }
  }
}

// Subconsultas que se agregan al listado y al detalle: tipo, programas y zona legibles
const CAMPOS_PROGRAMA = `
  u.tipo_tecnico,
  (SELECT etiqueta FROM cat_catalogo WHERE catalogo = 'tipo_tecnico' AND codigo = u.tipo_tecnico) AS tipo_tecnico_etiqueta,
  COALESCE((SELECT json_agg(x.programa ORDER BY x.programa) FROM usuario_programa x WHERE x.usuario_id = u.id), '[]'::json) AS programas,
  COALESCE((SELECT json_agg(json_build_object(
      'state_id', z.estado_id, 'state_name', gs.nombre,
      'municipality_id', z.municipio_id, 'municipality_name', gm.nombre) ORDER BY gs.nombre, gm.nombre)
     FROM tecnico_zona z
     LEFT JOIN geo_estado gs ON gs.estado_id = z.estado_id
     LEFT JOIN geo_municipio gm ON gm.municipio_id = z.municipio_id
    WHERE z.usuario_id = u.id), '[]'::json) AS zona,
  (SELECT COUNT(*)::int FROM productor_programa pp WHERE pp.usuario_capturista_id = u.id AND pp.programa = '${PROGRAMA_FRIJOL}') AS registros_frijol`;

// =============================================
// GET /api/admin/tecnicos/catalogos
// Listas para los formularios del panel: tipos de técnico, programas, estados.
// GET /api/admin/tecnicos/municipios?state_id=XX  — municipios de un estado.
// (van antes de "/:id" para que no se confundan con un id)
// =============================================
router.get('/catalogos', authMiddleware, verTecnicos, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [tipos, programas, estados] = await Promise.all([
      pool.query(`SELECT codigo, etiqueta FROM cat_catalogo WHERE catalogo = 'tipo_tecnico' AND activo = true ORDER BY orden, etiqueta`),
      pool.query(`SELECT clave, nombre, cultivo FROM cat_programa WHERE activo = true ORDER BY nombre`),
      pool.query(`SELECT estado_id, nombre FROM geo_estado ORDER BY nombre`),
    ]);
    res.json({ tipos_tecnico: tipos.rows, programas: programas.rows, estados: estados.rows });
  } catch (error) {
    console.error('Error en catálogos de técnicos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/municipios', authMiddleware, verTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stateId = String(req.query.state_id || '');
    if (!stateId) { res.status(400).json({ error: 'Falta state_id' }); return; }
    const r = await pool.query('SELECT municipio_id, nombre FROM geo_municipio WHERE estado_id = $1 ORDER BY nombre', [stateId]);
    res.json({ municipios: r.rows });
  } catch (error) {
    console.error('Error en municipios de técnicos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/admin/tecnicos
// Alta de un técnico ECA con tipo, programas y zona. Crea la cuenta con contraseña temporal aleatoria
// (que debe cambiar en su primer acceso) y la devuelve UNA sola vez; no se guarda en texto plano.
// =============================================
router.post('/', authMiddleware, crearTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  const b: DatosTecnico & { enviar_credenciales?: boolean } = req.body || {};
  const client = await pool.connect();
  try {
    const errorValidacion = await validarTecnico(b, false);
    if (errorValidacion) { res.status(400).json({ error: errorValidacion }); return; }

    const curp = String(b.curp).toUpperCase().trim();
    const email = String(b.email).toLowerCase().trim();
    const nombre = String(b.nombre_completo).trim();
    const telefono = String(b.telefono).trim();

    await client.query('BEGIN');
    // La tabla de usuarios no tiene restricción de unicidad en correo/CURP: se serializa el alta para no duplicar.
    await client.query('SELECT pg_advisory_xact_lock(7400001)');
    const dupCurp = await client.query('SELECT 1 FROM usuarios WHERE UPPER(curp) = $1', [curp]);
    if (dupCurp.rows.length > 0) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Ya existe un usuario con esa CURP' }); return; }
    const dupMail = await client.query('SELECT 1 FROM usuarios WHERE LOWER(correo_electronico) = $1', [email]);
    if (dupMail.rows.length > 0) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Ya existe un usuario con ese correo' }); return; }

    const passTemporal = passTemporalTecnico();
    const hash = await bcrypt.hash(passTemporal, 12);
    const r = await client.query(
      `INSERT INTO usuarios (correo_electronico, curp, nombre_completo, hash_contrasena, telefono, activo, rol, debe_cambiar_contrasena, tipo_tecnico)
       VALUES ($1, $2, $3, $4, $5, true, 'capturista', true, $6)
       RETURNING id, correo_electronico, nombre_completo, telefono, activo, tipo_tecnico, debe_cambiar_contrasena, creado_en`,
      [email, curp, nombre, hash, telefono, b.tipo_tecnico]
    );
    const nuevo = r.rows[0];
    await guardarProgramasYZona(client, nuevo.id, b.programas, b.zona);
    await client.query('COMMIT');

    let correoEnviado: boolean | null = null;
    if (b.enviar_credenciales) {
      try { correoEnviado = await enviarCredencialesTecnico(email, nombre, passTemporal); } catch { correoEnviado = false; }
    }

    res.status(201).json({ tecnico: nuevo, password_temporal: passTemporal, correo_enviado: correoEnviado });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al crear técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/admin/tecnicos
// Lista todos los técnicos ECA (rol = 'capturista') con estadísticas agregadas, tipo, programas y zona.
// Filtros: ?q= (nombre, email o CURP), ?programa=, ?tipo_tecnico=, ?state_id=
// =============================================
router.get('/', authMiddleware, verTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q, programa, tipo_tecnico, state_id } = req.query;
    const conditions: string[] = [`u.rol = 'capturista'`];
    const params: any[] = [];
    let idx = 1;

    if (q) {
      conditions.push(`(u.nombre_completo ILIKE $${idx} OR u.correo_electronico ILIKE $${idx} OR u.curp ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    if (programa) {
      conditions.push(`EXISTS (SELECT 1 FROM usuario_programa f WHERE f.usuario_id = u.id AND f.programa = $${idx++})`);
      params.push(programa);
    }
    if (tipo_tecnico) { conditions.push(`u.tipo_tecnico = $${idx++}`); params.push(tipo_tecnico); }
    if (state_id) {
      conditions.push(`EXISTS (SELECT 1 FROM tecnico_zona fz WHERE fz.usuario_id = u.id AND fz.estado_id = $${idx++})`);
      params.push(state_id);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT u.id, u.correo_electronico, u.curp, u.nombre_completo, u.telefono, u.activo, u.debe_cambiar_contrasena, u.ultimo_login, u.creado_en,
              COUNT(DISTINCT p.productor_id) AS total_registros,
              COUNT(DISTINCT up.up_id) AS total_ups,
              ${CAMPOS_PROGRAMA}
       FROM usuarios u
       LEFT JOIN productor p ON p.usuario_capturista_id = u.id AND ${soloMaiz('p')}
       LEFT JOIN up up ON up.productor_id = p.productor_id AND ${parcelaDeMaiz('up')}
       ${where}
       GROUP BY u.id
       ORDER BY u.nombre_completo`,
      params
    );
    res.json({ tecnicos: result.rows });
  } catch (error) {
    console.error('Error al listar técnicos (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/tecnicos/:id
// Detalle de un técnico + su lista de registros (productores capturados) de maíz y de frijol.
// =============================================
router.get('/:id', authMiddleware, verDetalleTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const tecnico = await pool.query(
      `SELECT u.id, u.correo_electronico, u.curp, u.nombre_completo, u.telefono, u.activo, u.debe_cambiar_contrasena, u.ultimo_login, u.creado_en,
              ${CAMPOS_PROGRAMA}
       FROM usuarios u WHERE u.id = $1 AND u.rol = 'capturista'`,
      [id]
    );
    if (tecnico.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    const registros = await pool.query(
      `SELECT p.productor_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno,
              p.telefono AS telefono, p.estado_id, p.municipio_id, p.estatus_registro, p.fecha_captura,
              COUNT(DISTINCT u.up_id) AS total_ups, COUNT(DISTINCT c.ciclo_id) AS total_ciclos
       FROM productor p
       LEFT JOIN up u ON u.productor_id = p.productor_id AND ${parcelaDeMaiz('u')}
       LEFT JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'maiz'
       WHERE p.usuario_capturista_id = $1 AND ${soloMaiz('p')}
       GROUP BY p.productor_id
       ORDER BY p.fecha_captura DESC`,
      [id]
    );

    const registrosFrijol = await pool.query(
      `SELECT p.productor_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, p.telefono AS telefono,
              pp.verificacion_identidad, pp.estatus_registro, pp.fecha_alta
       FROM productor_programa pp
       JOIN productor p ON p.productor_id = pp.productor_id
       WHERE pp.programa = '${PROGRAMA_FRIJOL}' AND pp.usuario_capturista_id = $1
       ORDER BY pp.fecha_alta DESC`,
      [id]
    );

    res.json({ tecnico: tecnico.rows[0], registros: registros.rows, registros_frijol: registrosFrijol.rows });
  } catch (error) {
    console.error('Error al obtener detalle de técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/admin/tecnicos/:id
// Edita nombre, correo, teléfono, activo, tipo de técnico, programas (reemplaza la lista) y zona (reemplaza la lista).
// No edita la CURP ni la contraseña. Quitar un programa NO borra ni reasigna sus registros: solo le impide registrar nuevos.
// =============================================
router.patch('/:id', authMiddleware, editarTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nombre_completo, email, activo, telefono, tipo_tecnico, programas, zona } = req.body || {};

    const errorValidacion = await validarTecnico({ nombre_completo, email, telefono, tipo_tecnico, programas, zona }, true);
    if (errorValidacion) { res.status(400).json({ error: errorValidacion }); return; }

    const existe = await client.query(`SELECT id FROM usuarios WHERE id = $1 AND rol = 'capturista'`, [id]);
    if (existe.rows.length === 0) { res.status(404).json({ error: 'Técnico no encontrado' }); return; }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (nombre_completo !== undefined) { sets.push(`nombre_completo = $${idx++}`); vals.push(String(nombre_completo).trim()); }
    if (email !== undefined) {
      const emailLower = String(email).toLowerCase().trim();
      const colision = await client.query('SELECT id FROM usuarios WHERE LOWER(correo_electronico) = $1 AND id != $2', [emailLower, id]);
      if (colision.rows.length > 0) { res.status(409).json({ error: 'Ese correo ya está en uso por otro usuario' }); return; }
      sets.push(`correo_electronico = $${idx++}`); vals.push(emailLower);
    }
    if (telefono !== undefined) { sets.push(`telefono = $${idx++}`); vals.push(String(telefono).trim()); }
    if (activo !== undefined) { sets.push(`activo = $${idx++}`); vals.push(!!activo); }
    if (tipo_tecnico !== undefined) { sets.push(`tipo_tecnico = $${idx++}`); vals.push(tipo_tecnico); }

    if (sets.length === 0 && programas === undefined && zona === undefined) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    await client.query('BEGIN');
    if (sets.length > 0) {
      vals.push(id);
      await client.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${idx} AND rol = 'capturista'`, vals);
    }
    await guardarProgramasYZona(client, Number(id), programas, zona);
    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT u.id, u.correo_electronico, u.curp, u.nombre_completo, u.telefono, u.activo, u.debe_cambiar_contrasena, u.ultimo_login, u.creado_en,
              ${CAMPOS_PROGRAMA}
       FROM usuarios u WHERE u.id = $1`,
      [id]
    );
    res.json({ tecnico: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ese correo ya está en uso' });
      return;
    }
    console.error('Error al editar técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// POST /api/admin/tecnicos/:id/reset-password
// Genera una contraseña temporal, la devuelve en texto plano UNA sola vez.
// =============================================
router.post('/:id/reset-password', authMiddleware, editarTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const passTemporal = passTemporalTecnico();
    const hash = await bcrypt.hash(passTemporal, 12);

    const result = await pool.query(
      `UPDATE usuarios SET hash_contrasena = $1, debe_cambiar_contrasena = true
       WHERE id = $2 AND rol = 'capturista'
       RETURNING id, nombre_completo, correo_electronico`,
      [hash, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    res.json({
      tecnico: result.rows[0],
      password_temporal: passTemporal, // solo se devuelve UNA vez
    });
  } catch (error) {
    console.error('Error al resetear contraseña de técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// DELETE /api/admin/tecnicos/:id
// Elimina la cuenta del técnico. Sus productores capturados NO se borran ni se dan de baja: solo se libera
// usuario_capturista_id. Si el técnico es el único dueño de productores sin cuenta propia (todos los de frijol y
// los registros alternos), la base lo impide (chk_producer_tiene_dueno): en ese caso se pide desactivarlo.
// =============================================
router.delete('/:id', authMiddleware, eliminarTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const tecnico = await client.query(
      `SELECT id, nombre_completo FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
      [id]
    );
    if (tecnico.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    const huerfanos = await client.query(
      'SELECT COUNT(*)::int AS n FROM productor WHERE usuario_capturista_id = $1 AND usuario_id IS NULL',
      [id]
    );
    if (huerfanos.rows[0].n > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({
        error: `Este técnico es responsable de ${huerfanos.rows[0].n} productor(es) sin cuenta propia, así que no se puede eliminar. Desactívalo en su lugar para que ya no pueda entrar.`,
        codigo: 'TECNICO_CON_REGISTROS',
      });
      return;
    }

    await client.query('UPDATE productor SET usuario_capturista_id = NULL WHERE usuario_capturista_id = $1', [id]);
    await client.query('UPDATE productor_programa SET usuario_capturista_id = NULL WHERE usuario_capturista_id = $1', [id]);
    await client.query('DELETE FROM usuarios WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ mensaje: `Técnico '${tecnico.rows[0].nombre_completo}' eliminado. Sus registros capturados se conservan.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
