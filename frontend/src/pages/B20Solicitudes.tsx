import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/Layout';
import { api } from '../services/api';

const ESTADOS = ['Todas', 'recibida', 'contactado', 'agendada', 'canalizada', 'cerrada'];

const badgeColor: Record<string, string> = {
  recibida: 'bg-blue-100 text-blue-700',
  contactado: 'bg-yellow-100 text-yellow-800',
  agendada: 'bg-purple-100 text-purple-700',
  canalizada: 'bg-green-100 text-green-700',
  cerrada: 'bg-[#eef8f2] text-gray-500',
};

export default function B20Solicitudes() {
  const { id } = useParams<{ id: string }>();
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [filtro, setFiltro] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const estado = filtro === 'Todas' ? undefined : filtro;
    api.ventanillas.solicitudes(Number(id), estado)
      .then((r: any) => setSolicitudes(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, filtro]);

  return (
    <div className="w-full pb-10">
      <PageHeader title="Solicitudes" subtitle="Productores interesados" back="/maiz/bodega/ventanillas" />

      <div className="w-full max-w-3xl mx-auto">

      {/* Filtros scroll horizontal */}
      <div className="px-4 sm:px-6 py-4 flex gap-2.5 overflow-x-auto no-scrollbar">
        {ESTADOS.map(e => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`flex-shrink-0 px-5 py-2.5 rounded-[1.25rem] text-[14px] font-bold transition-all
              ${filtro === e ? 'bg-[#1A5C38] text-white shadow-[0_4px_12px_rgba(26,92,56,0.25)]' : 'bg-[#eef8f2] text-gray-500 hover:bg-gray-200/60'}`}
          >
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>

      <div className="px-4 sm:px-6 py-2 space-y-3">
        {loading && <p className="text-center text-gray-400 text-[14px] font-medium py-10">Cargando…</p>}

        {solicitudes.map(s => (
          <button
            key={s.id}
            onClick={() => navigate(`/maiz/bodega/ventanillas/${id}/solicitudes/${s.id}`)}
            className="w-full bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-5 text-left active:scale-[0.98] transition-all duration-500 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 flex items-center gap-4 group/card"
          >
            <div className="flex-1 min-w-0 transition-transform duration-500 group-hover/card:translate-x-1">
              <p className="font-bold text-[16px] text-gray-900 truncate group-hover/card:text-[#1A5C38] transition-colors">{s.productor_nombre || 'Productor'}</p>
              <p className="text-[13px] font-medium text-gray-500 mt-0.5">{s.municipio} · {s.nombre_apoyo}</p>
              <p className="text-[12px] text-gray-400 mt-1">{new Date(s.created_at).toLocaleDateString('es-MX')}</p>
            </div>
            <span className={`text-[12px] font-bold px-3 py-1.5 rounded-full flex-shrink-0 ${badgeColor[s.estado] || 'bg-[#eef8f2] text-gray-500'}`}>
              {s.estado}
            </span>
            <ChevronRight size={18} className="text-gray-300 flex-shrink-0 transition-transform duration-300 group-hover/card:translate-x-1 group-hover/card:text-[#1A5C38]" />
          </button>
        ))}

        {!loading && solicitudes.length === 0 && (
          <p className="text-center text-gray-400 text-[14px] font-medium py-12">Sin solicitudes con este filtro</p>
        )}
      </div>
      </div>
    </div>
  );
}
