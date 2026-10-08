import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Wheat, Check, X } from 'lucide-react';
import { formatNum } from '../../utils/format';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Txn {
  bodega_nombre: string; tipo_maiz: string; volumen_ton: number; precio_ton: number; fecha: string;
}

export default function ConfirmarTransaccionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [txn, setTxn] = useState<Txn | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/transacciones/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTxn(d))
      .finally(() => setLoading(false));
  }, [id]);

  const confirmar = async (esCorrecta: boolean) => {
    setSending(true);
    const token = localStorage.getItem('simac_token');
    await fetch(`${BASE}/transacciones/${id}/confirmar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmacion: esCorrecta ? 'confirmada' : 'discrepancia' }),
    });
    navigate('/maiz/productor', { state: { mensaje: esCorrecta ? 'Transacción confirmada' : 'Discrepancia reportada' } });
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!txn) return <div className="min-h-screen flex items-center justify-center text-gray-400">Transacción no encontrada</div>;

  const total = (txn.volumen_ton || 0) * (txn.precio_ton || 0);

  return (
    <div className="bg-white flex flex-col px-4 sm:px-6 pt-10">
      <div className="max-w-lg mx-auto w-full">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Wheat size={36} className="text-[#1A5C38]" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">
          {txn.bodega_nombre} registró una compra
        </h2>
        <p className="text-gray-500 text-sm mt-2">¿Los datos son correctos?</p>
      </div>

      <div className="bg-[#f4fbf7] rounded-2xl p-5 mb-8 space-y-3">
        {[
          { label: 'Bodega', value: txn.bodega_nombre },
          { label: 'Tipo de maíz', value: txn.tipo_maiz },
          { label: 'Volumen', value: `${txn.volumen_ton} toneladas` },
          { label: 'Precio por ton', value: `$${formatNum(txn.precio_ton, 0)}` },
          { label: 'Total', value: `$${formatNum(total, 0)}`, bold: true },
        ].map(row => (
          <div key={row.label} className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">{row.label}</span>
            <span className={`text-sm ${row.bold ? 'font-bold text-gray-900 text-base' : 'font-medium text-gray-800'}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <button onClick={() => confirmar(true)} disabled={sending}
        className="w-full bg-[#1A5C38] hover:bg-[#15482d] text-white py-5 rounded-2xl text-lg
                   font-semibold active:scale-[0.98] transition-all duration-200 mb-3 shadow-lg disabled:opacity-50 flex items-center justify-center gap-2">
        <Check size={20} /> Si, es correcto
      </button>
      <button onClick={() => confirmar(false)} disabled={sending}
        className="w-full ring-2 ring-red-400 text-red-600 py-5 rounded-2xl
                   text-lg font-semibold active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2">
        <X size={20} /> Los datos no son correctos
      </button>
      <p className="text-center text-xs text-zinc-400 mt-4">
        Si hay un error, el equipo tecnico lo revisara y te contactara.
      </p>
      </div>
    </div>
  );
}
