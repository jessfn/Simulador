// Consulta y exportación de la encuesta de insumos para la Secretaría
// (Ticket 04). Reutiliza los mismos datos que el productor/técnico ya
// capturaron — nunca calcula demanda propia. Todo bajo permiso explícito
// (vista 'insumos') y respetando el filtro territorial del admin cuando
// su rol lo tiene configurado (estadoClause).
import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';

const router = Router();

router.use(authMiddleware);

// GET /api/admin/insumos/ediciones — para el selector de periodo
router.get('/ediciones', checkPermiso('insumos', 'ver'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await pool.query(`SELECT id, nombre, version_catalogo, horizonte_meses, habilitada, created_at FROM encuesta_ediciones ORDER BY id DESC`);
    res.json({ ediciones: r.rows });
  } catch (e) {
    console.error('Error al listar ediciones:', e);
    res.status(500).json({ error: 'Error al listar ediciones' });
  }
});

// Construye el filtro territorial del admin (misma estrategia que
// estadoClause de admin-permisos, adaptada a EXISTS sobre contexto
// territorial en vez de una columna `estado` directa).
async function filtroTerritorialAdmin(req: AuthRequest): Promise<{ sql: string; val: string | null }> {
  try {
    const rolRow = await pool.query('SELECT aplica_filtro_estado FROM roles_panel WHERE clave=$1', [req.user?.rol]);
    if (!rolRow.rows[0]?.aplica_filtro_estado || !req.user) return { sql: '', val: null };
    const u = await pool.query('SELECT estado_asignado FROM usuarios WHERE id=$1', [req.user.userId]);
    const estado = u.rows[0]?.estado_asignado;
    if (!estado) return { sql: '', val: null };
    return {
      sql: `AND EXISTS (SELECT 1 FROM encuesta_contexto_territorial ectf JOIN up uf ON uf.up_id = ectf.up_id
              WHERE ectf.respuesta_id = r.id AND UPPER(uf.state_name) = UPPER($`,
      val: estado,
    };
  } catch {
    return { sql: '', val: null };
  }
}

interface Filtros {
  edicion_id?: string; categoria?: string; producto?: string;
  municipio?: string; respuesta?: string; identificacion?: string;
}

function armarFiltros(query: any, params: any[], startIdx: number): { where: string; params: any[] } {
  const f: Filtros = query;
  const clauses: string[] = [];
  let idx = startIdx;
  if (f.edicion_id) { clauses.push(`r.edicion_id = $${idx++}`); params.push(Number(f.edicion_id)); }
  if (f.respuesta === 'si' || f.respuesta === 'no') { clauses.push(`r.respuesta = $${idx++}`); params.push(f.respuesta); }
  if (f.municipio) {
    clauses.push(`EXISTS (SELECT 1 FROM encuesta_contexto_territorial ect WHERE ect.respuesta_id = r.id AND ect.municipality_id = $${idx++})`);
    params.push(f.municipio);
  }
  return { where: clauses.length ? clauses.join(' AND ') : '1=1', params };
}

