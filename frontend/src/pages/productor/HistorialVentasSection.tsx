import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Wheat } from 'lucide-react';

interface Transaccion {
  id: number;
  bodega_nombre: string;
  volumen_ton: number;
  precio_por_ton: number;
  variedad: string;
  fecha: string;
  estado_confirmacion: string;
}

interface Props {
  token: string;
  apiUrl: string;
}

export default function HistorialVentasSection({ token, apiUrl }: Props) {
  const navigate = useNavigate();
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch(`${apiUrl}/transacciones?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setTransacciones(Array.isArray(d) ? d : d.data || []))
      .catch(() => setTransacciones([]))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badgeColor = (estado: string) => {
    if (estado === 'confirmada') return 'bg-green-100 text-green-700';
    if (estado === 'discrepancia') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };

  const badgeLabel = (estado: string) => {
    if (estado === 'confirmada') return 'Confirmada';
    if (estado === 'discrepancia') return 'Discrepancia';
    return 'Pendiente';
  };

  if (cargando) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-[#eef8f2] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList size={18} /> Mis ventas
        </h3>
        {transacciones.length > 0 && (
          <span className="text-xs text-gray-400">
            Últimas {transacciones.length}
          </span>
        )}
      </div>

      {/* Lista */}
      {transacciones.length === 0 ? (
        <div className="text-center py-8">
          <Wheat size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm font-medium">
            Aún no tienes ventas registradas
          </p>
          <p className="text-gray-400 text-xs mt-1">
            Tus transacciones con bodegas aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {transacciones.map(txn => (
            <div key={txn.id} className="py-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm">
                  {txn.bodega_nombre}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">
                  {txn.volumen_ton} ton ·{' '}
                  ${txn.precio_por_ton?.toLocaleString('es-MX')}/ton ·{' '}
                  {txn.variedad || 'Sin variedad'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {txn.fecha
                    ? new Date(txn.fecha).toLocaleDateString('es-MX', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                    : '—'}
                </p>
              </div>
              <div className="ml-3 flex flex-col items-end gap-1">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor(txn.estado_confirmacion)}`}>
                  {badgeLabel(txn.estado_confirmacion)}
                </span>
                {txn.estado_confirmacion === 'pendiente' && (
                  <button
                    onClick={() => navigate(`/maiz/productor/transaccion/${txn.id}/confirmar`)}
                    className="text-xs text-[#1A5C38] underline"
                  >
                    Confirmar →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
