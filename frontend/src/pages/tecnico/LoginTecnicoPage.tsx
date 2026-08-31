import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, ChevronLeft, AlertCircle, Loader2, Info,
  ClipboardCheck, MapPin, UserCheck, Wheat,
} from 'lucide-react';
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
      if (!res?.token || !res?.usuario) throw new Error('Credenciales incorrectas');
      setAuth(res.token, { ...res.usuario, userId: res.usuario?.id, rol: 'capturista' });
      if (res.usuario?.debe_cambiar_pass) {
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
    'w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3.5 text-base text-white ' +
    'placeholder-white/30 focus:ring-2 focus:ring-white/50 focus:outline-none transition-all';

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#061510] via-[#0c2e1a] to-[#1A5C38]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(52,208,121,0.1),transparent)]" />
        <div className="absolute bottom-0 inset-x-0 h-32 flex items-end justify-around px-6 opacity-[0.05] pointer-events-none">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
            <Wheat key={i} size={i % 3 === 0 ? 48 : i % 2 === 0 ? 36 : 26} className="text-white mb-1" style={{ transform: `rotate(${(i - 4) * 3}deg)` }} />
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="relative flex items-center px-4 py-3 flex-shrink-0">
        <button
          onClick={() => navigate('/bienvenida')}
          className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors flex items-center gap-1 text-white/70"
        >
          <ChevronLeft size={22} /> <span className="text-sm font-medium">Volver</span>
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 pb-8 overflow-y-auto">
        <div className="w-full max-w-sm lg:max-w-5xl lg:flex lg:flex-row lg:items-center lg:gap-20 animate-auth-in">

          {/* Panel izquierdo — solo desktop */}
          <div className="hidden lg:flex flex-col flex-1 px-6">
            <div className="w-20 h-20 bg-[#1A5C38] rounded-[24px] flex items-center justify-center shadow-2xl shadow-green-900/50 mb-8">
              <ClipboardCheck size={36} className="text-white" />
            </div>
            <h2 className="text-4xl font-bold text-white leading-tight mb-4 tracking-tight">
              Acceso para<br />Técnicos ECA
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-8">
              Ingresa con tu correo y contraseña para registrar productores y sus parcelas en campo.
            </p>
            <div className="space-y-4">
              {[
                { icon: <UserCheck size={18} />, text: 'Verifica CURP contra el padrón SADER/RENAPO' },
                { icon: <MapPin size={18} />, text: 'Captura la parcela con mapa y polígono' },
                { icon: <ClipboardCheck size={18} />, text: 'Registra el ciclo productivo de cada UP' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-white/60">
                  <span className="text-green-400/70">{item.icon}</span>
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Panel del formulario */}
          <div className="flex-1 lg:max-w-sm w-full">

            {/* Icon + title — oculto en desktop */}
            <div className="flex justify-center mb-5 lg:hidden">
              <div className="w-16 h-16 bg-[#1A5C38] rounded-[20px] flex items-center justify-center shadow-xl shadow-green-900/40">
                <ClipboardCheck size={28} className="text-white" />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white text-center tracking-tight lg:hidden">Técnico ECA</h1>
            <p className="text-white/50 text-sm sm:text-base text-center mt-1.5 mb-7 lg:hidden">
              Registro de productores en campo
            </p>
            <h1 className="hidden lg:block text-2xl font-bold text-white tracking-tight mb-6">Iniciar sesión</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5">Correo electrónico</label>
                <input
                  type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  required autoComplete="email" placeholder="tecnico@eca.simac.gob.mx"
                  autoCapitalize="off" inputMode="email"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'} value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    required autoComplete="current-password" placeholder="••••••••"
                    className={`${inputCls} pr-12`}
                  />
                  <button type="button" onClick={() => setShowPwd(p => !p)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors">
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex items-start gap-2">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {avisoCambioPass && (
                <div className="p-3 bg-amber-500/15 ring-1 ring-amber-400/30 rounded-xl text-amber-200 text-sm flex items-start gap-2">
                  <Info size={15} className="shrink-0 mt-0.5" />
                  <span>Por seguridad, deberás cambiar tu contraseña próximamente.</span>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] py-4 rounded-2xl text-base font-bold
                           disabled:opacity-40 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 mt-1">
                {loading ? <><Loader2 size={18} className="animate-spin" /> Ingresando…</> : 'Entrar'}
              </button>
            </form>

            <p className="mt-6 text-center text-[12px] text-white/35 leading-relaxed px-4">
              Acceso exclusivo para personal técnico de campo del Plan Nacional Maíz.
            </p>
          </div>{/* fin panel formulario */}
        </div>
      </div>
    </div>
  );
}