// GET /api/admin/insumos/resumen — indicadores agregados
router.get('/resumen', checkPermiso('insumos', 'ver'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const edicionId = req.query.edicion_id ? Number(req.query.edicion_id) : null;
    const edicion = edicionId
      ? (await pool.query('SELECT id FROM encuesta_ediciones WHERE id=$1', [edicionId])).rows[0]
      : (await pool.query('SELECT id FROM encuesta_ediciones WHERE habilitada=TRUE ORDER BY id DESC LIMIT 1')).rows[0];
    if (!edicion) { res.status(404).json({ error: 'No hay edición vigente' }); return; }

    const territorial = await filtroTerritorialAdmin(req);
    const params: any[] = [edicion.id];
    let filtroTerr = '';
    if (territorial.val) { filtroTerr = territorial.sql + '2)'; params.push(territorial.val); }

    const municipioParam = req.query.municipio ? String(req.query.municipio) : null;
    let filtroMuni = '';
    if (municipioParam) {
      filtroMuni = `AND EXISTS (SELECT 1 FROM encuesta_contexto_territorial ectm WHERE ectm.respuesta_id = r.id AND ectm.municipality_id = $${params.length + 1})`;
      params.push(municipioParam);
    }

    const productoParam = req.query.producto ? String(req.query.producto) : null;
    const categoriaParam = req.query.categoria ? String(req.query.categoria) : null;

    const conteos = await pool.query(
      `SELECT
         COUNT(DISTINCT r.producer_id) AS productores_con_respuesta,
         COUNT(DISTINCT r.producer_id) FILTER (WHERE r.respuesta = 'si') AS productores_si,
         COUNT(DISTINCT r.producer_id) FILTER (WHERE r.respuesta = 'no') AS productores_no
       FROM encuesta_respuestas r
       WHERE r.edicion_id = $1 ${filtroTerr} ${filtroMuni}`,
      params
    );

    // Elegibles (UP en Sinaloa) que aún no responden esta edición.
    const pendientesParams: any[] = [edicion.id];
    let pendFiltroTerr = '';
    if (territorial.val) { pendFiltroTerr = `AND UPPER(u.state_name) = UPPER($2)`; pendientesParams.push(territorial.val); }
    const pendientes = await pool.query(
      `SELECT COUNT(DISTINCT p.producer_id) AS n
       FROM producer p JOIN up u ON u.producer_id = p.producer_id
       WHERE u.state_id = '25' ${pendFiltroTerr}
         AND NOT EXISTS (SELECT 1 FROM encuesta_respuestas er WHERE er.producer_id = p.producer_id AND er.edicion_id = $1)`,
      pendientesParams
    );

    const lineasParams: any[] = [edicion.id];
    let idx = 2;
    let filtroLineasTerr = '';
    if (territorial.val) { filtroLineasTerr = territorial.sql + `${idx})`; lineasParams.push(territorial.val); idx++; }
    let filtroLineasMuni = '';
    if (municipioParam) { filtroLineasMuni = `AND EXISTS (SELECT 1 FROM encuesta_contexto_territorial ectm2 WHERE ectm2.respuesta_id = r.id AND ectm2.municipality_id = $${idx})`; lineasParams.push(municipioParam); idx++; }
    let filtroCategoria = '';
    if (categoriaParam) { filtroCategoria = `AND pr.categoria_id = $${idx}`; lineasParams.push(categoriaParam); idx++; }
    let filtroProducto = '';
    if (productoParam) { filtroProducto = `AND l.producto_id = $${idx}`; lineasParams.push(productoParam); idx++; }

    const lineasPendId = await pool.query(
      `SELECT COUNT(*) AS n FROM encuesta_lineas l
       JOIN encuesta_respuestas r ON r.id = l.respuesta_id
       JOIN encuesta_productos pr ON pr.id = l.producto_id
       WHERE r.edicion_id = $1 AND l.identificacion_pendiente = TRUE ${filtroLineasTerr} ${filtroLineasMuni} ${filtroCategoria} ${filtroProducto}`,
      lineasParams
    );

    const porProducto = await pool.query(
      `SELECT pr.id AS producto_id, pr.nombre_visible, l.producto_nombre_otro, l.unidad_base, l.mes_compra,
              SUM(l.cantidad_base) AS cantidad_total, COUNT(DISTINCT r.producer_id) AS productores
       FROM encuesta_lineas l
       JOIN encuesta_respuestas r ON r.id = l.respuesta_id
       JOIN encuesta_productos pr ON pr.id = l.producto_id
       WHERE r.edicion_id = $1 ${filtroLineasTerr} ${filtroLineasMuni} ${filtroCategoria} ${filtroProducto}
       GROUP BY pr.id, pr.nombre_visible, l.producto_nombre_otro, l.unidad_base, l.mes_compra
       ORDER BY pr.nombre_visible, l.mes_compra`,
      lineasParams
    );

    res.json({
      edicion_id: edicion.id,
      productores_con_respuesta: Number(conteos.rows[0].productores_con_respuesta),
      productores_si: Number(conteos.rows[0].productores_si),
      productores_no: Number(conteos.rows[0].productores_no),
      productores_pendientes: Number(pendientes.rows[0].n),
      lineas_por_identificar: Number(lineasPendId.rows[0].n),
      cantidad_por_producto: porProducto.rows,
    });
  } catch (e) {
    console.error('Error al obtener resumen de insumos:', e);
    res.status(500).json({ error: 'Error al obtener el resumen' });
  }
});

