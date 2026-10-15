import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mail, MapPin, KeyRound, LogOut, Check, X, Edit2, Loader2, AlertTriangle, BadgeCheck } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';
import { PROGRAMA_FRIJOL, PROGRAMA_MAIZ } from '../../utils/tecnicoDestino';

interface Zona { state_id: string; state_name?: string | null; municipality_id: string | null; municipality_name?: string | null }
interface Perfil {
  id: number; email: string; nombre_completo: string; telefono?: string | null; debe_cambiar_pass?: boolean;
  programas?: string[]; tipo_tecnico_etiqueta?: string | null; zona?: Zona[];
}

function resumenZona(zona: Zona[] | undefined): string[] {
  const por: Record<string, { nombre: string; todo: boolean; munis: string[] }> = {};
  for (const z of zona || []) {
    const e = (por[z.state_id] ||= { nombre: z.state_name || z.state_id, todo: false, munis: [] });
    if (z.municipality_id) e.munis.push(z.municipality_name || z.municipality_id); else e.todo = true;
  }
  return Object.values(por).map(e => (e.todo ? `${e.nombre} (todo el estado)` : `${e.nombre}: ${e.munis.join(', ')}`));
}

// Perfil del técnico en el módulo de Frijol: sus datos, programas, zona, teléfono y cambio de contraseña.
export default function FrijolPerfilPage() {
  const navigate = useNavigate();
  const { logout, token, user, setAuth } = useAuthStore();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [error, setError] = useState('');

  const [editTel, setEditTel] = useState(false);
  const [telefono, setTelefono] = useState('');
  const [errorTel, setErrorTel] = useState('');
  const [savedTel, setSavedTel] = useState(false);

  const [pwActual, setPwActual] = useState('');
  const [pwNueva, setPwNueva] = useState('');
  const [pwConfirmar, setPwConfirmar] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwExito, setPwExito] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    api.tecnico.perfil()
      .then((r: any) => { setPerfil(r); setTelefono(r?.telefono || ''); })
      .catch(() => setError('No se pudo cargar tu perfil.'));
  }, []);

  async function guardarTelefono() {
    if (telefono && telefono.length < 10) { setErrorTel('Ingresa un teléfono de 10 dígitos, o déjalo vacío.'); return; }
    setErrorTel('');
    try {
      await api.tecnico.actualizarPerfil({ telefono });
      setPerfil(p => (p ? { ...p, telefono } : p));
      setEditTel(false); setSavedTel(true); setTimeout(() => setSavedTel(false), 2000);
    } catch (e: any) { setErrorTel(e.message || 'No se pudo guardar.'); }
  }

  async function cambiarPassword() {
    setPwError('');
    if (pwNueva.length < 8) { setPwError('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (pwNueva !== pwConfirmar) { setPwError('Las contraseñas no coinciden.'); return; }
    setPwLoading(true);
    try {
      await api.tecnico.cambiarPassword(pwActual, pwNueva);
      setPwExito(true); setPwActual(''); setPwNueva(''); setPwConfirmar('');
      setPerfil(p => (p ? { ...p, debe_cambiar_pass: false } : p));
      // El guard de rutas lee el estado global: sin esto el técnico quedaría atrapado en esta pantalla.
      if (token && user) setAuth(token, { ...user, debe_cambiar_pass: false });
      setTimeout(() => setPwExito(false), 3000);
    } catch (e: any) {
      setPwError(e.message || 'No se pudo cambiar la contraseña.');
    } finally { setPwLoading(false); }
  }

  const obligada = !!perfil?.debe_cambiar_pass;

  if (!perfil) {
    return (
      <div>
        <PageHeaderTecnico title="Mi perfil" back="/frijol/tecnico" />
        <div className="px-4 py-6">{error
          ? <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-600 text-[13px]">{error}</div>
          : <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-[3px] border-[#1A5C38]/20 border-t-[#1A5C38] animate-spin" /></div>}</div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {!obligada && <PageHeaderTecnico title="Mi perfil" back="/frijol/tecnico" />}
      <div className="px-4 pt-4 space-y-3.5">
        {obligada && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-bold text-amber-900">Cambia tu contraseña para continuar</p>
              <p className="text-[12.5px] text-amber-800 mt-0.5 leading-relaxed">Entraste con una contraseña temporal. Por seguridad, define una nueva antes de usar el sistema.</p>
            </div>
          </div>
        )}

        {!obligada && (
          <>
            <section className="bg-white rounded-2xl border border-slate-100 p-5">
              <p className="text-[19px] font-bold text-slate-900 leading-tight" style={{ fontFamily: 'Patria, Georgia, serif' }}>{perfil.nombre_completo}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {perfil.tipo_tecnico_etiqueta && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#eef8f2] text-[#1A5C38]"><BadgeCheck size={12} /> {perfil.tipo_tecnico_etiqueta}</span>
                )}
                {(perfil.programas || []).map(p => (
                  <span key={p} className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-slate-200 text-slate-600">
                    {p === PROGRAMA_FRIJOL ? 'Frijol' : p === PROGRAMA_MAIZ ? 'Maíz' : p}
                  </span>
                ))}
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
              <div className="flex items-center justify-between px-5 py-3.5">
                <span className="flex items-center gap-2.5 text-[13px] text-slate-500 font-medium"><Mail size={15} className="text-[#1A5C38]" /> Correo</span>
                <span className="text-[13px] font-semibold text-slate-800 break-all text-right">{perfil.email}</span>
              </div>
              <div className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2.5 text-[13px] text-slate-500 font-medium"><Phone size={15} className="text-[#1A5C38]" /> Teléfono</span>
                  {!editTel && (
                    <span className="flex items-center gap-2">
                      {savedTel && <span className="text-[11px] text-emerald-600 font-bold">Guardado ✓</span>}
                      <span className="text-[14px] font-semibold text-slate-800">{perfil.telefono || <span className="text-slate-300 font-normal text-[13px]">sin teléfono</span>}</span>
                      <button onClick={() => setEditTel(true)} aria-label="Editar teléfono" className="w-9 h-9 rounded-xl bg-[#eef8f2] flex items-center justify-center active:scale-95"><Edit2 size={13} className="text-[#1A5C38]" /></button>
                    </span>
                  )}
                </div>
                {editTel && (
                  <div className="mt-2.5">
                    <div className="flex gap-2">
                      <input type="tel" inputMode="numeric" autoFocus value={telefono} maxLength={10}
                        onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="flex-1 bg-[#f4fbf7] border-2 border-[#1A5C38]/20 focus:border-[#1A5C38] rounded-xl px-3 py-2.5 text-[16px] outline-none" />
                      <button onClick={guardarTelefono} aria-label="Guardar teléfono" className="w-11 h-11 rounded-xl bg-[#1A5C38] flex items-center justify-center active:scale-95"><Check size={16} className="text-white" /></button>
                      <button onClick={() => { setEditTel(false); setErrorTel(''); setTelefono(perfil.telefono || ''); }} aria-label="Cancelar" className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"><X size={15} className="text-slate-400" /></button>
                    </div>
                    {errorTel && <p className="text-[12px] text-red-500 font-medium mt-1.5">{errorTel}</p>}
                  </div>
                )}
              </div>
              <div className="px-5 py-3.5">
                <p className="flex items-center gap-2.5 text-[13px] text-slate-500 font-medium mb-1.5"><MapPin size={15} className="text-[#1A5C38]" /> Zona de operación</p>
                {resumenZona(perfil.zona).length === 0
                  ? <p className="text-[13px] text-slate-300">Sin zona asignada</p>
                  : resumenZona(perfil.zona).map(z => <p key={z} className="text-[13px] text-slate-700 leading-relaxed">{z}</p>)}
              </div>
            </section>
          </>
        )}

        <section className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <KeyRound size={15} className="text-[#1A5C38]" />
            <p className="text-[13px] font-bold text-slate-700">Cambiar contraseña</p>
          </div>
          <div className="px-5 pb-4 pt-2 space-y-2.5">
            <input type="password" placeholder="Contraseña actual" value={pwActual} onChange={e => setPwActual(e.target.value)} autoComplete="current-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-[16px] outline-none focus:border-[#1A5C38]/40" />
            <input type="password" placeholder="Nueva contraseña (mín. 8 caracteres)" value={pwNueva} onChange={e => setPwNueva(e.target.value)} autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-[16px] outline-none focus:border-[#1A5C38]/40" />
            <input type="password" placeholder="Confirmar nueva contraseña" value={pwConfirmar} onChange={e => setPwConfirmar(e.target.value)} autoComplete="new-password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-[16px] outline-none focus:border-[#1A5C38]/40" />
            {pwError && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5"><p className="text-red-600 text-[12.5px] font-medium">{pwError}</p></div>}
            {pwExito && <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5"><p className="text-emerald-700 text-[12.5px] font-bold">✓ Contraseña actualizada correctamente</p></div>}
            <button onClick={cambiarPassword} disabled={pwLoading || !pwActual || !pwNueva || !pwConfirmar}
              className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white rounded-xl py-3.5 font-bold text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40">
              {pwLoading ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={14} />}
              {pwLoading ? 'Guardando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </section>

        <button onClick={() => { logout(); navigate('/frijol/tecnico/login'); }}
          className="w-full flex items-center justify-center gap-2 py-4 text-red-500 font-semibold text-[14px] active:opacity-70">
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
