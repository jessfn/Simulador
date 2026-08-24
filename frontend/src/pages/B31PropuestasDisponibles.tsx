import { useEffect, useState } from 'react';
import { PageBanner } from '../components/Layout';
import { api } from '../services/api';
import { formatNum } from '../utils/format';
import { useToast } from '../components/Toast';
import { MapPin, Wheat, Send, Bell, X } from 'lucide-react';

const TIPOS_MAIZ = [
  { code: '', label: 'Todos' },
  { code: 'blanco', label: 'Maíz Blanco' },
  { code: 'amarillo', label: 'Maíz Amarillo' },
  { code: 'criollo', label: 'Criollo / Local' },
];

interface Propuesta {
  id: number;
  precio_solicitado_ton: number;
  precio_referencia_ton: number | null;
  volumen_ton: number;
  volumen_minimo_comprador: number | null;
  lugar_entrega: string | null;
  vigencia_hasta: string;
  tipo_maiz: string;
  variedad_code?: string;
  humedad_pct: number | null;
  impurezas_pct: number | null;
  grano_quebrado_pct: number | null;
  municipio: string;
  estado: string;
  distancia_km: number | null;
  ya_oferte: boolean;
}

interface FiltroGuardado {
  id: number;
  bodega_id: number;
  bodega_nombre: string;
  tipo_maiz: string | null;
  radio_km: number;
  activo: boolean;
}

