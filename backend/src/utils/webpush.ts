import webpush from 'web-push';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:simac@agricultura.gob.mx',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export interface PushSubscription {
  endpoint: string;
  p256dh:   string;
  auth:     string;
}

export interface PushPayload {
  titulo:  string;
  mensaje: string;
  tipo:    string;
  nivel?:  string;
  /** Si se define, se usa en vez de URL_POR_TIPO — necesario cuando el destino depende del rol del receptor. */
  url?:    string;
}

// URL a la que abre la app al tocar la notificación, por tipo de evento
const URL_POR_TIPO: Record<string, string> = {
  senal_compra:             '/maiz/productor/alertas',
  interes_senal:            '/maiz/bodega/notificaciones',
  confirmacion_transaccion: '/maiz/productor/alertas',
  interes_bodega_oferta:    '/maiz/bodega/notificaciones',
  nueva_disponibilidad:     '/maiz/bodega/oferta',
  alerta_sanitaria:         '/maiz/productor/alertas',
  alerta_tarifario:         '/maiz/bodega/notificaciones',
  solicitud_apoyo:          '/maiz/bodega/ventanillas',
  nuevo_requerimiento:      '/maiz/bodega/requerimientos',
};

export const enviarPushNativa = async (
  suscripcion: PushSubscription,
  payload: PushPayload
): Promise<void> => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const url = payload.url ?? URL_POR_TIPO[payload.tipo] ?? '/maiz/bodega/notificaciones';

  await webpush.sendNotification(
    {
      endpoint: suscripcion.endpoint,
      keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth }
    },
    JSON.stringify({
      title:  payload.titulo,
      body:   payload.mensaje,
      icon:   '/icono.png',
      badge:  '/icono.png',
      data:   { tipo: payload.tipo, nivel: payload.nivel ?? 'info', url },
    })
  );
};
