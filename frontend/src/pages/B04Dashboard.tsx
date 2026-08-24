import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Package, Tag, Eye, PenLine, ChevronRight, Warehouse, Activity, BadgeCheck, Factory, Sun, Sunset, Moon } from 'lucide-react';
import { KPICard } from '../components/KPICard';
import BannerCanvas from '../components/BannerCanvas';
import { useAuthStore } from '../store/auth';
import { api } from '../services/api';
import { formatNum } from '../utils/format';

interface Stats {
  mis_bodegas: number;
  total_stock: number;
  total_capacidad: number;
  ocupacion_pct: number;
  espacio_libre: number;
  ultimo_precio: number;
  precio_promedio_regional: number;
  bodegas_en_calculo: number;
  tiene_ventanilla: boolean;
  solicitudes_pendientes: number;
  productores_cercanos: number;
  toneladas_cercanas: number;
}

export default function B04Dashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Partial<Stats>>({});
  const [loading, setLoading] = useState(true);
  const [bodegasAprobadas, setBodegasAprobadas] = useState(0);
  const [bodegasPendientes, setBodegasPendientes] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    api.home.stats()
      .then((r: any) => setStats(r.stats || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Estado de asociación a bodegas (banner "en revisión" / "sin bodega")
  useEffect(() => {
    api.bodeguero.misBodegasEstatus()
      .then((data: any) => {
        const bodegas = Array.isArray(data) ? data : data.bodegas || [];
        setBodegasAprobadas(bodegas.filter((b: any) => b.estatus === 'aprobada').length);
        setBodegasPendientes(bodegas.filter((b: any) => b.estatus === 'pendiente').length);
      })
      .catch(() => {});
  }, []);

  // Mexico timezone clock (always Mexico, not device)
  const getMexicoTime = () => new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: 'numeric', minute: '2-digit', hour12: true });
  const getMexicoHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }));
  const [reloj, setReloj] = useState(getMexicoTime());
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    clockRef.current = setInterval(() => setReloj(getMexicoTime()), 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, []);

  const hora = getMexicoHour();
  const saludo = hora < 12 ? '¡Buenos días!' : hora < 19 ? '¡Buenas tardes!' : '¡Buenas noches!';
  const SaludoIcon = hora < 12 ? Sun : hora < 19 ? Sunset : Moon;
  const hoy = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long' });

  const ocupPct = stats.ocupacion_pct ?? 0;
  const barColor = ocupPct < 70 ? 'bg-[#1A5C38]' : ocupPct < 90 ? 'bg-amber-400' : 'bg-red-500';
  const kpiColor = ocupPct < 70 ? 'green' : ocupPct < 90 ? 'yellow' : 'red';

  const acciones = [
    { icon: Tag,        label: 'Publicar precio del día',   path: '/precio-diario',       desc: 'Precio que ofreces hoy',        iconColor: 'text-[#1A5C38]',  bg: 'bg-[#1A5C38]/[0.08]' },
    { icon: Eye,        label: 'Ver oferta de productores', path: '/oferta',               desc: 'Disponibilidad por municipio',  iconColor: 'text-blue-600',   bg: 'bg-blue-50' },
    { icon: PenLine,    label: 'Registrar transacción',     path: '/transacciones/nueva',  desc: 'Compra o venta de maíz',        iconColor: 'text-orange-500', bg: 'bg-orange-50' },
    { icon: Activity,   label: 'Actualizar inventario',     path: '/inventario',           desc: 'Volumen almacenado hoy',        iconColor: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="w-full">
      {/* ── Banner full-bleed ── */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-[2rem] shadow-[0_8px_30px_rgba(26,92,56,0.25)] relative overflow-hidden group/banner">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none transition-opacity duration-700 opacity-50 group-hover/banner:opacity-100" />
        <BannerCanvas />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4 pb-5 relative z-10">
          <p className="text-[11px] font-bold text-emerald-300/80 uppercase tracking-widest mb-2 transition-colors duration-500 group-hover/banner:text-emerald-200">Tablero Principal</p>
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0 ring-2 ring-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110 hover:rotate-6 hover:bg-white/30 cursor-default">
              <span className="text-white text-[16px] font-black">
                {(user?.nombre_completo || 'B').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/banner:translate-x-1">
              <h1 className="text-[20px] sm:text-[24px] font-black text-white leading-tight tracking-tight drop-shadow-sm flex items-center gap-2">
                {saludo} <SaludoIcon size={20} className="opacity-80" />
              </h1>
              <p className="text-[13px] sm:text-[14px] font-medium text-white/80 mt-0.5 truncate">{user?.nombre_completo || ''}</p>
            </div>
          </div>
          {/* Role badge + date + Mexico clock row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm border border-white/10 rounded-full px-2.5 py-1 shadow-sm transition-transform duration-300 hover:scale-105">
              {user?.rol === 'industria'
                ? <Factory size={12} className="text-emerald-200" />
                : <Warehouse size={12} className="text-emerald-200" />}
              <span className="text-[11px] sm:text-[12px] font-bold text-white capitalize tracking-wide">{user?.rol || 'bodega'}</span>
              <BadgeCheck size={13} className="text-emerald-300" />
            </div>
            <p className="text-emerald-50/80 text-[11px] sm:text-[12px] tracking-wide capitalize">{hoy}</p>
            {/* Reloj tiempo real México */}
            <div className="ml-auto bg-emerald-500/20 border border-emerald-400/30 backdrop-blur-sm rounded-full px-3 py-1 flex items-center gap-1.5 shadow-[inset_0_0_12px_rgba(52,211,153,0.1)] transition-transform duration-300 hover:scale-105">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="text-[11px] sm:text-[12px] font-bold text-white tracking-widest">{reloj}</span>
              <span className="text-[9px] text-emerald-200/80 font-semibold tracking-wider">MX</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Banner "Cuenta en revisión" — tiene asociación pendiente, ninguna aprobada */}
            {bodegasAprobadas === 0 && bodegasPendientes > 0 && (
              <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⏳</span>
                  <div className="flex-1">
                    <p className="font-semibold text-amber-800">Tu solicitud está en revisión</p>
                    <p className="text-amber-700 text-[13px] mt-1 leading-relaxed">
                      El administrador está verificando tu asociación a la bodega.
                      Recibirás una notificación cuando sea aprobada.
                      Mientras tanto puedes explorar la plataforma.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* C-11: Onboarding cuando no tiene bodegas (ni aprobadas ni pendientes) */}
            {(stats.mis_bodegas ?? 0) === 0 && bodegasPendientes === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <p className="font-semibold text-amber-800 mb-1">
                  ¡Bienvenido a SIMAC!
                </p>
                <p className="text-[13px] text-amber-700 mb-3 leading-relaxed">
                  Para comenzar necesitas asociar las bodegas que operas.
                  Sin bodegas no podrás registrar inventarios, precios
                  ni requerimientos de maíz.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate('/bodegas/seleccionar')}
                    className="bg-amber-600 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl active:opacity-80 transition-opacity"
                  >
                    Asociar mis bodegas →
                  </button>
                  <button
                    onClick={() => navigate('/onboarding')}
                    className="bg-white text-amber-700 border border-amber-300 text-[14px] font-semibold px-5 py-2.5 rounded-xl active:opacity-80 transition-opacity"
                  >
                    Ver primeros pasos
                  </button>
                </div>
              </div>
            )}

            {/* KPIs: 2 cols mobile → 4 cols desktop */}
            {/* Se retiró la tarjeta "Precio promedio de maíz al productor hoy": mostraba
                el precio propio comparado contra el promedio regional entre bodegas, lo
                cual facilita que las bodegas alineen o anticipen precios entre sí — señalado
                explícitamente por COFECE. Ver plan de rediseño (Fase 0, punto 1). */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {stats.tiene_ventanilla ? (
                <KPICard
                  title="Solicitudes a ventanillas"
                  value={stats.solicitudes_pendientes ?? 0}
                  subtitle="Pendientes de atención"
                  icon={<FileText size={18} />}
                  color="blue"
                  onClick={() => navigate('/ventanillas')}
                />
              ) : (
                <KPICard
                  title="Mis bodegas"
                  value={stats.mis_bodegas ?? 0}
                  subtitle="Bodegas asociadas"
                  icon={<Warehouse size={18} />}
                  color="blue"
                  onClick={() => navigate('/mis-bodegas')}
                />
              )}

              <KPICard
                title="Productores de maíz cercanos"
                value={stats.productores_cercanos ?? 0}
                subtitle={`A tus bodegas · ~${formatNum(stats.toneladas_cercanas ?? 0)} ton disponibles`}
                icon={<Package size={18} />}
                color="green"
                onClick={() => navigate('/oferta')}
              />
              <KPICard
                title="Ocupación del almacén"
                value={`${ocupPct}%`}
                subtitle={
                  <div className="space-y-1.5 mt-1">
                    <div className="bg-[#eef8f2] rounded-full h-2 w-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(ocupPct, 100)}%` }} />
                    </div>
                    <span className="block text-[11px]">{formatNum(stats.total_stock ?? 0)} ton de {formatNum(stats.total_capacidad ?? 0)} ton · {formatNum(stats.espacio_libre ?? Math.max(0, (stats.total_capacidad ?? 0) - (stats.total_stock ?? 0)))} ton libres</span>
                  </div>
                }
                icon={<Activity size={18} />}
                color={kpiColor}
                onClick={() => navigate('/inventario')}
              />
            </div>

            {/* Acciones rápidas: 4 cols desktop */}
            <div>
              <p className="text-[11px] font-bold text-gray-400/90 uppercase tracking-widest mb-4">Acciones rápidas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {acciones.map(({ icon: Icon, label, path, desc, iconColor, bg }) => (
                  <button
                    key={path}
                    onClick={() => navigate(path)}
                    className="w-full flex items-center gap-4 px-4 py-4 bg-white/90 backdrop-blur-xl rounded-[1.25rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:border-black/[0.08] hover:-translate-y-1 active:scale-[0.98] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] text-left group"
                  >
                    <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:rotate-12 ${bg}`}>
                      <Icon size={20} className={iconColor} />
                    </span>
                    <div className="flex-1 min-w-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5">
                      <p className="text-[14px] sm:text-[15px] font-bold text-gray-900 tracking-tight">{label}</p>
                      <p className="text-[11px] sm:text-[12px] text-gray-400/90 truncate mt-0.5">{desc}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 flex-shrink-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1 group-hover:text-emerald-500" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
