import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, Mail, Users, MapPinned, CalendarCheck, LogOut,
  KeyRound, AlertTriangle, Check, X, Edit2, Loader2,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';

interface PerfilTecnico {
  id: number;
  email: string;
  nombre_completo: string;
  telefono?: string | null;
  debe_cambiar_pass?: boolean;
  total_registros?: number;
  total_ups?: number;
  total_ciclos?: number;
}

export default function PerfilTecnicoPage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [perfil, setPerfil] = useState<PerfilTecnico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editTel, setEditTel] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [savedTel, setSavedTel] = useState(false);

  const [pwActual, setPwActual] = useState('');
  const [pwNueva, setPwNueva] = useState('');
  const [pwConfirmar, setPwConfirmar] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwExito, setPwExito] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    api.tecnico.perfil()
      .then((res: any) => {
        setPerfil(res);
        setTelefono(res?.telefono || '');
      })
      .catch(() => setError('No se pudo cargar tu perfil.'))
      .finally(() => setLoading(false));
  }, []);

  async function guardarTelefono() {
    try {
      await api.tecnico.actualizarPerfil({ telefono });
      setPerfil(prev => prev ? { ...prev, telefono } : prev);
      setEditTel(false);
      setSavedTel(true);
      setTimeout(() => setSavedTel(false), 2000);
    } catch {
      /* silencioso, el guard global ya avisa si es problema de conexión */
    }
  }

  async function handleCambiarPassword() {
    setPwError('');
    if (pwNueva.length < 6) { setPwError('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
    if (pwNueva !== pwConfirmar) { setPwError('Las contraseñas no coinciden.'); return; }
    setPwLoading(true);
    try {
      await api.tecnico.cambiarPassword(pwActual, pwNueva);
      setPwExito(true);
      setPwActual(''); setPwNueva(''); setPwConfirmar('');
      setPerfil(prev => prev ? { ...prev, debe_cambiar_pass: false } : prev);
      setTimeout(() => setPwExito(false), 3000);
    } catch (e: any) {
      setPwError(e.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setPwLoading(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/tecnico/login');
  }

  if (loading) return (
    <div className="min-h-full flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-full border-[3px] border-[#1A5C38]/20 border-t-[#1A5C38] animate-spin" />
    </div>
  );

  if (!perfil) return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico title="Perfil" subtitle="Tu información como técnico ECA" />
      <div className="p-4">
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-600 text-[13px]">
          {error || 'No se pudo cargar tu perfil.'}
        </div>
      </div>
    </div>
  );

  const initials = perfil.nombre_completo
    ? perfil.nombre_completo.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : 'T';

  return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico title="Perfil" subtitle="Tu información como técnico ECA" />

      <div className="p-4 space-y-4">

        {/* ── Aviso de contraseña temporal ── */}
        {perfil.debe_cambiar_pass && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-amber-800">Tienes una contraseña temporal</p>
              <p className="text-[12px] text-amber-700 mt-0.5">Por seguridad, cámbiala ahora desde la sección de abajo.</p>
            </div>
          </div>
        )}

        {/* ── Hero con iniciales ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1A5C38] to-[#0e3d24] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#1A5C38]/20">
            <span className="text-white font-black text-xl">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-black text-slate-900 truncate">{perfil.nombre_completo || 'Técnico ECA'}</p>
            <p className="text-[12px] text-slate-400 truncate mt-0.5">{perfil.email}</p>
          </div>
        </div>

        {/* ── Estadísticas ── */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 text-center">
            <div className="w-8 h-8 mx-auto rounded-xl bg-[#1A5C38]/10 flex items-center justify-center mb-1.5">
              <Users size={15} className="text-[#1A5C38]" />
            </div>
            <p className="text-[18px] font-black text-slate-900 leading-none">{perfil.total_registros ?? 0}</p>
            <p className="text-[9.5px] text-slate-500 font-semibold mt-1 leading-tight">Productores</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 text-center">
            <div className="w-8 h-8 mx-auto rounded-xl bg-emerald-100 flex items-center justify-center mb-1.5">
              <MapPinned size={15} className="text-emerald-700" />
            </div>
            <p className="text-[18px] font-black text-slate-900 leading-none">{perfil.total_ups ?? 0}</p>
            <p className="text-[9.5px] text-slate-500 font-semibold mt-1 leading-tight">UPs capturadas</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-3.5 text-center">
            <div className="w-8 h-8 mx-auto rounded-xl bg-blue-100 flex items-center justify-center mb-1.5">
              <CalendarCheck size={15} className="text-blue-700" />
            </div>
            <p className="text-[18px] font-black text-slate-900 leading-none">{perfil.total_ciclos ?? 0}</p>
            <p className="text-[9.5px] text-slate-500 font-semibold mt-1 leading-tight">Ciclos</p>
          </div>
        </div>

        {/* ── Contacto ── */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-5 pt-4 pb-0">Contacto</p>

          <div className="px-5 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Mail size={15} className="text-[#1A5C38]" />
                <span className="text-[13px] text-slate-500 font-medium">Correo</span>
              </div>
              <span className="text-[13px] font-semibold text-slate-800 truncate max-w-[170px]">{perfil.email}</span>
            </div>
          </div>

          <div className="h-px bg-slate-50 mx-5" />

          <div className="px-5 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Phone size={15} className="text-[#1A5C38]" />
                <span className="text-[13px] text-slate-500 font-medium">Teléfono</span>
              </div>
              {!editTel && (
                <div className="flex items-center gap-2">
                  {savedTel && <span className="text-[11px] text-emerald-600 font-bold">Guardado ✓</span>}
                  <span className="text-[14px] font-semibold text-slate-800">
                    {perfil.telefono || <span className="text-slate-300 font-normal text-[13px]">sin teléfono</span>}
                  </span>
                  <button onClick={() => setEditTel(true)} className="w-7 h-7 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95 transition-transform">
                    <Edit2 size={13} className="text-[#1A5C38]" />
                  </button>
                </div>
              )}
            </div>
            {editTel && (
              <div className="mt-2.5 flex gap-2">
                <input type="tel" inputMode="numeric" autoFocus value={telefono} maxLength={10}
                  onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 bg-[#f4fbf7] border-2 border-[#1A5C38]/20 focus:border-[#1A5C38] rounded-xl px-3 py-2.5 text-[15px] outline-none transition-colors" />
                <button onClick={guardarTelefono}
                  className="w-11 h-11 rounded-xl bg-[#1A5C38] flex items-center justify-center active:scale-95 transition-all shadow-sm shadow-[#1A5C38]/20">
                  <Check size={16} className="text-white" />
                </button>
                <button onClick={() => { setEditTel(false); setTelefono(perfil.telefono || ''); }}
                  className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center active:scale-95 transition-transform">
                  <X size={15} className="text-slate-400" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Cambiar contraseña ── */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <KeyRound size={15} className="text-[#1A5C38]" />
            <p className="text-[13px] font-bold text-slate-700">Cambiar contraseña</p>
          </div>

          <div className="px-5 pb-4 pt-2 space-y-2.5">
            <input type="password" placeholder="Contraseña actual" value={pwActual}
              onChange={e => setPwActual(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-[#1A5C38]/40 transition-colors" />
            <input type="password" placeholder="Nueva contraseña (mín. 6 caracteres)" value={pwNueva}
              onChange={e => setPwNueva(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-[#1A5C38]/40 transition-colors" />
            <input type="password" placeholder="Confirmar nueva contraseña" value={pwConfirmar}
              onChange={e => setPwConfirmar(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-[#1A5C38]/40 transition-colors" />

            {pwError && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <p className="text-red-600 text-[12px] font-medium">{pwError}</p>
              </div>
            )}
            {pwExito && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                <p className="text-emerald-700 text-[12px] font-bold">✓ Contraseña actualizada correctamente</p>
              </div>
            )}

            <button onClick={handleCambiarPassword} disabled={pwLoading || !pwActual || !pwNueva || !pwConfirmar}
              className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white rounded-xl py-3 font-bold text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm shadow-[#1A5C38]/20">
              {pwLoading ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={14} />}
              {pwLoading ? 'Guardando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </div>

        {/* ── Cerrar sesión ── */}
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-4 text-red-500 font-semibold text-[14px] active:opacity-70 transition-opacity">
          <LogOut size={16} /> Cerrar sesión
        </button>

      </div>
    </div>
  );
}
