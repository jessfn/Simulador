import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Wheat, Check, Leaf, MapPin,
  Sun, Sprout, Ruler, Home, Store, Globe, Package, Clock, AlertTriangle, Play,
  CloudRain, Droplets, X, Pencil, Calendar, CheckCircle2
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const AÑO_ACTUAL = new Date().getFullYear();

const CICLOS = [
  { valor: 'PV',    label: 'Primavera-Verano',  desc: 'Siembra abril – junio' },
  { valor: 'OI',    label: 'Otoño-Invierno',    desc: 'Siembra octubre – diciembre' },
  { valor: 'ANUAL', label: 'Ciclo anual',        desc: 'Producción continua' },
];

const DESTINOS = [
  { valor: 'autoconsumo',    label: 'Autoconsumo', icon: Home },
  { valor: 'venta_local',    label: 'Venta local', icon: Store },
  { valor: 'venta_nacional', label: 'Venta nacional', icon: Globe },
  { valor: 'mixto',          label: 'Mixto (varios)', icon: Package },
];

interface Variedad { code: string; label: string; }

export default function CicloProductivoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const esPrimerLogin = location.state?.desde === 'login';

  const [paso, setPaso] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [ciclosExistentes, setCiclosExistentes] = useState<any[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cargandoCiclos, setCargandoCiclos] = useState(true);

  const [upId, setUpId] = useState<number | null>(null);
  const [areaHaCalc, setAreaHaCalc] = useState<number | null>(null);
  const [areaHaReal, setAreaHaReal] = useState<number | null>(null);
  const [coincideAreaUp, setCoincideAreaUp] = useState<boolean | null>(null);
  const [errorSuperficie, setErrorSuperficie] = useState<string | null>(null);
  const [todasLasUPs, setTodasLasUPs] = useState<any[]>([]);
  const [upSeleccionadaId, setUpSeleccionadaId] = useState<number | null>(null);
  const [variedades, setVariedades] = useState<Variedad[]>([]);
  const [tipoMaiz, setTipoMaiz] = useState<'blanco' | 'amarillo' | 'criollo' | ''>('');
  const [esCriollo, setEsCriollo] = useState(false);

  const [form, setForm] = useState({
    cycle_year:             AÑO_ACTUAL,
    cycle_type:             '',
    variety_id:             '',
    variety_other:          '',
    area_sown_ha:           '',
    yield_expected:         '',
    planting_date:          '',
    estimated_harvest_date: '',
    destination:            '',
    tipo_riego:             'temporal',
  });

  const [cicloInferido, setCicloInferido] = useState<{
    ciclo: string;
    label: string;
    certeza: 'alta' | 'baja';
  } | null>(null);

  const [cicloConfirmado, setCicloConfirmado] = useState(false);

  // C8 — Cancelar ciclo
  const [cicloACancelar, setCicloACancelar] = useState<number | null>(null);
  const [cancelando, setCancelando] = useState(false);

  // C9 — Editar cultivo
  const [cicloEditando, setCicloEditando] = useState<any | null>(null);
  const [formEdicion, setFormEdicion] = useState<any | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/mis-ups`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const ups = Array.isArray(d) ? d : (d.ups || []);
        setTodasLasUPs(ups);
        if (ups.length === 1) {
          // Una sola parcela — seleccionar automáticamente
          setUpId(ups[0].up_id);
          setAreaHaCalc(ups[0].area_ha_calc ? Number(ups[0].area_ha_calc) : null);
          setAreaHaReal(ups[0].area_ha_real ? Number(ups[0].area_ha_real) : null);
          setCoincideAreaUp(ups[0].coincide_area ?? null);
          setUpSeleccionadaId(ups[0].up_id);
        } else if (ups.length === 0) {
          // Sin UP — mostrar el formulario directamente
          setMostrarFormulario(true);
          setCargandoCiclos(false);
        } else {
          // Varias parcelas — esperar a que el productor elija
          setCargandoCiclos(false);
        }
      }).catch(() => { setMostrarFormulario(true); setCargandoCiclos(false); });
  }, []);

  // Cargar ciclos existentes cuando ya tengamos la UP
  useEffect(() => {
    if (!upId) return;
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/ups/${upId}/cycles`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        const lista = Array.isArray(data) ? data : (data.cycles || []);
        setCiclosExistentes(lista);
        // Si no hay ciclos, mostrar formulario directamente
        if (lista.length === 0) setMostrarFormulario(true);
      })
      .catch(() => setMostrarFormulario(true))
      .finally(() => setCargandoCiclos(false));
  }, [upId]);

  useEffect(() => {
    if (!tipoMaiz) return;
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/catalogos-productor?tipo_maiz=${tipoMaiz}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const maiz: Variedad[] = d.varieties?.maiz ?? [];
        setVariedades(maiz);
      }).catch(() => {});
  }, [tipoMaiz]);

  // El límite siempre es el área calculada del polígono (medición GPS real)
  const areaMaxima = areaHaCalc;

  const guardar = async () => {
    if (!upId) { setError('No se encontró tu unidad productiva.'); return; }
    // La superficie sembrada no puede superar el área efectiva de la parcela
    if (areaMaxima != null && areaMaxima > 0 && Number(form.area_sown_ha) > areaMaxima) {
      setError(
        `La superficie sembrada (${form.area_sown_ha} ha) no puede ser mayor ` +
        `al área de tu parcela (${areaMaxima} ha). Ajusta el valor antes de continuar.`
      );
      return;
    }
    // El rendimiento debe estar en un rango realista para maíz en México
    if (form.yield_expected) {
      const r = Number(form.yield_expected);
      if (r < 1 || r > 15) {
        setError('El rendimiento debe estar entre 1 y 15 ton/ha para maíz en México.');
        return;
      }
    }
    const token = localStorage.getItem('simac_token');
    setLoading(true); setError('');
    try {
      const cicloRes = await fetch(`${BASE}/ups/${upId}/cycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cycle_year: form.cycle_year, cycle_type: form.cycle_type, tipo_riego: form.tipo_riego }),
      }).then(r => r.json());

      if (!cicloRes.cycle?.cycle_id) { setError(cicloRes.error || 'Error al crear ciclo'); return; }

      const cycleId = cicloRes.cycle.cycle_id;
      const cropRes = await fetch(`${BASE}/cycles/${cycleId}/crops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          crop:                   'maiz',
          variety_id:             form.variety_id,
          variety_other:          form.variety_other || null,
          area_sown_ha:           Number(form.area_sown_ha),
          planting_date:          form.planting_date,
          yield_expected:         form.yield_expected ? Number(form.yield_expected) : null,
          estimated_harvest_date: form.estimated_harvest_date || null,
          destination:            form.destination || null,
        }),
      });

      if (!cropRes.ok) {
        const err = await cropRes.json();
        // Limpiar ciclo huérfano para evitar duplicados en próximo intento
        await fetch(`${BASE}/cycles/${cycleId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        setError(err.error || 'Error al guardar cultivo'); return;
      }

      // El ciclo es obligatorio para el resto de SIMAC (Ticket 05): no basta
      // con marcar un estado local — se vuelve a consultar el estado real
      // del servidor y solo entonces se navega al inicio del productor.
      await fetch(`${BASE}/productor/estado-registro`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      navigate('/productor', { state: { mensaje: 'Ciclo productivo guardado con éxito' } });
    } catch { setError('Error de conexión al servidor. Revisa tu internet e intenta de nuevo.');
    } finally { setLoading(false); }
  };

  // C8 — Cancelar ciclo (estado_ciclo = 'cancelado'). No borra el registro.
  const handleCancelarCiclo = async () => {
    if (!cicloACancelar) return;
    setCancelando(true);
    const token = localStorage.getItem('simac_token');
    try {
      const res = await fetch(`${BASE}/cycles/${cicloACancelar}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: 'cancelado' }),
      });
      if (res.ok) {
        // Quitar el ciclo cancelado de la lista local sin recargar
        setCiclosExistentes(prev => prev.filter(c => c.cycle_id !== cicloACancelar));
      }
    } catch (e) {
      console.error('Error al cancelar ciclo:', e);
    } finally {
      setCancelando(false);
      setCicloACancelar(null);
    }
  };

  // C9 — Abrir el panel de edición con los datos actuales del cultivo
  const handleAbrirEdicion = (ciclo: any) => {
    const crop = ciclo.crops?.[0] || {};
    setCicloEditando({
      cycle_id:      ciclo.cycle_id,
      cycle_type:    ciclo.cycle_type,
      cycle_year:    ciclo.cycle_year,
      cycle_crop_id: crop.cycle_crop_id,
    });
    setFormEdicion({
      area_sown_ha:           crop.area_sown_ha ?? '',
      planting_date:          crop.planting_date ? String(crop.planting_date).slice(0, 10) : '',
      estimated_harvest_date: crop.estimated_harvest_date ? String(crop.estimated_harvest_date).slice(0, 10) : '',
      yield_expected:         crop.yield_expected ?? '',
      destination:            crop.destination ?? '',
    });
    setErrorEdicion(null);
  };

  // C9 — Guardar la edición del cultivo (PATCH /cycle-crops/:id)
  const handleGuardarEdicion = async () => {
    if (!cicloEditando?.cycle_crop_id) return;
    // Validar superficie contra el área efectiva de la parcela
    if (areaMaxima && Number(formEdicion.area_sown_ha) > areaMaxima) {
      setErrorEdicion(`La superficie sembrada no puede ser mayor al área de tu parcela (${areaMaxima} ha).`);
      return;
    }
    if (formEdicion.yield_expected) {
      const r = Number(formEdicion.yield_expected);
      if (r < 1 || r > 15) {
        setErrorEdicion('El rendimiento debe estar entre 1 y 15 ton/ha para maíz en México.');
        return;
      }
    }
    setGuardandoEdicion(true);
    setErrorEdicion(null);
    const token = localStorage.getItem('simac_token');
    try {
      const res = await fetch(`${BASE}/cycle-crops/${cicloEditando.cycle_crop_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          area_sown_ha:           Number(formEdicion.area_sown_ha) || null,
          planting_date:          formEdicion.planting_date || null,
          estimated_harvest_date: formEdicion.estimated_harvest_date || null,
          yield_expected:         formEdicion.yield_expected ? Number(formEdicion.yield_expected) : null,
          destination:            formEdicion.destination || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorEdicion(data.error || 'No se pudo guardar. Intenta de nuevo.');
        return;
      }
      // Actualizar la lista local: el cultivo editado vive en ciclo.crops[0]
      setCiclosExistentes(prev =>
        prev.map(c =>
          c.cycle_id === cicloEditando.cycle_id
            ? { ...c, crops: [{ ...(c.crops?.[0] || {}), ...formEdicion, area_sown_ha: Number(formEdicion.area_sown_ha) || null }] }
            : c
        )
      );
      setCicloEditando(null);
      setFormEdicion(null);
    } catch {
      setErrorEdicion('Error de conexión. Intenta de nuevo.');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Inferencia de ciclo basada en el calendario oficial SIAP
  const inferirCicloSIAP = (fechaSiembra: string, tipoRiego: string): {
    ciclo: string;
    label: string;
    certeza: 'alta' | 'baja';
  } | null => {
    if (!fechaSiembra) return null;
    if (tipoRiego === 'riego') return null;

    const mes = new Date(fechaSiembra + 'T12:00:00').getMonth() + 1;
    const año = new Date(fechaSiembra + 'T12:00:00').getFullYear();

    if ([10, 11, 12, 1, 2].includes(mes)) {
      const añoCiclo = mes >= 10 ? año : año - 1;
      return { ciclo: 'OI', label: `Otoño-Invierno ${añoCiclo}`, certeza: 'alta' };
    }
    if ([4, 5, 6, 7].includes(mes)) {
      return { ciclo: 'PV', label: `Primavera-Verano ${año}`, certeza: 'alta' };
    }
    return { ciclo: '', label: 'Mes de transición', certeza: 'baja' };
  };

  const handleFechaSiembra = (fecha: string) => {
    setCicloConfirmado(false);
    const resultado = inferirCicloSIAP(fecha, form.tipo_riego);
    setCicloInferido(resultado);

    if (resultado && resultado.certeza === 'alta') {
      setForm(f => ({
        ...f,
        planting_date: fecha,
        cycle_type: resultado.ciclo,
        cycle_year: new Date(fecha + 'T12:00:00').getFullYear(),
      }));
    } else {
      setForm(f => ({ ...f, planting_date: fecha, cycle_type: '' }));
    }
  };

  const inputCls = 'w-full bg-[#eef8f2]/50 border border-slate-200 rounded-[14px] px-3.5 py-3 text-[14px] font-semibold text-slate-800 placeholder-slate-400 focus:border-[#1A5C38] focus:bg-white focus:ring-2 focus:ring-[#1A5C38]/10 transition-all outline-none';

  const cycleTypeLabel = (t: string) =>
    t === 'PV' ? 'Primavera-Verano' : t === 'OI' ? 'Otoño-Invierno' : t === 'ANUAL' ? 'Ciclo anual' : t;

  // ── Loader mientras se consultan los ciclos existentes ──
  if (cargandoCiclos) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full bg-[#eef8f2] gap-3">
        <div className="w-8 h-8 border-[3px] border-[#1A5C38]/20 border-t-[#1A5C38] rounded-full animate-spin" />
        <p className="text-[13px] font-semibold text-slate-400">Cargando tus ciclos…</p>
      </div>
    );
  }

  // ── Selector de parcela cuando hay más de una UP (#6) ──
  if (todasLasUPs.length > 1 && !upSeleccionadaId) {
    return (
      <div className="flex flex-col font-sans w-full h-full bg-[#eef8f2] overflow-hidden">
        {/* Slim header */}
        <div className="shrink-0 z-20 w-full backdrop-blur-md border-b border-white/10" style={{ background: 'linear-gradient(135deg, rgba(20,72,44,0.88) 0%, rgba(26,92,56,0.82) 60%, rgba(34,115,63,0.76) 100%)' }}>
          <div className="max-w-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/15 text-white hover:bg-white/25 transition-all active:scale-95">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-black text-white tracking-tight leading-none">Ciclo productivo</h1>
              <p className="text-[11px] text-white/60 font-bold mt-1">¿En qué parcela es este ciclo?</p>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto w-full pb-safe z-10">
          <div className="w-full max-w-xl mx-auto px-4 sm:px-6 pt-4 mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2">
              <div className="space-y-1.5 p-1.5">
                {todasLasUPs.map((up, i) => (
                  <button
                    key={up.up_id}
                    style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                    onClick={() => {
                      setUpId(up.up_id);
                      setAreaHaCalc(up.area_ha_calc ? Number(up.area_ha_calc) : null);
                      setAreaHaReal(up.area_ha_real ? Number(up.area_ha_real) : null);
                      setCoincideAreaUp(up.coincide_area ?? null);
                      setUpSeleccionadaId(up.up_id);
                      setCargandoCiclos(true);
                    }}
                    className="w-full bg-transparent rounded-[24px] p-4 text-left flex items-center gap-4 hover:bg-[#eef8f2] active:scale-[0.98] transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 group"
                  >
                    <div className="w-14 h-14 rounded-[20px] bg-[#1A5C38]/5 flex items-center justify-center shrink-0 group-hover:bg-[#1A5C38]/10 transition-colors">
                      <Sprout size={24} className="text-[#1A5C38]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-[16px]">{up.up_name || 'Parcela'}</p>
                      <p className="text-[13px] text-slate-500 mt-1 truncate">
                        {[up.municipality_name, up.state_name].filter(Boolean).join(', ')}
                        {up.area_ha_calc ? ` · ${Number(up.area_ha_calc)} ha` : ''}
                      </p>
                    </div>
                    <ChevronRight size={20} className="text-gray-300 shrink-0 group-hover:text-[#1A5C38] group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Lista de ciclos existentes + botón para agregar uno nuevo ──
  if (!mostrarFormulario && ciclosExistentes.length > 0) {
    return (
      <div className="flex flex-col font-sans w-full h-full bg-[#eef8f2] overflow-hidden">
        {/* Slim header */}
        <div className="shrink-0 z-20 w-full backdrop-blur-md border-b border-white/10" style={{ background: 'linear-gradient(135deg, rgba(20,72,44,0.88) 0%, rgba(26,92,56,0.82) 60%, rgba(34,115,63,0.76) 100%)' }}>
          <div className="max-w-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/15 text-white hover:bg-white/25 transition-all active:scale-95">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-black text-white tracking-tight leading-none">Ciclos productivos</h1>
              <p className="text-[11px] text-white/60 font-bold mt-1">Tu siembra registrada en SIMAC</p>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto w-full pb-safe z-10">
          <div className="w-full max-w-xl mx-auto px-4 sm:px-6 pt-4 mb-8">
            <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-100">
              <h3 className="text-[15px] font-black text-slate-800 mb-4 px-1">
                Ciclos registrados
              </h3>
              <div className="space-y-3 mb-6">
                {ciclosExistentes.map((ciclo, i) => {
                  const crop = ciclo.crops?.[0] || {};
                  const variedad = crop.variety_other || crop.variety_id || 'Sin variedad';
                  const superficie = crop.area_sown_ha ?? null;
                  const estado = ciclo.estado_ciclo || 'activo';
                  return (
                    <div
                      key={ciclo.cycle_id}
                      style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                      className="bg-white border border-gray-100 rounded-[24px] p-5 flex flex-col shadow-sm hover:shadow-md transition-shadow animate-in fade-in slide-in-from-bottom-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 pr-3">
                          <p className="font-bold text-slate-800 text-[16px] tracking-tight">
                            {cycleTypeLabel(ciclo.cycle_type)} {ciclo.cycle_year}
                          </p>
                          <p className="text-[13px] text-slate-500 mt-1 truncate font-medium">
                            {variedad} · {superficie != null ? `${superficie} ha` : '—'}
                          </p>
                          {ciclo.tipo_riego && (
                            <p className="text-[12px] text-slate-600 mt-1 flex items-center gap-1 font-medium">
                              {ciclo.tipo_riego === 'riego'
                                ? (<><Droplets size={13} className="text-[#1A5C38]" /> Riego</>)
                                : (<><CloudRain size={13} className="text-[#1A5C38]" /> Temporal</>)}
                            </p>
                          )}
                        </div>
                        <span className={`px-4 py-1.5 rounded-full text-[11px] font-bold shrink-0 tracking-wide ${
                          estado === 'activo'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : estado === 'cosechado'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : 'bg-gray-50 text-gray-500 border border-gray-200'
                        }`}>
                          {estado.charAt(0).toUpperCase() + estado.slice(1)}
                        </span>
                      </div>

                      {/* Acciones — solo en ciclos activos */}
                      {estado === 'activo' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center">
                          <button
                            type="button"
                            onClick={() => handleAbrirEdicion(ciclo)}
                            className="text-[12.5px] text-[#1A5C38] font-bold flex items-center gap-1.5 active:opacity-60 transition-opacity"
                          >
                            <Pencil size={14} /> Editar cultivo
                          </button>
                          <button
                            type="button"
                            onClick={() => setCicloACancelar(ciclo.cycle_id)}
                            className="text-[12.5px] text-red-500 font-bold flex items-center gap-1.5 active:opacity-60 transition-opacity"
                          >
                            <X size={14} /> Cancelar ciclo
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => { setPaso(1); setError(''); setMostrarFormulario(true); }}
                className="w-full py-4 border-2 border-dashed border-[#1A5C38]/40 bg-[#1A5C38]/5 text-[#1A5C38] rounded-[24px] font-bold hover:bg-[#1A5C38]/10 hover:border-[#1A5C38]/60 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
              >
                <div className="w-6 h-6 rounded-full bg-[#1A5C38] text-white flex items-center justify-center">
                  <span className="text-sm font-black leading-none mt-[1px]">+</span>
                </div>
                <span className="text-[15px]">Agregar otro ciclo</span>
              </button>
            </div>
          </div>
        </div>

        {/* C8 — Modal de confirmación para cancelar ciclo */}
        {cicloACancelar && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end animate-in fade-in duration-200"
            onClick={() => !cancelando && setCicloACancelar(null)}>
            <div className="bg-white w-full rounded-t-[24px] px-5 pt-4 pb-8 space-y-4 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom duration-300"
              style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-1" />

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <h2 className="font-black text-slate-800 text-[16px] tracking-tight">¿Cancelar este ciclo?</h2>
              </div>

              <p className="text-[13px] text-slate-600 leading-relaxed">
                El ciclo quedará cancelado y no aparecerá en tu lista activa.
                Tu información no se borrará — quedará guardada en el sistema.
              </p>

              <button type="button" onClick={handleCancelarCiclo} disabled={cancelando}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold text-[15px] py-3.5 rounded-[14px] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {cancelando ? (<><div className="w-4 h-4 border-[3px] border-white/30 border-t-white rounded-full animate-spin" /> Cancelando…</>) : 'Sí, cancelar ciclo'}
              </button>

              <button type="button" onClick={() => setCicloACancelar(null)} disabled={cancelando}
                className="w-full border border-slate-200 text-slate-600 font-bold text-[14px] py-3 rounded-[14px] active:scale-[0.98] transition-all">
                No, mantener ciclo
              </button>
            </div>
          </div>
        )}

        {/* C9 — Panel de edición de cultivo */}
        {cicloEditando && formEdicion && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end animate-in fade-in duration-200"
            onClick={() => { if (!guardandoEdicion) { setCicloEditando(null); setFormEdicion(null); } }}>
            <div className="bg-white w-full rounded-t-[24px] px-5 pt-4 pb-8 max-h-[90vh] overflow-y-auto space-y-4 shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom duration-300"
              style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-1" />

              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-800 text-[16px] tracking-tight">Editar cultivo</h2>
                  <p className="text-[12px] text-slate-500 mt-0.5 font-medium">
                    {cycleTypeLabel(cicloEditando.cycle_type)} {cicloEditando.cycle_year}
                  </p>
                </div>
                <button type="button" onClick={() => { setCicloEditando(null); setFormEdicion(null); }}
                  className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 active:scale-90 transition-all">
                  <X size={18} />
                </button>
              </div>

              {/* Superficie sembrada */}
              <div>
                <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">Superficie sembrada (ha)</label>
                <input type="number" inputMode="decimal" min="0.1" step="0.1"
                  value={formEdicion.area_sown_ha}
                  onChange={e => setFormEdicion((f: any) => ({ ...f, area_sown_ha: e.target.value }))}
                  className={inputCls} />
                {areaHaCalc && (
                  <p className="text-[11.5px] text-slate-400 mt-1 font-medium">Área máxima de tu parcela: {areaHaCalc} ha</p>
                )}
              </div>

              {/* Fecha de siembra */}
              <div>
                <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">Fecha de siembra</label>
                <input type="date"
                  value={formEdicion.planting_date}
                  onChange={e => setFormEdicion((f: any) => ({ ...f, planting_date: e.target.value }))}
                  className={`${inputCls} font-bold text-slate-700`} />
              </div>

              {/* Fecha estimada de cosecha */}
              <div>
                <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">
                  Fecha estimada de cosecha <span className="text-slate-400 font-medium ml-1">(opcional)</span>
                </label>
                <input type="date"
                  value={formEdicion.estimated_harvest_date}
                  onChange={e => setFormEdicion((f: any) => ({ ...f, estimated_harvest_date: e.target.value }))}
                  className={`${inputCls} font-bold text-slate-700`} />
              </div>

              {/* Rendimiento esperado */}
              <div>
                <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">
                  Rendimiento esperado (ton/ha) <span className="text-slate-400 font-medium ml-1">(opcional)</span>
                </label>
                <input type="number" inputMode="decimal" min="1" max="15" step="0.1"
                  value={formEdicion.yield_expected}
                  onChange={e => setFormEdicion((f: any) => ({ ...f, yield_expected: e.target.value }))}
                  className={inputCls} />
              </div>

              {/* Destino de la cosecha */}
              <div>
                <label className="text-[13px] font-bold text-slate-700 mb-1.5 block">
                  Destino de la cosecha <span className="text-slate-400 font-medium ml-1">(opcional)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DESTINOS.map((d: any) => (
                    <button key={d.valor} type="button"
                      onClick={() => setFormEdicion((f: any) => ({ ...f, destination: f.destination === d.valor ? '' : d.valor }))}
                      className={`py-2.5 px-3 rounded-[12px] border-2 text-[12px] font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5
                        ${formEdicion.destination === d.valor
                          ? 'border-[#1A5C38] bg-[#1A5C38]/5 text-[#1A5C38]'
                          : 'border-slate-200 text-slate-600'}`}>
                      <d.icon size={15} className={formEdicion.destination === d.valor ? 'text-[#1A5C38]' : 'text-slate-400'} />
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {errorEdicion && (
                <div className="bg-red-50 border border-red-200 rounded-[12px] p-3 flex items-start gap-2">
                  <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-600 text-[12px] font-medium leading-relaxed">{errorEdicion}</p>
                </div>
              )}

              {/* Guardar */}
              <button type="button" onClick={handleGuardarEdicion} disabled={guardandoEdicion}
                className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white font-bold text-[15px] py-3.5 rounded-[14px] active:scale-[0.98] transition-all disabled:opacity-60 mt-1 flex items-center justify-center gap-2">
                {guardandoEdicion ? (<><div className="w-4 h-4 border-[3px] border-white/30 border-t-white rounded-full animate-spin" /> Guardando…</>) : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col font-sans w-full h-full bg-[#eef8f2] overflow-hidden">
      
      {/* Slim header sticky */}
      <div className="shrink-0 z-20 w-full backdrop-blur-md border-b border-white/10" style={{ background: 'linear-gradient(135deg, rgba(20,72,44,0.88) 0%, rgba(26,92,56,0.82) 60%, rgba(34,115,63,0.76) 100%)' }}>
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3 mb-2.5">
            <button onClick={() => {
                if (paso > 1) { setPaso(paso - 1); return; }
                if (ciclosExistentes.length > 0) setMostrarFormulario(false);
                else navigate(-1);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white/15 text-white hover:bg-white/25 transition-all active:scale-95">
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[15px] font-black text-white tracking-tight leading-none">Registrar ciclo</h1>
              <p className="text-[11px] text-white/60 font-bold mt-1">Paso {paso} de 4</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className={`h-1 flex-1 rounded-full transition-all duration-500
                ${n <= paso ? 'bg-white' : 'bg-white/25'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto w-full pb-[120px] z-10 scroll-smooth">
        <div className="w-full max-w-xl mx-auto px-4 sm:px-6 pt-4 mb-8">
          <div className="w-full">

            {/* Banner de la parcela seleccionada (cuando hay varias UPs) */}
            {todasLasUPs.length > 1 && upSeleccionadaId && (
              <div className="mb-4 bg-[#1A5C38] rounded-[16px] px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="min-w-0">
                  <p className="text-[11px] text-emerald-200 font-medium">Registrando ciclo en:</p>
                  <p className="text-sm font-bold text-white flex items-center gap-1.5 truncate">
                    <Sprout size={14} className="flex-shrink-0" /> {todasLasUPs.find(u => u.up_id === upSeleccionadaId)?.up_name || 'Parcela'}
                  </p>
                </div>
                <button onClick={() => setUpSeleccionadaId(null)} className="text-emerald-200 text-xs underline font-semibold flex-shrink-0 ml-3">
                  Cambiar
                </button>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3.5 bg-red-50/90 backdrop-blur-sm border border-red-100 rounded-[16px] text-red-700 text-[13px] font-medium flex items-start gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
                <AlertTriangle size={18} className="shrink-0 text-red-600 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {/* Tarjeta Contenedor */}
            <div className="bg-white/95 backdrop-blur-xl rounded-[32px] p-5 sm:p-6 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-white transition-all duration-300">
            
            {/* ── PASO 1 — Riego y fecha de siembra ── */}
            {paso === 1 && (
              <div className="space-y-5 relative z-10 animate-in fade-in slide-in-from-right-4 duration-300">

                {esPrimerLogin && (
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-[12px] p-3 mb-1 flex gap-2.5 items-start">
                    <div className="bg-indigo-100 text-indigo-600 p-1 rounded-full shrink-0">
                      <Play size={10} fill="currentColor" />
                    </div>
                    <div>
                      <p className="text-indigo-900 text-[12px] font-bold tracking-tight">Un último paso</p>
                      <p className="text-indigo-700/80 text-[11.5px] font-medium mt-0.5 leading-relaxed">
                        Registra la información de tu siembra actual para las bodegas.
                      </p>
                    </div>
                  </div>
                )}

                {/* Tipo de riego */}
                <div>
                  <p className="text-[13px] font-bold text-slate-800 mb-2">
                    ¿Cómo se riega tu parcela?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, tipo_riego: 'temporal' }));
                        setCicloInferido(null);
                        setCicloConfirmado(false);
                        if (form.planting_date) handleFechaSiembra(form.planting_date);
                      }}
                      className={`p-3 rounded-[12px] border-2 text-left transition-all active:scale-95
                        ${form.tipo_riego === 'temporal'
                          ? 'border-[#1A5C38] bg-[#1A5C38]/5'
                          : 'border-slate-200 bg-white'}`}>
                      <p className="font-black text-[13px] text-slate-800 flex items-center gap-1.5"><CloudRain size={14} className="text-slate-500" /> Temporal</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Depende de la lluvia</p>
                    </button>
                    <button type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, tipo_riego: 'riego', cycle_type: '' }));
                        setCicloInferido(null);
                        setCicloConfirmado(false);
                      }}
                      className={`p-3 rounded-[12px] border-2 text-left transition-all active:scale-95
                        ${form.tipo_riego === 'riego'
                          ? 'border-[#1A5C38] bg-[#1A5C38]/5'
                          : 'border-slate-200 bg-white'}`}>
                      <p className="font-black text-[13px] text-slate-800 flex items-center gap-1.5"><Droplets size={14} className="text-blue-400" /> Riego</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Agua controlada</p>
                    </button>
                  </div>
                </div>

                {/* Fecha de siembra */}
                <div className="bg-[#eef8f2]/80 rounded-[14px] p-3.5 border border-slate-100 shadow-sm">
                  <label className="text-[13px] font-bold text-slate-800 mb-2 flex items-center gap-2">
                    <Calendar size={14} className="text-[#1A5C38]" /> ¿Cuándo vas a sembrar?
                  </label>
                  <input
                    type="date"
                    value={form.planting_date}
                    onChange={e => handleFechaSiembra(e.target.value)}
                    className="w-full border border-slate-200 rounded-[10px] px-3 py-2.5 font-bold text-[14px] text-slate-700 focus:outline-none focus:border-[#1A5C38] transition-colors"
                  />
                </div>

                {/* CASO A — Ciclo inferido con certeza alta, pendiente de confirmar */}
                {cicloInferido && cicloInferido.certeza === 'alta' && !cicloConfirmado && (
                  <div className="bg-[#E8F5EE] border border-[#1A5C38]/30 rounded-[14px] p-4">
                    <p className="text-[13px] font-bold text-[#1A5C38] mb-1">
                      <CheckCircle2 size={14} className="inline mr-1 text-[#1A5C38]" /> Tu ciclo es: {cicloInferido.label}
                    </p>
                    <p className="text-[12px] text-slate-600 mb-3">
                      Determinado con base en tu fecha de siembra según el calendario oficial SIAP.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCicloConfirmado(true)}
                        className="flex-1 bg-[#1A5C38] text-white font-bold text-[13px] py-2.5 rounded-[10px] active:scale-95 transition-all">
                        Sí, es correcto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCicloInferido(null);
                          setForm(f => ({ ...f, cycle_type: '' }));
                        }}
                        className="flex-1 border border-slate-300 text-slate-600 font-medium text-[13px] py-2.5 rounded-[10px] active:scale-95 transition-all">
                        Cambiar
                      </button>
                    </div>
                  </div>
                )}

                {/* CASO B — Ciclo confirmado */}
                {cicloConfirmado && cicloInferido && (
                  <div className="bg-[#E8F5EE] border border-[#1A5C38]/30 rounded-[14px] p-3 flex items-center gap-2">
                    <span className="text-[#1A5C38] font-bold text-[13px]">
                      <CheckCircle2 size={14} className="inline mr-1 text-[#1A5C38]" /> Ciclo confirmado: {cicloInferido.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCicloConfirmado(false);
                        setCicloInferido(null);
                        setForm(f => ({ ...f, cycle_type: '' }));
                      }}
                      className="ml-auto text-[11px] text-slate-500 underline font-medium">
                      Cambiar
                    </button>
                  </div>
                )}

                {/* CASO C — Mes de transición: productor elige manualmente */}
                {cicloInferido && cicloInferido.certeza === 'baja' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-[14px] p-4">
                    <p className="text-[13px] font-bold text-slate-700 mb-1">
                      <Calendar size={14} className="inline mr-1 text-slate-600" /> Este mes está entre ciclos
                    </p>
                    <p className="text-[12px] text-slate-500 mb-3">
                      Selecciona el ciclo que corresponde a tu siembra:
                    </p>
                    <div className="space-y-2">
                      {CICLOS.map(c => (
                        <button key={c.valor} type="button"
                          onClick={() => {
                            setForm(f => ({
                              ...f,
                              cycle_type: c.valor,
                              cycle_year: new Date(form.planting_date + 'T12:00:00').getFullYear(),
                            }));
                            setCicloConfirmado(true);
                          }}
                          className={`w-full border-2 rounded-[12px] py-2.5 px-3 text-left transition-all active:scale-[0.98]
                            ${form.cycle_type === c.valor
                              ? 'border-[#1A5C38] bg-[#1A5C38]/5'
                              : 'border-slate-100 bg-white'}`}>
                          <p className="text-[13px] font-black text-slate-800">{c.label}</p>
                          <p className="text-[11.5px] text-slate-500 mt-0.5">{c.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* CASO D — Producción bajo riego: elige ciclo manualmente */}
                {form.tipo_riego === 'riego' && form.planting_date && (
                  <div className="bg-slate-50 border border-slate-200 rounded-[14px] p-4">
                    <p className="text-[13px] font-bold text-slate-700 mb-1">
                      <Droplets size={14} className="inline mr-1 text-blue-400" /> Producción bajo riego
                    </p>
                    <p className="text-[12px] text-slate-500 mb-3">
                      Selecciona el ciclo que corresponde a tu producción:
                    </p>
                    <div className="space-y-2">
                      {CICLOS.map(c => (
                        <button key={c.valor} type="button"
                          onClick={() => {
                            setForm(f => ({
                              ...f,
                              cycle_type: c.valor,
                              cycle_year: new Date(form.planting_date + 'T12:00:00').getFullYear(),
                            }));
                            setCicloConfirmado(true);
                          }}
                          className={`w-full border-2 rounded-[12px] py-2.5 px-3 text-left transition-all active:scale-[0.98]
                            ${form.cycle_type === c.valor
                              ? 'border-[#1A5C38] bg-[#1A5C38]/5'
                              : 'border-slate-100 bg-white'}`}>
                          <p className="text-[13px] font-black text-slate-800">{c.label}</p>
                          <p className="text-[11.5px] text-slate-500 mt-0.5">{c.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* PASO 2 — Variedad */}
            {paso === 2 && (
              <div className="space-y-4 relative z-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center sm:text-left mb-1">
                  <div className="w-10 h-10 bg-amber-50 rounded-[14px] flex items-center justify-center text-amber-500 mb-3 mx-auto sm:mx-0 shadow-sm border border-amber-100/50">
                    <Leaf size={18} strokeWidth={2} />
                  </div>
                  <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight mb-1">
                    Variedad sembrada
                  </h2>
                  <p className="text-[13px] text-slate-500 font-medium">Selecciona el tipo de maíz que produces.</p>
                </div>
                
                {!tipoMaiz ? (
                  <div className="space-y-2">
                    {['blanco', 'amarillo', 'criollo'].map((t, idx) => (
                      <button key={t} onClick={() => setTipoMaiz(t as any)}
                        className="w-full rounded-[14px] p-3 border-2 border-slate-100 bg-white hover:border-[#1A5C38]/30 hover:bg-emerald-50/30 text-left transition-all duration-200 active:scale-[0.98] group flex justify-between items-center shadow-sm hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-slate-500 group-hover:text-[#1A5C38] group-hover:bg-[#1A5C38]/10 bg-[#eef8f2] transition-colors`}>
                            {idx === 0 ? <Wheat size={16} /> : idx === 1 ? <Sun size={16} /> : <Sprout size={16} />}
                          </div>
                          <p className="text-[14px] font-black text-slate-800 capitalize group-hover:text-[#1A5C38] transition-colors tracking-tight">
                            Maíz {t}
                          </p>
                        </div>
                        <ChevronLeft size={16} className="text-slate-300 rotate-180 group-hover:text-[#1A5C38] group-hover:translate-x-1 transition-all" strokeWidth={3} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-3 bg-[#eef8f2]/80 p-2 rounded-[12px] border border-slate-100 shadow-sm">
                      <p className="font-black text-slate-800 capitalize text-[13px] flex items-center gap-1.5 px-2">
                        {tipoMaiz === 'blanco' ? <Wheat size={16} className="text-[#1A5C38]"/> : tipoMaiz === 'amarillo' ? <Sun size={16} className="text-amber-500"/> : <Sprout size={16} className="text-emerald-500"/>} 
                        Maíz {tipoMaiz}
                      </p>
                      <button onClick={() => { setTipoMaiz(''); setForm(f => ({...f, variety_id: '', variety_other: ''})); setEsCriollo(false); }} 
                        className="text-[#1A5C38] text-[11.5px] font-bold bg-white border border-slate-200 px-2.5 py-1 rounded-[8px] hover:bg-[#eef8f2] transition-colors shadow-sm active:scale-95">
                        Cambiar
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-1.5 mb-3 max-h-[220px] overflow-y-auto pr-1.5 scrollbar-thin scrollbar-thumb-slate-200">
                      {variedades.map(v => (
                        <button key={v.code}
                          onClick={() => {
                            setForm(f => ({...f, variety_id: v.code, variety_other: ''}));
                            setEsCriollo(
                              v.code === 'CRIOLLO_LOCAL' ||
                              v.code === 'OTRA'          ||
                              v.code === 'OTRA_AMARILLO' ||
                              v.code === 'OTRA_CRIOLLO'  ||
                              v.label.toLowerCase().includes('criollo')
                            );
                          }}
                          className={`w-full rounded-[12px] p-2.5 border-2 text-left transition-all active:scale-[0.98] flex items-center gap-2.5
                            ${form.variety_id === v.code
                              ? 'border-[#1A5C38] bg-[#1A5C38]/5 shadow-sm'
                              : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-[#eef8f2]'}`}>
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 shrink-0 transition-colors
                            ${form.variety_id === v.code ? 'bg-[#1A5C38] border-[#1A5C38]' : 'border-slate-300'}`}>
                            {form.variety_id === v.code && <Check size={8} className="text-white" strokeWidth={4} />}
                          </div>
                          <span className={`text-[12.5px] font-bold ${form.variety_id === v.code ? 'text-[#1A5C38]' : 'text-slate-700'}`}>
                            {v.label}
                          </span>
                        </button>
                      ))}
                    </div>
                    
                    {esCriollo && (
                      <div className="animate-in fade-in slide-in-from-top-2 p-4 bg-[#eef8f2]/80 rounded-[16px] border border-slate-100 shadow-sm">
                        <label className="block text-[13px] font-bold text-slate-800 mb-2">
                          {form.variety_id === 'CRIOLLO_LOCAL'
                            ? <>¿Cómo se llama tu variedad criolla? <span className="text-slate-400 font-medium ml-1">(opcional)</span></>
                            : '¿Cuál es el nombre de la variedad?'}
                        </label>
                        <input type="text"
                          value={form.variety_other}
                          onChange={e => setForm(f => ({...f, variety_other: e.target.value}))}
                          placeholder={
                            form.variety_id === 'CRIOLLO_LOCAL'
                              ? 'Ej: Olotillo, Pepitilla, Bolita...'
                              : 'Escribe el nombre de la variedad'
                          }
                          className={inputCls}
                        />
                        {form.variety_id !== 'CRIOLLO_LOCAL' && (
                          <p className="text-[11px] text-slate-400 mt-1">Este campo es obligatorio para continuar.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PASO 3 — Superficie + rendimiento */}
            {paso === 3 && (
              <div className="space-y-4 relative z-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center sm:text-left mb-1">
                  <div className="w-10 h-10 bg-blue-50 rounded-[14px] flex items-center justify-center text-blue-600 mb-3 mx-auto sm:mx-0 shadow-sm border border-blue-100/50">
                    <MapPin size={18} strokeWidth={2} />
                  </div>
                  <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight mb-1">
                    Superficie y cálculo
                  </h2>
                  <p className="text-[13px] text-slate-500 font-medium">Estima las dimensiones de tu siembra actual.</p>
                </div>

                {areaHaCalc && (
                  <div className="bg-blue-50/50 border border-blue-100 rounded-[12px] p-3 flex gap-2.5 shadow-sm items-start">
                    <Ruler size={16} className="text-blue-600 shrink-0" />
                    <p className="text-[11.5px] text-blue-900 font-medium leading-relaxed">
                      Tu predio registrado mide <strong className="font-bold">{areaHaCalc} hectáreas</strong>. 
                      La siembra debe ser igual o menor a esta cantidad.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="p-3.5 bg-[#eef8f2]/80 border border-slate-100 rounded-[14px] shadow-sm">
                    <label className="block text-[13px] font-bold text-slate-800 mb-2 text-center sm:text-left">
                      ¿Hectáreas a sembrar este ciclo?
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0.1" step="0.1" max={areaMaxima ?? 9999}
                        value={form.area_sown_ha}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          const max = areaMaxima ?? null;
                          if (e.target.value !== '' && max && val > max) {
                            setErrorSuperficie(`La superficie sembrada (${val} ha) no puede ser mayor al área de tu parcela (${max} ha).`);
                          } else if (e.target.value !== '' && val <= 0) {
                            setErrorSuperficie('La superficie debe ser mayor a 0.');
                          } else {
                            setErrorSuperficie(null);
                          }
                          setForm(f => ({...f, area_sown_ha: e.target.value}));
                        }}
                        placeholder={areaMaxima ? String(areaMaxima) : 'Ej: 5.5'}
                        className={`${inputCls} text-[18px] font-black text-center flex-1 py-2.5 shadow-inner ${errorSuperficie ? 'border-red-400 ring-1 ring-red-300 bg-red-50' : ''}`}
                      />
                      <span className="text-slate-400 font-bold text-[13px] px-2">ha</span>
                    </div>
                    {errorSuperficie && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2.5 mt-2">
                        <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-red-700 text-[12px] font-medium">{errorSuperficie}</p>
                      </div>
                    )}
                    {areaMaxima && (
                      <p className={`text-[11.5px] mt-1.5 text-center font-medium ${errorSuperficie ? 'text-red-500' : 'text-slate-400'}`}>
                        Área máxima: {areaMaxima} ha{coincideAreaUp === false && areaHaReal ? ' (área declarada)' : ''}
                      </p>
                    )}
                    {areaMaxima && !form.area_sown_ha && (
                      <button onClick={() => setForm(f => ({...f, area_sown_ha: String(areaMaxima)}))}
                        className="mt-2.5 w-full text-blue-700 text-[12.5px] font-bold border border-blue-200 bg-white py-2 rounded-full hover:bg-blue-50 hover:border-blue-300 transition-all shadow-sm active:scale-95">
                        Usar el total ({areaMaxima} ha)
                      </button>
                    )}
                  </div>

                  <div className="p-3.5 bg-[#eef8f2]/80 border border-slate-100 rounded-[14px] shadow-sm">
                    <label className="block text-[13px] font-bold text-slate-800 mb-0.5 text-center sm:text-left">
                      Rendimiento esperado
                    </label>
                    <p className="text-[11.5px] text-slate-500 mb-2.5 font-medium text-center sm:text-left">Por hectárea (ton/ha)</p>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0.1" max="30" step="0.1"
                        value={form.yield_expected}
                        onChange={e => setForm(f => ({...f, yield_expected: e.target.value}))}
                        placeholder="Ej: 8"
                        className={`${inputCls} text-[18px] font-black text-center flex-1 py-2.5 shadow-inner`}
                      />
                      <span className="text-slate-400 font-bold text-[14px] px-2 leading-tight">ton<br/><span className="text-[11px]">/ ha</span></span>
                    </div>
                  </div>
                </div>

                {form.area_sown_ha && form.yield_expected && (
                  <div className="bg-gradient-to-br from-[#1A5C38] to-[#124227] rounded-[20px] p-5 text-center shadow-[0_6px_20px_rgba(26,92,56,0.3)] animate-in fade-in slide-in-from-bottom-4 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                    <p className="text-[11px] text-emerald-200 font-bold uppercase tracking-widest relative z-10">Estimación Total</p>
                    <p className="text-[32px] font-black text-white mt-1 leading-none tracking-tight relative z-10">
                      {(Number(form.area_sown_ha) * Number(form.yield_expected)).toFixed(1)} <span className="text-lg text-emerald-200 font-bold tracking-normal">ton</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* PASO 4 — Fechas + destino */}
            {paso === 4 && (
              <div className="space-y-4 relative z-10 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center sm:text-left mb-1">
                  <div className="w-10 h-10 bg-indigo-50 rounded-[14px] flex items-center justify-center text-indigo-500 mb-3 mx-auto sm:mx-0 shadow-sm border border-indigo-100/50">
                    <Clock size={18} strokeWidth={2} />
                  </div>
                  <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-tight mb-1">
                    Fechas y destino
                  </h2>
                  <p className="text-[13px] text-slate-500 font-medium">Confirma los tiempos de tu cosecha.</p>
                </div>

                <div className="space-y-3">
                  <div className="bg-[#eef8f2]/80 rounded-[14px] p-3.5 border border-slate-100 shadow-sm">
                    <label className="text-[13px] font-bold text-slate-800 mb-2 flex items-center gap-2">
                      <Clock size={14} className="text-slate-400"/> ¿Cuándo esperas cosechar? <span className="text-slate-400 font-medium ml-1 text-[11px]">(opcional)</span>
                    </label>
                    <input type="date" value={form.estimated_harvest_date}
                      onChange={e => setForm(f => ({...f, estimated_harvest_date: e.target.value}))}
                      className={`${inputCls} font-bold text-[14px] text-slate-700 py-2.5`}
                    />
                  </div>

                  <div className="pt-2">
                    <label className="block text-[13px] font-bold text-slate-800 mb-2 text-center sm:text-left">
                      ¿Destino principal de la cosecha? <span className="text-slate-400 font-medium ml-1 text-[11px]">(opcional)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {DESTINOS.map((d: any) => (
                        <button key={d.valor}
                          onClick={() => setForm(f => ({...f, destination: f.destination === d.valor ? '' : d.valor}))}
                          className={`rounded-[14px] p-3 border-2 text-left transition-all active:scale-95 flex flex-col gap-2 items-center text-center
                            ${form.destination === d.valor
                              ? 'border-[#1A5C38] bg-[#1A5C38]/5 shadow-sm'
                              : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-[#eef8f2]'}`}>
                          <d.icon size={18} className={form.destination === d.valor ? 'text-[#1A5C38]' : 'text-slate-400'} strokeWidth={2} />
                          <span className={`text-[12px] font-black tracking-tight ${form.destination === d.valor ? 'text-[#1A5C38]' : 'text-slate-600'}`}>
                            {d.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      {/* Footer Fixed Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl border-t border-slate-200/50 pb-safe shadow-[0_-8px_20px_rgba(0,0,0,0.04)]">
        <div className="w-full max-w-xl mx-auto px-4 sm:px-6 py-3">
          <div className="w-full space-y-2">
            {paso === 1 && (
              <button onClick={() => { setError(''); setPaso(2); }}
                disabled={!form.cycle_type || !form.planting_date || !cicloConfirmado}
                className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3 rounded-full text-[15px] font-bold disabled:opacity-40 disabled:scale-100 transition-all active:scale-[0.98] shadow-[0_6px_15px_rgba(26,92,56,0.2)]">
                Continuar
              </button>
            )}
            {paso === 2 && (() => {
              const puedeAvanzarPaso2 = () => {
                if (!form.variety_id) return false;
                if (
                  (form.variety_id === 'OTRA' ||
                   form.variety_id === 'OTRA_AMARILLO' ||
                   form.variety_id === 'OTRA_CRIOLLO') &&
                  !form.variety_other.trim()
                ) return false;
                return true;
              };
              return (
                <button onClick={() => { setError(''); setPaso(3); }}
                  disabled={!puedeAvanzarPaso2()}
                  className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3 rounded-full text-[15px] font-bold disabled:opacity-40 disabled:scale-100 transition-all active:scale-[0.98] shadow-[0_6px_15px_rgba(26,92,56,0.2)]">
                  Continuar
                </button>
              );
            })()}
            {paso === 3 && (
              <button onClick={() => { setError(''); setPaso(4); }}
                disabled={!form.area_sown_ha || Number(form.area_sown_ha) <= 0 || !!errorSuperficie}
                className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3 rounded-full text-[15px] font-bold disabled:opacity-40 disabled:scale-100 transition-all active:scale-[0.98] shadow-[0_6px_15px_rgba(26,92,56,0.2)]">
                Continuar
              </button>
            )}
            {paso === 4 && (
              <button onClick={guardar}
                disabled={loading}
                className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3 rounded-full text-[15px] font-bold disabled:opacity-40 disabled:scale-100 transition-all active:scale-[0.98] shadow-[0_6px_15px_rgba(26,92,56,0.2)] flex items-center justify-center gap-2">
                {loading ? <><div className="w-4 h-4 border-[3px] border-white/30 border-t-white rounded-full animate-spin" /> Guardando...</> : <><Check size={16} /> Finalizar y guardar</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
