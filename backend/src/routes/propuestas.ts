import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { notificar } from '../utils/notificacion';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Helper: precio de referencia (benchmark) para un tipo de maíz — mismo
// promedio nacional de 'precios' (tipo_precio observado/bodega) que usa
// GET /api/precios/sistema/hoy, sin el margen de negociación (aquí solo
// sirve para comparar y decidir si mostrar la alerta, no como precio de
// venta). Si no hay datos reales, devuelve null — nunca un número inventado.
// ─────────────────────────────────────────────────────────────────────────
async function calcularPrecioReferencia(tipoMaiz: string): Promise<number | null> {
  const paramR = await pool.query(
    `SELECT ventana_dias, alerta_umbral_pct FROM precio_parametros ORDER BY id DESC LIMIT 1`
  );
  const ventanaDias = paramR.rows[0]?.ventana_dias ?? 7;

  const r = await pool.query(
    `SELECT ROUND(AVG(precio)::numeric, 2) AS po
     FROM precios
     WHERE (tipo_precio = 'observado' OR tipo_precio = 'bodega')
       AND tipo_maiz = $1
       AND fecha >= NOW() - INTERVAL '${Number(ventanaDias)} days'`,
    [tipoMaiz]
  );
  const po = r.rows[0]?.po;
  return po != null ? parseFloat(po) : null;
}

