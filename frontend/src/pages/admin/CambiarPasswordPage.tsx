import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../store/auth';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function CambiarPasswordPage() {
  const navigate = useNavigate();
  const { user, token, setAuth } = useAuthStore();

  const [actual,    setActual]    = useState('');
  const [nueva,     setNueva]     = useState('');
  const [confirma,  setConfirma]  = useState('');
  const [showA,     setShowA]     = useState(false);
  const [showN,     setShowN]     = useState(false);
  const [showC,     setShowC]     = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [ok,        setOk]        = useState(false);

  const HDR = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('simac_token')}`,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (nueva.length < 8) { setError('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    if (nueva !== confirma) { setError('Las contraseñas no coinciden'); return; }

    setLoading(true);
    try {
      const r = await fetch(`${BASE}/auth/cambiar-password`, {
        method: 'POST', headers: HDR(),
        body: JSON.stringify({ password_actual: actual, password_nuevo: nueva }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Error al cambiar contraseña'); return; }

      setOk(true);
      // Actualizar store: debe_cambiar_pass = false
      if (token && user) {
        setAuth(token, { ...user, debe_cambiar_pass: false });
      }
      setTimeout(() => {
        const redirectTo = (user as any)?.redirect_post_login || '/maiz/admin';
        navigate(redirectTo, { replace: true });
      }, 1800);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = (_show: boolean) =>
    'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#1A5C38]/50 focus:ring-2 focus:ring-[#1A5C38]/10 transition-all pr-10';

  const ToggleEye = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0e5c33] to-[#0a3d22] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-4 shadow-lg">
            <ShieldCheck size={28} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-white text-xl font-black tracking-tight">Maíz</h1>
          <p className="text-white/60 text-xs font-medium mt-0.5 tracking-wide uppercase">Plan Nacional Maíz</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-[#0e5c33] px-6 py-5">
            <div className="flex items-center gap-3">
              <Lock size={18} className="text-emerald-300" />
              <div>
                <p className="text-white text-[13px] font-bold">Cambio de contraseña requerido</p>
                <p className="text-white/55 text-[11px] mt-0.5">
                  Hola {user?.nombre_completo?.split(' ')[0] ?? 'usuario'}, debes crear una contraseña segura antes de continuar.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 flex flex-col gap-4">

            {/* Contraseña actual */}
            <div>
              <label className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Contraseña temporal actual
              </label>
              <div className="relative">
                <input type={showA ? 'text' : 'password'} value={actual}
                  onChange={e => setActual(e.target.value)} placeholder="Contraseña que te enviaron"
                  className={inputCls(showA)} required autoComplete="current-password" />
                <ToggleEye show={showA} onToggle={() => setShowA(v => !v)} />
              </div>
            </div>

            {/* Nueva */}
            <div>
              <label className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Nueva contraseña
              </label>
              <div className="relative">
                <input type={showN ? 'text' : 'password'} value={nueva}
                  onChange={e => setNueva(e.target.value)} placeholder="Mínimo 8 caracteres"
                  className={inputCls(showN)} required autoComplete="new-password" />
                <ToggleEye show={showN} onToggle={() => setShowN(v => !v)} />
              </div>
              {nueva.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {[4,6,8,12].map(n => (
                    <div key={n} className={`h-1 flex-1 rounded-full transition-all ${nueva.length >= n ? 'bg-[#1A5C38]' : 'bg-gray-200'}`} />
                  ))}
                </div>
              )}
            </div>

            {/* Confirmar */}
            <div>
              <label className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <input type={showC ? 'text' : 'password'} value={confirma}
                  onChange={e => setConfirma(e.target.value)} placeholder="Repite la nueva contraseña"
                  className={inputCls(showC)} required autoComplete="new-password" />
                <ToggleEye show={showC} onToggle={() => setShowC(v => !v)} />
              </div>
              {confirma.length > 0 && nueva !== confirma && (
                <p className="text-red-500 text-[11px] mt-1">Las contraseñas no coinciden</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <AlertCircle size={14} className="text-red-500 shrink-0" />
                <p className="text-red-600 text-[12px]">{error}</p>
              </div>
            )}

            {/* Éxito */}
            {ok && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                <p className="text-emerald-700 text-[12px] font-semibold">¡Contraseña actualizada! Redirigiendo…</p>
              </div>
            )}

            <button type="submit" disabled={loading || ok}
              className="w-full bg-[#0e5c33] hover:bg-[#0a3d22] disabled:opacity-60 text-white font-bold text-[13px] py-3 rounded-xl transition-all active:scale-[0.98] shadow-md hover:shadow-lg mt-1">
              {loading ? 'Actualizando…' : 'Cambiar contraseña y continuar'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
