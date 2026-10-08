import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../config/database';

// Información pública (sin sesión). Solo referencias externas de mercado; nunca precios de bodegas,
// márgenes, ni datos de productores o de operación interna.
const router = Router();

const FACTOR_BUSHEL_TON = 39.368; // 1 tonelada métrica = 39.368 bushels de maíz

const limitador = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
});

const redondea = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// GET /api/publico/maiz — referencia internacional del maíz (hoy y últimos 30 días)
router.get('/maiz', limitador, async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT created_at::date AS fecha,
             AVG(chicago_usd_bushel)::float AS chicago,
             AVG(tc_banxico)::float AS tc,
             MAX(created_at) AS actualizado
      FROM precio_referencias_externas
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND chicago_usd_bushel IS NOT NULL AND tc_banxico IS NOT NULL
      GROUP BY created_at::date
      ORDER BY fecha ASC
    `);
    if (rows.length === 0) {
      res.status(503).json({ error: 'Por ahora no hay información disponible.' });
      return;
    }

    const serie = rows.map((r: any) => {
      const usdTon = r.chicago * FACTOR_BUSHEL_TON;
      return {
        fecha: new Date(r.fecha).toISOString().slice(0, 10),
        chicago_usd_bushel: redondea(r.chicago, 3),
        tc_fix: redondea(r.tc, 4),
        referencia_mxn_ton: Math.round(usdTon * r.tc),
      };
    });
    const hoy = serie[serie.length - 1];
    const previo = serie.length > 1 ? serie[serie.length - 2] : null;
    const valores = serie.map(s => s.referencia_mxn_ton);
    const cambio = previo ? hoy.referencia_mxn_ton - previo.referencia_mxn_ton : 0;

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      cultivo: 'maiz',
      fecha: hoy.fecha,
      actualizado_en: rows[rows.length - 1].actualizado,
      hoy: {
        referencia_mxn_ton: hoy.referencia_mxn_ton,
        chicago_usd_bushel: hoy.chicago_usd_bushel,
        chicago_usd_ton: redondea(hoy.chicago_usd_bushel * FACTOR_BUSHEL_TON, 1),
        tc_fix: hoy.tc_fix,
      },
      cambio_dia: {
        mxn_ton: cambio,
        porcentaje: previo ? redondea((cambio / previo.referencia_mxn_ton) * 100, 2) : 0,
      },
      rango: { minimo: Math.min(...valores), maximo: Math.max(...valores), dias: serie.length },
      serie,
      fuentes: ['Futuros de maíz CME (Chicago)', 'Tipo de cambio FIX (Banco de México)'],
      nota: 'Referencia internacional del maíz convertida a pesos por tonelada. No es un precio de compra de bodegas.',
    });
  } catch (error) {
    console.error('Error en /publico/maiz:', error);
    res.status(500).json({ error: 'No se pudo obtener la información.' });
  }
});

export default router;
