import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Wheat, Phone, KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

type Step = 'curp' | 'telefono' | 'nuevo_nip' | 'exito';

export default function RecuperarNipPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<Step>('curp');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [curp, setCurp] = useState<string>((location.state as any)?.curp || '');
  const [telefonoEnmascarado, setTelefonoEnmascarado] = useState<string | null>(null);
  const [ultimos4, setUltimos4] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [nuevoNip, setNuevoNip] = useState('');
  const [confirmarNip, setConfirmarNip] = useState('');

  const stepNums: Record<Step, number> = { curp: 1, telefono: 2, nuevo_nip: 3, exito: 3 };
  const stepActual = stepNums[step];

  const handleBack = () => {
    setError('');
    if (step === 'telefono') { setStep('curp'); setUltimos4(''); }
    else if (step === 'nuevo_nip') { setStep('telefono'); setNuevoNip(''); setConfirmarNip(''); }
    else navigate('/maiz/productor/login');
  };

  // Paso 1: verificar CURP
  const handleVerificarCurp = async () => {
    if (curp.length !== 18) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/productor/auth/recuperar-nip/verificar-curp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al verificar'); return; }
      setChallengeToken(data.challenge_token || '');
      setTelefonoEnmascarado(data.telefono_enmascarado);
      setStep('telefono');
    } catch { setError('Error de conexión. Intenta de nuevo.'); }
    finally { setLoading(false); }
  };

  // Paso 2: confirmar teléfono completo (extraemos últimos 4 para el backend)
  const handleConfirmarTelefono = async () => {
    const digits = ultimos4.replace(/\D/g, '');
    if (digits.length !== 10) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/productor/auth/recuperar-nip/confirmar-telefono`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: challengeToken, ultimos4: digits.slice(-4) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Los dígitos no coinciden'); return; }
      setResetToken(data.reset_token);
      setStep('nuevo_nip');
    } catch { setError('Error de conexión. Intenta de nuevo.'); }
    finally { setLoading(false); }
  };

  // Paso 3: guardar nuevo NIP
  const handleNuevoNip = async () => {
    if (nuevoNip.length !== 4 || confirmarNip.length !== 4) return;
    if (nuevoNip !== confirmarNip) { setError('Los NIPs no coinciden'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/productor/auth/recuperar-nip/nuevo-nip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_token: resetToken, nuevo_pin: nuevoNip }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al actualizar'); return; }
      setStep('exito');
    } catch { setError('Error de conexión. Intenta de nuevo.'); }
    finally { setLoading(false); }
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
        {step !== 'exito' ? (
          <>
            <button onClick={handleBack} className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors">
              <ChevronLeft size={22} className="text-white/70" />
            </button>
            <div className="flex-1 flex justify-center gap-1.5">
              {[1, 2, 3].map(n => (
                <div key={n} className={`h-1 rounded-full transition-all duration-300 ${n === stepActual ? 'w-8 bg-white' : n < stepActual ? 'w-8 bg-green-400' : 'w-5 bg-white/25'}`} />
              ))}
            </div>
            <div className="w-9" />
          </>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-5 py-4">
        <div className="w-full max-w-sm lg:max-w-4xl flex flex-col lg:flex-row lg:items-center lg:gap-16">

          {/* Left panel — desktop branding */}
          {step !== 'exito' && (
            <div className="hidden lg:flex flex-col items-start flex-1 px-4">
              <div className="w-14 h-14 bg-[#1A5C38] rounded-[18px] flex items-center justify-center shadow-xl shadow-green-900/40 mb-5">
                {step === 'curp' && <Wheat size={26} className="text-white" />}
                {step === 'telefono' && <Phone size={26} className="text-white" />}
                {step === 'nuevo_nip' && <KeyRound size={26} className="text-white" />}
              </div>
              <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                {step === 'curp' ? 'Recuperar NIP' : step === 'telefono' ? 'Verifica tu identidad' : 'Nuevo NIP'}
              </h1>
              <p className="text-white/50 text-base leading-relaxed">
                {step === 'curp' ? 'Ingresa tu CURP para continuar.' : step === 'telefono' ? 'Confirma el número de teléfono con el que creaste tu cuenta.' : 'Elige un NIP de 4 dígitos para tu cuenta.'}
              </p>
            </div>
          )}

          {/* Form panel */}
          <div className="flex-1 lg:max-w-sm w-full">

            {/* ── PASO 1: CURP ── */}
            {step === 'curp' && (
              <div>
                <div className="flex lg:hidden justify-center mb-4">
                  <div className="w-12 h-12 bg-[#1A5C38] rounded-[16px] flex items-center justify-center shadow-xl shadow-green-900/40">
                    <Wheat size={22} className="text-white" />
                  </div>
                </div>
                <h1 className="lg:hidden text-xl font-bold text-white text-center mb-1">Recuperar NIP</h1>
                <p className="lg:hidden text-white/50 text-sm text-center mb-4">Ingresa tu CURP para continuar</p>
                <div className="bg-white/10 backdrop-blur-md ring-1 ring-white/15 rounded-2xl p-4 sm:p-5">
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">CURP</label>
                  <input
                    type="text"
                    value={curp}
                    onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    maxLength={18}
                    placeholder="AAAA000000AAAAAA00"
                    autoCapitalize="characters"
                    className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-2.5 sm:py-3 text-base font-mono tracking-widest text-white placeholder-white/25 focus:ring-2 focus:ring-white/40 focus:outline-none transition-all"
                  />
                  <div className="flex justify-end mt-1"><span className="text-xs text-white/40 font-mono">{curp.length}/18</span></div>
                  {error && (
                    <div className="mt-3 p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />{error}
                    </div>
                  )}
                  <button
                    onClick={handleVerificarCurp}
                    disabled={curp.length !== 18 || loading}
                    className="mt-4 w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Verificando...</> : 'Continuar'}
                  </button>
                </div>
                <p className="text-white/30 text-xs text-center mt-4">
                  Tu CURP está en tu credencial INE o acta de nacimiento.
                </p>
              </div>
            )}

            {/* ── PASO 2: TELÉFONO ── */}
            {step === 'telefono' && (
              <div>
                <div className="flex lg:hidden justify-center mb-4">
                  <div className="w-12 h-12 bg-[#1A5C38] rounded-[16px] flex items-center justify-center shadow-xl shadow-green-900/40">
                    <Phone size={22} className="text-white" />
                  </div>
                </div>
                <h1 className="lg:hidden text-xl font-bold text-white text-center mb-1">Verifica tu identidad</h1>
                <p className="lg:hidden text-white/50 text-sm text-center mb-4">
                  Confirma el número de teléfono con el que creaste tu cuenta
                </p>

                {!telefonoEnmascarado && (
                  <div className="flex items-center gap-2 bg-amber-500/15 ring-1 ring-amber-400/30 rounded-xl px-3 py-2.5 mb-4">
                    <AlertCircle size={14} className="text-amber-300 shrink-0" />
                    <p className="text-amber-200 text-xs">No se encontró teléfono registrado. Contacta a soporte.</p>
                  </div>
                )}

                {telefonoEnmascarado && (
                  <div className="flex items-center gap-2.5 bg-white/8 ring-1 ring-white/15 rounded-xl px-3.5 py-2.5 mb-4">
                    <Phone size={14} className="text-green-300 shrink-0" />
                    <p className="text-white/70 text-sm">
                      Número registrado:{' '}
                      <span className="font-mono font-bold text-white">{telefonoEnmascarado}</span>
                    </p>
                  </div>
                )}

                <div className="bg-white/10 backdrop-blur-md ring-1 ring-white/15 rounded-2xl p-4 sm:p-5">
                  <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                    Número de teléfono (10 dígitos)
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={ultimos4}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setUltimos4(raw);
                    }}
                    maxLength={10}
                    placeholder="55 1234 5678"
                    autoComplete="tel"
                    className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3 text-lg font-mono tracking-widest text-white text-center placeholder-white/20 focus:ring-2 focus:ring-white/40 focus:outline-none transition-all"
                  />
                  <p className="mt-2 text-white/35 text-xs text-center">
                    Ingresa el número completo tal como lo registraste
                  </p>
                  {error && (
                    <div className="mt-3 p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />{error}
                    </div>
                  )}
                  <button
                    onClick={handleConfirmarTelefono}
                    disabled={ultimos4.replace(/\D/g, '').length !== 10 || loading}
                    className="mt-4 w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Verificando...</> : 'Verificar'}
                  </button>
                </div>
                <p className="text-white/25 text-xs text-center mt-3">
                  ¿No recuerdas tu número? Contacta al administrador del sistema.
                </p>
              </div>
            )}

            {/* ── PASO 3: NUEVO NIP ── */}
            {step === 'nuevo_nip' && (
              <div>
                <div className="flex lg:hidden justify-center mb-4">
                  <div className="w-12 h-12 bg-[#1A5C38] rounded-[16px] flex items-center justify-center shadow-xl shadow-green-900/40">
                    <KeyRound size={22} className="text-white" />
                  </div>
                </div>
                <h1 className="lg:hidden text-xl font-bold text-white text-center mb-1">Nuevo NIP</h1>
                <p className="lg:hidden text-white/50 text-sm text-center mb-4">Elige un NIP de 4 dígitos para tu cuenta</p>
                <div className="bg-white/10 backdrop-blur-md ring-1 ring-white/15 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">Nuevo NIP</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={nuevoNip}
                      onChange={e => setNuevoNip(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      placeholder="••••"
                      className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-2.5 sm:py-3 text-xl font-mono tracking-[0.5em] text-white text-center placeholder-white/25 focus:ring-2 focus:ring-white/40 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">Confirmar NIP</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={confirmarNip}
                      onChange={e => setConfirmarNip(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      maxLength={4}
                      placeholder="••••"
                      className={`w-full bg-white/10 ring-1 rounded-xl px-4 py-2.5 sm:py-3 text-xl font-mono tracking-[0.5em] text-white text-center placeholder-white/25 focus:outline-none transition-all ${confirmarNip.length === 4 && confirmarNip !== nuevoNip ? 'ring-red-400/60' : 'ring-white/20 focus:ring-white/40'}`}
                    />
                  </div>
                  {error && (
                    <div className="p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />{error}
                    </div>
                  )}
                  <button
                    onClick={handleNuevoNip}
                    disabled={nuevoNip.length !== 4 || confirmarNip.length !== 4 || loading}
                    className="w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : 'Guardar nuevo NIP'}
                  </button>
                </div>
              </div>
            )}

            {/* ── ÉXITO ── */}
            {step === 'exito' && (
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={34} className="text-green-400" />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">¡NIP actualizado!</h1>
                <p className="text-white/60 text-sm mb-6">Ya puedes iniciar sesión con tu nuevo NIP.</p>
                <button
                  onClick={() => navigate('/maiz/productor/login', { state: { curp } })}
                  className="w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all"
                >
                  Ir al inicio de sesión
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
