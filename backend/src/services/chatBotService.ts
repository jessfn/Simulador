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
  const perfilR = await pool.query(
    `SELECT u.email, u.telefono, p.nombres, p.apellido_paterno, p.apellido_materno, p.municipality_id, p.state_id
     FROM usuarios u LEFT JOIN producer p ON p.usuario_id = u.id WHERE u.id = $1`,
    [usuarioId]
  );
  const perfil = perfilR.rows[0];
  const perfilLinea = perfil
    ? `Perfil: ${[perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno].filter(Boolean).join(' ') || 'sin nombre registrado'}, correo ${perfil.email || 'no registrado'}, teléfono ${perfil.telefono || 'no registrado'}.`
    : '';

  const prodR = await pool.query('SELECT producer_id FROM producer WHERE usuario_id = $1 LIMIT 1', [usuarioId]);
  if (prodR.rows.length === 0) return [perfilLinea, 'Este productor todavía no tiene su registro de productor completo en el sistema (sin parcela/UP registrada).'].filter(Boolean).join('\n');
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

  const lineas: string[] = [perfilLinea].filter(Boolean);
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
  const perfilR = await pool.query('SELECT nombre_completo, email, telefono FROM usuarios WHERE id = $1', [usuarioId]);
  const perfil = perfilR.rows[0];
  const perfilLinea = perfil
    ? `Perfil: ${perfil.nombre_completo || 'sin nombre registrado'}, correo ${perfil.email || 'no registrado'}, teléfono ${perfil.telefono || 'no registrado'}.`
    : '';

  const bodegasR = await pool.query(
    `SELECT b.id, b.nombre FROM bodegas b
     JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id AND bb.usuario_id = $1 AND bb.estatus = 'aprobada'`,
    [usuarioId]
  );
  if (bodegasR.rows.length === 0) return [perfilLinea, 'Este bodeguero todavía no tiene ninguna bodega aprobada asociada a su cuenta.'].filter(Boolean).join('\n');
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

  const lineas: string[] = [perfilLinea].filter(Boolean);
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

const CAPACIDADES_PRODUCTOR = `Un productor en SIMAC puede: ver y editar su perfil (nombre, correo, teléfono); publicar su maíz disponible (tipo, variedad, volumen, fechas, calidad); publicarlo como "propuesta de negociación abierta a bodegas" con un precio solicitado; recibir y comparar ofertas de bodegas (precio, acondicionamiento, transporte, momento de pago) y aceptar la que prefiera; ver sus transacciones y confirmarlas o marcarlas en disputa; ver precios de referencia del mercado. NO puede: publicar requerimientos de compra, ofertar por maíz de otros productores, ni ver información de otros productores o de otras bodegas — eso es exclusivo de cuentas de bodega.`;

const CAPACIDADES_BODEGUERO = `Una bodega en SIMAC puede: ver su perfil (nombre, correo, teléfono) y los datos de sus bodegas asociadas; publicar requerimientos de maíz que busca comprar; ver "propuestas disponibles" publicadas por productores y mandarles una oferta (solo puede igualar o mejorar el precio que pide el productor, nunca ofrecer menos); guardar filtros de búsqueda como alerta para recibir notificación automática; registrar transacciones y ver su historial; configurar su tarifario de servicios. NO puede: publicar disponibilidad de maíz como si fuera productor, ni ver las ofertas que otras bodegas mandaron a la misma propuesta — eso siempre queda oculto entre bodegas.`;

const SISTEMA_PROMPT = `Eres el asistente automático del chat de ayuda de SIMAC (Sistema de Ordenamiento de la Producción y Comercialización del Maíz Blanco en México), una plataforma que conecta productores de maíz con bodegas compradoras.

Reglas estrictas:
- MUY IMPORTANTE: sé conciso. Máximo 2-3 oraciones cortas por respuesta. Nada de párrafos largos ni repetir la pregunta del usuario. Ve directo a la respuesta.
- Amable y cercano, en español natural de México, sin tecnicismos. Dirígete a la persona por su nombre cuando tenga sentido, sin abusar.
- Solo hablas de SIMAC: su cuenta, sus datos, cómo usar la plataforma. Si preguntan algo que no tiene nada que ver con SIMAC (clima, noticias, otros temas), dilo con amabilidad y redirige la conversación a en qué le puedes ayudar dentro de la plataforma.
- Antes de responder, revisa la lista de "Funciones que existen para este tipo de cuenta": si lo que piden SÍ existe para su rol, ayúdales con eso usando sus datos reales. Si NO existe para su rol (por ejemplo un bodeguero preguntando cómo publicar disponibilidad de maíz, que es solo de productores), dilo claro y explica brevemente qué sí puede hacer en su lugar.
- Responde solo con base en el contexto que se te da sobre este usuario. Nunca inventes precios, fechas, nombres de otras personas o datos que no estén ahí. Si el contexto no tiene el dato (por ejemplo no tiene transacciones), dilo tal cual, sin suponer.
- Nunca reveles información de otros usuarios (productores o bodegas) — solo conoces los datos del usuario que te escribe.
- PRIVADO: nunca respondas nada sobre administradores, cuentas de admin, el panel administrativo, permisos internos o cómo funciona el sistema por dentro (base de datos, backend, código). Si preguntan por eso, di que no tienes acceso a esa información y que es un tema interno del equipo.
- Si la pregunta es sobre una disputa, un pago, un problema técnico, o algo que no puedes resolver con el contexto que tienes, dilo en una frase breve y amable indicando que vas a avisar a una persona del equipo — NO intentes resolverlo tú.
- Si el usuario simplemente quiere hablar con una persona, respétalo de inmediato y avisa que se le va a conectar con el equipo.

Responde en JSON con este formato exacto, sin texto fuera del JSON:
{"respuesta": "...", "escalar": true|false}

"escalar" es true cuando el usuario necesita o pidió ayuda humana, o cuando preguntó algo que no puedes resolver con el contexto que tienes; false cuando tu respuesta ya resuelve la duda.`;

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
    const [nombreR, contexto] = await Promise.all([
      pool.query('SELECT nombre_completo FROM usuarios WHERE id = $1', [opts.usuarioId]),
      opts.rol === 'bodeguero' ? construirContextoBodeguero(opts.usuarioId) : construirContextoProductor(opts.usuarioId),
    ]);
    const nombre = nombreR.rows[0]?.nombre_completo || 'este usuario';
    const capacidades = opts.rol === 'bodeguero' ? CAPACIDADES_BODEGUERO : CAPACIDADES_PRODUCTOR;
    const rolLabel = opts.rol === 'bodeguero' ? 'bodega' : 'productor';

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 500,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SISTEMA_PROMPT },
          { role: 'system', content: `Usuario: ${nombre} (cuenta de tipo: ${rolLabel}).\n\nFunciones que existen para este tipo de cuenta:\n${capacidades}\n\nDatos actuales de este usuario:\n${contexto}` },
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
