import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, AlertCircle, ArrowRight, ShieldCheck, Info } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';

export default function LoginTecnicoPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [avisoCambioPass, setAvisoCambioPass] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res: any = await api.tecnico.login(email, password);
      if (!res?.token || !res?.user) throw new Error('Credenciales incorrectas');
      setAuth(res.token, { ...res.user, userId: res.user?.id ?? res.user?.userId, rol: 'capturista' });
      if (res.debe_cambiar_pass) {
        setAvisoCambioPass(true);
        setTimeout(() => navigate('/tecnico'), 1800);
      } else {
        navigate('/tecnico');
      }
    } catch (err: any) {
      setError(err.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    'w-full pl-11 pr-4 py-3.5 rounded-2xl text-[14px] outline-none transition-all duration-200 border bg-[#eef8f2]/50 border-slate-200 text-slate-800 placeholder-slate-400 font-medium focus:border-[#1A5C38] focus:ring-2 focus:ring-[#1A5C38]/10 focus:bg-white';

  return (
    <div className="min-h-screen bg-[#eef8f2] flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#1A5C38] flex items-center justify-center shadow-lg mb-4">
            <ShieldCheck size={26} className="text-white" />
          </div>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight">SIMAC · Técnicos ECA</h1>
          <p className="text-[13px] text-slate-500 mt-1">Registro de productores en campo</p>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">Correo electrónico</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  required autoComplete="email" placeholder="tecnico@simac.gob.mx"
                  className={inputCls} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">Contraseña</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  required autoComplete="current-password" placeholder="••••••••"
                  className={`${inputCls} pr-11`} />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-[12.5px] text-red-600">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {avisoCambioPass && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 text-[12.5px] text-amber-700">
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <p>Por seguridad, deberás cambiar tu contraseña próximamente.</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl text-[14.5px] font-bold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? (
                <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Verificando…</>
              ) : (
                <>Ingresar<ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400 leading-relaxed px-4">
          Acceso exclusivo para personal técnico de campo del Plan Nacional Maíz.
        </p>
      </div>
    </div>
  );
}
