import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronRight, Wheat, AlertTriangle, ArrowUpRight, ArrowDownRight, BadgeCheck, CalendarCheck, Handshake } from 'lucide-react';
import { formatNum } from '../../utils/format';
import { useAuthStore } from '../../store/auth';
import HistorialVentasSection from './HistorialVentasSection';
import BannerCanvas from '../../components/BannerCanvas';
import MisDisponibilidadesSection from './MisDisponibilidadesSection';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface DashData {
  municipio: string;
  estado: string;
  location_confirmed: boolean;
  centroid_source: string;
  lat: number | null;
  lng: number | null;
  precio_hoy: number | null;
  precio_ayer: number | null;
  alerta_activa: { mensaje: string; tipo: string } | null;
  bodegas_cercanas: {
    id: number; nombre: string; municipio: string;
    precio_compra_hoy: number; is_ventanilla: boolean;
    estado_compra: string; distancia_km: number;
  }[];
  nombres: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  estado_validacion: string;
}

const SEMAFORO: Record<string, { cls: string; texto: string }> = {
  comprando:     { cls: 'bg-emerald-500', texto: 'Comprando' },
  limitado:      { cls: 'bg-amber-400', texto: 'Capacidad limitada' },
  no_compra:     { cls: 'bg-red-500', texto: 'No compra' },
  sin_actividad: { cls: 'bg-gray-400', texto: 'Sin actividad' },
};

