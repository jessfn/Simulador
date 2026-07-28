import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellRing, ShieldAlert, CloudRain, ShoppingCart, Receipt, Heart,
  MapPin, ChevronDown, Check, Loader2, X, ClipboardCheck,
  Clock, ArrowRight, AlertCircle, ChevronLeft,
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Notif {
  id: number; tipo: string; mensaje: string; leida: boolean; created_at: string;
  titulo?: string; referencia_id?: number; referencia_tipo?: string; datos_extra?: any;
}

const parseExtra = (d: any) => {
  if (!d) return {};
  try { return typeof d === 'string' ? JSON.parse(d) : d; } catch { return {}; }
};

type Cfg = {
  Icon: any; label: string;
  color: string; bg: string; bgDark: string;
  route?: string;
};

const TIPO_CFG: Record<string, Cfg> = {
  alerta_sanitaria:         { Icon: ShieldAlert,   label: 'Sanitaria',         color: 'text-red-600',     bg: 'bg-red-50',     bgDark: 'bg-red-100' },
  alerta_climatica:         { Icon: CloudRain,     label: 'Climática',         color: 'text-orange-600',  bg: 'bg-orange-50',  bgDark: 'bg-orange-100' },
  senal_compra:             { Icon: ShoppingCart,  label: 'Señal de compra',   color: 'text-emerald-600', bg: 'bg-emerald-50', bgDark: 'bg-emerald-100' },
  interes_senal:            { Icon: Heart,         label: 'Interés',           color: 'text-rose-600',    bg: 'bg-rose-50',    bgDark: 'bg-rose-100' },
  interes_bodega_oferta:    { Icon: Heart,         label: 'Interés de bodega', color: 'text-rose-600',    bg: 'bg-rose-50',    bgDark: 'bg-rose-100' },
  confirmacion_transaccion: { Icon: Receipt,       label: 'Transacción',       color: 'text-blue-600',    bg: 'bg-blue-50',    bgDark: 'bg-blue-100',  route: '/productor' },
  transaccion:              { Icon: Receipt,       label: 'Transacción',       color: 'text-blue-600',    bg: 'bg-blue-50',    bgDark: 'bg-blue-100' },
};
const DEFAULT_CFG: Cfg = {
  Icon: Bell, label: 'Aviso',
  color: 'text-gray-500', bg: 'bg-gray-50', bgDark: 'bg-gray-100',
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Justo ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function fullDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const INTERES_KEY = 'simac_senales_interes';
const loadInteres = (): Set<number> => {
  try { return new Set(JSON.parse(localStorage.getItem(INTERES_KEY) || '[]')); } catch { return new Set(); }
};

export default function AlertasPage() {
  const navigate = useNavigate();
  const [notifs, setNotifs]     = useState<Notif[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expandida, setExpandida] = useState<number | null>(null);
  const [interes, setInteres]   = useState<Set<number>>(loadInteres());
  const [enviando, setEnviando] = useState<number | null>(null);
  const [toast, setToast]       = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const cargar = () => {
      const token = localStorage.getItem('simac_token');
      fetch(`${BASE}/alertas/notificaciones/mis`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setNotifs(d.notificaciones || d || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    cargar();
    const interval = setInterval(cargar, 30000);
    return () => clearInterval(interval);
  }, []);

  const marcarLeida = async (id: number) => {
    const token = localStorage.getItem('simac_token');
    await fetch(`${BASE}/alertas/notificaciones/${id}/leer`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
  };

  const mostrarToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const abrirMapaBodega = (n: Notif) => {
    const x = parseExtra(n.datos_extra);
    if (x.bodega_lat && x.bodega_lng) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${x.bodega_lat},${x.bodega_lng}`, '_blank');
    } else if (x.bodega_municipio) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(`${x.bodega_municipio}, ${x.bodega_estado || ''}`)}`, '_blank');
    } else {
      navigate('/productor/mapa');
    }
  };

  const marcarInteres = async (n: Notif) => {
    const senalId = n.referencia_id!;
    setEnviando(senalId);
    try {
      const token = localStorage.getItem('simac_token');
      const r = await fetch(`${BASE}/senales-compra/${senalId}/interes`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error();
      const next = new Set(interes); next.add(senalId); setInteres(next);
      localStorage.setItem(INTERES_KEY, JSON.stringify([...next]));
      if (!n.leida) marcarLeida(n.id);
      mostrarToast(true, '¡Interés enviado! La bodega fue notificada.');
      abrirMapaBodega(n);
    } catch {
      mostrarToast(false, 'No se pudo enviar. Intenta de nuevo.');
    } finally {
      setEnviando(null);
    }
  };

  const descartarSenal = (n: Notif) => {
    if (!n.leida) marcarLeida(n.id);
    mostrarToast(true, 'Listo, no te mostraremos esta señal de nuevo.');
  };

  const toggleNotif = (n: Notif) => {
    if (n.tipo === 'confirmacion_transaccion' && n.referencia_id) {
      if (!n.leida) marcarLeida(n.id);
      navigate(`/productor/transaccion/${n.referencia_id}/confirmar`);
      return;
    }
    if (!n.leida) marcarLeida(n.id);
    setExpandida(prev => prev === n.id ? null : n.id);
  };

  const noLeidas = notifs.filter(n => !n.leida).length;

  // ── Push nativas ──────────────────────────────
  const [pushPermiso, setPushPermiso] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if ('Notification' in window) setPushPermiso(Notification.permission);
  }, []);

  const suscribirPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const sw = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;
      const suscripcion = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey
      });
      const { endpoint, keys } = suscripcion.toJSON() as any;
      const token = localStorage.getItem('simac_token');
      await fetch(`${BASE}/productor/push/suscribir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
      });
      setPushPermiso('granted');
    } catch (err) {
      console.warn('Push no disponible:', err);
    }
  };

  const solicitarPermisoPush = async () => {
    if (!('Notification' in window)) return;
    const permiso = await Notification.requestPermission();
    setPushPermiso(permiso);
    if (permiso === 'granted') await suscribirPush();
  };
  // ─────────────────────────────────────────────

  return (
    <div className="w-full">

      {/* ── Header único: volver + título + resumen + acciones ── */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full bg-white/[0.03] pointer-events-none" />

        <div className="relative z-10 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-2 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center ring-1 ring-white/20 flex-shrink-0">
                {noLeidas > 0 ? <BellRing size={19} className="text-white" strokeWidth={2.2} /> : <Bell size={19} className="text-white/70" strokeWidth={2.2} />}
              </div>
              <div>
                <h1 className="text-[20px] sm:text-[23px] font-black text-white leading-tight tracking-tight">
                  Alertas
                </h1>
                <p className="text-[12.5px] font-medium text-green-100/70 mt-0.5">
                  {loading ? 'Cargando…' : noLeidas > 0
                    ? `${noLeidas} sin leer · ${notifs.length} en total`
                    : `Todo al día · ${notifs.length} notificación${notifs.length !== 1 ? 'es' : ''}`}
                </p>
              </div>
            </div>

            {noLeidas > 0 && (
              <button
                onClick={async () => {
                  const token = localStorage.getItem('simac_token');
                  await fetch(`${BASE}/alertas/notificaciones/leer-todas`, {
                    method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
                  }).catch(() => {});
                  setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
                }}
                className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 text-white rounded-xl px-3 py-2 text-[12px] font-bold transition-all duration-200 active:scale-[0.97]"
              >
                <Check size={13} />
                <span className="hidden sm:inline">Marcar </span>todas
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
                const cfg = TIPO_CFG[tipo] || DEFAULT_CFG;
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

      {/* ── Banner push nativas (si aún no ha respondido) ── */}
      {pushPermiso === 'default' && (
        <div className="mx-4 mt-4 mb-2 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Bell size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-amber-800">Activa alertas en tu celular</p>
            <p className="text-[11.5px] text-amber-700 mt-0.5 leading-relaxed">
              Recibe avisos de plagas cercanas a tu parcela aunque no tengas la app abierta.
            </p>
          </div>
          <button
            onClick={solicitarPermisoPush}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11.5px] px-3 py-2
                       rounded-xl transition-all whitespace-nowrap shrink-0"
          >
            Activar
          </button>
        </div>
      )}

      {/* ── Lista ── */}
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-10 space-y-2.5">

        {loading && (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[80px] bg-white rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && notifs.length === 0 && (
          <div className="text-center py-20 bg-white rounded-[1.75rem] border border-black/[0.04] shadow-[0_2px_16px_rgba(0,0,0,0.04)]">
            <div className="w-20 h-20 bg-[#f4fbf7] rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Bell size={38} className="text-gray-300" />
            </div>
            <p className="text-[16px] text-gray-700 font-bold tracking-tight">Sin notificaciones</p>
            <p className="text-[13px] text-gray-400 mt-1.5 font-medium max-w-xs mx-auto leading-relaxed">
              Aquí verás señales de compra, alertas y avisos.
            </p>
          </div>
        )}

        {!loading && notifs.map((n, idx) => {
          const cfg = TIPO_CFG[n.tipo] || DEFAULT_CFG;
          const Icon = cfg.Icon;
          const isOpen = expandida === n.id;
          const esSenal = n.tipo === 'senal_compra' && !!n.referencia_id;
          const esTx = n.tipo === 'confirmacion_transaccion' && !!n.referencia_id;
          const yaInteresado = esSenal && interes.has(n.referencia_id!);
          const enviandoEste = enviando === n.referencia_id;

          return (
            <div
              key={n.id}
              style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
              className={`w-full rounded-[1.5rem] border overflow-hidden transition-all duration-300
                ${isOpen
                  ? 'shadow-[0_8px_32px_rgba(0,0,0,0.1)] border-[#1A5C38]/25'
                  : n.leida
                    ? 'bg-white border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)]'
                    : 'bg-emerald-50/40 border-[#1A5C38]/20 shadow-[0_4px_16px_rgba(26,92,56,0.1)]'}
                ${isOpen ? 'bg-white' : ''}
              `}
            >
              {/* ── Cabecera clickeable ── */}
              <button
                onClick={() => toggleNotif(n)}
                className="w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors duration-200 active:bg-black/[0.02]"
              >
                {/* Icono */}
                <div className={`relative w-10 h-10 rounded-[0.875rem] flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-300
                  ${isOpen ? cfg.bgDark + ' scale-105' : cfg.bg}`}>
                  <Icon size={18} className={cfg.color} strokeWidth={2.1} />
                  {!n.leida && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#1A5C38] ring-2 ring-white animate-pulse" />
                  )}
                </div>

                {/* Todo el texto ocupa el ancho disponible */}
                <div className="flex-1 min-w-0">
                  {/* Fila superior: categoría · tiempo · chevron/flecha */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10.5px] font-bold uppercase tracking-wider flex-shrink-0 ${n.leida ? 'text-gray-400' : 'text-[#1A5C38]'}`}>
                        {cfg.label}
                      </span>
                      <span className="text-gray-300 flex-shrink-0">·</span>
                      <span className="text-[10.5px] text-gray-400 font-medium flex-shrink-0">
                        {timeAgo(n.created_at)}
                      </span>
                    </div>
                    {!esTx ? (
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300
                        ${isOpen ? 'bg-[#1A5C38]/10 rotate-180' : 'bg-gray-100'}`}>
                        <ChevronDown size={13} className={isOpen ? 'text-[#1A5C38]' : 'text-gray-400'} />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <ArrowRight size={12} className="text-blue-500" />
                      </div>
                    )}
                  </div>

                  {/* Mensaje — ancho completo, envuelve hasta 2 líneas */}
                  <p className={`text-[14px] leading-snug ${isOpen ? '' : 'line-clamp-2'} ${n.leida ? 'font-medium text-gray-600' : 'font-bold text-gray-900'}`}>
                    {n.mensaje}
                  </p>
                </div>
              </button>

              {/* ── Contenido expandible ── */}
              {!esTx && (
                <div
                  className="transition-all duration-300 ease-in-out overflow-hidden"
                  style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="px-4 pb-4">
                      <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-3.5" />

                      {/* Mensaje completo */}
                      <p className="text-[13.5px] text-gray-700 font-medium leading-relaxed mb-3 whitespace-pre-line">
                        {n.mensaje}
                      </p>

                      {/* Fecha */}
                      <div className="flex items-center gap-1.5 text-[11.5px] text-gray-400 font-medium mb-4">
                        <Clock size={11} />
                        <span className="capitalize">{fullDate(n.created_at)}</span>
                      </div>

                      {/* Acciones señal de compra */}
                      {esSenal && (
                        yaInteresado ? (
                          <div className="flex items-center justify-between gap-2 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-3.5 py-3">
                            <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-emerald-700">
                              <Check size={14} strokeWidth={2.6} /> Ya respondiste a esta señal
                            </span>
                            <button
                              onClick={() => abrirMapaBodega(n)}
                              className="flex items-center gap-1 text-[12px] font-bold text-[#1A5C38] hover:underline"
                            >
                              <MapPin size={13} /> Ver mapa
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => !enviandoEste && marcarInteres(n)}
                              disabled={enviandoEste}
                              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold bg-[#1A5C38] text-white shadow-[0_4px_14px_rgba(26,92,56,0.3)] hover:bg-[#16512f] active:scale-[0.97] transition-all duration-200 disabled:opacity-60"
                            >
                              {enviandoEste
                                ? <><Loader2 size={14} className="animate-spin" /> Enviando…</>
                                : <><Heart size={14} strokeWidth={2.3} /> Me interesa</>}
                            </button>
                            <button
                              onClick={() => descartarSenal(n)}
                              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold text-gray-500 bg-[#f4fbf7] ring-1 ring-gray-200 hover:bg-[#eef8f2] active:scale-[0.97] transition-all duration-200"
                            >
                              <X size={14} strokeWidth={2.4} /> No me interesa
                            </button>
                          </div>
                        )
                      )}

                      {/* Acciones genéricas (si no es señal) */}
                      {!esSenal && (
                        <div className="flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>
                            <Icon size={11} />
                            {cfg.label}
                          </span>
                          <div className="flex items-center gap-2">
                            {!n.leida && (
                              <button
                                onClick={e => { e.stopPropagation(); marcarLeida(n.id); }}
                                className="flex items-center gap-1 text-[12px] text-gray-500 font-semibold px-3 py-1.5 rounded-xl border border-gray-200 hover:border-gray-300 active:bg-gray-50 transition-colors"
                              >
                                <Check size={12} /> Marcar leída
                              </button>
                            )}
                            {!n.leida && !cfg.route && (
                              <span className="flex items-center gap-1 text-[11px] text-gray-400 font-medium">
                                <AlertCircle size={11} /> Sin acción
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Acción directa para transacción (visible siempre, sin expandir) */}
              {esTx && (
                <div className="px-4 pb-4 -mt-1">
                  <button
                    onClick={() => { if (!n.leida) marcarLeida(n.id); navigate(`/productor/transaccion/${n.referencia_id}/confirmar`); }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.25)] hover:bg-blue-700 active:scale-[0.97] transition-all duration-200"
                  >
                    <ClipboardCheck size={15} strokeWidth={2.3} /> Revisar y confirmar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Toast flotante ── */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] w-[calc(100%-2rem)] max-w-xs">
          <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md
            ${toast.ok ? 'bg-[#1A5C38] text-white' : 'bg-red-600 text-white'}`}>
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              {toast.ok ? <Check size={15} strokeWidth={2.8} /> : <ShieldAlert size={15} />}
            </div>
            <p className="text-[13px] font-semibold leading-snug">{toast.msg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
