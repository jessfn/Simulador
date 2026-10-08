import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, KeyRound, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function Regla({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs transition-colors ${ok ? 'text-green-300' : 'text-white/40'}`}>
      <div className={`w-1.5 h-1.5 rounded-full transition-colors ${ok ? 'bg-green-400' : 'bg-white/25'}`} />
      {texto}
    </div>
  );
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [verificando, setVerificando] = useState(true);
  const [tokenValido, setTokenValido] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(false);

  const longitud = password.length >= 8;
  const tieneNum = /\d/.test(password);
  const tieneMayus = /[A-Z]/.test(password);
  const coinciden = password === confirmar && confirmar.length > 0;
  const formValido = longitud && tieneNum && tieneMayus && coinciden;

  useEffect(() => {
    if (!token) { setTokenError('Token inválido o faltante.'); setVerificando(false); return; }
    fetch(`${BASE}/auth/verificar-token-reset/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) setTokenValido(true);
        else setTokenError(data.error || 'El enlace no es válido o ya expiró.');
      })
      .catch(() => setTokenError('Error de conexión. Intenta de nuevo.'))
      .finally(() => setVerificando(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!formValido || !token) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${BASE}/auth/nuevo-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al actualizar'); return; }
      setExito(true);
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
        <button
          onClick={() => navigate('/maiz/bodega/login')}
          className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors"
        >
          <ChevronLeft size={22} className="text-white/70" />
        </button>
        <div className="flex-1 flex justify-center">
          <span className="text-sm font-semibold text-white/70">Nueva contraseña</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-5 py-4">
        <div className="w-full max-w-sm lg:max-w-4xl flex flex-col lg:flex-row lg:items-center lg:gap-16">

          {/* Left panel — desktop branding */}
          <div className="hidden lg:flex flex-col items-start flex-1 px-4">
            <div className="w-16 h-16 bg-[#1A5C38] rounded-[20px] flex items-center justify-center shadow-xl shadow-green-900/40 mb-5">
              <KeyRound size={30} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              {verificando ? 'Verificando enlace…' : !tokenValido ? 'Enlace inválido' : exito ? '¡Contraseña actualizada!' : 'Nueva contraseña'}
            </h1>
            <p className="text-white/50 text-base leading-relaxed">
              {exito ? 'Ya puedes iniciar sesión con tu nueva contraseña.' : 'Elige una contraseña segura para tu cuenta.'}
            </p>
          </div>

          {/* Form panel */}
          <div className="flex-1 lg:max-w-sm w-full">

            {/* Cargando verificación */}
            {verificando && (
              <div className="text-center py-8">
                <Loader2 size={32} className="animate-spin text-green-400 mx-auto mb-3" />
                <p className="text-white/60 text-sm">Verificando enlace...</p>
              </div>
            )}

            {/* Token inválido */}
            {!verificando && !tokenValido && (
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 bg-red-500/15 rounded-full flex items-center justify-center">
                    <AlertCircle size={30} className="text-red-400" />
                  </div>
                </div>
                <h1 className="lg:hidden text-xl font-bold text-white mb-2">Enlace inválido</h1>
                <p className="text-white/60 text-sm mb-6 leading-relaxed">{tokenError}</p>
                <button
                  onClick={() => navigate('/maiz/recuperar-password')}
                  className="w-full bg-white text-[#1A5C38] rounded-xl py-3 text-sm font-bold active:scale-[0.98] transition-all"
                >
                  Solicitar nuevo enlace
                </button>
                <button
                  onClick={() => navigate('/maiz/bodega/login')}
                  className="mt-3 w-full bg-white/10 ring-1 ring-white/20 text-white rounded-xl py-3 text-sm font-medium active:scale-[0.98] transition-all"
                >
                  Volver al inicio
                </button>
              </div>
            )}

            {/* Formulario */}
            {!verificando && tokenValido && !exito && (
              <div>
                {/* Icon + title — mobile only */}
                <div className="flex lg:hidden justify-center mb-4">
                  <div className="w-12 h-12 bg-[#1A5C38] rounded-[16px] flex items-center justify-center shadow-xl shadow-green-900/40">
                    <KeyRound size={22} className="text-white" />
                  </div>
                </div>
                <h1 className="lg:hidden text-xl font-bold text-white text-center mb-1 tracking-tight">
                  Nueva contraseña
                </h1>
                <p className="lg:hidden text-white/50 text-sm text-center mb-4">
                  Elige una contraseña segura para tu cuenta.
                </p>

                <div className="bg-white/10 backdrop-blur-md ring-1 ring-white/15 rounded-2xl p-4 sm:p-5 space-y-3">
                  {/* Campo contraseña */}
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                      Nueva contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={mostrarPass ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                        className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 pr-11 py-2.5 sm:py-3 text-base text-white placeholder-white/25 focus:ring-2 focus:ring-white/40 focus:outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarPass(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                      >
                        {mostrarPass ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  {/* Reglas */}
                  {password.length > 0 && (
                    <div className="flex flex-col gap-1 pl-1">
                      <Regla ok={longitud} texto="Mínimo 8 caracteres" />
                      <Regla ok={tieneNum} texto="Al menos un número" />
                      <Regla ok={tieneMayus} texto="Al menos una mayúscula" />
                    </div>
                  )}

                  {/* Confirmar */}
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                      Confirmar contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={mostrarConfirmar ? 'text' : 'password'}
                        value={confirmar}
                        onChange={e => setConfirmar(e.target.value)}
                        placeholder="Repite tu contraseña"
                        autoComplete="new-password"
                        className={`w-full bg-white/10 ring-1 rounded-xl px-4 pr-11 py-2.5 sm:py-3 text-base text-white placeholder-white/25 focus:outline-none transition-all ${
                          confirmar.length > 0 && !coinciden
                            ? 'ring-red-400/60 focus:ring-red-400/80'
                            : 'ring-white/20 focus:ring-white/40'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setMostrarConfirmar(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                      >
                        {mostrarConfirmar ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                    {confirmar.length > 0 && !coinciden && (
                      <p className="mt-1 text-xs text-red-400">Las contraseñas no coinciden</p>
                    )}
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex gap-2">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />{error}
                    </div>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={!formValido || loading}
                    className="w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : 'Guardar contraseña'}
                  </button>
                </div>
              </div>
            )}

            {/* Éxito */}
            {exito && (
              <div className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="w-14 h-14 bg-green-400/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={30} className="text-green-400" />
                  </div>
                </div>
                <h1 className="lg:hidden text-xl font-bold text-white mb-2">¡Contraseña actualizada!</h1>
                <p className="lg:hidden text-white/60 text-sm mb-6 leading-relaxed">
                  Ya puedes iniciar sesión con tu nueva contraseña.
                </p>
                <button
                  onClick={() => navigate('/maiz/bodega/login')}
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