function SkeletonDashboard() {
  return (
    <div className="min-h-screen bg-white animate-pulse">
      <div className="bg-[#1A5C38] h-28" />
      <div className="max-w-2xl mx-auto px-4">
        <div className="-mt-4 bg-white rounded-2xl h-32" />
        <div className="mt-5 space-y-3">
          <div className="bg-white rounded-2xl h-20" />
          <div className="bg-white rounded-2xl h-20" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardProductorPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ciclo, setCiclo] = useState<object | null | undefined>(undefined);
  const navigate = useNavigate();
  const isPendiente = data?.estado_validacion === 'pendiente';
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('dismiss_ubicacion') === '1');
  const [dismissedCiclo, setDismissedCiclo] = useState(() => localStorage.getItem('dismiss_ciclo') === '1');

  // Mexico timezone clock
  const getMexicoTime = () => new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true });
  const getMexicoHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }));
  const [reloj, setReloj] = useState(getMexicoTime());
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [alertaActiva, setAlertaActiva] = useState<{ mensaje: string; tipo: string } | null>(null);
  const token = localStorage.getItem('simac_token') || '';

  const cargarDashboard = () => {
    fetch(`${BASE}/productor/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(setData).finally(() => setLoading(false));
  };

  useEffect(() => {
    clockRef.current = setInterval(() => setReloj(getMexicoTime()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  useEffect(() => {
    cargarDashboard();

    fetch(`${BASE}/productor/mi-ciclo`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => {
      setCiclo(d);
      if (!d) localStorage.setItem('ciclo_pendiente', '1');
      else localStorage.removeItem('ciclo_pendiente');
    }).catch(() => setCiclo(null));

    fetch(`${BASE}/alertas/notificaciones/mis`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => {
        const alerta = d.notificaciones?.find(
          (n: any) => !n.leida && ['alerta_climatica', 'alerta_sanitaria'].includes(n.tipo)
        );
        setAlertaActiva(alerta || null);
      })
      .catch(() => {});
  }, []);

  if (loading || ciclo === undefined) return <SkeletonDashboard />;

  // Ciclo obligatorio: sin ciclo productivo registrado no se puede usar el tablero.
  if (ciclo === null && !isPendiente) {
    return (
      <div className="absolute inset-0 flex flex-col bg-[#eef8f2] overflow-hidden">
        {/* Fondo decorativo */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-b from-[#1A5C38]/10 to-transparent"></div>
          <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[300px] h-[300px] bg-emerald-500/10 blur-[100px] rounded-full"></div>
        </div>

        {/* Contenido centrado */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-[340px] animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-700 ease-out">
            <div className="bg-white/95 backdrop-blur-2xl rounded-[32px] p-8 shadow-[0_20px_60px_-15px_rgba(26,92,56,0.15)] border border-white relative overflow-hidden text-center group">
              <div className="absolute inset-0 bg-gradient-to-br from-[#1A5C38]/[0.02] to-transparent pointer-events-none"></div>
              
              <div className="w-16 h-16 bg-gradient-to-br from-[#1A5C38] to-[#124227] rounded-[20px] flex items-center justify-center mx-auto mb-6 shadow-[0_8px_25px_-5px_rgba(26,92,56,0.4)] transform group-hover:scale-105 transition-transform duration-500">
                <Wheat size={32} className="text-white" strokeWidth={2} />
              </div>
              
              <h2 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight mb-2.5">
                Registra tu siembra
              </h2>
              
              <p className="text-[14px] text-slate-500 font-medium mb-8 leading-relaxed">
                Para usar SIMAC necesitas registrar la información de tu ciclo productivo. Es muy rápido.
              </p>
              
              <button onClick={() => navigate('/productor/ciclo')}
                className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-full font-bold text-[15px] shadow-[0_6px_15px_rgba(26,92,56,0.2)] active:scale-[0.98] transition-all duration-200">
                Registrar ciclo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const delta = (data?.precio_hoy ?? 0) - (data?.precio_ayer ?? 0);
  const hora = getMexicoHour();
  const saludo = hora < 12 ? '¡Buenos días!' : hora < 19 ? '¡Buenas tardes!' : '¡Buenas noches!';
  const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long' });
  const nombreCompleto = [data?.nombres, data?.apellido_paterno, data?.apellido_materno].filter(Boolean).join(' ')
    || user?.nombres || user?.nombre_completo || 'Productor';
  const initials = nombreCompleto.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();

  // Detectar si el productor no tiene ubicación confirmada
  const sinUbicacion = !data?.lat || !data?.location_confirmed;

  return (
    <div className="bg-[#eef8f2]">
      {alertaActiva && (
        <div className={`px-4 sm:px-6 py-3 flex items-center justify-between
          ${alertaActiva.tipo === 'alerta_climatica' ? 'bg-orange-500' : 'bg-red-600'}`}>
          <p className="text-white text-sm font-medium flex-1 leading-tight flex items-center gap-1.5">
            <AlertTriangle size={14} className="shrink-0" /> {alertaActiva.mensaje}
          </p>
          <button onClick={() => navigate('/productor/alertas')}
            className="ml-3 text-white text-xs border border-white/60 rounded-lg px-3 py-1.5 shrink-0 font-medium hover:bg-white/10 transition-colors">
            Ver detalle
          </button>
        </div>
      )}

      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)] relative overflow-hidden">
        <BannerCanvas />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-5 relative z-10">
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-2">Inicio</p>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 ring-2 ring-white/20">
              <span className="text-white text-[15px] font-black">{initials}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">
                {saludo}
              </h1>
              <p className="text-[13px] font-medium text-white/40 mt-0.5">{nombreCompleto}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1">
              <Wheat size={11} className="text-green-200" />
              <span className="text-[11px] font-bold text-white">Productor</span>
              <BadgeCheck size={11} className="text-green-300" />
            </div>
            <p className="text-green-200/60 text-[11px] capitalize">{hoy}</p>
            <div className="ml-auto bg-[#22c55e]/20 border border-[#22c55e]/30 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-[11px] font-bold text-white tracking-wide">{reloj}</span>
              <span className="text-[9px] text-green-200/70 font-medium">MX</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
        {sinUbicacion && (
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-xl p-4 mb-6 flex items-start gap-4">
            <MapPin size={22} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800">
                Tu parcela no tiene ubicación confirmada
              </p>
              <p className="text-amber-700 text-sm mt-1">
                Sin ubicación no podemos mostrarte las bodegas más cercanas
                ni calcular distancias reales. Actualiza tu UP para acceder
                a toda la información del mercado.
              </p>
              <button
                onClick={() => navigate('/productor/ubicacion')}
                className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Actualizar mi parcela →
              </button>
            </div>
          </div>
        )}

        <div className="relative overflow-hidden bg-white/95 backdrop-blur-2xl rounded-[1.5rem] p-6 sm:p-8 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.06)] border border-black/[0.04] group transition-all duration-500">
          {/* Subtle corner gradient */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-50/50 to-transparent opacity-50 rounded-bl-[4rem] pointer-events-none transition-opacity duration-500 group-hover:opacity-100" />
          
          <div className="relative z-10">
            <p className="text-[13px] font-bold text-gray-500 tracking-wide leading-snug transition-colors duration-300 group-hover:text-gray-800">
              PRECIO DE COMPRA HOY EN TU REGIÓN
            </p>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[40px] sm:text-[48px] font-black text-gray-900 leading-none tracking-tight">
                  ${data?.precio_hoy ? formatNum(data.precio_hoy, 0) : '--'}
                </span>
                <span className="text-[16px] sm:text-[18px] font-bold text-gray-400">/ton</span>
              </div>
              
              {delta !== 0 && (
                <div className={`flex items-center gap-1 sm:pb-2 font-bold text-[14px] ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full ${delta > 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    {delta > 0 ? <ArrowUpRight size={14} strokeWidth={3} /> : <ArrowDownRight size={14} strokeWidth={3} />}
                  </span>
                  ${formatNum(Math.abs(delta), 0)}
                </div>
              )}
            </div>
            
            <p className="text-[13px] text-gray-500 font-medium leading-relaxed mt-3 opacity-90 group-hover:opacity-100 transition-opacity">
              Promedio regional de bodegas activas
            </p>
            
            <button 
              onClick={() => navigate('/productor/precios')}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 bg-[#1A5C38]/10 text-[#1A5C38] text-[13px] font-bold rounded-xl active:scale-95 transition-all duration-300 hover:bg-[#1A5C38] hover:text-white group/btn"
            >
              Ver desglose de precios 
              <ChevronRight size={14} className="transition-transform duration-300 group-hover/btn:translate-x-1" />
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-bold text-zinc-700 mb-3">Bodegas comprando hoy</p>
          <div className="space-y-2">
            {(data?.bodegas_cercanas ?? []).map(b => {
              const sem = SEMAFORO[b.estado_compra] || SEMAFORO.sin_actividad;
              return (
                <button key={b.id}
                  onClick={() => navigate(`/productor/mapa/bodega/${b.id}`)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm ring-1 ring-zinc-100
                             flex items-center justify-between active:scale-[0.98] transition-all duration-200 text-left hover:ring-zinc-200">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full shrink-0 ${sem.cls}`} />
                    <div>
                      <p className="font-semibold text-zinc-800 text-sm leading-tight">{b.nombre}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {b.municipio} - {Number(b.distancia_km).toFixed(0)} km
                        {b.is_ventanilla && (
                          <span className="ml-2 bg-emerald-50 text-[#1A5C38] text-xs px-2 py-0.5 rounded-full font-medium">
                            Ventanilla
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="font-bold text-zinc-900 text-sm">
                      ${b.precio_compra_hoy ? formatNum(b.precio_compra_hoy, 0) : '--'}
                    </p>
                    <p className="text-xs text-zinc-400">/ton</p>
                  </div>
                </button>
              );
            })}
            {(data?.bodegas_cercanas?.length ?? 0) === 0 && (
              <p className="text-sm text-zinc-400 text-center py-4">No hay bodegas registradas en tu region aun</p>
            )}
          </div>
          <button onClick={() => navigate('/productor/mapa')}
            className="w-full mt-3 py-3 text-[#1A5C38] text-sm font-semibold
                       ring-2 ring-[#1A5C38] rounded-2xl hover:bg-emerald-50 active:scale-[0.98] transition-all duration-200">
            Ver mapa completo
          </button>
        </div>

        <div className="mt-5">
          <button
            onClick={() => !isPendiente && navigate('/productor/propuesta-venta')}
            disabled={isPendiente}
            className={`w-full py-5 rounded-2xl text-white text-lg font-semibold
              flex items-center justify-center gap-3 transition-all duration-200
              ${isPendiente ? 'bg-zinc-300 cursor-not-allowed'
                : 'bg-[#1A5C38] hover:bg-[#15482d] active:scale-[0.97] shadow-lg shadow-green-900/20'}`}
          >
            <Wheat size={24} />
            Propuesta de venta
          </button>
          <button
            onClick={() => navigate('/productor/mis-propuestas')}
            className="w-full mt-3 py-3.5 rounded-2xl text-[#1A5C38] text-sm font-semibold
              ring-2 ring-[#1A5C38] flex items-center justify-center gap-2 hover:bg-emerald-50 active:scale-[0.98] transition-all duration-200"
          >
            <Handshake size={18} />
            Mis propuestas y ofertas
          </button>
          {!isPendiente && (
            <button
              onClick={() => navigate('/productor/ups/nueva')}
              className="w-full border-2 border-dashed border-[#1A5C38] text-[#1A5C38] py-3 rounded-2xl text-sm font-medium
                hover:bg-green-50 flex items-center justify-center gap-2 mt-3"
            >
              <span className="text-lg">+</span>
              Agregar otra parcela
            </button>
          )}
          {isPendiente && (
            <p className="text-center text-xs text-zinc-400 mt-2">
              Tu cuenta esta en validacion. Te avisamos cuando puedas declarar disponibilidad.
            </p>
          )}

          {/* Disponibilidades activas */}
          <MisDisponibilidadesSection
            token={token}
            apiUrl={BASE}
            onActualizar={() => cargarDashboard()}
          />
        </div>

        {data && !data.location_confirmed && !dismissed && (
          <div className="mt-4 bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm font-semibold flex items-center gap-1.5">
              <MapPin size={14} /> Mejora tu experiencia
            </p>
            <p className="text-amber-700 text-xs mt-1">
              Marca tu parcela en el mapa para ver solo las bodegas mas cercanas a ti.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => navigate('/productor/ubicacion')}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">
                Marcar mi parcela
              </button>
              <button onClick={() => { localStorage.setItem('dismiss_ubicacion', '1'); setDismissed(true); }}
                className="px-4 text-amber-600 text-sm hover:underline">
                Ahora no
              </button>
            </div>
          </div>
        )}

        {ciclo === null && !dismissedCiclo && !isPendiente && (
          <div className="mt-4 bg-emerald-50 ring-2 ring-[#1A5C38]/20 rounded-2xl p-4">
            <p className="text-[#1A5C38] text-sm font-bold flex items-center gap-1.5">
              <CalendarCheck size={14} /> Declara tu ciclo productivo
            </p>
            <p className="text-emerald-700 text-xs mt-1">
              Registra tu ciclo {new Date().getFullYear()} para acceder a programas de apoyo y trazabilidad.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => navigate('/productor/ciclo')}
                className="flex-1 bg-[#1A5C38] hover:bg-[#15482d] text-white text-sm py-2.5 rounded-xl font-semibold transition-colors">
                Registrar ciclo
              </button>
              <button onClick={() => { localStorage.setItem('dismiss_ciclo', '1'); setDismissedCiclo(true); }}
                className="px-4 text-[#1A5C38] text-sm hover:underline">
                Despues
              </button>
            </div>
          </div>
        )}

        {/* Historial de ventas */}
        <HistorialVentasSection token={token} apiUrl={BASE} />
      </div>

    </div>
  );
}
