/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// ── Workbox precaching (inyectado automáticamente por VitePWA) ────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();
self.skipWaiting();

// ── Push: mostrar notificación del sistema ────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  let data: {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    data?: { url?: string; tipo?: string; nivel?: string };
  } = {};

  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: 'SIMAC', body: event.data?.text() ?? 'Nueva notificación' };
  }

  const esChat = data.data?.tipo === 'chat_ayuda';

  const title   = data.title  ?? 'SIMAC';
  const options: NotificationOptions = {
    body:    data.body   ?? '',
    icon:    data.icon   ?? '/icono.png',
    badge:   data.badge  ?? '/icono.png',
    // El chat no se agrupa por tag fijo — cada mensaje debe notificar aparte,
    // igual que en Messenger/WhatsApp (varios mensajes = varias notificaciones).
    tag:     esChat ? `chat-${Date.now()}` : (data.data?.tipo ?? 'simac-notif'),
    data:    data.data   ?? {},
    // @ts-ignore — vibrate y renotify existen en Chrome/Android pero no en los tipos DOM estándar
    // Patrón corto y repetido (como Messenger) para el chat; el resto de alertas mantiene el patrón largo actual.
    vibrate: esChat ? [80, 40, 80, 40, 80] : [200, 100, 200],
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notificationclick: abrir la app en la ruta correcta ──────────────────
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const url = event.notification.data?.url ?? '/';

  event.waitUntil(
    (self.clients as any).matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList: WindowClient[]) => {
        // Si ya hay una ventana/tab abierta de la app — enfócala y navega
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client) (client as any).navigate(url);
            return;
          }
        }
        // Si no hay ventana abierta — abrir una nueva
        if ((self.clients as any).openWindow) {
          return (self.clients as any).openWindow(url);
        }
      })
  );
});

// ── Pushsubscriptionchange: renovar suscripción automáticamente ──────────
// (el browser puede rotar las claves de suscripción)
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const e = event as any;
  e.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: e.oldSubscription?.options?.applicationServerKey })
      .then(async (subscription) => {
        const { endpoint, keys } = subscription.toJSON() as any;
        // Avisar al backend de la nueva suscripción
        const token = await getToken();
        if (!token) return;
        await fetch('/api/productor/push/suscribir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
        });
      })
  );
});

async function getToken(): Promise<string | null> {
  try {
    // El token vive en localStorage del cliente — no accesible directamente desde SW.
    // Retornamos null; el browser maneja la re-suscripción automáticamente.
    return null;
  } catch {
    return null;
  }
}
