import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import pool from '../config/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (user?.rol !== 'admin' && user?.rol !== 'responsable') {
    res.status(403).json({ error: 'Acceso denegado' });
    return;
  }

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SIMAC';
    wb.created = new Date();

    function addSheet(name: string, rows: any[], cols: { key: string; header: string; width?: number }[]) {
      const ws = wb.addWorksheet(name);
      ws.columns = cols.map(c => ({ key: c.key, header: c.header, width: c.width ?? 18 }));
      const hr = ws.getRow(1);
      hr.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5C38' } };
      hr.alignment = { vertical: 'middle', horizontal: 'center' };
      hr.height = 18;
      rows.forEach((row, i) => {
        const r = ws.addRow(cols.map(c => row[c.key] ?? ''));
        r.font = { size: 9 };
        if (i % 2 === 0) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5FAF7' } };
      });
      ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + cols.length)}1` };
    }

    // ── 1. Productores ───────────────────────────────────────────────────
    const { rows: productores } = await pool.query(`
      SELECT
        p.producer_id, p.curp,
        p.nombres, p.apellido_paterno, p.apellido_materno,
        p.sexo, p.phone AS telefono, p.correo_electronico AS correo,
        s.name AS estado, m.name AS municipio,
        p.localidad, p.estatus_registro, p.tipo_registro,
        p.created_at
      FROM producer p
      LEFT JOIN geo_state s ON s.state_id = p.state_id
      LEFT JOIN geo_municipality m ON m.municipality_id = p.municipality_id
      ORDER BY p.apellido_paterno, p.nombres
    `);
    addSheet('Productores', productores, [
      { key: 'producer_id',      header: 'ID',           width: 10 },
      { key: 'curp',             header: 'CURP',         width: 20 },
      { key: 'nombres',          header: 'Nombres',      width: 22 },
      { key: 'apellido_paterno', header: 'Ap. Paterno',  width: 18 },
      { key: 'apellido_materno', header: 'Ap. Materno',  width: 18 },
      { key: 'sexo',             header: 'Sexo',         width: 8  },
      { key: 'telefono',         header: 'Teléfono',     width: 14 },
      { key: 'correo',           header: 'Correo',       width: 30 },
      { key: 'estado',           header: 'Estado',       width: 18 },
      { key: 'municipio',        header: 'Municipio',    width: 22 },
      { key: 'localidad',        header: 'Localidad',    width: 20 },
      { key: 'estatus_registro', header: 'Estatus',      width: 14 },
      { key: 'tipo_registro',    header: 'Tipo',         width: 10 },
      { key: 'created_at',       header: 'Registro',     width: 20 },
    ]);

    // ── 2. Unidades de Producción (Parcelas) ─────────────────────────────
    const { rows: ups } = await pool.query(`
      SELECT
        u.up_id, u.producer_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        u.up_name, u.up_type, u.production_system, u.water_regime,
        ST_Y(u.centroid) AS latitud,
        ST_X(u.centroid) AS longitud,
        u.area_ha_calc, u.area_ha_real, u.area_real_declarada_ha,
        u.coincide_area, u.motivo_diferencia_superficie,
        u.state_name AS estado, u.municipality_name AS municipio,
        u.state_id, u.municipality_id,
        u.location_confirmed, u.location_correction_reason,
        u.centroid_source, u.created_at, u.updated_at
      FROM up u
      LEFT JOIN producer p ON p.producer_id = u.producer_id
      ORDER BY u.up_id
    `);
    addSheet('Parcelas (UP)', ups, [
      { key: 'up_id',                       header: 'ID UP',            width: 10 },
      { key: 'producer_id',                 header: 'ID Productor',     width: 12 },
      { key: 'productor',                   header: 'Productor',        width: 28 },
      { key: 'up_name',                     header: 'Nombre UP',        width: 22 },
      { key: 'up_type',                     header: 'Tipo',             width: 14 },
      { key: 'production_system',           header: 'Sistema',          width: 16 },
      { key: 'water_regime',                header: 'Régimen Agua',     width: 14 },
      { key: 'latitud',                     header: 'Latitud',          width: 14 },
      { key: 'longitud',                    header: 'Longitud',         width: 14 },
      { key: 'area_ha_calc',                header: 'Sup. Calc. (ha)',  width: 14 },
      { key: 'area_ha_real',                header: 'Sup. Real (ha)',   width: 14 },
      { key: 'area_real_declarada_ha',      header: 'Sup. Decl. (ha)', width: 15 },
      { key: 'coincide_area',               header: 'Coincide Área',    width: 13 },
      { key: 'motivo_diferencia_superficie',header: 'Motivo Dif.',      width: 22 },
      { key: 'estado',                      header: 'Estado',           width: 18 },
      { key: 'municipio',                   header: 'Municipio',        width: 22 },
      { key: 'location_confirmed',          header: 'Ubic. Confirm.',   width: 13 },
      { key: 'location_correction_reason',  header: 'Motivo Correc.',   width: 20 },
      { key: 'centroid_source',             header: 'Fuente Centroid',  width: 15 },
      { key: 'created_at',                  header: 'Creado',           width: 20 },
      { key: 'updated_at',                  header: 'Actualizado',      width: 20 },
    ]);

    // ── 3. Ciclos ────────────────────────────────────────────────────────
    const { rows: ciclos } = await pool.query(`
      SELECT
        c.cycle_id, c.up_id,
        u.up_name, u.state_name AS estado, u.municipality_name AS municipio,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        c.cycle_year AS anio, c.cycle_type AS tipo,
        COALESCE(c.hectareas_sembradas::text,
          (SELECT ROUND(SUM(cc2.area_sown_ha)::numeric, 4)::text FROM cycle_crop cc2 WHERE cc2.cycle_id = c.cycle_id)
        ) AS hectareas_sembradas,
        c.fecha_siembra,
        -- MED-13 (auditoría Fase 4): variety_other (texto libre real) tiene
        -- prioridad sobre la etiqueta genérica del catálogo ("Otra variedad").
        COALESCE(NULLIF(c.variedad_nombre,''),
          (SELECT STRING_AGG(DISTINCT COALESCE(NULLIF(cc2.variety_other,''), cv2.label, cc2.variety_id), ', ')
           FROM cycle_crop cc2
           LEFT JOIN cat_crop_variety cv2 ON cv2.code = cc2.variety_id
           WHERE cc2.cycle_id = c.cycle_id)
        ) AS variedad_nombre,
        (SELECT STRING_AGG(DISTINCT COALESCE(cv2.tipo_maiz, ''), ', ')
         FROM cycle_crop cc2
         LEFT JOIN cat_crop_variety cv2 ON cv2.code = cc2.variety_id
         WHERE cc2.cycle_id = c.cycle_id AND COALESCE(cv2.tipo_maiz,'') <> ''
        ) AS tipo_maiz,
        c.tipo_riego, c.estado_ciclo,
        c.fecha_cosecha_real, c.produccion_real_ton,
        c.observaciones_cosecha, c.declarado_por_productor, c.created_at
      FROM cycle c
      LEFT JOIN up u ON u.up_id = c.up_id
      LEFT JOIN producer p ON p.producer_id = u.producer_id
      ORDER BY c.cycle_year DESC, c.cycle_id
    `);
    addSheet('Ciclos', ciclos, [
      { key: 'cycle_id',              header: 'ID Ciclo',         width: 10 },
      { key: 'up_id',                 header: 'ID UP',            width: 10 },
      { key: 'up_name',               header: 'Nombre UP',        width: 22 },
      { key: 'productor',             header: 'Productor',        width: 28 },
      { key: 'estado',                header: 'Estado',           width: 18 },
      { key: 'municipio',             header: 'Municipio',        width: 20 },
      { key: 'anio',                  header: 'Año',              width: 8  },
      { key: 'tipo',                  header: 'Tipo Ciclo',       width: 12 },
      { key: 'hectareas_sembradas',   header: 'Sup. Sembrada (ha)', width: 16 },
      { key: 'fecha_siembra',         header: 'F. Siembra',       width: 14 },
      { key: 'variedad_nombre',       header: 'Variedad(es)',     width: 28 },
      { key: 'tipo_maiz',             header: 'Tipo Maíz',        width: 14 },
      { key: 'tipo_riego',            header: 'Riego',            width: 12 },
      { key: 'estado_ciclo',          header: 'Estado Ciclo',     width: 14 },
      { key: 'fecha_cosecha_real',    header: 'F. Cosecha',       width: 14 },
      { key: 'produccion_real_ton',   header: 'Prod. Real (ton)', width: 15 },
      { key: 'observaciones_cosecha', header: 'Observaciones',    width: 35 },
      { key: 'declarado_por_productor', header: 'Decl. Productor',width: 15 },
      { key: 'created_at',            header: 'Registro',         width: 20 },
    ]);

    // ── 4. Cultivos por Ciclo (cycle_crop) ───────────────────────────────
    const { rows: cycleCrop } = await pool.query(`
      SELECT
        cc.cycle_crop_id, cc.cycle_id, c.up_id,
        u.up_name, u.state_name AS estado,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        cc.variety_id AS variedad_code,
        COALESCE(NULLIF(cc.variety_other,''), cv.label, cc.variety_id) AS variedad_nombre,
        COALESCE(cv.tipo_maiz, cc.tipo_maiz) AS tipo_maiz,
        cc.area_sown_ha, cc.area_harvested_ha, cc.destination,
        cc.production_qty, cc.production_unit,
        cc.planting_date, cc.estimated_harvest_date,
        cc.yield_expected, cc.ventana_venta,
        cc.disponible_para_venta, cc.fecha_disponibilidad, cc.created_at
      FROM cycle_crop cc
      LEFT JOIN cycle c ON c.cycle_id = cc.cycle_id
      LEFT JOIN up u ON u.up_id = c.up_id
      LEFT JOIN producer p ON p.producer_id = u.producer_id
      LEFT JOIN cat_crop_variety cv ON cv.code = cc.variety_id
      ORDER BY cc.cycle_crop_id DESC
    `);
    addSheet('Cultivos Ciclo', cycleCrop, [
      { key: 'cycle_crop_id',        header: 'ID',               width: 10 },
      { key: 'cycle_id',             header: 'ID Ciclo',         width: 10 },
      { key: 'up_id',                header: 'ID UP',            width: 10 },
      { key: 'up_name',              header: 'UP',               width: 20 },
      { key: 'estado',               header: 'Estado',           width: 18 },
      { key: 'productor',            header: 'Productor',        width: 28 },
      { key: 'variedad_code',        header: 'Cód. Variedad',    width: 14 },
      { key: 'variedad_nombre',      header: 'Variedad',         width: 28 },
      { key: 'tipo_maiz',            header: 'Tipo Maíz',        width: 14 },
      { key: 'area_sown_ha',         header: 'Sup. Sembrada (ha)', width: 16 },
      { key: 'area_harvested_ha',    header: 'Sup. Cosech. (ha)', width: 16 },
      { key: 'destination',          header: 'Destino',          width: 14 },
      { key: 'production_qty',       header: 'Producción',       width: 14 },
      { key: 'production_unit',      header: 'Unidad',           width: 10 },
      { key: 'planting_date',        header: 'F. Siembra',       width: 14 },
      { key: 'estimated_harvest_date', header: 'F. Est. Cosecha', width: 15 },
      { key: 'yield_expected',       header: 'Rendim. Esp. (t/ha)', width: 16 },
      { key: 'ventana_venta',        header: 'Ventana Venta',    width: 14 },
      { key: 'disponible_para_venta',header: 'Disp. Venta',      width: 13 },
      { key: 'fecha_disponibilidad', header: 'F. Disponib.',     width: 14 },
      { key: 'created_at',           header: 'Registro',         width: 20 },
    ]);

    // ── 5. Cosecha Real ──────────────────────────────────────────────────
    const { rows: cosechaReal } = await pool.query(`
      SELECT
        cr.id, cr.producer_id, cr.up_id, cr.ciclo_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        u.up_name, u.state_name AS estado,
        cr.fecha_cosecha, cr.superficie_cosechada_ha,
        cr.produccion_total_ton, cr.rendimiento_real_ton_ha,
        cr.observaciones, cr.created_at
      FROM cosecha_real cr
      LEFT JOIN producer p ON p.producer_id = cr.producer_id
      LEFT JOIN up u ON u.up_id = cr.up_id
      ORDER BY cr.fecha_cosecha DESC
    `);
    addSheet('Cosecha Real', cosechaReal, [
      { key: 'id',                     header: 'ID',               width: 8  },
      { key: 'producer_id',            header: 'ID Productor',     width: 12 },
      { key: 'up_id',                  header: 'ID UP',            width: 10 },
      { key: 'ciclo_id',               header: 'ID Ciclo',         width: 10 },
      { key: 'productor',              header: 'Productor',        width: 28 },
      { key: 'up_name',                header: 'UP',               width: 22 },
      { key: 'estado',                 header: 'Estado',           width: 18 },
      { key: 'fecha_cosecha',          header: 'Fecha Cosecha',    width: 14 },
      { key: 'superficie_cosechada_ha',header: 'Sup. (ha)',        width: 12 },
      { key: 'produccion_total_ton',   header: 'Prod. Total (ton)',width: 15 },
      { key: 'rendimiento_real_ton_ha',header: 'Rendim. (ton/ha)', width: 15 },
      { key: 'observaciones',          header: 'Observaciones',    width: 35 },
      { key: 'created_at',             header: 'Registro',         width: 20 },
    ]);

    // ── 6. Estimación Cosecha ────────────────────────────────────────────
    const { rows: estimacion } = await pool.query(`
      SELECT
        ec.id, ec.producer_id, ec.up_id, ec.ciclo_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        u.up_name, u.state_name AS estado,
        ec.fecha_estimacion, ec.rendimiento_estimado_ton_ha,
        ec.produccion_estimada_ton, ec.observaciones, ec.created_at
      FROM estimacion_cosecha ec
      LEFT JOIN producer p ON p.producer_id = ec.producer_id
      LEFT JOIN up u ON u.up_id = ec.up_id
      ORDER BY ec.fecha_estimacion DESC
    `);
    addSheet('Estimación Cosecha', estimacion, [
      { key: 'id',                          header: 'ID',                width: 8  },
      { key: 'producer_id',                 header: 'ID Productor',      width: 12 },
      { key: 'up_id',                       header: 'ID UP',             width: 10 },
      { key: 'ciclo_id',                    header: 'ID Ciclo',          width: 10 },
      { key: 'productor',                   header: 'Productor',         width: 28 },
      { key: 'up_name',                     header: 'UP',                width: 22 },
      { key: 'estado',                      header: 'Estado',            width: 18 },
      { key: 'fecha_estimacion',            header: 'Fecha Estimación',  width: 16 },
      { key: 'rendimiento_estimado_ton_ha', header: 'Rendim. Est. (t/ha)', width: 17 },
      { key: 'produccion_estimada_ton',     header: 'Prod. Est. (ton)',  width: 15 },
      { key: 'observaciones',               header: 'Observaciones',     width: 35 },
      { key: 'created_at',                  header: 'Registro',          width: 20 },
    ]);

    // ── 7. Seguimiento Visitas ───────────────────────────────────────────
    const { rows: seguimiento } = await pool.query(`
      SELECT
        sv.id, sv.producer_id, sv.up_id, sv.ciclo_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        u.up_name, u.state_name AS estado,
        sv.fecha_visita, sv.etapa_cultivo, sv.estado_cultivo,
        sv.tipo_maiz, sv.precio_observado, sv.observaciones, sv.created_at
      FROM seguimiento_visitas sv
      LEFT JOIN producer p ON p.producer_id = sv.producer_id
      LEFT JOIN up u ON u.up_id = sv.up_id
      ORDER BY sv.fecha_visita DESC
    `);
    addSheet('Seguimiento Visitas', seguimiento, [
      { key: 'id',               header: 'ID',             width: 8  },
      { key: 'producer_id',      header: 'ID Productor',   width: 12 },
      { key: 'up_id',            header: 'ID UP',          width: 10 },
      { key: 'ciclo_id',         header: 'ID Ciclo',       width: 10 },
      { key: 'productor',        header: 'Productor',      width: 28 },
      { key: 'up_name',          header: 'UP',             width: 22 },
      { key: 'estado',           header: 'Estado',         width: 18 },
      { key: 'fecha_visita',     header: 'Fecha Visita',   width: 14 },
      { key: 'etapa_cultivo',    header: 'Etapa',          width: 16 },
      { key: 'estado_cultivo',   header: 'Estado Cultivo', width: 16 },
      { key: 'tipo_maiz',        header: 'Tipo Maíz',      width: 14 },
      { key: 'precio_observado', header: 'Precio Obs.',    width: 14 },
      { key: 'observaciones',    header: 'Observaciones',  width: 40 },
      { key: 'created_at',       header: 'Registro',       width: 20 },
    ]);

    // ── 8. Seguimiento Incidencias ───────────────────────────────────────
    const { rows: incidencias } = await pool.query(`
      SELECT
        si.id, si.producer_id, si.up_id, si.ciclo_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        u.up_name, u.state_name AS estado,
        si.tipo_incidencia, si.severidad, si.fecha,
        si.observaciones, si.created_at
      FROM seguimiento_incidencias si
      LEFT JOIN producer p ON p.producer_id = si.producer_id
      LEFT JOIN up u ON u.up_id = si.up_id
      ORDER BY si.fecha DESC
    `);
    addSheet('Incidencias', incidencias, [
      { key: 'id',              header: 'ID',             width: 8  },
      { key: 'producer_id',     header: 'ID Productor',   width: 12 },
      { key: 'up_id',           header: 'ID UP',          width: 10 },
      { key: 'ciclo_id',        header: 'ID Ciclo',       width: 10 },
      { key: 'productor',       header: 'Productor',      width: 28 },
      { key: 'up_name',         header: 'UP',             width: 22 },
      { key: 'estado',          header: 'Estado',         width: 18 },
      { key: 'tipo_incidencia', header: 'Tipo',           width: 20 },
      { key: 'severidad',       header: 'Severidad',      width: 12 },
      { key: 'fecha',           header: 'Fecha',          width: 14 },
      { key: 'observaciones',   header: 'Observaciones',  width: 40 },
      { key: 'created_at',      header: 'Registro',       width: 20 },
    ]);

    // ── 9. Bodegas ───────────────────────────────────────────────────────
    const { rows: bodegas } = await pool.query(`
      SELECT
        id, nombre, clave, estado, municipio, localidad,
        region_id, ddr, cader, ejido,
        capacidad_toneladas, latitud, longitud,
        direccion, codigo_postal
      FROM bodegas
      ORDER BY estado, nombre
    `);
    addSheet('Bodegas', bodegas, [
      { key: 'id',                   header: 'ID',          width: 8  },
      { key: 'nombre',               header: 'Nombre',      width: 35 },
      { key: 'clave',                header: 'Clave',       width: 14 },
      { key: 'estado',               header: 'Estado',      width: 18 },
      { key: 'municipio',            header: 'Municipio',   width: 20 },
      { key: 'localidad',            header: 'Localidad',   width: 20 },
      { key: 'ddr',                  header: 'DDR',         width: 14 },
      { key: 'cader',                header: 'CADER',       width: 14 },
      { key: 'ejido',                header: 'Ejido',       width: 20 },
      { key: 'capacidad_toneladas',  header: 'Cap. (ton)',  width: 12 },
      { key: 'latitud',              header: 'Latitud',     width: 12 },
      { key: 'longitud',             header: 'Longitud',    width: 12 },
      { key: 'direccion',            header: 'Dirección',   width: 35 },
      { key: 'codigo_postal',        header: 'C.P.',        width: 10 },
    ]);

    // ── 10. Transacciones ────────────────────────────────────────────────
    const { rows: transacciones } = await pool.query(`
      SELECT
        t.id,
        COALESCE(p.nombres || ' ' || p.apellido_paterno, t.nombre_productor_libre) AS productor,
        b.nombre AS bodega,
        t.tipo_maiz, t.variedad_code,
        t.volumen_ton, t.precio_ton,
        ROUND((t.volumen_ton * t.precio_ton)::numeric, 2) AS total,
        t.confirmacion_productor AS estatus,
        t.fecha, t.created_at
      FROM transacciones t
      LEFT JOIN producer p ON p.producer_id = t.producer_id
      LEFT JOIN bodegas b ON b.id = t.bodega_id
      ORDER BY t.fecha DESC
    `);
    addSheet('Transacciones', transacciones, [
      { key: 'id',           header: 'ID',          width: 8  },
      { key: 'productor',    header: 'Productor',   width: 32 },
      { key: 'bodega',       header: 'Bodega',      width: 28 },
      { key: 'tipo_maiz',    header: 'Tipo Maíz',   width: 14 },
      { key: 'variedad_code',header: 'Variedad',    width: 16 },
      { key: 'volumen_ton',  header: 'Vol. (ton)',  width: 12 },
      { key: 'precio_ton',   header: 'Precio/ton',  width: 12 },
      { key: 'total',        header: 'Total MXN',   width: 14 },
      { key: 'estatus',      header: 'Estatus',     width: 14 },
      { key: 'fecha',        header: 'Fecha',       width: 14 },
      { key: 'created_at',   header: 'Registro',    width: 20 },
    ]);

    // ── 11. Inventarios ──────────────────────────────────────────────────
    const { rows: inventarios } = await pool.query(`
      SELECT
        i.id, b.nombre AS bodega,
        i.tipo_maiz, i.ciclo, i.origen,
        i.volumen_almacenamiento, i.volumen_problemas,
        i.fecha, i.fecha_registro AS registro
      FROM inventarios i
      LEFT JOIN bodegas b ON b.id = i.bodega_id
      ORDER BY b.nombre, i.fecha DESC
    `);
    addSheet('Inventarios', inventarios, [
      { key: 'id',                     header: 'ID',             width: 8  },
      { key: 'bodega',                 header: 'Bodega',         width: 30 },
      { key: 'tipo_maiz',              header: 'Tipo Maíz',      width: 16 },
      { key: 'ciclo',                  header: 'Ciclo',          width: 16 },
      { key: 'origen',                 header: 'Origen',         width: 12 },
      { key: 'volumen_almacenamiento', header: 'Vol. (ton)',      width: 14 },
      { key: 'volumen_problemas',      header: 'Vol. Problemas', width: 15 },
      { key: 'fecha',                  header: 'Fecha',          width: 14 },
      { key: 'registro',               header: 'Registro',       width: 20 },
    ]);

    // ── 12. Precios Maíz ─────────────────────────────────────────────────
    const { rows: precios } = await pool.query(`
      SELECT id, tipo, precio, unidad, tendencia, fecha_actualizacion AS fecha
      FROM precios_maiz
      ORDER BY fecha_actualizacion DESC
      LIMIT 5000
    `);
    addSheet('Precios Maíz', precios, [
      { key: 'id',        header: 'ID',         width: 8  },
      { key: 'tipo',      header: 'Tipo',       width: 20 },
      { key: 'precio',    header: 'Precio MXN', width: 14 },
      { key: 'unidad',    header: 'Unidad',     width: 12 },
      { key: 'tendencia', header: 'Tendencia',  width: 14 },
      { key: 'fecha',     header: 'Fecha',      width: 14 },
    ]);

    // ── 13. Alertas ──────────────────────────────────────────────────────
    const { rows: alertas } = await pool.query(`
      SELECT
        a.id, a.producer_id, a.up_id, a.ciclo_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        a.tipo_alerta, a.origen_alerta, a.nivel_alerta,
        a.estado_alerta, a.observaciones, a.fecha_alerta, a.created_at
      FROM alertas a
      LEFT JOIN producer p ON p.producer_id = a.producer_id
      ORDER BY a.fecha_alerta DESC
    `);
    addSheet('Alertas', alertas, [
      { key: 'id',            header: 'ID',           width: 8  },
      { key: 'producer_id',   header: 'ID Productor', width: 12 },
      { key: 'up_id',         header: 'ID UP',        width: 10 },
      { key: 'ciclo_id',      header: 'ID Ciclo',     width: 10 },
      { key: 'productor',     header: 'Productor',    width: 28 },
      { key: 'tipo_alerta',   header: 'Tipo',         width: 20 },
      { key: 'origen_alerta', header: 'Origen',       width: 16 },
      { key: 'nivel_alerta',  header: 'Nivel',        width: 12 },
      { key: 'estado_alerta', header: 'Estado',       width: 14 },
      { key: 'observaciones', header: 'Observaciones',width: 40 },
      { key: 'fecha_alerta',  header: 'Fecha',        width: 14 },
      { key: 'created_at',    header: 'Registro',     width: 20 },
    ]);

    // ── 14. Disponibilidad Productor ─────────────────────────────────────
    const { rows: disponibilidad } = await pool.query(`
      SELECT
        d.id, d.producer_id, d.up_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        d.tipo_maiz, d.variedad_code,
        COALESCE(cv.label, d.variedad_libre, d.variedad_code) AS variedad_nombre,
        d.variedad_libre,
        d.volumen_estimado_ton, d.precio_minimo_ton,
        d.ventana_venta, d.fecha_disponible, d.fecha_vencimiento,
        d.activa, d.created_at
      FROM disponibilidad_productor d
      LEFT JOIN producer p ON p.producer_id = d.producer_id
      LEFT JOIN cat_crop_variety cv ON cv.code = d.variedad_code
      ORDER BY d.created_at DESC
    `);
    addSheet('Disponibilidad', disponibilidad, [
      { key: 'id',                   header: 'ID',            width: 8  },
      { key: 'producer_id',          header: 'ID Productor',  width: 12 },
      { key: 'up_id',                header: 'ID UP',         width: 10 },
      { key: 'productor',            header: 'Productor',     width: 30 },
      { key: 'tipo_maiz',            header: 'Tipo Maíz',     width: 14 },
      { key: 'variedad_code',        header: 'Cód. Variedad', width: 14 },
      { key: 'variedad_nombre',      header: 'Variedad',      width: 28 },
      { key: 'variedad_libre',       header: 'Var. Libre',    width: 16 },
      { key: 'volumen_estimado_ton', header: 'Vol. (ton)',     width: 12 },
      { key: 'precio_minimo_ton',    header: 'Precio Mín.',   width: 12 },
      { key: 'ventana_venta',        header: 'Ventana',       width: 14 },
      { key: 'fecha_disponible',     header: 'Disponible',    width: 14 },
      { key: 'fecha_vencimiento',    header: 'Vencimiento',   width: 14 },
      { key: 'activa',               header: 'Activa',        width: 10 },
      { key: 'created_at',           header: 'Registro',      width: 20 },
    ]);

    // ── 15. Señales de Compra ────────────────────────────────────────────
    const { rows: senales } = await pool.query(`
      SELECT
        sc.id, sc.bodega_id, b.nombre AS bodega,
        sc.tipo_maiz, sc.variedad_code, sc.volumen_ton,
        sc.precio_ofrecido, sc.radio_km, sc.vigencia,
        sc.vigencia_inicio, sc.fecha_vencimiento,
        sc.interesados_count, sc.activa, sc.created_at
      FROM senales_compra sc
      LEFT JOIN bodegas b ON b.id = sc.bodega_id
      ORDER BY sc.created_at DESC
    `);
    addSheet('Señales Compra', senales, [
      { key: 'id',                header: 'ID',           width: 8  },
      { key: 'bodega_id',         header: 'ID Bodega',    width: 10 },
      { key: 'bodega',            header: 'Bodega',       width: 28 },
      { key: 'tipo_maiz',         header: 'Tipo Maíz',    width: 14 },
      { key: 'variedad_code',     header: 'Variedad',     width: 16 },
      { key: 'volumen_ton',       header: 'Vol. (ton)',   width: 12 },
      { key: 'precio_ofrecido',   header: 'Precio MXN',  width: 13 },
      { key: 'radio_km',          header: 'Radio (km)',   width: 12 },
      { key: 'vigencia',          header: 'Vigencia',     width: 14 },
      { key: 'vigencia_inicio',   header: 'Inicio',       width: 14 },
      { key: 'fecha_vencimiento', header: 'Vencimiento',  width: 14 },
      { key: 'interesados_count', header: 'Interesados',  width: 13 },
      { key: 'activa',            header: 'Activa',       width: 10 },
      { key: 'created_at',        header: 'Registro',     width: 20 },
    ]);

    // ── 16. Señal Interesados ────────────────────────────────────────────
    const { rows: senalInteresados } = await pool.query(`
      SELECT
        si.id, si.senal_id, si.producer_id,
        si.nombre_productor, si.municipio, si.estado,
        si.telefono, si.created_at
      FROM senal_interesados si
      ORDER BY si.created_at DESC
    `);
    addSheet('Señal Interesados', senalInteresados, [
      { key: 'id',               header: 'ID',             width: 8  },
      { key: 'senal_id',         header: 'ID Señal',       width: 10 },
      { key: 'producer_id',      header: 'ID Productor',   width: 12 },
      { key: 'nombre_productor', header: 'Productor',      width: 28 },
      { key: 'municipio',        header: 'Municipio',      width: 22 },
      { key: 'estado',           header: 'Estado',         width: 18 },
      { key: 'telefono',         header: 'Teléfono',       width: 14 },
      { key: 'created_at',       header: 'Registro',       width: 20 },
    ]);

    // ── 17. Señal Variedades ─────────────────────────────────────────────
    const { rows: senalVariedades } = await pool.query(`
      SELECT id, senal_id, variedad_code, variedad_libre, created_at
      FROM senal_variedades
      ORDER BY senal_id
    `);
    addSheet('Señal Variedades', senalVariedades, [
      { key: 'id',            header: 'ID',           width: 8  },
      { key: 'senal_id',      header: 'ID Señal',     width: 10 },
      { key: 'variedad_code', header: 'Código',       width: 20 },
      { key: 'variedad_libre',header: 'Var. Libre',   width: 22 },
      { key: 'created_at',    header: 'Registro',     width: 20 },
    ]);

    // ── 18. Oferta de Interés ────────────────────────────────────────────
    const { rows: ofertaInteres } = await pool.query(`
      SELECT
        oi.id, oi.usuario_id, oi.bodega_id,
        b.nombre AS bodega, oi.municipio, oi.estado,
        oi.tipo_maiz, oi.created_at
      FROM oferta_interes oi
      LEFT JOIN bodegas b ON b.id = oi.bodega_id
      ORDER BY oi.created_at DESC
    `);
    addSheet('Oferta Interés', ofertaInteres, [
      { key: 'id',         header: 'ID',         width: 8  },
      { key: 'usuario_id', header: 'ID Usuario', width: 12 },
      { key: 'bodega_id',  header: 'ID Bodega',  width: 10 },
      { key: 'bodega',     header: 'Bodega',     width: 28 },
      { key: 'municipio',  header: 'Municipio',  width: 22 },
      { key: 'estado',     header: 'Estado',     width: 18 },
      { key: 'tipo_maiz',  header: 'Tipo Maíz',  width: 14 },
      { key: 'created_at', header: 'Registro',   width: 20 },
    ]);

    // ── 19. Solicitudes de Apoyo ─────────────────────────────────────────
    const { rows: solicitudes } = await pool.query(`
      SELECT
        sa.id, sa.ventanilla_id, sa.apoyo_id, sa.producer_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        sa.estado, sa.notas, sa.created_at
      FROM solicitudes_apoyo sa
      LEFT JOIN producer p ON p.producer_id = sa.producer_id
      ORDER BY sa.created_at DESC
    `);
    addSheet('Solicitudes Apoyo', solicitudes, [
      { key: 'id',            header: 'ID',           width: 8  },
      { key: 'ventanilla_id', header: 'ID Ventanilla',width: 13 },
      { key: 'apoyo_id',      header: 'ID Apoyo',     width: 10 },
      { key: 'producer_id',   header: 'ID Productor', width: 12 },
      { key: 'productor',     header: 'Productor',    width: 28 },
      { key: 'estado',        header: 'Estado',       width: 14 },
      { key: 'notas',         header: 'Notas',        width: 35 },
      { key: 'created_at',    header: 'Registro',     width: 20 },
    ]);

    // ── 20. Apoyos Ventanilla ────────────────────────────────────────────
    const { rows: apoyos } = await pool.query(`
      SELECT
        id, ventanilla_id, nombre_apoyo, descripcion,
        requisitos, disponible, cupo_disponible,
        vigencia_fin, created_at
      FROM apoyos_ventanilla
      ORDER BY ventanilla_id, nombre_apoyo
    `);
    addSheet('Apoyos Ventanilla', apoyos, [
      { key: 'id',              header: 'ID',           width: 8  },
      { key: 'ventanilla_id',   header: 'ID Ventanilla',width: 13 },
      { key: 'nombre_apoyo',    header: 'Apoyo',        width: 18 },
      { key: 'descripcion',     header: 'Descripción',  width: 35 },
      { key: 'requisitos',      header: 'Requisitos',   width: 35 },
      { key: 'disponible',      header: 'Disponible',   width: 12 },
      { key: 'cupo_disponible', header: 'Cupo',         width: 10 },
      { key: 'vigencia_fin',    header: 'Vigencia Fin', width: 14 },
      { key: 'created_at',      header: 'Registro',     width: 20 },
    ]);

    // ── 21. Ventanillas ──────────────────────────────────────────────────
    const { rows: ventanillas } = await pool.query(`
      SELECT
        v.id, v.bodega_id, b.nombre AS bodega,
        v.nombre_ventanilla, v.nombre_enlace_agricultura,
        v.telefono_responsable, v.correo_responsable,
        v.tipo, v.estatus, v.created_at
      FROM ventanillas v
      LEFT JOIN bodegas b ON b.id = v.bodega_id
      ORDER BY v.estatus, b.nombre
    `);
    addSheet('Ventanillas', ventanillas, [
      { key: 'id',                        header: 'ID',          width: 8  },
      { key: 'bodega_id',                 header: 'ID Bodega',   width: 10 },
      { key: 'bodega',                    header: 'Bodega',      width: 28 },
      { key: 'nombre_ventanilla',         header: 'Ventanilla',  width: 25 },
      { key: 'nombre_enlace_agricultura', header: 'Enlace',      width: 28 },
      { key: 'telefono_responsable',      header: 'Teléfono',    width: 14 },
      { key: 'correo_responsable',        header: 'Correo',      width: 28 },
      { key: 'tipo',                      header: 'Tipo',        width: 14 },
      { key: 'estatus',                   header: 'Estatus',     width: 12 },
      { key: 'created_at',                header: 'Registro',    width: 20 },
    ]);

    // ── 22. SENASICA Cargas ──────────────────────────────────────────────
    const { rows: senasica } = await pool.query(`
      SELECT
        id, nombre_archivo, usuario_id,
        total_puntos, total_ups_afectadas, total_notificaciones,
        estado, error_detalle, created_at, completado_en
      FROM senasica_cargas
      ORDER BY created_at DESC
    `);
    addSheet('SENASICA Cargas', senasica, [
      { key: 'id',                    header: 'ID',           width: 8  },
      { key: 'nombre_archivo',        header: 'Archivo',      width: 30 },
      { key: 'usuario_id',            header: 'ID Usuario',   width: 12 },
      { key: 'total_puntos',          header: 'Puntos',       width: 10 },
      { key: 'total_ups_afectadas',   header: 'UPs Afect.',   width: 12 },
      { key: 'total_notificaciones',  header: 'Notificac.',   width: 13 },
      { key: 'estado',                header: 'Estado',       width: 14 },
      { key: 'error_detalle',         header: 'Error',        width: 35 },
      { key: 'created_at',            header: 'Creado',       width: 20 },
      { key: 'completado_en',         header: 'Completado',   width: 20 },
    ]);

    // ── 23. Tarifario de Servicios ───────────────────────────────────────
    const { rows: tarifario } = await pool.query(`
      SELECT
        ts.id, ts.bodega_id, b.nombre AS bodega,
        ts.concepto_id, cs.nombre AS concepto,
        ts.precio, ts.vigencia_inicio, ts.vigencia_fin, ts.activo, ts.updated_at
      FROM tarifario_servicios ts
      LEFT JOIN bodegas b ON b.id = ts.bodega_id
      LEFT JOIN cat_conceptos_servicio cs ON cs.id = ts.concepto_id
      ORDER BY b.nombre, cs.nombre
    `);
    addSheet('Tarifario Servicios', tarifario, [
      { key: 'id',              header: 'ID',           width: 8  },
      { key: 'bodega_id',       header: 'ID Bodega',    width: 10 },
      { key: 'bodega',          header: 'Bodega',       width: 28 },
      { key: 'concepto_id',     header: 'ID Concepto',  width: 12 },
      { key: 'concepto',        header: 'Concepto',     width: 22 },
      { key: 'precio',          header: 'Precio MXN',   width: 14 },
      { key: 'vigencia_inicio', header: 'Vigencia Ini', width: 14 },
      { key: 'vigencia_fin',    header: 'Vigencia Fin', width: 14 },
      { key: 'activo',          header: 'Activo',       width: 10 },
      { key: 'updated_at',      header: 'Actualizado',  width: 20 },
    ]);

    // ── 24. Bodeguero-Bodegas ────────────────────────────────────────────
    const { rows: bodeguerosBodegas } = await pool.query(`
      SELECT
        bb.id, bb.usuario_id, bb.bodega_id,
        b.nombre AS bodega,
        bb.estatus, bb.fecha_solicitud, bb.fecha_aprobacion
      FROM bodeguero_bodegas bb
      LEFT JOIN bodegas b ON b.id = bb.bodega_id
      ORDER BY b.nombre
    `);
    addSheet('Bodeguero-Bodegas', bodeguerosBodegas, [
      { key: 'id',               header: 'ID',           width: 8  },
      { key: 'usuario_id',       header: 'ID Usuario',   width: 12 },
      { key: 'bodega_id',        header: 'ID Bodega',    width: 10 },
      { key: 'bodega',           header: 'Bodega',       width: 28 },
      { key: 'estatus',          header: 'Estatus',      width: 14 },
      { key: 'fecha_solicitud',  header: 'Solicitud',    width: 20 },
      { key: 'fecha_aprobacion', header: 'Aprobación',   width: 20 },
    ]);

    // ── 25. Supervisor-Productores ───────────────────────────────────────
    const { rows: supervisores } = await pool.query(`
      SELECT
        sp.id, sp.supervisor_id, sp.producer_id,
        p.nombres || ' ' || p.apellido_paterno AS productor,
        sp.fecha_vinculacion
      FROM supervisor_productores sp
      LEFT JOIN producer p ON p.producer_id = sp.producer_id
      ORDER BY sp.supervisor_id, p.apellido_paterno
    `);
    addSheet('Supervisores', supervisores, [
      { key: 'id',                header: 'ID',           width: 8  },
      { key: 'supervisor_id',     header: 'ID Supervisor',width: 14 },
      { key: 'producer_id',       header: 'ID Productor', width: 12 },
      { key: 'productor',         header: 'Productor',    width: 28 },
      { key: 'fecha_vinculacion', header: 'Vinculación',  width: 20 },
    ]);

    // ── 26. Costos FIRA ──────────────────────────────────────────────────
    const { rows: costosFira } = await pool.query(`
      SELECT
        id, estado, modalidad, ciclo,
        costo_por_ha, precio_fira, pct_ganancia,
        vigente_desde, vigente_hasta, activo, updated_at
      FROM costos_fira
      ORDER BY estado, ciclo
    `);
    addSheet('Costos FIRA', costosFira, [
      { key: 'id',            header: 'ID',           width: 8  },
      { key: 'estado',        header: 'Estado',       width: 18 },
      { key: 'modalidad',     header: 'Modalidad',    width: 12 },
      { key: 'ciclo',         header: 'Ciclo',        width: 12 },
      { key: 'costo_por_ha',  header: 'Costo/ha',     width: 12 },
      { key: 'precio_fira',   header: 'Precio FIRA',  width: 12 },
      { key: 'pct_ganancia',  header: 'Pct. Ganancia',width: 13 },
      { key: 'vigente_desde', header: 'Vigente Desde',width: 14 },
      { key: 'vigente_hasta', header: 'Vigente Hasta',width: 14 },
      { key: 'activo',        header: 'Activo',       width: 10 },
      { key: 'updated_at',    header: 'Actualizado',  width: 20 },
    ]);

    // ── 27. Discrepancias ────────────────────────────────────────────────
    const { rows: discrepancias } = await pool.query(`
      SELECT
        id, tipo, prioridad, descripcion, accion, estado,
        datos::text AS datos, creado_at, resuelto_at
      FROM discrepancias
      ORDER BY creado_at DESC
    `);
    addSheet('Discrepancias', discrepancias, [
      { key: 'id',          header: 'ID',           width: 8  },
      { key: 'tipo',        header: 'Tipo',         width: 22 },
      { key: 'prioridad',   header: 'Prioridad',    width: 12 },
      { key: 'descripcion', header: 'Descripción',  width: 35 },
      { key: 'accion',      header: 'Acción',       width: 20 },
      { key: 'estado',      header: 'Estado',       width: 14 },
      { key: 'datos',       header: 'Datos JSON',   width: 40 },
      { key: 'creado_at',   header: 'Creado',       width: 20 },
      { key: 'resuelto_at', header: 'Resuelto',     width: 20 },
    ]);

    // ── 28. Catálogo Conceptos ───────────────────────────────────────────
    const { rows: conceptos } = await pool.query(`
      SELECT id, nombre, icono, unidad_default, estatus, propuesto_por
      FROM cat_conceptos_servicio
      ORDER BY nombre
    `);
    addSheet('Cat. Conceptos', conceptos, [
      { key: 'id',             header: 'ID',           width: 8  },
      { key: 'nombre',         header: 'Nombre',       width: 25 },
      { key: 'icono',          header: 'Icono',        width: 14 },
      { key: 'unidad_default', header: 'Unidad',       width: 16 },
      { key: 'estatus',        header: 'Estatus',      width: 14 },
      { key: 'propuesto_por',  header: 'Propuesto Por',width: 14 },
    ]);

    // ── 29. Catálogo Variedades ──────────────────────────────────────────
    const { rows: variedades } = await pool.query(`
      SELECT id, crop, code, label, sort_order, is_active, tipo_maiz
      FROM cat_crop_variety
      ORDER BY crop, sort_order
    `);
    addSheet('Cat. Variedades', variedades, [
      { key: 'id',         header: 'ID',       width: 8  },
      { key: 'crop',       header: 'Cultivo',  width: 14 },
      { key: 'code',       header: 'Código',   width: 20 },
      { key: 'label',      header: 'Etiqueta', width: 30 },
      { key: 'tipo_maiz',  header: 'Tipo Maíz',width: 14 },
      { key: 'sort_order', header: 'Orden',    width: 10 },
      { key: 'is_active',  header: 'Activo',   width: 10 },
    ]);

    // ── 30. Usuarios Productores ─────────────────────────────────────────
    const { rows: usuarios } = await pool.query(`
      SELECT
        u.id, u.curp, u.nombre_completo, u.email, u.telefono,
        s.name AS estado, m.name AS municipio,
        u.activo, u.created_at
      FROM usuarios u
      LEFT JOIN geo_state s ON s.state_id = u.state_id
      LEFT JOIN geo_municipality m ON m.municipality_id = u.municipality_id
      WHERE u.rol = 'productor'
      ORDER BY u.nombre_completo
    `);
    addSheet('Usuarios Productores', usuarios, [
      { key: 'id',              header: 'ID',         width: 8  },
      { key: 'curp',            header: 'CURP',       width: 20 },
      { key: 'nombre_completo', header: 'Nombre',     width: 30 },
      { key: 'email',           header: 'Email',      width: 30 },
      { key: 'telefono',        header: 'Teléfono',   width: 14 },
      { key: 'estado',          header: 'Estado',     width: 18 },
      { key: 'municipio',       header: 'Municipio',  width: 22 },
      { key: 'activo',          header: 'Activo',     width: 10 },
      { key: 'created_at',      header: 'Registro',   width: 20 },
    ]);

    // ── 31. Notificaciones (últimas 5000) ────────────────────────────────
    const { rows: notificaciones } = await pool.query(`
      SELECT
        id, usuario_id, tipo, titulo, mensaje,
        leida, fecha_leida, referencia_tipo, referencia_id, created_at
      FROM notificaciones
      ORDER BY created_at DESC
      LIMIT 5000
    `);
    addSheet('Notificaciones', notificaciones, [
      { key: 'id',              header: 'ID',           width: 8  },
      { key: 'usuario_id',      header: 'ID Usuario',   width: 12 },
      { key: 'tipo',            header: 'Tipo',         width: 20 },
      { key: 'titulo',          header: 'Título',       width: 30 },
      { key: 'mensaje',         header: 'Mensaje',      width: 45 },
      { key: 'leida',           header: 'Leída',        width: 10 },
      { key: 'fecha_leida',     header: 'F. Leída',     width: 20 },
      { key: 'referencia_tipo', header: 'Ref. Tipo',    width: 16 },
      { key: 'referencia_id',   header: 'Ref. ID',      width: 10 },
      { key: 'created_at',      header: 'Creado',       width: 20 },
    ]);

    // ── Stream ───────────────────────────────────────────────────────────
    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="SIMAC_BD_${fecha}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();

  } catch (err: any) {
    console.error('[exportar-bd]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Error al generar el archivo.' });
  }
});

export default router;
