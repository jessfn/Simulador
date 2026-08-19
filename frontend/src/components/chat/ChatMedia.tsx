import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X, Navigation } from 'lucide-react';

/**
 * Ícono de enviar — avión de papel estilo Telegram. El path oficial no está
 * centrado en su propio viewBox 0 0 448 512 (el trazo real mide
 * x:-0.56..448, y:64.4..440 — medido con getBBox()), así que se usa un
 * viewBox recortado exactamente a esa caja para que quede centrado de
 * verdad dentro del botón circular, sin márgenes a ojo.
 */
export function SendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size * (375.7 / 448.6)} viewBox="-0.56 64.4 448.6 375.7" fill="currentColor">
      <path d="M446.7 98.6l-67.6 318.8c-5.1 22.5-18.4 28.1-37.3 17.5l-103-75.9-49.7 47.8c-5.5 5.5-10.1 10.1-20.7 10.1l7.4-104.9 190.9-172.5c8.3-7.4-1.8-11.5-12.9-4.1L117.8 284 15.7 251.4c-22.2-6.9-22.6-22.2 4.6-32.9L418.2 66.4c18.5-6.9 34.7 4.1 28.5 32.2z" />
    </svg>
  );
}

const MAPBOX_TOKEN = [
  'pk.eyJ1IjoibWFyaWVsMDgi',
  'LCJhIjoiY202emV3MDhhMDN6Y',
  'jJscHVqaXExdGpjMyJ9.F_ACoKzS_4e280lD0XndEw',
].join('');

/* ─────────────────────────── Horario de servicio ─────────────────────────── */
/** Lunes a viernes, 9:00–18:00, hora de Ciudad de México (independiente de la zona horaria del dispositivo). */
export function enHorarioServicio(): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric',
  });
  const partes = fmt.formatToParts(new Date());
  const dia = partes.find(p => p.type === 'weekday')?.value ?? '';
  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? 0);
  const minuto = Number(partes.find(p => p.type === 'minute')?.value ?? 0);
  const esLaborable = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dia);
  const minutosDelDia = hora * 60 + minuto;
  return esLaborable && minutosDelDia >= 9 * 60 && minutosDelDia < 18 * 60;
}

/** Se re-evalúa solo — para que el estado cambie sin recargar si el chat queda abierto cruzando la hora. */
export function useHorarioServicio(): boolean {
  const [dentro, setDentro] = useState(enHorarioServicio());
  useEffect(() => {
    const t = setInterval(() => setDentro(enHorarioServicio()), 60_000);
    return () => clearInterval(t);
  }, []);
  return dentro;
}

/* ─────────────────────────── Fondo tipo WhatsApp (iconos de maíz) ─────────────────────────── */
const CORN_TILE = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
  <g fill="none" stroke="#1A5C38" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.12">
    <g transform="translate(18,20) rotate(-12)">
      <ellipse cx="8" cy="20" rx="7" ry="16"/>
      <path d="M8 4v32M2 10l6 3M14 10l-6 3M2 18l6 3M14 18l-6 3M2 26l6 3M14 26l-6 3"/>
      <path d="M8 36c-4 3-4 8-8 9M8 36c4 3 4 8 8 9"/>
    </g>
    <g transform="translate(96,72) rotate(18) scale(0.8)">
      <ellipse cx="8" cy="20" rx="7" ry="16"/>
      <path d="M8 4v32M2 10l6 3M14 10l-6 3M2 18l6 3M14 18l-6 3M2 26l6 3M14 26l-6 3"/>
      <path d="M8 36c-4 3-4 8-8 9M8 36c4 3 4 8 8 9"/>
    </g>
    <g transform="translate(60,100) rotate(-25) scale(0.65)">
      <ellipse cx="8" cy="20" rx="7" ry="16"/>
      <path d="M8 4v32M2 10l6 3M14 10l-6 3M2 18l6 3M14 18l-6 3M2 26l6 3M14 26l-6 3"/>
      <path d="M8 36c-4 3-4 8-8 9M8 36c4 3 4 8 8 9"/>
    </g>
  </g>
</svg>
`)}`;

/** Estilo de fondo suave con iconos de maíz repetidos, como el papel tapiz de WhatsApp. */
export const chatWallpaper: CSSProperties = {
  backgroundImage: `url("${CORN_TILE}")`,
  backgroundRepeat: 'repeat',
  backgroundSize: '140px 140px',
};

/**
 * Cola de burbuja estilo WhatsApp — la misma forma que usa WhatsApp Web,
 * fundida en la esquina de la burbuja (sin hueco ni desfase): la esquina
 * correspondiente de la burbuja debe llevar radio 0 (ver `bubbleRadius`)
 * para que la curva de la cola continúe exactamente la del rectángulo.
 */
export function Tail({ esMio, color }: { esMio: boolean; color: string }) {
  // Borde recto que se abre desde la esquina de la burbuja hasta una punta
  // redondeada — geométrico y compacto, como la cola de Telegram (no la
  // curva tipo "gancho" de WhatsApp).
  const w = 8, h = 12, redondeo = 5;
  const path = `M0,0 L${w},${h - redondeo} Q${w},${h} ${w - redondeo},${h} L0,${h} Z`;
  return (
    <svg
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute', bottom: 0,
        [esMio ? 'right' : 'left']: -w + 2,
        transform: esMio ? undefined : 'scaleX(-1)',
      }}
    >
      <path d={path} fill={color} />
    </svg>
  );
}

