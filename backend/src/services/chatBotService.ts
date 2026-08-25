import pool from '../config/database';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';

let botUserIdCache: number | null = null;

/** Id del usuario sintético 'bot' (creado por migrate_v42_chat_bot.sql). Se cachea en memoria. */
export async function obtenerBotUserId(): Promise<number | null> {
  if (botUserIdCache != null) return botUserIdCache;
  try {
    const r = await pool.query(`SELECT id FROM usuarios WHERE email = 'bot@simac.interno' LIMIT 1`);
    if (r.rows.length === 0) return null;
    botUserIdCache = r.rows[0].id;
    return botUserIdCache;
  } catch {
    return null;
  }
}

async function construirContextoProductor(usuarioId: number): Promise<string> {
  const prodR = await pool.query('SELECT producer_id FROM producer WHERE usuario_id = $1 LIMIT 1', [usuarioId]);
  if (prodR.rows.length === 0) return 'Este productor todavía no tiene su registro completo en el sistema.';
  const producerId = prodR.rows[0].producer_id;

  const [disp, props, txns] = await Promise.all([
    pool.query(
      `SELECT tipo_maiz, variedad_code, volumen_estimado_ton, fecha_vencimiento, activa
       FROM disponibilidad_productor WHERE producer_id = $1 AND activa = TRUE ORDER BY created_at DESC LIMIT 5`,
      [producerId]
    ),
    pool.query(
      `SELECT pn.id, pn.precio_solicitado_ton, pn.volumen_ton, pn.estatus, pn.vigencia_hasta,
              (SELECT COUNT(*) FROM ofertas_bodega ob WHERE ob.propuesta_id = pn.id AND ob.estatus = 'pendiente') AS ofertas_pendientes
       FROM propuestas_negociacion pn WHERE pn.producer_id = $1 ORDER BY pn.created_at DESC LIMIT 5`,
      [producerId]
    ),
    pool.query(
      `SELECT volumen_ton, precio_ton, fecha, confirmacion_productor
       FROM transacciones WHERE producer_id = $1 ORDER BY fecha DESC LIMIT 5`,
      [producerId]
    ),
  ]);

  const lineas: string[] = [];
  lineas.push(disp.rows.length
    ? `Disponibilidades activas publicadas: ${disp.rows.map(d => `${d.volumen_estimado_ton} ton de maíz ${d.tipo_maiz}${d.variedad_code ? ` (${d.variedad_code})` : ''}, vence ${d.fecha_vencimiento}`).join('; ')}.`
    : 'No tiene disponibilidades activas publicadas.');
  lineas.push(props.rows.length
    ? `Propuestas de negociación: ${props.rows.map(p => `#${p.id} pide $${p.precio_solicitado_ton}/ton por ${p.volumen_ton} ton, estatus ${p.estatus}, ${p.ofertas_pendientes} oferta(s) pendiente(s), vigente hasta ${p.vigencia_hasta}`).join('; ')}.`
    : 'No tiene propuestas de negociación publicadas.');
  lineas.push(txns.rows.length
    ? `Últimas transacciones: ${txns.rows.map(t => `${t.volumen_ton} ton a $${t.precio_ton}/ton el ${t.fecha}, confirmación: ${t.confirmacion_productor || 'pendiente'}`).join('; ')}.`
    : 'No tiene transacciones registradas todavía.');

  return lineas.join('\n');
}

