import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Wheat, AlertCircle, Loader2, UserPlus, KeyRound, Building2, ChevronRight, LayoutDashboard, MapPin, BarChart3 } from 'lucide-react';
import PinInput from '../../components/productor/PinInput';
import { useAuthStore } from '../../store/auth';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function LoginPinPage() {
  const [curp, setCurp] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'curp' | 'pin'>('curp');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const handleContinuar = () => {
    if (curp.length !== 18) return;
    setError('');
    setStep('pin');
  };

  const handlePinChange = async (val: string) => {
    setPin(val);
    if (val.length < 4) return;

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/productor/auth/login-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curp, pin: val }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'PIN incorrecto');
        setPin('');
        return;
      }

      const token = data.token;
      setAuth(token, {
        userId: data.user.id,
        email: '',
        rol: 'productor',
        // Usar nombre_completo de usuarios (respeta ediciones de perfil);
        // fallback a padrón solo si está vacío.
        nombre_completo: data.user.nombre_completo ||
          `${data.user.nombres ?? ''} ${data.user.apellido_paterno ?? ''} ${data.user.apellido_materno ?? ''}`.trim(),
        nombres: data.user.nombres,
        apellido_paterno: data.user.apellido_paterno,
      });

      // La verificación de completitud (ubicación/ciclo) ya no se hace aquí:
      // RequireProductor consulta GET /productor/estado-registro con
      // autoridad del servidor en cualquier ruta de /productor y redirige
      // si falta algo — sin depender de un chequeo ad-hoc en el login que
      // un error de red podía saltarse silenciosamente (Ticket 05).
      navigate('/productor');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col overflow-hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#061510] via-[#0c2e1a] to-[#1A5C38]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(52,208,121,0.1),transparent)]" />
      </div>

      {/* Header */}
      <div className="relative flex items-center px-4 py-3 sm:py-4 pt-safe">
        <button
          onClick={() => step === 'pin' ? (setStep('curp'), setPin(''), setError('')) : navigate('/')}
          className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors"
        >
          <ChevronLeft size={22} className="text-white/70" />
        </button>
        {/* Step indicator */}
        <div className="flex-1 flex justify-center gap-2">
          <div className={`h-1 w-8 rounded-full transition-all duration-300 ${step === 'curp' ? 'bg-white' : 'bg-white/30'}`} />
          <div className={`h-1 w-8 rounded-full transition-all duration-300 ${step === 'pin' ? 'bg-white' : 'bg-white/30'}`} />
        </div>
        <div className="w-9" /> {/* spacer */}
      </div>

      {/* Main content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 sm:px-8 pb-8">
        <div className="w-full max-w-sm lg:max-w-5xl lg:flex lg:flex-row lg:items-center lg:gap-20">

          {/* Panel izquierdo — solo desktop */}
          <div className="hidden lg:flex flex-col flex-1 px-6">
            <div className="w-20 h-20 bg-[#1A5C38] rounded-[24px] flex items-center justify-center shadow-2xl shadow-green-900/50 mb-8">
              <Wheat size={36} className="text-white" />
            </div>
            <h2 className="text-4xl font-bold text-white leading-tight mb-4 tracking-tight">
              Acceso para<br />Productores
            </h2>
            <p className="text-white/50 text-lg leading-relaxed mb-8">
              Ingresa tu CURP y tu NIP de 4 dígitos para acceder a tu cuenta en el Sistema SIMAC.
            </p>
            <div className="space-y-4">
              {[
                { icon: <LayoutDashboard size={18} />, text: 'Gestiona tus unidades de producción' },
                { icon: <MapPin size={18} />, text: 'Registra tus parcelas con geolocalización' },
                { icon: <BarChart3 size={18} />, text: 'Consulta tus ciclos agrícolas' },
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

          {/* Icon — oculto en desktop (ya está en panel izquierdo) */}
          <div className="flex justify-center mb-6 sm:mb-8 lg:hidden">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[#1A5C38] rounded-[18px] sm:rounded-[20px] flex items-center justify-center shadow-xl shadow-green-900/40">
              {step === 'curp'
                ? <Wheat size={24} className="text-white sm:hidden" />
                : <KeyRound size={24} className="text-white sm:hidden" />
              }
              {step === 'curp'
                ? <Wheat size={28} className="text-white hidden sm:block" />
                : <KeyRound size={28} className="text-white hidden sm:block" />
              }
            </div>
          </div>

          {step === 'curp' ? (
            <div className="animate-slide-right">
              <h1 className="text-2xl sm:text-3xl font-bold text-white text-center mb-1.5 tracking-tight">
                Iniciar sesión
              </h1>
              <p className="text-white/50 text-sm sm:text-base text-center mb-6 sm:mb-8">
                Escribe tu CURP de 18 caracteres
              </p>

              <div className="bg-white/10 backdrop-blur-md ring-1 ring-white/15 rounded-2xl sm:rounded-3xl p-5 sm:p-6">
                <label className="block text-xs sm:text-sm font-semibold text-white/60 uppercase tracking-wide mb-2">
                  CURP
                </label>
                <input
                  type="text"
                  value={curp}
                  onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={18}
                  placeholder="AAAA000000AAAAAA00"
                  autoCapitalize="characters"
                  className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3.5 sm:py-4
                             text-base sm:text-lg font-mono tracking-widest text-white placeholder-white/25
                             focus:ring-2 focus:ring-white/40 focus:outline-none transition-all"
                />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="text-xs text-white/30">Está en tu credencial INE o acta de nacimiento</span>
                  <span className="text-xs text-white/40 font-mono">{curp.length}/18</span>
                </div>

                <button
                  onClick={handleContinuar}
                  disabled={curp.length !== 18}
                  className="mt-4 sm:mt-5 w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38]
                             rounded-xl py-3.5 sm:py-4 text-sm sm:text-base font-bold
                             disabled:opacity-30 active:scale-[0.98] transition-all duration-200"
                >
                  Continuar
                </button>
              </div>

              {/* Recuperar NIP */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => navigate('/recuperar-nip', { state: { curp } })}
                  className="text-[13px] text-green-300 font-semibold hover:text-green-200 transition-colors"
                >
                  ¿Olvidaste tu NIP? <span className="underline underline-offset-2">Recupéralo aquí</span>
                </button>
              </div>

              {/* Otras opciones de productor */}
              <div className="mt-5 sm:mt-6">
                <p className="text-white/40 text-xs text-center mb-2.5">¿No tienes cuenta todavía?</p>
                <div className="space-y-2.5">
                  <button onClick={() => navigate('/registro-nuevo')}
                    className="w-full flex items-center gap-3 bg-white/8 ring-1 ring-white/12 hover:bg-white/12 rounded-xl p-3 text-left active:scale-[0.98] transition-all">
                    <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <UserPlus size={17} className="text-green-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm leading-tight">Soy nuevo, registrarme</p>
                      <p className="text-white/40 text-xs mt-0.5 leading-snug">No estás en el padrón</p>
                    </div>
                    <ChevronRight size={16} className="text-white/30 shrink-0" />
                  </button>
                </div>
                <div className="border-t border-white/10 mt-4 pt-4 text-center">
                  <button onClick={() => navigate('/bienvenida', { state: { menu: 'bodega' } })}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-300 hover:text-green-200 transition-colors">
                    <Building2 size={15} /> ¿Eres bodega o industria? Ver opciones
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-slide-left text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1.5 tracking-tight">
                Ingresa tu PIN
              </h1>
              <p className="text-white/50 text-sm sm:text-base mb-6 sm:mb-8">
                PIN de 4 dígitos de tu cuenta
              </p>

              {error && (
                <div className="mb-5 mx-auto max-w-xs p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl
                                text-red-300 text-sm flex items-start gap-2 text-left">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 text-white/60 py-8">
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-sm sm:text-base">Verificando...</span>
                </div>
              ) : (
                <PinInput value={pin} onChange={handlePinChange} dark error={!!error} />
              )}

              {/* Enlace de recuperación de NIP */}
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => navigate('/recuperar-nip', { state: { curp } })}
                  className="text-[13px] text-green-300 font-semibold hover:text-green-200 transition-colors"
                >
                  ¿Olvidaste tu NIP? <span className="underline underline-offset-2">Recupéralo aquí</span>
                </button>
              </div>
            </div>
          )}
          </div>{/* fin panel formulario */}
        </div>
      </div>

    </div>
  );
}
