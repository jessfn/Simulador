import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, Signal, Receipt, Store, Megaphone,
  ClipboardList, Tag, Wheat, ChevronDown, ArrowRight, Clock, AlertCircle,
  BellRing, BellOff, Loader2, ChevronLeft,
} from 'lucide-react';
import { api } from '../services/api';

const BASE = import.meta.env.VITE_API_URL || '/api';
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function usePushSubscription() {
  const [permiso, setPermiso] = useState<NotificationPermission | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if ('Notification' in window) setPermiso(Notification.permission);
  }, []);

  const activar = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_KEY) return;
    setCargando(true);
    try {
      const perm = await Notification.requestPermission();
      setPermiso(perm);
      if (perm !== 'granted') return;
      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
      const { endpoint, keys } = sub.toJSON() as any;
      const token = localStorage.getItem('simac_token');
      await fetch(`${BASE}/productor/push/suscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
      });
    } catch (e) {
      console.warn('Push no disponible:', e);
    } finally {
      setCargando(false);
    }
  };

  const desactivar = async () => {
    setCargando(true);
    try {
      const token = localStorage.getItem('simac_token');
      await fetch(`${BASE}/productor/push/cancelar`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const sw = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.getSubscription();
      await sub?.unsubscribe();
      setPermiso('default');
    } catch { /**/ } finally {
      setCargando(false);
    }
  };

  return { permiso, cargando, activar, desactivar };
}

interface Notif {
  id: number;
  leida: boolean;
  created_at: string;
  titulo: string | null;
  mensaje: string | null;
  tipo: string | null;
  referencia_id: number | null;
  referencia_tipo: string | null;
  alerta_id: number | null;
  tipo_alerta: string | null;
  nivel_alerta: string | null;
}

const TIPO_CONFIG: Record<string, {
  icon: typeof Bell;
  color: string;
  bg: string;
  bgDark: string;
  label: string;
  route?: string;
}> = {
  nuevo_requerimiento:      { icon: Signal,        color: 'text-cyan-600',    bg: 'bg-cyan-50',    bgDark: 'bg-cyan-100',    label: 'Requerimiento',   route: '/maiz/bodega/requerimientos' },
  interes_senal:            { icon: Signal,        color: 'text-cyan-600',    bg: 'bg-cyan-50',    bgDark: 'bg-cyan-100',    label: 'Señal',           route: '/maiz/bodega/requerimientos' },
  confirmacion_transaccion: { icon: Receipt,       color: 'text-orange-500',  bg: 'bg-orange-50',  bgDark: 'bg-orange-100',  label: 'Transacción',     route: '/maiz/bodega/transacciones' },
  interes_bodega_oferta:    { icon: Megaphone,     color: 'text-blue-600',    bg: 'bg-blue-50',    bgDark: 'bg-blue-100',    label: 'Oferta',          route: '/maiz/bodega/oferta' },
  nueva_disponibilidad:     { icon: Wheat,         color: 'text-green-600',   bg: 'bg-green-50',   bgDark: 'bg-green-100',   label: 'Disponibilidad',  route: '/maiz/bodega/oferta' },
  solicitud_apoyo:          { icon: Store,         color: 'text-purple-600',  bg: 'bg-purple-50',  bgDark: 'bg-purple-100',  label: 'Ventanilla',      route: '/maiz/bodega/ventanillas' },
  cambio_estado_solicitud:  { icon: ClipboardList, color: 'text-green-600',   bg: 'bg-green-50',   bgDark: 'bg-green-100',   label: 'Solicitud' },
  alerta_tarifario:         { icon: Tag,           color: 'text-amber-600',   bg: 'bg-amber-50',   bgDark: 'bg-amber-100',   label: 'Tarifario',       route: '/maiz/bodega/tarifario' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Justo ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function B23Notificaciones() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState<number | null>(null);
  const push = usePushSubscription();

  useEffect(() => {
    const cargar = () => {
      api.notificaciones.mis()
        .then((r: any) => setNotifs(r.notificaciones || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    cargar();
    const interval = setInterval(cargar, 30000);
    return () => clearInterval(interval);
  }, []);

  async function marcarTodas() {
    await api.notificaciones.leerTodas();
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
  }

  async function toggleNotif(n: Notif) {
    // Marcar como leída al expandir
    if (!n.leida) {
      api.notificaciones.leer(n.id).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
    }
    setExpandida(prev => prev === n.id ? null : n.id);
  }

  function irARuta(n: Notif) {
    const cfg = TIPO_CONFIG[n.tipo || ''];
    if (cfg?.route) navigate(cfg.route);
  }

  const noLeidas = notifs.filter(n => !n.leida).length;

  return (
    <div className="w-full">

      {/* ── Banner sticky verde (mismo estilo que Oferta) ── */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] overflow-hidden">
        {/* Decoración de fondo */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full bg-white/[0.03] pointer-events-none" />

        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-3 pb-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-1.5 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-white leading-tight drop-shadow-sm flex items-center gap-2">
                <Bell size={20} className="text-white/70" />
                Notificaciones
              </h1>
              <p className="text-green-100/80 text-[13px] mt-0.5 font-medium">
                {loading ? 'Cargando…' : noLeidas > 0 ? `${noLeidas} sin leer · ${notifs.length} en total` : `Todo al día · ${notifs.length} notificación${notifs.length !== 1 ? 'es' : ''}`}
              </p>
            </div>

            {noLeidas > 0 && (
              <button
                onClick={marcarTodas}
                className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white rounded-xl px-3 py-2 text-[12px] font-bold transition-all duration-200 active:scale-[0.97]"
              >
                <CheckCheck size={13} />
                <span className="hidden sm:inline">Marcar </span>todas leídas
              </button>
            )}
          </div>

          {/* Chips resumen */}
          {!loading && notifs.length > 0 && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {noLeidas > 0 && (
                <span className="inline-flex items-center gap-1 bg-white/15 border border-white/20 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {noLeidas} nuevas
                </span>
              )}
              {Array.from(new Set(notifs.map(n => n.tipo).filter(Boolean))).slice(0, 3).map(tipo => {
                const cfg = TIPO_CONFIG[tipo || ''];
                if (!cfg) return null;
                const count = notifs.filter(n => n.tipo === tipo).length;
                return (
                  <span key={tipo} className="inline-flex items-center gap-1 bg-white/10 border border-white/10 text-white/80 text-[11px] font-semibold px-2.5 py-1 rounded-full">
                    {cfg.label} ({count})
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Banner push nativas ── */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4">
        {'Notification' in window && push.permiso === 'default' && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <BellRing size={16} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-bold text-amber-800">Activa alertas en tu dispositivo</p>
              <p className="text-[11px] text-amber-700 leading-snug mt-0.5">
                Recibe avisos aunque la app esté cerrada — requerimientos, transacciones y más.
              </p>
            </div>
            <button
              onClick={push.activar}
              disabled={push.cargando}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] px-3 py-2 rounded-xl transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {push.cargando ? <Loader2 size={11} className="animate-spin" /> : <BellRing size={11} />}
              Activar
            </button>
          </div>
        )}
        {'Notification' in window && push.permiso === 'granted' && (
          <div className="mb-3 bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center gap-2.5">
            <BellRing size={14} className="text-emerald-600 shrink-0" />
            <p className="text-[11.5px] text-emerald-700 font-semibold flex-1">Notificaciones push activas en este dispositivo</p>
            <button
              onClick={push.desactivar}
              disabled={push.cargando}
              className="flex items-center gap-1 text-[10.5px] text-emerald-600 hover:text-red-500 font-semibold transition-colors disabled:opacity-50"
            >
              {push.cargando ? <Loader2 size={10} className="animate-spin" /> : <BellOff size={10} />}
              Desactivar
            </button>
          </div>
        )}
        {'Notification' in window && push.permiso === 'denied' && (
          <div className="mb-3 bg-gray-50 border border-gray-100 rounded-2xl p-3 flex items-center gap-2.5">
            <BellOff size={14} className="text-gray-400 shrink-0" />
            <p className="text-[11px] text-gray-500 leading-snug">
              Notificaciones bloqueadas en este dispositivo. Actívalas desde la configuración del navegador.
            </p>
          </div>
        )}
      </div>

      {/* ── Lista de notificaciones ── */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 py-5 space-y-2.5">

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
            <p className="text-[13px] text-gray-400 font-medium">Cargando notificaciones…</p>
          </div>
        ) : notifs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[1.75rem] border border-black/[0.04] shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
            <div className="w-20 h-20 bg-[#f4fbf7] rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Bell size={38} className="text-gray-300" />
            </div>
            <p className="text-[17px] text-gray-700 font-bold tracking-tight">Sin notificaciones</p>
            <p className="text-[13px] text-gray-400 mt-1.5 font-medium max-w-xs mx-auto leading-relaxed">
              Cuando haya actividad en tus bodegas aparecerá aquí.
            </p>
          </div>
        ) : (
          notifs.map((n, idx) => {
            const cfg = TIPO_CONFIG[n.tipo || ''] || { icon: Bell, color: 'text-gray-400', bg: 'bg-gray-50', bgDark: 'bg-gray-100', label: 'Sistema' };
            const Icon = cfg.icon;
            const titulo = n.titulo || n.tipo_alerta || 'Notificación';
            const mensaje = n.mensaje || '';
            const isOpen = expandida === n.id;
            const tieneRuta = !!(TIPO_CONFIG[n.tipo || '']?.route);

            return (
              <div
                key={n.id}
                className={`w-full rounded-[1.5rem] border overflow-hidden transition-all duration-300
                  ${isOpen
                    ? 'shadow-[0_8px_32px_rgba(0,0,0,0.1)] border-[#1A5C38]/25'
                    : n.leida
                      ? 'border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)]'
                      : 'border-[#1A5C38]/20 shadow-[0_4px_16px_rgba(26,92,56,0.1)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.15)]'
                  }
                  ${n.leida && !isOpen ? 'bg-white' : isOpen ? 'bg-white' : 'bg-emerald-50/40'}
                `}
                style={{ animationDelay: `${idx * 30}ms` }}
              >
                {/* ── Cabecera clickeable ── */}
                <button
                  onClick={() => toggleNotif(n)}
                  className="w-full flex items-start gap-3 px-4 sm:px-5 py-4 text-left transition-colors duration-200 active:bg-black/[0.02]"
                >
                  {/* Icono */}
                  <div className={`w-10 h-10 rounded-[0.875rem] flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-300 ${isOpen ? cfg.bgDark + ' scale-105' : cfg.bg}`}>
                    <Icon size={18} className={cfg.color} />
                  </div>

                  {/* Todo el texto ocupa el ancho disponible */}
                  <div className="flex-1 min-w-0">
                    {/* Fila superior: categoría · tiempo · punto · chevron */}
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[10.5px] font-bold uppercase tracking-wider flex-shrink-0 ${n.leida ? 'text-gray-400' : 'text-[#1A5C38]'}`}>
                          {cfg.label}
                        </span>
                        <span className="text-gray-300 flex-shrink-0">·</span>
                        <span className="text-[10.5px] text-gray-400 font-medium flex-shrink-0">
                          {timeAgo(n.created_at)}
                        </span>
                        {!n.leida && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1A5C38] animate-pulse flex-shrink-0" />
                        )}
                      </div>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isOpen ? 'bg-[#1A5C38]/10 rotate-180' : 'bg-gray-100'}`}>
                        <ChevronDown size={13} className={isOpen ? 'text-[#1A5C38]' : 'text-gray-400'} />
                      </div>
                    </div>

                    {/* Título — ancho completo, envuelve hasta 2 líneas */}
                    <p className={`text-[15px] leading-snug ${isOpen ? '' : 'line-clamp-2'} ${n.leida ? 'font-semibold text-gray-700' : 'font-bold text-gray-900'}`}>
                      {titulo}
                    </p>

                    {/* Preview del mensaje (solo cerrado) */}
                    {!isOpen && mensaje && (
                      <p className="text-[12px] text-gray-400 font-medium mt-1 line-clamp-1">{mensaje}</p>
                    )}
                  </div>
                </button>

                {/* ── Contenido expandible (grid-rows trick para animación suave) ── */}
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="px-4 sm:px-5 pb-4 pt-0">
                      {/* Divider */}
                      <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-4" />

                      {/* Mensaje completo */}
                      {mensaje ? (
                        <p className="text-[14px] text-gray-700 font-medium leading-relaxed mb-4">
                          {mensaje}
                        </p>
                      ) : (
                        <p className="text-[13px] text-gray-400 italic mb-4">Sin detalles adicionales.</p>
                      )}

                      {/* Fecha completa */}
                      <div className="flex items-center gap-2 text-[12px] text-gray-400 font-medium mb-4">
                        <Clock size={12} />
                        <span className="capitalize">{fullDate(n.created_at)}</span>
                      </div>

                      {/* Footer: etiqueta tipo + botón de acción */}
                      <div className="flex items-center justify-between gap-3">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                          <Icon size={11} />
                          {cfg.label}
                        </span>

                        <div className="flex items-center gap-2">
                          {!n.leida && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                api.notificaciones.leer(n.id).catch(() => {});
                                setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
                              }}
                              className="flex items-center gap-1 text-[12px] text-gray-500 font-semibold px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 active:bg-gray-50 transition-colors"
                            >
                              <CheckCheck size={12} />
                              Marcar leída
                            </button>
                          )}
                          {tieneRuta && (
                            <button
                              onClick={e => { e.stopPropagation(); irARuta(n); }}
                              className="flex items-center gap-1.5 text-[12px] font-bold text-white bg-[#1A5C38] hover:bg-[#174f30] active:bg-[#133f26] px-4 py-1.5 rounded-xl shadow-sm transition-all duration-200 active:scale-[0.97]"
                            >
                              Ver detalle
                              <ArrowRight size={12} />
                            </button>
                          )}
                          {!tieneRuta && n.leida && (
                            <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                              <AlertCircle size={11} />
                              Sin acción disponible
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
