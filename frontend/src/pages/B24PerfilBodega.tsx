import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Edit2, Check, X, Phone, MapPin, AlertTriangle,
  CreditCard, LogOut, ChevronRight, Warehouse, Settings,
  Calendar, ShieldCheck, FileDown,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import ProfileHero from '../components/ProfileHero';
import { descargarAcuseRegistro } from '../utils/descargarAcuse';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}`, 'Content-Type': 'application/json' });

function normalizar(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

interface PerfilBodega {
  id: number; email: string; nombre_completo: string; telefono: string;
  rol: string; curp: string | null; state_id: string | null;
  municipality_id: string | null; created_at: string;
}
interface BodegaInfo { bodega_id: number; nombre: string; municipio: string; estado: string; semaforo_compra: string; }
interface GeoState  { state_id: string; name: string; }
interface GeoMuni   { municipality_id: string; name: string; }

function Spinner() {
  return <div className="w-6 h-6 rounded-full border-[2.5px] border-[#1A5C38]/20 border-t-[#1A5C38] animate-spin" />;
}

/* ─── Modal confirmación ─────────────────────────────────────────── */
function ConfirmModal({ title, body, warning, onConfirm, onCancel, loading }: {
  title: string; body: string; warning?: string;
  onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-4 pb-6">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'bdSlideUp .3s cubic-bezier(0.34,1.4,0.64,1) both' }}>
        <div className="flex flex-col items-center px-6 pt-7 pb-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
            <AlertTriangle size={24} className="text-amber-600" />
          </div>
          <h2 className="text-[18px] font-black text-slate-900 text-center leading-snug">{title}</h2>
          <p className="text-[13px] text-slate-500 text-center mt-2 leading-relaxed whitespace-pre-line">{body}</p>
          {warning && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 text-center leading-snug">{warning}</p>}
        </div>
        <div className="px-5 pb-6 pt-4 flex flex-col gap-2.5">
          <button onClick={onConfirm} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#1A5C38] text-white py-3.5 rounded-2xl text-[15px] font-bold active:scale-[0.98] transition-all disabled:opacity-60 shadow-[0_4px_14px_rgba(26,92,56,0.25)]">
            {loading ? <><Spinner /> Guardando…</> : 'Sí, actualizar'}
          </button>
          <button onClick={onCancel} disabled={loading} className="w-full py-3.5 rounded-2xl text-[14px] font-semibold text-slate-600 bg-slate-100 active:bg-slate-200 transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal CURP ───────────────────────────────────────────────────── */
function ModalCURP({ curpActual, onSave, onClose }: { curpActual: string; onSave: (curp: string) => Promise<void>; onClose: () => void; }) {
  const [valor, setValor]   = useState(curpActual);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
  const limpio  = normalizar(valor.replace(/\s/g, '')).slice(0, 18);
  const valido  = CURP_RE.test(limpio);

  if (confirm) return (
    <ConfirmModal title="¿Actualizar tu CURP?" body={`Nueva CURP: ${limpio}`}
      warning="Asegúrate de que sea correcta antes de confirmar."
      onConfirm={async () => { setLoading(true); try { await onSave(limpio); } catch { setError('Error al guardar'); } finally { setLoading(false); } }}
      onCancel={() => setConfirm(false)} loading={loading} />
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-4 pb-6">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ animation: 'bdSlideUp .3s cubic-bezier(0.34,1.4,0.64,1) both' }}>
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
                <CreditCard size={17} className="text-[#1A5C38]" />
              </div>
              <h2 className="text-[17px] font-black text-slate-900">Actualizar CURP</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:bg-slate-200 transition-colors">
              <X size={15} className="text-slate-500" />
            </button>
          </div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">CURP (18 caracteres)</label>
          <input value={limpio} onChange={e => { setValor(normalizar(e.target.value)); setError(''); }} maxLength={18}
            placeholder="XEXX000000HXXXXXX0"
            className={`w-full font-mono text-[16px] tracking-widest border-2 rounded-2xl px-4 py-3.5 outline-none transition-colors ${error ? 'border-red-400 bg-red-50' : valido ? 'border-[#1A5C38] bg-[#eef8f2]' : 'border-slate-200 focus:border-[#1A5C38]'}`} />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-slate-400">Formato: XEXX000000HXXXXXX0</span>
            <span className={`text-[11px] font-bold ${limpio.length === 18 ? (valido ? 'text-emerald-600' : 'text-red-500') : 'text-slate-400'}`}>{limpio.length}/18{valido ? ' ✓' : ''}</span>
          </div>
          {error && <p className="text-[12px] text-red-600 mt-2 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 pb-6 flex flex-col gap-2.5">
          <button onClick={() => { if (!valido) { setError('CURP inválida. Verifica el formato.'); return; } setConfirm(true); }}
            className="w-full bg-[#1A5C38] text-white py-3.5 rounded-2xl text-[15px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_14px_rgba(26,92,56,0.2)]">
            Continuar
          </button>
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-[14px] font-semibold text-slate-600 bg-slate-100 active:bg-slate-200 transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal Ubicación ──────────────────────────────────────────────── */
function ModalUbicacion({ stateIdActual, muniIdActual, onSave, onClose }: {
  stateIdActual: string | null; muniIdActual: string | null;
  onSave: (sid: string, mid: string, sN: string, mN: string) => Promise<void>; onClose: () => void;
}) {
  const [estados, setEstados] = useState<GeoState[]>([]);
  const [munis, setMunis]     = useState<GeoMuni[]>([]);
  const [stateId, setStateId] = useState<string | null>(stateIdActual);
  const [muniId, setMuniId]   = useState<string | null>(muniIdActual);
  const [loadE, setLoadE]     = useState(true);
  const [loadM, setLoadM]     = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetch(`${BASE}/auth/states`, { headers: HDR() }).then(r => r.json()).then(d => setEstados(d.states ?? d ?? [])).finally(() => setLoadE(false));
  }, []);
  useEffect(() => {
    if (!stateId) { setMunis([]); return; }
    setLoadM(true); setMuniId(null);
    fetch(`${BASE}/auth/municipalities?state_id=${stateId}`, { headers: HDR() }).then(r => r.json()).then(d => setMunis(d.municipalities ?? d ?? [])).finally(() => setLoadM(false));
  }, [stateId]);

  const sN = estados.find(e => e.state_id === stateId)?.name ?? '';
  const mN = munis.find(m => m.municipality_id === muniId)?.name ?? '';

  if (confirm) return (
    <ConfirmModal title="¿Actualizar ubicación?" body={`Estado: ${sN}\nMunicipio: ${mN}`}
      warning="Asegúrate de seleccionar la ubicación correcta."
      onConfirm={async () => { if (!stateId || !muniId) return; setSaving(true); try { await onSave(stateId, muniId, sN, mN); } finally { setSaving(false); } }}
      onCancel={() => setConfirm(false)} loading={saving} />
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center px-4 pb-6">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{ animation: 'bdSlideUp .3s cubic-bezier(0.34,1.4,0.64,1) both' }}>
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] flex items-center justify-center">
                <MapPin size={17} className="text-[#1A5C38]" />
              </div>
              <h2 className="text-[17px] font-black text-slate-900">Actualizar ubicación</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:bg-slate-200 transition-colors">
              <X size={15} className="text-slate-500" />
            </button>
          </div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Estado</label>
          {loadE ? <div className="flex justify-center py-4"><Spinner /></div> : (
            <select value={stateId ?? ''} onChange={e => setStateId(e.target.value || null)}
              className="w-full border-2 border-slate-200 focus:border-[#1A5C38] rounded-2xl px-4 py-3 text-[14px] outline-none transition-colors bg-white">
              <option value="">— Selecciona un estado —</option>
              {estados.map(e => <option key={e.state_id} value={e.state_id}>{e.name}</option>)}
            </select>
          )}
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mt-4 mb-2">Municipio</label>
          {loadM ? <div className="flex justify-center py-4"><Spinner /></div> : (
            <select value={muniId ?? ''} onChange={e => setMuniId(e.target.value || null)} disabled={!stateId || munis.length === 0}
              className="w-full border-2 border-slate-200 focus:border-[#1A5C38] rounded-2xl px-4 py-3 text-[14px] outline-none transition-colors bg-white disabled:opacity-50">
              <option value="">{!stateId ? '— Primero selecciona un estado —' : munis.length === 0 ? 'Sin municipios' : '— Selecciona —'}</option>
              {munis.map(m => <option key={m.municipality_id} value={m.municipality_id}>{m.name}</option>)}
            </select>
          )}
        </div>
        <div className="px-5 pb-6 pt-2 flex flex-col gap-2.5 flex-shrink-0">
          <button onClick={() => { if (stateId && muniId) setConfirm(true); }} disabled={!stateId || !muniId}
            className="w-full bg-[#1A5C38] text-white py-3.5 rounded-2xl text-[15px] font-bold active:scale-[0.98] transition-all disabled:opacity-40 shadow-[0_4px_14px_rgba(26,92,56,0.2)]">
            Continuar
          </button>
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-[14px] font-semibold text-slate-600 bg-slate-100 active:bg-slate-200 transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Fila de dato editable ─────────────────────────────────────────── */
function DataRow({ icon: Icon, label, value, onEdit }: { icon: any; label: string; value: string; onEdit: () => void; }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-[#1A5C38]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-slate-400 font-medium">{label}</p>
        <p className="text-[14px] font-semibold text-slate-800 truncate mt-0.5">{value}</p>
      </div>
      <button onClick={onEdit} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-all flex-shrink-0">
        <Edit2 size={13} className="text-[#1A5C38]" />
      </button>
    </div>
  );
}

/* ─── Página principal ──────────────────────────────────────────────── */
export default function B24PerfilBodega() {
  const navigate       = useNavigate();
  const { user, logout } = useAuthStore();
  const [perfil, setPerfil]   = useState<PerfilBodega | null>(null);
  const [bodegas, setBodegas] = useState<BodegaInfo[]>([]);
  const [loading, setLoading] = useState(true);
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

  const [editTel, setEditTel]     = useState(false);
  const [telefono, setTelefono]   = useState('');
  const [savingTel, setSavingTel] = useState(false);
  const [savedTel, setSavedTel]   = useState(false);

  const [editNombre, setEditNombre]     = useState(false);
  const [nombre, setNombre]             = useState('');
  const [savingNombre, setSavingNombre] = useState(false);

  const [showCURP, setShowCURP]           = useState(false);
  const [showUbicacion, setShowUbicacion] = useState(false);
  const [stateNombre, setStateNombre]     = useState('');
  const [muniNombre, setMuniNombre]       = useState('');
  const [toast, setToast]                 = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`${BASE}/auth/perfil`, { headers: HDR() });
        if (r.ok) { const d = await r.json(); const u = d.usuario ?? d; setPerfil(u); setTelefono(u.telefono || ''); setNombre(u.nombre_completo || ''); }
        const rb = await fetch(`${BASE}/mis-bodegas`, { headers: HDR() });
        if (rb.ok) { const db = await rb.json(); setBodegas(db.bodegas ?? db ?? []); }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!perfil?.state_id) return;
    fetch(`${BASE}/auth/states`, { headers: HDR() }).then(r => r.json()).then(d => {
      const st = (d.states ?? d ?? []).find((e: GeoState) => e.state_id === perfil.state_id);
      if (st) setStateNombre(st.name);
    });
    if (!perfil.municipality_id) return;
    fetch(`${BASE}/auth/municipalities?state_id=${perfil.state_id}`, { headers: HDR() }).then(r => r.json()).then(d => {
      const mn = (d.municipalities ?? d ?? []).find((m: GeoMuni) => m.municipality_id === perfil.municipality_id);
      if (mn) setMuniNombre(mn.name);
    });
  }, [perfil?.state_id, perfil?.municipality_id]);

  const showToastMsg = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  async function guardarTelefono() {
    setSavingTel(true);
    try {
      const r = await fetch(`${BASE}/auth/perfil`, { method: 'PATCH', headers: HDR(), body: JSON.stringify({ telefono }) });
      if (r.ok) { setPerfil(prev => prev ? { ...prev, telefono } : prev); setEditTel(false); setSavedTel(true); setTimeout(() => setSavedTel(false), 2000); }
      else showToastMsg('Error al guardar. Intenta de nuevo.');
    } finally { setSavingTel(false); }
  }

  async function guardarNombre() {
    const clean = normalizar(nombre).trim();
    if (!clean || clean.length < 3) return;
    setSavingNombre(true);
    try {
      const r = await fetch(`${BASE}/auth/perfil`, { method: 'PATCH', headers: HDR(), body: JSON.stringify({ nombre_completo: clean }) });
      if (r.ok) { setPerfil(prev => prev ? { ...prev, nombre_completo: clean } : prev); setEditNombre(false); showToastMsg('Nombre actualizado ✓'); }
      else showToastMsg('Error al guardar.');
    } finally { setSavingNombre(false); }
  }

  async function guardarCURP(curp: string) {
    const r = await fetch(`${BASE}/auth/perfil`, { method: 'PATCH', headers: HDR(), body: JSON.stringify({ curp }) });
    if (!r.ok) throw new Error();
    setPerfil(prev => prev ? { ...prev, curp } : prev); setShowCURP(false); showToastMsg('CURP actualizada ✓');
  }

  async function guardarUbicacion(sid: string, mid: string, sN: string, mN: string) {
    const r = await fetch(`${BASE}/auth/perfil`, { method: 'PATCH', headers: HDR(), body: JSON.stringify({ state_id: sid, municipality_id: mid }) });
    if (!r.ok) throw new Error();
    setPerfil(prev => prev ? { ...prev, state_id: sid, municipality_id: mid } : prev);
    setStateNombre(sN); setMuniNombre(mN); setShowUbicacion(false); showToastMsg('Ubicación actualizada ✓');
  }

  const initials   = (perfil?.nombre_completo || user?.nombre_completo || 'U').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
  const rolLabel   = perfil?.rol || user?.rol || 'bodega';
  const rolDisplay = rolLabel === 'bodega' ? 'Bodega' : rolLabel === 'industria' ? 'Industria' : rolLabel.charAt(0).toUpperCase() + rolLabel.slice(1);
  const fechaReg   = perfil?.created_at ? new Date(perfil.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const SEMAFORO: Record<string, string> = {
    comprando:   'bg-emerald-100 text-emerald-700',
    pausado:     'bg-amber-100 text-amber-700',
    sin_actividad: 'bg-slate-100 text-slate-500',
    rojo:        'bg-red-100 text-red-700',
    amarillo:    'bg-amber-100 text-amber-700',
  };

  const delay = (i: number) => ({ animation: `bdFadeUp .4s ${i * 55}ms ease both` });

  return (
    <div className="bg-[#eef8f2] min-h-screen pb-28">
      <style>{`
        @keyframes bdFadeUp  { from { opacity:0; transform:translateY(14px) } to { opacity:1; transform:translateY(0) } }
        @keyframes bdSlideUp { from { opacity:0; transform:translateY(28px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes bdPop     { from { opacity:0; transform:scale(0.93) } to { opacity:1; transform:scale(1) } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] bg-slate-900/90 text-white text-[13px] font-semibold px-4 py-2.5 rounded-2xl shadow-xl backdrop-blur-md" style={{ animation: 'bdPop .25s ease both' }}>
          {toast}
        </div>
      )}

      {/* Modales */}
      {showCURP     && <ModalCURP     curpActual={perfil?.curp ?? ''} onSave={guardarCURP}    onClose={() => setShowCURP(false)} />}
      {showUbicacion && <ModalUbicacion stateIdActual={perfil?.state_id ?? null} muniIdActual={perfil?.municipality_id ?? null} onSave={guardarUbicacion} onClose={() => setShowUbicacion(false)} />}

      <ProfileHero
        variant="bodega"
        titulo="Mi Perfil"
        nombre={perfil?.nombre_completo || user?.nombre_completo || '—'}
        initials={initials}
        back={-1}
        meta={perfil?.email || user?.email || undefined}
        badges={
          <span className="text-[11px] font-bold text-white/90 bg-white/15 rounded-full px-3 py-1 capitalize">
            {rolDisplay}
          </span>
        }
      />

      {loading ? (
        <div className="flex justify-center pt-16"><Spinner /></div>
      ) : (
        <div className="max-w-lg mx-auto px-4 pt-5 space-y-3">

          {/* ── Datos de cuenta ── */}
          <div style={delay(0)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-5 pt-4 pb-1">Datos de cuenta</p>

            <div className="px-5 divide-y divide-slate-50">

              {/* Nombre */}
              <div className="py-3.5">
                <DataRow icon={ShieldCheck} label="Nombre completo" value={perfil?.nombre_completo || '—'} onEdit={() => { setEditNombre(!editNombre); setNombre(perfil?.nombre_completo || ''); }} />
                {editNombre && (
                  <div className="flex gap-2 mt-1" style={{ animation: 'bdPop .22s ease both' }}>
                    <input value={nombre} onChange={e => setNombre(normalizar(e.target.value))} maxLength={80} style={{ textTransform: 'uppercase' }}
                      placeholder="NOMBRE COMPLETO" autoFocus
                      className="flex-1 bg-[#f4fbf7] border-2 border-[#1A5C38]/20 focus:border-[#1A5C38] rounded-xl px-3 py-2.5 text-[14px] tracking-wide outline-none transition-colors" />
                    <button onClick={guardarNombre} disabled={savingNombre || nombre.trim().length < 3}
                      className="w-11 h-11 rounded-xl bg-[#1A5C38] flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shadow-sm shadow-[#1A5C38]/20">
                      {savingNombre ? <Spinner /> : <Check size={16} className="text-white" />}
                    </button>
                    <button onClick={() => setEditNombre(false)} className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center active:scale-95 transition-transform">
                      <X size={15} className="text-slate-400" />
                    </button>
                  </div>
                )}
              </div>

              {/* Teléfono */}
              <div className="py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                    <Phone size={15} className="text-[#1A5C38]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400 font-medium">Teléfono</p>
                    <p className="text-[14px] font-semibold text-slate-800 mt-0.5">{perfil?.telefono || <span className="text-slate-300 font-normal">sin teléfono</span>}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {savedTel && <span className="text-[11px] text-emerald-600 font-bold">Guardado ✓</span>}
                    <button onClick={() => { setEditTel(!editTel); setTelefono(perfil?.telefono || ''); }}
                      className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-all">
                      {editTel ? <X size={14} className="text-slate-400" /> : <Edit2 size={13} className="text-[#1A5C38]" />}
                    </button>
                  </div>
                </div>
                {editTel && (
                  <div className="flex gap-2 mt-2" style={{ animation: 'bdPop .22s ease both' }}>
                    <input type="tel" inputMode="numeric" autoFocus value={telefono} maxLength={10}
                      onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10 dígitos"
                      className="flex-1 bg-[#f4fbf7] border-2 border-[#1A5C38]/20 focus:border-[#1A5C38] rounded-xl px-3 py-2.5 text-[15px] outline-none transition-colors" />
                    <button onClick={guardarTelefono} disabled={savingTel || telefono.length < 10}
                      className="w-11 h-11 rounded-xl bg-[#1A5C38] flex items-center justify-center disabled:opacity-40 active:scale-95 transition-all shadow-sm shadow-[#1A5C38]/20">
                      {savingTel ? <Spinner /> : <Check size={16} className="text-white" />}
                    </button>
                  </div>
                )}
              </div>

              {/* CURP */}
              <div className="py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                    <CreditCard size={15} className="text-[#1A5C38]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400 font-medium">CURP</p>
                    <p className="font-mono text-[13px] font-semibold text-slate-800 tracking-wider mt-0.5">
                      {perfil?.curp || <span className="font-sans font-normal text-slate-300 text-[13px] tracking-normal">sin CURP registrada</span>}
                    </p>
                  </div>
                  <button onClick={() => setShowCURP(true)} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-all flex-shrink-0">
                    <Edit2 size={13} className="text-[#1A5C38]" />
                  </button>
                </div>
              </div>

              {/* Ubicación */}
              <div className="py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                    <MapPin size={15} className="text-[#1A5C38]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400 font-medium">Estado / Municipio</p>
                    <p className="text-[14px] font-semibold text-slate-800 mt-0.5 truncate">
                      {stateNombre && muniNombre ? `${muniNombre}, ${stateNombre}` : stateNombre || <span className="text-slate-300 font-normal text-[13px]">sin ubicación</span>}
                    </p>
                  </div>
                  <button onClick={() => setShowUbicacion(true)} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-all flex-shrink-0">
                    <Edit2 size={13} className="text-[#1A5C38]" />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* ── Info del sistema ── */}
          <div style={delay(1)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] px-5 py-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Sistema</p>
            <div className="space-y-3">
              {fechaReg && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                    <Calendar size={14} className="text-[#1A5C38]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium">Miembro desde</p>
                    <p className="text-[14px] font-semibold text-slate-800 mt-0.5">{fechaReg}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0">
                  <ShieldCheck size={14} className="text-[#1A5C38]" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">Rol</p>
                  <p className="text-[14px] font-semibold text-slate-800 mt-0.5 capitalize">{rolDisplay}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Mis bodegas ── */}
          {bodegas.length > 0 && (
            <div style={delay(2)} className="bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Warehouse size={15} className="text-[#1A5C38]" />
                  <p className="text-[13px] font-bold text-slate-700">Mis bodegas <span className="text-slate-400 font-normal text-[11px]">({bodegas.length})</span></p>
                </div>
                <button onClick={() => navigate('/mis-bodegas')} className="text-[12px] text-[#1A5C38] font-bold flex items-center gap-0.5 active:opacity-60 transition-opacity">
                  Ver todas <ChevronRight size={14} />
                </button>
              </div>
              <div className="px-4 pb-4 space-y-2">
                {bodegas.slice(0, 3).map((b, i) => (
                  <button key={b.bodega_id} onClick={() => navigate(`/bodegas/${b.bodega_id}`)}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-[#f9fafb] hover:bg-[#eef8f2] active:scale-[0.98] transition-all text-left"
                    style={{ animation: `bdFadeUp .35s ${i * 60 + 100}ms ease both` }}>
                    <div className="w-10 h-10 rounded-xl bg-white ring-1 ring-black/[0.06] flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Warehouse size={16} className="text-[#1A5C38]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800 truncate">{b.nombre}</p>
                      <p className="text-[11.5px] text-slate-400 truncate mt-0.5">{b.municipio}, {b.estado}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${SEMAFORO[b.semaforo_compra] || 'bg-slate-100 text-slate-500'}`}>
                      {b.semaforo_compra?.replace('_', ' ') || '—'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Configuración ── */}
          <button style={delay(3)} onClick={() => navigate('/configuracion')}
            className="w-full bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] px-5 py-4 flex items-center gap-3.5 text-left active:scale-[0.98] transition-all group">
            <div className="w-10 h-10 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0 group-active:bg-[#d9f0e5] transition-colors">
              <Settings size={17} className="text-[#1A5C38]" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-slate-800">Configuración</p>
              <p className="text-[12px] text-slate-400 mt-0.5">Cambiar contraseña y preferencias</p>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-active:text-[#1A5C38] transition-colors" />
          </button>

          {/* ── Acuse de registro ── */}
          <button style={delay(3.5)} onClick={handleDescargarAcuse} disabled={descargandoAcuse}
            className="w-full bg-white rounded-2xl shadow-sm ring-1 ring-black/[0.04] px-5 py-4 flex items-center gap-3.5 text-left active:scale-[0.98] transition-all group disabled:opacity-60">
            <div className="w-10 h-10 rounded-xl bg-[#eef8f2] flex items-center justify-center flex-shrink-0 group-active:bg-[#d9f0e5] transition-colors">
              <FileDown size={17} className="text-[#1A5C38]" />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-slate-800">Acuse de registro</p>
              <p className="text-[12px] text-slate-400 mt-0.5">
                {descargandoAcuse ? 'Generando PDF…' : 'Descargar comprobante de tu registro en SIMAC'}
              </p>
            </div>
            <ChevronRight size={16} className="text-slate-300 group-active:text-[#1A5C38] transition-colors" />
          </button>

          {/* ── Cerrar sesión ── */}
          <button style={delay(4)} onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-100 text-red-500 rounded-2xl py-4 text-[15px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(220,38,38,0.08)]">
            <LogOut size={18} /> Cerrar sesión
          </button>

        </div>
      )}
    </div>
  );
}
