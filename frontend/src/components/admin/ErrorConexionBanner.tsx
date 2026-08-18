import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

/**
 * Aviso reutilizable de "sin conexión con el servidor" con botón de reintentar.
 * Puede usarse embebido en una página (pasando `onRetry`), o de forma global
 * escuchando los eventos `simac:sin-conexion` / `simac:conexion-ok` que emite
 * `services/connectionGuard.ts` cada vez que cualquier fetch a la API falla
 * o vuelve a responder — así el aviso aparece sin importar qué página o
 * llamada fue la que falló.
 */
export default function ErrorConexionBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2.5 text-red-700">
        <WifiOff size={16} className="flex-shrink-0" />
        <p className="text-[12px] font-semibold leading-tight">
          No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.
        </p>
      </div>
      <button
        onClick={onRetry ?? (() => window.location.reload())}
        className="flex items-center gap-1.5 text-[11px] font-bold text-red-700 bg-white hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all duration-150 flex-shrink-0"
      >
        <RefreshCw size={11} /> Reintentar
      </button>
    </div>
  );
}

/** Banner global: se muestra solo mientras haya fallas de red activas hacia la API. */
export function GlobalConexionBanner() {
  const [sinConexion, setSinConexion] = useState(false);

  useEffect(() => {
    const onFail = () => setSinConexion(true);
    const onOk = () => setSinConexion(false);
    window.addEventListener('simac:sin-conexion', onFail);
    window.addEventListener('simac:conexion-ok', onOk);
    return () => {
      window.removeEventListener('simac:sin-conexion', onFail);
      window.removeEventListener('simac:conexion-ok', onOk);
    };
  }, []);

  if (!sinConexion) return null;
  return (
    <div className="px-3 pt-2">
      <ErrorConexionBanner onRetry={() => window.location.reload()} />
    </div>
  );
}