// GET /api/admin/insumos/municipios — municipios con al menos una respuesta,
// para poblar el filtro (respeta el filtro territorial del admin).
router.get('/municipios', checkPermiso('insumos', 'ver'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const territorial = await filtroTerritorialAdmin(req);
    const params: any[] = [];
    let filtroTerr = '';
    if (territorial.val) { filtroTerr = `AND UPPER(u.state_name) = UPPER($1)`; params.push(territorial.val); }
    const r = await pool.query(
      `SELECT DISTINCT ect.municipality_id, ect.municipality_name
       FROM encuesta_contexto_territorial ect
       JOIN up u ON u.up_id = ect.up_id
       WHERE ect.municipality_id IS NOT NULL ${filtroTerr}
       ORDER BY ect.municipality_name`,
      params
    );
    res.json({ municipios: r.rows });
  } catch (e) {
    console.error('Error al listar municipios de insumos:', e);
    res.status(500).json({ error: 'Error al listar municipios' });
  }
});

// GET /api/admin/insumos/lineas — tabla detallada (una fila por línea),
// paginada, con filtros. Municipios asociados agrupados en una celda —
// nunca multiplica el volumen por relación territorial.
router.get('/lineas', checkPermiso('insumos', 'ver'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const territorial = await filtroTerritorialAdmin(req);
    const params: any[] = [];
    const { where, params: paramsConFiltros } = armarFiltros(req.query, params, 1);
    let sql = `SELECT l.id AS linea_id, l.respuesta_id, r.producer_id, p.nombres, p.apellido_paterno, p.apellido_materno,
                      r.edicion_id, r.version_catalogo, pr.categoria_id, pr.nombre_visible AS producto,
                      l.producto_nombre_otro, l.presentacion_id, l.presentacion_otro_envase,
                      l.presentacion_otro_contenido, l.presentacion_otro_unidad, l.a_granel,
                      l.cantidad, l.cantidad_base, l.unidad_base, l.mes_compra,
                      l.identificacion_pendiente, l.nombre_conocido, r.updated_at,
                      (SELECT STRING_AGG(DISTINCT ect.municipality_name, ', ' ORDER BY ect.municipality_name)
                       FROM encuesta_contexto_territorial ect WHERE ect.respuesta_id = r.id) AS municipios_asociados
               FROM encuesta_lineas l
               JOIN encuesta_respuestas r ON r.id = l.respuesta_id
               JOIN producer p ON p.producer_id = r.producer_id
               JOIN encuesta_productos pr ON pr.id = l.producto_id
               WHERE ${where}`;
    if (req.query.categoria) { sql += ` AND pr.categoria_id = $${paramsConFiltros.length + 1}`; paramsConFiltros.push(req.query.categoria); }
    if (territorial.val) { sql += ` ${territorial.sql}${paramsConFiltros.length + 1})`; paramsConFiltros.push(territorial.val); }
    sql += ' ORDER BY r.updated_at DESC LIMIT 500';

    const r = await pool.query(sql, paramsConFiltros);
    res.json({ lineas: r.rows });
  } catch (e) {
    console.error('Error al listar líneas de insumos:', e);
    res.status(500).json({ error: 'Error al listar líneas' });
  }
});