async function construirContextoBodeguero(usuarioId: number): Promise<string> {
  const bodegasR = await pool.query(
    `SELECT b.id, b.nombre FROM bodegas b
     JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id AND bb.usuario_id = $1 AND bb.estatus = 'aprobada'`,
    [usuarioId]
  );
  if (bodegasR.rows.length === 0) return 'Este bodeguero todavía no tiene ninguna bodega aprobada asociada a su cuenta.';
  const bodegaIds = bodegasR.rows.map(b => b.id);

  const [reqs, ofertas, txns] = await Promise.all([
    pool.query(
      `SELECT tipo_maiz, volumen_ton, precio_ofrecido, fecha_vencimiento
       FROM senales_compra WHERE bodega_id = ANY($1) AND activa = TRUE ORDER BY created_at DESC LIMIT 5`,
      [bodegaIds]
    ),
    pool.query(
      `SELECT ob.precio_ofrecido_ton, ob.pago_final_estimado_ton, ob.estatus
       FROM ofertas_bodega ob WHERE ob.bodega_id = ANY($1) ORDER BY ob.created_at DESC LIMIT 5`,
      [bodegaIds]
    ),
    pool.query(
      `SELECT volumen_ton, precio_ton, fecha, confirmacion_productor
       FROM transacciones WHERE bodega_id = ANY($1) ORDER BY fecha DESC LIMIT 5`,
      [bodegaIds]
    ),
  ]);

  const lineas: string[] = [];
  lineas.push(`Bodegas asociadas a esta cuenta: ${bodegasR.rows.map(b => b.nombre).join(', ')}.`);
  lineas.push(reqs.rows.length
    ? `Requerimientos activos: ${reqs.rows.map(r => `${r.volumen_ton || '?'} ton de maíz ${r.tipo_maiz} a $${r.precio_ofrecido}/ton, vence ${r.fecha_vencimiento}`).join('; ')}.`
    : 'No tiene requerimientos de maíz activos.');
  lineas.push(ofertas.rows.length
    ? `Ofertas enviadas a propuestas de productores: ${ofertas.rows.map(o => `$${o.precio_ofrecido_ton}/ton (pago final estimado $${o.pago_final_estimado_ton}/ton), estatus ${o.estatus}`).join('; ')}.`
    : 'No ha enviado ofertas a propuestas de productores.');
  lineas.push(txns.rows.length
    ? `Últimas transacciones: ${txns.rows.map(t => `${t.volumen_ton} ton a $${t.precio_ton}/ton el ${t.fecha}, confirmación del productor: ${t.confirmacion_productor || 'pendiente'}`).join('; ')}.`
    : 'No tiene transacciones registradas todavía.');

  return lineas.join('\n');
}

const SISTEMA_PROMPT = `Eres el asistente automático del chat de ayuda de SIMAC (Sistema de Ordenamiento de la Producción y Comercialización del Maíz Blanco en México), una plataforma que conecta productores de maíz con bodegas compradoras.

Reglas estrictas:
- Responde SOLO con base en la información de contexto que se te da sobre este usuario y en cómo funciona la plataforma (disponibilidad, propuestas de negociación, ofertas, requerimientos, transacciones). Nunca inventes precios, fechas, nombres de otras personas o datos que no estén en el contexto.
- Nunca reveles ni asumas información de otros usuarios — solo conoces los datos del usuario que te escribe.
- Sé breve, claro y en español natural de México. Sin tecnicismos innecesarios.
- Si la pregunta es sobre una disputa, un pago, un problema técnico, o algo que no puedes resolver con el contexto que tienes, responde brevemente y termina indicando que vas a avisar a una persona del equipo para que le ayude — NO intentes resolverlo tú.
- Si el usuario simplemente quiere hablar con una persona, respétalo de inmediato y avisa que se le va a conectar con el equipo.

Responde en JSON con este formato exacto, sin texto fuera del JSON:
{"respuesta": "...", "escalar": true|false}

"escalar" es true cuando el usuario necesita o pidió ayuda humana; false cuando tu respuesta ya resuelve la duda.`;

interface RespuestaBot {
  respuesta: string;
  escalar: boolean;
}

export async function generarRespuestaBot(opts: {
  usuarioId: number;
  rol: string;
  mensaje: string;
}): Promise<RespuestaBot | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || process.env.CHAT_BOT_ENABLED === 'false') return null;

  try {
    const contexto = opts.rol === 'bodeguero'
      ? await construirContextoBodeguero(opts.usuarioId)
      : await construirContextoProductor(opts.usuarioId);

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SISTEMA_PROMPT },
          { role: 'system', content: `Contexto del usuario (rol: ${opts.rol}):\n${contexto}` },
          { role: 'user', content: opts.mensaje },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[chatBotService] Groq respondió', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data: any = await res.json();
    const contenido = data?.choices?.[0]?.message?.content;
    if (!contenido) return null;

    const parsed = JSON.parse(contenido);
    if (typeof parsed.respuesta !== 'string' || !parsed.respuesta.trim()) return null;

    return { respuesta: parsed.respuesta.trim(), escalar: !!parsed.escalar };
  } catch (err) {
    console.error('[chatBotService] Error generando respuesta:', err);
    return null;
  }
}
