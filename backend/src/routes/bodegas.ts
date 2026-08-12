import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, requierePermisosTotales, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================
// GET /api/bodegas/catalogos - Regiones, Estados, Municipios
// =============================================
router.get('/catalogos', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [regiones, estados, municipios, ddrs] = await Promise.all([
      pool.query('SELECT id, nombre FROM regiones ORDER BY nombre'),
      pool.query('SELECT DISTINCT estado, region_id FROM bodegas WHERE estado IS NOT NULL ORDER BY estado'),
      pool.query('SELECT DISTINCT municipio, estado FROM bodegas WHERE municipio IS NOT NULL ORDER BY municipio'),
      pool.query('SELECT DISTINCT ddr, estado FROM bodegas WHERE ddr IS NOT NULL AND ddr != \'\' ORDER BY ddr'),
    ]);
    res.json({
      regiones: regiones.rows,
      estados: estados.rows,
      municipios: municipios.rows,
      ddrs: ddrs.rows,
    });
  } catch (error) {
    console.error('Error al obtener catalogos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/bodegas - Filtrar bodegas + KPI agregado
// =============================================
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let { region_id, municipio, q, lat, lng, radio_km, tipo_maiz } = req.query;
    // OREF: forzar filtro de estado al estado asignado
    const estadoForzado = (req.user?.rol === 'user' && req.user?.es_panel_usuario)
      ? req.user.estado_asignado ?? null : null;
    const estado = estadoForzado ?? (req.query.estado as string | undefined);

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (tipo_maiz) {
      // Bodegas con una señal de compra activa para ese tipo de maíz
      conditions.push(`EXISTS (
        SELECT 1 FROM senales_compra sc
        WHERE sc.bodega_id = b.id AND sc.activa = true AND sc.tipo_maiz = $${idx}
      )`);
      params.push(tipo_maiz);
      idx++;
    }

    if (region_id) {
      conditions.push(`b.region_id = $${idx++}`);
      params.push(Number(region_id));
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
      conditions.push(`(b.nombre ILIKE $${idx} OR b.clave ILIKE $${idx} OR b.estado ILIKE $${idx} OR b.municipio ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    // Filtro por radio (productor) — usa Haversine en SQL puro (sin PostGIS)
    let distanciaSelect = '0 AS distancia_km';
    let radioCondition = '';
    if (lat && lng && radio_km) {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      const radioNum = Number(radio_km);
      // Fórmula Haversine en SQL puro — no requiere PostGIS
      const haversine = `(6371 * acos(LEAST(1.0, cos(radians($${idx})) * cos(radians(b.latitud)) * cos(radians(b.longitud) - radians($${idx + 1})) + sin(radians($${idx})) * sin(radians(b.latitud)))))`;
      distanciaSelect = `${haversine} AS distancia_km`;
      radioCondition = `${haversine} <= $${idx + 2}`;
      conditions.push(radioCondition);
      params.push(latNum, lngNum, radioNum);
      idx += 3;
    }

    // Construir condiciones sin radio para KPI (el KPI no soporta Haversine)
    const kpiConditions = conditions.filter(cond => cond !== radioCondition);
    const kpiParams = lat && lng && radio_km ? params.slice(0, params.length - 3) : [...params];
    const kpiWhere = kpiConditions.length > 0 ? `WHERE ${kpiConditions.join(' AND ')}` : '';

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const bodegasQuery = `
      SELECT b.*, r.nombre as region_nombre, ${distanciaSelect},
        CASE b.semaforo_compra
          WHEN 'verde'    THEN 'comprando'
          WHEN 'amarillo' THEN 'limitado'
          WHEN 'rojo'     THEN 'no_compra'
          ELSE 'sin_actividad'
        END AS estado_compra,
        (
          SELECT json_build_object(
            'id', sc.id,
            'precio_oferta', sc.precio_ofrecido,
            'volumen_ton', sc.volumen_ton,
            'tipo_maiz', sc.tipo_maiz
          )
          FROM senales_compra sc
          WHERE sc.bodega_id = b.id AND sc.activa = true
          ORDER BY sc.created_at DESC
          LIMIT 1
        ) as senal_activa,
        (
          SELECT pr.precio
          FROM precios pr
          WHERE pr.bodega_id = b.id
            AND pr.tipo_precio = 'bodega'
          ORDER BY pr.fecha DESC, pr.created_at DESC
          LIMIT 1
        ) AS precio_compra_hoy,
        (
          SELECT i.volumen_almacenamiento
          FROM inventarios i
          WHERE i.bodega_id = b.id
          ORDER BY i.fecha DESC NULLS LAST, i.fecha_registro DESC
          LIMIT 1
        ) AS stock_actual
      FROM bodegas b
      LEFT JOIN regiones r ON b.region_id = r.id
      ${where}
      ORDER BY ${lat && lng ? 'distancia_km ASC' : 'b.nombre ASC'}
    `;

    const kpiQuery = `
      SELECT
        COUNT(*)::int                                     AS total_bodegas,
        COALESCE(SUM(b.capacidad_ton), 0)::float         AS total_capacidad,
        COUNT(DISTINCT b.estado)::int                    AS total_estados,
        COUNT(DISTINCT b.municipio)::int                 AS total_municipios,
        COUNT(*) FILTER (WHERE b.activo = true)::int     AS total_inventarios
      FROM bodegas b
      ${kpiWhere}
    `;

    const [bodegasResult, kpiResult] = await Promise.all([
      pool.query(bodegasQuery, params),
      pool.query(kpiQuery, kpiParams),
    ]);

    res.json({
      bodegas: bodegasResult.rows,
      kpi: kpiResult.rows[0],
    });
  } catch (error) {
    console.error('Error al obtener bodegas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/bodegas - Crear nueva bodega
// =============================================
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      clave, nombre, estado, municipio, localidad, direccion,
      latitud, longitud, capacidad_ton,
    } = req.body;

    if (!nombre || !estado || !municipio || latitud == null || longitud == null) {
      res.status(400).json({ error: 'Campos obligatorios: nombre, estado, municipio, latitud, longitud' });
      return;
    }

    if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
      res.status(400).json({ error: 'Coordenadas inválidas' });
      return;
    }

    // Determinar estatus según rol
    const userResult = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.user?.userId]);
    const rol = userResult.rows[0]?.rol || 'bodeguero';
    const estatus = ['admin', 'responsable'].includes(rol) ? 'aprobada' : 'pendiente';

    const result = await pool.query(`
      INSERT INTO bodegas (
        clave, nombre, estado, municipio, localidad, direccion,
        latitud, longitud, capacidad_ton,
        estatus, creado_por, fecha_creacion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CURRENT_TIMESTAMP)
      RETURNING *
    `, [
      clave || null, nombre, estado, municipio, localidad || null, direccion || null,
      latitud, longitud, capacidad_ton || 0,
      estatus, req.user?.userId,
    ]);

    res.status(201).json({ message: 'Bodega registrada exitosamente', bodega: result.rows[0] });
  } catch (error: any) {
    console.error('Error al crear bodega:', error);
    res.status(500).json({ error: 'Error al crear bodega: ' + (error.message || '') });
  }
});

// =============================================
// GET /api/bodegas/stats - KPIs globales del catálogo
// =============================================
router.get('/stats', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_bodegas,
        COALESCE(SUM(capacidad_ton), 0)::float AS total_capacidad_ton
      FROM bodegas
      WHERE estatus = 'aprobada'
    `);
    res.json(result.rows[0] ?? { total_bodegas: 0, total_capacidad_ton: 0 });
  } catch (error) {
    console.error('Error /bodegas/stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/bodegas/:id - Detalle de bodega
// =============================================
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT b.*, r.nombre as region_nombre,
        CASE b.semaforo_compra
          WHEN 'verde'    THEN 'comprando'
          WHEN 'amarillo' THEN 'limitado'
          WHEN 'rojo'     THEN 'no_compra'
          ELSE 'sin_actividad'
        END AS estado_compra
       FROM bodegas b
       LEFT JOIN regiones r ON b.region_id = r.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }

    res.json({ bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/bodegas/:id/aprobar
// =============================================
router.patch('/:id/aprobar', authMiddleware, requierePermisosTotales, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE bodegas SET estatus = 'aprobada' WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }
    res.json({ message: 'Bodega aprobada', bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al aprobar bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/bodegas/:id/semaforo — actualizar semáforo de compra
// =============================================
router.patch('/:id/semaforo', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { semaforo } = req.body;
  if (!['verde', 'amarillo', 'rojo'].includes(semaforo)) {
    res.status(400).json({ error: "semaforo debe ser 'verde', 'amarillo' o 'rojo'" });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE bodegas
       SET semaforo_compra = $1, semaforo_updated_at = NOW(), semaforo_usuario_id = $2
       WHERE id = $3 RETURNING id, nombre, semaforo_compra, semaforo_updated_at`,
      [semaforo, req.user?.userId, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Bodega no encontrada' }); return; }
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// PATCH /api/bodegas/:id/rechazar
// =============================================
router.patch('/:id/rechazar', authMiddleware, requierePermisosTotales, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE bodegas SET estatus = 'rechazada' WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }
    res.json({ message: 'Bodega rechazada', bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al rechazar bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/bodegas/:id/tarifario-publico — tarifario visible para productores
// =============================================
router.get('/:id/tarifario-publico', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT c.nombre AS concepto, ts.precio, c.unidad_default AS unidad,
              ts.updated_at AS ultima_actualizacion
       FROM tarifario_servicios ts
       JOIN cat_conceptos_servicio c ON c.id = ts.concepto_id
       WHERE ts.bodega_id = $1
         AND ts.activo = TRUE
         AND ts.updated_at >= NOW() - INTERVAL '90 days'
       ORDER BY c.nombre ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener tarifario público:', error);
    res.status(500).json({ error: 'Error al obtener tarifario' });
  }
});

// =============================================
// GET /api/bodegas/:id/stock-actual — último volumen reportado (productores)
// =============================================
router.get('/:id/stock-actual', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT volumen_almacenamiento AS volumen_ton
       FROM inventarios
       WHERE bodega_id = $1
       ORDER BY fecha_registro DESC
       LIMIT 1`,
      [req.params.id]
    );
    const vol = result.rows[0]?.volumen_ton;
    res.json({ volumen_ton: vol != null ? Number(vol) : null });
  } catch (error) {
    console.error('Error al obtener stock actual:', error);
    res.status(500).json({ error: 'Error al obtener stock' });
  }
});

// =============================================
// PATCH /api/bodegas/:id/capacidad
// Permite al bodeguero corregir la capacidad de almacenamiento de su bodega
// =============================================
router.patch('/:id/capacidad', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { capacidad_ton } = req.body;
    const usuarioId = req.user?.userId;

    if (!capacidad_ton || isNaN(Number(capacidad_ton)) || Number(capacidad_ton) <= 0) {
      res.status(400).json({ error: 'La capacidad debe ser un número mayor a 0' });
      return;
    }

    // Verificar que la bodega pertenece al bodeguero autenticado
    const check = await pool.query(
      `SELECT b.id FROM bodegas b
       JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id
       WHERE b.id = $1 AND bb.usuario_id = $2`,
      [id, usuarioId]
    );

    if (!check.rows.length) {
      res.status(403).json({ error: 'No tienes permiso para editar esta bodega' });
      return;
    }

    // Verificar que la nueva capacidad no sea menor al stock actual
    const stockRes = await pool.query(
      `SELECT COALESCE(SUM(volumen_almacenamiento), 0) AS stock_actual
       FROM inventarios
       WHERE bodega_id = $1`,
      [id]
    );
    const stockActual = Number(stockRes.rows[0]?.stock_actual ?? 0);

    if (Number(capacidad_ton) < stockActual) {
      res.status(400).json({
        error: `La nueva capacidad (${capacidad_ton} ton) no puede ser menor al stock actual (${stockActual} ton)`
      });
      return;
    }

    const result = await pool.query(
      `UPDATE bodegas
       SET capacidad_ton = $1
       WHERE id = $2
       RETURNING id, nombre, capacidad_ton`,
      [Number(capacidad_ton), id]
    );

    res.json({ ok: true, bodega: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar capacidad:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
