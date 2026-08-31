import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, MapPinned, ChevronRight, UserPlus, Sprout } from 'lucide-react';
import { api } from '../../services/api';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';

interface Registro {
  producer_id: number;
  curp: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno?: string;
  telefono?: string;
  state_id?: string;
  municipality_id?: string;
  municipio_nombre?: string;
  estatus_registro?: string;
  fecha_captura?: string;
  total_ups?: number;
  total_ciclos?: number;
}

function curpTruncada(curp: string) {
  if (!curp || curp.length < 6) return curp;
  return `${curp.slice(0, 4)}${'*'.repeat(Math.max(curp.length - 6, 0))}${curp.slice(-2)}`;
}

export default function DashboardTecnicoPage() {
  const navigate = useNavigate();
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.tecnico.misRegistros()
      .then((res: any) => setRegistros(res?.registros || []))
      .catch(() => setError('No se pudieron cargar tus registros.'))
      .finally(() => setLoading(false));
  }, []);

  const totalProductores = registros.length;
  const totalUPs = registros.reduce((acc, r) => acc + (r.total_ups || 0), 0);

  return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico title="Inicio" subtitle="Panel del técnico ECA" />

      <div className="p-4 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="w-9 h-9 rounded-xl bg-[#1A5C38]/10 flex items-center justify-center mb-2">
              <Users size={18} className="text-[#1A5C38]" />
            </div>
            <p className="text-[22px] font-black text-slate-900 leading-none">{totalProductores}</p>
            <p className="text-[11px] text-slate-500 font-semibold mt-1">Productores registrados</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center mb-2">
              <MapPinned size={18} className="text-emerald-700" />
            </div>
            <p className="text-[22px] font-black text-slate-900 leading-none">{totalUPs}</p>
            <p className="text-[11px] text-slate-500 font-semibold mt-1">Parcelas (UPs) totales</p>
          </div>
        </div>

        {/* Botón registrar */}
        <button onClick={() => navigate('/tecnico/registrar')}
          className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white rounded-2xl py-4 font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm">
          <UserPlus size={18} /> Registrar nuevo productor
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-600 text-[13px]">{error}</div>
        )}

        {/* Lista de registros */}
        <div>
          <h3 className="text-[13px] font-black text-slate-800 mb-2 px-1">Tus registros</h3>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-7 h-7 border-[3px] border-[#1A5C38]/20 border-t-[#1A5C38] rounded-full animate-spin" />
            </div>
          ) : registros.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <Sprout size={28} className="text-slate-300 mx-auto mb-2" />
              <p className="text-[13px] text-slate-500 font-medium">Aún no has registrado productores.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
              {registros.map(r => (
                <button key={r.producer_id} onClick={() => navigate(`/tecnico/productor/${r.producer_id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-[#eef8f2] transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-[#1A5C38]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[13px] font-bold text-[#1A5C38]">
                      {(r.nombres?.[0] || '') + (r.apellido_paterno?.[0] || '')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-slate-800 truncate">
                      {r.nombres} {r.apellido_paterno} {r.apellido_materno || ''}
                    </p>
                    <p className="text-[11.5px] text-slate-400 font-mono truncate">{curpTruncada(r.curp)}</p>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">
                      {r.municipio_nombre || 'Sin municipio'} · {r.total_ups ?? 0} UP{(r.total_ups ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
