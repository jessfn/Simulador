import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle, X, Smile, Image as ImageIcon, Mic, Paperclip,
  MapPin, ChevronLeft, Trash2, Navigation,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { apiFetch, BASE } from '../services/api';
import { playSentSound, playReceivedSound, desbloquearAudio } from '../utils/chatSounds';
import { AudioPlayer, ImageLightbox, LocationPreview, Tail, bubbleRadius, bubbleShadow, useHorarioServicio, chatWallpaper } from './chat/ChatMedia';

/** Ícono de enviar estilo Telegram — avión de papel, perfectamente centrado. */
function SendIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1.5 }}>
      <path d="M3.4 20.4 21 12 3.4 3.6c-.6-.3-1.3.2-1.2.9L4 11.2c.05.35.33.62.68.66L14 13l-9.32 1.12c-.35.04-.63.31-.68.66l-1.8 6.7c-.1.7.6 1.2 1.2.9Z" />
    </svg>
  );
}

/** Palomita(s) estilo WhatsApp: una = enviado, dos = entregado/leído. */
function Ticks({ dobles, leido }: { dobles: boolean; leido: boolean }) {
  const color = leido ? '#7dd3fc' : 'currentColor';
  return (
    <svg width="15" height="11" viewBox="0 0 16 11" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {dobles && <path d="M1 5.2 3.8 8 9 1.8" opacity="0.95" />}
      <path d={dobles ? 'M6.2 5.2 9 8 14.5 1.8' : 'M1 5.2 3.8 8 9 1.8'} />
    </svg>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '120ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '240ms' }} />
    </div>
  );
}

interface Mensaje {
  id: number;
  autor_id: number;
  autor_rol: string;
  tipo: 'texto' | 'imagen' | 'audio' | 'archivo' | 'ubicacion' | 'ubicacion_vivo';
  contenido: string | null;
  archivo_url: string | null;
  archivo_mime: string | null;
  archivo_nombre: string | null;
  lat: number | null;
  lng: number | null;
  activo_hasta: string | null;
  created_at: string;
}

