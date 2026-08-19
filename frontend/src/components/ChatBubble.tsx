import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle, X, Send, Smile, Image as ImageIcon, Mic, Paperclip,
  MapPin, Square, ChevronLeft, CheckCheck,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { apiFetch, BASE } from '../services/api';

interface Mensaje {
  id: number;
  autor_id: number;
  autor_rol: string;
  tipo: 'texto' | 'imagen' | 'audio' | 'archivo' | 'ubicacion';
  contenido: string | null;
  archivo_url: string | null;
  archivo_mime: string | null;
  archivo_nombre: string | null;
  lat: number | null;
  lng: number | null;
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

  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileDocRef = useRef<HTMLInputElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── Cargar conversación inicial ──
  useEffect(() => {
    if (!esUsuarioFinal) return;
    apiFetch('/chat/mi-conversacion').then(r => r.json()).then(d => {
      setMensajes(d.mensajes || []);
      const conv = d.conversacion;
      if (conv?.no_leidos_usuario) setNoLeidos(conv.no_leidos_usuario);
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
        const { tipo, mensaje } = JSON.parse(e.data);
        if (tipo === 'mensaje') {
          setMensajes(prev => [...prev, mensaje]);
          setOpen(prevOpen => {
            if (!prevOpen) setNoLeidos(n => n + 1);
            return prevOpen;
          });
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { es.close(); };
    return () => { es.close(); };
  }, [esUsuarioFinal, token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes, open]);

  const abrir = useCallback(() => {
    setOpen(true);
    setNoLeidos(0);
    apiFetch('/chat/leido', { method: 'PATCH' }).catch(() => {});
  }, []);

  // ── Arrastrar burbuja (clamp a la pantalla) ──
  function onPointerDown(e: React.PointerEvent) {
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
        setMensajes(prev => [...prev, d.mensaje]);
        setTexto('');
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

  function enviarUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((posGeo) => {
      const fd = new FormData();
      fd.append('lat', String(posGeo.coords.latitude));
      fd.append('lng', String(posGeo.coords.longitude));
      enviar(fd);
    }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  }

  async function toggleGrabar() {
    if (grabando) {
      mediaRecRef.current?.stop();
      setGrabando(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => chunksRef.current.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const fd = new FormData();
        fd.append('archivo', blob, `audio_${Date.now()}.webm`);
        enviar(fd);
      };
      mediaRecRef.current = rec;
      rec.start();
      setGrabando(true);
    } catch { /* micrófono no disponible o permiso denegado */ }
  }

  if (!esUsuarioFinal) return null;

  return createPortal(
    <>
      {/* ── Burbuja flotante ── */}
      {!hidden && !open && (
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 60, touchAction: 'none' }}
          className="w-[58px] h-[58px] rounded-full flex items-center justify-center shadow-[0_10px_24px_rgba(18,63,39,0.4)] active:scale-95 transition-transform"
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
          <span
            onClick={ocultarBurbuja}
            className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center"
          >
            <X size={10} className="text-slate-500" />
          </span>
        </button>
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
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                <span className="text-white/75 text-[10px] font-semibold">Responde en minutos</span>
              </div>
            </div>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2.5">
            {mensajes.length === 0 && (
              <div className="text-center text-[12px] text-slate-400 mt-10">
                Escríbenos si tienes cualquier duda o problema con la app.
              </div>
            )}
            {mensajes.map(m => {
              const esMio = m.autor_id === user?.userId;
              return (
                <div key={m.id} className={`flex flex-col ${esMio ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                    esMio ? 'bg-gradient-to-br from-[#1f7a49] to-[#17603a] rounded-br-md' : 'bg-white rounded-bl-md'
                  }`}>
                    {m.tipo === 'imagen' && m.archivo_url && (
                      <img src={`${BASE.replace('/api', '')}${m.archivo_url}`} className="rounded-xl max-w-[220px] mb-1.5" />
                    )}
                    {m.tipo === 'audio' && m.archivo_url && (
                      <audio controls src={`${BASE.replace('/api', '')}${m.archivo_url}`} className="max-w-[220px] mb-1" />
                    )}
                    {m.tipo === 'archivo' && m.archivo_url && (
                      <a href={`${BASE.replace('/api', '')}${m.archivo_url}`} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-2 text-[12px] font-semibold underline ${esMio ? 'text-white' : 'text-[#1A5C38]'}`}>
                        <Paperclip size={13} /> {m.archivo_nombre || 'Archivo adjunto'}
                      </a>
                    )}
                    {m.tipo === 'ubicacion' && m.lat && m.lng && (
                      <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer"
                        className={`flex items-center gap-1.5 text-[12px] font-bold ${esMio ? 'text-white' : 'text-[#1A5C38]'}`}>
                        <MapPin size={14} /> Ver ubicación
                      </a>
                    )}
                    {m.contenido && (
                      <div className={`text-[13px] leading-[1.45] ${esMio ? 'text-white' : 'text-slate-800'}`}>{m.contenido}</div>
                    )}
                    <div className={`flex items-center justify-end gap-1 mt-1 ${esMio ? 'text-white/65' : 'text-slate-300'}`}>
                      <span className="text-[9px]">{fmtHora(m.created_at)}</span>
                      {esMio && <CheckCheck size={11} />}
                    </div>
                  </div>
                </div>
              );
            })}
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
            <div className="flex items-center gap-1.5 mb-2 pl-1">
              <button onClick={() => setShowEmoji(v => !v)} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><Smile size={20} /></button>
              <button onClick={() => fileImgRef.current?.click()} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><ImageIcon size={20} /></button>
              <button onClick={toggleGrabar} className={`p-1.5 active:scale-90 transition-transform ${grabando ? 'text-rose-500' : 'text-slate-500'}`}>
                {grabando ? <Square size={20} /> : <Mic size={20} />}
              </button>
              <button onClick={enviarUbicacion} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><MapPin size={20} /></button>
              <button onClick={() => fileDocRef.current?.click()} className="p-1.5 text-slate-500 active:scale-90 transition-transform"><Paperclip size={20} /></button>
              <input ref={fileImgRef} type="file" accept="image/*" className="hidden" onChange={onArchivo} />
              <input ref={fileDocRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={onArchivo} />
            </div>
            <div className="flex items-center gap-2">
              <input
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                placeholder={grabando ? 'Grabando audio…' : 'Escribe un mensaje…'}
                disabled={grabando}
                className="flex-1 bg-slate-100 rounded-full px-4 py-2.5 text-[13px] outline-none disabled:opacity-50"
              />
              <button onClick={() => enviar()} disabled={enviando || !texto.trim()}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-90 transition-transform">
                <Send size={16} className="text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
