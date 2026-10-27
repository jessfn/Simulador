import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { soloMaiz, soloMaizDeUp } from '../utils/programas';

const router = Router();

/** Permite admin, responsable y usuarios OREF del panel */
function esPanelAdmin(req: AuthRequest, res: Response): boolean {
  const u = req.user!;
  const ok = u.rol === 'admin' || u.rol === 'responsable' ||
    (u.rol === 'user' && u.es_panel_usuario === true);
  if (!ok) { res.status(403).json({ error: 'Acceso restringido al panel administrativo' }); }
  return ok;
}

/** Retorna el estado a filtrar (OREF) o null (admin/responsable = todos los estados) */
function getEstado(req: AuthRequest): string | null {
  const u = req.user!;
  if (u.rol === 'admin' || u.rol === 'responsable') return null;
  return u.estado_asignado ?? null;
}

/** Genera cláusula WHERE para filtrado multi-estado (soporta "GTO,JAL" separado por comas) */
function estadoWhere(estado: string | null, col: string, nextIdx: number): { sql: string; params: string[]; nextIdx: number } {
  if (!estado) return { sql: '', params: [], nextIdx };
  return {
    sql: `AND ${col} = ANY(string_to_array($${nextIdx}, ','))`,
    params: [estado],
    nextIdx: nextIdx + 1,
  };
}

