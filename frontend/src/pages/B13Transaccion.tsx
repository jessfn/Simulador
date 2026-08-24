import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserCheck, PenLine } from 'lucide-react';
import { PageBanner } from '../components/Layout';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const TIPOS_MAIZ = [
  { code: 'blanco', label: 'Maíz Blanco' },
  { code: 'amarillo', label: 'Maíz Amarillo' },
  { code: 'criollo', label: 'Criollo / Local' },
];

interface ProducerSuggestion {
  producer_id: number;
  nombre_completo: string;
  municipio: string;
  curp_parcial: string;
}

export default function B13Transaccion() {
  const navigate = useNavigate();
  const { toast, confirm } = useToast();
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [variedades, setVariedades] = useState<{code: string; label: string; tipo_maiz?: string}[]>([]);
  const [form, setForm] = useState({
    bodega_id: '', producer_id: '', nombre_productor_libre: '', tipo_maiz: '', variedad_code: '',
    volumen_ton: '', precio_ton: '',
    fecha: new Date().toISOString().slice(0, 10), notas: '',
    humedad_pct: '', impurezas_pct: '', grano_quebrado_pct: '',
  });
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState<ProducerSuggestion[]>([]);
  const [producerSeleccionado, setProducerSeleccionado] = useState<ProducerSuggestion | null>(null);
  const [modoLibre, setModoLibre] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.bodeguero.misBodegas().then((r: any) => setBodegas(r)).catch(() => {});
    fetch(`${BASE}/infraestructura/catalogos`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('simac_token')}` }
    }).then(r => r.json()).then(r => setVariedades(r.variedades || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (modoLibre || busqueda.length < 3) { setSugerencias([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const qs = `q=${encodeURIComponent(busqueda)}${form.bodega_id ? `&bodega_id=${form.bodega_id}` : ''}`;
        const r = await fetch(`${BASE}/productores/buscar?${qs}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('simac_token')}` }
        });
        const data = await r.json();
        setSugerencias(Array.isArray(data) ? data : []);
      } catch (_) { setSugerencias([]); }
    }, 320);
  }, [busqueda, form.bodega_id, modoLibre]);

  function seleccionarProducer(p: ProducerSuggestion) {
    setProducerSeleccionado(p);
    setBusqueda(p.nombre_completo);
    setSugerencias([]);
    setForm(f => ({ ...f, producer_id: String(p.producer_id), nombre_productor_libre: p.nombre_completo }));
  }

  function activarModoLibre() {
    setModoLibre(true);
    setSugerencias([]);
    setProducerSeleccionado(null);
    setForm(f => ({ ...f, producer_id: '' }));
    setBusqueda('');
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filteredVars = variedades.filter(v => v.tipo_maiz === form.tipo_maiz);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const productor = form.nombre_productor_libre || (producerSeleccionado?.nombre_completo ?? 'productor libre');
    const ok = await confirm(
      `¿Registrar compra de ${form.volumen_ton || '?'} ton a $${form.precio_ton || '?'}/ton\npara ${productor}?`
    );
    if (!ok) return;
    const payload = {
      ...form,
      producer_id: form.producer_id ? Number(form.producer_id) : undefined,
    };
    setLoading(true);
    try {
      await api.transacciones.create(payload);
      toast('Transacción registrada. El productor recibirá notificación si está en el sistema.', 'success');
      navigate('/transacciones', { replace: true });
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  }

  const inputClass = 'w-full bg-[#eef8f2] rounded-xl px-4 py-3.5 text-[17px] outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0';
  const labelClass = 'block text-[15px] font-medium text-gray-600 mb-1.5';

  return (
    <div className="w-full">
      <PageBanner title="Registrar Transacción" subtitle="Nueva compra de maíz" back="/transacciones" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
          {/* Bodega y productor */}
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Bodega y productor</p>
          <div>
            <label className={labelClass}>Bodega donde ocurrió la compra</label>
            <select value={form.bodega_id} onChange={e => set('bodega_id', e.target.value)} required className={inputClass}>
              <option value="">Selecciona bodega</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div className="relative">
            <label className={labelClass}>Productor</label>
            {!modoLibre ? (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setProducerSeleccionado(null); setForm(f => ({...f, producer_id: '', nombre_productor_libre: e.target.value})); }}
                    placeholder="Busca por nombre o CURP (mín. 3 caracteres)"
                    className={`${inputClass} pl-10`}
                  />
                  {producerSeleccionado && (
                    <UserCheck size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#1A5C38]" />
                  )}
                </div>
                {sugerencias.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-black/[0.06] overflow-hidden">
                    {sugerencias.map(p => (
                      <button type="button" key={p.producer_id}
                        onClick={() => seleccionarProducer(p)}
                        className="w-full text-left px-4 py-3 hover:bg-[#eef8f2] active:bg-[#eef8f2] border-b border-gray-50 last:border-0">
                        <p className="text-[14px] font-semibold text-gray-900">{p.nombre_completo}</p>
                        <p className="text-[12px] text-gray-400">{p.municipio} · CURP: …{p.curp_parcial}</p>
                      </button>
                    ))}
                    <button type="button"
                      onClick={activarModoLibre}
                      className="w-full text-left px-4 py-3 text-[#1A5C38] text-[13px] font-semibold flex items-center gap-2 hover:bg-[#eef8f2]">
                      <PenLine size={14} /> + Registrar nombre manualmente
                    </button>
                  </div>
                )}
                {busqueda.length >= 3 && sugerencias.length === 0 && !producerSeleccionado && (
                  <button type="button" onClick={activarModoLibre}
                    className="mt-1.5 text-[13px] text-[#1A5C38] font-semibold flex items-center gap-1.5">
                    <PenLine size={13} /> + Registrar nombre manualmente
                  </button>
                )}
              </>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={form.nombre_productor_libre}
                  onChange={e => set('nombre_productor_libre', e.target.value)}
                  placeholder="Escribe el nombre del productor"
                  autoFocus
                  className={inputClass}
                />
                <button type="button" onClick={() => { setModoLibre(false); setBusqueda(''); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 hover:text-gray-600">
                  Buscar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tipo de maíz */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Tipo de maíz</p>
          <div>
            <label className={labelClass}>Tipo de maíz</label>
            <select value={form.tipo_maiz} onChange={e => { set('tipo_maiz', e.target.value); set('variedad_code', ''); }} required className={inputClass}>
              <option value="">Selecciona tipo</option>
              {TIPOS_MAIZ.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          {form.tipo_maiz && (
            <div>
              <label className={labelClass}>Variedad <span className="text-gray-400 font-normal">(opcional)</span></label>
              <select value={form.variedad_code} onChange={e => set('variedad_code', e.target.value)} className={inputClass}>
                <option value="">Sin especificar / No sabe</option>
                {filteredVars.map(v => <option key={v.code} value={v.code}>{v.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Volumen, precio y fecha */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Volumen, precio y fecha</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Volumen (ton)</label>
              <input type="number" value={form.volumen_ton} onChange={e => set('volumen_ton', e.target.value)} required step="0.1" placeholder="50" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Precio pagado (MXN/ton)</label>
              <input type="number" value={form.precio_ton} onChange={e => set('precio_ton', e.target.value)} required step="1" placeholder="6200" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Fecha de compra</label>
            <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required
              max={new Date().toISOString().slice(0, 10)} className={`${inputClass} min-w-0`} style={{ WebkitAppearance: 'none', appearance: 'none' }} />
          </div>
          <div>
            <label className={labelClass}>Notas</label>
            <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2}
              className={`${inputClass} resize-none`} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest mb-3">Calidad (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Humedad (%)</label>
                <input type="number" value={form.humedad_pct} onChange={e => set('humedad_pct', e.target.value)} step="0.1" placeholder="14.5" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Impurezas (%)</label>
                <input type="number" value={form.impurezas_pct} onChange={e => set('impurezas_pct', e.target.value)} step="0.1" placeholder="2" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Grano quebrado (%)</label>
                <input type="number" value={form.grano_quebrado_pct} onChange={e => set('grano_quebrado_pct', e.target.value)} step="0.1" placeholder="3" className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[17px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] disabled:opacity-40 disabled:active:scale-100 disabled:hover:shadow-none">
          {loading ? 'Registrando…' : 'Registrar transacción'}
        </button>
      </form>
      </div>
    </div>
  );
}
