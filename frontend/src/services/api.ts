const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function getToken(): string | null {
  // Primary: directly stored key
  const direct = localStorage.getItem('simac_token');
  if (direct) return direct;
  // Fallback: from zustand persisted state (in case simac_token was cleared)
  try {
    const persisted = JSON.parse(localStorage.getItem('simac-auth') || '{}');
    const t = persisted?.state?.token as string | undefined;
    if (t) {
      // Re-sync the direct key so future calls are faster
      localStorage.setItem('simac_token', t);
      return t;
    }
  } catch { /* ignore */ }
  return null;
}

function handle401(): void {
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
  window.location.href = loginPath;
}

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers });
  } catch {
    throw new Error('SIN_CONEXION');
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    handle401();
    throw new Error('Sesión expirada. Por favor inicia sesión nuevamente.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch crudo autenticado para páginas que necesitan el Response directo
 * (ej. Promise.allSettled con múltiples endpoints). A diferencia de un
 * fetch() manual, detecta caída del backend (SIN_CONEXION) y sesión
 * expirada (401 -> logout automático) de forma centralizada.
 */
export async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers });
  } catch {
    throw new Error('SIN_CONEXION');
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    handle401();
    throw new Error('SESION_EXPIRADA');
  }

  return res;
}

export { BASE };

