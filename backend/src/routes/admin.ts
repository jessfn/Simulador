import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Middleware: solo admin
function soloAdmin(req: AuthRequest, res: Response, next: Function): void {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
    return;
  }
  next();
}

/** Devuelve true si el usuario puede acceder al panel (admin, responsable o OREF) */
function esPanelAdmin(u: AuthRequest['user']): boolean {
  return u?.rol === 'admin' || u?.rol === 'responsable' ||
    (u?.rol === 'user' && u?.es_panel_usuario === true);
}

/** Retorna el valor de estado_asignado (puede ser "EST1,EST2" o null) para OREF;
 *  null significa sin filtro (admin/responsable ven todo). */
function getEstadoFiltro(u: AuthRequest['user']): string | null {
  if (u?.rol === 'admin' || u?.rol === 'responsable') return null;
  const v = u?.estado_asignado;
  return v && v.trim() ? v.trim() : null;
}

/** Construye la cláusula SQL y params para filtrar por estado(s).
 *  estadoVal puede ser "EST1" o "EST1,EST2" — usa ANY(string_to_array).
 *  startIdx: índice del primer parámetro ($N).
 *  colExpr: expresión SQL de la columna, ej: "UPPER(b.estado)".
 */
function estadoWhereClause(
  estadoVal: string | null,
  startIdx: number,
  colExpr = 'estado'
): { sql: string; params: string[]; nextIdx: number } {
  if (!estadoVal) return { sql: '', params: [], nextIdx: startIdx };
  return {
    sql: `AND ${colExpr} = ANY(string_to_array($${startIdx}, ','))`,
    params: [estadoVal],
    nextIdx: startIdx + 1,
  };
}

