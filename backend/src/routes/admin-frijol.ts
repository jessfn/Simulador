import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { PROGRAMA_FRIJOL } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';

const router = Router();
const ver = checkPermiso('frijol', 'ver');
const exportar = checkPermiso('frijol', 'exportar');

function fallo(res: Response, error: unknown, donde: string): void {
  console.error(`[${donde}]`, error);
  res.status(500).json({ error: 'Error al consultar el módulo de frijol' });
}

interface Filtros {
  q?: string; estado?: string; municipio?: string; tecnico?: string; tipo_tecnico?: string; ciclo?: string; variedad?: string;
  verificacion?: string; estatus?: string; destino?: string; semillas?: string; pendiente14?: string; desde?: string; hasta?: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Una fila por cultivo registrado (cycle_crop de frijol). Los filtros llegan como parametros, nunca concatenados. */
function condiciones(f: Filtros): { where: string; params: unknown[] } {
  const params: unknown[] = [PROGRAMA_FRIJOL];
  const cond = ["c.crop = 'frijol'", 'pp.programa = $1'];
  const igual = (col: string, v: unknown) => { params.push(v); cond.push(`${col} = $${params.length}`); };
  if (f.q) { params.push(`%${f.q}%`); const n = params.length; cond.push(`(p.nombres ILIKE $${n} OR p.apellido_paterno ILIKE $${n} OR p.apellido_materno ILIKE $${n} OR p.curp ILIKE $${n})`); }
  if (f.estado) igual('u.state_id', f.estado);
  if (f.municipio) igual('u.municipality_id', f.municipio);
  if (f.verificacion) igual('pp.verificacion_identidad', f.verificacion);
  if (f.estatus) igual('pp.estatus_registro', f.estatus);
  if (f.tecnico && /^\d+$/.test(f.tecnico)) igual('pp.usuario_capturista_id', Number(f.tecnico));
  if (f.tipo_tecnico) igual('t.tipo_tecnico', f.tipo_tecnico);
  if (f.ciclo) igual("(c.cycle_year::text || '-' || c.cycle_type)", f.ciclo);
  if (f.variedad) igual('cc.variety_id', f.variedad);
  if (f.destino) igual('cc.destination', f.destino);
  if (f.semillas === 'si') cond.push('s.cumple_criterio_original IS TRUE');
  if (f.semillas === 'no') cond.push('s.cumple_criterio_original IS NOT TRUE');
  if (f.pendiente14 === '1') cond.push("pp.verificacion_identidad = 'pendiente' AND pp.fecha_alta < NOW() - INTERVAL '14 days'");
  if (f.desde && FECHA.test(f.desde)) { params.push(f.desde); cond.push(`cc.created_at >= $${params.length}::date`); }
  if (f.hasta && FECHA.test(f.hasta)) { params.push(f.hasta); cond.push(`cc.created_at < ($${params.length}::date + 1)`); }
  return { where: cond.join(' AND '), params };
}

const DESDE = `
  FROM cycle_crop cc
  JOIN cycle c ON c.cycle_id = cc.cycle_id
  JOIN up u ON u.up_id = c.up_id
  JOIN producer p ON p.producer_id = u.producer_id
  JOIN producer_programa pp ON pp.producer_id = p.producer_id
  LEFT JOIN frijol_cultivo fc ON fc.cycle_crop_id = cc.cycle_crop_id
  LEFT JOIN frijol_productor fp ON fp.producer_id = p.producer_id
  LEFT JOIN frijol_semillas s ON s.up_id = u.up_id
  LEFT JOIN usuarios t ON t.id = pp.usuario_capturista_id
  LEFT JOIN cat_crop_variety cv ON cv.code = cc.variety_id AND cv.crop = 'frijol'`;

const filtrosDe = (q: AuthRequest['query']): Filtros => {
  const g = (k: string) => (q[k] ? String(q[k]).trim() : undefined);
  return { q: g('q'), estado: g('estado'), municipio: g('municipio'), tecnico: g('tecnico'), tipo_tecnico: g('tipo_tecnico'), ciclo: g('ciclo'),
    variedad: g('variedad'), verificacion: g('verificacion'), estatus: g('estatus'), destino: g('destino'), semillas: g('semillas'),
    pendiente14: g('pendiente14'), desde: g('desde'), hasta: g('hasta') };
};

/** Etiqueta legible de un valor de catalogo (no codigos en las pantallas ni en el Excel). */
const etq = (catalogo: string, expr: string) => `(SELECT label FROM cat_catalog WHERE catalog = '${catalogo}' AND code = ${expr})`;
const VARIEDAD = "COALESCE(cv.label, cc.variety_other, cc.variety_id)";
const CICLO = "(c.cycle_year::text || '-' || c.cycle_type)";

// GET /api/admin/frijol/resumen — tarjetas y desgloses (respetan los filtros)
router.get('/resumen', authMiddleware, ver, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { where, params } = condiciones(filtrosDe(req.query));
    const tot = await pool.query(
      `SELECT COUNT(DISTINCT p.producer_id)::int AS productores, COUNT(DISTINCT u.up_id)::int AS parcelas, COUNT(*)::int AS cultivos,
              COALESCE(SUM(cc.area_sown_ha), 0)::float AS hectareas,
              COALESCE(SUM(cc.area_sown_ha * cc.yield_expected), 0)::float AS produccion_estimada_t,
              COUNT(DISTINCT p.producer_id) FILTER (WHERE pp.verificacion_identidad = 'pendiente')::int AS por_verificar,
              COUNT(DISTINCT p.producer_id) FILTER (WHERE pp.verificacion_identidad = 'pendiente' AND pp.fecha_alta < NOW() - INTERVAL '14 days')::int AS pendientes_14_dias,
              COUNT(DISTINCT p.producer_id) FILTER (WHERE pp.estatus_registro = 'requiere_correccion' OR pp.verificacion_identidad = 'no_valida')::int AS por_corregir,
              COUNT(DISTINCT u.up_id) FILTER (WHERE s.cumple_criterio_original)::int AS cumplen_criterio_semillas,
              COUNT(*) FILTER (WHERE fc.hubo_desconexion)::int AS capturados_sin_senal
         ${DESDE} WHERE ${where}`, params);
    const grupo = (sel: string, extra = '') => pool.query(
      `SELECT ${sel} ${DESDE} WHERE ${where} GROUP BY 1 ${extra}`, params);
    const [porEstado, porVariedad, porTecnico, porCiclo] = await Promise.all([
      grupo(`COALESCE(u.state_name, 'Sin estado') AS estado, COUNT(DISTINCT p.producer_id)::int AS productores, COUNT(DISTINCT u.up_id)::int AS parcelas, COALESCE(SUM(cc.area_sown_ha), 0)::float AS hectareas`, 'ORDER BY hectareas DESC'),
      grupo(`${VARIEDAD} AS variedad, COUNT(*)::int AS cultivos, COALESCE(SUM(cc.area_sown_ha), 0)::float AS hectareas`, 'ORDER BY hectareas DESC LIMIT 15'),
      grupo(`COALESCE(t.nombre_completo, 'Sin técnico') AS tecnico, COUNT(DISTINCT p.producer_id)::int AS productores`, 'ORDER BY productores DESC'),
      grupo(`${CICLO} AS ciclo, COUNT(*)::int AS cultivos, COALESCE(SUM(cc.area_sown_ha), 0)::float AS hectareas`, 'ORDER BY 1 DESC'),
    ]);
    const porDia = await pool.query(
      `SELECT to_char(pp.fecha_alta::date, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS registros FROM producer_programa pp
        WHERE pp.programa = $1 AND pp.fecha_alta >= NOW() - INTERVAL '30 days' GROUP BY 1 ORDER BY 1`, [PROGRAMA_FRIJOL]);
    res.json({ totales: tot.rows[0], por_estado: porEstado.rows, por_variedad: porVariedad.rows, por_tecnico: porTecnico.rows, por_ciclo: porCiclo.rows, por_dia: porDia.rows });
  } catch (e) { fallo(res, e, 'GET /admin/frijol/resumen'); }
});

