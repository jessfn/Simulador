import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================
// GET /api/precios — Listar con filtros
// =============================================
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tipo_precio, fuente, tipo_maiz, estado, municipio, fecha_inicio, fecha_fin } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (tipo_precio) {
      conditions.push(`p.tipo_precio = $${idx++}`);
      params.push(tipo_precio);
    }
    if (fuente) {
      conditions.push(`p.fuente = $${idx++}`);
      params.push(fuente);
    }
    if (tipo_maiz) {
      conditions.push(`p.tipo_maiz = $${idx++}`);
      params.push(tipo_maiz);
    }
    if (estado) {
      conditions.push(`p.estado = $${idx++}`);
      params.push(estado);
    }
    if (municipio) {
      conditions.push(`p.municipio = $${idx++}`);
      params.push(municipio);
    }
    if (fecha_inicio) {
      conditions.push(`p.fecha >= $${idx++}`);
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      conditions.push(`p.fecha <= $${idx++}`);
      params.push(fecha_fin);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT
        p.*,
        i.nombre AS infraestructura_nombre
      FROM precios p
      LEFT JOIN bodegas i ON p.bodega_id = i.id
      ${where}
      ORDER BY p.fecha DESC, p.creado_en DESC
      LIMIT 500
    `, params);

    res.json({ precios: result.rows });
  } catch (error) {
    console.error('Error al obtener precios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/precios — Registrar precio
// =============================================
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const {
      tipo_precio,
      fuente,
      tipo_maiz,
      fecha,
      precio,
      estado,
      municipio,
      observaciones,
      // internacional
      valor_origen,
      unidad_origen,
      tipo_cambio,
      // gobierno
      programa,
      // referencias opcionales
      bodega_id,
    } = req.body;

    if (!tipo_precio || !tipo_maiz || !fecha || precio === undefined) {
      res.status(400).json({ error: 'Faltan campos requeridos: tipo_precio, tipo_maiz, fecha, precio' });
      return;
    }

    // ── Permission rules per role (Reajustes.pdf §13) ──
    const role = req.user?.rol;
    const allowedByRole: Record<string, string[]> = {
      productor: ['observado'],
      // tecnico role merged into productor
      bodeguero: ['bodega'],
      responsable: ['bodega'],
      admin: ['observado', 'bodega', 'mercado_internacional', 'gobierno'],
      supervisor: [], // read-only
    };
    const allowed = allowedByRole[role || ''] || [];
    if (!allowed.includes(tipo_precio)) {
      res.status(403).json({
        error: `El rol '${role}' no puede registrar precios de tipo '${tipo_precio}'.`,
      });
      return;
    }

    // Ensure columns exist before inserting
    const result = await pool.query(`
      INSERT INTO precios (
        tipo_precio, fuente, tipo_maiz, fecha, precio,
        estado, municipio, observaciones,
        valor_origen, unidad_origen, tipo_cambio,
        programa, bodega_id, usuario_captura, creado_en
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, NOW()
      )
      RETURNING *
    `, [
      tipo_precio,
      fuente || null,
      tipo_maiz,
      fecha,
      precio,
      estado || null,
      municipio || null,
      observaciones || null,
      valor_origen || null,
      unidad_origen || null,
      tipo_cambio || null,
      programa || null,
      bodega_id || null,
      userId,
    ]);

    res.status(201).json({ mensaje: 'Precio registrado correctamente', precio: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar precio:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/precios/series — Daily time-series for chart (last 30 days)
// =============================================
router.get('/series', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        fecha::text AS fecha,
        ROUND(AVG(precio) FILTER (WHERE tipo_precio = 'bodega')::numeric, 2)    AS precio_bodega,
        ROUND(AVG(precio) FILTER (WHERE tipo_precio = 'gobierno')::numeric, 2)  AS precio_gobierno,
        ROUND(AVG(precio) FILTER (WHERE tipo_precio IN ('observado','mercado_internacional'))::numeric, 2) AS precio_mercado
      FROM precios
      WHERE fecha >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY fecha
      ORDER BY fecha ASC
    `);
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error en /precios/series:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// GET /api/precios/dashboard — KPIs y resumen
// =============================================
router.get('/dashboard', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [kpi, porTipoMaiz, ultimoInt, ultimoGob] = await Promise.all([
      pool.query(`
        SELECT
          ROUND(AVG(precio)::numeric, 2)  AS promedio,
          MAX(precio)                      AS maximo,
          MIN(precio)                      AS minimo,
          COUNT(*)::int                    AS total_registros
        FROM precios
        WHERE fecha >= NOW() - INTERVAL '90 days'
      `),
      // Tabla pivot: por tipo_maiz × tipo_precio (últimos 90 días)
      pool.query(`
        SELECT
          tipo_maiz,
          ROUND(AVG(precio) FILTER (WHERE tipo_precio = 'observado')::numeric, 2)             AS observado,
          ROUND(AVG(precio) FILTER (WHERE tipo_precio = 'bodega')::numeric, 2)                AS bodega,
          ROUND(AVG(precio) FILTER (WHERE tipo_precio = 'mercado_internacional')::numeric, 2) AS internacional,
          ROUND(AVG(precio) FILTER (WHERE tipo_precio = 'gobierno')::numeric, 2)              AS gobierno,
          COUNT(*)::int                                                                        AS registros
        FROM precios
        WHERE fecha >= NOW() - INTERVAL '90 days'
          AND tipo_maiz IS NOT NULL
        GROUP BY tipo_maiz
        ORDER BY tipo_maiz
      `),
      pool.query(`
        SELECT precio, tipo_maiz, fecha, valor_origen, unidad_origen, tipo_cambio
        FROM precios
        WHERE tipo_precio = 'mercado_internacional'
        ORDER BY fecha DESC
        LIMIT 1
      `),
      pool.query(`
        SELECT precio, tipo_maiz, fecha, programa
        FROM precios
        WHERE tipo_precio = 'gobierno'
        ORDER BY fecha DESC
        LIMIT 1
      `),
    ]);

    res.json({
      kpi: kpi.rows[0],
      por_tipo_maiz: porTipoMaiz.rows,
      ultimo_internacional: ultimoInt.rows[0] || null,
      ultimo_gobierno: ultimoGob.rows[0] || null,
    });
  } catch (error) {
    console.error('Error al obtener dashboard de precios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
