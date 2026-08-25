import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Edit2, MapPin, LogOut, CalendarCheck, ChevronRight,
  Sprout, Trash2, Plus, Phone, Mail, Check, X, Leaf,
  ClipboardList, Award, CircleDot, Bell, Pencil, FileDown,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import ProfileHero from '../../components/ProfileHero';
import { descargarAcuseRegistro } from '../../utils/descargarAcuse';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const PROGRAMAS_GOBIERNO = [
  { clave: 'fertilizantes_bienestar', nombre: 'Fertilizantes para el Bienestar' },
  { clave: 'produccion_bienestar',    nombre: 'Producción para el Bienestar' },
  { clave: 'precios_garantia',        nombre: 'Precios de Garantía' },
  { clave: 'maiz_blanco_precio_justo',nombre: 'Maíz Blanco / Precio Justo' },
  { clave: 'maiz_es_raiz',            nombre: 'Plan El Maíz es la Raíz' },
  { clave: 'cosechando_soberania',    nombre: 'Cosechando Soberanía' },
  { clave: 'sembrando_vida',          nombre: 'Sembrando Vida' },
];

interface Perfil {
  curp: string; nombres: string; apellido_paterno: string; apellido_materno: string;
  telefono: string; correo: string | null; estado_validacion: string; tipo_registro: string;
  programas_beneficiario: string[];
  state_name: string; municipality_name: string;
  location_confirmed: boolean; centroid_source: string;
  lat: number; lng: number;
  area_ha_calc: number | null; area_ha_real: number | null;
}
interface CropInfo {
  cycle_crop_id: number; crop: string;
  variety_id: string | null; variety_other: string | null;
  area_sown_ha: number | null; yield_expected: number | null;
  planting_date: string | null; estimated_harvest_date: string | null;
  destination: string | null;
}
interface Ciclo { cycle_id: number; cycle_year: number; cycle_type: string; crops: CropInfo[]; up_name?: string; }

