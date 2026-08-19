import { useEffect, useRef, useState } from 'react';
import {
  Search, MessageCircle, Paperclip, Image as ImageIcon,
  Smile, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import { apiFetch, BASE } from '../../services/api';
import ErrorConexionBanner from '../../components/admin/ErrorConexionBanner';
import { playSentSound, playReceivedSound, desbloquearAudio } from '../../utils/chatSounds';
import { AudioPlayer, ImageLightbox, LocationPreview, Tail, bubbleRadius, bubbleShadow, chatWallpaper, SendIcon } from '../../components/chat/ChatMedia';

/** Palomita(s) estilo WhatsApp: una = enviado, dos = entregado/leído. */
function Ticks({ leido }: { leido: boolean }) {
  const color = leido ? '#7dd3fc' : 'currentColor';
  return (
    <svg width="15" height="11" viewBox="0 0 16 11" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5.2 3.8 8 9 1.8" opacity="0.95" />
      <path d="M6.2 5.2 9 8 14.5 1.8" />
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

interface Conversacion {
  id: number;
  usuario_id: number;
  nombre_completo: string;
  email: string;
  telefono: string;
  curp: string | null;
  rol_usuario: string;
  rol_legible: string;
  estatus: string;
  no_leidos_admin: number;
  ultimo_mensaje_at: string;
  ultimo_contenido: string | null;
  ultimo_tipo: string | null;
}

interface Mensaje {
  id: number;
  autor_id: number;
  autor_rol: string;
  tipo: string;
  contenido: string | null;
  archivo_url: string | null;
  archivo_mime: string | null;
  archivo_nombre: string | null;
  lat: number | null;
  lng: number | null;
  activo_hasta: string | null;
  created_at: string;
}

const EMOJIS = ['😀', '😅', '👍', '🙏', '🙌', '😢', '😡', '❓', '✅', '📍', '🌽', '🚜'];

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function fmtFecha(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return fmtHora(iso);
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}
function previewTexto(c: Conversacion) {
  if (c.ultimo_tipo === 'imagen') return 'Imagen';
  if (c.ultimo_tipo === 'audio') return 'Audio';
  if (c.ultimo_tipo === 'ubicacion') return 'Ubicación';
  if (c.ultimo_tipo === 'archivo') return 'Archivo adjunto';
  return c.ultimo_contenido || '—';
}

export default function ChatsAdminPage() {
  const { user, token } = useAuthStore();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'sin_leer' | 'productor' | 'bodega'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<Conversacion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [usuarioLeidoHasta, setUsuarioLeidoHasta] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [escribiendoIds, setEscribiendoIds] = useState<Set<number>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileImgRef = useRef<HTMLInputElement>(null);
  const fileDocRef = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const seleccionadaRef = useRef<Conversacion | null>(null);
  seleccionadaRef.current = seleccionada;
  const idsVistos = useRef<Set<number>>(new Set());
  const escribiendoTimeouts = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const ultimoEnvioEscribiendo = useRef(0);

  async function cargarLista() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/chats');
      const d = await res.json();
      setConversaciones(d.conversaciones || []);
    } catch (e: any) {
      if (e?.message === 'SIN_CONEXION') setErrorConexion(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargarLista(); }, []);

  // SSE: refresca la lista y agrega mensajes en vivo a la conversación abierta
  useEffect(() => {
    if (!token) return;
    const url = `${BASE}/admin/chats/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.tipo === 'leido') {
          if (seleccionadaRef.current?.id === payload.conversacionId) {
            setUsuarioLeidoHasta(payload.usuario_leido_hasta);
          }
          return;
        }
        if (payload.tipo === 'escribiendo') {
          const cid = payload.conversacionId;
          setEscribiendoIds(prev => new Set(prev).add(cid));
          const prevTimeout = escribiendoTimeouts.current.get(cid);
          if (prevTimeout) clearTimeout(prevTimeout);
          escribiendoTimeouts.current.set(cid, setTimeout(() => {
            setEscribiendoIds(prev => { const n = new Set(prev); n.delete(cid); return n; });
          }, 4000));
          return;
        }
        if (payload.tipo === 'ubicacion') {
          setMensajes(prev => prev.map(m => m.id === payload.mensajeId ? { ...m, lat: payload.lat, lng: payload.lng } : m));
          return;
        }
        if (payload.tipo === 'ubicacion-fin') {
          setMensajes(prev => prev.map(m => m.id === payload.mensajeId ? { ...m, activo_hasta: new Date(0).toISOString() } : m));
          return;
        }
        if (payload.tipo !== 'mensaje') return;
        const { conversacionId, mensaje } = payload;
        cargarLista();
        setEscribiendoIds(prev => { if (!prev.has(conversacionId)) return prev; const n = new Set(prev); n.delete(conversacionId); return n; });
        const esNuevo = !idsVistos.current.has(mensaje.id);
        if (esNuevo) idsVistos.current.add(mensaje.id);
        if (seleccionadaRef.current?.id === conversacionId && esNuevo) {
          setMensajes(prev => [...prev, mensaje]);
        }
        // Sonido de "recibido": solo para mensajes que no son eco de mi propio envío.
        if (esNuevo && mensaje.autor_id !== user?.userId) playReceivedSound();
      } catch { /* ignore */ }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [token, user?.userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [mensajes, seleccionada && escribiendoIds.has(seleccionada.id)]);

  async function abrirConversacion(c: Conversacion) {
    desbloquearAudio();
    setSeleccionada(c);
    setMensajes([]);
    setUsuarioLeidoHasta(null);
    try {
      const res = await apiFetch(`/admin/chats/${c.id}/mensajes`);
      const d = await res.json();
      const msgs: Mensaje[] = d.mensajes || [];
      msgs.forEach(m => idsVistos.current.add(m.id));
      setMensajes(msgs);
      setUsuarioLeidoHasta(d.conversacion?.usuario_leido_hasta ?? null);
      await apiFetch(`/admin/chats/${c.id}/leido`, { method: 'PATCH' });
      setConversaciones(prev => prev.map(x => x.id === c.id ? { ...x, no_leidos_admin: 0 } : x));
    } catch { /* ignore */ }
  }

  async function enviar(fd?: FormData) {
    if (!seleccionada) return;
    const body = fd ?? new FormData();
    if (!fd) {
      if (!texto.trim()) return;
      body.append('contenido', texto.trim());
    }
    setEnviando(true);
    try {
      const res = await apiFetch(`/admin/chats/${seleccionada.id}/mensaje`, { method: 'POST', body });
      const d = await res.json();
      if (res.ok && d.mensaje) {
        idsVistos.current.add(d.mensaje.id);
        setMensajes(prev => [...prev, d.mensaje]);
        setTexto('');
        playSentSound();
        cargarLista();
      }
    } catch { /* ignore */ }
    finally { setEnviando(false); }
  }

  function onCambiarTexto(v: string) {
    setTexto(v);
    if (!seleccionada) return;
    const ahora = Date.now();
    if (ahora - ultimoEnvioEscribiendo.current > 2500) {
      ultimoEnvioEscribiendo.current = ahora;
      apiFetch(`/admin/chats/${seleccionada.id}/escribiendo`, { method: 'POST' }).catch(() => {});
    }
  }

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('archivo', file);
    enviar(fd);
  }

  const filtradas = conversaciones.filter(c => {
    if (filtro === 'sin_leer' && c.no_leidos_admin === 0) return false;
    if (filtro === 'productor' && c.rol_usuario !== 'productor') return false;
    if (filtro === 'bodega' && c.rol_usuario === 'productor') return false;
    if (busqueda && !c.nombre_completo?.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const totalNoLeidos = conversaciones.reduce((s, c) => s + c.no_leidos_admin, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] gap-3 overflow-hidden">
      <div className="bg-[#eef8f2] flex-shrink-0 rounded-b-2xl border border-[#1A5C38]/30 border-t-0 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#1A5C38]/60 uppercase tracking-wide">
          {totalNoLeidos > 0 ? `${totalNoLeidos} mensajes sin leer` : 'Soporte a productores y bodegas'}
        </span>
        <button onClick={cargarLista} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-bold text-[#1A5C38] bg-[#d4efe1] hover:bg-[#1A5C38] hover:text-white border border-[#1A5C38]/20 hover:border-transparent px-2.5 py-1.5 rounded-lg active:scale-95 transition-all duration-150 disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Recargar
        </button>
      </div>

      {errorConexion && <ErrorConexionBanner onRetry={cargarLista} />}

      <div className="flex-1 flex gap-3 min-h-0">
        {/* Lista de conversaciones */}
        <div className="w-[320px] flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-50 flex-shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar conversación..."
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] outline-none focus:border-[#1A5C38]/40" />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {([
                ['todos', 'Todos'], ['sin_leer', 'Sin leer'], ['productor', 'Productores'], ['bodega', 'Bodegas'],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFiltro(key)}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                    filtro === key ? 'bg-[#1A5C38] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-[12px] gap-2">
                <RefreshCw size={14} className="animate-spin" /> Cargando…
              </div>
            ) : filtradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300">
                <MessageCircle size={26} />
                <span className="text-[12px] text-gray-400">Sin conversaciones</span>
              </div>
            ) : filtradas.map(c => (
              <button key={c.id} onClick={() => abrirConversacion(c)}
                className={`w-full flex gap-2.5 px-3.5 py-3 text-left border-b border-gray-50 hover:bg-[#f9fdfb] transition-colors ${
                  seleccionada?.id === c.id ? 'bg-[#eef8f2] border-l-[3px] border-l-[#1A5C38]' : ''
                }`}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[11px] font-black">{(c.nombre_completo || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-[12px] font-extrabold text-gray-900 truncate">{c.nombre_completo || 'Usuario'}</span>
                    <span className="text-[9px] text-gray-400 flex-shrink-0">{fmtFecha(c.ultimo_mensaje_at)}</span>
                  </div>
                  <div className={`text-[8.5px] font-bold uppercase tracking-wide mt-0.5 ${c.rol_usuario === 'productor' ? 'text-[#1A5C38]' : 'text-blue-600'}`}>
                    {c.rol_legible}
                  </div>
                  <div className={`text-[11px] truncate mt-0.5 ${escribiendoIds.has(c.id) ? 'text-emerald-600 font-semibold italic' : 'text-gray-500'}`}>
                    {escribiendoIds.has(c.id) ? 'escribiendo…' : previewTexto(c)}
                  </div>
                </div>
                {c.no_leidos_admin > 0 && (
                  <span className="w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[9.5px] font-black flex items-center justify-center flex-shrink-0 self-center">
                    {c.no_leidos_admin > 9 ? '9+' : c.no_leidos_admin}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de conversación */}
        <div className="flex-1 bg-[#dbe5df] rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden min-w-0">
          {!seleccionada ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-300">
              <MessageCircle size={36} />
              <span className="text-[13px] font-bold text-gray-400">Selecciona una conversación</span>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[11px] font-black">{(seleccionada.nombre_completo || '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-extrabold text-gray-900 truncate">{seleccionada.nombre_completo}</div>
                  <div className="text-[10px] text-gray-400 truncate">{seleccionada.rol_legible} · {seleccionada.email}{seleccionada.curp ? ` · CURP ${seleccionada.curp}` : ''}</div>
                </div>
                <span className="ml-auto text-[10px] font-extrabold px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex-shrink-0">
                  {seleccionada.estatus === 'abierta' ? 'Abierta' : 'Resuelta'}
                </span>
              </div>

              <div ref={scrollRef} style={chatWallpaper} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2.5">
                {mensajes.map(m => {
                  // Vista del admin: los mensajes del equipo de soporte van a la derecha,
                  // los del productor/bodeguero (dueño de la conversación) a la izquierda.
                  const alinearDerecha = m.autor_id !== seleccionada.usuario_id;
                  const url = m.archivo_url ? `${BASE.replace('/api', '')}${m.archivo_url}` : '';
                  const esSoloImagen = m.tipo === 'imagen' && !!m.archivo_url && !m.contenido;
                  return (
                    <div key={m.id} style={bubbleShadow} className={`flex flex-col animate-msg-in ${alinearDerecha ? 'items-end' : 'items-start'}`}>
                      <div style={bubbleRadius(alinearDerecha)} className={`relative max-w-[55%] ${esSoloImagen ? 'p-[3px]' : 'px-3.5 py-2.5'} ${
                        alinearDerecha ? 'bg-gradient-to-br from-[#1f7a49] to-[#17603a]' : 'bg-white'
                      }`}>
                        <Tail esMio={alinearDerecha} color={alinearDerecha ? '#17603a' : '#ffffff'} />
                        {m.tipo === 'imagen' && m.archivo_url && esSoloImagen && (
                          <div className="relative">
                            <img src={url} onClick={() => setLightboxSrc(url)} className="rounded-[10px] max-w-[260px] block cursor-pointer" />
                            <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-black/40 rounded-full pl-2 pr-1.5 py-0.5">
                              <span className="text-[9px] text-white/95">{fmtHora(m.created_at)}</span>
                              {alinearDerecha && (
                                <Ticks leido={!!usuarioLeidoHasta && new Date(m.created_at) <= new Date(usuarioLeidoHasta)} />
                              )}
                            </div>
                          </div>
                        )}
                        {m.tipo === 'imagen' && m.archivo_url && !esSoloImagen && (
                          <img src={url} onClick={() => setLightboxSrc(url)} className="rounded-xl max-w-[260px] mb-1.5 cursor-pointer" />
                        )}
                        {m.tipo === 'audio' && m.archivo_url && (
                          <AudioPlayer src={url} tono={alinearDerecha ? 'propio' : 'ajeno'} />
                        )}
                        {m.tipo === 'archivo' && m.archivo_url && (
                          <a href={url} target="_blank" rel="noreferrer"
                            className={`flex items-center gap-2 text-[12px] font-semibold underline ${alinearDerecha ? 'text-white' : 'text-[#1A5C38]'}`}>
                            <Paperclip size={13} /> {m.archivo_nombre || 'Archivo adjunto'}
                          </a>
                        )}
                        {(m.tipo === 'ubicacion' || m.tipo === 'ubicacion_vivo') && m.lat && m.lng && (
                          <LocationPreview lat={m.lat} lng={m.lng} enVivo={m.tipo === 'ubicacion_vivo'} activoHasta={m.activo_hasta} />
                        )}
                        {m.contenido && (
                          <div className={`text-[13px] leading-[1.5] ${alinearDerecha ? 'text-white' : 'text-slate-800'}`}>{m.contenido}</div>
                        )}
                        {!esSoloImagen && (
                          <div className={`flex items-center justify-end gap-1 mt-1 ${alinearDerecha ? 'text-white/65' : 'text-slate-300'}`}>
                            <span className="text-[9px]">{fmtHora(m.created_at)}</span>
                            {alinearDerecha && (
                              <Ticks leido={!!usuarioLeidoHasta && new Date(m.created_at) <= new Date(usuarioLeidoHasta)} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {escribiendoIds.has(seleccionada.id) && (
                  <div className="flex items-start">
                    <div className="bg-white rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-sm">
                      <TypingDots />
                    </div>
                  </div>
                )}
              </div>

              {showEmoji && (
                <div className="flex-shrink-0 bg-white border-t border-gray-100 px-5 py-2.5 grid grid-cols-12 gap-1.5">
                  {EMOJIS.map(em => (
                    <button key={em} onClick={() => { setTexto(t => t + em); setShowEmoji(false); }}
                      className="text-[20px] active:scale-90 transition-transform">{em}</button>
                  ))}
                </div>
              )}

              <div className="flex-shrink-0 bg-white border-t border-gray-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <button onClick={() => setShowEmoji(v => !v)} className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500"><Smile size={16} /></button>
                    <button onClick={() => fileImgRef.current?.click()} className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500"><ImageIcon size={16} /></button>
                    <button onClick={() => fileDocRef.current?.click()} className="w-9 h-9 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500"><Paperclip size={16} /></button>
                    <input ref={fileImgRef} type="file" accept="image/*" className="hidden" onChange={onArchivo} />
                    <input ref={fileDocRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={onArchivo} />
                  </div>
                  <input
                    value={texto}
                    onChange={e => onCambiarTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                    placeholder={`Responder a ${seleccionada.nombre_completo?.split(' ')[0] || 'usuario'}…`}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-[12.5px] outline-none focus:border-[#1A5C38]/40"
                  />
                  <button onClick={() => enviar()} disabled={enviando || !texto.trim()}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1f7a49] to-[#123f27] flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 active:scale-95 transition-transform">
                    <SendIcon size={17} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
