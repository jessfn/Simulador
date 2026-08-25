import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Wheat, Building2, ChevronRight, X, LogIn, UserPlus } from 'lucide-react';

type Menu = null | 'productor' | 'bodega';

interface Opcion {
  icon: typeof LogIn;
  title: string;
  desc: string;
  to: string;
  accent?: boolean;
}

const OPCIONES: Record<'productor' | 'bodega', { titulo: string; subtitulo: string; items: Opcion[] }> = {
  productor: {
    titulo: 'Soy Productor',
    subtitulo: 'Elige la opción según tu caso',
    items: [
      { icon: LogIn,       title: 'Ya tengo cuenta',        desc: 'Entra con tu CURP y tu PIN de 4 dígitos.', to: '/login-productor', accent: true },
      { icon: UserPlus,    title: 'Soy nuevo, registrarme', desc: 'No estás en el padrón. Crea tu cuenta desde cero con tu CURP.', to: '/registro-nuevo' },
    ],
  },
  bodega: {
    titulo: 'Soy Bodega / Industria',
    subtitulo: 'Elige una opción',
    items: [
      { icon: LogIn,    title: 'Ya tengo cuenta',     desc: 'Entra con tu correo electrónico y contraseña.', to: '/login', accent: true },
      { icon: UserPlus, title: 'Crear cuenta nueva',  desc: 'Registra tu bodega o industria por primera vez.', to: '/registro' },
    ],
  },
};

/* ── Canvas ribbons animation (ribbons-2) ── */
class RibbonPoint {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  neighbor!: RibbonPoint;
  bounds: { x: number; y: number };

  constructor(bounds: { x: number; y: number }, color: string) {
    this.bounds = bounds;
    this.x = Math.random() * bounds.x;
    this.y = Math.random() * bounds.y;
    const a = Math.random() * Math.PI * 2;
    this.dx = Math.cos(a) * 0.85; // Smooth movement speed
    this.dy = Math.sin(a) * 0.85;
    this.color = color;
  }

  update(ctx: CanvasRenderingContext2D) {
    this.x += this.dx;
    this.y += this.dy;

    // Bounce off edges
    if (this.x < 0) {
      this.x = 0;
      this.dx *= -1;
    } else if (this.x >= this.bounds.x) {
      this.x = this.bounds.x;
      this.dx *= -1;
    }

    if (this.y < 0) {
      this.y = 0;
      this.dy *= -1;
    } else if (this.y >= this.bounds.y) {
      this.y = this.bounds.y;
      this.dy *= -1;
    }

    ctx.strokeStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.neighbor.x, this.neighbor.y);
    ctx.stroke();
  }
}

function CornCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    if (!ctx) return;

    let animId: number;
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    const bounds = { x: W, y: H };
    const points: RibbonPoint[] = [];
    let ticks = 0;
    const maxTicks = 1200;

    const colorPalette = [
      'rgba(74, 222, 128, 0.004)',  // Verde claro suave (green-400)
      'rgba(34, 197, 94, 0.004)'    // Verde medio suave (green-500)
    ];

    const initPoints = () => {
      ticks = 0;
      points.length = 0;
      const numPoints = 6; // Fewer points for a cleaner, minimal design
      for (let i = 0; i < numPoints; i++) {
        const color = colorPalette[i % colorPalette.length];
        points.push(new RibbonPoint(bounds, color));
      }

      for (let i = 0; i < points.length; i++) {
        let j = i;
        while (j === i) {
          j = Math.floor(Math.random() * points.length);
        }
        points[i].neighbor = points[j];
      }
    };

    initPoints();

    function draw() {
      if (ticks >= maxTicks) {
        return; // Freeze the animation (no longer requests frames)
      }

      // Use source-over instead of lighter to prevent additive white hotspots
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1.0;

      // Update positions and draw lines 4 times per frame for a slower, calmer flow
      for (let n = 0; n < 4; n++) {
        if (ticks >= maxTicks) break;
        points.forEach(p => p.update(ctx));
        ticks++;
      }

      animId = requestAnimationFrame(draw);
    }

    draw();

    const handleWindowClick = () => {
      ctx.clearRect(0, 0, W, H);
      initPoints();
      // Restart loop if it was stopped
      cancelAnimationFrame(animId);
      draw();
    };

    window.addEventListener('click', handleWindowClick);

    const ro = new ResizeObserver(() => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W;
      canvas.height = H;
      bounds.x = W;
      bounds.y = H;
      ctx.clearRect(0, 0, W, H);
      initPoints();
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/* ── Main page ── */
export default function WelcomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const menuInicial = (location.state as { menu?: Menu } | null)?.menu ?? null;
  const [menu, setMenu] = useState<Menu>(menuInicial);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState<Menu>(null);
  const data = menu ? OPCIONES[menu] : null;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    // Fuerza el fondo de body/html a verde oscuro para evitar que el overscroll
    // muestre el fondo blanco del resto de la app
    const prev = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = '#092213';
    document.documentElement.style.background = '#092213';
    return () => {
      clearTimeout(t);
      document.body.style.background = prev;
      document.documentElement.style.background = prevHtml;
    };
  }, []);

  const closeMenu = () => setMenu(null);

  return (
    <div
      className="relative flex overflow-hidden bg-[#092213]"
      style={{ position: 'fixed', inset: 0, overscrollBehavior: 'none' }}
    >
      {/* Status bar color band — cubre safe-area-inset-top en iOS */}
      <div className="fixed top-0 inset-x-0 z-[999] bg-[#1A5C38]" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

      {/* ── LEFT PANEL — corn illustration (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col overflow-hidden">
        {/* Rye background image loaded locally */}
        <img
          src="/background-rye.jpg"
          alt="Campos de centeno"
          className="absolute inset-0 w-full h-full object-cover brightness-[0.45] saturate-[0.6]"
        />
        {/* Deep green gradient background (on top to filter the image green) */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#05160d]/65 via-[#0b2b18]/70 to-[#124225]/70 mix-blend-color" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#05160d]/25 via-[#0b2b18]/30 to-[#124225]/25" />
        {/* Top vignette */}
        <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none" />
        {/* Bottom vignette */}
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
        {/* Right fade — blends into right panel */}
        <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-[#092213] to-transparent z-10 pointer-events-none" />

        {/* Canvas animation */}
        <CornCanvas />

        {/* Overlay content */}
        <div className="relative z-20 flex flex-col h-full px-10 py-10">
          {/* Top badge */}
          <div
            className="inline-flex items-center gap-2 bg-white/8 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 w-fit"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-10px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-300/90 tracking-widest uppercase">Plan Nacional Maíz 2026</span>
          </div>

          {/* Bottom text */}
          <div className="mt-auto">
            <div
              style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s' }}
            >
              <h2 className="text-[38px] xl:text-[46px] font-black text-white leading-tight tracking-tight">
                El campo mexicano<br />
                <span className="text-emerald-400">conectado</span> al mercado
              </h2>
              <p className="text-white/45 text-[15px] font-medium mt-3 leading-relaxed max-w-md">
                Sistema de Ordenamiento de la Producción y Comercialización del Maíz en México.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — login options ── */}
      <div className="flex-1 flex flex-col min-h-[100dvh] lg:min-h-auto relative">
        {/* Mobile background */}
        <div className="lg:hidden absolute inset-0">
          {/* Rye background image loaded locally */}
          <img
            src="/background-rye.jpg"
            alt="Campos de centeno"
            className="absolute inset-0 w-full h-full object-cover brightness-[0.42] saturate-[0.6]"
          />
          {/* Deep green gradient overlay (on top to filter the image green) */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#092213]/65 via-[#0b2b18]/70 to-[#144728]/75 mix-blend-color" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#092213]/25 via-[#0b2b18]/30 to-[#144728]/25" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(34,197,94,0.10),transparent)]" />
          {/* Mobile canvas too */}
          <CornCanvas />
          <div className="absolute inset-0 bg-gradient-to-b from-[#092213]/70 via-transparent to-[#092213]/80" />
        </div>

        {/* Right panel content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 sm:py-16 lg:bg-[#040f08]/0">

          {/* Logo */}
          <div
            className="flex flex-col items-center mb-8 lg:mb-10"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-16px) scale(0.95)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}
          >
            <div className="w-[72px] h-[72px] lg:w-20 lg:h-20 rounded-[22px] lg:rounded-[26px] bg-white/10 backdrop-blur-xl ring-1 ring-white/20 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.4)] mb-4">
              <img
                src="/icono.png"
                alt="SIMAC"
                className="w-12 h-12 lg:w-14 lg:h-14 rounded-[14px]"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <h1 className="text-[34px] lg:text-[38px] font-black text-white tracking-[-1px] leading-none">
              SIMAC
            </h1>
            <p className="text-[13px] text-emerald-400/70 font-semibold mt-1.5 tracking-[0.12em] uppercase text-center">
              Plan Nacional Maíz 2026
            </p>
          </div>

          {/* Subtitle */}
          <div
            className="mb-6 text-center"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 0.08s' }}
          >
            <p className="text-white/50 text-[15px] font-medium">¿Cómo deseas ingresar?</p>
          </div>

          {/* Cards */}
          <div className="w-full max-w-[360px] space-y-3">

            {/* Productor */}
            <button
              onClick={() => setMenu('productor')}
              onPointerDown={() => setPressed('productor')}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              className="w-full group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-200"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? (pressed === 'productor' ? 'scale(0.97)' : 'none') : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.12s, transform 0.5s ease 0.12s',
                background: pressed === 'productor'
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.55) 0%, rgba(26,92,56,0.35) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
              }}
            >
              <div
                className="relative backdrop-blur-xl rounded-[calc(1rem-1px)] p-5 text-left transition-colors duration-150"
                style={{ background: pressed === 'productor' ? 'rgba(14,40,22,0.92)' : 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-4 relative">
                  <div
                    className="w-13 h-13 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150"
                    style={{ background: pressed === 'productor' ? 'linear-gradient(135deg,#1A5C38,#0f3821)' : 'rgba(255,255,255,0.10)', boxShadow: pressed === 'productor' ? '0 4px 16px rgba(26,92,56,0.6)' : 'none' }}
                  >
                    <Wheat size={24} className={pressed === 'productor' ? 'text-emerald-300' : 'text-white/60'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[17px] leading-tight">Soy Productor</p>
                    <p className="text-white/45 text-[13px] mt-0.5 leading-snug">Iniciar sesión o registrar tu cuenta</p>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 transition-all duration-150 ${pressed === 'productor' ? 'text-emerald-400 translate-x-1' : 'text-white/25'}`} />
                </div>
              </div>
            </button>

            {/* Bodega / Industria */}
            <button
              onClick={() => setMenu('bodega')}
              onPointerDown={() => setPressed('bodega')}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              className="w-full group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-200"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? (pressed === 'bodega' ? 'scale(0.97)' : 'none') : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.18s, transform 0.5s ease 0.18s',
                background: pressed === 'bodega'
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.55) 0%, rgba(26,92,56,0.35) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
              }}
            >
              <div
                className="relative backdrop-blur-xl rounded-[calc(1rem-1px)] p-5 text-left transition-colors duration-150"
                style={{ background: pressed === 'bodega' ? 'rgba(14,40,22,0.92)' : 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-4 relative">
                  <div
                    className="w-13 h-13 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150"
                    style={{ background: pressed === 'bodega' ? 'linear-gradient(135deg,#1A5C38,#0f3821)' : 'rgba(255,255,255,0.10)', boxShadow: pressed === 'bodega' ? '0 4px 16px rgba(26,92,56,0.6)' : 'none' }}
                  >
                    <Building2 size={24} className={pressed === 'bodega' ? 'text-emerald-300' : 'text-white/60'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[17px] leading-tight">Soy Bodega / Industria</p>
                    <p className="text-white/45 text-[13px] mt-0.5 leading-snug">Iniciar sesión o registrar tu bodega</p>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 transition-all duration-150 ${pressed === 'bodega' ? 'text-emerald-400 translate-x-1' : 'text-white/25'}`} />
                </div>
              </div>
            </button>
          </div>

          {/* Footer */}
          <p
            className="mt-8 text-center text-[10px] text-white/18 max-w-[260px] leading-relaxed"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease 0.28s' }}
          >
            Sistema de Ordenamiento de la Producción y Comercialización del Maíz en México
          </p>
        </div>
      </div>

      {/* ── Bottom sheet / Dialog de opciones ── */}
      {data && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:items-center lg:justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            style={{ animation: 'fadeIn 0.2s ease forwards' }}
            onClick={closeMenu}
          />

          {/* Sheet — bottom on mobile, centered dialog on desktop */}
          <div
            className="
              relative bg-white rounded-t-[28px] lg:rounded-[28px]
              px-5 pt-3 pb-8 lg:pb-6
              shadow-[0_-10px_60px_rgba(0,0,0,0.5)] lg:shadow-[0_24px_80px_rgba(0,0,0,0.4)]
              max-h-[90dvh] overflow-y-auto
              w-full lg:max-w-[420px]
            "
            style={{ animation: 'sheetUp 0.28s cubic-bezier(0.32,0.72,0,1) forwards' }}
          >
            {/* Handle (mobile only) */}
            <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mb-5 lg:hidden" />

            {/* Header */}
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-[21px] font-black text-gray-900 tracking-tight">{data.titulo}</h2>
                <p className="text-gray-400 text-[13px] mt-0.5">{data.subtitulo}</p>
              </div>
              <button
                onClick={closeMenu}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 active:scale-90 transition-all shrink-0"
              >
                <X size={17} />
              </button>
            </div>

            {/* Options */}
            <div className="space-y-2.5 mt-5">
              {data.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => navigate(item.to)}
                    className={`w-full flex items-center gap-3.5 p-4 rounded-2xl text-left transition-all active:scale-[0.98] border
                      ${item.accent
                        ? 'bg-[#1A5C38] border-[#1A5C38] shadow-lg shadow-green-900/25 hover:bg-[#155030]'
                        : 'bg-[#f5fbf7] border-gray-100 hover:bg-[#edf8f2] hover:border-gray-200'}`}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.accent ? 'bg-white/15' : 'bg-white shadow-sm border border-gray-100'}`}>
                      <Icon size={20} className={item.accent ? 'text-white' : 'text-[#1A5C38]'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-[15px] leading-tight ${item.accent ? 'text-white' : 'text-gray-900'}`}>{item.title}</p>
                      <p className={`text-[12px] mt-0.5 leading-snug ${item.accent ? 'text-green-100/75' : 'text-gray-500'}`}>{item.desc}</p>
                    </div>
                    <ChevronRight size={17} className={`shrink-0 ${item.accent ? 'text-white/55' : 'text-gray-300'}`} />
                  </button>
                );
              })}
            </div>

            {/* Back */}
            <button
              onClick={closeMenu}
              className="w-full mt-4 py-3 text-gray-400 text-[13px] font-semibold hover:text-gray-600 transition-colors"
            >
              ← Volver
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes sheetUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
