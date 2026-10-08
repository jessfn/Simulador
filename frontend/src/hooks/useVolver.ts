import { useNavigate } from 'react-router-dom';

// Retrocede a la pantalla anterior real; si no hay (entrada directa), va a la ruta de respaldo.
export function useVolver(respaldo: string) {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(respaldo, { replace: true });
  };
}
