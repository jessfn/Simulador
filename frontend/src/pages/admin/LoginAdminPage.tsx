import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import {
  Eye, EyeOff, Mail, Lock, AlertCircle, ArrowRight,
  ShieldCheck, Leaf, BarChart3, Map, TrendingUp
} from 'lucide-react';

/* ─── Canvas de partículas ─── */
function AnimatedCanvas({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    let raf: number;
    const W = () => c.offsetWidth, H = () => c.offsetHeight;
    const resize = () => { c.width = W(); c.height = H(); };
    resize();
    window.addEventListener('resize', resize);
    const pts = Array.from({ length: 50 }, () => ({
      x: Math.random() * W(), y: Math.random() * H(),
      r: Math.random() * 1.6 + 0.4,
      dx: (Math.random() - 0.5) * 0.3, dy: (Math.random() - 0.5) * 0.3,
      a: Math.random(),
    }));
    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      pts.forEach((p, i) => {
        pts.slice(i + 1).forEach(q => {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 110) {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(52,211,153,${(1 - d / 110) * 0.2})`;
            ctx.lineWidth = 0.7; ctx.stroke();
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

function Feat({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
      <div className="w-8 h-8 rounded-xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-emerald-300" />
      </div>
      <span className="text-[12px] font-medium text-white/70">{text}</span>
    </div>
  );
}

export default function LoginAdminPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await api.auth.login(email, password, 'admin');
      const u = res.usuario || res.user;
      const puedeEntrar =
        u?.rol === 'admin' ||
        u?.rol === 'responsable' ||
        (u?.rol === 'user' && u?.es_panel_usuario === true);
      if (!puedeEntrar)
        throw new Error('No tienes permisos para acceder al panel administrativo');
      setAuth(res.token, { ...u, userId: u?.id ?? u?.userId });
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Credenciales incorrectas');
    } finally { setLoading(false); }
  }

  const inputCls = (f: string) => [
    'w-full pl-11 pr-4 py-3.5 sm:py-4 rounded-2xl text-[14px] outline-none transition-all duration-200',
    'bg-white/[0.05] border text-white placeholder-white/25 font-medium',
    focused === f
      ? 'border-emerald-400/60 ring-2 ring-emerald-400/15 bg-white/[0.08]'
      : 'border-white/10 hover:border-white/20',
  ].join(' ');

  return (
    <div className="min-h-screen bg-[#050f0a] flex flex-col lg:flex-row overflow-x-hidden">

      {/* ════════════════════════════════
          LEFT PANEL — solo desktop
      ════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative flex-col justify-between p-10 xl:p-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#062917] via-[#041f12] to-[#020d07]" />
        <div className="absolute -top-[10%] -left-[5%] w-[55%] h-[55%] bg-emerald-500/15 rounded-full blur-[110px]" />
        <div className="absolute -bottom-[15%] -right-[10%] w-[45%] h-[45%] bg-teal-400/10 rounded-full blur-[90px]" />
        <div className="absolute top-[40%] right-[10%] w-[20%] h-[20%] bg-lime-300/8 rounded-full blur-[60px]" />
        <AnimatedCanvas />

        {/* Logo desktop */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_24px_rgba(52,211,153,0.4)]">
            <ShieldCheck size={20} className="text-white" strokeWidth={2.3} />
          </div>
          <div>
            <span className="text-[17px] font-black text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>SIMAC</span>
            <span className="ml-1.5 text-[9px] font-bold text-emerald-400 uppercase tracking-[0.2em]">Admin</span>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-10">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-[0.25em] mb-4">Plan Nacional Maíz · 2026</p>
          <h2 className="text-[38px] xl:text-[44px] font-black text-white leading-[1.1] mb-5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            El centro de<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300">mando agrícola</span><br />
            de México
          </h2>
          <p className="text-[14px] text-white/45 leading-relaxed max-w-[360px]">
            Monitorea productores, bodegas, precios y alertas en tiempo real desde un solo lugar.
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative z-10 grid grid-cols-2 gap-2.5">
          <Feat icon={BarChart3} text="Reportes en tiempo real" />
          <Feat icon={Map} text="Mapa nacional interactivo" />
          <Feat icon={TrendingUp} text="Análisis de precios" />
          <Feat icon={Leaf} text="Gestión de productores" />
        </div>
      </div>

      {/* ════════════════════════════════
          RIGHT PANEL — formulario
      ════════════════════════════════ */}
      <div className="flex-1 flex flex-col lg:items-center lg:justify-center relative">

        {/* ── MOBILE HERO HEADER ── */}
        <div className="lg:hidden relative overflow-hidden flex-shrink-0" style={{ minHeight: '220px' }}>
          {/* Bg verde oscuro con blobs */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#062917] via-[#04200f] to-[#041a0c]" />
          <div className="absolute -top-[30%] -left-[20%] w-[70%] h-[70%] bg-emerald-500/20 rounded-full blur-[80px]" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[55%] h-[55%] bg-teal-400/15 rounded-full blur-[70px]" />
          <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] bg-lime-300/10 rounded-full blur-[50px]" />
          <AnimatedCanvas />

          {/* Contenido del hero mobile */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 py-10">
            {/* Icon */}
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-[0_0_32px_rgba(52,211,153,0.45)]">
                <ShieldCheck size={28} className="text-white" strokeWidth={2.2} />
              </div>
              {/* Pulse ring */}
              <div className="absolute inset-0 rounded-3xl border-2 border-emerald-400/30 animate-ping" style={{ animationDuration: '2.5s' }} />
            </div>
            <h1 className="text-[26px] font-black text-white leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              SIMAC <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-300">Admin</span>
            </h1>
            <p className="text-[11px] text-emerald-300/60 mt-1.5 font-medium tracking-widest uppercase">
              Plan Nacional Maíz · 2026
            </p>
          </div>

          {/* Wave bottom */}
          <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg viewBox="0 0 390 28" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
              <path d="M0,14 C80,28 160,0 195,14 C230,28 310,0 390,14 L390,28 L0,28 Z" fill="#050f0a" />
            </svg>
          </div>
        </div>

        {/* ── FORMULARIO ── */}
        <div className="flex-1 flex flex-col items-center justify-start lg:justify-center w-full px-5 py-6 sm:py-8 lg:py-0 lg:px-12 xl:px-16">
          {/* Fondo sutil en desktop */}
          <div className="hidden lg:block absolute inset-0 bg-[#050f0a]" />

          <div className="relative z-10 w-full max-w-[400px]">

            {/* Header de formulario */}
            <div className="mb-6 lg:mb-8">
              <h2 className="text-[22px] sm:text-[26px] font-black text-white leading-tight mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Bienvenido de vuelta
              </h2>
              <p className="text-[13px] text-white/35">Ingresa tus credenciales para continuar</p>
            </div>

            {/* Tarjeta del form en mobile */}
            <div className="rounded-3xl overflow-hidden border border-gray-100 bg-white/[0.03] backdrop-blur-sm lg:bg-transparent lg:border-0 lg:backdrop-blur-none">
              <form onSubmit={handleSubmit} className="p-5 sm:p-6 lg:p-0 space-y-4">

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/35 uppercase tracking-[0.15em] block">Correo corporativo</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type="email" value={email}
                      onChange={e => { setEmail(e.target.value); setError(''); }}
                      onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                      required autoComplete="email" placeholder="nombre@simac.gob.mx"
                      className={inputCls('email')}
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-white/35 uppercase tracking-[0.15em] block">Contraseña</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                    <input type={showPwd ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); setError(''); }}
                      onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                      required autoComplete="current-password" placeholder="••••••••"
                      className={inputCls('password').replace('pr-4', 'pr-11')}
                    />
                    <button type="button" onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors p-1">
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 text-[12.5px] text-red-400 animate-fade-in">
                    <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                {/* Botón Submit */}
                <button type="submit" disabled={loading}
                  className="w-full group relative overflow-hidden rounded-2xl py-3.5 sm:py-4 text-[14.5px] font-bold text-white transition-all duration-300 active:scale-[0.98] disabled:opacity-50 shadow-[0_8px_30px_rgba(52,211,153,0.25)] hover:shadow-[0_12px_40px_rgba(52,211,153,0.35)]"
                  style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 60%, #34d399 100%)' }}
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                  <span className="relative flex items-center justify-center gap-2">
                    {loading ? (
                      <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Verificando…</>
                    ) : (
                      <>Ingresar al panel<ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" /></>
                    )}
                  </span>
                </button>

                {/* Back */}
                <p className="text-center">
                  <Link to="/login" className="text-[12px] text-white/20 hover:text-white/45 transition-colors">
                    ← Volver al portal público
                  </Link>
                </p>
              </form>
            </div>

            <p className="mt-6 text-center text-[10px] text-white/15 leading-relaxed px-4">
              SIMAC · Uso confidencial del Plan Nacional Maíz 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