export default function B31PropuestasDisponibles() {
  const { toast } = useToast();
  const [bodegas, setBodegas] = useState<{ id: number; nombre: string }[]>([]);
  const [bodegaId, setBodegaId] = useState('');
  const [tipoMaiz, setTipoMaiz] = useState('');
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [loading, setLoading] = useState(true);
  const [abiertaId, setAbiertaId] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [filtros, setFiltros] = useState<FiltroGuardado[]>([]);
  const [guardandoFiltro, setGuardandoFiltro] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [form, setForm] = useState({
    precio_ofrecido_ton: '',
    costo_acondicionamiento_ton: '',
    modalidad_transporte: 'bodega_recoge',
    costo_transporte_ton: '',
    momento_pago: 'contado',
  });

  useEffect(() => {
    api.bodeguero.misBodegas().then((r: any) => {
      const lista = Array.isArray(r) ? r : [];
      setBodegas(lista);
      if (lista.length > 0) setBodegaId(String(lista[0].id));
    }).catch(() => {});
    cargarFiltros();
  }, []);

  const cargarFiltros = () => {
    api.filtrosGuardados.list()
      .then((r: any) => setFiltros(Array.isArray(r) ? r : []))
      .catch(() => setFiltros([]));
  };

  const guardarFiltro = async () => {
    if (!bodegaId) { toast('Selecciona una bodega', 'error'); return; }
    setGuardandoFiltro(true);
    try {
      await api.filtrosGuardados.create({
        bodega_id: Number(bodegaId),
        tipo_maiz: tipoMaiz || null,
        radio_km: 100,
      });
      toast('Alerta guardada. Te avisaremos cuando publiquen maíz que calce.', 'success');
      cargarFiltros();
    } catch (err: any) {
      toast(err.message || 'Error al guardar la alerta', 'error');
    } finally {
      setGuardandoFiltro(false);
    }
  };

  const eliminarFiltro = async (id: number) => {
    try {
      await api.filtrosGuardados.remove(id);
      cargarFiltros();
    } catch (err: any) {
      toast(err.message || 'Error al eliminar', 'error');
    }
  };

  const cargar = () => {
    setLoading(true);
    api.propuestas.disponibles({
      bodega_id: bodegaId ? Number(bodegaId) : undefined,
      tipo_maiz: tipoMaiz || undefined,
    })
      .then((r: any) => setPropuestas(Array.isArray(r) ? r : []))
      .catch(() => setPropuestas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (bodegaId) cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [bodegaId, tipoMaiz]);

  const abrirForm = (p: Propuesta) => {
    if (abiertaId === p.id) { setAbiertaId(null); return; }
    setAbiertaId(p.id);
    setForm({
      precio_ofrecido_ton: String(p.precio_solicitado_ton),
      costo_acondicionamiento_ton: '',
      modalidad_transporte: 'bodega_recoge',
      costo_transporte_ton: '',
      momento_pago: 'contado',
    });
  };

  const enviarOferta = async (p: Propuesta) => {
    if (!bodegaId) { toast('Selecciona una bodega', 'error'); return; }
    if (!form.precio_ofrecido_ton || Number(form.precio_ofrecido_ton) < p.precio_solicitado_ton) {
      toast(`El precio ofrecido no puede ser menor a $${formatNum(p.precio_solicitado_ton)}/ton`, 'error');
      return;
    }
    setEnviando(true);
    try {
      await api.propuestas.ofertar(p.id, {
        bodega_id: Number(bodegaId),
        precio_ofrecido_ton: Number(form.precio_ofrecido_ton),
        costo_acondicionamiento_ton: form.costo_acondicionamiento_ton ? Number(form.costo_acondicionamiento_ton) : 0,
        modalidad_transporte: form.modalidad_transporte,
        costo_transporte_ton: form.costo_transporte_ton ? Number(form.costo_transporte_ton) : 0,
        momento_pago: form.momento_pago,
      });
      toast('Oferta enviada. El productor la verá junto a las demás.', 'success');
      setAbiertaId(null);
      cargar();
    } catch (err: any) {
      toast(err.message || 'Error al enviar la oferta', 'error');
    } finally {
      setEnviando(false);
    }
  };

  const inputClass = 'w-full bg-white rounded-xl px-3 py-2.5 text-sm outline-none ring-1 ring-zinc-200 focus:ring-2 focus:ring-[#1A5C38]/40 border-0';

  return (
    <div className="w-full">
      <PageBanner title="Propuestas disponibles" subtitle="Maíz que productores publicaron para negociar" back="/oferta" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1.5">Tu bodega</label>
              <select value={bodegaId} onChange={e => setBodegaId(e.target.value)}
                className={inputClass}>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1.5">Tipo de maíz</label>
              <select value={tipoMaiz} onChange={e => setTipoMaiz(e.target.value)} className={inputClass}>
                {TIPOS_MAIZ.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-1">
              <button onClick={guardarFiltro} disabled={guardandoFiltro}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold ring-1 ring-zinc-200 text-gray-700 hover:bg-[#eef8f2] flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Bell size={15} /> {guardandoFiltro ? 'Guardando...' : 'Avisarme con estos filtros'}
              </button>
              {filtros.length > 0 && (
                <button onClick={() => setMostrarFiltros(v => !v)}
                  className="py-2.5 px-3 rounded-xl text-sm font-medium text-[#1A5C38] hover:bg-emerald-50">
                  {mostrarFiltros ? 'Ocultar' : `Mis alertas (${filtros.length})`}
                </button>
              )}
            </div>
          </div>

          {mostrarFiltros && filtros.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
              {filtros.map(f => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-sm py-1.5">
                  <span className="text-gray-700">
                    {f.bodega_nombre} · {f.tipo_maiz ? TIPOS_MAIZ.find(t => t.code === f.tipo_maiz)?.label || f.tipo_maiz : 'Cualquier tipo'} · {f.radio_km} km
                  </span>
                  <button onClick={() => eliminarFiltro(f.id)} className="text-red-400 hover:text-red-600 shrink-0">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
            </div>
          )}

          {!loading && propuestas.length === 0 && (
            <div className="text-center py-16">
              <Wheat size={40} className="text-[#1A5C38]/40 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No hay propuestas abiertas con estos filtros por ahora.</p>
            </div>
          )}

          {!loading && propuestas.map(p => (
            <div key={p.id} className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 capitalize">{p.tipo_maiz}{p.variedad_code ? ` · ${p.variedad_code}` : ''}</p>
                    <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                      <MapPin size={13} /> {p.municipio}, {p.estado}
                      {p.distancia_km != null && ` · ${formatNum(p.distancia_km, 0)} km`}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {p.volumen_ton} ton · vigente hasta {new Date(p.vigencia_hasta + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </p>
                    {(p.humedad_pct != null || p.impurezas_pct != null || p.grano_quebrado_pct != null) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Calidad: {p.humedad_pct != null ? `humedad ${p.humedad_pct}%` : ''}{p.impurezas_pct != null ? ` · impurezas ${p.impurezas_pct}%` : ''}{p.grano_quebrado_pct != null ? ` · quebrado ${p.grano_quebrado_pct}%` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-[#1A5C38]">${formatNum(p.precio_solicitado_ton)}</p>
                    <p className="text-[11px] text-gray-400">MXN/ton pide</p>
                  </div>
                </div>

                {p.ya_oferte ? (
                  <p className="mt-3 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 text-center">
                    Ya enviaste una oferta a esta propuesta
                  </p>
                ) : (
                  <button onClick={() => abrirForm(p)}
                    className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold ring-2 ring-[#1A5C38] text-[#1A5C38] hover:bg-emerald-50 transition-colors">
                    {abiertaId === p.id ? 'Cerrar' : 'Ofertar'}
                  </button>
                )}
              </div>

              {abiertaId === p.id && !p.ya_oferte && (
                <div className="border-t border-gray-100 bg-[#eef8f2] p-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Precio ofrecido (MXN/ton)</label>
                      <input type="number" value={form.precio_ofrecido_ton}
                        onChange={e => setForm(f => ({ ...f, precio_ofrecido_ton: e.target.value }))}
                        min={p.precio_solicitado_ton} step="1" className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Acondicionamiento (MXN/ton)</label>
                      <input type="number" value={form.costo_acondicionamiento_ton}
                        onChange={e => setForm(f => ({ ...f, costo_acondicionamiento_ton: e.target.value }))}
                        step="1" placeholder="0" className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Transporte</label>
                      <select value={form.modalidad_transporte}
                        onChange={e => setForm(f => ({ ...f, modalidad_transporte: e.target.value }))}
                        className={inputClass}>
                        <option value="bodega_recoge">La bodega recoge</option>
                        <option value="productor_entrega">El productor entrega</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Momento de pago</label>
                      <select value={form.momento_pago}
                        onChange={e => setForm(f => ({ ...f, momento_pago: e.target.value }))}
                        className={inputClass}>
                        <option value="contado">Contado</option>
                        <option value="15_dias">15 días</option>
                        <option value="30_dias">30 días</option>
                      </select>
                    </div>
                  </div>
                  {form.modalidad_transporte === 'productor_entrega' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Costo de transporte que se descuenta (MXN/ton)</label>
                      <input type="number" value={form.costo_transporte_ton}
                        onChange={e => setForm(f => ({ ...f, costo_transporte_ton: e.target.value }))}
                        step="1" placeholder="0" className={inputClass} />
                    </div>
                  )}
                  <button onClick={() => enviarOferta(p)} disabled={enviando}
                    className="w-full bg-[#1A5C38] hover:bg-[#15482d] text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                    <Send size={15} /> {enviando ? 'Enviando...' : 'Enviar oferta'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
