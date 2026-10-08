import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { api } from '../services/api';

interface Transaccion {
  id: number;
  bodega_nombre: string;
  nombre_productor: string;
  volumen_ton: number;
  precio_por_ton: number;
  tipo_maiz: string;
  variedad: string;
  calidad?: string;
  fecha: string;
  confirmacion_productor: string;
  peso_precio_sistema: number;
  observaciones?: string;
  created_at: string;
}

export default function B26DetalleTransaccion() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [txn, setTxn] = useState<Transaccion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.transacciones.get(id)
      .then(setTxn)
      .catch((e: any) => setError(e?.message || 'Transacción no encontrada'))
      .finally(() => setCargando(false));
  }, [id]);

  const estadoConfirmacion = () => {
    if (!txn) return null;
    if (txn.confirmacion_productor === 'confirmada') {
      return (
        <div className="flex items-center gap-4 bg-green-50 border border-green-100 rounded-[1.5rem] p-5 shadow-[0_2px_8px_rgba(22,163,74,0.08)]">
          <div className="w-12 h-12 rounded-[1.25rem] bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="text-green-600 w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-green-900 text-[16px]">Confirmada por el productor</p>
            <p className="text-green-700 text-[13px] font-medium mt-0.5">El productor verificó los datos de la transacción</p>
          </div>
        </div>
      );
    }
    if (txn.confirmacion_productor === 'discrepancia') {
      return (
        <div className="flex items-center gap-4 bg-red-50 border border-red-100 rounded-[1.5rem] p-5 shadow-[0_2px_8px_rgba(220,38,38,0.08)]">
          <div className="w-12 h-12 rounded-[1.25rem] bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="text-red-600 w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-red-900 text-[16px]">El productor reportó una discrepancia</p>
            <p className="text-red-700 text-[13px] font-medium mt-0.5">Contacta al productor para resolver la diferencia</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-4 bg-amber-50 border border-amber-100 rounded-[1.5rem] p-5 shadow-[0_2px_8px_rgba(217,119,6,0.08)]">
        <div className="w-12 h-12 rounded-[1.25rem] bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Clock className="text-amber-600 w-6 h-6" />
        </div>
        <div>
          <p className="font-bold text-amber-900 text-[16px]">Pendiente de confirmación</p>
          <p className="text-amber-700 text-[13px] font-medium mt-0.5">El productor aún no ha confirmado esta transacción</p>
        </div>
      </div>
    );
  };

  if (cargando) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-[#eef8f2] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !txn) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500">{error || 'Transacción no encontrada'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-gray-500 underline">
          Volver
        </button>
      </div>
    );
  }

  const volumen = Number(txn.volumen_ton) || 0;
  const precio = Number(txn.precio_por_ton) || 0;
  const peso = Number(txn.peso_precio_sistema) || 0;
  const total = volumen * precio;

  return (
    <div className="w-full pb-10">
      <PageHeader title="Detalle de transacción" subtitle={`#${txn.id}`} back="/maiz/bodega/transacciones" />

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Estado de confirmación */}
        {estadoConfirmacion()}

        {/* Datos principales */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6">
          <h3 className="font-black text-gray-900 text-[18px] mb-5 tracking-tight">Datos de la compra</h3>
          <div className="space-y-4">
            {[
              { label: 'Productor', valor: txn.nombre_productor || '—' },
              { label: 'Bodega', valor: txn.bodega_nombre },
              { label: 'Tipo de maíz', valor: txn.tipo_maiz || '—' },
              { label: 'Variedad', valor: txn.variedad || '—' },
              { label: 'Calidad', valor: txn.calidad || '—' },
              { label: 'Volumen', valor: `${volumen} toneladas` },
              { label: 'Precio por tonelada', valor: `$${precio.toLocaleString('es-MX')} MXN` },
              { label: 'Total', valor: `$${total.toLocaleString('es-MX')} MXN`, destacado: true },
              {
                label: 'Fecha',
                valor: txn.fecha
                  ? new Date(txn.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
                  : '—',
              },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center py-3 border-b border-gray-100/50 last:border-0 last:pb-0">
                <span className="text-gray-500 font-medium text-[14px]">{item.label}</span>
                <span className={`text-[15px] capitalize ${item.destacado ? 'text-[#1A5C38] font-black text-[18px]' : 'text-gray-900 font-bold'}`}>
                  {item.valor}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Observaciones */}
        {txn.observaciones && (
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6">
            <h3 className="font-black text-gray-900 text-[18px] mb-3 tracking-tight">Observaciones</h3>
            <p className="text-gray-600 text-[15px] font-medium leading-relaxed">{txn.observaciones}</p>
          </div>
        )}

        {/* Peso en Precio Sistema */}
        <div className="bg-[#eef8f2] rounded-[1.25rem] p-5">
          <p className="text-[14px] text-gray-500 text-center font-medium">
            Peso en Precio Sistema:{' '}
            <span className="font-bold text-gray-900 ml-1">
              {peso > 0 ? `${(peso * 100).toFixed(0)}%` : 'Pendiente de confirmación'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
