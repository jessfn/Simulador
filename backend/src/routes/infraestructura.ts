import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

// Roles que pueden operar bodegas (Reajustes.pdf §13)
const BODEGA_WRITE = requireRole('bodega', 'bodeguero', 'responsable', 'admin');

// =============================================
// GET /api/infraestructura/catalogos
// =============================================
router.get('/catalogos', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [regiones, estados, municipios, tiposMaiz, variedades, ciclos] = await Promise.all([
      pool.query('SELECT id, nombre FROM regiones ORDER BY nombre'),
      pool.query('SELECT DISTINCT estado FROM bodegas WHERE estado IS NOT NULL ORDER BY estado'),
      pool.query('SELECT DISTINCT municipio, estado FROM bodegas WHERE municipio IS NOT NULL ORDER BY municipio'),
      pool.query("SELECT codigo, etiqueta FROM cat_catalogo WHERE catalogo='tipo_maiz' ORDER BY orden"),
      pool.query("SELECT codigo, etiqueta, tipo_maiz FROM cat_variedad_cultivo WHERE cultivo='maiz' AND tipo_maiz IS NOT NULL ORDER BY tipo_maiz, orden"),
      pool.query("SELECT codigo, etiqueta FROM cat_catalogo WHERE catalogo='cycle_type' ORDER BY orden"),
    ]);

    res.json({
      regiones: regiones.rows,
      estados: estados.rows.map((r: any) => r.estado),
      municipios: municipios.rows,
      tipos_maiz: tiposMaiz.rows,
      variedades: variedades.rows,
      ciclos: ciclos.rows,
    });
  } catch (error) {
    console.error('Error al obtener catálogos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/infraestructura - Lista con filtros
// =============================================
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tipo, estado, municipio, q, es_ventanilla, is_ventanilla, lat, lng, radio_km } = req.query;

    const conditions: string[] = ["b.estatus != 'pendiente'"];
    const params: any[] = [];
    let idx = 1;

    if (tipo === 'ventanilla' || es_ventanilla === 'true' || is_ventanilla === 'true') {
      conditions.push(`b.es_ventanilla = TRUE`);
    }
    if (estado) {
      conditions.push(`b.estado = $${idx++}`);
      params.push(estado);
    }
    if (municipio) {
      conditions.push(`b.municipio = $${idx++}`);
      params.push(municipio);
    }
    if (q) {
      conditions.push(`(b.nombre ILIKE $${idx} OR b.clave ILIKE $${idx} OR b.municipio ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    // Filtro por distancia del productor (Haversine, sin PostGIS)
    if (lat && lng && radio_km) {
      const haversine = `(6371 * acos(LEAST(1.0, cos(radians($${idx})) * cos(radians(b.latitud)) * cos(radians(b.longitud) - radians($${idx + 1})) + sin(radians($${idx})) * sin(radians(b.latitud)))))`;
      conditions.push(`b.latitud IS NOT NULL AND b.longitud IS NOT NULL AND ${haversine} <= $${idx + 2}`);
      params.push(Number(lat), Number(lng), Number(radio_km));
      idx += 3;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(`
      SELECT
        b.id, b.nombre, b.clave, b.estado, b.municipio, b.localidad,
        b.latitud, b.longitud, b.capacidad_ton, b.estatus_operativo,
        b.es_ventanilla, b.realiza_acopio, b.opera_incentivos,
        b.opera_coberturas, b.registra_inventario,
        r.nombre as region_nombre,
        (SELECT COUNT(*) FROM inventarios i WHERE i.bodega_id = b.id)::int as total_inventarios,
        (SELECT json_build_object('precio', pr.precio, 'tipo_maiz', pr.tipo_maiz, 'fecha', pr.fecha)
         FROM precios pr WHERE pr.bodega_id = b.id ORDER BY pr.fecha DESC LIMIT 1) as ultimo_precio
      FROM bodegas b
      LEFT JOIN regiones r ON b.region_id = r.id
      ${where}
      ORDER BY b.nombre ASC
    `, params);

    res.json({ infraestructura: result.rows });
  } catch (error) {
    console.error('Error al obtener infraestructura:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/infraestructura/:id - Detalle completo
// =============================================
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const bodegaResult = await pool.query(`
      SELECT b.*, r.nombre as region_nombre
      FROM bodegas b
      LEFT JOIN regiones r ON b.region_id = r.id
      WHERE b.id = $1
    `, [id]);

    if (bodegaResult.rows.length === 0) {
      res.status(404).json({ error: 'Infraestructura no encontrada' });
      return;
    }

    const [contactos, inventarios, ultimoPrecio] = await Promise.all([
      pool.query(
        'SELECT * FROM infraestructura_contactos WHERE bodega_id = $1 ORDER BY es_principal DESC, nombre',
        [id]
      ),
      pool.query(`
        SELECT i.*, u.nombre_completo as capturista
        FROM inventarios i
        LEFT JOIN usuarios u ON i.usuario_id = u.id
        WHERE i.bodega_id = $1
        ORDER BY i.fecha DESC NULLS LAST, i.fecha_registro DESC
        LIMIT 20
      `, [id]),
      pool.query(`
        SELECT precio, tipo_maiz, fecha, tipo_precio, fuente
        FROM precios
        WHERE bodega_id = $1
        ORDER BY fecha DESC LIMIT 1
      `, [id]),
    ]);

    res.json({
      bodega: bodegaResult.rows[0],
      contactos: contactos.rows,
      inventarios: inventarios.rows,
      ultimo_precio: ultimoPrecio.rows[0] || null,
    });
  } catch (error) {
    console.error('Error al obtener detalle:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/infraestructura - Alta de bodega
// =============================================
router.post('/', authMiddleware, BODEGA_WRITE, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      nombre, clave, estado, municipio, localidad,
      latitud, longitud, capacidad_ton, es_ventanilla,
      realiza_acopio, opera_incentivos, opera_coberturas, registra_inventario,
    } = req.body;

    if (!nombre || !estado || !municipio || !localidad || latitud == null || longitud == null) {
      res.status(400).json({ error: 'Campos obligatorios faltantes' });
      return;
    }

    if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
      res.status(400).json({ error: 'Coordenadas inválidas' });
      return;
    }

    // Validar duplicados
    const dup = await pool.query(`
      SELECT id FROM bodegas WHERE nombre = $1 AND municipio = $2
    `, [nombre, municipio]);
    if (dup.rows.length > 0) {
      res.status(409).json({ error: 'Ya existe una bodega con ese nombre en ese municipio' });
      return;
    }

    const esVentanilla = es_ventanilla === true || es_ventanilla === 'true';
    const esAcopio = esVentanilla ? true : (realiza_acopio === true || realiza_acopio === 'true');
    const esIncentivos = esVentanilla ? true : (opera_incentivos === true || opera_incentivos === 'true');
    const esCoberturas = esVentanilla ? true : (opera_coberturas === true || opera_coberturas === 'true');

    // Rol del usuario — bodeguero/admin pueden crear; otros quedan en pendiente
    const userResult = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user?.userId]);
    const rol = userResult.rows[0]?.rol || 'productor';
    const estatus = ['admin', 'responsable'].includes(rol) ? 'aprobada' : 'pendiente';
    const estatus_operativo = estatus === 'aprobada' ? 'activa' : 'inactiva';

    const result = await pool.query(`
      INSERT INTO bodegas (
        nombre, clave, estado, municipio, localidad, latitud, longitud,
        capacidad_ton, es_ventanilla, realiza_acopio, opera_incentivos,
        opera_coberturas, registra_inventario, estatus, estatus_operativo,
        creado_por, fecha_creacion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      nombre, clave || null, estado, municipio, localidad,
      latitud, longitud, capacidad_ton || 0,
      esVentanilla, esAcopio, esIncentivos, esCoberturas,
      registra_inventario !== false,
      estatus, estatus_operativo, req.user?.userId,
    ]);

    res.status(201).json({ bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al crear infraestructura:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PUT /api/infraestructura/:id - Editar (solo admin)
// =============================================
router.put('/:id', authMiddleware, BODEGA_WRITE, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const userResult = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user?.userId]);
    const rol = userResult.rows[0]?.rol || 'productor';
    if (!['admin', 'responsable'].includes(rol)) {
      res.status(403).json({ error: 'Sin permisos para editar infraestructura' });
      return;
    }

    const {
      nombre, clave, estado, municipio, localidad,
      latitud, longitud, capacidad_ton, estatus_operativo,
      es_ventanilla, realiza_acopio, opera_incentivos, opera_coberturas, registra_inventario,
    } = req.body;

    const esVentanilla = es_ventanilla === true || es_ventanilla === 'true';

    const result = await pool.query(`
      UPDATE bodegas SET
        nombre = COALESCE($1, nombre),
        clave = COALESCE($2, clave),
        estado = COALESCE($3, estado),
        municipio = COALESCE($4, municipio),
        localidad = COALESCE($5, localidad),
        latitud = COALESCE($6, latitud),
        longitud = COALESCE($7, longitud),
        capacidad_ton = COALESCE($8, capacidad_ton),
        estatus_operativo = COALESCE($9, estatus_operativo),
        es_ventanilla = COALESCE($10, es_ventanilla),
        realiza_acopio = CASE WHEN $10 = TRUE THEN TRUE ELSE COALESCE($11, realiza_acopio) END,
        opera_incentivos = CASE WHEN $10 = TRUE THEN TRUE ELSE COALESCE($12, opera_incentivos) END,
        opera_coberturas = CASE WHEN $10 = TRUE THEN TRUE ELSE COALESCE($13, opera_coberturas) END,
        registra_inventario = COALESCE($14, registra_inventario),
        actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [
      nombre, clave, estado, municipio, localidad,
      latitud, longitud, capacidad_ton, estatus_operativo,
      esVentanilla || null, realiza_acopio || null, opera_incentivos || null,
      opera_coberturas || null, registra_inventario || null, id,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }

    res.json({ bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al editar bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/infraestructura/:id/contactos
// =============================================
router.post('/:id/contactos', authMiddleware, BODEGA_WRITE, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre, cargo, telefono, correo, es_principal } = req.body;

    if (!nombre) {
      res.status(400).json({ error: 'El nombre del contacto es obligatorio' });
      return;
    }

    if (es_principal) {
      await pool.query(
        'UPDATE infraestructura_contactos SET es_principal = FALSE WHERE bodega_id = $1',
        [id]
      );
    }

    const result = await pool.query(`
      INSERT INTO infraestructura_contactos (bodega_id, nombre, cargo, telefono, correo, es_principal)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `, [id, nombre, cargo || null, telefono || null, correo || null, es_principal || false]);

    res.status(201).json({ contacto: result.rows[0] });
  } catch (error) {
    console.error('Error al agregar contacto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// DELETE /api/infraestructura/:id/contactos/:cid
// =============================================
router.delete('/:id/contactos/:cid', authMiddleware, BODEGA_WRITE, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, cid } = req.params;
    await pool.query(
      'DELETE FROM infraestructura_contactos WHERE id = $1 AND bodega_id = $2',
      [cid, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar contacto:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/infraestructura/:id/inventario
// =============================================
router.post('/:id/inventario', authMiddleware, BODEGA_WRITE, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { ciclo, tipo_maiz, origen, volumen_almacenado, volumen_problema, fecha, observaciones,
            variedad_code, humedad_pct, calidad } = req.body;

    if (!ciclo || !tipo_maiz || volumen_almacenado == null || !fecha) {
      res.status(400).json({ error: 'Campos obligatorios faltantes' });
      return;
    }

    if (volumen_almacenado < 0 || (volumen_problema != null && volumen_problema < 0)) {
      res.status(400).json({ error: 'Los volúmenes no pueden ser negativos' });
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    if (fecha > hoy) {
      res.status(400).json({ error: 'No se permiten fechas futuras' });
      return;
    }

    // Verificar que el volumen no supera la capacidad total de la bodega
    const capacidadResult = await pool.query(
      `SELECT capacidad_ton FROM bodegas WHERE id = $1`,
      [id]
    );
    if (capacidadResult.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }
    const capacidadTotal = parseFloat(capacidadResult.rows[0].capacidad_ton || '0');
    if (capacidadTotal > 0 && Number(volumen_almacenado) > capacidadTotal) {
      res.status(400).json({
        error: `El volumen registrado (${volumen_almacenado} ton) supera la capacidad total de la bodega (${capacidadTotal} ton).`,
        capacidad_total: capacidadTotal,
        volumen_ingresado: Number(volumen_almacenado),
      });
      return;
    }

    const result = await pool.query(`
      INSERT INTO inventarios
        (bodega_id, usuario_id, ciclo, tipo_maiz, origen, volumen_almacenamiento,
         volumen_problema, fecha, observaciones, variedad_codigo, humedad_pct, calidad, fecha_registro)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP)
      RETURNING *
    `, [id, req.user?.userId, ciclo, tipo_maiz, origen || null, volumen_almacenado,
        volumen_problema || 0, fecha, observaciones || null,
        variedad_code || null, humedad_pct || null, calidad || null]);

    res.status(201).json({ inventario: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar inventario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/infraestructura/:id/precios
// =============================================
router.get('/:id/precios', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT p.*, u.nombre_completo as capturista
      FROM precios p
      LEFT JOIN usuarios u ON p.usuario_captura = u.id
      WHERE p.bodega_id = $1
      ORDER BY p.fecha DESC
    `, [id]);

    const ultimo = result.rows[0] || null;

    res.json({ precios: result.rows, ultimo_precio: ultimo });
  } catch (error) {
    console.error('Error al obtener precios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/infraestructura/:id/precios
// =============================================
router.post('/:id/precios', authMiddleware, BODEGA_WRITE, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { precio, tipo_maiz, fecha, observaciones, variedad_code, humedad_pct, calidad } = req.body;

    if (!precio || !tipo_maiz || !fecha) {
      res.status(400).json({ error: 'Precio, tipo de maíz y fecha son obligatorios' });
      return;
    }

    if (precio <= 0) {
      res.status(400).json({ error: 'El precio debe ser mayor a 0' });
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    if (fecha > hoy) {
      res.status(400).json({ error: 'No se permiten fechas futuras' });
      return;
    }

    const result = await pool.query(`
      INSERT INTO precios
        (tipo_precio, fuente, precio, tipo_maiz, fecha, observaciones,
         bodega_id, usuario_captura, variedad_codigo, humedad_pct, calidad)
      VALUES ('bodega','bodeguero',$1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [precio, tipo_maiz, fecha, observaciones || null, id, req.user?.userId,
        variedad_code || null, humedad_pct || null, calidad || null]);

    res.status(201).json({ precio: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar precio:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/infraestructura/:id/aprobar (admin)
// =============================================
router.patch('/:id/aprobar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const userResult = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user?.userId]);
    if (userResult.rows[0]?.rol !== 'admin') {
      res.status(403).json({ error: 'Solo admin puede aprobar bodegas' });
      return;
    }

    const result = await pool.query(`
      UPDATE bodegas
      SET estatus = 'aprobada', estatus_operativo = 'activa',
          aprobado_por = $1, fecha_aprobacion = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [req.user?.userId, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }

    res.json({ bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al aprobar bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