async function obtenerAlertaUmbralPct(): Promise<number> {
  const r = await pool.query(`SELECT alerta_umbral_pct FROM precio_parametros ORDER BY id DESC LIMIT 1`);
  const v = r.rows[0]?.alerta_umbral_pct;
  return v != null ? parseFloat(v) : 5;
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/propuestas — productor publica una propuesta de negociación
// a partir de una disponibilidad_productor propia.
// ─────────────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {
    disponibilidad_id, precio_solicitado_ton, volumen_ton,
    volumen_minimo_comprador, lugar_entrega, vigencia_hasta,
  } = req.body;

  if (!disponibilidad_id || !precio_solicitado_ton || !vigencia_hasta) {
    res.status(400).json({ error: 'Campos requeridos: disponibilidad_id, precio_solicitado_ton, vigencia_hasta' });
    return;
  }

  try {
    const prodR = await pool.query('SELECT producer_id FROM producer WHERE usuario_id = $1 LIMIT 1', [userId]);
    if (prodR.rows.length === 0) {
      res.status(403).json({ error: 'No se encontró productor vinculado a tu cuenta' });
      return;
    }
    const producerId = prodR.rows[0].producer_id;

    const dispR = await pool.query(
      `SELECT id, tipo_maiz, volumen_estimado_ton FROM disponibilidad_productor
       WHERE id = $1 AND producer_id = $2 AND activa = TRUE`,
      [disponibilidad_id, producerId]
    );
    if (dispR.rows.length === 0) {
      res.status(404).json({ error: 'Disponibilidad no encontrada o no te pertenece' });
      return;
    }
    const disp = dispR.rows[0];

    const volumenFinal = volumen_ton || disp.volumen_estimado_ton;
    const precioReferencia = await calcularPrecioReferencia(disp.tipo_maiz);
    const umbralPct = await obtenerAlertaUmbralPct();
    const alerta = precioReferencia != null
      ? Number(precio_solicitado_ton) < precioReferencia * (1 - umbralPct / 100)
      : false;

    const result = await pool.query(
      `INSERT INTO propuestas_negociacion
         (disponibilidad_id, producer_id, precio_solicitado_ton, precio_referencia_ton,
          volumen_ton, volumen_minimo_comprador, lugar_entrega, vigencia_hasta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [disponibilidad_id, producerId, precio_solicitado_ton, precioReferencia,
       volumenFinal, volumen_minimo_comprador || null, lugar_entrega || null, vigencia_hasta]
    );

    res.status(201).json({ ...result.rows[0], alerta });
  } catch (err: any) {
    console.error('Error en POST propuestas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/propuestas/mias — propuestas del productor autenticado, con
// conteo de ofertas recibidas (no el detalle — eso es /:id/ofertas).
// ─────────────────────────────────────────────────────────────────────────
router.get('/mias', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const prodR = await pool.query('SELECT producer_id FROM producer WHERE usuario_id = $1 LIMIT 1', [userId]);
    if (prodR.rows.length === 0) { res.json([]); return; }
    const producerId = prodR.rows[0].producer_id;

    const result = await pool.query(
      `SELECT pn.*,
              dp.tipo_maiz, dp.variedad_code,
              (SELECT COUNT(*) FROM ofertas_bodega ob WHERE ob.propuesta_id = pn.id AND ob.estatus = 'pendiente') AS ofertas_count
       FROM propuestas_negociacion pn
       JOIN disponibilidad_productor dp ON dp.id = pn.disponibilidad_id
       WHERE pn.producer_id = $1
       ORDER BY pn.created_at DESC`,
      [producerId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/propuestas/disponibles — propuestas abiertas visibles para
// bodegas, filtrables, con orden aleatorizado ponderado por distancia
// (nunca por antigüedad ni "destacado") para no favorecer sistemáticamente
// a ningún productor.
// ─────────────────────────────────────────────────────────────────────────
router.get('/disponibles', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { bodega_id, tipo_maiz, volumen_min, radio_km } = req.query;

  try {
    let bodegaLat: number | null = null;
    let bodegaLng: number | null = null;
    if (bodega_id) {
      const bR = await pool.query(
        `SELECT b.latitud, b.longitud FROM bodegas b
         JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id AND bb.estatus = 'aprobada'
         WHERE b.id = $1 AND bb.usuario_id = $2 LIMIT 1`,
        [bodega_id, userId]
      );
      if (bR.rows.length > 0) {
        bodegaLat = bR.rows[0].latitud;
        bodegaLng = bR.rows[0].longitud;
      }
    }

    const conditions: string[] = [`pn.estatus = 'abierta'`, `pn.vigencia_hasta >= CURRENT_DATE`];
    const params: any[] = [];
    if (tipo_maiz) { params.push(tipo_maiz); conditions.push(`dp.tipo_maiz = $${params.length}`); }
    if (volumen_min) { params.push(Number(volumen_min)); conditions.push(`pn.volumen_ton >= $${params.length}`); }

    let distanciaSelect = 'NULL::numeric AS distancia_km';
    let orderBy = 'pn.created_at DESC';

    if (bodegaLat != null && bodegaLng != null) {
      params.push(bodegaLng, bodegaLat);
      const idxLng = params.length - 1;
      const idxLat = params.length;
      distanciaSelect = `ROUND((ST_Distance(
          up.centroid::geography,
          ST_SetSRID(ST_Point($${idxLng}, $${idxLat}), 4326)::geography
        ) / 1000)::numeric, 1) AS distancia_km`;
      if (radio_km) {
        params.push(Number(radio_km) * 1000);
        conditions.push(`ST_DWithin(up.centroid::geography, ST_SetSRID(ST_Point($${idxLng}, $${idxLat}), 4326)::geography, $${params.length})`);
      }
      // Aleatorización acotada por cercanía real: entre más lejos, más peso
      // tiene el azar; entre más cerca, más determina el orden la distancia.
      orderBy = `(COALESCE(ST_Distance(up.centroid::geography, ST_SetSRID(ST_Point($${idxLng}, $${idxLat}), 4326)::geography) / 1000, 999) / 50) + random()`;
    } else {
      orderBy = 'random()';
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    let yaOferteSelect = 'FALSE AS ya_oferte';
    const finalParams = [...params];
    if (bodega_id) {
      finalParams.push(bodega_id);
      yaOferteSelect = `EXISTS(SELECT 1 FROM ofertas_bodega ob WHERE ob.propuesta_id = pn.id AND ob.bodega_id = $${finalParams.length} AND ob.estatus = 'pendiente') AS ya_oferte`;
    }

    const result = await pool.query(
      `SELECT pn.id, pn.precio_solicitado_ton, pn.precio_referencia_ton, pn.volumen_ton,
              pn.volumen_minimo_comprador, pn.lugar_entrega, pn.vigencia_hasta, pn.created_at,
              dp.tipo_maiz, dp.variedad_code, dp.humedad_pct, dp.impurezas_pct, dp.grano_quebrado_pct,
              up.municipality_name AS municipio, up.state_name AS estado,
              ${distanciaSelect},
              ${yaOferteSelect}
       FROM propuestas_negociacion pn
       JOIN disponibilidad_productor dp ON dp.id = pn.disponibilidad_id
       JOIN up ON up.up_id = dp.up_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT 100`,
      finalParams
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error en GET propuestas/disponibles:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/propuestas/:id/ofertas — lista comparativa desagregada de
// ofertas recibidas. Solo el productor dueño de la propuesta puede verla;
// ninguna bodega puede ver la oferta de otra.
// ─────────────────────────────────────────────────────────────────────────
router.get('/:id/ofertas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const propR = await pool.query(
      `SELECT pn.id FROM propuestas_negociacion pn
       JOIN producer p ON p.producer_id = pn.producer_id
       WHERE pn.id = $1 AND p.usuario_id = $2`,
      [req.params.id, userId]
    );
    if (propR.rows.length === 0) {
      res.status(403).json({ error: 'No tienes acceso a esta propuesta' });
      return;
    }

    const result = await pool.query(
      `SELECT ob.*, b.nombre AS bodega_nombre, b.municipio AS bodega_municipio, b.estado AS bodega_estado
       FROM ofertas_bodega ob
       JOIN bodegas b ON b.id = ob.bodega_id
       WHERE ob.propuesta_id = $1
       ORDER BY ob.pago_final_estimado_ton DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────
// GET /api/propuestas/:id/mi-oferta — la bodega consulta su propia oferta
// (si ya mandó una) para esta propuesta, sin ver las de otras bodegas.
// ─────────────────────────────────────────────────────────────────────────
router.get('/:id/mi-oferta', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT * FROM ofertas_bodega WHERE propuesta_id = $1 AND usuario_id = $2 LIMIT 1`,
      [req.params.id, userId]
    );
    res.json(result.rows[0] || null);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/propuestas/:id/ofertas — bodega envía o actualiza su
// contraoferta. Solo puede aceptar o mejorar el precio solicitado.
// ─────────────────────────────────────────────────────────────────────────
router.post('/:id/ofertas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {
    bodega_id, precio_ofrecido_ton, costo_acondicionamiento_ton,
    modalidad_transporte, costo_transporte_ton, momento_pago,
  } = req.body;

  if (!bodega_id || precio_ofrecido_ton == null) {
    res.status(400).json({ error: 'Campos requeridos: bodega_id, precio_ofrecido_ton' });
    return;
  }

  try {
    const propR = await pool.query(
      `SELECT id, estatus, precio_solicitado_ton FROM propuestas_negociacion WHERE id = $1`,
      [req.params.id]
    );
    if (propR.rows.length === 0) { res.status(404).json({ error: 'Propuesta no encontrada' }); return; }
    const propuesta = propR.rows[0];
    if (propuesta.estatus !== 'abierta') {
      res.status(400).json({ error: 'Esta propuesta ya no está abierta a ofertas' });
      return;
    }
    if (Number(precio_ofrecido_ton) < Number(propuesta.precio_solicitado_ton)) {
      res.status(400).json({ error: `El precio ofrecido no puede ser menor al precio solicitado ($${propuesta.precio_solicitado_ton}/ton). Solo puedes igualarlo o mejorarlo.` });
      return;
    }

    const acond = costo_acondicionamiento_ton != null ? Number(costo_acondicionamiento_ton) : 0;
    const transporte = costo_transporte_ton != null ? Number(costo_transporte_ton) : 0;
    const restaTransporte = modalidad_transporte === 'productor_entrega' ? transporte : 0;
    const pagoFinal = Number(precio_ofrecido_ton) - acond - restaTransporte;

    const result = await pool.query(
      `INSERT INTO ofertas_bodega
         (propuesta_id, bodega_id, usuario_id, precio_ofrecido_ton, costo_acondicionamiento_ton,
          modalidad_transporte, costo_transporte_ton, pago_final_estimado_ton, momento_pago, estatus)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendiente')
       ON CONFLICT (propuesta_id, bodega_id) DO UPDATE SET
         precio_ofrecido_ton = EXCLUDED.precio_ofrecido_ton,
         costo_acondicionamiento_ton = EXCLUDED.costo_acondicionamiento_ton,
         modalidad_transporte = EXCLUDED.modalidad_transporte,
         costo_transporte_ton = EXCLUDED.costo_transporte_ton,
         pago_final_estimado_ton = EXCLUDED.pago_final_estimado_ton,
         momento_pago = EXCLUDED.momento_pago,
         estatus = 'pendiente'
       RETURNING *`,
      [req.params.id, bodega_id, userId, precio_ofrecido_ton, acond,
       modalidad_transporte || null, transporte, pagoFinal, momento_pago || null]
    );

    // Notificar al productor dueño de la propuesta (best-effort)
    try {
      const dueno = await pool.query(
        `SELECT usr.id, dp.tipo_maiz FROM propuestas_negociacion pn
         JOIN producer p ON p.producer_id = pn.producer_id
         JOIN usuarios usr ON usr.id = p.usuario_id
         JOIN disponibilidad_productor dp ON dp.id = pn.disponibilidad_id
         WHERE pn.id = $1`,
        [req.params.id]
      );
      if (dueno.rows.length > 0) {
        notificar({
          usuarioId: dueno.rows[0].id,
          tipo: 'oferta_propuesta',
          titulo: '💰 Nueva oferta recibida',
          mensaje: `Una bodega ofertó $${Number(precio_ofrecido_ton).toLocaleString()}/ton por tu propuesta de maíz ${dueno.rows[0].tipo_maiz}. Entra a "Mis propuestas" para comparar.`,
          referenciaId: Number(req.params.id),
          referenciaTipo: 'propuestas_negociacion',
        }).catch(() => {});
      }
    } catch (_) { /* best-effort */ }

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('Error en POST propuestas/:id/ofertas:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// POST /api/propuestas/:id/aceptar — productor acepta una oferta.
// Cierra la propuesta, marca ganadora/perdedoras y crea la transacción.
// ─────────────────────────────────────────────────────────────────────────
router.post('/:id/aceptar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { oferta_id } = req.body;
  if (!oferta_id) { res.status(400).json({ error: 'Campo requerido: oferta_id' }); return; }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const propR = await client.query(
      `SELECT pn.*, dp.tipo_maiz, dp.variedad_code, dp.humedad_pct, dp.impurezas_pct, dp.grano_quebrado_pct
       FROM propuestas_negociacion pn
       JOIN producer p ON p.producer_id = pn.producer_id
       JOIN disponibilidad_productor dp ON dp.id = pn.disponibilidad_id
       WHERE pn.id = $1 AND p.usuario_id = $2 FOR UPDATE`,
      [req.params.id, userId]
    );
    if (propR.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(403).json({ error: 'No tienes acceso a esta propuesta' });
      return;
    }
    const propuesta = propR.rows[0];
    if (propuesta.estatus !== 'abierta') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Esta propuesta ya no está abierta' });
      return;
    }

    const ofertaR = await client.query(
      `SELECT * FROM ofertas_bodega WHERE id = $1 AND propuesta_id = $2 AND estatus = 'pendiente'`,
      [oferta_id, req.params.id]
    );
    if (ofertaR.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Oferta no encontrada o ya no está pendiente' });
      return;
    }
    const ofertaGanadora = ofertaR.rows[0];

    await client.query(`UPDATE ofertas_bodega SET estatus = 'aceptada' WHERE id = $1`, [oferta_id]);
    const perdedoras = await client.query(
      `UPDATE ofertas_bodega SET estatus = 'rechazada'
       WHERE propuesta_id = $1 AND id != $2 AND estatus = 'pendiente'
       RETURNING id, usuario_id, bodega_id`,
      [req.params.id, oferta_id]
    );
    await client.query(
      `UPDATE propuestas_negociacion SET estatus = 'cerrada', ganadora_oferta_id = $1 WHERE id = $2`,
      [oferta_id, req.params.id]
    );

    const txResult = await client.query(
      `INSERT INTO transacciones
         (bodega_id, usuario_bodeguero, producer_id, tipo_maiz, variedad_code, volumen_ton, precio_ton, fecha,
          humedad_pct, impurezas_pct, grano_quebrado_pct, propuesta_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,$8,$9,$10,$11) RETURNING *`,
      [ofertaGanadora.bodega_id, ofertaGanadora.usuario_id, propuesta.producer_id,
       propuesta.tipo_maiz, propuesta.variedad_code, propuesta.volumen_ton, ofertaGanadora.pago_final_estimado_ton,
       propuesta.humedad_pct, propuesta.impurezas_pct, propuesta.grano_quebrado_pct, propuesta.id]
    );

    await client.query('COMMIT');

    notificar({
      usuarioId: ofertaGanadora.usuario_id,
      tipo: 'propuesta_aceptada',
      titulo: '🎉 Tu oferta fue aceptada',
      mensaje: `El productor aceptó tu oferta de $${Number(ofertaGanadora.precio_ofrecido_ton).toLocaleString()}/ton. Se generó la transacción.`,
      referenciaId: txResult.rows[0].id,
      referenciaTipo: 'transacciones',
    }).catch(() => {});

    for (const p of perdedoras.rows) {
      notificar({
        usuarioId: p.usuario_id,
        tipo: 'propuesta_no_seleccionada',
        titulo: 'Propuesta cerrada',
        mensaje: 'El productor eligió otra oferta para esta propuesta. Sigue disponible para futuras oportunidades.',
        referenciaId: Number(req.params.id),
        referenciaTipo: 'propuestas_negociacion',
      }).catch(() => {});
    }

    res.json({ ok: true, transaccion: txResult.rows[0] });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error en POST propuestas/:id/aceptar:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/propuestas/:id — productor cancela su propuesta abierta.
// ─────────────────────────────────────────────────────────────────────────
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `UPDATE propuestas_negociacion pn SET estatus = 'cancelada'
       FROM producer p
       WHERE pn.id = $1 AND pn.producer_id = p.producer_id AND p.usuario_id = $2 AND pn.estatus = 'abierta'
       RETURNING pn.id`,
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrada, sin permiso, o ya no está abierta' }); return; }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────
// DELETE /api/propuestas/:id/ofertas/:ofertaId — bodega retira su oferta.
// ─────────────────────────────────────────────────────────────────────────
router.delete('/:id/ofertas/:ofertaId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `UPDATE ofertas_bodega SET estatus = 'retirada'
       WHERE id = $1 AND propuesta_id = $2 AND usuario_id = $3 AND estatus = 'pendiente'
       RETURNING id`,
      [req.params.ofertaId, req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrada, sin permiso, o ya no está pendiente' }); return; }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
