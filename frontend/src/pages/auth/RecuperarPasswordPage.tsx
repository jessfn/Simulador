import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Building2, Mail, CheckCircle2, AlertCircle, Loader2, Copy, Check } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function RecuperarPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/auth/recuperar-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al procesar'); return; }
      setEnviado(true);
      if (data.reset_url) setResetUrl(data.reset_url);
    } catch { setError('Error de conexión. Intenta de nuevo.'); }
    finally { setLoading(false); }
  };

  const copiarUrl = async () => {
    if (!resetUrl) return;
    await navigator.clipboard.writeText(resetUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#061510] via-[#0c2e1a] to-[#1A5C38]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(52,208,121,0.1),transparent)]" />
      </div>

      {/* Header */}
      <div className="relative flex-shrink-0 flex items-center px-4 h-12 sm:h-14">
        <button
          onClick={() => navigate('/maiz/bodega/login')}
          className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors"
        >
          <ChevronLeft size={22} className="text-white/70" />
        </button>
        <div className="flex-1 flex justify-center">
          <span className="text-sm font-semibold text-white/70">Recuperar contraseña</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-5 py-4">

        {/* Desktop: two-column wrapper */}
        <div className="w-full max-w-sm lg:max-w-4xl flex flex-col lg:flex-row lg:items-center lg:gap-16">

          {/* Left panel — desktop branding */}
          <div className="hidden lg:flex flex-col items-center lg:items-start flex-1 px-4">
            <div className="w-16 h-16 bg-[#1A5C38] rounded-[20px] flex items-center justify-center shadow-xl shadow-green-900/40 mb-5">
              <Building2 size={30} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              {enviado ? (resetUrl ? 'Enlace generado' : '¡Correo enviado!') : '¿Olvidaste tu contraseña?'}
            </h1>
            <p className="text-white/50 text-base leading-relaxed">
              {enviado
                ? (resetUrl ? 'Copia el enlace y compártelo con el usuario.' : `Revisa la bandeja de ${email}. El enlace expira en 1 hora.`)
                : 'Ingresa tu correo y te enviaremos un enlace para restablecerla.'}
            </p>
            <div className="mt-8 w-px h-32 bg-gradient-to-b from-white/20 to-transparent self-center lg:self-auto hidden lg:block" />
          </div>

          {/* Form panel */}
          <div className="flex-1 lg:max-w-sm w-full">

            {!enviado ? (
              <div>
                {/* Icon — mobile only */}
                <div className="flex lg:hidden justify-center mb-4">
                  <div className="w-12 h-12 bg-[#1A5C38] rounded-[16px] flex items-center justify-center shadow-xl shadow-green-900/40">
                    <Building2 size={22} className="text-white" />
                  </div>
                </div>

                <h1 className="lg:hidden text-xl font-bold text-white text-center mb-1 tracking-tight">
                  ¿Olvidaste tu contraseña?
                </h1>
                <p className="lg:hidden text-white/50 text-sm text-center mb-5 leading-relaxed">
                  Ingresa tu correo y te enviaremos un enlace para restablecerla.
                </p>

                <div className="bg-white/10 backdrop-blur-md ring-1 ring-white/15 rounded-2xl p-4 sm:p-5">
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      placeholder="correo@empresa.com"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="off"
                      className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl pl-9 pr-4 py-2.5 sm:py-3 text-base text-white placeholder-white/25 focus:ring-2 focus:ring-white/40 focus:outline-none transition-all"
                    />
                  </div>

                  {error && (
                    <div className="mt-3 p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />{error}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={!email.trim() || loading}
                    className="mt-4 w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : 'Enviar enlace'}
                  </button>
                </div>

                <p className="text-white/30 text-xs text-center mt-4">
                  Si no tienes acceso a tu correo, contacta al administrador.
                </p>
              </div>
            ) : (
              <div className="text-center">
                {/* Icon — mobile only */}
                <div className="flex lg:hidden justify-center mb-4">
                  <div className="w-14 h-14 bg-green-400/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={30} className="text-green-400" />
                  </div>
                </div>

                <h1 className="lg:hidden text-xl font-bold text-white mb-2">
                  {resetUrl ? 'Enlace generado' : '¡Correo enviado!'}
                </h1>
                <p className="lg:hidden text-white/60 text-sm mb-5 leading-relaxed">
                  {resetUrl
                    ? 'No hay servicio de correo. Copia el enlace y compártelo.'
                    : `Revisa la bandeja de ${email}. El enlace expira en 1 hora.`}
                </p>

                {resetUrl && (
                  <div className="bg-white/10 ring-1 ring-white/20 rounded-2xl p-4 mb-4 text-left">
                    <p className="text-green-300 text-xs font-semibold uppercase tracking-wide mb-2">Enlace de restablecimiento</p>
                    <p className="text-white/80 text-xs font-mono break-all leading-relaxed">{resetUrl}</p>
                    <button
                      onClick={copiarUrl}
                      className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-green-300 hover:text-green-200 transition-colors"
                    >
                      {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar enlace</>}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => navigate('/maiz/bodega/login')}
                  className="w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all"
                >
                  Volver al inicio de sesión
                </button>
                <button
                  onClick={() => { setEnviado(false); setResetUrl(null); setEmail(''); }}
                  className="mt-3 w-full bg-white/10 ring-1 ring-white/20 hover:bg-white/15 text-white rounded-xl py-3 text-sm font-medium active:scale-[0.98] transition-all"
                >
                  Intentar con otro correo
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
