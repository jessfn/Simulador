import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { PageBanner } from '../components/Layout';
import { Building2 } from 'lucide-react';
import { api } from '../services/api';

export default function B17MisVentanillas() {
  const [ventanillas, setVentanillas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.ventanillas.list()
      .then((r: any) => setVentanillas(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tipoLabel: Record<string, string> = {
    coberturas: 'Coberturas',
    incentivos: 'Incentivos',
    ambos: 'Coberturas e Incentivos',
  };

  const tipoBadge: Record<string, string> = {
    coberturas: 'bg-blue-100 text-blue-700',
    incentivos: 'bg-purple-100 text-purple-700',
    ambos: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className="w-full">
      <PageBanner title="Mis Ventanillas" subtitle="Apoyos para productores" back="/maiz/bodega/mas" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ventanillas.map(v => (
            <button
              key={v.id}
              onClick={() => navigate(`/maiz/bodega/ventanillas/${v.id}/solicitudes`)}
              className="w-full bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 text-left active:scale-[0.98] transition-all duration-500 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:border-black/[0.08] group/card"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[1.25rem] bg-[#1A5C38]/[0.08] flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover/card:scale-110 group-hover/card:-rotate-3">
                  <Building2 size={20} className="text-[#1A5C38]" />
                </div>
                <div className="flex-1 min-w-0 transition-transform duration-500 group-hover/card:translate-x-1">
                  <p className="font-bold text-[15px] text-gray-900 group-hover/card:text-[#1A5C38] transition-colors leading-snug">{v.bodega_nombre}</p>
                  {v.nombre_ventanilla && (
                    <p className="text-[13px] text-gray-500 font-medium leading-snug mt-0.5">{v.nombre_ventanilla}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tipoBadge[v.tipo] || 'bg-[#eef8f2] text-gray-500'}`}>
                      {tipoLabel[v.tipo] || v.tipo}
                    </span>
                    {v.solicitudes_pendientes > 0 && (
                      <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 font-bold px-2 py-0.5 rounded-full">
                        {v.solicitudes_pendientes} pendientes
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 flex-shrink-0 transition-transform duration-300 group-hover/card:translate-x-1 group-hover/card:text-[#1A5C38]" />
              </div>
            </button>
          ))}
        </div>

        {!loading && ventanillas.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 rounded-[1.5rem] bg-[#f4fbf7] border border-gray-100 flex items-center justify-center">
              <Building2 size={32} className="text-gray-300" />
            </div>
            <p className="font-bold text-[16px] text-gray-700">Sin ventanillas configuradas</p>
            <p className="text-[14px] text-gray-400 font-medium">Configura una para publicar apoyos</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/maiz/bodega/ventanillas/nueva')}
        className="fixed bottom-24 right-5 sm:right-8 lg:right-12 xl:right-20 w-14 h-14 bg-[#1A5C38] text-white rounded-[1.25rem] shadow-[0_4px_12px_rgba(26,92,56,0.3)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.4)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 z-10"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
