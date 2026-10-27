import axios from 'axios';
import pool from '../config/database';

const FACTOR_BUSHEL_TON = 39.368;

/**
 * Obtiene el precio de futuros de maíz en Chicago (ZC=F) usando la API pública de Yahoo Finance v8
 * No requiere el paquete yahoo-finance2, usa axios directamente
 */
async function obtenerCotizacionYahoo(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 12000,
      params: { interval: '1d', range: '1d' }
    });
    const meta = response.data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose;
    if (price && typeof price === 'number' && price > 0) {
      return price;
    }
    return null;
  } catch (error: any) {
    console.error(`Error consultando Yahoo Finance para ${symbol}:`, error.message || error);
    return null;
  }
}

/**
 * Obtiene el precio actual de futuros de maíz en Chicago (ZC=F) en USD/bushel
 * NOTA: Yahoo Finance ZC=F devuelve el precio en CENTAVOS de dólar (ej: 453.75 = $4.5375/bu)
 */
export async function obtenerChicagoCME(): Promise<number> {
  console.log('Consultando futuros de maíz en Chicago (ZC=F) en Yahoo Finance...');
  
  const priceCents = await obtenerCotizacionYahoo('ZC=F');
  if (priceCents !== null) {
    // ZC=F cotiza en centavos/bushel → dividir entre 100 para obtener USD/bushel
    const priceUsd = priceCents / 100;
    console.log(`Precio Chicago obtenido: ${priceCents} ¢/bu → ${priceUsd.toFixed(4)} USD/bu`);
    return priceUsd;
  }

  // Intentar obtener el último de la BD
  const lastDb = await obtenerUltimoDeDB();
  if (lastDb && lastDb.chicago_usd_bushel) {
    console.log(`Usando fallback de Chicago de BD: ${lastDb.chicago_usd_bushel} USD/bushel`);
    return parseFloat(lastDb.chicago_usd_bushel);
  }

  console.error('[PRECIOS] Sin datos de Chicago CME — ni API ni BD disponibles');
  throw new Error(
    'No hay datos de Chicago CME disponibles. ' +
    'Verifica la conexión a Yahoo Finance o ingresa el valor manualmente desde el panel de Precios.'
  );
}

/**
 * Obtiene el Tipo de Cambio USD/MXN de Banxico o de Yahoo Finance como fallback robusto
 */
export async function obtenerTCBanxico(): Promise<number> {
  // 1. Intentar con API de Banxico si hay token configurado
  if (process.env.BANXICO_TOKEN) {
    try {
      console.log('Consultando TC Banxico (SF43718)...');
      const response = await axios.get(
        'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno',
        {
          headers: { 'Bmx-Token': process.env.BANXICO_TOKEN },
          timeout: 10000
        }
      );
      const datos = response.data?.bmx?.series?.[0]?.datos;
      if (datos && datos.length > 0) {
        const ultimo = datos[datos.length - 1];
        const tcVal = parseFloat(ultimo.dato);
        if (!isNaN(tcVal)) {
          console.log(`TC Banxico obtenido con éxito: ${tcVal} MXN/USD`);
          return tcVal;
        }
      }
      throw new Error('Formato de respuesta de Banxico no esperado');
    } catch (error: any) {
      console.error('Error al consultar Banxico API:', error.message || error);
    }
  } else {
    console.log('BANXICO_TOKEN no configurado. Usando fallback de Yahoo Finance...');
  }

  // 2. Fallback a Yahoo Finance (USDMXN=X)
  try {
    console.log('Consultando TC USD/MXN (USDMXN=X) en Yahoo Finance como fallback...');
    const tc = await obtenerCotizacionYahoo('USDMXN=X');
    if (tc !== null) {
      console.log(`TC Yahoo Finance obtenido con éxito: ${tc} MXN/USD`);
      return tc;
    }
  } catch (error) {
    console.error('Error al obtener TC de Yahoo Finance:', error);
  }

  // 3. Fallback a base de datos
  const lastDb = await obtenerUltimoDeDB();
  if (lastDb && lastDb.tc_banxico) {
    console.log(`Usando fallback de TC de BD: ${lastDb.tc_banxico} MXN/USD`);
    return parseFloat(lastDb.tc_banxico);
  }

  // 4. Sin datos: error explícito (no usar valores ficticios)
  console.error('[PRECIOS] Sin tipo de cambio disponible — ni Banxico ni Yahoo Finance ni BD');
  throw new Error(
    'No hay datos de tipo de cambio disponibles. ' +
    'Verifica BANXICO_TOKEN en .env o la conexión a Yahoo Finance.'
  );
}

/**
 * Obtiene el último registro guardado en la tabla de referencias externas
 */
async function obtenerUltimoDeDB() {
  try {
    const res = await pool.query(`
      SELECT chicago_usd_bushel, tc_banxico, garantia_sader
      FROM precio_referencias_externas
      ORDER BY creado_en DESC LIMIT 1
    `);
    if (res.rows.length > 0) {
      return res.rows[0];
    }
    return null;
  } catch (error) {
    console.error('Error al obtener último registro de referencias de BD:', error);
    return null;
  }
}

/**
 * Actualiza las referencias externas en la BD (Chicago y TC)
 */
export async function actualizarReferenciasExternas(fuente: string): Promise<any> {
  console.log(`Iniciando actualización de referencias externas. Fuente: ${fuente}`);
  let chicagoUsdBushel: number;
  let tc: number;
  const isError = false;

  try {
    chicagoUsdBushel = await obtenerChicagoCME();
    tc = await obtenerTCBanxico();
  } catch (e: any) {
    // No guardar valores ficticios en BD: propagar el error para que el
    // cron/endpoint lo registre y notifique al Admin.
    console.error('Error crítico durante la actualización de referencias:', e);
    throw e;
  }

  // Obtener la garantía SADER de la tabla de parámetros
  let garantiaSader = 6915.00;
  try {
    const paramsRes = await pool.query('SELECT precio_garantia_sader FROM precio_parametros ORDER BY id DESC LIMIT 1');
    if (paramsRes.rows.length > 0) {
      garantiaSader = parseFloat(paramsRes.rows[0].precio_garantia_sader);
    }
  } catch (e) {
    console.error('Error al obtener precio de garantía SADER de parámetros, usando 6915:', e);
  }

  const chicagoUsdTon = Math.round((chicagoUsdBushel * FACTOR_BUSHEL_TON) * 100) / 100;
  const chicagoMxn = Math.round((chicagoUsdTon * tc) * 100) / 100;

  try {
    const insertRes = await pool.query(`
      INSERT INTO precio_referencias_externas
      (chicago_usd_bushel, chicago_usd_ton, chicago_mxn, tc_banxico, garantia_sader, fuente, error)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [chicagoUsdBushel, chicagoUsdTon, chicagoMxn, tc, garantiaSader, fuente, isError]);

    console.log('Referencias externas actualizadas con éxito en BD.');
    return insertRes.rows[0];
  } catch (dbError) {
    console.error('Error al insertar referencias externas en base de datos:', dbError);
    return {
      chicago_usd_bushel: chicagoUsdBushel,
      chicago_usd_ton: chicagoUsdTon,
      chicago_mxn: chicagoMxn,
      tc_banxico: tc,
      garantia_sader: garantiaSader,
      fuente,
      error: true,
      created_at: new Date()
    };
  }
}
