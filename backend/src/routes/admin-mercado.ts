import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

function adminOnly(req: AuthRequest, res: Response): boolean {
  if (req.user!.rol !== 'admin' && req.user!.rol !== 'responsable') {
    res.status(403).json({ error: 'Acceso restringido a administradores' });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/mercado/mapa
// Disponibilidades de productores + requerimientos de bodegas con coordenadas
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mercado/mapa', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!adminOnly(req, res)) return;
  try {
    // Detectar columnas reales de disponibilidad_productor con fallback
    const [disponibilidades, requerimientos, kpis] = await Promise.all([
      pool.query(`
        SELECT
          d.id,
          ST_Y(u.centroide)       AS lat,
          ST_X(u.centroide)       AS lng,
          u.nombre_municipio    AS municipio,
          u.nombre_estado           AS estado,
          COALESCE(d.tipo_maiz, 'maiz_blanco') AS tipo_maiz,
          d.variedad_codigo,
          COALESCE(d.volumen_estimado_ton, 0)  AS volumen_estimado_ton,
          d.fecha_disponible,
          d.precio_minimo_ton,
          p.nombres || ' ' || p.apellido_paterno AS nombre_productor
        FROM disponibilidad_productor d
        JOIN up u ON d.up_id = u.up_id
        JOIN productor p ON p.productor_id = u.productor_id
        WHERE d.activa = true
          AND (d.fecha_vencimiento IS NULL OR d.fecha_vencimiento > NOW())
          AND u.centroide IS NOT NULL
        ORDER BY d.creado_en DESC
        LIMIT 1000
      `),
      pool.query(`
        SELECT
          s.id,
          b.latitud              AS lat,
          b.longitud             AS lon,
          b.municipio,
          b.estado,
          b.nombre               AS nombre_bodega,
          s.tipo_maiz,
          s.variedad_codigo,
          s.volumen_ton,
          s.precio_ofrecido,
          COALESCE(s.radio_km, 50) AS radio_km
        FROM senales_compra s
        JOIN bodegas b ON s.bodega_id = b.id
        WHERE s.activa = true
          AND (s.fecha_vencimiento IS NULL OR s.fecha_vencimiento > NOW())
          AND b.latitud IS NOT NULL AND b.longitud IS NOT NULL
        ORDER BY s.creado_en DESC
        LIMIT 500
      `),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(COALESCE(volumen_estimado_ton, 0))
                    FROM disponibilidad_productor WHERE activa = true), 0)::numeric(12,2) AS ofertadas,
          COALESCE((SELECT SUM(volumen_ton) FROM senales_compra WHERE activa = true), 0)::numeric(12,2) AS demandadas,
          COALESCE((SELECT AVG(precio_ofrecido) FROM senales_compra WHERE activa = true AND precio_ofrecido > 0), 0)::numeric(10,2) AS precio_promedio,
          COALESCE((SELECT COUNT(DISTINCT productor_id) FROM disponibilidad_productor WHERE activa = true), 0)::int AS productores_con_disponibilidad,
          COALESCE((SELECT COUNT(DISTINCT bodega_id) FROM senales_compra WHERE activa = true), 0)::int AS bodegas_buscando
      `),
    ]);

    const kpi = kpis.rows[0] || {};
    const ofertadas = parseFloat(kpi.ofertadas) || 0;
    const demandadas = parseFloat(kpi.demandadas) || 0;

    res.json({
      disponibilidades: disponibilidades.rows,
      requerimientos: requerimientos.rows,
      kpis: {
        ofertadas_ton: ofertadas,
        demandadas_ton: demandadas,
        balance_ton: Math.round((ofertadas - demandadas) * 100) / 100,
        precio_promedio_ofrecido: parseFloat(kpi.precio_promedio) || 0,
        productores_con_disponibilidad: kpi.productores_con_disponibilidad || 0,
        bodegas_buscando_maiz: kpi.bodegas_buscando || 0,
      },
    });
  } catch (error) {
    console.error('Error GET /admin/mercado/mapa:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/bodegas/stats-inventario
// Stock por estado/variedad para gráficas de bodegas
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bodegas/stats-inventario', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!adminOnly(req, res)) return;
  try {
    const [porEstado, porVariedad, bodegas_tarifario, total_ventanillas] = await Promise.all([
      pool.query(`
        SELECT
          b.estado,
          COALESCE(SUM(i.volumen_almacenamiento), 0)::numeric(12,2) AS stock_ton,
          COUNT(DISTINCT b.id)::int AS bodegas,
          COALESCE(SUM(b.capacidad_ton), 0)::numeric(12,2) AS capacidad_ton
        FROM bodegas b
        LEFT JOIN inventarios i ON i.bodega_id = b.id
        WHERE b.estado IS NOT NULL
        GROUP BY b.estado
        ORDER BY stock_ton DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT
          COALESCE(i.variedad_codigo, 'Sin clasificar') AS variedad,
          COALESCE(SUM(i.volumen_almacenamiento), 0)::numeric(12,2) AS stock_ton,
          COUNT(*)::int AS registros
        FROM inventarios i
        JOIN bodegas b ON b.id = i.bodega_id
        GROUP BY i.variedad_codigo
        ORDER BY stock_ton DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT COUNT(DISTINCT bodega_id)::int AS total
        FROM tarifario_servicios
        WHERE activo = true AND actualizado_en >= NOW() - INTERVAL '60 days'
      `).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS total FROM ventanillas`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      por_estado: porEstado.rows,
      por_variedad: porVariedad.rows,
      bodegas_con_tarifario_activo: bodegas_tarifario.rows[0].total || 0,
      total_ventanillas_activas: total_ventanillas.rows[0].total || 0,
    });
  } catch (error) {
    console.error('Error GET /admin/bodegas/stats-inventario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
