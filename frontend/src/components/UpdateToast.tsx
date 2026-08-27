import { useState, useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

export default function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (!r) return;
      // Verificar actualizaciones cada 30 segundos...
      setInterval(() => { r.update(); }, 30 * 1000);
      // ...y también de inmediato cada vez que el usuario vuelve a la pestaña
      // (admin con el panel abierto desde antes de un deploy, app en segundo
      // plano, etc.) — así no depende de esperar el siguiente intervalo.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') r.update();
      });
    },
  });

  const [applying, setApplying] = useState(false);
  const applied = useRef(false);

  // Cuando el nuevo SW toma control, recargar la página automáticamente
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = () => { window.location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', handler);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
  }, []);

  useEffect(() => {
    if (!needRefresh || applied.current) return;
    applied.current = true;
    setApplying(true);
    const t = setTimeout(() => {
      updateServiceWorker(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh && !applying) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-auto"
      style={{ animation: 'fadeSlideUp 0.35s ease both' }}
    >
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <div className="bg-[#1A5C38] text-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] pl-3.5 pr-4 py-2.5 flex items-center gap-2.5 whitespace-nowrap">
        <div className="w-6 h-6 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
          <RefreshCw
            size={13}
            className={`text-white ${applying ? 'animate-spin' : ''}`}
          />
        </div>
        <div className="leading-tight">
          {applying ? (
            <>
              <p className="text-[12px] font-semibold">Actualizando la app…</p>
              <p className="text-[10px] text-white/60">Se aplicarán los cambios en un momento</p>
            </>
          ) : (
            <>
              <p className="text-[12px] font-semibold">Nueva versión detectada</p>
              <p className="text-[10px] text-white/60">Preparando actualización…</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
