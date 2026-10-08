import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageBanner } from '../components/Layout';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { AlertTriangle } from 'lucide-react';

export default function B07Inventario() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [conceptos, setConceptos] = useState<{ tipoMaiz: any[]; variedades: any[]; ciclos: any[] }>({ tipoMaiz: [], variedades: [], ciclos: [] });
  const [form, setForm] = useState({
    bodega_id: params.get('bodega_id') || '',
    ciclo: '', tipo_maiz: '', variedad_code: '', origen: 'local',
    volumen_almacenado: '',
    calidad: '', fecha: new Date().toISOString().slice(0, 10), observaciones: '',
  });
  const [loading, setLoading] = useState(false);
  const [capacidadBodega, setCapacidadBodega] = useState<number | null>(null);
  const [errorVolumen, setErrorVolumen] = useState<string | null>(null);

  // Cargar la capacidad total de la bodega seleccionada
  useEffect(() => {
    if (!form.bodega_id) { setCapacidadBodega(null); return; }
    api.infraestructura.get(Number(form.bodega_id))
      .then((d: any) => setCapacidadBodega(d?.capacidad_ton ? Number(d.capacidad_ton) : null))
      .catch(() => setCapacidadBodega(null));
  }, [form.bodega_id]);

  useEffect(() => {
    api.bodeguero.misBodegas().then((r: any) => setBodegas(r)).catch(() => {});
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/infraestructura/catalogos`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('simac_token')}` }
    }).then(r => r.json()).then(r => {
      setConceptos({
        tipoMaiz: r.tipos_maiz || r.tipo_maiz || [],
        variedades: r.variedades || [],
        ciclos: r.ciclos || [],
      });
    }).catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.bodega_id) { toast('Selecciona una bodega', 'error'); return; }
    if (capacidadBodega != null && capacidadBodega > 0 && Number(form.volumen_almacenado) > capacidadBodega) {
      setErrorVolumen(`No puedes registrar más de ${capacidadBodega.toLocaleString('es-MX')} ton — esa es la capacidad total de la bodega.`);
      toast('El volumen supera la capacidad de la bodega', 'error');
      return;
    }
    setLoading(true);
    try {
      await api.infraestructura.inventario(Number(form.bodega_id), form);
      toast('Inventario guardado', 'success');
      navigate(-1);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  }

  const TIPOS_MAIZ_DEFAULT = [['blanco','Maíz Blanco'],['amarillo','Maíz Amarillo'],['criollo','Criollo / Local']];

  const filteredVars = conceptos.variedades.filter((v: {tipo_maiz?: string}) => v.tipo_maiz === form.tipo_maiz);

  const inputClass = 'w-full bg-[#eef8f2] rounded-[1rem] px-4 py-3.5 text-[16px] font-medium outline-none transition-all duration-300 focus:ring-2 focus:ring-[#1A5C38]/40 focus:bg-white border-2 border-transparent focus:border-[#1A5C38]/10';
  const labelClass = 'block text-[14px] font-bold text-gray-600 mb-1.5 transition-colors group-hover/card:text-[#1A5C38]';
  const cardClass = 'bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6 space-y-4 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:border-black/[0.08] transition-all duration-500 group/card hover:-translate-y-0.5';

  return (
    <div className="w-full">
      <PageBanner title="Actualizar Inventario" subtitle="Registro de volumen almacenado" back="/maiz/bodega/mis-bodegas" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-5">
          {/* Bodega */}
          <div className={cardClass}>
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest transition-colors group-hover/card:text-[#1A5C38]/60">Bodega</p>
            <div>
              <label className={labelClass}>Selecciona la bodega</label>
              <select value={form.bodega_id} onChange={e => set('bodega_id', e.target.value)} required className={inputClass}>
                <option value="">Selecciona bodega</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Ciclo</label>
              <select value={form.ciclo} onChange={e => set('ciclo', e.target.value)} className={inputClass}>
                <option value="">Selecciona ciclo</option>
                {conceptos.ciclos.length > 0
                  ? conceptos.ciclos.map(c => <option key={c.code} value={c.code}>{c.label}</option>)
                  : [['PV', 'Primavera-Verano'], ['OI', 'Otoño-Invierno'], ['ANUAL', 'Anual']].map(([c, l]) => <option key={c} value={c}>{l}</option>)
                }
              </select>
            </div>
          </div>

          {/* Tipo de maíz */}
          <div className={cardClass}>
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest transition-colors group-hover/card:text-[#1A5C38]/60">Tipo de maíz</p>
            <div>
              <label className={labelClass}>Tipo de maíz</label>
              <select value={form.tipo_maiz} onChange={e => set('tipo_maiz', e.target.value)} required className={inputClass}>
                <option value="">Selecciona tipo</option>
                {(conceptos.tipoMaiz.length > 0
                  ? conceptos.tipoMaiz.map((t: any) => Array.isArray(t) ? t : [t.code || t.id, t.label || t.nombre || t.code])
                  : TIPOS_MAIZ_DEFAULT
                ).map((item: any) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
              </select>
            </div>
            {form.tipo_maiz && (
              <div>
                <label className={labelClass}>Variedad <span className="text-gray-400 font-medium">(opcional)</span></label>
                <select value={form.variedad_code} onChange={e => set('variedad_code', e.target.value)} className={inputClass}>
                  <option value="">Sin especificar</option>
                  {filteredVars.map(v => <option key={v.code} value={v.code}>{v.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Origen</label>
              <select value={form.origen} onChange={e => set('origen', e.target.value)} className={inputClass}>
                <option value="local">Local</option>
                <option value="importado">Importado</option>
              </select>
            </div>
          </div>

          {/* Volumen y calidad */}
          <div className={cardClass}>
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest transition-colors group-hover/card:text-[#1A5C38]/60">Volumen y calidad</p>
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-[1rem] p-5">
              <p className="text-sm font-bold text-emerald-800 mb-1.5">
                ¿Qué número debo escribir?
              </p>
              <p className="text-sm text-emerald-700/90 leading-relaxed font-medium">
                Escribe el <strong>total de toneladas que tienes almacenadas
                en este momento</strong> en la bodega — no solo lo que llegó hoy.
              </p>
              <p className="text-sm text-emerald-600/80 mt-2 font-medium">
                Ejemplo: Si tenías 800 ton y llegaron 200 ton más hoy,
                escribe <strong>1,000</strong> (el total actual).
              </p>
            </div>
            <div>
              <label className={labelClass}>Stock actual total (ton)</label>
              {capacidadBodega != null && capacidadBodega > 0 && (
                <p className="text-xs text-gray-500 mb-2 font-medium">
                  Capacidad total de la bodega: <strong className="text-gray-700">{capacidadBodega.toLocaleString('es-MX')} ton</strong>
                </p>
              )}
              <input
                type="number"
                value={form.volumen_almacenado}
                onChange={e => {
                  const val = Number(e.target.value);
                  if (capacidadBodega != null && capacidadBodega > 0 && val > capacidadBodega) {
                    setErrorVolumen(`No puedes registrar más de ${capacidadBodega.toLocaleString('es-MX')} ton — esa es la capacidad total de la bodega.`);
                  } else {
                    setErrorVolumen(null);
                  }
                  set('volumen_almacenado', e.target.value);
                }}
                required
                min="0"
                max={capacidadBodega ?? undefined}
                step="0.1"
                placeholder="Ej: 1,500"
                className={inputClass}
              />
              {errorVolumen && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1 font-medium"><AlertTriangle size={12} /> {errorVolumen}</p>
              )}
              <p className="text-xs text-gray-400 mt-1.5 font-medium">
                Este número reemplaza el registro anterior y representa
                el total que hay en tu bodega ahora mismo.
              </p>
            </div>
            <div>
              <label className={labelClass}>Calidad</label>
              <select value={form.calidad} onChange={e => set('calidad', e.target.value)} required className={inputClass}>
                <option value="">Selecciona calidad</option>
                <option value="primera">Primera</option>
                <option value="segunda">Segunda</option>
              </select>
            </div>
          </div>

          {/* Fecha */}
          <div className={cardClass}>
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest transition-colors group-hover/card:text-[#1A5C38]/60">Fecha y notas</p>
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required
                max={new Date().toISOString().slice(0, 10)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Observaciones</label>
              <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={3}
                className={`${inputClass} resize-none`} />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[16px] font-bold shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:hover:translate-y-0">
            {loading ? 'Guardando…' : 'Guardar inventario'}
          </button>
        </form>
      </div>
    </div>
  );
}
