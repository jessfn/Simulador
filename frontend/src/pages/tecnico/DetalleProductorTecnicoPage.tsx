import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Sprout, MapPin, Phone, CalendarPlus } from 'lucide-react';
import { api } from '../../services/api';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';

export default function DetalleProductorTecnicoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [productor, setProductor] = useState<any | null>(null);
  const [ups, setUps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.tecnico.misRegistros().catch(() => ({ registros: [] })),
      api.tecnico.productorUPs(id).catch(() => ({ ups: [] })),
    ])
      .then(([registrosRes, upsRes]: any[]) => {
        const registros = registrosRes?.registros || [];
        const encontrado = registros.find((r: any) => String(r.producer_id) === String(id));
        setProductor(encontrado || null);
        setUps(upsRes?.ups || []);
      })
      .catch(() => setError('No se pudo cargar la información del productor.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-[3px] border-[#1A5C38]/20 border-t-[#1A5C38] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico
        title={productor ? `${productor.nombres} ${productor.apellido_paterno}` : 'Productor'}
        subtitle="Detalle del registro"
        back="/tecnico"
      />

      <div className="p-4 space-y-4">
        {error && <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-600 text-[13px]">{error}</div>}

        {productor && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-[13px] text-slate-600">
              <span className="font-mono font-semibold text-slate-800">{productor.curp}</span>
            </div>
            {productor.telefono && (
              <div className="flex items-center gap-2 text-[13px] text-slate-600">
                <Phone size={14} className="text-slate-400" /> {productor.telefono}
              </div>
            )}
            {productor.municipio_nombre && (
              <div className="flex items-center gap-2 text-[13px] text-slate-600">
                <MapPin size={14} className="text-slate-400" /> {productor.municipio_nombre}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-[13px] font-black text-slate-800">Parcelas (UPs)</h3>
            <button onClick={() => navigate(`/tecnico/productor/${id}/up/nueva`)}
              className="flex items-center gap-1 text-[12.5px] font-bold text-[#1A5C38]">
              <Plus size={14} /> Agregar UP
            </button>
          </div>

          {ups.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
              <Sprout size={26} className="text-slate-300 mx-auto mb-2" />
              <p className="text-[13px] text-slate-500 font-medium">Este productor no tiene parcelas registradas.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {ups.map((up: any) => (
                <div key={up.up_id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-slate-800 truncate">{up.up_name || up.nombre_up || 'Parcela'}</p>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      {[up.municipio_up, up.estado_up].filter(Boolean).join(', ')}
                      {up.area_ha_calc ? ` · ${Number(up.area_ha_calc).toFixed(2)} ha` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/tecnico/productor/${id}/ciclo`, { state: { up_id: up.up_id } })}
                    className="flex-shrink-0 flex items-center gap-1.5 bg-[#1A5C38]/10 text-[#1A5C38] px-3 py-2 rounded-xl text-[12.5px] font-bold active:scale-95 transition-all">
                    <CalendarPlus size={14} /> Ciclo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
