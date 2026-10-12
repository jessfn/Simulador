import { Router, Response } from 'express';
import pool from '../config/database';
import { soloMaiz } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================
// GET /api/home/stats
// Returns role-aware home dashboard stats.
// Shape: { stats: { productores, seguimientos, alertas, bodegas, extras... }, role }
// =============================================
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const role = req.user!.rol;

    // Helper: count seguimiento across the 4 tables for a given producer-id filter
    async function countSeguimiento(filter: string, params: any[]): Promise<{ total: number; pendientes: number }> {
      const [v, i, e, c] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM seguimiento_visitas WHERE ${filter}`, params),
        pool.query(`SELECT COUNT(*)::int AS c FROM seguimiento_incidencias WHERE ${filter}`, params),
        pool.query(`SELECT COUNT(*)::int AS c FROM estimacion_cosecha WHERE ${filter}`, params),
        pool.query(`SELECT COUNT(*)::int AS c FROM cosecha_real WHERE ${filter}`, params),
      ]);
      const total = v.rows[0].c + i.rows[0].c + e.rows[0].c + c.rows[0].c;
      // "Pendientes" = active cycles without any seguimiento yet (rough estimate)
      return { total, pendientes: 0 };
    }

    // ── PRODUCTOR ──────────────────────────────────────────────
    if (role === 'productor') {
      const producerRow = await pool.query(
        `SELECT p.producer_id, gs.name AS state_name
         FROM producer p
         LEFT JOIN geo_state gs ON gs.state_id = p.state_id
         WHERE p.usuario_id = $1`,
        [userId]
      );

      if (producerRow.rows.length === 0) {
        // User without producer record yet
        res.json({
          role,
          stats: {
            productores: 0, productores_label: 'Mis UPs',
            seguimientos: 0,
            seguimientos_pendientes: 0,
            alertas: 0,
            bodegas: 0,
            recientes: [],
          },
        });
        return;
      }

      const producerId = producerRow.rows[0].producer_id;
      const stateName: string | null = producerRow.rows[0].state_name;

      const [upsCount, segData, alertasCount, ciclosActivos, bodegasCount, recent] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM up WHERE producer_id = $1`, [producerId]),
        countSeguimiento('producer_id = $1', [producerId]),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM alertas
           WHERE producer_id = $1 AND estado_alerta IN ('pendiente','confirmada')`,
          [producerId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM cycle c
           JOIN up u ON u.up_id = c.up_id
           WHERE u.producer_id = $1 AND c.crop = 'maiz'`,
          [producerId]
        ),
        // Bodegas en el mismo estado (cercanas) — fallback to total if state not set
        stateName
          ? pool.query(
              `SELECT COUNT(*)::int AS c FROM bodegas WHERE estado ILIKE $1`,
              [stateName]
            )
          : pool.query(`SELECT COUNT(*)::int AS c FROM bodegas`),
        pool.query(
          `SELECT a.id, a.tipo_alerta AS titulo, a.nivel_alerta AS nivel, a.fecha_alerta AS fecha,
                  a.estado_alerta AS estado
           FROM alertas a
           WHERE a.producer_id = $1
           ORDER BY a.fecha_alerta DESC LIMIT 5`,
          [producerId]
        ),
      ]);

      res.json({
        role,
        stats: {
          productores: upsCount.rows[0].c,
          productores_label: 'Mis UPs',
          seguimientos: segData.total,
          seguimientos_pendientes: Math.max(0, ciclosActivos.rows[0].c - segData.total),
          alertas: alertasCount.rows[0].c,
          bodegas: bodegasCount.rows[0].c,
          bodegas_label: stateName ? 'En tu estado' : 'En tu región',
          recientes: recent.rows,
        },
      });
      return;
    }

    // ── SUPERVISOR ──────────────────────────────────────────────
    if (role === 'supervisor') {
      const linked = await pool.query(
        `SELECT producer_id FROM supervisor_productores WHERE supervisor_id = $1`,
        [userId]
      );
      const producerIds = linked.rows.map((r) => r.producer_id);

      if (producerIds.length === 0) {
        res.json({
          role,
          stats: {
            productores: 0,
            productores_label: 'En cartera',
            seguimientos: 0, seguimientos_pendientes: 0,
            alertas: 0,
            bodegas: 0, bodegas_label: 'Total',
            recientes: [],
          },
        });
        return;
      }

      const [segData, alertasRow, bodegasRow, recientes] = await Promise.all([
        countSeguimiento('producer_id = ANY($1::bigint[])', [producerIds]),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM alertas
           WHERE producer_id = ANY($1::bigint[])
             AND estado_alerta IN ('pendiente','confirmada')`,
          [producerIds]
        ),
        pool.query(`SELECT COUNT(*)::int AS c FROM bodegas`),
        pool.query(
          `SELECT a.id, a.tipo_alerta AS titulo, a.nivel_alerta AS nivel,
                  a.fecha_alerta AS fecha, a.estado_alerta AS estado
           FROM alertas a
           WHERE a.producer_id = ANY($1::bigint[])
           ORDER BY a.fecha_alerta DESC LIMIT 5`,
          [producerIds]
        ),
      ]);

      res.json({
        role,
        stats: {
          productores: producerIds.length,
          productores_label: 'En cartera',
          seguimientos: segData.total,
          seguimientos_pendientes: 0,
          alertas: alertasRow.rows[0].c,
          bodegas: bodegasRow.rows[0].c,
          bodegas_label: 'Total',
          recientes: recientes.rows,
        },
      });
      return;
    }

    // ── BODEGA / BODEGUERO / RESPONSABLE ─────────────────────────────────
    if (role === 'bodega' || role === 'bodeguero' || role === 'responsable') {
      const [kpiRow, ventRow, solRow] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(bb.id)::int AS mis_bodegas,
             COALESCE(SUM(b.capacidad_ton), 0)::float AS total_capacidad,
             COALESCE(SUM(COALESCE(inv.volumen_almacenamiento, 0)), 0)::float AS total_stock,
             CASE WHEN SUM(b.capacidad_ton) > 0
               THEN ROUND(((SUM(COALESCE(inv.volumen_almacenamiento, 0)) / SUM(b.capacidad_ton)) * 100)::NUMERIC, 1)
               ELSE 0 END AS ocupacion_pct,
             COALESCE(MAX(pr.precio), 0)::float AS ultimo_precio
           FROM bodeguero_bodegas bb
           JOIN bodegas b ON b.id = bb.bodega_id
           LEFT JOIN LATERAL (
             SELECT volumen_almacenamiento
             FROM inventarios
             WHERE bodega_id = b.id
             ORDER BY fecha DESC NULLS LAST LIMIT 1
           ) inv ON TRUE
           LEFT JOIN LATERAL (
             SELECT precio
             FROM precios
             WHERE bodega_id = b.id AND tipo_precio = 'bodega'
             ORDER BY fecha DESC LIMIT 1
           ) pr ON TRUE
           WHERE bb.usuario_id = $1 AND bb.estatus = 'aprobada'`,
          [userId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM ventanillas WHERE usuario_id = $1`,
          [userId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM solicitudes_apoyo sa
           JOIN apoyos_ventanilla av ON av.id = sa.apoyo_id
           JOIN ventanillas v ON v.id = av.ventanilla_id
           WHERE v.usuario_id = $1 AND sa.estado = 'recibida'`,
          [userId]
        ).catch(() => ({ rows: [{ c: 0 }] } as any)),
      ]);

      const kpi = kpiRow.rows[0];

      // C-02: precio promedio regional (últimos 7 días, mismo estado)
      let precio_promedio_regional = 0;
      let bodegas_en_calculo = 0;
      try {
        const precioReg = await pool.query(`
          SELECT
            ROUND(AVG(pr.precio)::numeric, 2) AS precio_promedio_regional,
            COUNT(DISTINCT pr.bodega_id)::int AS bodegas_en_calculo
          FROM precios pr
          JOIN bodegas b ON b.id = pr.bodega_id
          WHERE pr.created_at >= CURRENT_DATE - INTERVAL '7 days'
            AND pr.tipo_precio = 'bodega'
            AND b.estado ILIKE (
              SELECT b2.estado FROM bodegas b2
              JOIN bodeguero_bodegas bb2 ON bb2.bodega_id = b2.id
              WHERE bb2.usuario_id = $1 AND bb2.estatus = 'aprobada'
              LIMIT 1
            )
            AND pr.bodega_id NOT IN (
              SELECT bodega_id FROM bodeguero_bodegas WHERE usuario_id = $1
            )
        `, [userId]);
        precio_promedio_regional = precioReg.rows[0]?.precio_promedio_regional || 0;
        bodegas_en_calculo = precioReg.rows[0]?.bodegas_en_calculo || 0;
      } catch (_) { /* ignore */ }

      // B-06: productores cercanos KPI (PostGIS → fallback estado)
      let productores_cercanos = 0;
      let toneladas_cercanas = 0;
      try {
        // Check if disponibilidad_productor table exists
        const hasDisp = await pool.query(
          "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'disponibilidad_productor') AS e"
        );
        if (hasDisp.rows[0].e) {
          // Try PostGIS-based distance query first
          let pcR: any = null;
          try {
            pcR = await pool.query(`
              SELECT
                COUNT(DISTINCT dp.producer_id)::int AS cnt,
                COALESCE(SUM(dp.volumen_estimado_ton), 0)::float AS ton
              FROM disponibilidad_productor dp
              JOIN up u ON u.up_id = dp.up_id
              WHERE dp.activa = TRUE AND dp.fecha_vencimiento >= CURRENT_DATE
                AND EXISTS (
                  SELECT 1 FROM bodegas b
                  JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id
                  WHERE bb.usuario_id = $1 AND bb.estatus = 'aprobada'
                    AND b.latitud IS NOT NULL
                    AND ST_DWithin(
                      ST_SetSRID(ST_Point(COALESCE(u.longitud,0), COALESCE(u.latitud,0)), 4326)::geography,
                      ST_SetSRID(ST_Point(b.longitud, b.latitud), 4326)::geography,
                      50000
                    )
                )
            `, [userId]);
          } catch (_) { /* PostGIS not available */ }

          if (pcR && pcR.rows[0].cnt > 0) {
            productores_cercanos = pcR.rows[0].cnt;
            toneladas_cercanas = pcR.rows[0].ton;
          } else {
            // Fallback: count by same state as bodega
            const stR = await pool.query(`
              SELECT
                COUNT(DISTINCT dp.producer_id)::int AS cnt,
                COALESCE(SUM(dp.volumen_estimado_ton), 0)::float AS ton
              FROM disponibilidad_productor dp
              JOIN up u ON u.up_id = dp.up_id
              WHERE dp.activa = TRUE AND dp.fecha_vencimiento >= CURRENT_DATE
                AND u.state_name ILIKE (
                  SELECT b.estado FROM bodegas b
                  JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id
                  WHERE bb.usuario_id = $1 AND bb.estatus = 'aprobada' LIMIT 1
                )
            `, [userId]);
            productores_cercanos = stR.rows[0].cnt;
            toneladas_cercanas = stR.rows[0].ton;
          }
        }
      } catch (_) { /* ignore KPI calculation errors */ }

      res.json({
        role,
        stats: {
          mis_bodegas: kpi.mis_bodegas,
          total_stock: kpi.total_stock,
          total_capacidad: kpi.total_capacidad,
          ocupacion_pct: kpi.ocupacion_pct,
          espacio_libre: Math.max(0, (kpi.total_capacidad || 0) - (kpi.total_stock || 0)),
          ultimo_precio: kpi.ultimo_precio,
          precio_promedio_regional,
          bodegas_en_calculo,
          tiene_ventanilla: ventRow.rows[0].c > 0,
          solicitudes_pendientes: solRow.rows[0].c,
          productores_cercanos,
          toneladas_cercanas,
        },
      });
      return;
    }

    // ── ADMIN ───────────────────────────────────────────────────
    if (role === 'admin') {
      const [productoresRow, ciclosRow, alertasRow, bodegasRow, recientes, recientesProd, preciosRow, inventariosRow, usuariosRow] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM producer p WHERE ${soloMaiz('p')}`),
        pool.query(`SELECT COUNT(*)::int AS c FROM cycle WHERE crop = 'maiz'`),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM alertas
           WHERE estado_alerta IN ('pendiente','confirmada')`
        ),
        pool.query(`SELECT COUNT(*)::int AS c FROM bodegas`),
        pool.query(
          `SELECT a.id, a.tipo_alerta AS titulo, a.nivel_alerta AS nivel,
                  a.fecha_alerta AS fecha, a.estado_alerta AS estado
           FROM alertas a
           ORDER BY a.fecha_alerta DESC LIMIT 5`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM producer p
           WHERE created_at >= NOW() - INTERVAL '7 days' AND ${soloMaiz('p')}`
        ).catch(() => ({ rows: [{ c: 0 }] } as any)),
        pool.query(`SELECT COUNT(*)::int AS c FROM precios_maiz`).catch(() => ({ rows: [{ c: 0 }] } as any)),
        pool.query(`SELECT COUNT(*)::int AS c FROM inventarios`).catch(() => ({ rows: [{ c: 0 }] } as any)),
        pool.query(`SELECT COUNT(*)::int AS c FROM usuarios WHERE activo = true`).catch(() => ({ rows: [{ c: 0 }] } as any)),
      ]);

      // Seguimiento total (sum of 4 tables)
      const segTotals = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM seguimiento_visitas`),
        pool.query(`SELECT COUNT(*)::int AS c FROM seguimiento_incidencias`),
        pool.query(`SELECT COUNT(*)::int AS c FROM estimacion_cosecha`),
        pool.query(`SELECT COUNT(*)::int AS c FROM cosecha_real`),
      ]);
      const seguimientos = segTotals.reduce((acc, r) => acc + r.rows[0].c, 0);

      res.json({
        role,
        stats: {
          productores: productoresRow.rows[0].c,
          productores_label: 'Total',
          productores_recientes: recientesProd.rows[0].c,
          seguimientos,
          seguimientos_pendientes: 0,
          ciclos: ciclosRow.rows[0].c,
          alertas: alertasRow.rows[0].c,
          bodegas: bodegasRow.rows[0].c,
          bodegas_label: 'En sistema',
          precios: preciosRow.rows[0].c,
          inventarios: inventariosRow.rows[0].c,
          usuarios: usuariosRow.rows[0].c,
          recientes: recientes.rows,
        },
      });
      return;
    }

    res.json({ role, stats: { productores: 0, seguimientos: 0, alertas: 0, bodegas: 0, recientes: [] } });
  } catch (error) {
    console.error('Error en /home/stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
