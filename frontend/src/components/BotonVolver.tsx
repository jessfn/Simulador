import { ChevronLeft } from 'lucide-react';

/* ── Botón para volver a la pantalla anterior (compartido por las entradas de Maíz y Frijol) ── */
export default function BotonVolver({ onClick, className = '', style }: { onClick: () => void; className?: string; style?: React.CSSProperties }) {
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