/** Radio de esquinas para una burbuja con cola: recta del lado de la cola. */
export function bubbleRadius(esMio: boolean): CSSProperties {
  return esMio
    ? { borderRadius: 16, borderBottomRightRadius: 2 }
    : { borderRadius: 16, borderBottomLeftRadius: 2 };
}

/**
 * Sombra para el contenedor que envuelve burbuja + cola.
 * IMPORTANTE: usar `filter: drop-shadow(...)` en vez de `box-shadow` — el
 * box-shadow solo sigue el rectángulo de la burbuja y deja la cola (que es
 * un SVG hermano) sin sombra, lo que se ve como una costura/corte justo
 * donde se unen. drop-shadow sigue el contorno real de todo lo que hay
 * dentro (burbuja + cola), como una sola pieza — igual que WhatsApp.
 */
export const bubbleShadow: CSSProperties = {
  filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.13))',
};

/* ─────────────────────────── Reproductor de audio ─────────────────────────── */
/** Reproductor de nota de voz estilo WhatsApp: botón circular + barras + duración. */
export function AudioPlayer({ src, tono }: { src: string; tono: 'propio' | 'ajeno' }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progreso, setProgreso] = useState(0); // 0..1
  const [duracion, setDuracion] = useState(0);
  const [actual, setActual] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => { setActual(a.currentTime); if (a.duration) setProgreso(a.currentTime / a.duration); };
    const onMeta = () => setDuracion(a.duration || 0);
    const onEnd = () => { setPlaying(false); setProgreso(0); setActual(0); };
    const onErr = () => setError(true);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => setError(true)); }
  }

  function fmt(s: number) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  const barras = 26;
  const claro = tono === 'propio'; // burbuja propia = fondo oscuro → íconos/barras claros

  return (
    <div className="flex items-center gap-2.5 py-1 min-w-[190px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={toggle} disabled={error}
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform active:scale-90 ${
          claro ? 'bg-white/25 text-white' : 'bg-[#1A5C38] text-white'
        }`}>
        {playing
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
      </button>
      <div className="flex-1 flex items-center gap-[2px] h-6">
        {Array.from({ length: barras }).map((_, i) => {
          const h = 5 + Math.abs(Math.sin(i * 1.7)) * 14;
          const activo = i / barras <= progreso;
          return (
            <div key={i} className={`w-[2.5px] rounded-full transition-colors ${
              activo ? (claro ? 'bg-white' : 'bg-[#1A5C38]') : (claro ? 'bg-white/35' : 'bg-slate-300')
            }`} style={{ height: h }} />
          );
        })}
      </div>
      <span className={`text-[10px] font-medium flex-shrink-0 tabular-nums ${claro ? 'text-white/80' : 'text-slate-400'}`}>
        {error ? '—' : fmt(playing || actual > 0 ? actual : duracion)}
      </span>
    </div>
  );
}

/* ─────────────────────────── Visor de imagen a pantalla completa ─────────────────────────── */
export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/92 flex items-center justify-center animate-fade-in"
      style={{ zIndex: 200 }}
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-[calc(env(safe-area-inset-top,0px)+14px)] right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform">
        <X size={20} />
      </button>
      <img src={src} className="max-w-[94vw] max-h-[88vh] object-contain" onClick={e => e.stopPropagation()} />
    </div>,
    document.body
  );
}

/* ─────────────────────────── Vista previa de ubicación ─────────────────────────── */
interface LocationPreviewProps {
  lat: number;
  lng: number;
  enVivo?: boolean;
  activoHasta?: string | null;
  puedeDetener?: boolean;
  onDetener?: () => void;
}

export function LocationPreview({ lat, lng, enVivo, activoHasta, puedeDetener, onDetener }: LocationPreviewProps) {
  const staticUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-l+dc2626(${lng},${lat})/${lng},${lat},15,0/320x150@2x?access_token=${MAPBOX_TOKEN}`;
  const vencida = enVivo && activoHasta ? new Date(activoHasta).getTime() < Date.now() : false;
  const activa = enVivo && !vencida;

  return (
    <div className="rounded-xl overflow-hidden w-[220px] -m-0.5">
      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="block relative">
        <img src={staticUrl} className="w-full h-[100px] object-cover" />
        {activa && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-rose-600 text-white text-[8.5px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> En vivo
          </span>
        )}
      </a>
      <div className="bg-white px-2.5 py-1.5 flex items-center gap-1.5">
        <Navigation size={11} className={activa ? 'text-rose-600' : 'text-[#1A5C38]'} />
        <span className="text-[10.5px] font-bold text-slate-700 flex-1 truncate">
          {vencida ? 'Ubicación en tiempo real finalizada' : activa ? 'Compartiendo ubicación en vivo' : 'Ubicación compartida'}
        </span>
      </div>
      {activa && puedeDetener && (
        <button onClick={onDetener} className="w-full bg-rose-50 text-rose-600 text-[10.5px] font-bold py-1.5 active:bg-rose-100 transition-colors">
          Detener
        </button>
      )}
    </div>
  );
}
