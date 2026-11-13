import { useEffect, useRef } from 'react';
import { usePermisosStore } from '../store/permisos';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export function usePermisosSSE(userId: number | undefined, rolTienePermisosTotal: boolean) {
  const setPermisos = usePermisosStore(s => s.setPermisos);
  const esRef       = useRef<EventSource | null>(null);

  useEffect(() => {
    // Si es admin (permisos totales), marcar el store y no conectar SSE
    if (rolTienePermisosTotal) {
      setPermisos([], true);
      return;
    }
    if (!userId) return;

    const token = localStorage.getItem('simac_token');
    if (!token) return;

    // Cargar permisos iniciales via REST
    fetch(`${BASE}/admin/permisos/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => (r.ok ? r.json() : { permisos: [] }))
      .then(d => setPermisos(d.permisos ?? [], d.permisos_totales ?? false))
      .catch(() => setPermisos([], false));

    // Abrir SSE para actualizaciones en tiempo real
    // EventSource no soporta headers → pasamos token como query param
    const url = `${BASE}/admin/permisos/stream?token=${encodeURIComponent(token)}`;
    const es  = new EventSource(url, { withCredentials: false });
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const { tipo, permisos } = JSON.parse(e.data);
        if (tipo === 'permisos') setPermisos(permisos, false);
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // Reconectar automáticamente después de 5s
      es.close();
      setTimeout(() => {
        if (!esRef.current || esRef.current.readyState === EventSource.CLOSED) {
          // El effect se re-ejecutará si cambia userId, sino el navegador reintenta solo
        }
      }, 5000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [userId, rolTienePermisosTotal, setPermisos]);
}
