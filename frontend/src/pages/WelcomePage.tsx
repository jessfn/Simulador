import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useVolver } from '../hooks/useVolver';
import CampoVivo from '../components/CampoVivo';
import { Wheat, Building2, ClipboardCheck, ChevronRight, ChevronLeft, X, LogIn, UserPlus } from 'lucide-react';

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
      { icon: LogIn,       title: 'Ya tengo cuenta',        desc: 'Entra con tu CURP y tu PIN de 4 dígitos.', to: '/maiz/productor/login', accent: true },
      { icon: UserPlus,    title: 'Soy nuevo, registrarme', desc: 'No estás en el padrón. Crea tu cuenta desde cero con tu CURP.', to: '/maiz/productor/registro' },
    ],
  },
  bodega: {
    titulo: 'Soy Bodega / Industria',
    subtitulo: 'Elige una opción',
    items: [
      { icon: LogIn,    title: 'Ya tengo cuenta',     desc: 'Entra con tu correo electrónico y contraseña.', to: '/maiz/bodega/login', accent: true },
      { icon: UserPlus, title: 'Crear cuenta nueva',  desc: 'Registra tu bodega o industria por primera vez.', to: '/maiz/bodega/registro' },
    ],
  },
};

/* ── Botón para volver a la pantalla anterior ── */
function BotonVolverSimac({ onClick, className = '', style }: { onClick: () => void; className?: string; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Volver"
      style={style}
      className={`inline-flex items-center gap-1.5 rounded-full bg-white/15 ring-1 ring-white/25 text-white text-[13px] font-semibold pl-2.5 pr-4 py-2 transition-all hover:bg-white/25 active:scale-95 ${className}`}
    >
      <ChevronLeft size={17} strokeWidth={2.4} />
      Volver
    </button>
  );
}

/* ── Main page ── */
export default function WelcomePage() {
  const navigate = useNavigate();
  const volver = useVolver('/');
  const location = useLocation();
  const menuInicial = (location.state as { menu?: Menu } | null)?.menu ?? null;
  const [menu, setMenu] = useState<Menu>(menuInicial);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState<Menu>(null);
  const [pressedTecnico, setPressedTecnico] = useState(false);
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

      {/* ── LEFT PANEL — corn illustration (hidden on mobile) ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col overflow-hidden">
        {/* Rye background image loaded locally */}
        <img
          src="/milpa.jpg"
          alt="Milpa"
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
        <CampoVivo />

        {/* Overlay content */}
        <div className="relative z-20 flex flex-col h-full px-10 py-10">
          {/* Fila superior: volver */}
          <div className="flex items-center gap-3 flex-wrap">
          <BotonVolverSimac onClick={volver} />
          </div>

          {/* Bottom text */}
          <div className="mt-auto">
            <div
              style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s' }}
            >
              <h2 className="text-[38px] xl:text-[46px] font-bold text-white leading-tight tracking-tight" style={{ fontFamily: "Patria, Georgia, serif" }}>
                Del surco a la bodega,<br />
                el <span className="text-emerald-400">maíz</span> de México
              </h2>
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
            src="/milpa.jpg"
            alt="Milpa"
            className="absolute inset-0 w-full h-full object-cover brightness-[0.42] saturate-[0.6]"
          />
          {/* Deep green gradient overlay (on top to filter the image green) */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#092213]/65 via-[#0b2b18]/70 to-[#144728]/75 mix-blend-color" />
          <div className="absolute inset-0 bg-[#0b2b18]/30" />
          {/* Mobile canvas too */}
          <CampoVivo />
          <div className="absolute inset-0 bg-gradient-to-t from-[#092213]/80 via-[#092213]/15 to-[#092213]/15" />
        </div>

        {/* Volver (móvil y tablet): flotante, respeta la barra de estado */}
        <BotonVolverSimac
          onClick={volver}
          className="lg:hidden absolute z-20"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 14 }}
        />

        {/* Right panel content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 sm:py-16 max-lg:pt-[calc(env(safe-area-inset-top,0px)+76px)] lg:bg-[#040f08]/0">

          {/* Logo */}
          <div
            className="flex flex-col items-center mb-8 lg:mb-10"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-16px) scale(0.95)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}
          >
            <div
              role="img"
              aria-label="Maíz"
              className="h-[44px] lg:h-[52px] aspect-[420/480] mb-3"
              style={{
                background: 'linear-gradient(90deg,#a7dcb3 0%,#a7dcb3 30%,#f4dc96 38%,#efce7a 62%,#a7dcb3 70%,#a7dcb3 100%)',
                WebkitMask: 'url(/images/maiz-icono.png) center / contain no-repeat',
                mask: 'url(/images/maiz-icono.png) center / contain no-repeat',
                filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))',
              }}
            />
            <div
              aria-hidden="true"
              className="h-px w-9 mb-3.5"
              style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(150,156,162,.95) 28%,#fff 50%,rgba(150,156,162,.95) 72%,transparent 100%)' }}
            />
            <h1 className="text-[30px] lg:text-[34px] font-bold text-white tracking-[-0.5px] leading-none" style={{ fontFamily: "Patria, Georgia, serif" }}>
              Maíz
            </h1>
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

            {/* Técnico ECA */}
            <button
              onClick={() => navigate('/maiz/tecnico/login')}
              onPointerDown={() => setPressedTecnico(true)}
              onPointerUp={() => setPressedTecnico(false)}
              onPointerLeave={() => setPressedTecnico(false)}
              className="w-full group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-200"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? (pressedTecnico ? 'scale(0.97)' : 'none') : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.24s, transform 0.5s ease 0.24s',
                background: pressedTecnico
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.55) 0%, rgba(26,92,56,0.35) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
              }}
            >
              <div
                className="relative backdrop-blur-xl rounded-[calc(1rem-1px)] p-5 text-left transition-colors duration-150"
                style={{ background: pressedTecnico ? 'rgba(14,40,22,0.92)' : 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-4 relative">
                  <div
                    className="w-13 h-13 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150"
                    style={{ background: pressedTecnico ? 'linear-gradient(135deg,#1A5C38,#0f3821)' : 'rgba(255,255,255,0.10)', boxShadow: pressedTecnico ? '0 4px 16px rgba(26,92,56,0.6)' : 'none' }}
                  >
                    <ClipboardCheck size={24} className={pressedTecnico ? 'text-emerald-300' : 'text-white/60'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[17px] leading-tight">Soy Técnico ECA</p>
                    <p className="text-white/45 text-[13px] mt-0.5 leading-snug">Registro de productores en campo</p>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 transition-all duration-150 ${pressedTecnico ? 'text-emerald-400 translate-x-1' : 'text-white/25'}`} />
                </div>
              </div>
            </button>
          </div>

          {/* Footer */}
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
