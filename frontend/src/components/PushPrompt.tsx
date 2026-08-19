import { useState, useEffect, useCallback } from 'react';
import { Bell, X, BellRing, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';

const BASE      = import.meta.env.VITE_API_URL || '/api';
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
const STORAGE_KEY = 'simac_push_dismissed_until';

function urlBase64ToUint8Array(b64: string): ArrayBuffer {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function esPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

function pushSoportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_KEY;
}

interface Props {
  rol: 'bodeguero' | 'productor';
}

export default function PushPrompt({ rol }: Props) {
  const [visible, setVisible]   = useState(false);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito]       = useState(false);

  // Si el usuario ya había dado permiso antes (posiblemente con una suscripción
  // rota o de una VAPID key anterior), renovarla en silencio — sin volver a
  // preguntar — para que el push efectivamente funcione sin acción del usuario.
  useEffect(() => {
    if (!pushSoportado()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Solo renovar una vez por cada VAPID key (evita desuscribir/resuscribir en cada carga).
    const SYNC_KEY = `simac_push_synced_${VAPID_KEY.slice(0, 12)}`;
    if (localStorage.getItem(SYNC_KEY) === '1') return;
    (async () => {
      try {
        const sw = await navigator.serviceWorker.ready;
        const existente = await sw.pushManager.getSubscription();
        if (existente) await existente.unsubscribe();
        const sub = await sw.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
        });
        const { endpoint, keys } = sub.toJSON() as any;
        const token = localStorage.getItem('simac_token');
        if (!token) return;
        await fetch(`${BASE}/productor/push/suscribir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
        });
        localStorage.setItem(SYNC_KEY, '1');
      } catch (e) {
        console.warn('Renovación silenciosa de push falló:', e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!pushSoportado()) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;

    const dismissedUntil = localStorage.getItem(STORAGE_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return;

    const delay = esPWA() ? 1200 : 8000;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!pushSoportado()) return;
    const onInstall = () => {
      setTimeout(() => {
        if (Notification.permission === 'default') setVisible(true);
      }, 2000);
    };
    window.addEventListener('appinstalled', onInstall);
    return () => window.removeEventListener('appinstalled', onInstall);
  }, []);

  const activar = useCallback(async () => {
    if (!pushSoportado()) return;
    setCargando(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setVisible(false); return; }
      const sw  = await navigator.serviceWorker.ready;
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
      setExito(true);
      setTimeout(() => setVisible(false), 3500);
    } catch (e) {
      console.warn('Push error:', e);
      setVisible(false);
    } finally {
      setCargando(false);
    }
  }, []);

  const descartar = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    setVisible(false);
  };

  if (!visible) return null;

  const textos = {
    bodeguero: {
      titulo: 'Mantente al tanto en tiempo real',
      subtitulo: 'Alertas instantáneas para tu bodega',
      desc: 'Recibe avisos de nuevos requerimientos, intereses de productores y transacciones aunque tengas la app cerrada.',
      puntos: ['Nuevos requerimientos', 'Interesados en tu oferta', 'Confirmaciones de venta'],
    },
    productor: {
      titulo: 'Alertas directas a tu celular',
      subtitulo: 'Notificaciones para tu parcela',
      desc: 'Entérate de alertas sanitarias, señales de compra y novedades importantes aunque no tengas la app abierta.',
      puntos: ['Alertas de plagas cercanas', 'Señales de compra de bodegas', 'Apoyos y programas disponibles'],
    },
  };

  const txt = textos[rol];

  return (
    <>
      {/* Backdrop siempre presente */}
      <div
        className="fixed inset-0 z-[998]"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'ppFadeIn .25s ease',
        }}
        onClick={!exito ? descartar : undefined}
      />

      {/* Modal centrado */}
      <div
        className="fixed inset-0 z-[999] flex items-center justify-center p-4"
        style={{ animation: 'ppSlideIn .35s cubic-bezier(0.34,1.4,0.64,1)' }}
      >
        <div
          className="w-full max-w-sm sm:max-w-md"
          onClick={e => e.stopPropagation()}
        >
          {exito ? (
            /* ── Estado éxito ── */
            <div
              className="rounded-3xl overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.35)]"
              style={{ animation: 'ppSlideIn .3s cubic-bezier(0.34,1.4,0.64,1)' }}
            >
              <div className="bg-gradient-to-br from-emerald-500 to-[#1A5C38] px-8 pt-10 pb-8 flex flex-col items-center text-center">
                {/* Icono animado */}
                <div
                  className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-5 shadow-xl"
                  style={{ animation: 'ppPop .4s cubic-bezier(0.34,1.56,0.64,1) .1s both' }}
                >
                  <CheckCircle2 size={40} className="text-white" strokeWidth={2} />
                </div>
                <p className="text-white font-black text-[22px] leading-tight tracking-tight">
                  ¡Notificaciones activadas!
                </p>
                <p className="text-emerald-100/90 text-[14px] mt-2.5 leading-relaxed max-w-xs">
                  Recibirás alertas importantes aunque la app esté cerrada. No te perderás nada.
                </p>
              </div>
              <div className="bg-white px-8 py-5 flex items-center justify-center gap-2.5">
                <BellRing size={16} className="text-[#1A5C38]" />
                <p className="text-[13px] text-slate-500 font-medium">
                  Puedes desactivarlas en cualquier momento desde Alertas
                </p>
              </div>
            </div>
          ) : (
            /* ── Estado normal ── */
            <div className="rounded-3xl overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.35)]">

              {/* Cabecera con gradiente */}
              <div className="bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] relative overflow-hidden px-7 pt-8 pb-7">
                {/* Círculos decorativos de fondo */}
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
                <div className="absolute -bottom-10 -left-10 w-52 h-52 rounded-full bg-white/5 pointer-events-none" />

                {/* Botón cerrar */}
                <button
                  onClick={descartar}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <X size={15} className="text-white/80" />
                </button>

                {/* Icono principal */}
                <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mb-5 shadow-lg">
                  <Bell size={28} className="text-white" strokeWidth={1.8} />
                </div>

                <p className="text-green-300/80 text-[11px] font-bold uppercase tracking-widest mb-1.5">
                  {txt.subtitulo}
                </p>
                <h2 className="text-white font-black text-[22px] sm:text-[24px] leading-tight tracking-tight">
                  {txt.titulo}
                </h2>
                <p className="text-green-100/75 text-[13px] mt-2.5 leading-relaxed">
                  {txt.desc}
                </p>
              </div>

              {/* Cuerpo blanco */}
              <div className="bg-white px-7 pt-6 pb-7">

                {/* Puntos de valor */}
                <div className="space-y-3 mb-7">
                  {txt.puntos.map((punto) => (
                    <div key={punto} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#eef8f2] flex items-center justify-center shrink-0">
                        <ShieldCheck size={13} className="text-[#1A5C38]" />
                      </div>
                      <p className="text-[13px] text-slate-600 font-medium">{punto}</p>
                    </div>
                  ))}
                </div>

                {/* Botones */}
                <div className="space-y-2.5">
                  <button
                    onClick={activar}
                    disabled={cargando}
                    className="w-full flex items-center justify-center gap-2.5 bg-[#1A5C38] hover:bg-[#154d2f] active:scale-[0.98] text-white font-bold text-[15px] py-4 rounded-2xl transition-all duration-200 disabled:opacity-60 shadow-lg shadow-[#1A5C38]/25"
                  >
                    {cargando ? (
                      <><Loader2 size={18} className="animate-spin" /> Activando…</>
                    ) : (
                      <><Bell size={17} strokeWidth={2} /> Activar notificaciones</>
                    )}
                  </button>

                  <button
                    onClick={descartar}
                    className="w-full py-3.5 text-[13px] font-semibold text-slate-400 hover:text-slate-600 transition-colors rounded-2xl"
                  >
                    Ahora no
                  </button>
                </div>

                <p className="text-center text-[11px] text-slate-300 mt-3">
                  Puedes desactivarlas cuando quieras · Sin spam
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ppFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes ppSlideIn { from { opacity:0; transform:scale(0.92) translateY(24px) } to { opacity:1; transform:scale(1) translateY(0) } }
        @keyframes ppPop     { from { transform:scale(0.5); opacity:0 } to { transform:scale(1); opacity:1 } }
      `}</style>
    </>
  );
}
