import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { Plus, Truck, Scale, Wind, Sun, Package, Shield, Tag, AlertTriangle } from 'lucide-react';
import { PageBanner } from '../components/Layout';
import { api } from '../services/api';
import { formatNum } from '../utils/format';

export default function B15Tarifario() {
  const { toast } = useToast();
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [bodegaId, setBodegaId] = useState('');
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [tarifas, setTarifas] = useState<any[]>([]);
  const [editando, setEditando] = useState<number | null>(null);
  const [precio, setPrecio] = useState('');
  const [saving, setSaving] = useState(false);
  const [diasSinActualizar, setDiasSinActualizar] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.bodeguero.misBodegas().then((r: any) => setBodegas(r)).catch(() => {});
    api.conceptos.list().then((r: any) => setConceptos(r)).catch(() => {});
  }, []);

  useEffect(() => {
    if (bodegaId) {
      api.tarifario.get(Number(bodegaId)).then((r: any) => {
        setTarifas(r);
        // Calcular días desde la última actualización
        if (r && r.length > 0) {
          // Asumimos que r[0] o el array de tarifas puede usarse para ver updated_at
          const ultima_actualizacion = r[0]?.updated_at || r[0]?.ultima_actualizacion;
          if (ultima_actualizacion) {
            const ultima = new Date(ultima_actualizacion);
            const hoy = new Date();
            const dias = Math.floor(
              (hoy.getTime() - ultima.getTime()) / (1000 * 60 * 60 * 24)
            );
            setDiasSinActualizar(dias);
          } else {
            setDiasSinActualizar(null);
          }
        } else {
          setDiasSinActualizar(null);
        }
      }).catch(() => {});
    }
  }, [bodegaId]);

  const iconMap: Record<string, React.ReactNode> = {
    truck: <Truck size={18} />, scale: <Scale size={18} />, wind: <Wind size={18} />,
    sun: <Sun size={18} />, box: <Package size={18} />, shield: <Shield size={18} />, package: <Package size={18} />,
  };

  function getTarifa(conceptoId: number) {
    return tarifas.find(t => t.concepto_id === conceptoId);
  }

  async function guardar(conceptoId: number) {
    if (!precio || !bodegaId) return;
    setSaving(true);
    try {
      const existente = getTarifa(conceptoId);
      if (existente) {
        await api.tarifario.update(Number(bodegaId), existente.id, { precio });
      } else {
        await api.tarifario.create(Number(bodegaId), { concepto_id: conceptoId, precio });
      }
      const r: any = await api.tarifario.get(Number(bodegaId));
      setTarifas(r);
      setEditando(null);
      setPrecio('');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  return (
    <div className="w-full">
      <PageBanner title="Tarifario de Servicios" subtitle="Precios que ofreces en tu bodega" back="/maiz/bodega/mas" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Selector de bodega */}
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6">
          <label className="block text-[15px] font-bold text-gray-400 uppercase tracking-widest mb-3">Bodega</label>
          <select
            value={bodegaId}
            onChange={e => setBodegaId(e.target.value)}
            className="w-full bg-[#eef8f2] rounded-[1.25rem] px-5 py-4 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0 transition-all"
          >
            <option value="">Selecciona bodega</option>
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>

        {diasSinActualizar !== null && diasSinActualizar >= 30 && (
          <div className="bg-amber-50 border-l-[6px] border-amber-400 p-6 mb-6 rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-4">
              <AlertTriangle size={24} className="text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-[16px] text-amber-800">
                  Tarifario desactualizado — {diasSinActualizar} días sin cambios
                </p>
                <p className="text-amber-700 text-[14px] font-medium mt-1">
                  Las bodegas con tarifario desactualizado no se incluyen en el 
                  cálculo del Precio Sistema regional. Actualiza tus precios 
                  de servicios para seguir siendo visible.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de conceptos */}
        {bodegaId && (
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] divide-y divide-gray-100 overflow-hidden">
            {conceptos.map(c => {
              const tarifa = getTarifa(c.id);
              const isEdit = editando === c.id;
              return (
                <div key={c.id} className="p-5 hover:bg-[#f4fbf7]/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="w-12 h-12 rounded-[1.25rem] bg-[#1A5C38]/[0.08] text-[#1A5C38] flex items-center justify-center flex-shrink-0">{iconMap[c.icono] || <Tag size={20} />}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[16px] text-gray-900">{c.nombre}</p>
                      <p className="text-[13px] text-gray-500 font-medium">{c.unidad_default}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {tarifa ? (
                        <p className="font-black text-[18px] text-[#1A5C38]">${formatNum(tarifa.precio)}</p>
                      ) : (
                        <p className="text-[14px] font-medium text-gray-400">Sin precio</p>
                      )}
                      <button
                        onClick={() => { setEditando(isEdit ? null : c.id); setPrecio(tarifa?.precio || ''); }}
                        className="text-[13px] text-[#1A5C38] font-bold mt-1 hover:text-[#154a2d] transition-colors"
                      >
                        {isEdit ? 'Cancelar' : tarifa ? 'Editar' : 'Agregar'}
                      </button>
                    </div>
                  </div>
                  {isEdit && (
                    <div className="flex gap-3 mt-4">
                      <input
                        type="number"
                        value={precio}
                        onChange={e => setPrecio(e.target.value)}
                        placeholder={`Precio en ${c.unidad_default}`}
                        className="flex-1 bg-[#eef8f2] rounded-[1rem] px-5 py-3.5 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0 transition-all"
                      />
                      <button
                        onClick={() => guardar(c.id)}
                        disabled={saving}
                        className="bg-[#1A5C38] hover:bg-[#154a2d] text-white px-6 py-3.5 rounded-[1rem] text-[15px] font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-md"
                      >
                        {saving ? '…' : 'Guardar'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => navigate('/maiz/bodega/tarifario/proponer')}
          className="w-full text-[15px] text-[#1A5C38] font-bold border-2 border-dashed border-[#1A5C38]/40 rounded-[1.5rem] py-5 hover:bg-[#1A5C38]/[0.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} strokeWidth={2.5} />
          Proponer nuevo servicio
        </button>
        </div>
      </div>
    </div>
  );
}
