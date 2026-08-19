import { useEffect, useState } from 'react';
import { Bell, MessageCircle } from 'lucide-react';

const SPRING = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface Props {
  subtitle?: string;
  initials: string;
  notifCount?: number;
  onBrand?: () => void;
  onBell?: () => void;
  onMenu?: () => void;
  /** Muestra el botón de "Ayuda" que abre el chat de soporte flotante. */
  mostrarAyuda?: boolean;
}

/**
 * Barra superior premium estilo Apple 2026 — "liquid glass".
 * Vidrio esmerilado translúcido, brillo especular que recorre el header,
 * squircles y micro-interacciones tipo spring. Compartida por ambos roles.
 */
export default function AppHeader({ subtitle, initials, notifCount = 0, onBrand, onBell, onMenu, mostrarAyuda }: Props) {
  const [chatNoLeidos, setChatNoLeidos] = useState(0);

  useEffect(() => {
    if (!mostrarAyuda) return;
    const onUnread = (e: Event) => setChatNoLeidos((e as CustomEvent).detail ?? 0);
    window.addEventListener('simac:chat-unread', onUnread);
    return () => window.removeEventListener('simac:chat-unread', onUnread);
  }, [mostrarAyuda]);

  return (
    <header className="flex-none relative z-30 isolate" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Capa de vidrio */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-2xl backdrop-saturate-150" />
      {/* Tinte de profundidad sutil */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent" />
      {/* Brillo especular superior (borde de luz) */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent" />
      {/* Hairline inferior */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-slate-900/[0.07]" />
      {/* Brillo "líquido" que recorre el header */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="simac-header-sheen absolute -top-1/2 left-0 h-[200%] w-[45%] bg-[linear-gradient(105deg,transparent,rgba(255,255,255,0.55),transparent)] blur-md" />
      </div>

      {/* Contenido */}
      <div className="simac-header-in relative z-10 h-16 max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Marca */}
        <button onClick={onBrand} className="group flex items-center gap-2.5 min-w-0">
          <div
            className="relative w-9 h-9 rounded-[12px] overflow-hidden bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_16px_rgba(26,92,56,0.16)] transition-transform duration-500 group-hover:scale-[1.06] group-active:scale-95"
            style={{ transitionTimingFunction: SPRING }}
          >
            <img src="/icono.png" alt="SIMAC" className="w-full h-full object-cover" />
            <span className="absolute inset-0 rounded-[12px] ring-1 ring-inset ring-white/40" />
          </div>
          <div className="flex flex-col leading-none min-w-0 text-left">
            <span className="text-[15.5px] font-bold tracking-[-0.02em] text-slate-900 leading-none">SIMAC</span>
            {subtitle && (
              <span className="text-[10.5px] text-slate-400 font-medium tracking-tight leading-tight mt-[3px] truncate max-w-[165px] sm:max-w-[330px] lg:max-w-[440px]">
                {subtitle}
              </span>
            )}
          </div>
        </button>

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Ayuda / chat de soporte */}
          {mostrarAyuda && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('simac:abrir-chat'))}
              aria-label="Ayuda"
              className="relative w-9 h-9 rounded-full bg-white/55 ring-1 ring-black/[0.05] shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex items-center justify-center text-slate-600 hover:text-[#1A5C38] hover:bg-white hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] active:scale-90 transition-all duration-300"
              style={{ transitionTimingFunction: SPRING }}
            >
              <MessageCircle size={18} strokeWidth={2} />
              {chatNoLeidos > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white shadow-sm">
                  {chatNoLeidos > 9 ? '9+' : chatNoLeidos}
                </span>
              )}
            </button>
          )}
          {/* Campana */}
          <button
            onClick={onBell}
            aria-label="Notificaciones"
            className="relative w-9 h-9 rounded-full bg-white/55 ring-1 ring-black/[0.05] shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex items-center justify-center text-slate-600 hover:text-[#1A5C38] hover:bg-white hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)] active:scale-90 transition-all duration-300"
            style={{ transitionTimingFunction: SPRING }}
          >
            <Bell size={18} strokeWidth={2} />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-white shadow-sm">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>

          {/* Avatar */}
          <button
            onClick={onMenu}
            aria-label="Perfil"
            className="group/av active:scale-90 transition-transform duration-300"
            style={{ transitionTimingFunction: SPRING }}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center shadow-[0_3px_12px_rgba(26,92,56,0.32)] ring-1 ring-white/40 transition-shadow duration-300 group-hover/av:shadow-[0_5px_18px_rgba(26,92,56,0.48)]">
              <span className="text-white text-[12px] font-black tracking-wide">{initials}</span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