// GET /api/dashboard/admin/resumen — KPIs principales
router.get('/resumen', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const estado = getEstado(req);
    const wP = estadoWhere(estado, 'p.nombre_estado', 1);
    const wB = estadoWhere(estado, 'b.estado', 1);

    const [productoresActivos, productoresPendientes, bodegasActivas, bodegasPendientes,
           disponibilidades, requerimientos, transacciones7d] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM productor p WHERE p.estado_validacion = 'activo' AND ${soloMaiz('p')} ${wP.sql}`, wP.params),
      pool.query(`SELECT COUNT(*)::int AS total FROM productor p WHERE p.estado_validacion = 'pendiente' AND ${soloMaiz('p')} ${wP.sql}`, wP.params),
      pool.query(`SELECT COUNT(*)::int AS total FROM bodegas b WHERE b.estatus = 'aprobada' ${wB.sql}`, wB.params),
      pool.query(`SELECT COUNT(*)::int AS total FROM bodegas b WHERE b.estatus = 'pendiente' ${wB.sql}`, wB.params),
      pool.query(`SELECT COALESCE(SUM(COALESCE(volumen_estimado_ton, 0)), 0)::numeric(12,2) AS total_ton FROM disponibilidad_productor WHERE COALESCE(activa, true) = true`).catch(() => ({ rows: [{ total_ton: 0 }] })),
      pool.query(`SELECT COALESCE(SUM(volumen_ton), 0)::numeric(12,2) AS total_ton FROM senales_compra WHERE activa = true`).catch(() => ({ rows: [{ total_ton: 0 }] })),
      pool.query(`SELECT COUNT(*)::int AS total FROM transacciones WHERE creado_en >= NOW() - INTERVAL '7 days'`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      productores_activos: productoresActivos.rows[0].total,
      productores_pendientes: productoresPendientes.rows[0].total,
      bodegas_activas: bodegasActivas.rows[0].total,
      bodegas_pendientes: bodegasPendientes.rows[0].total,
      disponibilidades_totales: parseFloat(disponibilidades.rows[0].total_ton) || 0,
      requerimientos_totales: parseFloat(requerimientos.rows[0].total_ton) || 0,
      transacciones_7dias: transacciones7d.rows[0].total || 0,
    });
  } catch (error) {
    console.error('Error dashboard resumen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/dashboard/admin/produccion — Producción por estado, ciclo, cultivo
router.get('/produccion', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const estado = getEstado(req);
    const wU = estadoWhere(estado, 'u.nombre_estado', 1);
    const [porEstado, porCiclo, porAnio, sinCiclo, totalesGlobales] = await Promise.all([
      pool.query(`
        SELECT
          u.nombre_estado AS estado,
          COUNT(DISTINCT u.up_id)::int AS ups,
          COUNT(DISTINCT cc.ciclo_cultivo_id)::int AS cultivos,
          COALESCE(SUM(cc.superficie_sembrada_ha), 0)::numeric(10,2) AS area_ha,
          COALESCE(SUM(ec.produccion_estimada_ton), 0)::numeric(10,2) AS produccion_ton
        FROM up u
        LEFT JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'maiz'
        LEFT JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
        LEFT JOIN estimacion_cosecha ec ON ec.up_id = u.up_id AND ec.ciclo_id = c.ciclo_id
        WHERE u.nombre_estado IS NOT NULL AND ${soloMaizDeUp('u')} ${wU.sql}
        GROUP BY u.nombre_estado
        ORDER BY area_ha DESC
        LIMIT 20
      `, wU.params),
      pool.query(`
        SELECT
          c.tipo_ciclo,
          c.anio_ciclo,
          COUNT(DISTINCT c.ciclo_id)::int AS ciclos,
          COUNT(DISTINCT cc.ciclo_cultivo_id)::int AS cultivos,
          COALESCE(SUM(cc.superficie_sembrada_ha), 0)::numeric(10,2) AS area_ha
        FROM ciclo c
        JOIN up u ON u.up_id = c.up_id
        LEFT JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
        WHERE c.cultivo = 'maiz' AND ${soloMaizDeUp('u')} ${wU.sql}
        GROUP BY c.tipo_ciclo, c.anio_ciclo
        ORDER BY c.anio_ciclo DESC, c.tipo_ciclo
        LIMIT 20
      `, wU.params),
      pool.query(`
        SELECT
          c.anio_ciclo,
          COUNT(DISTINCT c.ciclo_id)::int AS ciclos,
          COUNT(DISTINCT u.up_id)::int AS ups,
          COALESCE(SUM(cc.superficie_sembrada_ha), 0)::numeric(10,2) AS area_ha
        FROM ciclo c
        JOIN up u ON u.up_id = c.up_id
        LEFT JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
        WHERE c.cultivo = 'maiz' AND ${soloMaizDeUp('u')} ${wU.sql}
        GROUP BY c.anio_ciclo
        ORDER BY c.anio_ciclo DESC
        LIMIT 6
      `, wU.params),
      pool.query(`
        SELECT COUNT(*)::int AS ups_sin_ciclo
        FROM up u
        WHERE NOT EXISTS (SELECT 1 FROM ciclo c WHERE c.up_id = u.up_id AND c.cultivo = 'maiz')
        AND ${soloMaizDeUp('u')}
        ${wU.sql}
      `, wU.params),
      pool.query(`
        SELECT
          COALESCE(SUM(u.superficie_ha_calculada), 0)::numeric(12,2) AS superficie_total_ha,
          COALESCE(SUM(cc.superficie_sembrada_ha), 0)::numeric(12,2) AS superficie_sembrada_ha,
          COALESCE(SUM(cc.superficie_sembrada_ha * COALESCE(cc.rendimiento_esperado, 0)), 0)::numeric(12,2) AS produccion_esperada_ton,
          COUNT(DISTINCT cc.ciclo_cultivo_id)::int AS productores_con_ciclo
        FROM up u
        LEFT JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'maiz'
        LEFT JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
        WHERE ${soloMaizDeUp('u')} ${wU.sql}
      `, wU.params),
    ]);

    const tot = totalesGlobales.rows[0];
    res.json({
      por_estado: porEstado.rows,
      por_ciclo: porCiclo.rows,
      por_anio: porAnio.rows,
      ups_sin_ciclo: sinCiclo.rows[0].ups_sin_ciclo,
      // Nuevos campos globales
      superficie_total_ha: parseFloat(tot.superficie_total_ha) || 0,
      superficie_sembrada_ha: parseFloat(tot.superficie_sembrada_ha) || 0,
      produccion_esperada_ton: parseFloat(tot.produccion_esperada_ton) || 0,
      productores_con_ciclo: tot.productores_con_ciclo || 0,
    });
  } catch (error) {
    console.error('Error dashboard producción:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/dashboard/admin/infraestructura — Bodegas, capacidad, inventario
router.get('/infraestructura', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const estado = getEstado(req);
    const wB = estadoWhere(estado, 'estado', 1);
    const wBb = estadoWhere(estado, 'b.estado', 1);
    const [porEstado, capacidadTotal, inventarioActual, topBodegas] = await Promise.all([
      pool.query(`
        SELECT
          estado,
          COUNT(*)::int AS total_bodegas,
          COALESCE(SUM(capacidad_ton), 0)::numeric(12,2) AS capacidad_ton
        FROM bodegas
        WHERE true ${wB.sql}
        GROUP BY estado
        ORDER BY capacidad_ton DESC
        LIMIT 20
      `, wB.params),
      pool.query(`
        SELECT
          COUNT(*)::int AS bodegas_aprobadas,
          COALESCE(SUM(capacidad_ton), 0)::numeric(12,2) AS capacidad_total_ton
        FROM bodegas
        WHERE true ${wB.sql}
      `, wB.params),
      pool.query(`
        SELECT COALESCE(SUM(i.volumen_almacenamiento), 0)::numeric(12,2) AS stock_actual_ton
        FROM inventarios i
        JOIN (
          SELECT bodega_id, MAX(fecha) AS max_fecha
          FROM inventarios
          GROUP BY bodega_id
        ) latest ON latest.bodega_id = i.bodega_id AND latest.max_fecha = i.fecha
        JOIN bodegas b ON b.id = i.bodega_id
        WHERE true ${wBb.sql}
      `, wBb.params),
      pool.query(`
        SELECT
          b.nombre,
          b.estado,
          b.municipio,
          b.capacidad_ton,
          COALESCE(
            (SELECT i.volumen_almacenamiento FROM inventarios i
             WHERE i.bodega_id = b.id ORDER BY i.fecha DESC LIMIT 1), 0
          )::numeric(10,2) AS stock_actual
        FROM bodegas b
        WHERE true ${wBb.sql}
        ORDER BY b.capacidad_ton DESC
        LIMIT 10
      `, wBb.params),
    ]);

    const cap = parseFloat(capacidadTotal.rows[0].capacidad_total_ton) || 0;
    const stock = parseFloat(inventarioActual.rows[0].stock_actual_ton) || 0;
    const ocupacion_pct = cap > 0 ? Math.round((stock / cap) * 100) : 0;

    res.json({
      por_estado: porEstado.rows,
      bodegas_aprobadas: capacidadTotal.rows[0].bodegas_aprobadas,
      capacidad_total_ton: cap,
      stock_actual_ton: stock,
      ocupacion_pct,
      top_bodegas: topBodegas.rows,
    });
  } catch (error) {
    console.error('Error dashboard infraestructura:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/dashboard/admin/precios — Comparación de 3 tipos de precio
router.get('/precios', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const estado = getEstado(req);
    const wPr = estadoWhere(estado, 'estado', 1);
    const [promedios, recientes, tendencia] = await Promise.all([
      pool.query(`
        SELECT
          tipo_precio,
          tipo_maiz,
          AVG(precio)::numeric(10,2) AS promedio,
          MIN(precio)::numeric(10,2) AS minimo,
          MAX(precio)::numeric(10,2) AS maximo,
          COUNT(*)::int AS registros,
          MAX(fecha) AS ultima_fecha
        FROM precios
        WHERE fecha >= NOW() - INTERVAL '30 days'
          AND tipo_precio IN ('observado', 'bodega', 'mercado_internacional')
          ${wPr.sql}
        GROUP BY tipo_precio, tipo_maiz
        ORDER BY tipo_precio, tipo_maiz
      `, wPr.params),
      pool.query(`
        SELECT DISTINCT ON (tipo_precio)
          tipo_precio,
          tipo_maiz,
          precio,
          fecha,
          estado,
          municipio
        FROM precios
        WHERE tipo_precio IN ('observado', 'bodega', 'mercado_internacional')
          ${wPr.sql}
        ORDER BY tipo_precio, fecha DESC
      `, wPr.params),
      pool.query(`
        SELECT
          DATE_TRUNC('week', fecha)::date AS semana,
          tipo_precio,
          AVG(precio)::numeric(10,2) AS promedio
        FROM precios
        WHERE fecha >= NOW() - INTERVAL '90 days'
          AND tipo_precio IN ('observado', 'bodega', 'mercado_internacional')
          ${wPr.sql}
        GROUP BY semana, tipo_precio
        ORDER BY semana, tipo_precio
      `, wPr.params),
    ]);

    res.json({
      promedios: promedios.rows,
      recientes: recientes.rows,
      tendencia: tendencia.rows,
    });
  } catch (error) {
    console.error('Error dashboard precios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/dashboard/admin/alertas — Alertas por severidad, estado, tipo
router.get('/alertas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const estado = getEstado(req);
    const ep = estado ? [estado] : [];
    // Join con up para filtrar por estado cuando el usuario es OREF
    const joinUp = estado ? `JOIN up u2 ON u2.up_id = a.up_id AND u2.nombre_estado = $1` : `LEFT JOIN up u2 ON u2.up_id = a.up_id`;

    const [porNivel, porEstado, porTipo, recientes, tendencia] = await Promise.all([
      pool.query(`
        SELECT a.nivel_alerta, COUNT(*)::int AS total
        FROM alertas a
        ${joinUp}
        GROUP BY a.nivel_alerta
        ORDER BY CASE a.nivel_alerta WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 WHEN 'bajo' THEN 4 ELSE 5 END
      `, ep),
      pool.query(`
        SELECT a.estado_alerta, COUNT(*)::int AS total
        FROM alertas a
        ${joinUp}
        GROUP BY a.estado_alerta
        ORDER BY total DESC
      `, ep),
      pool.query(`
        SELECT a.tipo_alerta, COUNT(*)::int AS total, a.nivel_alerta
        FROM alertas a
        ${joinUp}
        WHERE a.estado_alerta = 'pendiente'
        GROUP BY a.tipo_alerta, a.nivel_alerta
        ORDER BY total DESC
        LIMIT 10
      `, ep),
      pool.query(`
        SELECT
          a.id, a.tipo_alerta, a.nivel_alerta, a.estado_alerta, a.fecha_alerta,
          p.nombres, p.apellido_paterno,
          u.nombre_up, u.nombre_estado
        FROM alertas a
        LEFT JOIN productor p ON p.productor_id = a.productor_id
        LEFT JOIN up u ON u.up_id = a.up_id
        ${estado ? `WHERE a.estado_alerta = 'pendiente' AND u.nombre_estado = $1` : `WHERE a.estado_alerta = 'pendiente'`}
        ORDER BY
          CASE a.nivel_alerta WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 ELSE 4 END,
          a.fecha_alerta DESC
        LIMIT 10
      `, ep),
      pool.query(`
        SELECT
          DATE_TRUNC('day', a.fecha_alerta)::date AS dia,
          COUNT(*)::int AS total,
          COUNT(CASE WHEN a.nivel_alerta IN ('alto','critico') THEN 1 END)::int AS criticas
        FROM alertas a
        ${joinUp}
        WHERE a.fecha_alerta >= NOW() - INTERVAL '30 days'
        GROUP BY dia
        ORDER BY dia
      `, ep),
    ]);

    const cr = porNivel.rows.find((r: any) => ['critico','alto','alta'].includes(String(r.nivel_alerta).toLowerCase()));
    const mr = porNivel.rows.find((r: any) => ['medio','media'].includes(String(r.nivel_alerta).toLowerCase()));

    res.json({
      por_nivel: porNivel.rows,
      por_estado: porEstado.rows,
      por_tipo: porTipo.rows,
      recientes_pendientes: recientes.rows,
      tendencia_diaria: tendencia.rows,
      criticas_count: cr?.total || 0,
      moderadas_count: mr?.total || 0,
    });
  } catch (error) {
    console.error('Error dashboard alertas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/dashboard/admin/operacion — Supervisores, calidad de datos, actividad
router.get('/operacion', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const [supervisores, calidadDatos, visitasRecientes, productoresRol, registrosRecientes] = await Promise.all([
      pool.query(`
        SELECT
          u.id AS supervisor_id,
          u.nombre_completo,
          u.correo_electronico,
          COUNT(DISTINCT sp.productor_id)::int AS productores_asignados,
          COUNT(DISTINCT sv.id)::int AS visitas_mes
        FROM usuarios u
        LEFT JOIN supervisor_productores sp ON sp.supervisor_id = u.id
        LEFT JOIN seguimiento_visitas sv ON sv.usuario_captura = u.id
          AND sv.fecha_visita >= NOW() - INTERVAL '30 days'
        WHERE u.rol = 'supervisor' AND u.activo = true
        GROUP BY u.id, u.nombre_completo, u.correo_electronico
        ORDER BY productores_asignados DESC
        LIMIT 20
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_ups,
          COUNT(CASE WHEN u.nombre_up IS NOT NULL THEN 1 END)::int AS con_nombre,
          COUNT(CASE WHEN u.superficie_ha_calculada > 0 THEN 1 END)::int AS con_area,
          COUNT(CASE WHEN EXISTS(SELECT 1 FROM ciclo c WHERE c.up_id = u.up_id AND c.cultivo = 'maiz') THEN 1 END)::int AS con_ciclo,
          COUNT(CASE WHEN EXISTS(SELECT 1 FROM ciclo_cultivo cc JOIN ciclo c ON c.ciclo_id = cc.ciclo_id WHERE c.up_id = u.up_id AND c.cultivo = 'maiz') THEN 1 END)::int AS con_cultivo
        FROM up u
        WHERE ${soloMaizDeUp('u')}
      `),
      pool.query(`
        SELECT
          sv.id, sv.fecha_visita, sv.etapa_cultivo AS tipo_visita,
          p.nombres, p.apellido_paterno,
          u.nombre_up,
          usu.nombre_completo AS tecnico
        FROM seguimiento_visitas sv
        JOIN up u ON u.up_id = sv.up_id
        JOIN productor p ON p.productor_id = sv.productor_id AND ${soloMaiz('p')}
        LEFT JOIN usuarios usu ON usu.id = sv.usuario_captura
        ORDER BY sv.fecha_visita DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT rol, COUNT(*)::int AS total
        FROM usuarios
        WHERE activo = true
        GROUP BY rol
        ORDER BY total DESC
      `),
      pool.query(`
        SELECT
          DATE_TRUNC('day', creado_en)::date AS dia,
          COUNT(*)::int AS nuevos_productores
        FROM productor p
        WHERE creado_en >= NOW() - INTERVAL '30 days' AND ${soloMaiz('p')}
        GROUP BY dia
        ORDER BY dia
      `),
    ]);

    const cd = calidadDatos.rows[0];
    const total = cd.total_ups || 1;
    const calidad = {
      total_ups: cd.total_ups,
      con_nombre_pct: Math.round((cd.con_nombre / total) * 100),
      con_area_pct: Math.round((cd.con_area / total) * 100),
      con_ciclo_pct: Math.round((cd.con_ciclo / total) * 100),
      con_cultivo_pct: Math.round((cd.con_cultivo / total) * 100),
    };

    res.json({
      supervisores: supervisores.rows,
      calidad_datos: calidad,
      visitas_recientes: visitasRecientes.rows,
      usuarios_por_rol: productoresRol.rows,
      registro_diario: registrosRecientes.rows,
    });
  } catch (error) {
    console.error('Error dashboard operación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/dashboard/admin/mapa — Datos geográficos para el mapa
router.get('/mapa', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!esPanelAdmin(req, res)) return;
  try {
    const estado = getEstado(req);
    const wU = estadoWhere(estado, 'u.nombre_estado', 1);
    const wB = estadoWhere(estado, 'b.estado', 1);
    const [upsGeo, bodegasGeo, porEstado, alertasGeo] = await Promise.all([
      pool.query(`
        SELECT
          u.up_id, u.nombre_up, u.nombre_estado, u.nombre_municipio,
          u.superficie_ha_calculada AS area_ha,
          ST_X(u.centroide) AS lng, ST_Y(u.centroide) AS lat,
          COUNT(a.id)::int AS alertas,
          COUNT(CASE WHEN a.nivel_alerta IN ('critico','alto') THEN 1 END)::int AS alertas_criticas
        FROM up u
        LEFT JOIN alertas a ON a.up_id = u.up_id AND a.estado_alerta = 'pendiente'
        WHERE u.centroide IS NOT NULL AND ${soloMaizDeUp('u')} ${wU.sql}
        GROUP BY u.up_id, u.nombre_up, u.nombre_estado, u.nombre_municipio, u.superficie_ha_calculada, u.centroide
        LIMIT 2000
      `, wU.params),
      pool.query(`
        SELECT
          b.id, b.nombre, b.estado, b.municipio,
          b.latitud AS lat, b.longitud AS lng,
          b.capacidad_ton AS capacidad_toneladas,
          COALESCE(
            (SELECT i.volumen_almacenamiento FROM inventarios i
             WHERE i.bodega_id = b.id ORDER BY i.fecha DESC LIMIT 1), 0
          )::numeric(10,2) AS stock_actual,
          CASE WHEN b.capacidad_ton > 0
            THEN ROUND((COALESCE(
              (SELECT i.volumen_almacenamiento FROM inventarios i
               WHERE i.bodega_id = b.id ORDER BY i.fecha DESC LIMIT 1), 0
            ) / b.capacidad_ton) * 100)::int
            ELSE 0 END AS ocupacion_pct
        FROM bodegas b
        WHERE b.latitud IS NOT NULL AND b.longitud IS NOT NULL ${wB.sql}
        LIMIT 1000
      `, wB.params),
      pool.query(`
        SELECT
          u.nombre_estado AS estado,
          COUNT(DISTINCT u.up_id)::int AS ups,
          COUNT(DISTINCT p.productor_id)::int AS productores,
          COALESCE(SUM(u.superficie_ha_calculada), 0)::numeric(10,2) AS superficie_ha,
          COALESCE(SUM(ec.produccion_estimada_ton), 0)::numeric(10,2) AS produccion_ton
        FROM up u
        JOIN productor p ON p.productor_id = u.productor_id
        LEFT JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'maiz'
        LEFT JOIN estimacion_cosecha ec ON ec.up_id = u.up_id AND ec.ciclo_id = c.ciclo_id
        WHERE u.nombre_estado IS NOT NULL AND ${soloMaizDeUp('u')} ${wU.sql}
        GROUP BY u.nombre_estado
        ORDER BY produccion_ton DESC
      `, wU.params),
      pool.query(`
        SELECT
          a.id, a.tipo_alerta, a.nivel_alerta, a.estado_alerta,
          u.nombre_up, u.nombre_estado, u.nombre_municipio,
          ST_X(u.centroide) AS lng, ST_Y(u.centroide) AS lat
        FROM alertas a
        JOIN up u ON u.up_id = a.up_id AND u.centroide IS NOT NULL
        WHERE a.estado_alerta = 'pendiente' ${wU.sql}
        ORDER BY CASE a.nivel_alerta WHEN 'critico' THEN 1 WHEN 'alto' THEN 2 WHEN 'medio' THEN 3 ELSE 4 END
        LIMIT 300
      `, wU.params),
    ]);

    res.json({
      ups: upsGeo.rows,
      bodegas: bodegasGeo.rows,
      por_estado: porEstado.rows,
      alertas: alertasGeo.rows,
    });
  } catch (error) {
    console.error('Error dashboard mapa:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
