import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, ClipboardList, Download } from 'lucide-react';
import { api } from '../services/api';
import { formatNum } from '../utils/format';

const estadoBadge: Record<string, string> = {
  pendiente:    'bg-amber-50 text-amber-700 border border-amber-200',
  confirmada:   'bg-emerald-50 text-emerald-700 border border-emerald-200',
  discrepancia: 'bg-red-50 text-red-700 border border-red-200',
  expirada:     'bg-[#eef8f2] text-gray-500 border border-gray-200',
};

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function B14HistorialTransacciones() {
  const [txs, setTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const navigate = useNavigate();
  const location = useLocation();

  const cargar = useCallback(() => {
    setLoading(true);
    api.transacciones.list({ page: pagina, limit: 20 })
      .then((r: any) => {
        setTxs(Array.isArray(r) ? r : r.data || []);
        if (r?.pagination) setTotalPaginas(r.pagination.pages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pagina]);

  useEffect(() => { cargar(); }, [cargar, location.key]);

  const descargarCSV = async () => {
    try {
      const token = localStorage.getItem('simac_token') || '';
      const response = await fetch(`${BASE}/transacciones/exportar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('export');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transacciones_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Error al descargar. Intenta de nuevo.');
    }
  };

  return (
    <div className="w-full">
      {/* Banner full-bleed */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] relative overflow-hidden group/banner">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none transition-opacity duration-700 opacity-50 group-hover/banner:opacity-100" />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4 pb-5 relative z-10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/banner:translate-x-1">
          <p className="text-[11px] font-bold text-green-300/80 uppercase tracking-widest mb-0.5">Módulo</p>
          <h1 className="text-[22px] sm:text-[26px] font-bold text-white leading-tight drop-shadow-sm">Transacciones</h1>
          <p className="text-green-100/80 text-[14px] mt-1 font-medium">
            {loading ? 'Cargando…' : `${txs.length} transacción${txs.length !== 1 ? 'es' : ''} registrada${txs.length !== 1 ? 's' : ''}`}
          </p>
          {txs.length > 0 && (
            <button
              onClick={descargarCSV}
              className="mt-3 inline-flex items-center gap-2 text-[13px] font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-4 py-2 transition-all duration-300 hover:shadow-lg active:scale-[0.98]"
            >
              <Download size={15} /> Descargar CSV
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {txs.map(tx => (
            <div key={tx.id}
              onClick={() => navigate(`/maiz/bodega/transacciones/${tx.id}`)}
              className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:border-black/[0.08] transition-all duration-500 group/card">
              <div className="flex justify-between items-start gap-3 mb-2">
                <p className="font-bold text-[15px] text-gray-900 group-hover/card:text-[#1A5C38] transition-colors leading-snug flex-1">
                  {tx.nombre_productor || tx.nombre_productor_libre || 'Productor'}
                </p>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${estadoBadge[tx.confirmacion_productor] || 'bg-[#eef8f2] text-gray-500'}`}>
                  {tx.confirmacion_productor}
                </span>
              </div>
              <p className="text-[13px] text-gray-500 font-medium leading-snug">
                {tx.bodega_nombre} · {tx.fecha ? new Date(tx.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </p>
              <p className="text-[18px] font-black text-[#1A5C38] mt-2">
                {tx.volumen_ton} ton · ${formatNum(tx.precio_ton)}/ton
              </p>
              <p className="text-[12px] text-gray-400 mt-1 font-medium capitalize">{tx.tipo_maiz}</p>
            </div>
          ))}
        </div>

        {!loading && txs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
              <ClipboardList size={32} className="text-gray-300" />
            </div>
            <p className="font-semibold text-[16px] text-gray-700">Sin transacciones registradas</p>
            <p className="text-[14px] text-gray-400">Registra la primera compra de maíz</p>
          </div>
        )}

        {/* Paginación (#6) */}
        {!loading && totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => setPagina(p => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-[#f4fbf7]"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-500">{pagina} de {totalPaginas}</span>
            <button
              onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
              disabled={pagina === totalPaginas}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-[#f4fbf7]"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/maiz/bodega/transacciones/nueva')}
        className="fixed bottom-24 right-5 sm:right-8 lg:right-12 xl:right-20 w-14 h-14 bg-[#1A5C38] text-white rounded-[1.25rem] shadow-[0_4px_12px_rgba(26,92,56,0.3)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.4)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 z-10"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
