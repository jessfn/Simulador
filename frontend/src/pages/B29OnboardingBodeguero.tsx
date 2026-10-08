import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, ChevronLeft, Tag, Activity, Signal, Warehouse, PartyPopper } from 'lucide-react';
import { api } from '../services/api';

interface Paso {
  key: string;
  titulo: string;
  desc: string;
  icon: React.ReactNode;
  ruta: string;
  hecho: boolean;
}

export default function B29OnboardingBodeguero() {
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(true);
  const [tieneBodega, setTieneBodega] = useState(false);
  const [tienePrecio, setTienePrecio] = useState(false);
  const [tieneSemaforo, setTieneSemaforo] = useState(false);
  const [tieneRequerimiento, setTieneRequerimiento] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      api.bodeguero.misBodegasEstatus(),
      api.bodeguero.misBodegas(),
      api.home.stats(),
      api.senales.list(),
    ]).then(([estatusR, bodegasR, statsR, senalesR]) => {
      // 1. Bodega asociada (aprobada)
      if (estatusR.status === 'fulfilled') {
        const arr = Array.isArray(estatusR.value) ? estatusR.value : (estatusR.value as any).bodegas || [];
        setTieneBodega(arr.some((b: any) => b.estatus === 'aprobada'));
      }
      // 3. Semáforo activo en alguna bodega
      if (bodegasR.status === 'fulfilled') {
        const arr = Array.isArray(bodegasR.value) ? bodegasR.value : [];
        setTieneSemaforo(arr.some((b: any) => b.semaforo_compra && b.semaforo_compra !== 'sin_actividad'));
      }
      // 2. Primer precio publicado
      if (statsR.status === 'fulfilled') {
        const s = (statsR.value as any).stats || {};
        setTienePrecio((s.ultimo_precio ?? 0) > 0);
      }
      // 4. Primer requerimiento (señal de compra)
      if (senalesR.status === 'fulfilled') {
        const arr = Array.isArray(senalesR.value) ? senalesR.value : [];
        setTieneRequerimiento(arr.length > 0);
      }
    }).finally(() => setCargando(false));
  }, []);

  const pasos: Paso[] = [
    {
      key: 'bodega', titulo: 'Confirma tu bodega asociada',
      desc: 'Asocia la bodega que operas para activar todas las funciones.',
      icon: <Warehouse size={18} />, ruta: '/maiz/bodega/seleccionar', hecho: tieneBodega,
    },
    {
      key: 'precio', titulo: 'Publica tu primer precio diario',
      desc: 'Indica el precio de compra que ofreces hoy a los productores.',
      icon: <Tag size={18} />, ruta: '/maiz/bodega/precio-diario', hecho: tienePrecio,
    },
    {
      key: 'semaforo', titulo: 'Activa tu semáforo de compra',
      desc: 'Indica si estás comprando, con capacidad limitada o sin actividad.',
      icon: <Activity size={18} />, ruta: '/maiz/bodega/mis-bodegas', hecho: tieneSemaforo,
    },
    {
      key: 'requerimiento', titulo: 'Publica tu primer requerimiento',
      desc: 'Lanza una señal de compra para que los productores cercanos te encuentren.',
      icon: <Signal size={18} />, ruta: '/maiz/bodega/requerimientos', hecho: tieneRequerimiento,
    },
  ];

  const completados = pasos.filter(p => p.hecho).length;
  const total = pasos.length;
  const pct = Math.round((completados / total) * 100);

  return (
    <div className="w-full">
      {/* Banner */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] relative overflow-hidden group/banner">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none transition-opacity duration-700 opacity-50 group-hover/banner:opacity-100" />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4 pb-6 relative z-10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/banner:translate-x-1">
          <button onClick={() => navigate('/maiz/bodega/dashboard')}
            className="flex items-center gap-1 text-green-200/80 text-[13px] font-bold mb-2 hover:text-white transition-colors">
            <ChevronLeft size={16} className="-ml-1" /> Ir al tablero
          </button>
          <p className="text-[11px] font-bold text-green-300/70 uppercase tracking-widest mb-1">Primeros pasos</p>
          <h1 className="text-[22px] sm:text-[26px] font-black text-white leading-tight drop-shadow-sm">Configura tu cuenta</h1>
          <p className="text-green-100/80 text-[14px] mt-1 font-medium">
            {completados} de {total} pasos completados
          </p>
          {/* Barra de progreso */}
          <div className="mt-4 bg-white/10 rounded-full h-2.5 w-full max-w-md overflow-hidden shadow-inner">
            <div className="h-full bg-emerald-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
        {cargando ? (
          [1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-[#eef8f2] rounded-2xl animate-pulse" />)
        ) : (
          <>
            {pasos.map((p, i) => (
              <button
                key={p.key}
                onClick={() => navigate(p.ruta)}
                className={`w-full flex items-center gap-5 p-5 bg-white rounded-[1.5rem] border shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-left active:scale-[0.98] transition-all duration-500 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 group/card ${
                  p.hecho ? 'border-green-200/50 bg-green-50/10' : 'border-black/[0.04]'
                }`}
              >
                <span className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center flex-shrink-0 transition-transform duration-500 group-hover/card:scale-110 ${p.hecho ? 'text-green-500 bg-green-50' : 'text-gray-400 bg-[#f4fbf7]'}`}>
                  {p.hecho ? <CheckCircle2 size={24} className="drop-shadow-sm" /> : <Circle size={24} />}
                </span>
                <div className="flex-1 min-w-0 transition-transform duration-500 group-hover/card:translate-x-1">
                  <div className="flex items-center gap-2.5">
                    <span className={`p-1.5 rounded-lg ${p.hecho ? 'bg-green-100 text-green-600' : 'bg-[#1A5C38]/10 text-[#1A5C38]'}`}>{p.icon}</span>
                    <p className={`text-[16px] font-bold ${p.hecho ? 'text-gray-400 line-through' : 'text-gray-900 group-hover/card:text-[#1A5C38]'} transition-colors`}>
                      {i + 1}. {p.titulo}
                    </p>
                  </div>
                  <p className="text-[13px] text-gray-500 font-medium mt-1 ml-10 leading-snug">{p.desc}</p>
                </div>
                <ChevronRight size={18} className={`flex-shrink-0 transition-transform duration-300 group-hover/card:translate-x-1 ${p.hecho ? 'text-green-300' : 'text-gray-300 group-hover/card:text-[#1A5C38]'}`} />
              </button>
            ))}

            {completados === total && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/60 rounded-[1.5rem] p-8 text-center mt-6 shadow-[0_4px_24px_rgba(52,211,153,0.1)]">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <PartyPopper size={32} className="text-emerald-500" />
                </div>
                <p className="text-[20px] font-black text-green-900 tracking-tight">¡Configuración completa!</p>
                <p className="text-green-700 font-medium text-[14px] mt-1.5">Ya estás listo para operar en Maíz con todas las funciones.</p>
                <button
                  onClick={() => navigate('/maiz/bodega/dashboard')}
                  className="mt-6 px-8 py-3.5 bg-[#1A5C38] text-white rounded-[1.25rem] text-[15px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] inline-flex items-center gap-2"
                >
                  Ir al tablero <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
