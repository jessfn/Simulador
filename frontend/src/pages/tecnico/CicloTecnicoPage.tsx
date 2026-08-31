import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Home, Store, Globe, Package } from 'lucide-react';
import { api } from '../../services/api';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';

const AÑO_ACTUAL = new Date().getFullYear();

const CICLOS = [
  { valor: 'PV', label: 'Primavera-Verano' },
  { valor: 'OI', label: 'Otoño-Invierno' },
  { valor: 'ANUAL', label: 'Ciclo anual' },
];

const DESTINOS = [
  { valor: 'autoconsumo', label: 'Autoconsumo', icon: Home },
  { valor: 'venta_local', label: 'Venta local', icon: Store },
  { valor: 'venta_nacional', label: 'Venta nacional', icon: Globe },
  { valor: 'mixto', label: 'Mixto (varios)', icon: Package },
];

export default function CicloTecnicoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: producerId } = useParams();
  const upIdInicial = (location.state as any)?.up_id ?? '';

  const [upId] = useState<string | number>(upIdInicial);
  const [form, setForm] = useState({
    cycle_year: AÑO_ACTUAL,
    cycle_type: '',
    tipo_riego: 'temporal' as 'temporal' | 'riego',
    variety_id: '',
    variety_other: '',
    area_sown_ha: '',
    yield_expected: '',
    planting_date: '',
    estimated_harvest_date: '',
    destination: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20 focus:border-[#1A5C38] transition-all';

  async function guardar() {
    if (!upId) { setError('No se encontró la unidad productiva (UP).'); return; }
    if (!form.cycle_type) { setError('Selecciona el tipo de ciclo.'); return; }
    if (!form.area_sown_ha || Number(form.area_sown_ha) <= 0) { setError('Ingresa la superficie sembrada.'); return; }
    if (form.yield_expected) {
      const r = Number(form.yield_expected);
      if (r < 1 || r > 15) { setError('El rendimiento debe estar entre 1 y 15 ton/ha para maíz en México.'); return; }
    }

    setLoading(true);
    setError('');
    try {
      const cicloRes: any = await api.ups.crearCiclo(upId, {
        cycle_year: form.cycle_year,
        cycle_type: form.cycle_type,
        tipo_riego: form.tipo_riego,
      });
      if (!cicloRes?.cycle?.cycle_id) {
        setError(cicloRes?.error || 'Error al crear el ciclo.');
        return;
      }
      await api.cycles.crearCultivo(cicloRes.cycle.cycle_id, {
        crop: 'maiz',
        variety_id: form.variety_id || undefined,
        variety_other: form.variety_other || null,
        area_sown_ha: Number(form.area_sown_ha),
        planting_date: form.planting_date || undefined,
        yield_expected: form.yield_expected ? Number(form.yield_expected) : null,
        estimated_harvest_date: form.estimated_harvest_date || null,
        destination: form.destination || null,
      });
      setExito(true);
    } catch (err: any) {
      setError(err?.message || 'Error de conexión al guardar el ciclo.');
    } finally {
      setLoading(false);
    }
  }

  if (exito) {
    return (
      <div className="min-h-screen bg-[#eef8f2] flex flex-col items-center justify-center px-6 py-10">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-[#1A5C38]" />
        </div>
        <h1 className="text-[20px] font-black text-slate-900 text-center">Ciclo registrado</h1>
        <p className="text-[13.5px] text-slate-500 text-center mt-1.5">El ciclo productivo se guardó correctamente.</p>
        <div className="w-full max-w-sm mt-8 space-y-2.5">
          <button onClick={() => navigate(`/tecnico/productor/${producerId}`)}
            className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] active:scale-[0.98] transition-all">
            Volver al productor
          </button>
          <button onClick={() => navigate('/tecnico')}
            className="w-full text-slate-400 py-2.5 font-semibold text-[13px]">
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico title="Registrar ciclo" subtitle="Ciclo productivo de la UP" back={-1} />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div>
            <p className="text-[13px] font-bold text-slate-700 mb-2">Tipo de riego</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, tipo_riego: 'temporal' }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${form.tipo_riego === 'temporal' ? 'border-[#1A5C38] bg-[#1A5C38]/5' : 'border-slate-200 bg-white'}`}>
                <p className="font-bold text-[13px] text-slate-800">Temporal</p>
                <p className="text-[11px] text-slate-500">Depende de la lluvia</p>
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, tipo_riego: 'riego' }))}
                className={`p-3 rounded-xl border-2 text-left transition-all ${form.tipo_riego === 'riego' ? 'border-[#1A5C38] bg-[#1A5C38]/5' : 'border-slate-200 bg-white'}`}>
                <p className="font-bold text-[13px] text-slate-800">Riego</p>
                <p className="text-[11px] text-slate-500">Agua controlada</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Fecha de siembra</label>
            <input type="date" value={form.planting_date}
              onChange={e => setForm(f => ({ ...f, planting_date: e.target.value }))} className={inputCls} />
          </div>

          <div>
            <p className="text-[13px] font-bold text-slate-700 mb-2">Ciclo</p>
            <div className="space-y-2">
              {CICLOS.map(c => (
                <button key={c.valor} type="button"
                  onClick={() => setForm(f => ({ ...f, cycle_type: c.valor }))}
                  className={`w-full border-2 rounded-xl py-2.5 px-3 text-left transition-all ${form.cycle_type === c.valor ? 'border-[#1A5C38] bg-[#1A5C38]/5' : 'border-slate-100 bg-white'}`}>
                  <p className="text-[13px] font-bold text-slate-800">{c.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Año del ciclo</label>
            <input type="number" value={form.cycle_year}
              onChange={e => setForm(f => ({ ...f, cycle_year: Number(e.target.value) }))} className={inputCls} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Variedad (código, opcional)</label>
            <input type="text" value={form.variety_id}
              onChange={e => setForm(f => ({ ...f, variety_id: e.target.value }))}
              placeholder="Ej: MC_CRIOLLO" className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Variedad (otro, opcional)</label>
            <input type="text" value={form.variety_other}
              onChange={e => setForm(f => ({ ...f, variety_other: e.target.value }))}
              placeholder="Ej: Olotillo" className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Superficie sembrada (ha)</label>
            <input type="number" min="0.1" step="0.1" value={form.area_sown_ha}
              onChange={e => setForm(f => ({ ...f, area_sown_ha: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Rendimiento esperado (ton/ha, opcional)</label>
            <input type="number" min="1" max="15" step="0.1" value={form.yield_expected}
              onChange={e => setForm(f => ({ ...f, yield_expected: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Fecha estimada de cosecha (opcional)</label>
            <input type="date" value={form.estimated_harvest_date}
              onChange={e => setForm(f => ({ ...f, estimated_harvest_date: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-700 mb-2">Destino de la cosecha (opcional)</p>
            <div className="grid grid-cols-2 gap-2">
              {DESTINOS.map(d => (
                <button key={d.valor} type="button"
                  onClick={() => setForm(f => ({ ...f, destination: f.destination === d.valor ? '' : d.valor }))}
                  className={`py-2.5 px-3 rounded-xl border-2 text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${form.destination === d.valor ? 'border-[#1A5C38] bg-[#1A5C38]/5 text-[#1A5C38]' : 'border-slate-200 text-slate-600'}`}>
                  <d.icon size={15} />{d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-[12.5px] text-red-600">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        <button onClick={guardar} disabled={loading}
          className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
          {loading ? (<><div className="w-4 h-4 border-[3px] border-white/30 border-t-white rounded-full animate-spin" /> Guardando…</>) : 'Guardar ciclo'}
        </button>
      </div>
    </div>
  );
}
