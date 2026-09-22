import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Home, Store, Globe, Package, Wheat, Sun, Sprout, Check } from 'lucide-react';
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

// MED-13 (auditoría Fase 4, 2026-09-22): códigos del catálogo cat_crop_variety
// reservados para "el técnico escribió un nombre que no está en el listado" —
// variety_id NUNCA se guarda como texto libre (rompía los JOIN de reportes);
// en su lugar se guarda uno de estos códigos válidos y el texto real va en
// variety_other. Mismo patrón ya usado en el flujo del productor
// (CicloProductivoPage.tsx).
const CODIGOS_OTRA = ['OTRA', 'OTRA_AMARILLO', 'OTRA_CRIOLLO', 'CRIOLLO_LOCAL'];

interface Variedad { code: string; label: string; }

export default function CicloTecnicoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: producerId } = useParams();
  const upIdInicial = (location.state as any)?.up_id ?? '';

  const [upId] = useState<string | number>(upIdInicial);
  const [tipoMaiz, setTipoMaiz] = useState<'blanco' | 'amarillo' | 'criollo' | ''>('');
  const [variedades, setVariedades] = useState<Variedad[]>([]);
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

  const esCriollo = CODIGOS_OTRA.includes(form.variety_id) || variedades.find(v => v.code === form.variety_id)?.label.toLowerCase().includes('criollo');

  useEffect(() => {
    if (!tipoMaiz) { setVariedades([]); return; }
    api.catalogos.variedadesCultivo(tipoMaiz)
      .then((d: any) => setVariedades(d?.varieties?.maiz ?? []))
      .catch(() => setVariedades([]));
  }, [tipoMaiz]);

  const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20 focus:border-[#1A5C38] transition-all';

  async function guardar() {
    if (!upId) { setError('No se encontró la unidad productiva (UP).'); return; }
    if (!form.cycle_type) { setError('Selecciona el tipo de ciclo.'); return; }
    if (!Number.isInteger(form.cycle_year) || form.cycle_year < 2000 || form.cycle_year > 2030) {
      setError('El año del ciclo debe estar entre 2000 y 2030.'); return;
    }
    if (!form.area_sown_ha || Number(form.area_sown_ha) <= 0) { setError('Ingresa la superficie sembrada.'); return; }
    if (form.yield_expected) {
      const r = Number(form.yield_expected);
      if (r < 1 || r > 15) { setError('El rendimiento debe estar entre 1 y 15 ton/ha para maíz en México.'); return; }
    }
    // CRIT-07 (auditoría seguridad 2026-09-21): el backend exige variety_id
    // y planting_date para crear el cultivo (POST /cycles/:cycle_id/crops),
    // pero el formulario los marcaba como "opcional" — si faltaban, el
    // ciclo ya se había creado en el paso anterior y quedaba huérfano
    // (bloqueando reintentos con el mismo año/tipo, sin forma de borrarlo
    // desde la UI). Se valida ANTES de crear nada.
    if (!form.variety_id) {
      setError('Selecciona el tipo de maíz y la variedad — es obligatoria para el cultivo.'); return;
    }
    // MED-13: si la variedad elegida es de las "otra/criollo", el nombre
    // libre es obligatorio (salvo CRIOLLO_LOCAL, que puede quedar genérico).
    if (esCriollo && form.variety_id !== 'CRIOLLO_LOCAL' && !form.variety_other.trim()) {
      setError('Escribe el nombre de la variedad.'); return;
    }
    if (!form.planting_date) { setError('Indica la fecha de siembra.'); return; }
    // MED-14 (auditoría Fase 4, 2026-09-22): sin esto se podía registrar
    // "cosecha en enero, siembra en diciembre" sin que el sistema lo detectara.
    if (form.estimated_harvest_date && new Date(form.estimated_harvest_date) <= new Date(form.planting_date)) {
      setError('La fecha estimada de cosecha debe ser posterior a la fecha de siembra.'); return;
    }

    setLoading(true);
    setError('');
    let cycleIdCreado: number | string | null = null;
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
      const cycleId: number | string = cicloRes.cycle.cycle_id;
      cycleIdCreado = cycleId;
      await api.cycles.crearCultivo(cycleId, {
        crop: 'maiz',
        variety_id: form.variety_id,
        variety_other: esCriollo ? (form.variety_other.trim() || null) : null,
        area_sown_ha: Number(form.area_sown_ha),
        planting_date: form.planting_date,
        yield_expected: form.yield_expected ? Number(form.yield_expected) : null,
        estimated_harvest_date: form.estimated_harvest_date || null,
        destination: form.destination || null,
      });
      setExito(true);
    } catch (err: any) {
      // Si el ciclo ya se creó pero el cultivo falló, no dejarlo huérfano:
      // se borra automáticamente para que el técnico pueda reintentar sin
      // chocar con "ya existe un ciclo activo" de ese mismo año/tipo.
      if (cycleIdCreado) {
        try { await api.cycles.eliminarCiclo(cycleIdCreado); }
        catch { console.error('[CRIT-07] No se pudo limpiar ciclo huérfano, cycle_id:', cycleIdCreado); }
      }
      setError(err?.message || 'Error al guardar el cultivo. Verifica los datos e inténtalo de nuevo.');
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
            <p className="text-[13px] font-bold text-slate-700 mb-2">Tipo de maíz</p>
            {!tipoMaiz ? (
              <div className="grid grid-cols-3 gap-2">
                {(['blanco', 'amarillo', 'criollo'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setTipoMaiz(t)}
                    className="p-3 rounded-xl border-2 border-slate-200 bg-white hover:border-[#1A5C38]/30 text-center transition-all">
                    <div className="flex justify-center mb-1 text-slate-500">
                      {t === 'blanco' ? <Wheat size={16} /> : t === 'amarillo' ? <Sun size={16} /> : <Sprout size={16} />}
                    </div>
                    <p className="text-[12px] font-bold text-slate-800 capitalize">{t}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12.5px] font-bold text-slate-700 capitalize">Maíz {tipoMaiz}</p>
                  <button type="button" onClick={() => { setTipoMaiz(''); setForm(f => ({ ...f, variety_id: '', variety_other: '' })); }}
                    className="text-[#1A5C38] text-[11.5px] font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                    Cambiar
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {variedades.map(v => (
                    <button key={v.code} type="button"
                      onClick={() => setForm(f => ({ ...f, variety_id: v.code, variety_other: '' }))}
                      className={`w-full rounded-xl p-2.5 border-2 text-left flex items-center gap-2 transition-all ${form.variety_id === v.code ? 'border-[#1A5C38] bg-[#1A5C38]/5' : 'border-slate-100 bg-white'}`}>
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${form.variety_id === v.code ? 'bg-[#1A5C38] border-[#1A5C38]' : 'border-slate-300'}`}>
                        {form.variety_id === v.code && <Check size={8} className="text-white" strokeWidth={4} />}
                      </div>
                      <span className="text-[12.5px] font-bold text-slate-700">{v.label}</span>
                    </button>
                  ))}
                </div>
                {esCriollo && (
                  <div className="mt-3">
                    <label className="block text-[13px] font-bold text-slate-700 mb-2">
                      {form.variety_id === 'CRIOLLO_LOCAL' ? '¿Cómo se llama la variedad criolla? (opcional)' : '¿Cuál es el nombre de la variedad?'}
                    </label>
                    <input type="text" value={form.variety_other}
                      onChange={e => setForm(f => ({ ...f, variety_other: e.target.value }))}
                      placeholder="Ej: Olotillo, Pepitilla, Bolita..." className={inputCls} />
                  </div>
                )}
              </div>
            )}
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
