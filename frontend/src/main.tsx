import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installConnectionGuard } from './services/connectionGuard'

installConnectionGuard()

// ── Recuperación automática tras un despliegue (PWA / Service Worker) ──
// Si un chunk hasheado deja de existir (build nuevo) el navegador lanza
// "vite:preloadError" o un error de import dinámico. En vez de quedar en
// pantalla en blanco, recargamos una sola vez para tomar el build nuevo.
// ── En DESARROLLO local no debe haber Service Worker ──
// Si quedó uno registrado de una sesión previa (p. ej. tras un preview de
// producción), intercepta los fetch y rompe el login. Lo desregistramos y
// limpiamos sus cachés para que el dev local funcione limpio contra la API.
if (typeof window !== 'undefined' && import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length === 0) return;
    Promise.all(regs.map((r) => r.unregister()))
      .then(() => (window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null))
      .then(() => window.location.reload())
      .catch(() => {});
  }).catch(() => {});
}

if (typeof window !== 'undefined' && !import.meta.env.DEV) {
  const RELOAD_FLAG = 'simac_chunk_reload';

  const forzarRecargaUnaVez = () => {
    // Evita bucles: solo recarga si no lo hicimos en los últimos 10 s
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || '0');
    if (Date.now() - last < 10000) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    window.location.reload();
  };

  // Vite emite este evento cuando falla la precarga de un módulo/chunk
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    forzarRecargaUnaVez();
  });

  // Respaldo: errores de "failed to fetch dynamically imported module"
  window.addEventListener('error', (e) => {
    const msg = String(e?.message || '');
    if (/dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i.test(msg)) {
      forzarRecargaUnaVez();
    }
  });

  // Cuando un NUEVO Service Worker toma el control (tras un deploy), recargar
  // para servir assets consistentes. No recarga en la primera visita (cuando
  // aún no había un SW controlando la página).
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}

// iOS PWA: al reanudar la app desde background, forzar scroll a 0 para evitar
// el desfase de viewport que deja un espacio blanco en la parte inferior.
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  });
  // pageshow cubre el caso de "back/forward cache" de iOS Safari
  window.addEventListener('pageshow', () => {
    window.scrollTo(0, 0);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
