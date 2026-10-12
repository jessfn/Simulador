import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, ChevronRight } from 'lucide-react';
import { useVolver } from '../hooks/useVolver';
import CampoVivo from '../components/CampoVivo';
import BotonVolver from '../components/BotonVolver';
import IconoFrijol from '../components/IconoFrijol';

// Entrada del módulo de Frijol: mismo diseño, tipografía y responsividad que la entrada de Maíz.
// Frijol se registra en campo por técnicos, así que la única puerta es "Soy Técnico ECA".
export default function FrijolEntradaPage() {
  const navigate = useNavigate();
  const volver = useVolver('/');
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
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

  return (
    <div className="relative flex overflow-hidden bg-[#092213]" style={{ position: 'fixed', inset: 0, overscrollBehavior: 'none' }}>

      {/* ── Panel izquierdo (solo escritorio) ── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col overflow-hidden">
        <img src="/background-rye.jpg" alt="" className="absolute inset-0 w-full h-full object-cover brightness-[0.45] saturate-[0.6]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#05160d]/65 via-[#0b2b18]/70 to-[#124225]/70 mix-blend-color" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#05160d]/25 via-[#0b2b18]/30 to-[#124225]/25" />
        <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-black/50 to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-[#092213] to-transparent z-10 pointer-events-none" />
        <CampoVivo />
        <div className="relative z-20 flex flex-col h-full px-10 py-10">
          <div className="flex items-center gap-3 flex-wrap"><BotonVolver onClick={volver} /></div>
          <div className="mt-auto">
            <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s' }}>
              <h2 className="text-[38px] xl:text-[46px] font-bold text-white leading-tight tracking-tight" style={{ fontFamily: 'Patria, Georgia, serif' }}>
                Del registro en campo<br />
                al <span className="text-emerald-400">frijol</span> de México
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* ── Panel derecho ── */}
      <div className="flex-1 flex flex-col min-h-[100dvh] lg:min-h-auto relative">
        <div className="lg:hidden absolute inset-0">
          <img src="/background-rye.jpg" alt="" className="absolute inset-0 w-full h-full object-cover brightness-[0.42] saturate-[0.6]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#092213]/65 via-[#0b2b18]/70 to-[#144728]/75 mix-blend-color" />
          <div className="absolute inset-0 bg-[#0b2b18]/30" />
          <CampoVivo />
          <div className="absolute inset-0 bg-gradient-to-t from-[#092213]/80 via-[#092213]/15 to-[#092213]/15" />
        </div>

        <BotonVolver
          onClick={volver}
          className="lg:hidden absolute z-20"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: 14 }}
        />

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 sm:py-16 max-lg:pt-[calc(env(safe-area-inset-top,0px)+76px)]">
          <div
            className="flex flex-col items-center mb-8 lg:mb-10"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-16px) scale(0.95)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}
          >
            <IconoFrijol className="h-[44px] lg:h-[52px] w-auto mb-3" />
            <div
              aria-hidden="true"
              className="h-px w-9 mb-3.5"
              style={{ background: 'linear-gradient(90deg,transparent 0%,rgba(150,156,162,.95) 28%,#fff 50%,rgba(150,156,162,.95) 72%,transparent 100%)' }}
            />
            <h1 className="text-[30px] lg:text-[34px] font-bold text-white tracking-[-0.5px] leading-none" style={{ fontFamily: 'Patria, Georgia, serif' }}>
              Frijol
            </h1>
          </div>

          <div className="mb-6 text-center" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 0.08s' }}>
            <p className="text-white/50 text-[15px] font-medium">¿Cómo deseas ingresar?</p>
          </div>

          <div className="w-full max-w-[360px] space-y-3">
            <button
              onClick={() => navigate('/frijol/tecnico/login')}
              onPointerDown={() => setPressed(true)}
              onPointerUp={() => setPressed(false)}
              onPointerLeave={() => setPressed(false)}
              className="w-full group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-200"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? (pressed ? 'scale(0.97)' : 'none') : 'translateY(20px)',
                transition: 'opacity 0.5s ease 0.12s, transform 0.5s ease 0.12s',
                background: pressed
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.55) 0%, rgba(26,92,56,0.35) 100%)'
                  : 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
              }}
            >
              <div
                className="relative backdrop-blur-xl rounded-[calc(1rem-1px)] p-5 text-left transition-colors duration-150"
                style={{ background: pressed ? 'rgba(14,40,22,0.92)' : 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center gap-4 relative">
                  <div
                    className="w-13 h-13 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150"
                    style={{ background: pressed ? 'linear-gradient(135deg,#1A5C38,#0f3821)' : 'rgba(255,255,255,0.10)', boxShadow: pressed ? '0 4px 16px rgba(26,92,56,0.6)' : 'none' }}
                  >
                    <ClipboardCheck size={24} className={pressed ? 'text-emerald-300' : 'text-white/60'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[17px] leading-tight">Soy Técnico ECA</p>
                    <p className="text-white/45 text-[13px] mt-0.5 leading-snug">Registro de productores de frijol en campo</p>
                  </div>
                  <ChevronRight size={18} className={`shrink-0 transition-all duration-150 ${pressed ? 'text-emerald-400 translate-x-1' : 'text-white/25'}`} />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
