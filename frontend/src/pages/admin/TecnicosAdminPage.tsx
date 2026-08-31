import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, X, RefreshCw, AlertTriangle, Users,
  Trash2, Pencil, KeyRound, Copy, CheckCheck,
  ShieldAlert, UserCog, Check,
} from 'lucide-react';
import { usePermisosStore } from '../../store/permisos';
import { api } from '../../services/api';

interface Tecnico {
  id: number;
  email: string;
  nombre_completo: string;
  activo: boolean;
  debe_cambiar_pass: boolean;
  ultimo_login: string | null;
  created_at: string;
  total_registros: number;
  total_ups: number;
}

interface RegistroTecnico {
  producer_id: number;
  nombres: string;
  apellido_paterno: string;
  apellido_materno?: string;
  curp?: string;
  total_ups?: number;
  total_ciclos?: number;
  fecha_captura?: string;
}

function Initials({ nombre }: { nombre: string }) {
  const letters = (nombre || 'T').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'T';
  return (
    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-900/20 flex-shrink-0">
      <span className="text-white font-black text-lg tracking-tight">{letters}</span>
    </div>
  );
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ─── Modal detalle técnico ──────────────────────────────────────── */
function ModalDetalleTecnico({
  tecnico, onClose, puedeEditar,
}: { tecnico: Tecnico; onClose: () => void; puedeEditar: boolean }) {
  const [detalle, setDetalle] = useState<{ registros: RegistroTecnico[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    api.admin.tecnicos.detalle(tecnico.id)
      .then((d: any) => setDetalle({ registros: d.registros || d.productores || [] }))
      .catch(() => setError('No se pudieron cargar los registros de este técnico.'))
      .finally(() => setLoading(false));
    return () => { document.body.style.overflow = ''; };
  }, [tecnico.id]);

  return createPortal(
    <div className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />
      <div
        className="relative w-full sm:max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 40px 80px -10px rgba(0,0,0,0.45)', animation: 'slideUpSheet .28s cubic-bezier(.34,1.25,.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="flex-shrink-0 px-6 pt-5 pb-4 flex items-start gap-4">
          <Initials nombre={tecnico.nombre_completo} />
          <div className="flex-1 min-w-0 pt-1">
            <p className="text-[18px] font-extrabold text-gray-900 leading-tight">{tecnico.nombre_completo}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{tecnico.email}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                tecnico.activo ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-100 border-gray-200'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                {tecnico.activo ? 'Activo' : 'Inactivo'}
              </span>
              {tecnico.debe_cambiar_pass && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                  Contraseña temporal
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors flex-shrink-0">
            <X size={14} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center">
              <p className="text-[16px] font-black text-gray-900">{tecnico.total_registros}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Productores</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center">
              <p className="text-[16px] font-black text-gray-900">{tecnico.total_ups}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">UPs</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 text-center">
              <p className="text-[12px] font-black text-gray-900">{fmtFecha(tecnico.ultimo_login)}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Último acceso</p>
            </div>
          </div>

          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pt-1">Registros capturados</p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={18} className="text-indigo-500 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-[12px] text-red-500">{error}</p>
          ) : (detalle?.registros.length ?? 0) === 0 ? (
            <p className="text-[12px] text-gray-400 italic py-4 text-center">Sin registros capturados aún.</p>
          ) : (
            <div className="divide-y divide-gray-50 bg-gray-50/50 rounded-2xl border border-gray-100 overflow-hidden">
              {detalle!.registros.map(r => (
                <div key={r.producer_id} className="px-3.5 py-2.5 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-indigo-600">
                      {(r.nombres?.[0] || '') + (r.apellido_paterno?.[0] || '')}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-gray-800 truncate">
                      {r.nombres} {r.apellido_paterno} {r.apellido_materno || ''}
                    </p>
                    <p className="text-[10.5px] text-gray-400 truncate">
                      {r.curp ? `${r.curp.slice(0, 4)}${'•'.repeat(Math.max(r.curp.length - 6, 0))}${r.curp.slice(-2)} · ` : ''}
                      {r.total_ups ?? 0} UP{(r.total_ups ?? 0) !== 1 ? 's' : ''}
                      {r.total_ciclos ? ` · ${r.total_ciclos} ciclo${r.total_ciclos !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!puedeEditar && (
            <p className="text-[10.5px] text-gray-300 italic text-center pt-2">No tienes permiso para editar técnicos.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Modal editar técnico ───────────────────────────────────────── */
function ModalEditarTecnico({
  tecnico, onClose, onSaved,
}: { tecnico: Tecnico; onClose: () => void; onSaved: (t: Tecnico) => void }) {
  const [nombre, setNombre] = useState(tecnico.nombre_completo);
  const [email, setEmail] = useState(tecnico.email);
  const [activo, setActivo] = useState(tecnico.activo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setError(''); setLoading(true);
    try {
      await api.admin.tecnicos.editar(tecnico.id, { nombre_completo: nombre, email, activo });
      onSaved({ ...tecnico, nombre_completo: nombre, email, activo });
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar.');
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[8px]" />
      <div
        className="relative bg-white w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[28px] shadow-2xl overflow-hidden"
        style={{ animation: 'slideUpSheet .28s cubic-bezier(.34,1.25,.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-1 sm:hidden" />
        <div className="px-5 pt-4 pb-5">
          <h2 className="text-[16px] font-bold text-slate-900 mb-4">Editar técnico</h2>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Nombre completo</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-400 transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-400 transition-colors" />
            </div>
            <button onClick={() => setActivo(a => !a)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-[13px] font-semibold text-gray-700">Cuenta activa</span>
              <div className={`w-10 h-6 rounded-full transition-colors relative ${activo ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <p className="text-red-600 text-[12px] font-medium">{error}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-5">
            <button onClick={onClose} disabled={loading}
              className="flex-1 py-3 rounded-xl text-[13px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={guardar} disabled={loading || !nombre.trim() || !email.trim()}
              className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Modal resetear contraseña ──────────────────────────────────── */
function ModalResetPassword({
  tecnico, onClose,
}: { tecnico: Tecnico; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function generar() {
    setLoading(true); setError('');
    try {
      const res: any = await api.admin.tecnicos.resetPassword(tecnico.id);
      setResultado(res.password_temporal || res.password || '');
    } catch (e: any) {
      setError(e.message || 'No se pudo generar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  function copiar() {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6" onClick={() => { if (!loading) onClose(); }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[8px]" />
      <div
        className="relative bg-white w-full max-w-sm rounded-[28px] shadow-[0_40px_100px_rgba(0,0,0,0.35)]"
        style={{ animation: 'slideUpSheet .28s cubic-bezier(.34,1.25,.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
        <div className="px-5 pt-3 pb-2">
          <div className="flex items-center justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
              <KeyRound size={24} className="text-purple-600" />
            </div>
          </div>
          <h2 className="text-[17px] font-bold text-slate-900 text-center">Resetear contraseña</h2>
          <p className="text-[13px] text-slate-500 text-center mt-1 mb-3 leading-relaxed">
            Se generará una contraseña temporal para <strong className="text-slate-700">{tecnico.nombre_completo}</strong>.
            Deberá cambiarla en su siguiente inicio de sesión.
          </p>

          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[12px]">{error}</div>
          )}

          {resultado !== null && (
            <div className="mb-3 p-4 bg-purple-50 border border-purple-200 rounded-2xl text-center">
              <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide mb-1.5">Contraseña temporal generada</p>
              <div className="flex items-center justify-center gap-2">
                <p className="text-[20px] font-black text-purple-800 tracking-wide font-mono break-all">{resultado}</p>
                <button onClick={copiar} className="w-8 h-8 rounded-lg bg-white border border-purple-200 flex items-center justify-center flex-shrink-0">
                  {copiado ? <CheckCheck size={14} className="text-emerald-600" /> : <Copy size={14} className="text-purple-400" />}
                </button>
              </div>
              <p className="text-[11px] text-purple-500 mt-2">Cópiala ahora y compártela con el técnico.<br />No se volverá a mostrar.</p>
            </div>
          )}
        </div>

        <div className="px-5 pt-2 pb-6 space-y-2.5">
          {resultado === null ? (
            <>
              <button onClick={generar} disabled={loading}
                className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-white bg-purple-600 hover:bg-purple-700 active:scale-[.97] transition-all disabled:opacity-50">
                {loading ? 'Generando…' : 'Generar contraseña temporal'}
              </button>
              <button onClick={onClose} disabled={loading}
                className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[.97] transition-all disabled:opacity-50">
                Cancelar
              </button>
            </>
          ) : (
            <button onClick={onClose}
              className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-white bg-[#1A5C38] hover:bg-[#15482d] active:scale-[.97] transition-all">
              Listo
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── Página principal ───────────────────────────────────────────── */
export default function TecnicosAdminPage() {
  const { puedo, permisosTotal } = usePermisosStore();
  const puedeVerDetalle = permisosTotal || puedo('tecnicos', 'ver_detalle');
  const puedeEditar     = permisosTotal || puedo('tecnicos', 'editar');
  const puedeEliminar   = permisosTotal || puedo('tecnicos', 'eliminar');

  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [verTecnico, setVerTecnico] = useState<Tecnico | null>(null);
  const [editarTecnico, setEditarTecnico] = useState<Tecnico | null>(null);
  const [resetTecnico, setResetTecnico] = useState<Tecnico | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tecnico | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  async function cargarTecnicos(q?: string) {
    setLoading(true);
    try {
      const res: any = await api.admin.tecnicos.listar(q);
      setTecnicos(res.tecnicos || []);
    } catch {
      setTecnicos([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => cargarTecnicos(search || undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteError(''); setDeleteLoading(true);
    try {
      await api.admin.tecnicos.eliminar(deleteTarget.id);
      setTecnicos(prev => prev.filter(t => t.id !== deleteTarget.id));
      setDeleteSuccess(`${deleteTarget.nombre_completo} fue eliminado.`);
      setDeleteTarget(null);
      setTimeout(() => setDeleteSuccess(''), 4000);
    } catch (e: any) {
      setDeleteError(e.message || 'Error al eliminar el técnico.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const totalTecnicos  = tecnicos.length;
  const totalActivos   = tecnicos.filter(t => t.activo).length;
  const totalProdReg   = tecnicos.reduce((s, t) => s + (Number(t.total_registros) || 0), 0);
  const totalUpsReg    = tecnicos.reduce((s, t) => s + (Number(t.total_ups) || 0), 0);

  return (
    <div className="flex flex-col h-[calc(100vh-76px)] overflow-hidden gap-2">

      {verTecnico && (
        <ModalDetalleTecnico tecnico={verTecnico} onClose={() => setVerTecnico(null)} puedeEditar={puedeEditar} />
      )}
      {editarTecnico && (
        <ModalEditarTecnico
          tecnico={editarTecnico}
          onClose={() => setEditarTecnico(null)}
          onSaved={(t) => {
            setTecnicos(prev => prev.map(x => x.id === t.id ? t : x));
            setEditarTecnico(null);
          }}
        />
      )}
      {resetTecnico && (
        <ModalResetPassword tecnico={resetTecnico} onClose={() => setResetTecnico(null)} />
      )}

      {deleteSuccess && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 bg-gray-900 text-white text-[12.5px] font-semibold rounded-2xl shadow-2xl"
          style={{ animation: 'slideUpFade 0.3s ease' }}>
          <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center flex-shrink-0">
            <Check size={11} strokeWidth={3} className="text-gray-900" />
          </div>
          {deleteSuccess}
        </div>
      )}

      {/* ── Barra superior: título + contadores ── */}
      <div className="bg-[#eef1fb] flex-shrink-0 rounded-b-2xl border border-indigo-900/10 border-t-0 overflow-hidden">
        <div className="px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-indigo-800 font-bold text-[12px]">
            <UserCog size={13} /> Técnicos ECA
          </div>
          <button onClick={() => cargarTecnicos(search || undefined)}
            className="p-1.5 rounded-lg text-indigo-700 bg-indigo-100 hover:bg-indigo-700 hover:text-white border border-indigo-700/20 hover:border-transparent transition">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="border-t border-indigo-900/10 mx-2" />
        <div className="px-3 py-1.5 flex items-center gap-3 flex-wrap">
          {[
            { label: 'Total',        val: totalTecnicos, color: 'text-indigo-800',  dot: 'bg-indigo-700' },
            { label: 'Activos',      val: totalActivos,  color: 'text-emerald-700', dot: 'bg-emerald-500' },
            { label: 'Productores',  val: totalProdReg,  color: 'text-blue-700',    dot: 'bg-blue-500' },
            { label: 'UPs',          val: totalUpsReg,   color: 'text-amber-700',   dot: 'bg-amber-500' },
          ].map(({ label, val, color, dot }, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="w-px h-3 bg-indigo-900/10" />}
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <span className={`text-[12px] font-black ${color}`}>{loading ? '—' : val}</span>
                <span className="text-[9.5px] text-indigo-900/50 font-medium">{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabla principal ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">

        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Buscar por nombre o correo..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-gray-800 placeholder-gray-400 outline-none focus:border-indigo-400 focus:bg-white transition" />
            </div>
            <span className="text-[10.5px] text-gray-400 font-medium whitespace-nowrap">
              {tecnicos.length} resultado{tecnicos.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={20} className="text-indigo-600 animate-spin" />
            <p className="text-[12px] text-gray-400">Cargando técnicos...</p>
          </div>
        ) : tecnicos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <ShieldAlert size={28} className="text-gray-300" />
            <p className="text-[13px] font-bold text-gray-500">Sin técnicos registrados</p>
            <p className="text-[11px] text-gray-400">No hay técnicos ECA que coincidan.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse" style={{ fontSize: '11.5px' }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50/90 border-b border-gray-100">
                  {['Técnico', 'Estado', 'Productores', 'UPs', 'Último acceso', 'Acciones'].map(h => (
                    <th key={h} className="py-2 px-3 text-[9.5px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-4 last:pr-4 last:text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tecnicos.map(t => (
                  <tr key={t.id} className="hover:bg-[#f7f8fd] transition-colors">
                    <td className="py-2 pl-4 pr-3">
                      <p className="font-bold text-gray-800 leading-tight whitespace-nowrap">{t.nombre_completo}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">{t.email}</p>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${
                          t.activo ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-100 border-gray-200'
                        }`}>
                          {t.activo ? 'Activo' : 'Inactivo'}
                        </span>
                        {t.debe_cambiar_pass && (
                          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200">
                            Pass. temporal
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap font-semibold text-gray-700">{t.total_registros}</td>
                    <td className="py-2 px-3 whitespace-nowrap font-semibold text-gray-700">{t.total_ups}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-gray-500">{fmtFecha(t.ultimo_login)}</td>
                    <td className="py-2 px-3 pr-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {puedeVerDetalle && (
                          <button onClick={() => setVerTecnico(t)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-700 hover:text-white text-[10px] font-bold border border-indigo-700/20 hover:border-transparent transition"
                            title="Ver técnico">
                            <Users size={11} /> Ver
                          </button>
                        )}
                        {puedeEditar && (
                          <button onClick={() => setEditarTecnico(t)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition" title="Editar">
                            <Pencil size={12} />
                          </button>
                        )}
                        {puedeEditar && (
                          <button onClick={() => setResetTecnico(t)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-purple-700 hover:bg-purple-50 transition" title="Resetear contraseña">
                            <KeyRound size={12} />
                          </button>
                        )}
                        {puedeEliminar && (
                          <button onClick={() => { setDeleteTarget(t); setDeleteError(''); }}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                            title="Eliminar técnico">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal eliminar técnico ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ animation: 'fadeInBackdrop 0.2s ease' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[6px]"
            onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteError(''); } }} />
          <div className="relative bg-white/95 backdrop-blur-xl w-full sm:max-w-[380px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.28)]"
            style={{ animation: 'slideUpSheet 0.28s cubic-bezier(0.34,1.3,0.64,1)' }}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-gray-300/80" />
            </div>
            <div className="flex flex-col items-center pt-6 pb-2 px-6">
              <div className="w-16 h-16 rounded-[22px] bg-red-50 flex items-center justify-center mb-4">
                <Trash2 size={28} className="text-red-500" strokeWidth={1.8} />
              </div>
              <h2 className="text-[18px] font-bold text-gray-900 text-center leading-tight">Eliminar técnico</h2>
              <p className="mt-2 text-[13.5px] text-gray-500 text-center leading-relaxed px-2">
                Se eliminará permanentemente a{' '}
                <span className="font-semibold text-gray-800">{deleteTarget.nombre_completo}</span>.
              </p>
            </div>
            <div className="mx-5 mt-3 mb-1 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-red-600 leading-relaxed">
                Sus productores registrados NO se eliminarán, quedarán en el padrón general.
                <strong className="block mt-0.5">Esta acción no se puede deshacer.</strong>
              </p>
            </div>
            {deleteError && (
              <div className="mx-5 mt-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <X size={12} className="text-red-500 flex-shrink-0" />
                <p className="text-[12px] text-red-600">{deleteError}</p>
              </div>
            )}
            <div className="px-5 pt-4 pb-6 space-y-2.5">
              <button onClick={handleDeleteConfirm} disabled={deleteLoading}
                className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-white transition-all duration-150 active:scale-[0.97]"
                style={{
                  background: deleteLoading ? 'linear-gradient(135deg, #f87171, #ef4444)' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  boxShadow: deleteLoading ? 'none' : '0 4px 14px rgba(239,68,68,0.35)',
                }}>
                {deleteLoading ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
              <button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleteLoading}
                className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-150 active:scale-[0.97] disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUpSheet { from { opacity: 0; transform: translateY(40px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes slideUpFade { from { opacity: 0; transform: translate(-50%, 16px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
}
