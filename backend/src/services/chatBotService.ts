import pool from '../config/database';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora real en México. */
function saludoSegunHora(): string {
  const hora = Number(new Intl.DateTimeFormat('es-MX', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(new Date()));
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

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

  const [ups, disp, props, txns] = await Promise.all([
    pool.query(
      `SELECT up_name, municipality_name, state_name FROM up WHERE producer_id = $1 ORDER BY created_at ASC`,
      [producerId]
    ),
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
  lineas.push(ups.rows.length
    ? `Parcelas (UPs) registradas: ${ups.rows.map(u => `${u.up_name} (${u.municipality_name}, ${u.state_name})`).join('; ')}. Puede agregar más parcelas cuando quiera, incluso si las renta.`
    : 'No tiene ninguna parcela (UP) registrada todavía — puede agregar una desde "Agregar otra parcela", incluso si la renta.');
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

const CAPACIDADES_PRODUCTOR = `Un productor en SIMAC puede:
- Agregar una nueva parcela (UP) cuando quiera, desde "Agregar otra parcela" — dibuja el polígono o marca puntos GPS en el mapa. Puede tener varias parcelas registradas a la vez, y esto aplica igual si es dueño o si RENTA la tierra (rentar no le impide agregar la parcela al sistema).
- Ver y editar su perfil (nombre, correo, teléfono) desde Mi Perfil.
- Descargar su "acuse de registro" en PDF desde Mi Perfil (botón "Acuse de registro" — incluye folio, CURP, fecha de registro y estado de la cuenta).
- Registrar y dar seguimiento a su ciclo productivo (siembra, cosecha).
- Publicar su maíz disponible (tipo, variedad, volumen, fechas, calidad) y, si quiere, publicarlo como "propuesta de negociación abierta a bodegas" con un precio solicitado.
- Ver el mapa de bodegas cercanas y el detalle de cada una.
- Recibir y comparar ofertas de bodegas a sus propuestas (precio, acondicionamiento, transporte, momento de pago) desde "Mis propuestas y ofertas", y aceptar la que prefiera.
- Ver sus transacciones y confirmarlas o marcarlas en disputa.
- Ver precios de referencia del mercado, con la metodología explicada.
- Ver y solicitar apoyo en ventanillas de programas de gobierno, y ver incentivos disponibles.
- Ver sus alertas/notificaciones y el estado de sus solicitudes de apoyo.
NO puede: publicar requerimientos de compra (eso es de bodegas), ofertar por maíz de otros productores, ni ver información de otros productores o de otras bodegas — eso es exclusivo de cuentas de bodega. No existe una pantalla dedicada para EDITAR una parcela ya creada, solo para agregar nuevas y verlas en el mapa/dashboard.`;

const CAPACIDADES_BODEGUERO = `Una bodega en SIMAC puede:
- Ver y editar su perfil, sus bodegas asociadas, y editar los datos de una bodega (dirección, contacto).
- Descargar su "acuse de registro" en PDF desde Mi Perfil (folio, CURP, fecha de registro, estado de la cuenta, bodegas asociadas).
- Gestionar su inventario y publicar/actualizar su precio de compra diario.
- Publicar requerimientos de maíz que busca comprar (señales de compra) para que productores cercanos los vean.
- Ver la tabla de oferta de productores por municipio y marcar interés.
- Ver "propuestas disponibles" publicadas por productores y mandarles una oferta (solo puede igualar o mejorar el precio que pide el productor, nunca ofrecer menos).
- Guardar filtros de búsqueda como alerta para recibir notificación automática cuando aparezca algo que le interese.
- Registrar transacciones manualmente y ver su historial completo.
- Configurar y proponer conceptos en su tarifario de servicios.
- Crear y administrar ventanillas de apoyo propias, y ver/gestionar las solicitudes que reciba en ellas.
- Ver notificaciones y ajustar su configuración de cuenta.
NO puede: publicar disponibilidad de maíz como si fuera productor, ni ver las ofertas que otras bodegas mandaron a la misma propuesta — eso siempre queda oculto entre bodegas. El acceso a "Precios de mercado" puede estar restringido según el tipo de bodega.`;

const SISTEMA_PROMPT = `Eres el asistente automático del chat de ayuda de SIMAC (Sistema de Ordenamiento de la Producción y Comercialización del Maíz en México), una plataforma que conecta productores de maíz con bodegas compradoras.

Reglas estrictas:
- MUY IMPORTANTE: sé conciso. Máximo 2-3 oraciones cortas por respuesta. Nada de párrafos largos ni repetir la pregunta del usuario. Ve directo a la respuesta.
- Amable y cercano, en español natural de México, sin tecnicismos. Dirígete a la persona por su nombre cuando tenga sentido, sin abusar.
- Sigue la instrucción sobre el saludo (al final del mensaje de contexto) tal cual — es una cortesía importante para el usuario.
- Solo hablas de SIMAC: su cuenta, sus datos, cómo usar la plataforma. Si preguntan algo que no tiene nada que ver con SIMAC (clima, noticias, otros temas), dilo con amabilidad y redirige la conversación a en qué le puedes ayudar dentro de la plataforma.
- Antes de responder, lee con cuidado y COMPLETO la lista de "Funciones que existen para este tipo de cuenta" — está actualizada y es la fuente de verdad. Si lo que piden SÍ existe para su rol (aunque esté descrito con otras palabras — por ejemplo "rentar y agregar una parcela" es lo mismo que "agregar una nueva UP"), ayúdales con eso usando sus datos reales. Nunca digas que algo "no se puede" solo porque no lo reconociste a la primera lectura — vuelve a revisar la lista completa antes de negar algo. Si de verdad NO existe para su rol (por ejemplo un bodeguero preguntando cómo publicar disponibilidad de maíz, que es solo de productores), dilo claro y explica brevemente qué sí puede hacer en su lugar.
- Si el usuario menciona la palabra "acuse" sin más contexto (por ejemplo solo escribe "acuse" o "mi acuse"), no asumas qué necesita — pregúntale directamente si se refiere al acuse de registro (el PDF descargable desde Mi Perfil) o a otra cosa, y ya con su respuesta ayúdalo.
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
  conversacionId?: number;
}): Promise<RespuestaBot | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || process.env.CHAT_BOT_ENABLED === 'false') return null;

  try {
    const [nombreR, contexto, primerMsgHoyR] = await Promise.all([
      pool.query('SELECT nombre_completo FROM usuarios WHERE id = $1', [opts.usuarioId]),
      opts.rol === 'bodeguero' ? construirContextoBodeguero(opts.usuarioId) : construirContextoProductor(opts.usuarioId),
      opts.conversacionId
        ? pool.query(
            `SELECT 1 FROM chat_mensajes
             WHERE conversacion_id = $1 AND autor_rol = 'bot'
               AND created_at::date = (now() AT TIME ZONE 'America/Mexico_City')::date
             LIMIT 1`,
            [opts.conversacionId]
          )
        : Promise.resolve({ rows: [] as any[] }),
    ]);
    const nombre = nombreR.rows[0]?.nombre_completo || 'este usuario';
    const capacidades = opts.rol === 'bodeguero' ? CAPACIDADES_BODEGUERO : CAPACIDADES_PRODUCTOR;
    const rolLabel = opts.rol === 'bodeguero' ? 'bodega' : 'productor';
    const esPrimeraDelDia = primerMsgHoyR.rows.length === 0;
    const saludo = saludoSegunHora();
    const notaSaludo = esPrimeraDelDia
      ? `Es la primera vez que le respondes hoy en esta conversación — por respeto, abre tu respuesta con "${saludo}" (ajustado a mayúscula/minúscula natural), antes de contestar su pregunta.`
      : 'Ya le respondiste antes hoy en esta conversación — no hace falta volver a saludar, ve directo a la respuesta.';

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
          { role: 'system', content: `Usuario: ${nombre} (cuenta de tipo: ${rolLabel}).\n\nFunciones que existen para este tipo de cuenta:\n${capacidades}\n\nDatos actuales de este usuario:\n${contexto}\n\n${notaSaludo}` },
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