const POS_KEY = 'simac_chat_bubble_pos';
const HIDDEN_KEY = 'simac_chat_bubble_hidden';
const EMOJIS = ['😀', '😅', '👍', '🙏', '🙌', '😢', '😡', '❓', '✅', '📍', '🌽', '🚜'];

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatBubble() {
  const { user, token } = useAuthStore();
  const esUsuarioFinal = user && (user.rol === 'productor' || user.rol === 'user' || user.rol === 'bodeguero');
  const enHorario = useHorarioServicio();

  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null') || { x: window.innerWidth - 78, y: window.innerHeight - 190 }; }
    catch { return { x: window.innerWidth - 78, y: window.innerHeight - 190 }; }
  });
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1');
  const [open, setOpen] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [grabacionSegundos, setGrabacionSegundos] = useState(0);
  const [adminLeidoHasta, setAdminLeidoHasta] = useState<string | null>(null);
  const [divisorNoLeidos, setDivisorNoLeidos] = useState(0);
  const [adminEscribiendo, setAdminEscribiendo] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [ubicacionSheet, setUbicacionSheet] = useState(false);
  const [compartiendoEnVivo, setCompartiendoEnVivo] = useState<number | null>(null);

  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileDocRef = useRef<HTMLInputElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const grabacionCanceladaRef = useRef(false);
  const grabacionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const idsVistos = useRef<Set<number>>(new Set());
  const escribiendoAdminTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoEnvioEscribiendo = useRef(0);
  const abrirRef = useRef<() => void>(() => {});

  // ── Abrir el chat desde el botón "Ayuda" del header ──
  useEffect(() => {
    const onAbrirGlobal = () => abrirRef.current?.();
    window.addEventListener('simac:abrir-chat', onAbrirGlobal);
    return () => window.removeEventListener('simac:abrir-chat', onAbrirGlobal);
  }, []);

  // ── Abrir automáticamente al llegar desde una notificación push (?abrirChat=1) ──
  useEffect(() => {
    if (!esUsuarioFinal) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('abrirChat') === '1') {
      abrirRef.current?.();
      params.delete('abrirChat');
      const nueva = window.location.pathname + (params.toString() ? `?${params}` : '');
      window.history.replaceState({}, '', nueva);
    }
  }, [esUsuarioFinal]);

  // ── Difundir el contador de no leídos para el botón del header ──
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('simac:chat-unread', { detail: noLeidos }));
  }, [noLeidos]);

  // ── Cargar conversación inicial ──
  useEffect(() => {
    if (!esUsuarioFinal) return;
    apiFetch('/chat/mi-conversacion').then(r => r.json()).then(d => {
      const msgs: Mensaje[] = d.mensajes || [];
      msgs.forEach(m => idsVistos.current.add(m.id));
      setMensajes(msgs);
      const conv = d.conversacion;
      if (conv?.no_leidos_usuario) { setNoLeidos(conv.no_leidos_usuario); setDivisorNoLeidos(conv.no_leidos_usuario); }
      if (conv?.admin_leido_hasta) setAdminLeidoHasta(conv.admin_leido_hasta);
    }).catch(() => {});
  }, [esUsuarioFinal]);

  // ── SSE en tiempo real ──
  useEffect(() => {
    if (!esUsuarioFinal || !token) return;
    const url = `${BASE}/chat/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.tipo === 'mensaje') {
          const mensaje: Mensaje = payload.mensaje;
          if (idsVistos.current.has(mensaje.id)) return;
          idsVistos.current.add(mensaje.id);
          setMensajes(prev => [...prev, mensaje]);
          playReceivedSound();
          setOpen(prevOpen => {
            if (!prevOpen) setNoLeidos(n => n + 1);
            return prevOpen;
          });
        } else if (payload.tipo === 'leido') {
          setAdminLeidoHasta(payload.admin_leido_hasta);
        } else if (payload.tipo === 'escribiendo') {
          setAdminEscribiendo(true);
          if (escribiendoAdminTimeoutRef.current) clearTimeout(escribiendoAdminTimeoutRef.current);
          escribiendoAdminTimeoutRef.current = setTimeout(() => setAdminEscribiendo(false), 4000);
        } else if (payload.tipo === 'ubicacion') {
          setMensajes(prev => prev.map(m => m.id === payload.mensajeId ? { ...m, lat: payload.lat, lng: payload.lng } : m));
        } else if (payload.tipo === 'ubicacion-fin') {
          setMensajes(prev => prev.map(m => m.id === payload.mensajeId ? { ...m, activo_hasta: new Date(0).toISOString() } : m));
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { es.close(); };
    return () => { es.close(); };
  }, [esUsuarioFinal, token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes, open, adminEscribiendo]);

  const abrir = useCallback(() => {
    desbloquearAudio();
    setOpen(true);
    setNoLeidos(0);
    apiFetch('/chat/leido', { method: 'PATCH' }).catch(() => {});
  }, []);
  abrirRef.current = abrir;

  function onCambiarTexto(v: string) {
    setTexto(v);
    const ahora = Date.now();
    if (ahora - ultimoEnvioEscribiendo.current > 2500) {
      ultimoEnvioEscribiendo.current = ahora;
      apiFetch('/chat/escribiendo', { method: 'POST' }).catch(() => {});
    }
  }

  // ── Arrastrar burbuja (clamp a la pantalla) ──
  function onPointerDown(e: React.PointerEvent) {
    desbloquearAudio();
    dragRef.current = { startX: e.clientX - pos.x, startY: e.clientY - pos.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - (dragRef.current.startX + pos.x));
    const dy = Math.abs(e.clientY - (dragRef.current.startY + pos.y));
    if (dx > 3 || dy > 3) dragRef.current.moved = true;
    const nx = Math.min(Math.max(8, e.clientX - dragRef.current.startX), window.innerWidth - 66);
    const ny = Math.min(Math.max(8, e.clientY - dragRef.current.startY), window.innerHeight - 66);
    setPos({ x: nx, y: ny });
  }
  function onPointerUp() {
    if (dragRef.current && !dragRef.current.moved) abrir();
    if (dragRef.current) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    dragRef.current = null;
  }

  function ocultarBurbuja(e: React.MouseEvent) {
    e.stopPropagation();
    setHidden(true);
    localStorage.setItem(HIDDEN_KEY, '1');
  }

  function mostrarBurbuja() {
    setHidden(false);
    localStorage.removeItem(HIDDEN_KEY);
  }

  // ── Envío de mensajes ──
  async function enviar(fd?: FormData) {
    const body = fd ?? new FormData();
    if (!fd) {
      if (!texto.trim()) return;
      body.append('contenido', texto.trim());
    }
    setEnviando(true);
    try {
      const res = await apiFetch('/chat/mensaje', { method: 'POST', body });
      const d = await res.json();
      if (res.ok && d.mensaje) {
        idsVistos.current.add(d.mensaje.id);
        setMensajes(prev => [...prev, d.mensaje]);
        setTexto('');
        playSentSound();
      }
    } catch { /* ignore — el guard global ya avisa si es problema de conexión */ }
    finally { setEnviando(false); }
  }

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('archivo', file);
    enviar(fd);
  }

  async function enviarUbicacionActual() {
    setUbicacionSheet(false);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((posGeo) => {
      const fd = new FormData();
      fd.append('lat', String(posGeo.coords.latitude));
      fd.append('lng', String(posGeo.coords.longitude));
      enviar(fd);
    }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  }

  async function compartirUbicacionEnVivo() {
    setUbicacionSheet(false);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (posGeo) => {
      const fd = new FormData();
      fd.append('lat', String(posGeo.coords.latitude));
      fd.append('lng', String(posGeo.coords.longitude));
      fd.append('en_vivo', 'true');
      const res = await apiFetch('/chat/mensaje', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok || !d.mensaje) return;
      idsVistos.current.add(d.mensaje.id);
      setMensajes(prev => [...prev, d.mensaje]);
      playSentSound();
      setCompartiendoEnVivo(d.mensaje.id);

      watchIdRef.current = navigator.geolocation.watchPosition((p) => {
        apiFetch(`/chat/mensaje/${d.mensaje.id}/ubicacion`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude }),
        }).catch(() => {});
        setMensajes(prev => prev.map(m => m.id === d.mensaje.id ? { ...m, lat: p.coords.latitude, lng: p.coords.longitude } : m));
      }, () => {}, { enableHighAccuracy: true });

      // Se detiene sola a los 15 minutos, igual que el backend.
      setTimeout(() => detenerUbicacionEnVivo(d.mensaje.id), 15 * 60 * 1000);
    }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  }

  function detenerUbicacionEnVivo(mensajeId: number) {
    if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    setCompartiendoEnVivo(null);
    apiFetch(`/chat/mensaje/${mensajeId}/detener`, { method: 'PATCH' }).catch(() => {});
    setMensajes(prev => prev.map(m => m.id === mensajeId ? { ...m, activo_hasta: new Date(0).toISOString() } : m));
  }

  useEffect(() => () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); }, []);

  function mimeGrabacionSoportado(): string {
    const candidatos = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    for (const c of candidatos) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return '';
  }

  async function iniciarGrabacion() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = mimeGrabacionSoportado();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      grabacionCanceladaRef.current = false;
      rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (grabacionTimerRef.current) clearInterval(grabacionTimerRef.current);
        if (grabacionCanceladaRef.current) { chunksRef.current = []; return; }
        const tipoFinal = rec.mimeType || mimeType || 'audio/webm';
        const ext = tipoFinal.includes('mp4') ? 'm4a' : tipoFinal.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: tipoFinal });
        const fd = new FormData();
        fd.append('archivo', blob, `audio_${Date.now()}.${ext}`);
        enviar(fd);
      };
      mediaRecRef.current = rec;
      rec.start();
      setGrabando(true);
      setGrabacionSegundos(0);
      grabacionTimerRef.current = setInterval(() => setGrabacionSegundos(s => s + 1), 1000);
    } catch { /* micrófono no disponible o permiso denegado */ }
  }

  function detenerYEnviarGrabacion() {
    grabacionCanceladaRef.current = false;
    mediaRecRef.current?.stop();
    setGrabando(false);
  }

  function cancelarGrabacion() {
    grabacionCanceladaRef.current = true;
    mediaRecRef.current?.stop();
    setGrabando(false);
  }

  if (!esUsuarioFinal) return null;

  return createPortal(
    <>
      {/* ── Burbuja flotante ── */}
      {!hidden && !open && (
        <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 60 }}>
          {/* Botón que se arrastra / abre el chat — la "×" vive FUERA de este
              botón (como hermano, no hijo) para que tocarla no dispare
              también la lógica de arrastre/abrir del botón grande. */}
          <button
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ touchAction: 'none' }}
            className="relative w-[58px] h-[58px] rounded-full flex items-center justify-center shadow-[0_10px_24px_rgba(18,63,39,0.4)] active:scale-95 transition-transform"
          >
            <span className="absolute inset-0 rounded-full animate-ping bg-[#1f7a49]/30" />
            <span className="relative w-full h-full rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center">
              <MessageCircle size={26} className="text-white" strokeWidth={2} />
              {noLeidos > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center">
                  <span className="text-white text-[9.5px] font-black">{noLeidos > 9 ? '9+' : noLeidos}</span>
                </span>
              )}
            </span>
          </button>

          <button
            onClick={ocultarBurbuja}
            onPointerDown={e => e.stopPropagation()}
            aria-label="Ocultar burbuja de ayuda"
            style={{ touchAction: 'manipulation' }}
            className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center active:scale-90 transition-transform"
          >
            <X size={11} className="text-slate-500" />
          </button>
        </div>
      )}

      {/* ── Acceso discreto cuando está oculta ── */}
      {hidden && !open && (
        <button
          onClick={mostrarBurbuja}
          style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 60 }}
          className="w-11 h-11 rounded-full bg-white shadow-lg border border-slate-200/70 flex items-center justify-center active:scale-90 transition-transform"
          aria-label="Ayuda y soporte"
        >
          <MessageCircle size={19} className="text-[#1A5C38]" strokeWidth={2} />
        </button>
      )}

      {/* ── Panel de chat ── */}
      {open && (
        <div style={{ zIndex: 70 }} className="fixed inset-0 flex flex-col bg-[#f4f7f5] animate-fade-in">
          {/* Header */}
          <div className="flex-none bg-gradient-to-br from-[#14482c] via-[#1A5C38] to-[#1e6b42] px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-3.5 flex items-center gap-3 shadow-lg">
            <button onClick={() => setOpen(false)} className="text-white/90 active:scale-90 transition-transform">
              <ChevronLeft size={22} strokeWidth={2.4} />
            </button>
            <div className="w-9 h-9 rounded-full bg-white/18 border-2 border-white/30 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={17} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[14.5px] font-bold leading-tight">Ayuda y soporte SIMAC</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${enHorario ? 'bg-emerald-300' : 'bg-rose-400'}`} />
                <span className={`text-[10px] font-semibold ${enHorario ? 'text-white/75' : 'text-rose-300'}`}>
                  {enHorario ? 'Responde en minutos' : 'Fuera de horario · Responde L-V de 9am a 6pm'}
                </span>
              </div>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} style={chatWallpaper} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5 bg-[#f4f7f5]">
            {mensajes.length === 0 && (
              <div className="text-center text-[12px] text-slate-400 mt-10">
                Escríbenos si tienes cualquier duda o problema con la app.
              </div>
            )}
            {mensajes.map((m, idx) => {
              const esMio = m.autor_id === user?.userId;
              const leido = esMio && !!adminLeidoHasta && new Date(m.created_at) <= new Date(adminLeidoHasta);
              const mostrarDivisor = divisorNoLeidos > 0 && idx === mensajes.length - divisorNoLeidos;
              return (
                <div key={m.id} className="contents">
                {mostrarDivisor && (
                  <div className="flex items-center gap-2.5 my-1.5">
                    <div className="flex-1 h-px bg-rose-200" />
                    <span className="text-[9.5px] font-bold text-rose-500 uppercase tracking-wide">Mensajes nuevos</span>
                    <div className="flex-1 h-px bg-rose-200" />
                  </div>
                )}
                <div style={bubbleShadow} className={`flex flex-col animate-msg-in ${esMio ? 'items-end' : 'items-start'}`}>
                  <div style={bubbleRadius(esMio)} className={`relative max-w-[78%] px-3.5 py-2.5 ${
                    esMio ? 'bg-gradient-to-br from-[#1f7a49] to-[#17603a]' : 'bg-white'
                  }`}>
                    <Tail esMio={esMio} color={esMio ? '#17603a' : '#ffffff'} />
                    {m.tipo === 'imagen' && m.archivo_url && (
                      <img src={`${BASE.replace('/api', '')}${m.archivo_url}`} onClick={() => setLightboxSrc(`${BASE.replace('/api', '')}${m.archivo_url}`)}
                        className="rounded-xl max-w-[220px] mb-1.5 cursor-pointer" />
                    )}
                    {m.tipo === 'audio' && m.archivo_url && (
                      <AudioPlayer src={`${BASE.replace('/api', '')}${m.archivo_url}`} tono={esMio ? 'propio' : 'ajeno'} />
                    )}
                    {m.tipo === 'archivo' && m.archivo_url && (
                      <a href={`${BASE.replace('/api', '')}${m.archivo_url}`} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-2 text-[12px] font-semibold underline ${esMio ? 'text-white' : 'text-[#1A5C38]'}`}>
                        <Paperclip size={13} /> {m.archivo_nombre || 'Archivo adjunto'}
                      </a>
                    )}
                    {(m.tipo === 'ubicacion' || m.tipo === 'ubicacion_vivo') && m.lat && m.lng && (
                      <LocationPreview lat={m.lat} lng={m.lng} enVivo={m.tipo === 'ubicacion_vivo'} activoHasta={m.activo_hasta}
                        puedeDetener={esMio && compartiendoEnVivo === m.id} onDetener={() => detenerUbicacionEnVivo(m.id)} />
                    )}
                    {m.contenido && (
                      <div className={`text-[13px] leading-[1.45] ${esMio ? 'text-white' : 'text-slate-800'}`}>{m.contenido}</div>
                    )}
                    <div className={`flex items-center justify-end gap-1 mt-1 ${esMio ? 'text-white/65' : 'text-slate-300'}`}>
                      <span className="text-[9px]">{fmtHora(m.created_at)}</span>
                      {esMio && <Ticks dobles leido={leido} />}
                    </div>
                  </div>
                </div>
                </div>
              );
            })}
            {adminEscribiendo && (
              <div className="flex items-start">
                <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* Emoji picker */}
          {showEmoji && (
            <div className="flex-none bg-white border-t border-slate-100 px-4 py-2.5 grid grid-cols-6 gap-1.5">
              {EMOJIS.map(em => (
                <button key={em} onClick={() => { setTexto(t => t + em); setShowEmoji(false); }}
                  className="text-[22px] active:scale-90 transition-transform">{em}</button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div className="flex-none bg-white border-t border-slate-100 px-3 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 10px)' }}>
            {grabando ? (
              <div className="flex items-center gap-3 py-1.5">
                <button onClick={cancelarGrabacion} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 active:scale-90 transition-transform">
                  <Trash2 size={17} />
                </button>
                <div className="flex-1 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[13px] font-bold text-slate-700 tabular-nums">
                    {Math.floor(grabacionSegundos / 60)}:{(grabacionSegundos % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[11px] text-slate-400">Grabando audio…</span>
                </div>
                <button onClick={detenerYEnviarGrabacion}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center flex-shrink-0 text-white active:scale-90 transition-transform">
                  <SendIcon size={17} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5 mb-2 pl-1">
                  <button onClick={() => setShowEmoji(v => !v)} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><Smile size={20} /></button>
                  <button onClick={() => fileImgRef.current?.click()} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><ImageIcon size={20} /></button>
                  <button onClick={iniciarGrabacion} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><Mic size={20} /></button>
                  <button onClick={() => setUbicacionSheet(true)} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><MapPin size={20} /></button>
                  <button onClick={() => fileDocRef.current?.click()} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><Paperclip size={20} /></button>
                  <input ref={fileImgRef} type="file" accept="image/*" className="hidden" onChange={onArchivo} />
                  <input ref={fileDocRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={onArchivo} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={texto}
                    onChange={e => onCambiarTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                    placeholder="Escribe un mensaje…"
                    className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-[13px] outline-none"
                  />
                  <button onClick={() => enviar()} disabled={enviando || !texto.trim()}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 active:scale-90 transition-transform">
                    <SendIcon size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* ── Selector de tipo de ubicación ── */}
      {ubicacionSheet && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 90 }} onClick={() => setUbicacionSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={e => e.stopPropagation()}
            className="relative w-full max-w-md bg-white rounded-t-3xl p-4 animate-sheet-up"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)' }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <button onClick={enviarUbicacionActual} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl active:bg-slate-50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-[#eef8f2] flex items-center justify-center flex-shrink-0"><MapPin size={18} className="text-[#1A5C38]" /></div>
              <div className="text-left"><p className="text-[13.5px] font-bold text-slate-800">Ubicación actual</p><p className="text-[11px] text-slate-400">Comparte tu punto exacto una sola vez</p></div>
            </button>
            <button onClick={compartirUbicacionEnVivo} className="w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl active:bg-slate-50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0"><Navigation size={18} className="text-rose-600" /></div>
              <div className="text-left"><p className="text-[13.5px] font-bold text-slate-800">Ubicación en tiempo real</p><p className="text-[11px] text-slate-400">Se actualiza mientras te mueves, por 15 minutos</p></div>
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
