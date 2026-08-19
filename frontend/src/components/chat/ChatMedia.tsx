import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Navigation } from 'lucide-react';

const MAPBOX_TOKEN = [
  'pk.eyJ1IjoibWFyaWVsMDgi',
  'LCJhIjoiY202emV3MDhhMDN6Y',
  'jJscHVqaXExdGpjMyJ9.F_ACoKzS_4e280lD0XndEw',
].join('');

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
  const claro = tono === 'propio';

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
