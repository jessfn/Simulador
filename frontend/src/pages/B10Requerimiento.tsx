import { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Trash2, Wheat, AlertTriangle } from 'lucide-react';
import { PageBanner } from '../components/Layout';
import { api } from '../services/api';
import { formatNum } from '../utils/format';

const TIPOS_MAIZ = [
  { code: 'blanco', label: 'Maíz Blanco' },
  { code: 'amarillo', label: 'Maíz Amarillo' },
  { code: 'criollo', label: 'Criollo / Local' },
];

const OPCIONES_RADIO = [50, 100, 200, 500, 1000, 2000];

const today = new Date().toISOString().slice(0, 10);

export default function B10Requerimiento() {
  const { toast, confirm } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const municipioPre = searchParams.get('municipio') || '';

  const [bodegas, setBodegas] = useState<{id: number; nombre: string; estado?: string}[]>([]);
  const [variedades, setVariedades] = useState<{code: string; label: string; tipo_maiz?: string}[]>([]);
  const [requerimientos, setRequerimientos] = useState<any[]>([]);
  const [form, setForm] = useState({
    bodega_id: '',
    tipo_maiz: '', variedad_code: '', volumen_ton: '', precio_ofrecido: '',
    vigencia_inicio: today,
    vigencia_fin: '',
    radio_km: '200',
    municipio: municipioPre,
    humedad_max_pct: '', impurezas_max_pct: '', grano_quebrado_max_pct: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Múltiples variedades por requerimiento (Feature C-3)
  const [variedadesSeleccionadas, setVarSeleccionadas] = useState<string[]>([]);
  const [variedadesLibres, setVarLibres] = useState<Record<string, string>>({});

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.bodeguero.misBodegas().then((r: any) => setBodegas(r)).catch(() => {});
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/infraestructura/catalogos`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('simac_token')}` }
    }).then(r => r.json()).then(r => {
      setVariedades(r.variedades || []);
    }).catch(() => {});
    cargarRequerimientos();
  }, []);

  // F-05: Poll every 30s for interesados count updates
  useEffect(() => {
    pollRef.current = setInterval(() => cargarRequerimientos(), 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function cargarRequerimientos() {
    try {
      const r: any = await api.senales.list();
      setRequerimientos(Array.isArray(r) ? r : []);
    } catch (_) {}
  }

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  const filteredVars = variedades.filter(v => v.tipo_maiz === form.tipo_maiz);
  const esOtraVar = (label?: string) => (label || '').toLowerCase().includes('otra');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vigencia_fin) { toast('Selecciona la fecha de fin', 'error'); return; }
    if (form.vigencia_fin < form.vigencia_inicio) { toast('La fecha de fin no puede ser anterior al inicio', 'error'); return; }
    setLoading(true);
    try {
      setError('');
      const variedadesPayload = variedadesSeleccionadas.map(code => ({
        code,
        libre: variedadesLibres[code] || null,
      }));
      await api.senales.create({
        ...form,
        // Compatibilidad: variedad_code única = primera seleccionada
        variedad_code: variedadesSeleccionadas[0] || '',
        variedades: variedadesPayload,
        vigencia: 'rango',
      });
      toast('Requerimiento publicado. Los productores en el radio serán notificados.', 'success');
      setForm(f => ({ ...f, tipo_maiz: '', variedad_code: '', volumen_ton: '', precio_ofrecido: '', vigencia_fin: '', humedad_max_pct: '', impurezas_max_pct: '', grano_quebrado_max_pct: '' }));
      setVarSeleccionadas([]); setVarLibres({});
      cargarRequerimientos();
    } catch (err: any) {
      if (err.message?.includes('5 requerimientos')) {
        setError('Ya tienes 5 requerimientos activos. Cancela uno antes de crear otro nuevo.');
      } else {
        toast(err.message, 'error');
      }
    } finally { setLoading(false); }
  }

  async function cancelar(id: number) {
    const ok = await confirm('¿Cancelar este requerimiento?');
    if (!ok) return;
    try {
      await api.senales.cancel(id);
      cargarRequerimientos();
    } catch (err: any) { toast(err.message, 'error'); }
  }

  const inputClass = 'w-full bg-[#eef8f2] rounded-xl px-4 py-3.5 text-[17px] outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0';
  const labelClass = 'block text-[15px] font-medium text-gray-600 mb-1.5';

  return (
    <div className="w-full">
      <PageBanner title="Requerimientos de Maíz" subtitle="Notifica a productores en tu área" back="/oferta" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-amber-800 font-medium flex items-center gap-1.5"><AlertTriangle size={15} /> {error}</p>
          </div>
        )}

        {/* Bodega y maíz */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Bodega y tipo de maíz</p>
          <div>
            <label className={labelClass}>Bodega</label>
            <select value={form.bodega_id} onChange={e => set('bodega_id', e.target.value)} required className={inputClass}>
              <option value="">Selecciona bodega</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tipo de maíz que busca</label>
            <select value={form.tipo_maiz} onChange={e => { set('tipo_maiz', e.target.value); set('variedad_code', ''); setVarSeleccionadas([]); setVarLibres({}); }} required className={inputClass}>
              <option value="">Selecciona tipo</option>
              {TIPOS_MAIZ.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          {form.tipo_maiz && (
            <div>
              <label className={labelClass}>Variedades que busca <span className="text-gray-400 font-normal">(opcional, varias)</span></label>
              <div className="space-y-2">
                {filteredVars.map(v => (
                  <label key={v.code}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-[#f4fbf7] transition-colors">
                    <input
                      type="checkbox"
                      checked={variedadesSeleccionadas.includes(v.code)}
                      onChange={e => {
                        if (e.target.checked) {
                          setVarSeleccionadas(prev => [...prev, v.code]);
                        } else {
                          setVarSeleccionadas(prev => prev.filter(c => c !== v.code));
                          if (esOtraVar(v.label)) {
                            setVarLibres(prev => { const n = { ...prev }; delete n[v.code]; return n; });
                          }
                        }
                      }}
                      className="w-5 h-5 accent-[#1A5C38]"
                    />
                    <span className="text-sm text-gray-800">{v.label}</span>
                  </label>
                ))}
              </div>

              {/* Campo "especificar" para cada "Otra" seleccionada */}
              {variedadesSeleccionadas
                .filter(code => esOtraVar(filteredVars.find(v => v.code === code)?.label))
                .map(code => (
                  <div key={`libre-${code}`} className="mt-2 ml-8">
                    <input
                      type="text"
                      value={variedadesLibres[code] || ''}
                      onChange={e => setVarLibres(prev => ({ ...prev, [code]: e.target.value }))}
                      placeholder="Especifica la variedad..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ))}

              {variedadesSeleccionadas.length > 0 && (
                <p className="text-xs text-[#1A5C38] mt-2">
                  {variedadesSeleccionadas.length} variedad{variedadesSeleccionadas.length > 1 ? 'es' : ''} seleccionada{variedadesSeleccionadas.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Volumen y precio */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Volumen y precio</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Volumen que busca (ton)</label>
              <input type="number" value={form.volumen_ton} onChange={e => set('volumen_ton', e.target.value)} step="0.1" placeholder="500" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Precio ofrecido (MXN/ton)</label>
              <input type="number" value={form.precio_ofrecido} onChange={e => set('precio_ofrecido', e.target.value)} required step="1" placeholder="6200" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Calidad aceptada (opcional) */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Calidad aceptada (opcional)</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Humedad máx (%)</label>
              <input type="number" value={form.humedad_max_pct} onChange={e => set('humedad_max_pct', e.target.value)} step="0.1" placeholder="14.5" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Impurezas máx (%)</label>
              <input type="number" value={form.impurezas_max_pct} onChange={e => set('impurezas_max_pct', e.target.value)} step="0.1" placeholder="2" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Grano quebrado máx (%)</label>
              <input type="number" value={form.grano_quebrado_max_pct} onChange={e => set('grano_quebrado_max_pct', e.target.value)} step="0.1" placeholder="3" className={inputClass} />
            </div>
          </div>
        </div>

        {/* Vigencia — date range picker (C-11) */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
          <div>
            <label className={labelClass}>¿Para cuándo necesitas el maíz?</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[12px] text-gray-400 mb-1">Fecha de inicio</p>
                <input type="date" value={form.vigencia_inicio} min={today}
                  onChange={e => set('vigencia_inicio', e.target.value)} required className={inputClass} />
              </div>
              <div>
                <p className="text-[12px] text-gray-400 mb-1">Fecha de fin</p>
                <input type="date" value={form.vigencia_fin} min={form.vigencia_inicio || today}
                  onChange={e => set('vigencia_fin', e.target.value)} required className={inputClass} />
              </div>
            </div>
            <p className="text-[12px] text-gray-400 mt-2">Indica el período en que necesitas recibir el maíz en tu bodega</p>
          </div>
        </div>

        {/* Radio de búsqueda */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-4">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Radio de búsqueda</p>
          <div className="grid grid-cols-3 gap-2">
            {OPCIONES_RADIO.map(km => (
              <button
                key={km}
                type="button"
                onClick={() => set('radio_km', String(km))}
                className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  Number(form.radio_km) === km
                    ? 'bg-[#1A5C38] text-white border-[#1A5C38]'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-[#f4fbf7]'
                }`}
              >
                {km >= 1000 ? `${(km / 1000).toLocaleString('es-MX')},000` : km} km
              </button>
            ))}
          </div>
          {Number(form.radio_km) >= 500 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle size={12} /> Con este radio se notificarán productores en una zona muy amplia
            </p>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[17px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] disabled:opacity-40 disabled:active:scale-100 disabled:hover:shadow-none">
          {loading ? 'Publicando…' : '+ Nuevo requerimiento de maíz'}
        </button>
      </form>

      {/* Requerimientos activos (C-10) */}
      <div className="max-w-4xl mx-auto pt-6 pb-10 border-t border-black/[0.06] mt-8">
        <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-4">Requerimientos activos</p>
        {requerimientos.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-3 text-gray-400 bg-white rounded-[1.5rem] border border-black/[0.04]">
            <Wheat size={40} className="text-gray-200" />
            <p className="text-[14px] text-center px-4 font-medium">No tienes requerimientos de maíz activos. Publica uno para que los productores cercanos lo vean.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] divide-y divide-gray-100 overflow-hidden">
            {requerimientos.map(s => (
              <div key={s.id} className="flex items-start gap-4 p-5 hover:bg-[#f4fbf7]/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-800">
                    {TIPOS_MAIZ.find(t => t.code === s.tipo_maiz)?.label || s.tipo_maiz}
                    {s.variedad_code ? ` · ${s.variedad_code}` : ''}
                    {' '}<span className="text-[#1A5C38]">${formatNum(s.precio_ofrecido)}/ton</span>
                  </p>
                  <p className="text-[12px] text-gray-400">{s.bodega_nombre}</p>
                  {(s.vigencia_inicio || s.vigencia_fin) && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {s.vigencia_inicio ? s.vigencia_inicio.slice(0, 10) : ''}{s.vigencia_fin ? ` → ${s.vigencia_fin.slice(0, 10)}` : ''}
                    </p>
                  )}
                  <button
                    onClick={() => (s.interesados_count ?? 0) > 0 && navigate(`/senales/${s.id}/interesados`)}
                    disabled={(s.interesados_count ?? 0) === 0}
                    className={`text-[11px] font-medium ${
                      (s.interesados_count ?? 0) > 0
                        ? 'text-[#1A5C38] underline'
                        : 'text-gray-400 cursor-default'
                    }`}
                  >
                    {s.interesados_count ?? 0} productor{(s.interesados_count ?? 0) !== 1 ? 'es' : ''} interesado{(s.interesados_count ?? 0) !== 1 ? 's' : ''}
                    {(s.interesados_count ?? 0) > 0 ? ' — Ver →' : ''}
                  </button>
                  {s.volumen_ton && <p className="text-[11px] text-gray-400">Busca: {s.volumen_ton} ton</p>}
                </div>
                <button onClick={() => cancelar(s.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl p-2.5 flex-shrink-0 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
    </div>
  );
}