// GET /api/admin/frijol/filtros — opciones para los selectores
router.get('/filtros', authMiddleware, ver, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const estado = req.query.estado ? String(req.query.estado) : null;
    const frijol = `EXISTS (SELECT 1 FROM cycle c WHERE c.up_id = u.up_id AND c.crop = 'frijol')`;
    const [estados, municipios, tecnicos, ciclos, variedades, destinos, tipos] = await Promise.all([
      pool.query(`SELECT DISTINCT u.state_id, u.state_name FROM up u WHERE ${frijol} AND u.state_id IS NOT NULL ORDER BY u.state_name`),
      pool.query(`SELECT DISTINCT u.municipality_id, u.municipality_name FROM up u WHERE ${frijol} AND u.municipality_id IS NOT NULL AND ($1::text IS NULL OR u.state_id = $1) ORDER BY u.municipality_name`, [estado]),
      pool.query(`SELECT DISTINCT t.id::int AS id, t.nombre_completo FROM producer_programa pp JOIN usuarios t ON t.id = pp.usuario_capturista_id WHERE pp.programa = $1 ORDER BY t.nombre_completo`, [PROGRAMA_FRIJOL]),
      pool.query(`SELECT DISTINCT (cycle_year::text || '-' || cycle_type) AS ciclo FROM cycle WHERE crop = 'frijol' ORDER BY 1 DESC`),
      pool.query(`SELECT code, label FROM cat_crop_variety WHERE crop = 'frijol' AND is_active ORDER BY (code IN ('CRIOLLO_LOCAL','OTRA')), sort_order, label`),
      pool.query(`SELECT code, label FROM cat_catalog WHERE catalog = 'destino_frijol' AND is_active ORDER BY sort_order`),
      pool.query(`SELECT code, label FROM cat_catalog WHERE catalog = 'tipo_tecnico' AND is_active ORDER BY sort_order`),
    ]);
    res.json({ estados: estados.rows, municipios: municipios.rows, tecnicos: tecnicos.rows, ciclos: ciclos.rows.map(r => r.ciclo),
      variedades: variedades.rows, destinos: destinos.rows, tipos_tecnico: tipos.rows });
  } catch (e) { fallo(res, e, 'GET /admin/frijol/filtros'); }
});

