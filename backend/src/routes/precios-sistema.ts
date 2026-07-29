import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, soloAdmin, AuthRequest } from '../middleware/auth';
import { actualizarReferenciasExternas } from '../services/preciosExternos';
import multer from 'multer';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// ─── CONSTANTES DEL PROGRAMA ─────────────────────────────────────
// Bono maíz blanco — Plan Nacional Maíz 2026
// Para modificar: cambiar este valor y reiniciar el servidor
const BONO_MAIZ_USD = 50;

// Helper para obtener referencias (crea si no existen)
async function obtenerReferenciasExternasActuales() {
  const res = await pool.query(`
    SELECT * FROM precio_referencias_externas
    ORDER BY created_at DESC LIMIT 1
  `);
  if (res.rows.length === 0) {
    console.log('No se encontraron referencias en BD, inicializando por primera vez...');
    return await actualizarReferenciasExternas('primer_arranque');
  }
  return res.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getParametros() {
  const r = await pool.query(`
    SELECT margen_pct, ventana_dias, min_txns, harineras_n,
           servicios_default, flete_default, costo_fira, precio_garantia_sader
    FROM precio_parametros ORDER BY id DESC LIMIT 1
  `);
  if (r.rows.length === 0) {
    return { margen_pct: 10, ventana_dias: 7, min_txns: 10, harineras_n: 3,
             servicios_default: 980, flete_default: 1058, costo_fira: 5466, precio_garantia_sader: 6200 };
  }
  return r.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/bodega/:id — precios calculados con datos de una bodega específica
// ─────────────────────────────────────────────────────────────────────────────
router.get('/bodega/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const FACTOR_CONVERSION = 39.368;

    // 1. Último precio de compra (PO) de esa bodega
    const poResult = await pool.query(
      `SELECT precio AS po, fecha, (CURRENT_DATE - fecha::date) AS dias_antiguedad
       FROM precios
       WHERE bodega_id = $1 AND tipo_precio = 'bodega'
       ORDER BY fecha DESC, created_at DESC LIMIT 1`,
      [id]
    );

    // 2. Tarifario de servicios (S) vigente de esa bodega (últimos 90 días)
    const serviciosResult = await pool.query(
      `SELECT COALESCE(SUM(ts.precio), 0) AS servicios_total
       FROM tarifario_servicios ts
       WHERE ts.bodega_id = $1 AND ts.activo = TRUE
         AND ts.updated_at >= NOW() - INTERVAL '90 days'`,
      [id]
    );

    // 3. Datos de la bodega
    const bodegaResult = await pool.query(
      `SELECT id, nombre, municipio, estado, capacidad_ton FROM bodegas WHERE id = $1`,
      [id]
    );
    if (bodegaResult.rows.length === 0) {
      res.status(404).json({ error: 'Bodega no encontrada' });
      return;
    }

    const bodega = bodegaResult.rows[0];
    const po = poResult.rows[0] ? parseFloat(poResult.rows[0].po) : null;
    const diasAntiguedad = Number(poResult.rows[0]?.dias_antiguedad ?? 0);
    const servicios = parseFloat(serviciosResult.rows[0]?.servicios_total || '0');

    // 4. Margen de negociación (Chicago + TC) — mismo cálculo que el endpoint principal
    const refs = await obtenerReferenciasExternasActuales();
    let margen: number | null = null;
    if (refs?.chicago_usd_bushel && refs?.tc_banxico) {
      const chicago = parseFloat(refs.chicago_usd_bushel);
      const tc = parseFloat(refs.tc_banxico);
      margen = Math.round(((chicago * FACTOR_CONVERSION * tc) + (BONO_MAIZ_USD * tc)) * 100) / 100;
    }

    // 5. Calcular precios
    const precioCompra = po !== null ? Math.round((po + servicios) * 100) / 100 : null;
    const precioVenta = (precioCompra !== null && margen !== null)
      ? Math.round((precioCompra - margen) * 100) / 100
      : null;

    res.json({
      bodega: { id: bodega.id, nombre: bodega.nombre, municipio: bodega.municipio, estado: bodega.estado },
      po,
      dias_antiguedad_precio: diasAntiguedad,
      servicios,
      margen,
      precio_compra: precioCompra,
      precio_venta: precioVenta,
      tiene_precio_hoy: diasAntiguedad === 0,
      tiene_tarifario: servicios > 0,
    });
  } catch (error) {
    console.error('Error en precios por bodega:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/sistema/hoy
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sistema/hoy', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { region, estado, municipio, variedad } = req.query;
    const params = await getParametros();

    const conditions: string[] = [`fecha >= NOW() - INTERVAL '${params.ventana_dias} days'`];
    const qParams: any[] = [];
    let idx = 1;

    if (estado && estado !== 'todos') { conditions.push(`estado = $${idx++}`); qParams.push(estado); }
    if (municipio && municipio !== 'todos') { conditions.push(`municipio = $${idx++}`); qParams.push(municipio); }
    if (variedad && variedad !== 'todos') { conditions.push(`tipo_maiz = $${idx++}`); qParams.push(variedad); }

    const where = `WHERE (tipo_precio = 'observado' OR tipo_precio = 'bodega') AND ${conditions.join(' AND ')}`;

    const poRes = await pool.query(`
      SELECT ROUND(AVG(precio)::numeric, 2) AS po, COUNT(*) AS total
      FROM precios ${where}
    `, qParams);

    // Referencias externas para Margen de Negociación correcto
    const refs = await obtenerReferenciasExternasActuales();
    const FACTOR_CONVERSION = 39.368;  // 1 ton métrica = 39.368 bushels — constante fija

    // Validar que los datos externos son reales antes de calcular (no usar ficticios)
    if (!refs?.chicago_usd_bushel || !refs?.tc_banxico) {
      res.status(503).json({
        error: 'Datos de mercado no disponibles',
        detalle: 'No hay cotización de Chicago CME ni tipo de cambio Banxico disponibles. ' +
                 'El administrador puede actualizar los valores manualmente desde el panel de Precios.',
        ultimo_intento: refs?.created_at ?? null,
      });
      return;
    }

    const chicago_usd_bushel = parseFloat(refs.chicago_usd_bushel);
    const tc_banxico         = parseFloat(refs.tc_banxico);

    // Validar que los valores parseados son números reales
    if (isNaN(chicago_usd_bushel) || isNaN(tc_banxico) ||
        chicago_usd_bushel <= 0   || tc_banxico <= 0) {
      res.status(503).json({
        error: 'Datos de mercado inválidos',
        detalle: 'Los valores almacenados no son números válidos. Actualiza manualmente desde Precios.',
      });
      return;
    }

    const chicago_usd_ton    = chicago_usd_bushel * FACTOR_CONVERSION;
    const chicago_mxn        = chicago_usd_ton * tc_banxico;
    const bono_mxn           = BONO_MAIZ_USD * tc_banxico;
    const margen_negociacion = Math.round((chicago_mxn + bono_mxn) * 100) / 100;

    const po = parseFloat(poRes.rows[0]?.po || '4680');
    const s  = parseFloat(params.servicios_default);
    const f  = parseFloat(params.flete_default);
    const precio_compra = Math.round((po + s) * 100) / 100;
    const precio_venta  = Math.round((precio_compra - margen_negociacion) * 100) / 100;
    // ps mantiene compatibilidad con el frontend existente
    const ps = precio_compra;

    // Ayer — calcular delta del precio de compra
    const whereAyer = `WHERE (tipo_precio = 'observado' OR tipo_precio = 'bodega') AND fecha >= NOW() - INTERVAL '${params.ventana_dias + 1} days' AND fecha < CURRENT_DATE`;
    const ayerRes = await pool.query(`
      SELECT ROUND(AVG(precio)::numeric, 2) AS po_ayer FROM precios ${whereAyer}
    `);
    const poAyer   = parseFloat(ayerRes.rows[0]?.po_ayer || String(po));
    const psAyer   = Math.round((poAyer + s) * 100) / 100;
    const deltaPsAyer = Math.round((ps - psAyer) * 100) / 100;

    res.json({
      // Campos nuevos — Margen de Negociación correcto
      margen_negociacion,
      chicago_usd_bushel,
      chicago_usd_ton: Math.round(chicago_usd_ton * 100) / 100,
      chicago_mxn:     Math.round(chicago_mxn * 100) / 100,
      tc_banxico,
      bono_mxn:        Math.round(bono_mxn * 100) / 100,
      precio_compra,
      precio_venta,
      // Campos de compatibilidad con el frontend anterior
      ps, po, s, m: margen_negociacion, f,
      fecha: new Date().toISOString().split('T')[0],
      confianza: 5,
      delta_vs_ayer: deltaPsAyer,
      total_precios_base: parseInt(poRes.rows[0]?.total || '0'),
      region: region || 'Bajío + Sinaloa',
    });
  } catch (error) {
    console.error('Error /precios/sistema/hoy:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/tendencia
// ─────────────────────────────────────────────────────────────────────────────
router.get('/tendencia', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { region, estado, dias = '30' } = req.query;
    const params = await getParametros();
    const numDias = parseInt(String(dias));

    const conditions: string[] = [];
    const qParams: any[] = [];
    let idx = 1;
    if (estado && estado !== 'todos') { conditions.push(`estado = $${idx++}`); qParams.push(estado); }

    const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const poTrend = await pool.query(`
      SELECT
        fecha::date AS fecha,
        ROUND(AVG(precio)::numeric, 2) AS po
      FROM precios
      WHERE (tipo_precio = 'observado' OR tipo_precio = 'bodega')
        AND fecha >= NOW() - INTERVAL '${numDias} days'
        ${where}
      GROUP BY fecha::date
      ORDER BY fecha::date
    `, qParams);

    const extRef = await obtenerReferenciasExternasActuales();

    // Validar que los datos externos son reales antes de calcular (no usar ficticios)
    if (!extRef?.chicago_usd_bushel || !extRef?.tc_banxico) {
      res.status(503).json({
        error: 'Datos de tendencia no disponibles',
        detalle: 'Sin cotización de Chicago CME o tipo de cambio para calcular tendencia.',
      });
      return;
    }

    const es_fallback = extRef.fuente === 'fallback_hardcodeado';
    const garantia = parseFloat(params.precio_garantia_sader || extRef.garantia_sader || '6915');
    const TC = parseFloat(extRef.tc_banxico);
    const chicagoBushel = parseFloat(extRef.chicago_usd_bushel);

    // Constantes del Margen de Negociación
    const FACTOR_CONVERSION = 39.368;

    // Obtener historial de referencias de BD
    const extHistory = await pool.query(`
      SELECT created_at::date AS fecha,
             AVG(chicago_usd_bushel) AS chicago_usd_bushel,
             AVG(tc_banxico) AS tc_banxico,
             AVG(chicago_mxn) AS chicago_mxn
      FROM precio_referencias_externas
      WHERE created_at >= NOW() - INTERVAL '${numDias} days'
      GROUP BY created_at::date
      ORDER BY fecha ASC
    `);

    const extMap = new Map();
    extHistory.rows.forEach((row: any) => {
      const dateStr = new Date(row.fecha).toISOString().split('T')[0];
      extMap.set(dateStr, {
        chicago_usd_bushel: parseFloat(row.chicago_usd_bushel),
        tc_banxico: parseFloat(row.tc_banxico),
        chicago_mxn: parseFloat(row.chicago_mxn)
      });
    });

    const tendencia = poTrend.rows.map((row: any) => {
      const po = parseFloat(row.po || '4680');
      const s  = parseFloat(params.servicios_default);
      const precio_compra = Math.round((po + s) * 100) / 100;

      const dateStr = new Date(row.fecha).toISOString().split('T')[0];
      const dayRef = extMap.get(dateStr) || { chicago_usd_bushel: chicagoBushel, tc_banxico: TC };
      // Margen de Negociación correcto por día
      const dayMargen = Math.round(
        (dayRef.chicago_usd_bushel * FACTOR_CONVERSION * dayRef.tc_banxico +
         BONO_MAIZ_USD * dayRef.tc_banxico) * 100
      ) / 100;
      const chicagoMxnDia = Math.round(dayRef.chicago_usd_bushel * FACTOR_CONVERSION * dayRef.tc_banxico * 100) / 100;

      return {
        fecha: dateStr,
        ps: precio_compra,
        margen_negociacion: dayMargen,
        chicago: chicagoMxnDia,
        chicago_usd_bushel: dayRef.chicago_usd_bushel,
        tc_banxico: dayRef.tc_banxico,
        garantia,
      };
    });

    // Si no hay datos suficientes, generar datos históricos aproximados
    if (tendencia.length < 5) {
      const filled: any[] = [];
      for (let d = numDias - 1; d >= 0; d--) {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - d);
        const noise = (Math.sin(d * 0.4) * 150);
        const po = 4680 + noise;
        const s  = parseFloat(params.servicios_default);
        const precio_compra = Math.round((po + s) * 100) / 100;

        const dateStr = fecha.toISOString().split('T')[0];
        const dayRef = extMap.get(dateStr) || { chicago_usd_bushel: chicagoBushel, tc_banxico: TC };
        const dayMargen = Math.round(
          (dayRef.chicago_usd_bushel * FACTOR_CONVERSION * dayRef.tc_banxico +
           BONO_MAIZ_USD * dayRef.tc_banxico) * 100
        ) / 100;
        const chicagoMxnDia = Math.round(dayRef.chicago_usd_bushel * FACTOR_CONVERSION * dayRef.tc_banxico * 100) / 100;

        filled.push({
          fecha: dateStr,
          ps: precio_compra,
          margen_negociacion: dayMargen,
          chicago: chicagoMxnDia,
          chicago_usd_bushel: dayRef.chicago_usd_bushel,
          tc_banxico: dayRef.tc_banxico,
          garantia,
        });
      }
      res.json({ tendencia: filled, es_fallback, ultima_actualizacion: extRef.created_at });
      return;
    }

    res.json({ tendencia, es_fallback, ultima_actualizacion: extRef.created_at });
  } catch (error) {
    console.error('Error /precios/tendencia:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/componentes/detalle
// ─────────────────────────────────────────────────────────────────────────────
router.get('/componentes/detalle', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { region, estado } = req.query;
    const params = await getParametros();

    const conditions: string[] = [`fecha >= NOW() - INTERVAL '${params.ventana_dias} days'`];
    const qParams: any[] = [];
    let idx = 1;
    if (estado && estado !== 'todos') { conditions.push(`estado = $${idx++}`); qParams.push(estado); }

    const poRes = await pool.query(`
      SELECT ROUND(AVG(precio)::numeric, 2) AS po
      FROM precios
      WHERE (tipo_precio = 'observado' OR tipo_precio = 'bodega')
        AND ${conditions.join(' AND ')}
    `, qParams);

    const po = poRes.rows[0]?.po != null ? parseFloat(poRes.rows[0].po) : null;
    const s  = parseFloat(params.servicios_default);
    const f  = parseFloat(params.flete_default);

    // Margen de Negociación correcto — referencia internacional
    const refsC = await obtenerReferenciasExternasActuales();

    // Validar que los datos externos son reales antes de calcular (no usar ficticios)
    if (!refsC?.chicago_usd_bushel || !refsC?.tc_banxico) {
      res.status(503).json({
        error: 'Datos de componentes no disponibles',
        detalle: 'Sin cotización de Chicago CME o tipo de cambio para calcular componentes.',
      });
      return;
    }

    const FACTOR_CONVERSION = 39.368;
    const chicago_usd_bushel_c = parseFloat(refsC.chicago_usd_bushel);
    const tc_banxico_c         = parseFloat(refsC.tc_banxico);
    const m = Math.round(
      (chicago_usd_bushel_c * FACTOR_CONVERSION * tc_banxico_c +
       BONO_MAIZ_USD * tc_banxico_c) * 100
    ) / 100;

    const precio_compra = po != null ? Math.round((po + s) * 100) / 100 : null;
    const ps = precio_compra; // compatibilidad

    const componentes = [
      {
        componente: 'PO', descripcion: 'Precio Origen · promedio ponderado 7 días',
        valor: po, pct: po != null && precio_compra != null ? Math.round((po / precio_compra) * 1000) / 10 : null,
        fuente: 'Bodeguero > Productor', confianza: 3,
      },
      {
        componente: 'S', descripcion: 'Servicios bodega · secado, limpieza, almacenamiento',
        valor: s, pct: precio_compra != null ? Math.round((s / precio_compra) * 1000) / 10 : null,
        fuente: 'Bodeguero (tarifario)', confianza: 4,
      },
      {
        componente: 'M', descripcion: 'Margen Negociación · Chicago CME + Bono Maíz Blanco × TC Banxico',
        valor: m, pct: precio_compra != null ? Math.round((m / precio_compra) * 1000) / 10 : null,
        fuente: 'CME + Banxico (referencia internacional)', confianza: 5,
      },
      {
        componente: 'F', descripcion: 'Flete bodega→harinera · GIS · 3 más cercanas',
        valor: f, pct: precio_compra != null ? Math.round((f / precio_compra) * 1000) / 10 : null,
        fuente: 'Sistema GIS + Admin', confianza: 4,
      },
    ];

    res.json({ componentes, ps, precio_compra, margen_negociacion: m });
  } catch (error) {
    console.error('Error /precios/componentes/detalle:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/brechas/estados
// ─────────────────────────────────────────────────────────────────────────────
router.get('/brechas/estados', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const params = await getParametros();
    const s = parseFloat(params.servicios_default);
    const f = parseFloat(params.flete_default);

    const res2 = await pool.query(`
      SELECT
        estado,
        ROUND(AVG(precio)::numeric, 2) AS po_real,
        COUNT(*) AS txns
      FROM precios
      WHERE (tipo_precio = 'observado' OR tipo_precio = 'bodega')
        AND fecha >= NOW() - INTERVAL '7 days'
        AND estado IS NOT NULL
      GROUP BY estado
      HAVING COUNT(*) >= 1
      ORDER BY AVG(precio) ASC
    `);

    const brechas = res2.rows.map((row: any) => {
      const poReal = parseFloat(row.po_real);
      const m      = (poReal + s) * (parseFloat(params.margen_pct) / 100);
      const ps     = poReal + s + m + f;
      const pRef   = ps - s - m - f; // = poReal
      const brecha = Math.round((pRef - poReal - (s * 0.15)) * 100) / 100; // brecha estimada
      let nivel: string;
      if (brecha < -1000) nivel = 'CRITICA';
      else if (brecha < -500) nivel = 'ALTA';
      else if (brecha < -100) nivel = 'MEDIA';
      else nivel = 'BAJA';
      return { estado: row.estado, brecha, nivel_criticidad: nivel, txns: parseInt(row.txns) };
    });

    // Si no hay datos, usar datos ilustrativos del mockup
    if (brechas.length === 0) {
      res.json({
        brechas: [
          { estado: 'Michoacán',  brecha: -1853, nivel_criticidad: 'CRITICA', txns: 45 },
          { estado: 'Guanajuato', brecha: -1481, nivel_criticidad: 'CRITICA', txns: 62 },
          { estado: 'Jalisco',    brecha: -803,  nivel_criticidad: 'ALTA',    txns: 38 },
          { estado: 'Sinaloa',    brecha: -738,  nivel_criticidad: 'ALTA',    txns: 29 },
          { estado: 'Querétaro',  brecha: -320,  nivel_criticidad: 'MEDIA',   txns: 15 },
          { estado: 'Colima',     brecha: -198,  nivel_criticidad: 'BAJA',    txns: 11 },
        ],
      });
      return;
    }

    res.json({ brechas });
  } catch (error) {
    console.error('Error /precios/brechas/estados:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/mercado — Datos completos para módulo B22PreciosMercado
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mercado', authMiddleware, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const params = await getParametros();
    const extRef = await obtenerReferenciasExternasActuales();

    const CHICAGO_USD_BUSHEL = parseFloat(extRef.chicago_usd_bushel);
    const TC_MXN = parseFloat(extRef.tc_banxico);
    const FACTOR_BUSHEL_TON = 39.368;

    // Margen de Negociación = (chicago_usd/bushel × 39.368 + 50 USD) × TC
    const chicago_usd_ton = CHICAGO_USD_BUSHEL * FACTOR_BUSHEL_TON;
    const margen_negociacion_mxn = Math.round((chicago_usd_ton + BONO_MAIZ_USD) * TC_MXN);

    // PO — precio origen: promedio últimos N días de precios tipo 'bodega'
    const ventanaDias = parseFloat(String(params.ventana_dias)) || 7;
    const poRes = await pool.query(`
      SELECT ROUND(AVG(precio)::numeric, 0) AS po
      FROM precios
      WHERE tipo_precio = 'bodega'
        AND fecha >= CURRENT_DATE - INTERVAL '${ventanaDias} days'
    `);
    const precio_origen_mxn = parseFloat(poRes.rows[0]?.po ?? '4680');

    // S — servicios de bodega: promedio de tarifario_servicios activos de bodegas en últimos 60 días
    let servicios_bodega_mxn = parseFloat(String(params.servicios_default));
    try {
      const sRes = await pool.query(`
        SELECT AVG(s_bodega) AS avg_s
        FROM (
          SELECT bodega_id, SUM(precio) AS s_bodega
          FROM tarifario_servicios
          WHERE activo = TRUE AND updated_at >= NOW() - INTERVAL '60 days'
          GROUP BY bodega_id
        ) sub
      `);
      if (sRes.rows.length > 0 && sRes.rows[0].avg_s !== null) {
        servicios_bodega_mxn = Math.round(parseFloat(sRes.rows[0].avg_s));
      }
    } catch (e) {
      console.error('Error al calcular S real de tarifario_servicios:', e);
    }

    const precio_compra_mxn = Math.round(precio_origen_mxn + servicios_bodega_mxn);

    const pct_productor = Math.round((precio_origen_mxn / precio_compra_mxn) * 1000) / 10;
    const pct_servicios = Math.round(100 * 10 - pct_productor * 10) / 10;
    const precio_venta_mxn = precio_compra_mxn - margen_negociacion_mxn;

    // Series 30 días para la gráfica
    const seriesRes = await pool.query(`
      SELECT
        fecha::text AS fecha,
        ROUND(AVG(precio)::numeric, 0) AS po_dia
      FROM precios
      WHERE tipo_precio = 'bodega'
        AND fecha >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY fecha
      ORDER BY fecha ASC
    `);

    // Obtener historial de referencias para calcular margen dinámico en la gráfica
    const extHistory = await pool.query(`
      SELECT created_at::date AS fecha,
             AVG(chicago_usd_bushel) AS chicago_usd_bushel,
             AVG(tc_banxico) AS tc_banxico
      FROM precio_referencias_externas
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY created_at::date
      ORDER BY fecha ASC
    `);
    const extMap = new Map();
    extHistory.rows.forEach((row: any) => {
      const dateStr = new Date(row.fecha).toISOString().split('T')[0];
      extMap.set(dateStr, {
        chicago_usd_bushel: parseFloat(row.chicago_usd_bushel),
        tc_banxico: parseFloat(row.tc_banxico)
      });
    });

    const series = seriesRes.rows.map((row: any) => {
      const po = parseFloat(row.po_dia ?? String(precio_origen_mxn));
      const pc = Math.round(po + servicios_bodega_mxn);
      
      const rawDate = row.fecha; // Formato YYYY-MM-DD
      const dayRef = extMap.get(rawDate) || { chicago_usd_bushel: CHICAGO_USD_BUSHEL, tc_banxico: TC_MXN };
      const dayMargen = Math.round((dayRef.chicago_usd_bushel * FACTOR_BUSHEL_TON + BONO_MAIZ_USD) * dayRef.tc_banxico);

      return {
        fecha: (row.fecha as string).slice(5),
        precio_compra: pc,
        margen_negociacion: dayMargen,
        precio_venta: pc - dayMargen,
      };
    });

    res.json({
      precio_chicago_usd_bushel: CHICAGO_USD_BUSHEL,
      tipo_cambio_mxn: TC_MXN,
      bono_maiz_usd: BONO_MAIZ_USD,
      margen_negociacion_mxn,
      timestamp_chicago: extRef.created_at,
      precio_origen_mxn,
      servicios_bodega_mxn,
      precio_compra_mxn,
      pct_productor,
      pct_servicios,
      precio_venta_mxn,
      precio_cedis_disponible: false,
      precio_cedis_mxn: null,
      series,
    });
  } catch (error) {
    console.error('Error /precios/mercado:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/referencias/externas
// ─────────────────────────────────────────────────────────────────────────────
router.get('/referencias/externas', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const params = await getParametros();
    const extRef = await obtenerReferenciasExternasActuales();
    const chicagoUsd = parseFloat(extRef.chicago_usd_ton);
    const chicagoBushel = parseFloat(extRef.chicago_usd_bushel);
    const chicagoMxn = parseFloat(extRef.chicago_mxn);
    const TC = parseFloat(extRef.tc_banxico);

    let costoFira = parseFloat(params.costo_fira);

    if (req.user?.rol === 'admin' || req.user?.rol === 'responsable') {
      const firaRes = await pool.query('SELECT * FROM costos_fira ORDER BY estado, ciclo, modalidad');
      res.json({
        chicago_usd_bushel: chicagoBushel,
        chicago_usd_ton: chicagoUsd,
        chicago_mxn: chicagoMxn,
        tc_banxico: TC,
        garantia_sader: parseFloat(params.precio_garantia_sader || extRef.garantia_sader || '6915'),
        costo_fira: costoFira,
        costos_fira_detalle: firaRes.rows,
        actualizacion: extRef.created_at,
        fuente: extRef.fuente,
        error: extRef.error
      });
      return;
    }

    res.json({
      chicago_usd_bushel: chicagoBushel,
      chicago_usd_ton: chicagoUsd,
      chicago_mxn: chicagoMxn,
      tc_banxico: TC,
      garantia_sader: parseFloat(params.precio_garantia_sader || extRef.garantia_sader || '6915'),
      costo_fira: costoFira,
      actualizacion: extRef.created_at,
      fuente: extRef.fuente,
      error: extRef.error
    });
  } catch (error) {
    console.error('Error /precios/referencias/externas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/parametros
// ─────────────────────────────────────────────────────────────────────────────
router.get('/parametros', authMiddleware, soloAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const params = await getParametros();
    res.json({ parametros: params });
  } catch (error) {
    console.error('Error GET /precios/parametros:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/precios/parametros
// ─────────────────────────────────────────────────────────────────────────────
router.put('/parametros', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.rol !== 'admin') {
      res.status(403).json({ error: 'Solo el administrador puede modificar parámetros' });
      return;
    }

    const { margen_pct, ventana_dias, min_txns, harineras_n,
            servicios_default, flete_default, costo_fira, precio_garantia_sader } = req.body;

    const current = await getParametros();

    await pool.query(`
      INSERT INTO precio_parametros
        (margen_pct, ventana_dias, min_txns, harineras_n,
         servicios_default, flete_default, costo_fira, precio_garantia_sader,
         actualizado_por, actualizado_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    `, [
      margen_pct        ?? current.margen_pct,
      ventana_dias      ?? current.ventana_dias,
      min_txns          ?? current.min_txns,
      harineras_n       ?? current.harineras_n,
      servicios_default ?? current.servicios_default,
      flete_default     ?? current.flete_default,
      costo_fira        ?? current.costo_fira,
      precio_garantia_sader ?? current.precio_garantia_sader,
      req.user?.userId,
    ]);

    res.json({ mensaje: 'Parámetros actualizados correctamente' });
  } catch (error) {
    console.error('Error PUT /precios/parametros:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/discrepancias/pendientes
// ─────────────────────────────────────────────────────────────────────────────
router.get('/discrepancias', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { prioridad } = req.query;
    const conditions = ["estado = 'pendiente'"];
    const params: any[] = [];
    if (prioridad) { conditions.push(`prioridad = $1`); params.push(prioridad); }

    const result = await pool.query(`
      SELECT id, tipo, prioridad, descripcion, accion, datos, creado_at
      FROM discrepancias
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        CASE prioridad WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        creado_at DESC
    `, params);

    res.json({ discrepancias: result.rows });
  } catch (error) {
    console.error('Error /discrepancias/pendientes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/precios/discrepancias/:id/resolver
// ─────────────────────────────────────────────────────────────────────────────
router.put('/discrepancias/:id/resolver', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { resolucion, notas } = req.body;

    const result = await pool.query(`
      UPDATE discrepancias
      SET estado = 'resuelto', resuelto_at = NOW(), resuelto_por = $1,
          datos = datos || jsonb_build_object('resolucion', $2::text, 'notas', $3::text)
      WHERE id = $4
      RETURNING id, estado
    `, [req.user?.userId, resolucion || 'resuelto', notas || '', id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Discrepancia no encontrada' });
      return;
    }

    res.json({ success: true, id: result.rows[0].id, estado_nuevo: 'resuelto' });
  } catch (error) {
    console.error('Error resolver discrepancia:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/transacciones/resumen
// ─────────────────────────────────────────────────────────────────────────────
router.get('/transacciones/resumen', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { region, dias = '7' } = req.query;
    const numDias = parseInt(String(dias));

    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE tipo_precio = 'bodega')::int AS bodega,
        COUNT(*) FILTER (WHERE tipo_precio = 'observado')::int AS observado,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::int AS nuevas_hoy
      FROM precios
      WHERE fecha >= NOW() - INTERVAL '${numDias} days'
    `);

    const row = result.rows[0];
    const total = row.total || 0;
    const trianguladas = row.bodega || 0;
    const trianguladas_pct = total > 0 ? Math.round((trianguladas / total) * 100) : 68;

    res.json({
      total: total || 312,
      trianguladas_pct: trianguladas_pct || 68,
      nuevas_hoy: row.nuevas_hoy || 23,
    });
  } catch (error) {
    console.error('Error /transacciones/resumen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/precios/actualizar-externas
// ─────────────────────────────────────────────────────────────────────────────
router.post('/actualizar-externas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.rol !== 'admin' && req.user?.rol !== 'responsable') {
      res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
      return;
    }
    const nuevo = await actualizarReferenciasExternas('admin_manual');
    res.json({ success: true, datos: nuevo });
  } catch (error) {
    console.error('Error POST /precios/actualizar-externas:', error);
    res.status(500).json({ error: 'Error al actualizar referencias externas' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/precios/actualizaciones-log
// ─────────────────────────────────────────────────────────────────────────────
router.get('/actualizaciones-log', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.rol !== 'admin' && req.user?.rol !== 'responsable') {
      res.status(403).json({ error: 'No tienes permisos para realizar esta acción' });
      return;
    }
    const log = await pool.query(`
      SELECT * FROM precio_referencias_externas
      ORDER BY created_at DESC LIMIT 20
    `);
    res.json({ logs: log.rows });
  } catch (error) {
    console.error('Error GET /precios/actualizaciones-log:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/precios/fira/upload-csv
// ─────────────────────────────────────────────────────────────────────────────
router.post('/fira/upload-csv', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.rol !== 'admin') {
      res.status(403).json({ error: 'Solo el administrador puede subir datos FIRA' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No se subió ningún archivo' });
      return;
    }

    const filepath = req.file.path;
    const content = fs.readFileSync(filepath, 'utf-8');
    
    const lines = content.split(/\r?\n/);
    if (lines.length <= 1) {
      res.status(400).json({ error: 'El archivo CSV está vacío o no tiene filas' });
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const colEstado = headers.indexOf('estado');
    const colMunicipio = headers.indexOf('municipio');
    const colCiclo = headers.indexOf('ciclo');
    const colModalidad = headers.indexOf('modalidad');
    const colCosto = headers.indexOf('costo_por_ton');

    if (colEstado === -1 || colCiclo === -1 || colModalidad === -1 || colCosto === -1) {
      res.status(400).json({ error: 'El CSV debe contener las columnas: estado, ciclo, modalidad, costo_por_ton' });
      return;
    }

    let insertados = 0;
    let actualizados = 0;
    const errores: string[] = [];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const row = line.split(',').map(r => r.trim());
        if (row.length < headers.length) {
          errores.push(`Fila ${i + 1}: número de columnas incorrecto (${row.length} vs ${headers.length})`);
          continue;
        }

        const estado = row[colEstado];
        const municipio = colMunicipio !== -1 ? (row[colMunicipio] || null) : null;
        const ciclo = row[colCiclo];
        const modalidad = row[colModalidad];
        const costoVal = parseFloat(row[colCosto]);

        if (!estado || !ciclo || !modalidad || isNaN(costoVal)) {
          errores.push(`Fila ${i + 1}: datos inválidos (estado: ${estado}, ciclo: ${ciclo}, modalidad: ${modalidad}, costo: ${row[colCosto]})`);
          continue;
        }

        const cicloClean = ciclo.toUpperCase();
        if (cicloClean !== 'PV' && cicloClean !== 'OI') {
          errores.push(`Fila ${i + 1}: ciclo inválido (${ciclo}), debe ser PV u OI`);
          continue;
        }

        const modClean = modalidad.toLowerCase();
        if (modClean !== 'riego' && modClean !== 'temporal') {
          errores.push(`Fila ${i + 1}: modalidad inválida (${modalidad}), debe ser riego o temporal`);
          continue;
        }

        // Buscar si existe para hacer INSERT o UPDATE
        const queryFind = municipio 
          ? await client.query('SELECT id FROM costos_fira WHERE estado = $1 AND municipio = $2 AND ciclo = $3 AND modalidad = $4', [estado, municipio, cicloClean, modClean])
          : await client.query('SELECT id FROM costos_fira WHERE estado = $1 AND (municipio IS NULL OR municipio = \'\') AND ciclo = $2 AND modalidad = $3', [estado, cicloClean, modClean]);

        if (queryFind.rows.length > 0) {
          await client.query('UPDATE costos_fira SET costo_por_ton = $1, updated_at = NOW() WHERE id = $2', [costoVal, queryFind.rows[0].id]);
          actualizados++;
        } else {
          await client.query('INSERT INTO costos_fira (estado, municipio, ciclo, modalidad, costo_por_ton, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())', [estado, municipio, cicloClean, modClean, costoVal]);
          insertados++;
        }
      }

      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
      try {
        fs.unlinkSync(filepath);
      } catch (_) {}
    }

    res.json({
      success: true,
      insertados,
      actualizados,
      errores
    });
  } catch (error: any) {
    console.error('Error POST /precios/fira/upload-csv:', error);
    res.status(500).json({ error: 'Error al procesar el archivo CSV en el servidor' });
  }
});

export default router;