export const api = {
  auth: {
    login: (email: string, password: string, contexto?: 'admin' | 'bodega') =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, contexto }) }),
    registro: (data: any) =>
      request('/auth/registro', { method: 'POST', body: JSON.stringify(data) }),
    perfil: () => request('/auth/perfil'),
    states: () => request('/auth/states'),
    municipalities: (state_id: string) => request(`/auth/municipalities?state_id=${state_id}`),
  },
  bodegas: {
    list: (params?: { q?: string; estado?: string; municipio?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return request(`/bodegas${qs ? '?' + qs : ''}`);
    },
    get: (id: number) => request(`/bodegas/${id}`),
    semaforo: (id: number, semaforo: string) =>
      request(`/bodegas/${id}/semaforo`, { method: 'PATCH', body: JSON.stringify({ semaforo }) }),
    create: (data: Record<string, unknown>) =>
      request('/bodegas', { method: 'POST', body: JSON.stringify(data) }),
    capacidad: (id: number, capacidad_ton: number) =>
      request(`/bodegas/${id}/capacidad`, { method: 'PATCH', body: JSON.stringify({ capacidad_ton }) }),
  },
  bodeguero: {
    solicitar: (bodega_id: number) =>
      request('/bodeguero/bodegas/solicitar', { method: 'POST', body: JSON.stringify({ bodega_id }) }),
    misBodegas: () => request('/bodeguero/mis-bodegas'),
    misBodegasEstatus: () => request('/bodeguero/mis-bodegas-estatus'),
    editarBodega: (id: number | string, data: { horario?: string; telefono_contacto?: string; observaciones?: string }) =>
      request(`/bodeguero/bodegas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  infraestructura: {
    get: (id: number) => request(`/infraestructura/${id}`),
    inventario: (id: number, data: any) =>
      request(`/infraestructura/${id}/inventario`, { method: 'POST', body: JSON.stringify(data) }),
    precios: (id: number) => request(`/infraestructura/${id}/precios`),
    publicarPrecio: (id: number, data: any) =>
      request(`/infraestructura/${id}/precios`, { method: 'POST', body: JSON.stringify(data) }),
    contactos: (id: number) => request(`/infraestructura/${id}/contactos`),
    agregarContacto: (id: number, data: any) =>
      request(`/infraestructura/${id}/contactos`, { method: 'POST', body: JSON.stringify(data) }),
    eliminarContacto: (id: number, cid: number) =>
      request(`/infraestructura/${id}/contactos/${cid}`, { method: 'DELETE' }),
  },
  senales: {
    list: (params?: { bodega_id?: number; tipo_maiz?: string }) => {
      const qs = new URLSearchParams(params as any).toString();
      return request(`/senales-compra${qs ? '?' + qs : ''}`);
    },
    create: (data: any) =>
      request('/senales-compra', { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: number) =>
      request(`/senales-compra/${id}`, { method: 'DELETE' }),
    interes: (id: number) =>
      request(`/senales-compra/${id}/interes`, { method: 'POST' }),
    interesados: (id: number | string) =>
      request(`/senales-compra/${id}/interesados`),
  },
  transacciones: {
    list: (params?: any) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/transacciones${qs ? '?' + qs : ''}`);
    },
    get: (id: number | string) => request(`/transacciones/${id}`),
    create: (data: any) =>
      request('/transacciones', { method: 'POST', body: JSON.stringify(data) }),
    confirmar: (id: number, confirmacion: string) =>
      request(`/transacciones/${id}/confirmar`, { method: 'PATCH', body: JSON.stringify({ confirmacion }) }),
  },
  tarifario: {
    get: (bodegaId: number) => request(`/tarifario/${bodegaId}`),
    create: (bodegaId: number, data: any) =>
      request(`/tarifario/${bodegaId}`, { method: 'POST', body: JSON.stringify(data) }),
    update: (bodegaId: number, tarifaId: number, data: any) =>
      request(`/tarifario/${bodegaId}/${tarifaId}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  conceptos: {
    list: () => request('/cat-conceptos-servicio'),
    proponer: (data: any) =>
      request('/cat-conceptos-servicio/proponer', { method: 'POST', body: JSON.stringify(data) }),
  },
  ventanillas: {
    list: () => request('/ventanillas'),
    create: (data: any) =>
      request('/ventanillas', { method: 'POST', body: JSON.stringify(data) }),
    apoyos: (id: number) => request(`/ventanillas/${id}/apoyos`),
    crearApoyo: (id: number, data: any) =>
      request(`/ventanillas/${id}/apoyos`, { method: 'POST', body: JSON.stringify(data) }),
    toggleApoyo: (id: number, aid: number, data: any) =>
      request(`/ventanillas/${id}/apoyos/${aid}`, { method: 'PATCH', body: JSON.stringify(data) }),
    solicitudes: (id: number, estado?: string) => {
      const qs = estado ? `?estado=${estado}` : '';
      return request(`/ventanillas/${id}/solicitudes${qs}`);
    },
    cambiarEstado: (id: number, sid: number, data: any) =>
      request(`/ventanillas/${id}/solicitudes/${sid}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  oferta: {
    municipios: (params?: any) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/oferta/municipios${qs ? '?' + qs : ''}`);
    },
    interesMunicipio: (municipio: string, data: { bodega_id: number; tipo_maiz?: string; precio_ofrecido?: number; estado?: string }) =>
      request(`/oferta/municipios/${encodeURIComponent(municipio)}/interes`, { method: 'POST', body: JSON.stringify(data) }),
    misIntereses: () => request('/oferta/mis-intereses'),
    quitarInteres: (id: number | string) => request(`/oferta/intereses/${id}`, { method: 'DELETE' }),
  },
  disponibilidad: {
    list: () => request('/productor/disponibilidad'),
    create: (data: any) => request('/productor/disponibilidad', { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: number) => request(`/productor/disponibilidad/${id}`, { method: 'DELETE' }),
  },
  precios: {
    dashboard: () => request('/precios/dashboard'),
  },
  filtrosGuardados: {
    list: () => request('/filtros-guardados'),
    create: (data: any) => request('/filtros-guardados', { method: 'POST', body: JSON.stringify(data) }),
    toggle: (id: number, activo: boolean) =>
      request(`/filtros-guardados/${id}`, { method: 'PATCH', body: JSON.stringify({ activo }) }),
    remove: (id: number) => request(`/filtros-guardados/${id}`, { method: 'DELETE' }),
  },
  propuestas: {
    mias: () => request('/propuestas/mias'),
    create: (data: any) => request('/propuestas', { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: number) => request(`/propuestas/${id}`, { method: 'DELETE' }),
    disponibles: (params?: { bodega_id?: number; tipo_maiz?: string; volumen_min?: number; radio_km?: number }) => {
      const clean: Record<string, string> = {};
      Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') clean[k] = String(v); });
      const qs = new URLSearchParams(clean).toString();
      return request(`/propuestas/disponibles${qs ? '?' + qs : ''}`);
    },
    ofertas: (id: number | string) => request(`/propuestas/${id}/ofertas`),
    miOferta: (id: number | string) => request(`/propuestas/${id}/mi-oferta`),
    ofertar: (id: number | string, data: any) =>
      request(`/propuestas/${id}/ofertas`, { method: 'POST', body: JSON.stringify(data) }),
    retirarOferta: (id: number | string, ofertaId: number | string) =>
      request(`/propuestas/${id}/ofertas/${ofertaId}`, { method: 'DELETE' }),
    aceptar: (id: number | string, oferta_id: number) =>
      request(`/propuestas/${id}/aceptar`, { method: 'POST', body: JSON.stringify({ oferta_id }) }),
  },
  home: {
    stats: () => request('/home/stats'),
  },
  notificaciones: {
    mis: () => request('/alertas/notificaciones/mis'),
    leer: (id: number) => request(`/alertas/notificaciones/${id}/leer`, { method: 'PATCH' }),
    leerTodas: () => request('/alertas/notificaciones/leer-todas', { method: 'PATCH' }),
  },
  catalogos: {
    tipoMaiz: () => request('/bodegas/catalogos'),
    variedades: () => request('/infraestructura/catalogos'),
  },
  productor: {
    loginPin: (curp: string, pin: string) =>
      request('/productor/auth/login-pin', { method: 'POST', body: JSON.stringify({ curp, pin }) }),
    registroNuevo: (data: Record<string, unknown>) =>
      request('/productor/auth/registro-nuevo', { method: 'POST', body: JSON.stringify(data) }),
    dashboard: () => request('/productor/dashboard'),
    precios: () => request('/productor/precios'),
    actualizarUbicacion: (lat: number, lng: number) =>
      request('/productor/ubicacion', { method: 'PATCH', body: JSON.stringify({ lat, lng }) }),
    solicitarApoyo: (data: { infraestructura_id: number; tipo_apoyo: string; notas?: string }) =>
      request('/productor/solicitar-apoyo', { method: 'POST', body: JSON.stringify(data) }),
    misSolicitudes: () => request('/productor/mis-solicitudes'),
    perfil: () => request('/productor/perfil'),
    actualizarPerfil: (data: { telefono?: string; programas_beneficiario?: string[] }) =>
      request('/productor/perfil', { method: 'PATCH', body: JSON.stringify(data) }),
  },
};
