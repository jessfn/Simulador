import { useNavigate, useRouteError } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/** Se muestra dentro del panel cuando una pantalla falla, sin perder el menú. */
export default function ErrorDePantallaAdmin() {
  const error = useRouteError();
  const navigate = useNavigate();
  console.error('Error en una pantalla del panel:', error);

  return (
    <div role="alert" className="mx-auto mt-10 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
      <AlertTriangle className="mx-auto text-red-500" size={32} />
      <h2 className="mt-3 text-[17px] font-bold text-gray-900">No se pudo mostrar esta pantalla</h2>
      <p className="mt-1 text-[13px] text-gray-600">Intenta de nuevo. Si el problema sigue, avisa al equipo de soporte.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 rounded-xl bg-[#1A5C38] px-4 py-2 text-[13px] font-bold text-white">
          <RefreshCw size={14} /> Recargar
        </button>
        <button type="button" onClick={() => navigate('/maiz/admin')}
          className="rounded-xl border border-gray-300 px-4 py-2 text-[13px] font-bold text-gray-700">
          Ir al inicio
        </button>
      </div>
    </div>
  );
}
