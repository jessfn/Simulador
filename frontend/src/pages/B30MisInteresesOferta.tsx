import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, Wheat, Signal, Trash2, Heart, MapPin } from 'lucide-react';
import { api } from '../services/api';
import { formatNum } from '../utils/format';
import { useToast } from '../components/Toast';

const tipoLabel: Record<string, string> = {
  blanco: 'Maíz Blanco', amarillo: 'Maíz Amarillo', criollo: 'Criollo / Local',
};

export default function B30MisInteresesOferta() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [eliminando, setEliminando] = useState<number | null>(null);
  const navigate = useNavigate();
  const { toast, confirm } = useToast();

  const cargar = useCallback(() => {
    setLoading(true);
    api.oferta.misIntereses()
      .then((r: any) => setItems(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const quitar = async (id: number, municipio: string) => {
    const ok = await confirm(`¿Quitar "${municipio}" de tus intereses?`);
    if (!ok) return;
    setEliminando(id);
    try {
      await api.oferta.quitarInteres(id);
      setItems(prev => prev.filter(x => x.id !== id));
      toast('Interés eliminado', 'success');
    } catch {
      toast('No se pudo eliminar', 'error');
    } finally {
      setEliminando(null);
    }
  };

  const fechaFmt = (s: string) =>
    s ? new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="w-full">
      {/* Banner */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] relative overflow-hidden group/banner">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none transition-opacity duration-700 opacity-50 group-hover/banner:opacity-100" />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4 pb-5 relative z-10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/banner:translate-x-1">
          <button onClick={() => navigate('/maiz/bodega/oferta')}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-bold mb-1.5 active:opacity-60 transition-opacity hover:text-green-100">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1 transition-transform group-hover/banner:-translate-x-0.5" /> Oferta de productores
          </button>
          <h1 className="text-[22px] sm:text-[26px] font-bold text-white leading-tight flex items-center gap-2 drop-shadow-sm">
            <Heart size={22} className="fill-white/90 text-white/90" /> Mis intereses
          </h1>
          <p className="text-green-100/80 text-[13px] mt-0.5 font-medium">
            {loading ? 'Cargando…' : `${items.length} municipio${items.length !== 1 ? 's' : ''} que te interesa${items.length !== 1 ? 'n' : ''}`}
          </p>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <div className="w-16 h-16 rounded-[1.5rem] bg-rose-50 flex items-center justify-center">
              <Heart size={32} className="text-rose-300" />
            </div>
            <p className="font-bold text-[16px] text-gray-700">Aún no marcas intereses</p>
            <p className="text-[14px] text-gray-400 max-w-xs font-medium">
              En “Oferta de productores” toca <span className="font-bold text-rose-500">Me interesa</span> en
              los municipios que te interesen para guardarlos aquí.
            </p>
            <button onClick={() => navigate('/maiz/bodega/oferta')}
              className="mt-3 bg-[#1A5C38] text-white px-5 py-3 rounded-[1.25rem] text-[14px] font-bold shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300">
              Ver oferta de productores →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(d => (
              <div key={d.id} className="bg-white rounded-2xl border border-black/[0.04] shadow-[0_2px_10px_rgba(0,0,0,0.04)] p-4 flex flex-col gap-3 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:border-black/[0.08] transition-all duration-300 group/card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 transition-transform duration-500 group-hover/card:translate-x-1">
                    <p className="font-bold text-[17px] text-gray-900 group-hover/card:text-[#1A5C38] transition-colors truncate">{d.municipio}</p>
                    <p className="text-[13px] text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {d.estado || 'Sin estado'}
                    </p>
                  </div>
                  {d.tipo_maiz && (
                    <span className="bg-[#1A5C38]/[0.08] text-[#1A5C38] text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0">
                      {tipoLabel[d.tipo_maiz] || d.tipo_maiz}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-xl p-3 ${Number(d.productores_disponibles) >= 10 ? 'bg-emerald-50' : Number(d.productores_disponibles) >= 5 ? 'bg-amber-50' : 'bg-[#eef8f2]'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Users size={11} className="text-gray-400" />
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Productores</p>
                    </div>
                    <p className="text-[20px] font-black text-[#1A5C38]">{d.productores_disponibles}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${Number(d.toneladas_estimadas) >= 500 ? 'bg-emerald-50' : Number(d.toneladas_estimadas) >= 100 ? 'bg-amber-50' : 'bg-[#eef8f2]'}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <Wheat size={11} className="text-gray-400" />
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Toneladas</p>
                    </div>
                    <p className="text-[20px] font-black text-gray-800">{formatNum(d.toneladas_estimadas)}</p>
                  </div>
                </div>

                {Number(d.productores_disponibles) === 0 && (
                  <p className="text-[12px] text-amber-700 font-medium bg-amber-50 rounded-lg px-3 py-2 -mt-1">
                    Sin oferta activa por ahora en este municipio.
                  </p>
                )}

                <p className="text-[11px] text-gray-400 font-medium">Marcado el {fechaFmt(d.created_at)}</p>

                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={() => navigate(`/maiz/bodega/requerimientos?municipio=${encodeURIComponent(d.municipio)}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#1A5C38]/[0.08] hover:bg-[#1A5C38]/[0.13] text-[#1A5C38] rounded-xl py-2.5 text-[12px] font-bold active:scale-[0.98] transition-all duration-200"
                  >
                    <Signal size={13} /> Requerimiento
                  </button>
                  <button
                    onClick={() => quitar(d.id, d.municipio)}
                    disabled={eliminando === d.id}
                    className="flex items-center justify-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl px-3.5 py-2.5 text-[12px] font-bold active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