const ORDENES: Record<string, string> = {
  fecha: 'cc.created_at', productor: 'p.apellido_paterno, p.nombres', ha: 'cc.area_sown_ha', produccion: '(cc.area_sown_ha * cc.yield_expected)',
  estado: 'u.state_name, u.municipality_name', ciclo: 'c.cycle_year, c.cycle_type', variedad: VARIEDAD,
};

// GET /api/admin/frijol/registros — un renglon por cultivo, de 50 en 50
router.get('/registros', authMiddleware, ver, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const limite = Math.min(100, Math.max(5, Number(req.query.limite) || 50));
    const orden = ORDENES[String(req.query.orden || 'fecha')] || ORDENES.fecha;
    const dir = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const { where, params } = condiciones(filtrosDe(req.query));
    const total = await pool.query(`SELECT COUNT(*)::int AS n ${DESDE} WHERE ${where}`, params);
    const filas = await pool.query(
      `SELECT cc.cycle_crop_id::int AS cycle_crop_id, p.producer_id::int AS producer_id, p.curp,
              concat_ws(' ', p.nombres, p.apellido_paterno, p.apellido_materno) AS productor,
              u.up_id::int AS up_id, u.up_name, u.numero_up, fp.total_ups_declaradas, u.area_ha_calc::float AS ha_parcela,
              u.state_name AS estado, u.municipality_name AS municipio, u.localidad,
              ${CICLO} AS ciclo, ${VARIEDAD} AS variedad, cc.area_sown_ha::float AS ha_sembradas,
              cc.yield_expected::float AS rendimiento_esperado_t_ha, (cc.area_sown_ha * cc.yield_expected)::float AS produccion_estimada_t,
              ${etq('destino_frijol', 'cc.destination')} AS destino, to_char(cc.planting_date, 'YYYY-MM-DD') AS fecha_siembra,
              pp.verificacion_identidad, pp.estatus_registro, pp.fecha_alta, t.nombre_completo AS tecnico,
              CASE WHEN pp.verificacion_identidad = 'pendiente' THEN GREATEST(0, (CURRENT_DATE - pp.fecha_alta::date))::int END AS dias_pendiente,
              s.cumple_criterio_original, fc.hubo_desconexion, cc.created_at
         ${DESDE} WHERE ${where} ORDER BY ${orden} ${dir}, cc.cycle_crop_id DESC
        LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, params);
    res.json({ registros: filas.rows, total: total.rows[0].n, pagina, limite, paginas: Math.max(1, Math.ceil(total.rows[0].n / limite)) });
  } catch (e) { fallo(res, e, 'GET /admin/frijol/registros'); }
});

// GET /api/admin/frijol/mapa — poligonos (GeoJSON) con productor, superficie, variedad y estatus
router.get('/mapa', authMiddleware, ver, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { where, params } = condiciones(filtrosDe(req.query));
    const r = await pool.query(
      `SELECT u.up_id::int AS up_id, u.up_name, p.producer_id::int AS producer_id, concat_ws(' ', p.nombres, p.apellido_paterno) AS productor,
              u.state_name AS estado, u.municipality_name AS municipio, u.area_ha_calc::float AS ha,
              string_agg(DISTINCT ${VARIEDAD}, ', ') AS variedad, SUM(cc.area_sown_ha)::float AS ha_sembradas,
              MIN(pp.verificacion_identidad) AS verificacion_identidad, MIN(pp.estatus_registro) AS estatus_registro,
              ST_AsGeoJSON(ST_Simplify(u.geom, 0.00001))::json AS geom
         ${DESDE} WHERE ${where} AND u.geom IS NOT NULL GROUP BY u.up_id, p.producer_id LIMIT 5000`, params);
    res.json({ type: 'FeatureCollection', features: r.rows.map(x => ({
      type: 'Feature', geometry: x.geom,
      properties: { up_id: x.up_id, producer_id: x.producer_id, nombre: x.up_name, productor: x.productor, estado: x.estado, municipio: x.municipio,
        ha: x.ha, ha_sembradas: x.ha_sembradas, variedad: x.variedad, verificacion: x.verificacion_identidad, estatus: x.estatus_registro },
    })) });
  } catch (e) { fallo(res, e, 'GET /admin/frijol/mapa'); }
});

// GET /api/admin/frijol/productores/:id — detalle completo, solo lectura, con historial de cambios
router.get('/productores/:id', authMiddleware, ver, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!/^\d+$/.test(req.params.id)) { res.status(400).json({ error: 'Identificador inválido' }); return; }
    const id = Number(req.params.id);
    const base = await pool.query(
      `SELECT p.producer_id::int AS producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, p.sexo,
              to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, p.phone AS telefono, p.correo AS correo,
              p.localidad, gs.name AS estado, gm.name AS municipio,
              pp.verificacion_identidad, pp.estatus_registro, pp.verificacion_intentos, pp.verificacion_ultimo_intento, pp.fecha_alta,
              t.nombre_completo AS tecnico, ${etq('tipo_tecnico', 't.tipo_tecnico')} AS tipo_tecnico,
              fp.total_ups_declaradas, fp.participa_programas_sader,
              (SELECT string_agg(g.nombre, ', ' ORDER BY g.nombre) FROM cat_programas_gobierno g WHERE g.clave = ANY(fp.programas_sader)) AS programas_sader,
              fp.programas_sader_otro, fp.organizacion, ${etq('seguro_agricola', 'fp.seguro_agricola')} AS seguro_agricola, fp.seguro_agricola_nombre
         FROM producer p
         JOIN producer_programa pp ON pp.producer_id = p.producer_id AND pp.programa = $2
         LEFT JOIN frijol_productor fp ON fp.producer_id = p.producer_id
         LEFT JOIN usuarios t ON t.id = pp.usuario_capturista_id
         LEFT JOIN geo_state gs ON gs.state_id = p.state_id
         LEFT JOIN geo_municipality gm ON gm.municipality_id = p.municipality_id
        WHERE p.producer_id = $1`, [id, PROGRAMA_FRIJOL]);
    if (!base.rows[0]) { res.status(404).json({ error: 'Productor de frijol no encontrado' }); return; }
    const parcelas = await pool.query(
      `SELECT u.up_id::int AS up_id, u.numero_up, u.up_name, u.state_name AS estado, u.municipality_name AS municipio, u.localidad,
              ${etq('documento_propiedad', 'u.documento_propiedad')} AS documento_propiedad, u.water_regime, u.area_ha_calc::float AS ha, u.area_ha_real::float AS ha_ajustada,
              ST_Y(u.centroid)::float AS lat, ST_X(u.centroid)::float AS lng, ST_AsGeoJSON(u.geom)::json AS geom,
              s.cumple_criterio_original, s.se_dedica_produccion_semillas, s.trabajo_con_prosebien, s.usara_prosebien_pv
         FROM up u LEFT JOIN frijol_semillas s ON s.up_id = u.up_id
        WHERE u.producer_id = $1 AND EXISTS (SELECT 1 FROM cycle c WHERE c.up_id = u.up_id AND c.crop = 'frijol') ORDER BY u.numero_up NULLS LAST, u.up_id`, [id]);
    const cultivos = await pool.query(
      `SELECT cc.cycle_crop_id::int AS cycle_crop_id, c.up_id::int AS up_id, ${CICLO} AS ciclo, c.tipo_riego, ${VARIEDAD} AS variedad,
              cc.area_sown_ha::float AS ha_sembradas, to_char(cc.planting_date, 'YYYY-MM-DD') AS fecha_siembra,
              to_char(cc.estimated_harvest_date, 'YYYY-MM-DD') AS fecha_cosecha_estimada, cc.yield_expected::float AS rendimiento_esperado_t_ha,
              (cc.area_sown_ha * cc.yield_expected)::float AS produccion_estimada_t, ${etq('destino_frijol', 'cc.destination')} AS destino,
              ${etq('tipo_siembra_frijol', 'fc.tipo_siembra')} AS tipo_siembra, fc.densidad_kg_ha::float AS densidad_kg_ha, fc.usa_fertilizante,
              (SELECT string_agg(label, ', ') FROM cat_catalog WHERE catalog = 'tipo_fertilizante' AND code = ANY(fc.tipos_fertilizante)) AS tipos_fertilizante,
              ${etq('rotacion_cultivo', 'fc.rotacion')} AS rotacion, fc.observaciones, fc.hubo_desconexion, fc.capturado_en, cc.created_at
         FROM cycle_crop cc JOIN cycle c ON c.cycle_id = cc.cycle_id AND c.crop = 'frijol' JOIN up u ON u.up_id = c.up_id
         LEFT JOIN frijol_cultivo fc ON fc.cycle_crop_id = cc.cycle_crop_id LEFT JOIN cat_crop_variety cv ON cv.code = cc.variety_id AND cv.crop = 'frijol'
        WHERE u.producer_id = $1 ORDER BY c.cycle_year DESC, cc.cycle_crop_id DESC`, [id]);
    const cambios = await pool.query(
      `SELECT pc.id::int AS id, pc.campo, pc.valor_anterior, pc.valor_nuevo, COALESCE(t.nombre_completo, 'Sistema') AS quien, pc.programa, pc.created_at
         FROM producer_cambios pc LEFT JOIN usuarios t ON t.id = pc.usuario_id WHERE pc.producer_id = $1 ORDER BY pc.created_at DESC, pc.id DESC`, [id]);
    res.json({ ...base.rows[0], parcelas: parcelas.rows, cultivos: cultivos.rows, cambios: cambios.rows });
  } catch (e) { fallo(res, e, 'GET /admin/frijol/productores/:id'); }
});

// GET /api/admin/frijol/exportar — Excel (hoja "Registros" y hoja "Diccionario"); deja constancia en frijol_exportaciones
router.get('/exportar', authMiddleware, exportar, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filtros = filtrosDe(req.query);
    const { where, params } = condiciones(filtros);
    const r = await pool.query(
      `SELECT cc.cycle_crop_id::int AS cycle_crop_id, p.producer_id::int AS producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno,
              p.sexo, to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, p.phone AS telefono, p.correo AS correo,
              ${etq('verificacion_identidad', 'pp.verificacion_identidad')} AS verificacion, pp.verificacion_intentos,
              ${etq('estatus_registro_frijol', 'pp.estatus_registro')} AS estatus,
              t.nombre_completo AS tecnico, ${etq('tipo_tecnico', 't.tipo_tecnico')} AS tipo_tecnico,
              fp.total_ups_declaradas, fp.participa_programas_sader,
              (SELECT string_agg(g.nombre, ', ' ORDER BY g.nombre) FROM cat_programas_gobierno g WHERE g.clave = ANY(fp.programas_sader)) AS programas_sader,
              fp.programas_sader_otro, fp.organizacion, ${etq('seguro_agricola', 'fp.seguro_agricola')} AS seguro_agricola, fp.seguro_agricola_nombre,
              u.up_id::int AS up_id, u.numero_up, u.up_name, u.state_name AS estado, u.municipality_name AS municipio, u.localidad,
              ${etq('documento_propiedad', 'u.documento_propiedad')} AS documento_propiedad, u.documento_propiedad_otro, u.water_regime,
              u.area_ha_calc::float AS ha_calculada, u.area_ha_real::float AS ha_ajustada, ST_Y(u.centroid)::float AS latitud, ST_X(u.centroid)::float AS longitud,
              s.se_dedica_produccion_semillas, s.trabajo_con_prosebien, s.usara_prosebien_pv, s.cumple_criterio_original,
              ${CICLO} AS ciclo, ${VARIEDAD} AS variedad, cc.area_sown_ha::float AS ha_sembradas, to_char(cc.planting_date, 'YYYY-MM-DD') AS fecha_siembra,
              to_char(cc.estimated_harvest_date, 'YYYY-MM-DD') AS fecha_cosecha_estimada, cc.yield_expected::float AS rendimiento_esperado_t_ha,
              (cc.area_sown_ha * cc.yield_expected)::float AS produccion_estimada_t, ${etq('destino_frijol', 'cc.destination')} AS destino,
              ${etq('tipo_siembra_frijol', 'fc.tipo_siembra')} AS tipo_siembra, fc.densidad_kg_ha::float AS densidad_kg_ha, fc.usa_fertilizante,
              (SELECT string_agg(label, ', ') FROM cat_catalog WHERE catalog = 'tipo_fertilizante' AND code = ANY(fc.tipos_fertilizante)) AS tipos_fertilizante,
              ${etq('rotacion_cultivo', 'fc.rotacion')} AS rotacion, fc.observaciones,
              to_char(fc.capturado_en AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') AS capturado_en,
              to_char(cc.created_at AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI') AS enviado_en, fc.hubo_desconexion
         ${DESDE} WHERE ${where} ORDER BY p.apellido_paterno, p.nombres, u.numero_up NULLS LAST, cc.cycle_crop_id`, params);

    const cols: Array<{ key: string; header: string; desc: string; width?: number }> = [
      { key: 'cycle_crop_id', header: 'ID cultivo', desc: 'Identificador del cultivo registrado en el ciclo', width: 11 },
      { key: 'producer_id', header: 'ID productor', desc: 'Identificador del productor', width: 12 },
      { key: 'curp', header: 'CURP', desc: 'CURP del productor', width: 20 },
      { key: 'nombres', header: 'Nombres', desc: 'Nombre(s) del productor', width: 20 },
      { key: 'apellido_paterno', header: 'Apellido paterno', desc: 'Primer apellido', width: 18 },
      { key: 'apellido_materno', header: 'Apellido materno', desc: 'Segundo apellido', width: 18 },
      { key: 'sexo', header: 'Sexo', desc: 'H = hombre, M = mujer', width: 7 },
      { key: 'fecha_nacimiento', header: 'Fecha de nacimiento', desc: 'AAAA-MM-DD', width: 14 },
      { key: 'telefono', header: 'Teléfono', desc: 'Teléfono de contacto a 10 dígitos', width: 13 },
      { key: 'correo', header: 'Correo', desc: 'Correo electrónico (opcional)', width: 26 },
      { key: 'verificacion', header: 'Verificación de identidad', desc: 'Resultado de la consulta de la CURP: verificada, pendiente de verificación o no válida', width: 18 },
      { key: 'verificacion_intentos', header: 'Intentos de verificación', desc: 'Veces que el sistema intentó verificar la identidad', width: 11 },
      { key: 'estatus', header: 'Estatus del registro', desc: 'Enviado, requiere corrección o validado', width: 16 },
      { key: 'tecnico', header: 'Técnico que registró', desc: 'Técnico responsable del registro de frijol', width: 24 },
      { key: 'tipo_tecnico', header: 'Tipo de técnico', desc: 'ECA Productivo o ECA Agroecológico', width: 18 },
      { key: 'total_ups_declaradas', header: 'Parcelas declaradas', desc: 'Total de parcelas que el productor dice tener', width: 11 },
      { key: 'participa_programas_sader', header: 'Participa en programas de la Secretaría', desc: 'Sí/No', width: 14 },
      { key: 'programas_sader', header: 'Programas de la Secretaría', desc: 'Programas en que participa, separados por coma', width: 30 },
      { key: 'programas_sader_otro', header: 'Otro programa', desc: 'Nombre del otro programa, si lo hay', width: 22 },
      { key: 'organizacion', header: 'Organización', desc: 'Organización de productores a la que pertenece', width: 22 },
      { key: 'seguro_agricola', header: 'Seguro agrícola', desc: 'Tipo de seguro o programa de aseguramiento', width: 20 },
      { key: 'seguro_agricola_nombre', header: 'Nombre del seguro', desc: 'Nombre del seguro cuando es "otro"', width: 20 },
      { key: 'up_id', header: 'ID parcela', desc: 'Identificador de la parcela (unidad de producción)', width: 11 },
      { key: 'numero_up', header: 'No. de parcela', desc: 'Número consecutivo de la parcela del productor', width: 9 },
      { key: 'up_name', header: 'Nombre de la parcela', desc: 'Nombre dado a la parcela', width: 22 },
      { key: 'estado', header: 'Estado', desc: 'Estado donde está la parcela', width: 16 },
      { key: 'municipio', header: 'Municipio', desc: 'Municipio donde está la parcela', width: 20 },
      { key: 'localidad', header: 'Localidad', desc: 'Localidad o ejido', width: 20 },
      { key: 'documento_propiedad', header: 'Documento de propiedad', desc: 'Documento que acredita la posesión de la parcela', width: 22 },
      { key: 'documento_propiedad_otro', header: 'Otro documento', desc: 'Descripción cuando el documento es "otro"', width: 20 },
      { key: 'water_regime', header: 'Régimen hídrico', desc: 'temporal o riego', width: 11 },
      { key: 'ha_calculada', header: 'Superficie calculada (ha)', desc: 'Superficie del polígono dibujado, calculada por el sistema', width: 13 },
      { key: 'ha_ajustada', header: 'Superficie ajustada (ha)', desc: 'Superficie ajustada por el técnico, si la corrigió', width: 13 },
      { key: 'latitud', header: 'Latitud', desc: 'Latitud del centro de la parcela (grados decimales)', width: 11 },
      { key: 'longitud', header: 'Longitud', desc: 'Longitud del centro de la parcela (grados decimales)', width: 11 },
      { key: 'se_dedica_produccion_semillas', header: 'Produce semillas', desc: 'Se dedica o se ha dedicado a producir semillas', width: 11 },
      { key: 'trabajo_con_prosebien', header: 'Ha trabajado con PROSEBIEN', desc: 'Ha trabajado antes con semillas de PROSEBIEN', width: 13 },
      { key: 'usara_prosebien_pv', header: 'Usará PROSEBIEN en PV', desc: 'Usará semillas de PROSEBIEN en el ciclo primavera-verano', width: 13 },
      { key: 'cumple_criterio_original', header: 'Cumple criterio de semillas', desc: 'Calculado por el sistema: 1 a 5 ha y Durango, Nayarit o Zacatecas', width: 13 },
      { key: 'ciclo', header: 'Ciclo', desc: 'Año y ciclo agrícola, p. ej. 2026-PV', width: 10 },
      { key: 'variedad', header: 'Variedad', desc: 'Variedad de frijol sembrada', width: 20 },
      { key: 'ha_sembradas', header: 'Hectáreas sembradas', desc: 'Superficie sembrada con frijol', width: 12 },
      { key: 'fecha_siembra', header: 'Fecha de siembra', desc: 'AAAA-MM-DD', width: 13 },
      { key: 'fecha_cosecha_estimada', header: 'Fecha estimada de cosecha', desc: 'AAAA-MM-DD', width: 13 },
      { key: 'rendimiento_esperado_t_ha', header: 'Rendimiento esperado (t/ha)', desc: 'Toneladas por hectárea', width: 13 },
      { key: 'produccion_estimada_t', header: 'Producción estimada (t)', desc: 'Hectáreas sembradas por rendimiento esperado', width: 13 },
      { key: 'destino', header: 'Destino', desc: 'Destino de la producción', width: 26 },
      { key: 'tipo_siembra', header: 'Tipo de siembra', desc: 'Monocultivo o asociada (opcional)', width: 18 },
      { key: 'densidad_kg_ha', header: 'Densidad (kg/ha)', desc: 'Kilogramos de semilla por hectárea', width: 11 },
      { key: 'usa_fertilizante', header: 'Usa fertilizante', desc: 'Sí/No', width: 10 },
      { key: 'tipos_fertilizante', header: 'Tipos de fertilizante', desc: 'Tipos de fertilizante que usa, separados por coma', width: 24 },
      { key: 'rotacion', header: 'Rotación de cultivos', desc: 'Práctica de rotación', width: 24 },
      { key: 'observaciones', header: 'Observaciones', desc: 'Comentarios del técnico', width: 30 },
      { key: 'capturado_en', header: 'Capturado en', desc: 'Cuándo se empezó a capturar el registro en el teléfono (hora de México)', width: 17 },
      { key: 'enviado_en', header: 'Enviado en', desc: 'Cuándo llegó el registro al servidor (hora de México)', width: 17 },
      { key: 'hubo_desconexion', header: 'Capturado sin señal', desc: 'Sí si el teléfono estuvo sin conexión en algún momento de la captura', width: 11 },
    ];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIMAC'; wb.created = new Date();
    const estilo = (ws: ExcelJS.Worksheet) => {
      const hr = ws.getRow(1);
      hr.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5C38' } };
      hr.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      hr.height = 32;
    };
    const ws = wb.addWorksheet('Registros');
    ws.columns = cols.map(c => ({ key: c.key, header: c.header, width: c.width ?? 16 }));
    estilo(ws);
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 4 }];
    for (const fila of r.rows) ws.addRow(cols.map(c => {
      const v = (fila as Record<string, unknown>)[c.key];
      return typeof v === 'boolean' ? (v ? 'Sí' : 'No') : (v ?? '');
    }));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

    const dic = wb.addWorksheet('Diccionario');
    dic.columns = [{ header: 'Columna', key: 'c', width: 36 }, { header: 'Descripción', key: 'd', width: 90 }];
    estilo(dic);
    cols.forEach(c => dic.addRow({ c: c.header, d: c.desc }));

    await pool.query('INSERT INTO frijol_exportaciones (usuario_id, filtros, filas) VALUES ($1, $2, $3)', [req.user!.userId, JSON.stringify(filtros), r.rows.length]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="frijol_registros_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { if (!res.headersSent) fallo(res, e, 'GET /admin/frijol/exportar'); else res.end(); }
});

export default router;
