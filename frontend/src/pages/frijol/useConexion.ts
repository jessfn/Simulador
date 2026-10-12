import { useEffect, useState } from 'react';

/** true cuando el teléfono tiene conexión. Se actualiza solo al perderla o recuperarla. */
export function useConexion(alCambiar?: (enLinea: boolean) => void): boolean {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const sube = () => { setEnLinea(true); alCambiar?.(true); };
    const baja = () => { setEnLinea(false); alCambiar?.(false); };
    window.addEventListener('online', sube);
    window.addEventListener('offline', baja);
    return () => { window.removeEventListener('online', sube); window.removeEventListener('offline', baja); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return enLinea;
}
