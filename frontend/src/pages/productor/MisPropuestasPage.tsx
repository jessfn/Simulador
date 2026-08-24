import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Wheat, Check, X } from 'lucide-react';
import { api } from '../../services/api';
import { formatNum } from '../../utils/format';
import { useToast } from '../../components/Toast';

interface Propuesta {
  id: number;
  precio_solicitado_ton: number;
  precio_referencia_ton: number | null;
  volumen_ton: number;
  vigencia_hasta: string;
  estatus: 'abierta' | 'cerrada' | 'vencida' | 'cancelada';
  tipo_maiz: string;
  variedad_code?: string;
  ofertas_count: number;
  created_at: string;
}

interface Oferta {
  id: number;
  bodega_id: number;
  bodega_nombre: string;
  bodega_municipio: string;
  bodega_estado: string;
  precio_ofrecido_ton: number;
  costo_acondicionamiento_ton: number;
  modalidad_transporte: string | null;
  costo_transporte_ton: number;
  pago_final_estimado_ton: number;
  momento_pago: string | null;
  estatus: string;
}

const ETIQUETA_ESTATUS: Record<string, { label: string; cls: string }> = {
  abierta: { label: 'Abierta', cls: 'bg-emerald-100 text-emerald-700' },
  cerrada: { label: 'Cerrada', cls: 'bg-zinc-200 text-zinc-600' },
  vencida: { label: 'Vencida', cls: 'bg-amber-100 text-amber-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
};

export default function MisPropuestasPage() {
  const navigate = useNavigate();
  const { toast, confirm } = useToast();
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [expandidaId, setExpandidaId] = useState<number | null>(null);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [cargandoOfertas, setCargandoOfertas] = useState(false);
  const [procesando, setProcesando] = useState<number | null>(null);

  const cargar = () => {
    api.propuestas.mias()
      .then((r: any) => setPropuestas(Array.isArray(r) ? r : []))
      .catch(() => setPropuestas([]))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const toggleExpandir = async (p: Propuesta) => {
    if (expandidaId === p.id) { setExpandidaId(null); setOfertas([]); return; }
    setExpandidaId(p.id);
    setCargandoOfertas(true);
    try {
      const r: any = await api.propuestas.ofertas(p.id);
      setOfertas(Array.isArray(r) ? r : []);
    } catch {
      setOfertas([]);
    } finally {
      setCargandoOfertas(false);
    }
  };

  const aceptar = async (propuestaId: number, ofertaId: number, pago: number) => {
    const ok = await confirm(`¿Aceptar esta oferta de $${formatNum(pago)}/ton? Se generará la transacción y las demás ofertas quedarán rechazadas.`);
    if (!ok) return;
    setProcesando(ofertaId);
    try {
      await api.propuestas.aceptar(propuestaId, ofertaId);
      toast('¡Oferta aceptada! Se generó la transacción.', 'success');
      setExpandidaId(null);
      setOfertas([]);
      cargar();
    } catch (err: any) {
      toast(err.message || 'Error al aceptar la oferta', 'error');
    } finally {
      setProcesando(null);
    }
  };

  const cancelar = async (id: number) => {
    const ok = await confirm('¿Cancelar esta propuesta? Las bodegas ya no podrán ofertar.');
    if (!ok) return;
    try {
      await api.propuestas.cancel(id);
      toast('Propuesta cancelada.', 'success');
      cargar();
    } catch (err: any) {
      toast(err.message || 'Error al cancelar', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-white pb-8">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-[#eef8f2]">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-gray-900">Mis propuestas</h1>
          <p className="text-xs text-gray-500">Compara ofertas de bodegas y acepta la mejor</p>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-3">
        {cargando && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        )}

        {!cargando && propuestas.length === 0 && (
          <div className="text-center py-16">
            <Wheat size={48} className="text-[#1A5C38]/40 mx-auto mb-4" />
            <p className="font-semibold text-gray-800">Aún no tienes propuestas publicadas</p>
            <p className="text-gray-500 text-sm max-w-xs mx-auto mt-1">
              Cuando publiques tu maíz como "negociación abierta a bodegas" aparecerá aquí.
            </p>
          </div>
        )}

        {propuestas.map(p => {
          const et = ETIQUETA_ESTATUS[p.estatus] || ETIQUETA_ESTATUS.abierta;
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button onClick={() => p.estatus === 'abierta' && toggleExpandir(p)}
                className="w-full text-left p-4 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-800 capitalize">{p.tipo_maiz}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${et.cls}`}>{et.label}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {p.volumen_ton} ton · pides ${formatNum(p.precio_solicitado_ton)}/ton
                  </p>
                  {p.precio_referencia_ton != null && (
                    <p className="text-xs text-gray-400 mt-0.5">Referencia de mercado: ${formatNum(p.precio_referencia_ton)}/ton</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Vigente hasta {new Date(p.vigencia_hasta).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                {p.estatus === 'abierta' && (
                  <div className="text-right shrink-0">
                    <span className="inline-block bg-[#1A5C38] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                      {p.ofertas_count} oferta{p.ofertas_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </button>

              {p.estatus === 'abierta' && expandidaId === p.id && (
                <div className="border-t border-gray-100 p-4 bg-[#eef8f2] space-y-3">
                  {cargandoOfertas && (
                    <div className="flex justify-center py-4">
                      <div className="w-6 h-6 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
                    </div>
                  )}
                  {!cargandoOfertas && ofertas.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">Aún no hay ofertas de bodegas.</p>
                  )}
                  {!cargandoOfertas && ofertas.filter(o => o.estatus === 'pendiente').map(o => (
                    <div key={o.id} className="bg-white rounded-xl p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{o.bodega_nombre}</p>
                          <p className="text-xs text-gray-500">{o.bodega_municipio}, {o.bodega_estado}</p>
                        </div>
                        <p className="text-lg font-bold text-[#1A5C38]">${formatNum(o.pago_final_estimado_ton)}<span className="text-xs font-normal text-gray-400">/ton</span></p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
                        <div>Precio ofrecido: <span className="font-medium text-gray-700">${formatNum(o.precio_ofrecido_ton)}</span></div>
                        <div>Acondicionamiento: <span className="font-medium text-gray-700">${formatNum(o.costo_acondicionamiento_ton)}</span></div>
                        <div>Transporte: <span className="font-medium text-gray-700">{o.modalidad_transporte === 'bodega_recoge' ? 'La bodega recoge' : o.modalidad_transporte === 'productor_entrega' ? `Tú entregas ($${formatNum(o.costo_transporte_ton)})` : '—'}</span></div>
                        <div>Pago: <span className="font-medium text-gray-700">{o.momento_pago || '—'}</span></div>
                      </div>
                      <button onClick={() => aceptar(p.id, o.id, o.pago_final_estimado_ton)}
                        disabled={procesando === o.id}
                        className="w-full mt-2 bg-[#1A5C38] hover:bg-[#15482d] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                        <Check size={16} /> {procesando === o.id ? 'Aceptando...' : 'Aceptar esta oferta'}
                      </button>
                    </div>
                  ))}
                  <button onClick={() => cancelar(p.id)}
                    className="w-full text-red-500 text-xs font-medium py-2 flex items-center justify-center gap-1">
                    <X size={14} /> Cancelar propuesta
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
