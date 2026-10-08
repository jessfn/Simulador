import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Eye, EyeOff, ShieldAlert, User, Mail, Lock,
  CheckCircle2, AlertCircle, ArrowRight, KeyRound, Sparkles
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Campo {
  nombre_completo: string; email: string;
  password: string; confirmar: string; codigo: string;
}

function AnimatedCanvas({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d')!; let raf: number;
    const W = () => c.offsetWidth, H = () => c.offsetHeight;
    const resize = () => { c.width = W(); c.height = H(); };
    resize(); window.addEventListener('resize', resize);
    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * W(), y: Math.random() * H(),
      r: Math.random() * 1.6 + 0.4,
      dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3, a: Math.random(),
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      pts.forEach((p, i) => {
        pts.slice(i + 1).forEach(q => {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 110) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(52,211,153,${(1 - d / 110) * 0.18})`; ctx.lineWidth = 0.7; ctx.stroke();
          }
        });
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0 || p.x > W()) p.dx *= -1;
        if (p.y < 0 || p.y > H()) p.dy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(52,211,153,${0.3 + p.a * 0.35})`; ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className={`absolute inset-0 w-full h-full ${className}`} />;
}

function useStrength(pwd: string) {
  let s = 0;
  if (pwd.length >= 8) s++; if (/[A-Z]/.test(pwd)) s++;
  if (/[0-9]/.test(pwd)) s++; if (/[^A-Za-z0-9]/.test(pwd)) s++;
  return s;
}
const strLabel = ['', 'Débil', 'Regular', 'Buena', 'Muy segura'];
const strBg    = ['', 'bg-red-500', 'bg-amber-400', 'bg-lime-400', 'bg-emerald-400'];
const strText  = ['', 'text-red-400', 'text-amber-400', 'text-lime-400', 'text-emerald-300'];

export default function RegistroAdminPage() {
  const [form, setForm] = useState<Campo>({ nombre_completo: '', email: '', password: '', confirmar: '', codigo: '' });
  const [showPwd, setShowPwd]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);
  const [focused, setFocused]         = useState<string | null>(null);
  const navigate = useNavigate();
  const s = useStrength(form.password);

  function set(field: keyof Campo, val: string) { setForm(p => ({ ...p, [field]: val })); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!form.nombre_completo.trim()) return setError('El nombre completo es obligatorio.');
    if (!form.email.trim()) return setError('El correo es obligatorio.');
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (form.password !== form.confirmar) return setError('Las contraseñas no coinciden.');
    if (!form.codigo.trim()) return setError('El código de acceso corporativo es obligatorio.');
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/registro-admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_completo: form.nombre_completo.trim(), email: form.email.trim().toLowerCase(), password: form.password, codigo_acceso: form.codigo.trim(), rol: 'admin' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al registrar.');
      setSuccess(true);
    } catch (err: any) { setError(err.message || 'Error al crear cuenta.'); }
    finally { setLoading(false); }
  }

  const inputCls = (f: string) => [
    'w-full pl-11 pr-4 py-3.5 rounded-2xl text-[14px] outline-none transition-all duration-200',
    'bg-white/[0.05] border text-white placeholder-white/25 font-medium',
    focused === f ? 'border-emerald-400/60 ring-2 ring-emerald-400/15 bg-white/[0.08]' : 'border-white/10 hover:border-white/20',
  ].join(' ');

  /* ── SUCCESS ── */
  if (success) {
    return (
      <div className="min-h-screen bg-[#050f0a] flex items-center justify-center p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#062917] via-[#041f12] to-[#020d07]" />
        <div className="absolute -top-[10%] -left-[5%] w-[55%] h-[55%] bg-emerald-500/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[15%] -right-[10%] w-[45%] h-[45%] bg-teal-400/10 rounded-full blur-[90px]" />
        <div className="relative z-10 text-center max-w-sm w-full animate-auth-in">
          <div className="flex justify-center mb-7">
            <div className="relative">
              <div className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_60px_rgba(52,211,153,0.5)]">
                <CheckCircle2 className="text-white" size={40} strokeWidth={1.8} />
              </div>
              <div className="absolute inset-0 rounded-[28px] border-2 border-emerald-400/25 animate-ping" style={{ animationDuration: '2.5s' }} />
              <span className="absolute -top-2.5 -right-2.5 w-7 h-7 bg-lime-400 rounded-full flex items-center justify-center shadow-[0_0_16px_rgba(163,230,53,0.7)]">
                <Sparkles size={14} className="text-emerald-900" />
              </span>
            </div>
          </div>
          <h2 className="text-[28px] font-black text-white mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            ¡Cuenta creada!
          </h2>
          <p className="text-[13.5px] text-white/40 leading-relaxed mb-8">
            Tu cuenta administrativa ha sido registrada. Ya puedes iniciar sesión en el panel de control.
          </p>
          <button onClick={() => navigate('/maiz/admin/login')}
            className="w-full group relative overflow-hidden rounded-2xl py-4 text-[14.5px] font-bold text-white transition-all duration-300 active:scale-[0.98] shadow-[0_8px_30px_rgba(52,211,153,0.3)]"
            style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%)' }}>
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
            <span className="relative flex items-center justify-center gap-2">Ir al Login<ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050f0a] flex flex-col lg:flex-row overflow-x-hidden">

      {/* ════ LEFT PANEL desktop ════ */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[50%] relative flex-col justify-between p-10 xl:p-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#062917] via-[#041f12] to-[#020d07]" />
        <div className="absolute -top-[10%] -left-[5%] w-[55%] h-[55%] bg-emerald-500/15 rounded-full blur-[110px]" />
        <div className="absolute -bottom-[15%] -right-[10%] w-[45%] h-[45%] bg-teal-400/10 rounded-full blur-[90px]" />
        <div className="absolute top-[45%] right-[5%] w-[25%] h-[25%] bg-lime-300/8 rounded-full blur-[60px]" />
        <AnimatedCanvas />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_24px_rgba(52,211,153,0.4)]">
            <ShieldAlert size={19} className="text-white" strokeWidth={2.3} />
          </div>
          <div>
            <span className="text-[17px] font-black text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Maíz</span>
            <span className="ml-1.5 text-[9px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Admin</span>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center py-10">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.25em] mb-4">Acceso administrativo</p>
          <h2 className="text-[36px] xl:text-[42px] font-black text-white leading-[1.1] mb-5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Crea tu cuenta<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300">de administrador</span>
          </h2>
          <p className="text-[13.5px] text-white/40 leading-relaxed max-w-[340px]">
            Solo personal autorizado con código corporativo puede registrarse en el panel de control.
          </p>
          <div className="mt-10 space-y-3.5">
            {[
              { n: '01', t: 'Llena tus datos personales' },
              { n: '02', t: 'Crea una contraseña segura' },
              { n: '03', t: 'Ingresa tu código corporativo' },
            ].map(({ n, t }) => (
              <div key={n} className="flex items-center gap-3.5">
                <span className="text-[10px] font-black text-emerald-400/60 w-6 flex-shrink-0">{n}</span>
                <div className="flex-1 h-px bg-emerald-800/50" />
                <span className="text-[12.5px] text-white/50 font-medium">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 inline-flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 self-start">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] animate-pulse" />
          <span className="text-[11.5px] text-white/50 font-medium">Sistema seguro · Cifrado de extremo a extremo</span>
        </div>
      </div>

      {/* ════ RIGHT PANEL ════ */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center relative">

        {/* MOBILE HERO */}
        <div className="lg:hidden relative overflow-hidden flex-shrink-0" style={{ minHeight: '200px' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#062917] via-[#04200f] to-[#041a0c]" />
          <div className="absolute -top-[30%] -left-[20%] w-[70%] h-[70%] bg-emerald-500/20 rounded-full blur-[80px]" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[55%] h-[55%] bg-teal-400/15 rounded-full blur-[70px]" />
          <AnimatedCanvas />
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-8">
            <div className="relative mb-4">
              <div className="w-15 h-15 w-[60px] h-[60px] rounded-[20px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.45)]">
                <ShieldAlert size={26} className="text-white" strokeWidth={2.2} />
              </div>
              <div className="absolute inset-0 rounded-[20px] border-2 border-emerald-400/30 animate-ping" style={{ animationDuration: '2.5s' }} />
            </div>
            <h1 className="text-[24px] font-black text-white leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Maíz <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300">Admin</span>
            </h1>
            <p className="text-[10.5px] text-emerald-300/55 mt-1.5 font-medium tracking-widest uppercase">Crear cuenta · Plan Nacional Maíz</p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg viewBox="0 0 390 24" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
              <path d="M0,12 C80,24 160,0 195,12 C230,24 310,0 390,12 L390,24 L0,24 Z" fill="#050f0a" />
            </svg>
          </div>
        </div>

        {/* FORM */}
        <div className="flex-1 w-full max-w-[420px] mx-auto px-5 py-6 sm:py-8 lg:px-12 xl:px-0">
          <div className="hidden lg:block absolute inset-0 bg-[#050f0a]" />
          <div className="relative z-10">

            <div className="mb-5 lg:mb-6">
              <h2 className="text-[22px] sm:text-[24px] font-black text-white leading-tight mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Crear cuenta
              </h2>
              <p className="text-[12.5px] text-white/30">Completa los datos para registrarte</p>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white/[0.03] backdrop-blur-sm lg:bg-transparent lg:border-0 lg:backdrop-blur-none overflow-hidden">
              <form onSubmit={handleSubmit} className="p-5 sm:p-6 lg:p-0 space-y-3.5">

                {/* Nombre */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] block">Nombre completo</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type="text" value={form.nombre_completo} onChange={e => set('nombre_completo', e.target.value)}
                      onFocus={() => setFocused('nombre')} onBlur={() => setFocused(null)}
                      required placeholder="Lic. Juan Pérez García" className={inputCls('nombre')} />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] block">Correo corporativo</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                      onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                      required autoComplete="email" placeholder="nombre@simac.gob.mx" className={inputCls('email')} />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] block">Contraseña</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type={showPwd ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                      onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                      required placeholder="Mínimo 8 caracteres" className={inputCls('password').replace('pr-4', 'pr-11')} />
                    <button type="button" onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors p-1">
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {form.password.length > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex gap-1 flex-1">
                        {[1,2,3,4].map(i => <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= s ? strBg[s] : 'bg-white/10'}`} />)}
                      </div>
                      <span className={`text-[9.5px] font-bold ${strText[s]}`}>{strLabel[s]}</span>
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] block">Confirmar contraseña</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type={showConfirm ? 'text' : 'password'} value={form.confirmar} onChange={e => set('confirmar', e.target.value)}
                      onFocus={() => setFocused('confirmar')} onBlur={() => setFocused(null)}
                      required placeholder="Repite la contraseña"
                      className={[
                        'w-full pl-11 pr-11 py-3.5 rounded-2xl text-[14px] outline-none transition-all duration-200 bg-white/[0.05] border text-white placeholder-white/25 font-medium',
                        form.confirmar && form.confirmar !== form.password ? 'border-red-500/40 ring-1 ring-red-500/15'
                          : focused === 'confirmar' ? 'border-emerald-400/60 ring-2 ring-emerald-400/15 bg-white/[0.08]'
                          : 'border-white/10 hover:border-white/20',
                      ].join(' ')}
                    />
                    <button type="button" onClick={() => setShowConfirm(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors p-1">
                      {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {form.confirmar && form.confirmar !== form.password && (
                    <p className="text-[10.5px] text-red-400 font-semibold">Las contraseñas no coinciden</p>
                  )}
                </div>

                {/* Código */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] block">Código corporativo</label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type="text" value={form.codigo} onChange={e => set('codigo', e.target.value)}
                      onFocus={() => setFocused('codigo')} onBlur={() => setFocused(null)}
                      required placeholder="Código proporcionado por el responsable" className={inputCls('codigo')} />
                  </div>
                  <p className="text-[10px] text-white/20 flex items-center gap-1">
                    <AlertCircle size={10} className="flex-shrink-0" />
                    Solo personal autorizado puede registrarse
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12.5px] text-red-400 animate-fade-in">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={loading || (!!form.confirmar && form.password !== form.confirmar)}
                  className="w-full group relative overflow-hidden rounded-2xl py-3.5 text-[14.5px] font-bold text-white mt-1 transition-all duration-300 active:scale-[0.98] disabled:opacity-50 shadow-[0_8px_30px_rgba(52,211,153,0.25)] hover:shadow-[0_12px_40px_rgba(52,211,153,0.35)]"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%)' }}>
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Creando cuenta…</>
                    ) : (
                      <>Crear cuenta administrativa<ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></>
                    )}
                  </span>
                </button>

                {/* Links */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 text-[12px]">
                  <Link to="/maiz/admin/login" className="text-emerald-500/60 hover:text-emerald-300 transition-colors">
                    Ya tengo cuenta — Iniciar sesión
                  </Link>
                  <Link to="/maiz/bodega/login" className="text-white/20 hover:text-white/40 transition-colors">
                    Portal público
                  </Link>
                </div>
              </form>
            </div>

            <p className="mt-5 text-center text-[10px] text-white/15 leading-relaxed">
              Maíz · Uso exclusivo del personal autorizado del Plan Nacional Maíz 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