export default function MiPerfilPage() {
  const navigate   = useNavigate();
  const { logout } = useAuthStore();

  const [perfil, setPerfil]         = useState<Perfil | null>(null);
  const [loading, setLoading]       = useState(true);
  const [editTel, setEditTel]       = useState(false);
  const [telefono, setTelefono]     = useState('');
  const [editCorreo, setEditCorreo] = useState(false);
  const [correo, setCorreo]         = useState('');
  const [editProg, setEditProg]     = useState(false);
  const [programas, setProgramas]   = useState<string[]>([]);
  const [ciclos, setCiclos]         = useState<Ciclo[] | null>(null);
  const [parcelas, setParcelas]     = useState<any[]>([]);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState<number | null>(null);
  const [delError, setDelError]     = useState('');
  const [savedTel, setSavedTel]     = useState(false);
  const [savedCorreo, setSavedCorreo] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [descargandoAcuse, setDescargandoAcuse] = useState(false);

  async function handleDescargarAcuse() {
    setDescargandoAcuse(true);
    try {
      await descargarAcuseRegistro();
    } catch {
      alert('No se pudo generar el acuse de registro. Intenta de nuevo.');
    } finally {
      setDescargandoAcuse(false);
    }
  }

  // Edición de ubicación (estado/municipio)
  const [editandoUbicacion, setEditandoUbicacion]           = useState(false);
  const [estadoEditable, setEstadoEditable]                 = useState('');
  const [estadoIdEditable, setEstadoIdEditable]             = useState('');
  const [municipioEditable, setMunicipioEditable]           = useState('');
  const [municipiosDisponibles, setMunicipiosDisponibles]   = useState<{municipality_id: string, name: string}[]>([]);
  const [guardandoUbicacion, setGuardandoUbicacion]         = useState(false);
  const [errorUbicacion, setErrorUbicacion]                 = useState<string | null>(null);
  const [exitoUbicacion, setExitoUbicacion]                 = useState(false);
  const [estados, setEstados]                               = useState<{state_id: string, name: string}[]>([]);

  const eliminarParcela = async (upId: number) => {
    setEliminando(upId); setDelError('');
    try {
      const token = localStorage.getItem('simac_token');
      const r = await fetch(`${BASE}/mis-ups/${upId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setDelError(d.error || 'No se pudo eliminar.'); setConfirmDel(null); return; }
      setParcelas(prev => prev.filter(p => p.up_id !== upId));
      setConfirmDel(null);
    } catch { setDelError('Error de conexión.'); setConfirmDel(null); }
    finally { setEliminando(null); }
  };

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/productor/perfil`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setPerfil(d); setTelefono(d.telefono || ''); setCorreo(d.correo || ''); setProgramas(d.programas_beneficiario || []); })
      .finally(() => setLoading(false));

    fetch(`${BASE}/mis-ups`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(async d => {
        const ups = d.ups ?? (Array.isArray(d) ? d : []);
        setParcelas(ups);
        if (!ups.length) { setCiclos([]); return; }
        // Cargar ciclos de TODAS las parcelas en paralelo
        const resultados = await Promise.all(
          ups.map((up: any) =>
            fetch(`${BASE}/ups/${up.up_id}/cycles`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.json())
              .then(d => (d.cycles ?? []).map((c: any) => ({ ...c, up_name: up.up_name || 'Parcela' })))
              .catch(() => [])
          )
        );
        const todosCiclos = resultados.flat().sort((a, b) => b.cycle_year - a.cycle_year || b.cycle_id - a.cycle_id);
        setCiclos(todosCiclos);
      }).catch(() => setCiclos([]));

    fetch(`${BASE}/alertas/notificaciones/mis`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setNotifCount((d.notificaciones || d || []).filter((n: any) => !n.leida).length))
      .catch(() => {});
  }, []);

  const guardarTelefono = async () => {
    const token = localStorage.getItem('simac_token');
    await fetch(`${BASE}/productor/perfil`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ telefono }) });
    setEditTel(false); setPerfil(prev => prev ? { ...prev, telefono } : prev);
    setSavedTel(true); setTimeout(() => setSavedTel(false), 2000);
  };

  const guardarCorreo = async () => {
    const token = localStorage.getItem('simac_token');
    await fetch(`${BASE}/productor/perfil`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ correo: correo || null }) });
    setEditCorreo(false); setPerfil(prev => prev ? { ...prev, correo } : prev);
    setSavedCorreo(true); setTimeout(() => setSavedCorreo(false), 2000);
  };

  const guardarProgramas = async () => {
    const token = localStorage.getItem('simac_token');
    await fetch(`${BASE}/productor/perfil`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ programas_beneficiario: programas }) });
    setEditProg(false); setPerfil(prev => prev ? { ...prev, programas_beneficiario: programas } : prev);
  };

  const togglePrograma = (clave: string) =>
    setProgramas(prev => prev.includes(clave) ? prev.filter(p => p !== clave) : [...prev, clave]);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/auth/states`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setEstados(d.states ?? d ?? []))
      .catch(() => {});
  }, []);

  const handleEstadoChange = async (stateId: string, stateName: string) => {
    setEstadoIdEditable(stateId);
    setEstadoEditable(stateName);
    setMunicipioEditable('');
    setMunicipiosDisponibles([]);
    if (!stateId) return;
    const token = localStorage.getItem('simac_token');
    try {
      const res = await fetch(`${BASE}/auth/municipalities?state_id=${stateId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setMunicipiosDisponibles(data.municipalities ?? data ?? []);
    } catch { /* ignorar */ }
  };

  const handleGuardarUbicacion = async () => {
    if (!estadoEditable || !municipioEditable) return;
    setGuardandoUbicacion(true);
    setErrorUbicacion(null);
    setExitoUbicacion(false);
    const token = localStorage.getItem('simac_token');
    try {
      const res = await fetch(`${BASE}/productor/perfil/ubicacion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state_name: estadoEditable, municipality_name: municipioEditable }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorUbicacion(data.error || 'No se pudo actualizar la ubicación'); return; }
      setPerfil(prev => prev ? { ...prev, state_name: estadoEditable, municipality_name: municipioEditable } : prev);
      setExitoUbicacion(true);
      setTimeout(() => { setEditandoUbicacion(false); setExitoUbicacion(false); }, 1500);
    } catch { setErrorUbicacion('Error de conexión. Intenta de nuevo.'); }
    finally { setGuardandoUbicacion(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#eef8f2] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-[3px] border-[#1A5C38]/20 border-t-[#1A5C38] animate-spin" />
    </div>
  );
  if (!perfil) return null;

  const nombreCompleto = [perfil.nombres, perfil.apellido_paterno, perfil.apellido_materno].filter(Boolean).join(' ');
  const initials = [perfil.nombres, perfil.apellido_paterno].filter(Boolean).map(w => w[0]).join('').toUpperCase() || 'P';
  const estadoColor = perfil.estado_validacion === 'activo'
    ? 'bg-emerald-400/90 text-emerald-950'
    : perfil.estado_validacion === 'pendiente'
    ? 'bg-amber-300/90 text-amber-950'
    : 'bg-red-400/90 text-red-950';

  const delay = (i: number) => ({ animation: `pfFadeUp .4s ${i * 55}ms ease both` });

  return (
    <div className="bg-[#eef8f2] min-h-screen pb-28">
      <style>{`
        @keyframes pfFadeUp { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pfPop    { from { opacity:0; transform:scale(0.92) }       to { opacity:1; transform:scale(1) }    }
      `}</style>

      <ProfileHero
        variant="productor"
        titulo="Mi Perfil"
        nombre={nombreCompleto || 'Productor'}
        initials={initials}
        badges={
          <>
            <span className="text-[11px] font-bold text-white/90 bg-white/15 rounded-full px-3 py-1">
              Tipo {perfil.tipo_registro}
            </span>
            <span className={`text-[11px] font-bold rounded-full px-3 py-1 ${estadoColor}`}>
              {perfil.estado_validacion.charAt(0).toUpperCase() + perfil.estado_validacion.slice(1)}
            </span>
          </>
        }
      />

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-3">

        {/* ── CURP pill ── */}
        <div style={delay(0)} className="bg-white rounded-2xl px-5 py-3.5 shadow-sm ring-1 ring-black/[0.04] flex items-center justify-between">
          <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-widest">CURP</span>
          <span className="font-mono text-[13px] text-slate-700 tracking-wider">{perfil.curp || '—'}</span>
        </div>

        {/* ── Contacto ── */}
        <div style={delay(1)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-5 pt-4 pb-0">Contacto</p>

          {/* Teléfono */}
          <div className="px-5 pt-3 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Phone size={15} className="text-[#1A5C38]" />
                <span className="text-[13px] text-slate-500 font-medium">Teléfono</span>
              </div>
              {!editTel && (
                <div className="flex items-center gap-2">
                  {savedTel && <span className="text-[11px] text-emerald-600 font-bold">Guardado ✓</span>}
                  <span className="text-[14px] font-semibold text-slate-800">{perfil.telefono || <span className="text-slate-300 font-normal text-[13px]">sin teléfono</span>}</span>
                  <button onClick={() => setEditTel(true)} className="w-7 h-7 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-transform">
                    <Edit2 size={13} className="text-[#1A5C38]" />
                  </button>
                </div>
              )}
            </div>
            {editTel && (
              <div className="mt-2.5 flex gap-2" style={{ animation: 'pfPop .25s ease both' }}>
                <input type="tel" inputMode="numeric" autoFocus value={telefono} maxLength={10}
                  onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 bg-[#f4fbf7] border-2 border-[#1A5C38]/20 focus:border-[#1A5C38] rounded-xl px-3 py-2.5 text-[15px] outline-none transition-colors" />
                <button onClick={guardarTelefono} disabled={telefono.length < 10}
                  className="w-11 h-11 rounded-xl bg-[#1A5C38] flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shadow-sm shadow-[#1A5C38]/20">
                  <Check size={16} className="text-white" />
                </button>
                <button onClick={() => { setEditTel(false); setTelefono(perfil.telefono || ''); }}
                  className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center active:scale-95 transition-transform">
                  <X size={15} className="text-slate-400" />
                </button>
              </div>
            )}
          </div>

          <div className="h-px bg-slate-50 mx-5" />

          {/* Correo */}
          <div className="px-5 pt-3 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mail size={15} className="text-[#1A5C38]" />
                <span className="text-[13px] text-slate-500 font-medium">Correo</span>
              </div>
              {!editCorreo && (
                <div className="flex items-center gap-2">
                  {savedCorreo && <span className="text-[11px] text-emerald-600 font-bold">Guardado ✓</span>}
                  <span className="text-[13px] font-medium text-slate-700 truncate max-w-[170px]">
                    {perfil.correo || <span className="text-slate-300 font-normal">sin correo</span>}
                  </span>
                  <button onClick={() => setEditCorreo(true)} className="w-7 h-7 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-transform">
                    <Edit2 size={13} className="text-[#1A5C38]" />
                  </button>
                </div>
              )}
            </div>
            {editCorreo && (
              <div className="mt-2.5 flex gap-2" style={{ animation: 'pfPop .25s ease both' }}>
                <input type="email" inputMode="email" autoFocus autoCapitalize="off" autoCorrect="off"
                  value={correo} onChange={e => setCorreo(e.target.value)}
                  className="flex-1 bg-[#f4fbf7] border-2 border-[#1A5C38]/20 focus:border-[#1A5C38] rounded-xl px-3 py-2.5 text-[14px] outline-none transition-colors"
                  placeholder="tu@correo.com" />
                <button onClick={guardarCorreo}
                  className="w-11 h-11 rounded-xl bg-[#1A5C38] flex items-center justify-center active:scale-95 transition-all shadow-sm shadow-[#1A5C38]/20">
                  <Check size={16} className="text-white" />
                </button>
                <button onClick={() => { setEditCorreo(false); setCorreo(perfil.correo || ''); }}
                  className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center active:scale-95 transition-transform">
                  <X size={15} className="text-slate-400" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Ubicación ── */}
        <div style={delay(2)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-[#1A5C38]" />
              <p className="text-[13px] font-bold text-slate-700">Ubicación</p>
            </div>
            {!editandoUbicacion && (
              <button
                type="button"
                onClick={() => {
                  setEditandoUbicacion(true);
                  setErrorUbicacion(null);
                  setEstadoEditable(perfil.state_name ?? '');
                  setEstadoIdEditable('');
                  setMunicipioEditable(perfil.municipality_name ?? '');
                  setMunicipiosDisponibles([]);
                }}
                className="w-7 h-7 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-transform">
                <Pencil size={13} className="text-[#1A5C38]" />
              </button>
            )}
          </div>

          <div className="px-5 pb-4">
            {!editandoUbicacion ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-[10px] px-3 py-2.5">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Estado</p>
                  <p className="text-[13px] font-bold text-slate-700 mt-0.5">{perfil.state_name || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-[10px] px-3 py-2.5">
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Municipio</p>
                  <p className="text-[13px] font-bold text-slate-700 mt-0.5">{perfil.municipality_name || '—'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3" style={{ animation: 'pfPop .25s ease both' }}>
                <div>
                  <label className="text-[12px] font-bold text-slate-500 mb-1 block">Estado *</label>
                  <select
                    value={estadoIdEditable}
                    onChange={e => {
                      const sel = estados.find(s => s.state_id === e.target.value);
                      if (sel) handleEstadoChange(sel.state_id, sel.name);
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-700 bg-white focus:outline-none focus:border-[#1A5C38] transition-colors">
                    <option value="">Selecciona tu estado</option>
                    {estados.map(e => (
                      <option key={e.state_id} value={e.state_id}>{e.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[12px] font-bold text-slate-500 mb-1 block">Municipio *</label>
                  <select
                    value={municipioEditable}
                    onChange={e => setMunicipioEditable(e.target.value)}
                    disabled={!estadoIdEditable || municipiosDisponibles.length === 0}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-700 bg-white focus:outline-none focus:border-[#1A5C38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    <option value="">
                      {estadoIdEditable
                        ? municipiosDisponibles.length === 0 ? 'Cargando municipios…' : 'Selecciona tu municipio'
                        : 'Primero selecciona el estado'}
                    </option>
                    {municipiosDisponibles.map(m => (
                      <option key={m.municipality_id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Esta información corresponde a tu municipio de residencia. La ubicación de tus parcelas se gestiona desde el módulo de Unidades Productivas.
                  </p>
                </div>

                {errorUbicacion && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                    <p className="text-red-600 text-[12px] font-medium">{errorUbicacion}</p>
                  </div>
                )}
                {exitoUbicacion && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <p className="text-emerald-700 text-[12px] font-bold">✓ Ubicación actualizada correctamente</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditandoUbicacion(false); setErrorUbicacion(null); setMunicipiosDisponibles([]); }}
                    disabled={guardandoUbicacion}
                    className="flex-1 border border-slate-200 text-slate-600 font-medium text-[13px] py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-40">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleGuardarUbicacion}
                    disabled={!estadoEditable || !municipioEditable || guardandoUbicacion || exitoUbicacion}
                    className="flex-1 bg-[#1A5C38] text-white font-bold text-[13px] py-2.5 rounded-xl active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-[#1A5C38]/20">
                    {guardandoUbicacion ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Mis parcelas — lista compacta sin mapas ── */}
        <div style={delay(2)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <Leaf size={15} className="text-[#1A5C38]" />
              <p className="text-[13px] font-bold text-slate-700">
                Mis parcelas
                {parcelas.length > 0 && <span className="ml-1.5 text-[11px] text-slate-400 font-normal">({parcelas.length})</span>}
              </p>
            </div>
            <button onClick={() => navigate('/productor/ups/nueva')}
              className="flex items-center gap-1 text-[#1A5C38] text-[12px] font-bold active:opacity-60 transition-opacity">
              <Plus size={13} /> Agregar
            </button>
          </div>

          {delError && (
            <div className="mx-4 mb-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <p className="text-[12px] text-red-600">{delError}</p>
            </div>
          )}

          {parcelas.length === 0 ? (
            <button onClick={() => navigate('/productor/ups/nueva')}
              className="w-full flex flex-col items-center py-6 gap-2 text-center px-5 active:opacity-80 transition-opacity">
              <div className="w-11 h-11 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
                <Sprout size={18} className="text-[#1A5C38]/40" />
              </div>
              <p className="text-[13px] font-semibold text-slate-500">Registra tu primera parcela</p>
              <p className="text-[11.5px] text-slate-400">Toca para agregar</p>
            </button>
          ) : (
            <div className="divide-y divide-slate-50">
              {parcelas.map((p: any) => (
                <div key={p.up_id} className="px-4 py-3.5">
                  {confirmDel === p.up_id ? (
                    <div className="flex items-center justify-between gap-3 bg-red-50 rounded-2xl px-3.5 py-3">
                      <span className="text-[12.5px] font-semibold text-red-700 flex-1">¿Eliminar "{p.up_name || 'parcela'}"?</span>
                      <button onClick={() => setConfirmDel(null)} disabled={eliminando === p.up_id}
                        className="px-3 py-1.5 rounded-xl text-[12px] font-bold text-slate-600 bg-white ring-1 ring-slate-200 active:scale-95 transition-transform">
                        Cancelar
                      </button>
                      <button onClick={() => eliminarParcela(p.up_id)} disabled={eliminando === p.up_id}
                        className="px-3 py-1.5 rounded-xl text-[12px] font-bold text-white bg-red-500 active:scale-95 transition-all disabled:opacity-60">
                        {eliminando === p.up_id ? '…' : 'Sí'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                        <Sprout size={16} className="text-[#1A5C38]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-slate-800 truncate">{p.up_name || 'Parcela'}</p>
                        <p className="text-[11.5px] text-slate-400 truncate mt-0.5">
                          {[p.municipality_name, p.state_name].filter(Boolean).join(', ') || 'Sin ubicación'}
                          {p.area_ha_calc != null && ` · ${Number(p.area_ha_calc).toLocaleString('es-MX', { maximumFractionDigits: 1 })} ha`}
                        </p>
                      </div>
                      <button onClick={() => navigate(`/productor/ubicacion?up_id=${p.up_id}`)}
                        className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-transform flex-shrink-0">
                        <MapPin size={14} className="text-[#1A5C38]" />
                      </button>
                      <button onClick={() => { setConfirmDel(p.up_id); setDelError(''); }}
                        className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0">
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Ciclo productivo — cards con scroll ── */}
        <div style={delay(3)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CalendarCheck size={15} className="text-[#1A5C38]" />
              <p className="text-[13px] font-bold text-slate-700">
                Ciclos productivos
                {ciclos && ciclos.length > 0 && (
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">({ciclos.length})</span>
                )}
              </p>
            </div>
            <button onClick={() => navigate('/productor/ciclo')}
              className="flex items-center gap-1 text-[#1A5C38] text-[12px] font-bold active:opacity-60 transition-opacity">
              <Plus size={13} /> Agregar
            </button>
          </div>

          {ciclos === null ? (
            <div className="px-5 pb-5 flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-[#1A5C38]/20 border-t-[#1A5C38] animate-spin" />
              <span className="text-[13px] text-slate-400">Cargando ciclos…</span>
            </div>
          ) : ciclos.length === 0 ? (
            <button onClick={() => navigate('/productor/ciclo')}
              className="w-full flex flex-col items-center py-6 gap-2 text-center px-5 active:opacity-80 transition-opacity">
              <div className="w-11 h-11 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
                <CalendarCheck size={18} className="text-[#1A5C38]/40" />
              </div>
              <p className="text-[13px] font-semibold text-slate-500">Sin ciclos registrados</p>
              <p className="text-[11.5px] text-slate-400">Toca para agregar tu primer ciclo</p>
            </button>
          ) : (
            <div className="overflow-x-auto pb-4 px-4" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
              <div className="flex gap-3" style={{ width: 'max-content' }}>
                {ciclos.map((c, i) => {
                  const cropPrincipal = c.crops?.[0];
                  // Etiquetas legibles sin guiones ni código
                  const typeLabel = c.cycle_type === 'PV' ? 'Primavera-Verano'
                    : c.cycle_type === 'OI' ? 'Otoño-Invierno'
                    : c.cycle_type === 'AN' ? 'Anual'
                    : c.cycle_type || 'Ciclo';
                  const typeColor = c.cycle_type === 'PV'
                    ? { bg: '#e6f7ee', text: '#166534' }
                    : c.cycle_type === 'OI'
                    ? { bg: '#dbeafe', text: '#1e40af' }
                    : { bg: '#fef3c7', text: '#92400e' };
                  // Capitalizar texto de BD (maiz_blanco → Maíz Blanco)
                  const capitalize = (s: string) =>
                    s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  const destLabel = (s: string) =>
                    s === 'autoconsumo' ? 'Autoconsumo'
                    : s === 'venta' ? 'Venta'
                    : s === 'semilla' ? 'Semilla'
                    : capitalize(s);
                  return (
                    <button key={c.cycle_id} onClick={() => navigate('/productor/ciclo')}
                      style={{ animation: `pfFadeUp .35s ${i * 60}ms ease both`, border: '1.5px solid #d1e8da', boxShadow: '0 2px 8px rgba(26,92,56,0.08)' }}
                      className="flex-shrink-0 w-56 bg-white rounded-2xl p-4 text-left active:scale-[0.97] transition-all group/card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full leading-none"
                          style={{ background: typeColor.bg, color: typeColor.text }}>
                          {typeLabel}
                        </span>
                        <span className="text-[15px] font-black text-slate-700">{c.cycle_year}</span>
                      </div>
                      {c.up_name && parcelas.length > 1 && (
                        <p className="text-[10px] text-slate-400 font-semibold truncate mb-2 flex items-center gap-1">
                          <Sprout size={9} className="text-[#1A5C38]/50 flex-shrink-0" />{c.up_name}
                        </p>
                      )}
                      {cropPrincipal ? (
                        <>
                          <p className="text-[15px] font-bold text-slate-800 leading-tight">
                            {capitalize(cropPrincipal.crop || 'Cultivo')}
                          </p>
                          {cropPrincipal.variety_other && (
                            <p className="text-[12px] text-slate-400 mt-0.5 truncate">{cropPrincipal.variety_other}</p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {cropPrincipal.area_sown_ha != null && (
                              <span className="text-[12px] font-semibold bg-[#eef8f2] text-[#1A5C38] px-2.5 py-1 rounded-xl">
                                {cropPrincipal.area_sown_ha} ha
                              </span>
                            )}
                            {cropPrincipal.yield_expected != null && (
                              <span className="text-[12px] font-semibold bg-slate-50 text-slate-500 px-2.5 py-1 rounded-xl">
                                {cropPrincipal.yield_expected} ton/ha
                              </span>
                            )}
                            {cropPrincipal.destination && (
                              <span className="text-[12px] font-semibold bg-slate-50 text-slate-500 px-2.5 py-1 rounded-xl">
                                {destLabel(cropPrincipal.destination)}
                              </span>
                            )}
                          </div>
                          {c.crops.length > 1 && (
                            <p className="text-[11px] text-slate-400 mt-2">+{c.crops.length - 1} cultivo{c.crops.length > 2 ? 's' : ''} más</p>
                          )}
                        </>
                      ) : (
                        <p className="text-[13px] text-slate-400 mt-1">Sin cultivos registrados</p>
                      )}
                      <div className="mt-3 flex items-center gap-1 text-[#1A5C38]/60 group-active/card:text-[#1A5C38] transition-colors">
                        <span className="text-[11px] font-bold">Ver detalle</span>
                        <ChevronRight size={11} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Programas de apoyo ── */}
        <div style={delay(4)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Award size={15} className="text-[#1A5C38]" />
              <p className="text-[13px] font-bold text-slate-700">Programas de apoyo</p>
            </div>
            <button onClick={() => setEditProg(!editProg)} className="w-7 h-7 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-transform">
              {editProg ? <X size={14} className="text-slate-400" /> : <Edit2 size={13} className="text-[#1A5C38]" />}
            </button>
          </div>

          <div className="px-5 pb-4">
            {editProg ? (
              <div className="space-y-1.5" style={{ animation: 'pfPop .25s ease both' }}>
                {PROGRAMAS_GOBIERNO.map(p => (
                  <button key={p.clave} onClick={() => togglePrograma(p.clave)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl ring-1 text-[13px] transition-all duration-200 flex items-center gap-2.5
                      ${programas.includes(p.clave) ? 'ring-[#1A5C38]/40 bg-[#eef8f2] text-[#1A5C38] font-semibold' : 'ring-slate-100 text-slate-600 hover:bg-slate-50'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${programas.includes(p.clave) ? 'border-[#1A5C38] bg-[#1A5C38]' : 'border-slate-300'}`}>
                      {programas.includes(p.clave) && <Check size={9} className="text-white" strokeWidth={3} />}
                    </div>
                    {p.nombre}
                  </button>
                ))}
                <button onClick={guardarProgramas}
                  className="w-full mt-2 bg-[#1A5C38] text-white py-3 rounded-xl text-[13px] font-bold active:scale-[0.98] transition-all shadow-sm shadow-[#1A5C38]/20">
                  Guardar cambios
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(perfil.programas_beneficiario || []).length === 0 ? (
                  <p className="text-[13px] text-slate-400">Ninguno seleccionado</p>
                ) : (
                  (perfil.programas_beneficiario || []).map(clave => {
                    const prog = PROGRAMAS_GOBIERNO.find(p => p.clave === clave);
                    return (
                      <span key={clave} className="inline-flex items-center gap-1.5 bg-[#eef8f2] text-[#1A5C38] text-[11.5px] font-semibold px-2.5 py-1 rounded-full">
                        <CircleDot size={10} />
                        {prog?.nombre || clave}
                      </span>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Accesos rápidos ── */}
        <div style={delay(5)} className="space-y-2">

          {/* Mis solicitudes */}
          <button onClick={() => navigate('/productor/mis-solicitudes')}
            className="w-full bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] px-5 py-4 flex items-center gap-3.5 text-left active:scale-[0.98] transition-all group">
            <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0 group-active:bg-[#d9f0e5] transition-colors">
              <ClipboardList size={17} className="text-[#1A5C38]" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-slate-800">Mis solicitudes de apoyo</p>
              <p className="text-[12px] text-slate-400 mt-0.5">Ver estado de solicitudes a ventanillas</p>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-active:text-[#1A5C38] transition-colors flex-shrink-0" />
          </button>

          {/* Alertas */}
          <button onClick={() => navigate('/productor/alertas')}
            className="w-full bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] px-5 py-4 flex items-center gap-3.5 text-left active:scale-[0.98] transition-all group">
            <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0 group-active:bg-[#d9f0e5] transition-colors relative">
              <Bell size={17} className="text-[#1A5C38]" />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-slate-800">Alertas</p>
              <p className="text-[12px] text-slate-400 mt-0.5">
                {notifCount > 0 ? `${notifCount} sin leer` : 'Sin alertas pendientes'}
              </p>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-active:text-[#1A5C38] transition-colors flex-shrink-0" />
          </button>

          {/* Acuse de registro */}
          <button onClick={handleDescargarAcuse} disabled={descargandoAcuse}
            className="w-full bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] px-5 py-4 flex items-center gap-3.5 text-left active:scale-[0.98] transition-all group disabled:opacity-60">
            <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0 group-active:bg-[#d9f0e5] transition-colors">
              <FileDown size={17} className="text-[#1A5C38]" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-slate-800">Acuse de registro</p>
              <p className="text-[12px] text-slate-400 mt-0.5">
                {descargandoAcuse ? 'Generando PDF…' : 'Descargar comprobante de tu registro en SIMAC'}
              </p>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-active:text-[#1A5C38] transition-colors flex-shrink-0" />
          </button>
        </div>

        {/* ── Cerrar sesión ── */}
        <button style={delay(6)} onClick={() => { logout(); window.location.href = '/login-productor'; }}
          className="w-full flex items-center justify-center gap-2 py-4 text-red-500 font-semibold text-[14px] active:opacity-70 transition-opacity">
          <LogOut size={16} /> Cerrar sesión
        </button>

      </div>
    </div>
  );
}