// =============================================
// POST /api/admin/registro-admin
// Registro de nuevo admin con código de acceso corporativo
// =============================================
router.post('/registro-admin', async (req: any, res: Response): Promise<void> => {
  try {
    const { nombre_completo, email, password, codigo_acceso } = req.body;

    if (!nombre_completo || !email || !password || !codigo_acceso) {
      res.status(400).json({ error: 'Todos los campos son obligatorios' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }

    // Verificar código de acceso corporativo (almacenado en env o en tabla configuracion)
    const CODIGO_ADMIN = process.env.ADMIN_REGISTRO_CODIGO;
    if (!CODIGO_ADMIN) {
      throw new Error('FATAL: ADMIN_REGISTRO_CODIGO no definida en variables de entorno.');
    }
    if (codigo_acceso.trim().toUpperCase() !== CODIGO_ADMIN.toUpperCase()) {
      res.status(403).json({ error: 'Código de acceso corporativo incorrecto' });
      return;
    }

    const emailLower = email.toLowerCase().trim();
    const nombreNorm = nombre_completo.trim();

    // Verificar si ya existe
    const existente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [emailLower]);
    if (existente.rows.length > 0) {
      res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO usuarios (email, nombre_completo, password_hash, rol, activo)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id, email, nombre_completo, rol`,
      [emailLower, nombreNorm, passwordHash]
    );

    res.status(201).json({
      message: 'Cuenta administrativa creada exitosamente',
      usuario: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error al registrar admin:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// =============================================
// GET /api/admin/usuarios
// Devuelve todos los productores con su estado_validacion, UP y datos del productor
// =============================================
router.get('/usuarios', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { estado_validacion, estado, q, tipo_registro, rol } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    // Forzar filtro de estado para usuarios OREF (puede ser multi-estado)
    const estadoForzado = getEstadoFiltro(req.user);
    const estadoEfectivo = estadoForzado ?? (estado as string | undefined) ?? null;
    if (estadoEfectivo) {
      conditions.push(`first_up.state_name = ANY(string_to_array($${idx++}, ','))`);
      params.push(estadoEfectivo);
    }

    if (estado_validacion) { conditions.push(`p.estado_validacion = $${idx++}`); params.push(estado_validacion); }
    if (tipo_registro) { conditions.push(`p.tipo_registro = $${idx++}`); params.push(tipo_registro); }
    if (rol) { conditions.push(`u.rol = $${idx++}`); params.push(rol); }
    if (q) {
      conditions.push(`(p.nombres ILIKE $${idx} OR p.apellido_paterno ILIKE $${idx} OR p.curp ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        p.producer_id AS id,
        p.nombres,
        p.apellido_paterno,
        p.apellido_materno,
        p.curp,
        p.phone AS telefono,
        p.correo,
        p.estado_validacion,
        p.tipo_registro,
        p.created_at AS fecha_registro,
        p.programas_beneficiario,
        p.nota_admin,
        first_up.state_name AS estado_up,
        first_up.municipality_name AS municipio_up,
        first_up.up_name AS nombre_up,
        first_up.area_ha_calc AS superficie_ha,
        u.rol AS rol_sistema
      FROM producer p
      LEFT JOIN LATERAL (
        SELECT up_id, state_name, municipality_name, up_name, area_ha_calc
        FROM up
        WHERE up.producer_id = p.producer_id
        ORDER BY up.created_at ASC
        LIMIT 1
      ) first_up ON TRUE
      LEFT JOIN usuarios u ON u.curp = p.curp
      ${where}
      ORDER BY p.created_at DESC
    `, params);
    res.json({ usuarios: result.rows, productores: result.rows });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/usuarios/estados-disponibles
// =============================================
router.get('/usuarios/estados-disponibles', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT up.state_name AS estado
      FROM producer p
      JOIN up ON up.producer_id = p.producer_id
      WHERE up.state_name IS NOT NULL
        AND up.state_name != ''
      ORDER BY estado ASC
    `);
    res.json({ 
      estados: result.rows.map(r => r.estado) 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estados' });
  }
});


// =============================================
// PATCH /api/admin/usuarios/:id/rol
// =============================================
router.patch('/usuarios/:id/rol', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rol } = req.body;

    const rolesValidos = ['productor', 'supervisor', 'bodeguero', 'responsable', 'admin'];
    if (!rolesValidos.includes(rol)) {
      res.status(400).json({ error: 'Rol inválido' });
      return;
    }

    const result = await pool.query(
      'UPDATE usuarios SET rol = $1 WHERE id = $2 RETURNING id, nombre_completo, email, rol, activo',
      [rol, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json({ message: 'Rol actualizado correctamente', usuario: result.rows[0] });
  } catch (error) {
    console.error('Error al cambiar rol:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/admin/usuarios/:id/estatus
// Maneja tanto activo (usuarios) como estado_validacion (productores)
// =============================================
router.patch('/usuarios/:id/estatus', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
    return;
  }
  try {
    const { id } = req.params;
    const { activo, estado_validacion, nota } = req.body;

    // Si viene estado_validacion, actualizar en tabla producer (aprobar/rechazar productor)
    if (estado_validacion !== undefined) {
      // Persistir nota_admin si viene en el body
      const result = await pool.query(
        `UPDATE producer
         SET estado_validacion = $1,
             nota_admin = CASE WHEN $3::text IS NOT NULL AND $3 != '' THEN $3::text ELSE nota_admin END
         WHERE producer_id = $2
         RETURNING producer_id AS id, nombres, apellido_paterno, estado_validacion, nota_admin`,
        [estado_validacion, id, nota || null]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Productor no encontrado' });
        return;
      }
      res.json({ message: `Productor ${estado_validacion}`, productor: result.rows[0] });
      return;
    }

    // Si viene activo, actualizar en tabla usuarios
    if (typeof activo !== 'boolean') {
      res.status(400).json({ error: 'Debe enviar activo (boolean) o estado_validacion (string)' });
      return;
    }

    const result = await pool.query(
      'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, nombre_completo, email, rol, activo',
      [activo, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json({ message: `Usuario ${activo ? 'activado' : 'desactivado'} correctamente`, usuario: result.rows[0] });
  } catch (error) {
    console.error('Error al cambiar estatus:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// =============================================
// GET /api/admin/bodegas-pendientes
// =============================================
router.get('/bodegas-pendientes', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { sql: wSql, params } = estadoWhereClause(getEstadoFiltro(req.user), 1, 'UPPER(b.estado)');
    const result = await pool.query(`
      SELECT b.*, r.nombre as region_nombre,
             u.nombre_completo as creado_por_nombre
      FROM bodegas b
      LEFT JOIN regiones r ON b.region_id = r.id
      LEFT JOIN usuarios u ON b.creado_por = u.id
      WHERE b.estatus = 'pendiente' ${wSql}
      ORDER BY b.fecha_creacion DESC
    `, params);
    res.json({ bodegas: result.rows });
  } catch (error) {
    console.error('Error al obtener bodegas pendientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/solicitudes-bodega
// Solicitudes de asociación bodeguero↔bodega pendientes de aprobación
// =============================================
router.get('/solicitudes-bodega', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { sql: wSql, params } = estadoWhereClause(getEstadoFiltro(req.user), 1, 'UPPER(b.estado)');
    const { rows } = await pool.query(`
      SELECT
        bb.id, bb.estatus, bb.fecha_solicitud,
        u.id          AS usuario_id,
        u.nombre_completo, u.email, u.telefono, u.rol,
        b.id          AS bodega_id,
        b.nombre      AS bodega_nombre,
        b.estado      AS bodega_estado,
        b.municipio   AS bodega_municipio,
        b.estatus     AS bodega_estatus,
        b.capacidad_ton
      FROM bodeguero_bodegas bb
      JOIN usuarios u ON u.id = bb.usuario_id
      JOIN bodegas  b ON b.id = bb.bodega_id
      WHERE bb.estatus = 'pendiente' ${wSql}
      ORDER BY bb.fecha_solicitud DESC
    `, params);
    res.json({ solicitudes: rows, total: rows.length });
  } catch (error) {
    console.error('Error solicitudes-bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/admin/solicitudes-bodega/:id/aprobar
router.patch('/solicitudes-bodega/:id/aprobar', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE bodeguero_bodegas
       SET estatus = 'aprobada', fecha_aprobacion = NOW(), aprobado_por = $2
       WHERE id = $1`,
      [id, req.user!.userId]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error aprobar solicitud:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/admin/solicitudes-bodega/:id/rechazar
router.patch('/solicitudes-bodega/:id/rechazar', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE bodeguero_bodegas SET estatus = 'rechazada' WHERE id = $1`,
      [id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error rechazar solicitud:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/admin/crear-usuario
// =============================================
router.post('/crear-usuario', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, curp, nombre_completo, password, telefono, rol } = req.body;

    if (!email || !curp || !nombre_completo || !password || !telefono || !rol) {
      res.status(400).json({ error: 'Todos los campos son obligatorios' });
      return;
    }

    const rolesValidos = ['productor', 'supervisor', 'bodeguero', 'responsable', 'admin'];
    if (!rolesValidos.includes(rol)) {
      res.status(400).json({ error: 'Rol no válido' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }

    const curpUpper = curp.toUpperCase().trim();
    const emailLower = email.toLowerCase().trim();

    const existente = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1 OR curp = $2',
      [emailLower, curpUpper]
    );
    if (existente.rows.length > 0) {
      res.status(409).json({ error: 'Ya existe un usuario con ese email o CURP' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const nombreNorm = nombre_completo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

    const result = await pool.query(
      `INSERT INTO usuarios (email, curp, nombre_completo, password_hash, telefono, rol, activo)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, email, curp, nombre_completo, telefono, rol, activo, created_at as fecha_registro`,
      [emailLower, curpUpper, nombreNorm, passwordHash, telefono.replace(/[\s\-\(\)]/g, ''), rol]
    );

    res.status(201).json({ message: 'Usuario creado exitosamente', usuario: result.rows[0] });
  } catch (error: any) {
    console.error('Error al crear usuario:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ya existe un usuario con ese email o CURP' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PUT /api/admin/usuarios/:id - Edit user
// =============================================
router.put('/usuarios/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, curp, telefono } = req.body;

    if (!nombre_completo && !email && !curp && !telefono) {
      res.status(400).json({ error: 'Debe enviar al menos un campo para actualizar' });
      return;
    }

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (nombre_completo) { sets.push(`nombre_completo = $${idx++}`); params.push(nombre_completo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()); }
    if (email) { sets.push(`email = $${idx++}`); params.push(email.toLowerCase().trim()); }
    if (curp) { sets.push(`curp = $${idx++}`); params.push(curp.toUpperCase().trim()); }
    if (telefono) { sets.push(`telefono = $${idx++}`); params.push(telefono.replace(/\D/g, '')); }

    params.push(id);
    const result = await pool.query(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, nombre_completo, email, curp, telefono, rol, activo, created_at as fecha_registro`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json({ message: 'Usuario actualizado correctamente', usuario: result.rows[0] });
  } catch (error: any) {
    console.error('Error al editar usuario:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ya existe un usuario con ese email o CURP' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// DELETE /api/admin/usuarios/:id
// =============================================
router.delete('/usuarios/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (Number(id) === req.user!.userId) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
      return;
    }

    const result = await pool.query(
      'DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre_completo',
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json({ message: `Usuario "${result.rows[0].nombre_completo}" eliminado correctamente` });
  } catch (error: any) {
    console.error('Error al eliminar usuario:', error);
    if (error.code === '23503') {
      res.status(409).json({ error: 'No se puede eliminar: el usuario tiene registros asociados. Desactívalo en su lugar.' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// =============================================
// DELETE /api/admin/productores/:producer_id — Eliminar productor completo (cascade)
// Orden: disponibilidad_productor → cycle_crop → cycle → up → producer → usuario
// =============================================
router.delete('/productores/:producer_id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { producer_id } = req.params;

    // Obtener datos del productor + usuario vinculado
    const prodRow = await client.query(
      `SELECT p.producer_id, p.usuario_id, p.nombres, p.apellido_paterno, p.apellido_materno
       FROM producer p WHERE p.producer_id = $1`,
      [producer_id]
    );
    if (prodRow.rows.length === 0) {
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }
    const prod = prodRow.rows[0];
    const nombreCompleto = [prod.nombres, prod.apellido_paterno, prod.apellido_materno].filter(Boolean).join(' ');

    await client.query('BEGIN');

    // 1. Disponibilidades del productor
    await client.query(
      `DELETE FROM disponibilidad_productor
       WHERE producer_id = $1`,
      [producer_id]
    );

    // 2. Cycle_crops de todos los ciclos de las UPs del productor
    await client.query(
      `DELETE FROM cycle_crop
       WHERE cycle_id IN (
         SELECT c.cycle_id FROM cycle c
         JOIN up u ON u.up_id = c.up_id
         WHERE u.producer_id = $1
       )`,
      [producer_id]
    );

    // 3. Ciclos de las UPs del productor
    await client.query(
      `DELETE FROM cycle
       WHERE up_id IN (SELECT up_id FROM up WHERE producer_id = $1)`,
      [producer_id]
    );

    // 4. UPs del productor
    await client.query('DELETE FROM up WHERE producer_id = $1', [producer_id]);

    // 5. Registro de productor
    await client.query('DELETE FROM producer WHERE producer_id = $1', [producer_id]);

    // 6. Usuario vinculado (si existe)
    if (prod.usuario_id) {
      await client.query('DELETE FROM usuarios WHERE id = $1', [prod.usuario_id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: `Productor "${nombreCompleto}" eliminado correctamente` });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al eliminar productor:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar productor' });
  } finally {
    client.release();
  }
});


// =============================================
// GET /api/admin/usuarios/:id — Detalle de un productor
// =============================================
router.get('/usuarios/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        p.producer_id AS id,
        p.nombres,
        p.apellido_paterno,
        p.apellido_materno,
        p.curp,
        p.phone AS telefono,
        p.correo,
        p.estado_validacion,
        p.tipo_registro,
        p.created_at AS fecha_registro,
        p.programas_beneficiario,
        up.up_id,
        up.state_name AS estado_up,
        up.municipality_name AS municipio_up,
        up.up_name AS nombre_up,
        up.area_ha_calc AS superficie_ha,
        ST_Y(up.centroid::geometry) AS lat,
        ST_X(up.centroid::geometry) AS lng,
        up.posible_traslape_producer_id,
        up.traslape_revisado,
        ciclo.ciclo_activo,
        ciclo.cultivo_principal,
        ciclo.variedad,
        pt.nombres AS traslape_productor_nombre,
        pt.apellido_paterno AS traslape_productor_apellido,
        (
          SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'up_id', u.up_id,
              'up_name', u.up_name,
              'state_name', u.state_name,
              'municipality_name', u.municipality_name,
              'area_ha_calc', u.area_ha_calc,
              'created_at', u.created_at,
              'geom_geojson', ST_AsGeoJSON(u.geom)::json,
              'centroid_lat', ST_Y(u.centroid::geometry),
              'centroid_lng', ST_X(u.centroid::geometry)
            ) ORDER BY u.created_at ASC
          )
          FROM up u
          WHERE u.producer_id = p.producer_id AND u.geom IS NOT NULL
        ) AS ups_geom
      FROM producer p
      LEFT JOIN LATERAL (
        SELECT up_id, state_name, municipality_name, up_name, area_ha_calc, centroid,
               posible_traslape_producer_id, traslape_revisado
        FROM up WHERE up.producer_id = p.producer_id
        ORDER BY created_at ASC LIMIT 1
      ) up ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          CONCAT(c.cycle_type, ' ', c.cycle_year) AS ciclo_activo,
          CASE cc.crop WHEN 'maiz' THEN 'Maíz' WHEN 'frijol' THEN 'Frijol' ELSE INITCAP(cc.crop) END AS cultivo_principal,
          COALESCE(cv.label, cc.variety_id, '') AS variedad
        FROM cycle c
        LEFT JOIN cycle_crop cc ON cc.cycle_id = c.cycle_id
        LEFT JOIN cat_crop_variety cv ON cv.code = cc.variety_id AND cv.is_active = TRUE
        WHERE c.up_id = up.up_id
        ORDER BY c.cycle_year DESC, c.cycle_id DESC
        LIMIT 1
      ) ciclo ON TRUE
      LEFT JOIN producer pt ON pt.producer_id = up.posible_traslape_producer_id
      WHERE p.producer_id = $1
    `, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }
    res.json({ productor: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/productor-disponibilidades/:producer_id
// =============================================
router.get('/productor-disponibilidades/:producer_id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { producer_id } = req.params;
    const result = await pool.query(
      `SELECT
         dp.id,
         dp.producer_id,
         dp.up_id,
         dp.activa,
         dp.created_at,
         COALESCE(dp.volumen_estimado_ton, 0)::numeric AS volumen_toneladas,
         COALESCE(dp.tipo_maiz, 'Maíz Blanco') AS tipo_maiz,
         COALESCE(cv.label, dp.variedad_code, dp.variedad_libre, '') AS variedad,
         u.state_name AS estado,
         u.municipality_name AS municipio
       FROM disponibilidad_productor dp
       LEFT JOIN up u ON u.up_id = dp.up_id
       LEFT JOIN cat_crop_variety cv ON cv.code = dp.variedad_code AND cv.is_active = TRUE
       WHERE dp.producer_id = $1
       ORDER BY dp.created_at DESC`,
      [producer_id]
    );
    res.json({ disponibilidades: result.rows });
  } catch (error) {
    console.error('Error al obtener disponibilidades del productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/admin/ups/:up_id/marcar-traslape-revisado
// =============================================
router.patch('/ups/:up_id/marcar-traslape-revisado', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { up_id } = req.params;
    await pool.query(
      `UPDATE up SET traslape_revisado = true WHERE up_id = $1`,
      [up_id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marcando traslape revisado:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/actividad-reciente
// =============================================
router.get('/actividad-reciente', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const u = req.user!;
  const esPanelAdmin = u.rol === 'admin' || u.rol === 'responsable' ||
    (u.rol === 'user' && u.es_panel_usuario === true);
  if (!esPanelAdmin) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const estado = (u.rol === 'admin' || u.rol === 'responsable') ? null : (u.estado_asignado ?? null);
    const ep = estado ? [estado] : [];
    const whereEstadoP = estado ? `WHERE p.state_name = $1` : '';

    const productoresR = pool.query(`
      SELECT
        'validacion' AS tipo,
        CONCAT(p.nombres, ' ', p.apellido_paterno, ' (Tipo ', COALESCE(p.tipo_registro, 'B'), ') registrado') AS descripcion,
        'Sistema' AS actor,
        p.created_at AS fecha,
        CONCAT('/admin/productores/', p.producer_id) AS link
      FROM producer p
      ${whereEstadoP}
      ORDER BY p.created_at DESC
      LIMIT 10
    `, ep);

    const alertasR = pool.query(`
      SELECT
        'alerta' AS tipo,
        COALESCE(a.descripcion, a.tipo_alerta) AS descripcion,
        'Sistema' AS actor,
        a.fecha_alerta AS fecha,
        '/admin/alertas' AS link
      FROM alertas a
      ${estado ? `JOIN up u2 ON u2.up_id = a.up_id AND u2.state_name = $1` : ''}
      ORDER BY a.fecha_alerta DESC
      LIMIT 10
    `, ep).catch(() => ({ rows: [] as any[] }));

    const [prod, alert] = await Promise.all([productoresR, alertasR]);
    const eventos = [...prod.rows, ...(alert as any).rows]
      .sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 20);

    res.json({ eventos });
  } catch (error) {
    console.error('Error actividad-reciente:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/ventanillas/resumen
// Tabla resumen de ventanillas con apoyos solicitados y atendidos
// =============================================
router.get('/ventanillas/resumen', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (req.user?.rol !== 'admin' && req.user?.rol !== 'responsable') {
    res.status(403).json({ error: 'Acceso denegado' });
    return;
  }
  try {
    const result = await pool.query(`
      SELECT
        v.id AS ventanilla_id,
        b.nombre AS bodega_nombre,
        b.estado AS bodega_estado,
        v.tipo,
        v.nombre_enlace_agricultura,
        v.telefono_enlace,
        v.correo_enlace,
        COUNT(sa.id) AS apoyos_solicitados,
        COUNT(sa.id) FILTER (WHERE sa.estado IN ('canalizada', 'cerrada')) AS apoyos_atendidos
      FROM ventanillas v
      JOIN bodegas b ON v.bodega_id = b.id
      LEFT JOIN solicitudes_apoyo sa ON sa.ventanilla_id = v.id
      GROUP BY v.id, b.nombre, b.estado, v.tipo, v.nombre_enlace_agricultura, v.telefono_enlace, v.correo_enlace
      ORDER BY b.estado, b.nombre
    `);
    res.json({ ventanillas: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('Error GET /admin/ventanillas/resumen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/bodegas/estadisticas
// =============================================
router.get('/bodegas/estadisticas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req.user)) { res.status(403).json({ error: 'Acceso denegado' }); return; }
  try {
    const { sql: wSql, params } = estadoWhereClause(getEstadoFiltro(req.user), 1, 'UPPER(b.estado)');
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(b.capacidad_ton), 0) AS capacidad_total,
        COALESCE(SUM(CASE WHEN i.vol IS NOT NULL THEN i.vol ELSE 0 END), 0) AS stock_total,
        ROUND((COALESCE(SUM(CASE WHEN i.vol IS NOT NULL THEN i.vol ELSE 0 END) * 100.0 / NULLIF(SUM(b.capacidad_ton), 0), 0))::numeric, 1) AS pct_ocupacion,
        COUNT(DISTINCT ts.bodega_id) AS con_tarifario,
        COUNT(DISTINCT v.id) AS ventanillas_activas
      FROM bodegas b
      LEFT JOIN LATERAL (
        SELECT volumen_almacenamiento AS vol FROM inventarios WHERE bodega_id = b.id ORDER BY fecha_registro DESC LIMIT 1
      ) i ON true
      LEFT JOIN tarifario_servicios ts ON ts.bodega_id = b.id AND ts.activo = true
      LEFT JOIN ventanillas v ON v.bodega_id = b.id AND v.estatus = 'activa'
      WHERE b.activo = true ${wSql}
    `, params);
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Error estadísticas bodegas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de bodegas' });
  }
});

// =============================================
// GET /api/admin/avisos-privacidad
// Avisos unificados: productores + usuarios (bodegueros/industria)
// ?tipo=productor|usuario|all  &q=  &limit=  &offset=
// =============================================
router.get('/avisos-privacidad', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q      = (req.query.q as string) || '';
    const tipo   = (req.query.tipo as string) || 'all';
    const limite = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = parseInt(req.query.offset as string) || 0;
    const like   = `%${q.trim()}%`;

    // ── Productores ──────────────────────────────────────────
    const sqlProd = `
      SELECT
        'productor'                         AS tipo,
        p.producer_id::text                 AS id,
        p.curp,
        CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno) AS nombre,
        p.phone                             AS telefono,
        p.aviso_privacidad_aceptado,
        p.aviso_privacidad_fecha,
        p.aviso_privacidad_lat,
        p.aviso_privacidad_lng,
        p.aviso_privacidad_version,
        p.aviso_privacidad_foto_url,
        p.estado_validacion,
        p.created_at
      FROM producer p
      WHERE p.aviso_privacidad_aceptado = TRUE
        AND (p.curp ILIKE $1 OR p.nombres ILIKE $1 OR p.apellido_paterno ILIKE $1 OR p.apellido_materno ILIKE $1)`;

    // ── Usuarios bodegueros/industria ─────────────────────────
    const sqlUser = `
      SELECT
        COALESCE(u.rol, 'bodeguero')        AS tipo,
        u.id::text                          AS id,
        u.curp,
        u.nombre_completo                   AS nombre,
        u.telefono,
        u.aviso_privacidad_aceptado,
        u.aviso_privacidad_fecha,
        u.aviso_privacidad_lat,
        u.aviso_privacidad_lng,
        u.aviso_privacidad_version,
        u.aviso_privacidad_foto_url,
        'activo'                            AS estado_validacion,
        u.created_at
      FROM usuarios u
      WHERE u.aviso_privacidad_aceptado = TRUE
        AND u.rol IN ('bodeguero','bodega','industria')
        AND (u.curp ILIKE $1 OR u.nombre_completo ILIKE $1 OR u.telefono ILIKE $1)`;

    let unionSQL: string;
    if (tipo === 'productor')  unionSQL = sqlProd;
    else if (tipo === 'usuario') unionSQL = sqlUser;
    else unionSQL = `${sqlProd} UNION ALL ${sqlUser}`;

    // SQL sin filtro de búsqueda — para totales globales siempre fijos
    const sqlProdAll = sqlProd.replace('AND (p.curp ILIKE $1 OR p.nombres ILIKE $1 OR p.apellido_paterno ILIKE $1 OR p.apellido_materno ILIKE $1)', '');
    const sqlUserAll = sqlUser.replace('AND (u.curp ILIKE $1 OR u.nombre_completo ILIKE $1 OR u.telefono ILIKE $1)', '');
    const unionAll   = tipo === 'productor' ? sqlProdAll : tipo === 'usuario' ? sqlUserAll : `${sqlProdAll} UNION ALL ${sqlUserAll}`;

    const dataSQL    = `SELECT * FROM (${unionSQL}) t ORDER BY aviso_privacidad_fecha DESC NULLS LAST LIMIT $2 OFFSET $3`;
    const countSQL   = `SELECT COUNT(*) FROM (${unionSQL}) t`;
    const globalSQL  = `
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE aviso_privacidad_foto_url IS NOT NULL)    AS con_foto,
        COUNT(*) FILTER (WHERE aviso_privacidad_lat IS NOT NULL)         AS con_gps,
        ROUND(AVG(
          (CASE WHEN aviso_privacidad_aceptado   THEN 1 ELSE 0 END +
           CASE WHEN aviso_privacidad_fecha  IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN aviso_privacidad_lat    IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN aviso_privacidad_foto_url IS NOT NULL THEN 1 ELSE 0 END)::numeric / 4 * 100
        ))                                                                AS completitud_media
      FROM (${unionAll}) t`;

    const [{ rows }, { rows: cnt }, { rows: glob }] = await Promise.all([
      pool.query(dataSQL,   [like, limite, offset]),
      pool.query(countSQL,  [like]),
      pool.query(globalSQL, []),
    ]);

    const g = glob[0];
    res.json({
      avisos:            rows,
      total:             parseInt(cnt[0].count),
      total_global:      parseInt(g.total),
      con_foto:          parseInt(g.con_foto),
      con_gps:           parseInt(g.con_gps),
      completitud_media: parseInt(g.completitud_media ?? '0'),
    });
  } catch (error) {
    console.error('Error avisos privacidad:', error);
    res.status(500).json({ error: 'Error al obtener avisos de privacidad' });
  }
});

// =============================================
// PATCH /api/admin/bodegas/:id — Edición completa de bodega por admin
// =============================================
router.patch('/bodegas/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, estado, municipio, localidad, direccion, telefono, capacidad_ton, estatus, latitud, longitud } = req.body;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (nombre      !== undefined) { sets.push(`nombre = $${idx++}`);       params.push(nombre); }
    if (estado      !== undefined) { sets.push(`estado = $${idx++}`);       params.push(estado); }
    if (municipio   !== undefined) { sets.push(`municipio = $${idx++}`);    params.push(municipio); }
    if (localidad   !== undefined) { sets.push(`localidad = $${idx++}`);    params.push(localidad); }
    if (direccion   !== undefined) { sets.push(`direccion = $${idx++}`);    params.push(direccion); }
    if (telefono    !== undefined) { sets.push(`telefono = $${idx++}`);     params.push(telefono); }
    if (capacidad_ton !== undefined) { sets.push(`capacidad_ton = $${idx++}`); params.push(Number(capacidad_ton)); }
    if (estatus     !== undefined) { sets.push(`estatus = $${idx++}`);      params.push(estatus); }
    if (latitud     !== undefined) { sets.push(`latitud = $${idx++}`);      params.push(Number(latitud)); }
    if (longitud    !== undefined) { sets.push(`longitud = $${idx++}`);     params.push(Number(longitud)); }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE bodegas SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }

    res.json({ ok: true, bodega: result.rows[0] });
  } catch (error: any) {
    console.error('Error al editar bodega (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/admin/bodegas/:id — Eliminar bodega con cascade completo
router.delete('/bodegas/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar que existe
    const check = await client.query('SELECT id, nombre FROM bodegas WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }
    const nombre = check.rows[0].nombre;

    // Cascade manual (sin FK constraints en esta DB)
    await client.query('DELETE FROM senales_compra       WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM oferta_interes       WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM precios              WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM inventarios          WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM tarifario_servicios  WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM transacciones        WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM infraestructura_contactos WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM ventanillas          WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM bodeguero_bodegas    WHERE bodega_id = $1', [id]);
    await client.query('DELETE FROM bodegas              WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ ok: true, message: `Bodega "${nombre}" eliminada correctamente` });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar bodega (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────
// RESETS ADMIN
// ─────────────────────────────────────────────────────────────────

// POST /api/admin/reset-nip/:producer_id
// El admin genera un PIN temporal de 4 dígitos para un productor
router.post('/reset-nip/:producer_id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { producer_id } = req.params;

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo FROM producer p JOIN usuarios u ON u.id = p.usuario_id WHERE p.producer_id = $1`,
      [producer_id]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }

    // PIN temporal: 4 dígitos aleatorios (1000–9999 para evitar lideres 0)
    const pinTemporal = String(Math.floor(1000 + Math.random() * 9000));
    const hash = await bcrypt.hash(pinTemporal, 12);

    await pool.query(
      `UPDATE usuarios SET password_hash = $1, pin_texto = $2, reset_pin_forced = TRUE WHERE id = $3`,
      [hash, pinTemporal, rows[0].id]
    );

    res.json({ ok: true, pin_temporal: pinTemporal, nombre: rows[0].nombre_completo });
  } catch (error) {
    console.error('Error en reset-nip:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/productor-nip/:producer_id
// El admin consulta el NIP actual del productor (almacenado en texto plano)
router.get('/productor-nip/:producer_id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { producer_id } = req.params;
    const { rows } = await pool.query(
      `SELECT u.pin_texto FROM producer p JOIN usuarios u ON u.id = p.usuario_id WHERE p.producer_id = $1`,
      [producer_id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Productor no encontrado' }); return; }
    res.json({ pin: rows[0].pin_texto ?? null });
  } catch (error) {
    console.error('Error en productor-nip:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/admin/asignar-nip/:producer_id
// Asigna un NIP nuevo permanente a un productor que no tiene pin_texto (cuenta antigua)
router.post('/asignar-nip/:producer_id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { producer_id } = req.params;
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre_completo FROM producer p JOIN usuarios u ON u.id = p.usuario_id WHERE p.producer_id = $1`,
      [producer_id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Productor no encontrado' }); return; }

    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const hash = await bcrypt.hash(pin, 12);

    await pool.query(
      `UPDATE usuarios SET password_hash = $1, pin_texto = $2 WHERE id = $3`,
      [hash, pin, rows[0].id]
    );

    res.json({ ok: true, pin });
  } catch (error) {
    console.error('Error en asignar-nip:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/admin/reset-password/:usuario_id
// El admin genera un enlace de reset para un usuario de bodega
router.post('/reset-password/:usuario_id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { usuario_id } = req.params;

    const { rows } = await pool.query(
      `SELECT id, nombre_completo, email FROM usuarios WHERE id = $1 AND activo = TRUE`,
      [usuario_id]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas para admin

    await pool.query(
      `UPDATE usuarios SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
      [tokenHash, expires, rows[0].id]
    );

    const appUrl = process.env.APP_URL || 'https://maiz.agricultura.gob.mx';
    const resetUrl = `${appUrl}/reset-password/${token}`;

    res.json({ ok: true, reset_url: resetUrl, nombre: rows[0].nombre_completo, email: rows[0].email });
  } catch (error) {
    console.error('Error en reset-password admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────
// USUARIOS BODEGA
// ─────────────────────────────────────────────────────────────────

// GET /api/admin/usuarios-bodega
router.get('/usuarios-bodega', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const q    = (req.query.q as string) || '';
    const like = `%${q.trim()}%`;
    const { rows } = await pool.query(`
      SELECT
        u.id, u.nombre_completo, u.email, u.telefono, u.rol,
        u.activo, u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'bodega_id',       b.id,
              'bodega_nombre',   b.nombre,
              'bodega_estado',   b.estado,
              'bodega_municipio',b.municipio,
              'bodega_estatus',  b.estatus,
              'asociacion_estatus', bb.estatus
            ) ORDER BY b.nombre
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'
        ) AS bodegas
      FROM usuarios u
      LEFT JOIN bodeguero_bodegas bb ON bb.usuario_id = u.id
      LEFT JOIN bodegas b ON b.id = bb.bodega_id
      WHERE u.rol IN ('bodeguero','bodega','industria','admin')
        AND ($1 = '%%' OR u.nombre_completo ILIKE $1 OR u.email ILIKE $1 OR u.telefono ILIKE $1)
      GROUP BY u.id, u.nombre_completo, u.email, u.telefono, u.rol, u.activo, u.created_at
      ORDER BY u.created_at DESC
    `, [like]);
    res.json({ usuarios: rows, total: rows.length });
  } catch (error) {
    console.error('Error usuarios-bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/usuarios-bodega/:id
router.get('/usuarios-bodega/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT
        u.id, u.nombre_completo, u.email, u.telefono, u.rol, u.activo, u.curp, u.created_at,
        u.aviso_privacidad_aceptado, u.aviso_privacidad_fecha,
        b.id AS bodega_id, b.nombre AS bodega_nombre,
        b.estado AS bodega_estado, b.municipio AS bodega_municipio,
        b.localidad AS bodega_localidad, b.direccion AS bodega_direccion,
        b.capacidad_ton, b.estatus AS bodega_estatus,
        b.telefono AS bodega_telefono
      FROM usuarios u
      LEFT JOIN bodeguero_bodegas bb ON bb.usuario_id = u.id
      LEFT JOIN bodegas b ON b.id = bb.bodega_id
      WHERE u.id = $1
    `, [id]);
    if (!rows.length) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error usuario-bodega detalle:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/admin/usuarios-bodega/:id
router.patch('/usuarios-bodega/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, telefono, activo, password } = req.body;
    const sets: string[] = [];
    const vals: any[]   = [];
    let   idx = 1;
    if (nombre_completo !== undefined) { sets.push(`nombre_completo=$${idx++}`); vals.push(nombre_completo); }
    if (email           !== undefined) { sets.push(`email=$${idx++}`);           vals.push(email); }
    if (telefono        !== undefined) { sets.push(`telefono=$${idx++}`);         vals.push(telefono); }
    if (activo          !== undefined) { sets.push(`activo=$${idx++}`);           vals.push(activo); }
    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      sets.push(`password_hash=$${idx++}`); vals.push(passwordHash);
    }
    if (!sets.length) { res.status(400).json({ error: 'Sin campos para actualizar' }); return; }
    sets.push(`updated_at=NOW()`);
    vals.push(id);
    await pool.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id=$${idx}`, vals);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error patch usuario-bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/admin/usuarios-bodega/:id
// Cascade: bodegas del usuario (y sus hijos) → bodeguero_bodegas → usuario
router.delete('/usuarios-bodega/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Bodegas creadas por este usuario
    const bodegasRes = await client.query(
      `SELECT id FROM bodegas WHERE creado_por = $1`,
      [id]
    );
    const bodegaIds = bodegasRes.rows.map((r: any) => r.id);

    // Cascade manual por cada bodega
    for (const bodegaId of bodegaIds) {
      await client.query('DELETE FROM senales_compra       WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM oferta_interes       WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM precios              WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM inventarios          WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM tarifario_servicios  WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM transacciones        WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM infraestructura_contactos WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM ventanillas          WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM bodeguero_bodegas    WHERE bodega_id = $1', [bodegaId]);
      await client.query('DELETE FROM bodegas              WHERE id = $1', [bodegaId]);
    }

    // Desasignar cualquier bodega ajena a la que esté asignado este usuario
    await client.query('DELETE FROM bodeguero_bodegas WHERE usuario_id = $1', [id]);
    await client.query('DELETE FROM usuarios           WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ ok: true, bodegasEliminadas: bodegaIds.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error delete usuario-bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// ─── PARCELAS ────────────────────────────────────────────────────────────────

// GET /api/admin/parcelas/filtros — opciones para dropdowns de filtro
router.get('/parcelas/filtros', authMiddleware, async (_req: import('express').Request, res: Response): Promise<void> => {
  try {
    const { rows: estadosRows } = await pool.query(
      `SELECT DISTINCT state_name FROM up WHERE geom IS NOT NULL AND state_name IS NOT NULL ORDER BY state_name`
    );
    const { rows: municipiosRows } = await pool.query(
      `SELECT DISTINCT state_name, municipality_name FROM up WHERE geom IS NOT NULL AND municipality_name IS NOT NULL ORDER BY state_name, municipality_name`
    );
    res.json({ estados: estadosRows.map((r: any) => r.state_name), municipios: municipiosRows });
  } catch (error) {
    console.error('Error filtros parcelas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/parcelas — todas las UPs con polígono, productor y ciclo
router.get('/parcelas', authMiddleware, async (req: any, res: Response): Promise<void> => {
  try {
    const { estado, municipio, q } = req.query as Record<string, string>;
    const params: any[] = [];
    const conds: string[] = ['u.geom IS NOT NULL'];
    let pi = 1;

    if (estado)    { conds.push(`u.state_name = $${pi++}`);                       params.push(estado); }
    if (municipio) { conds.push(`u.municipality_name = $${pi++}`);                params.push(municipio); }
    if (q)         { conds.push(`(p.nombres ILIKE $${pi} OR p.apellido_paterno ILIKE $${pi++})`); params.push(`%${q}%`); }

    const where = conds.join(' AND ');

    const { rows } = await pool.query(`
      SELECT
        u.up_id,
        u.up_name,
        u.state_name,
        u.municipality_name,
        u.area_ha_calc,
        u.created_at,
        ST_AsGeoJSON(u.geom)::json   AS geom_geojson,
        ST_Y(u.centroid::geometry)   AS centroid_lat,
        ST_X(u.centroid::geometry)   AS centroid_lng,
        p.producer_id,
        p.nombres,
        p.apellido_paterno,
        p.apellido_materno,
        p.curp,
        p.correo,
        p.estado_validacion,
        ciclo.ciclo_activo,
        ciclo.cultivo_principal
      FROM up u
      JOIN producer p ON p.producer_id = u.producer_id
      LEFT JOIN LATERAL (
        SELECT
          CONCAT(c.cycle_type, ' ', c.cycle_year) AS ciclo_activo,
          CASE cc.crop WHEN 'maiz' THEN 'Maíz' WHEN 'frijol' THEN 'Frijol' ELSE INITCAP(cc.crop) END AS cultivo_principal
        FROM cycle c
        LEFT JOIN cycle_crop cc ON cc.cycle_id = c.cycle_id
        WHERE c.up_id = u.up_id
        ORDER BY c.cycle_year DESC, c.cycle_id DESC LIMIT 1
      ) ciclo ON TRUE
      WHERE ${where}
      ORDER BY u.state_name NULLS LAST, u.created_at DESC
    `, params);

    res.json({ parcelas: rows });
  } catch (error) {
    console.error('Error parcelas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/admin/parcelas/:up_id — Eliminar una UP individual
router.delete('/parcelas/:up_id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { up_id } = req.params;

    const check = await client.query('SELECT up_id, up_name FROM up WHERE up_id = $1', [up_id]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Parcela no encontrada' });
      return;
    }
    const upName = check.rows[0].up_name || `UP-${up_id}`;

    await client.query('BEGIN');
    await client.query(`DELETE FROM cycle_crop WHERE cycle_id IN (SELECT cycle_id FROM cycle WHERE up_id = $1)`, [up_id]);
    await client.query(`DELETE FROM cycle WHERE up_id = $1`, [up_id]);
    await client.query(`DELETE FROM disponibilidad_productor WHERE up_id = $1`, [up_id]);
    await client.query(`DELETE FROM up WHERE up_id = $1`, [up_id]);
    await client.query('COMMIT');

    res.json({ ok: true, message: `Parcela "${upName}" eliminada correctamente` });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al eliminar parcela:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar parcela' });
  } finally {
    client.release();
  }
});

export default router;