// GET /api/admin/insumos/export?tipo=lineas|no — CSV. Nunca incluye CURP,
// NIP ni teléfono. Neutraliza texto libre para no ejecutarse como fórmula
// al abrir en hoja de cálculo (Otro / nombre libre).
function csvCelda(v: any): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get('/export', checkPermiso('insumos', 'exportar'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tipo = req.query.tipo === 'no' ? 'no' : 'lineas';
    const territorial = await filtroTerritorialAdmin(req);

    if (tipo === 'no') {
      const params: any[] = [];
      const { where, params: p2 } = armarFiltros({ ...req.query, respuesta: 'no' }, params, 1);
      let sql = `SELECT r.producer_id, p.nombres, p.apellido_paterno, p.apellido_materno, r.edicion_id, r.updated_at,
                        (SELECT STRING_AGG(DISTINCT ect.municipality_name, ', ') FROM encuesta_contexto_territorial ect WHERE ect.respuesta_id = r.id) AS municipios
                 FROM encuesta_respuestas r JOIN producer p ON p.producer_id = r.producer_id
                 WHERE ${where}`;
      if (territorial.val) { sql += ` ${territorial.sql}${p2.length + 1})`; p2.push(territorial.val); }
      sql += ' ORDER BY r.updated_at DESC';
      const r = await pool.query(sql, p2);
      const header = ['producer_id', 'nombre', 'edicion_id', 'municipios_asociados', 'fecha_actualizacion'];
      const filas = r.rows.map(row => [
        row.producer_id,
        `${row.nombres || ''} ${row.apellido_paterno || ''} ${row.apellido_materno || ''}`.trim(),
        row.edicion_id, row.municipios, row.updated_at,
      ].map(csvCelda).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="encuesta_insumos_respuestas_no.csv"');
      res.send('﻿' + [header.join(','), ...filas].join('\n'));
      return;
    }

    const params: any[] = [];
    const { where, params: p2 } = armarFiltros(req.query, params, 1);
    let sql = `SELECT l.id AS linea_id, r.id AS respuesta_id, r.producer_id, r.edicion_id, r.version_catalogo,
                      pr.categoria_id AS categoria, pr.nombre_visible AS producto, l.producto_nombre_otro AS producto_otro,
                      COALESCE(pre.envase, l.presentacion_otro_envase, CASE WHEN l.a_granel THEN 'A granel' END) AS envase,
                      COALESCE(pre.contenido, l.presentacion_otro_contenido) AS contenido_envase,
                      COALESCE(pre.unidad, l.presentacion_otro_unidad) AS unidad_envase,
                      l.cantidad AS cantidad_capturada, l.cantidad_base, l.unidad_base, l.mes_compra,
                      l.identificacion_pendiente, l.nombre_conocido,
                      (SELECT STRING_AGG(DISTINCT ect.municipality_name, ', ') FROM encuesta_contexto_territorial ect WHERE ect.respuesta_id = r.id) AS municipios_asociados,
                      r.updated_at AS fecha_actualizacion
               FROM encuesta_lineas l
               JOIN encuesta_respuestas r ON r.id = l.respuesta_id
               JOIN encuesta_productos pr ON pr.id = l.producto_id
               LEFT JOIN encuesta_presentaciones pre ON pre.id = l.presentacion_id
               WHERE ${where}`;
    if (req.query.categoria) { sql += ` AND pr.categoria_id = $${p2.length + 1}`; p2.push(req.query.categoria); }
    if (territorial.val) { sql += ` ${territorial.sql}${p2.length + 1})`; p2.push(territorial.val); }
    sql += ' ORDER BY r.updated_at DESC';
    const r = await pool.query(sql, p2);

    const header = ['linea_id', 'respuesta_id', 'producer_id', 'edicion_id', 'version_catalogo', 'categoria',
      'producto', 'producto_otro', 'envase', 'contenido_envase', 'unidad_envase',
      'cantidad_capturada', 'cantidad_base', 'unidad_base', 'mes_compra',
      'identificacion_pendiente', 'nombre_conocido', 'municipios_asociados', 'fecha_actualizacion'];
    const filas = r.rows.map(row => header.map(k => csvCelda(row[k])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="encuesta_insumos_lineas.csv"');
    res.send('﻿' + [header.join(','), ...filas].join('\n'));
  } catch (e) {
    console.error('Error al exportar insumos:', e);
    res.status(500).json({ error: 'Error al exportar' });
  }
});

export default router;
