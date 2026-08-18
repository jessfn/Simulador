/**
 * Interceptor global de `fetch` para detectar, sin tocar cada página una por
 * una, dos situaciones que antes dejaban el admin "congelado" hasta que el
 * usuario cerraba sesión manualmente:
 *
 *  1. El backend no responde (caído, red cortada, etc.) — se emite el evento
 *     `simac:sin-conexion` para que la UI muestre un aviso con reintentar.
 *  2. La sesión expiró (401) — se fuerza el logout + redirect automático,
 *     igual que ya hacía `services/api.ts`, pero para TODAS las llamadas
 *     `fetch` de la app (muchas páginas hacían fetch crudo sin pasar por ahí).
 *
 * Se instala una sola vez al arrancar la app (ver `main.tsx`).
 */

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

let installed = false;

function esLlamadaApi(url: string): boolean {
  return url.startsWith(BASE);
}

function esRutaAuth(url: string): boolean {
  return url.startsWith(`${BASE}/auth/`) || url.includes('/productor/auth/');
}

function handleSesionExpirada() {
  let loginPath = '/login';
  try {
    const persisted = JSON.parse(localStorage.getItem('simac-auth') || '{}');
    const rol = persisted?.state?.user?.rol as string | undefined;
    const esPanelUsuario = persisted?.state?.user?.es_panel_usuario as boolean | undefined;
    if (rol === 'productor') loginPath = '/login-productor';
    else if (rol === 'admin' || rol === 'responsable' || (rol === 'user' && esPanelUsuario)) loginPath = '/admin/login';
  } catch { /* ignore */ }
  localStorage.removeItem('simac_token');
  localStorage.removeItem('simac-auth');
  if (window.location.pathname !== loginPath) {
    window.location.href = loginPath;
  }
}

export function installConnectionGuard(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const esApi = esLlamadaApi(url);

    try {
      const res = await originalFetch(...args);

      if (esApi) {
        // El backend respondió — si veníamos de un aviso de "sin conexión", ocultarlo.
        window.dispatchEvent(new CustomEvent('simac:conexion-ok'));

        if (res.status === 401 && !esRutaAuth(url)) {
          handleSesionExpirada();
        }
      }

      return res;
    } catch (err) {
      if (esApi) {
        window.dispatchEvent(new CustomEvent('simac:sin-conexion'));
      }
      throw err;
    }
  };
}
