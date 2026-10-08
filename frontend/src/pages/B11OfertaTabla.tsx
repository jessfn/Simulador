import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { formatNum } from '../utils/format';
import { useToast } from '../components/Toast';
import { Users, Wheat, Signal, Heart, MapPin, Tag } from 'lucide-react';

// Clave única de un municipio según el filtro actual (para marcar "ya interesado")
const claveInteres = (municipio: string, tipo: string) => `${municipio.toLowerCase()}|${tipo || ''}`;

export default function B11OfertaTabla() {
  const [datos, setDatos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoMaiz, setTipoMaiz] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [intereses, setIntereses] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cargarIntereses = () => {
    api.oferta.misIntereses()
      .then((r: any) => setIntereses(new Set((r.data || []).map((i: any) => claveInteres(i.municipio, i.tipo_maiz || '')))))
      .catch(() => {});
  };

  async function cargar(silent = false) {
    if (!silent) setLoading(true);
    try {
      const r: any = await api.oferta.municipios(tipoMaiz ? { tipo_maiz: tipoMaiz } : {});
      // Handle both old format (array) and new format ({data, fallback, mensaje})
      if (Array.isArray(r)) {
        setDatos(r);
        setMensaje('');
      } else {
        setDatos(r.data || []);
        setMensaje(r.mensaje || '');
      }
    } catch { /* ignore */ } finally { if (!silent) setLoading(false); }
  }

  useEffect(() => {
    cargar();
    cargarIntereses();
    api.bodeguero.misBodegas().then((r: any) => setBodegas(Array.isArray(r) ? r : [])).catch(() => {});
  }, [tipoMaiz]);

  // F-05: Polling every 30s to refresh interest counts
  useEffect(() => {
    pollRef.current = setInterval(() => cargar(true), 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [tipoMaiz]);

  async function marcarInteres(municipio: string, estado?: string) {
    if (bodegas.length === 0) {
      toast('No tienes bodegas asociadas', 'error');
      return;
    }
    const clave = claveInteres(municipio, tipoMaiz || '');
    setEnviando(clave);
    try {
      await api.oferta.interesMunicipio(municipio, {
        bodega_id: bodegas[0].id,
        tipo_maiz: tipoMaiz || undefined,
        estado,
      });
      setIntereses(prev => new Set(prev).add(clave));
      toast(`Guardado en "Mis intereses". Productores en ${municipio} notificados.`, 'success');
    } catch (err: any) {
      toast(err.message || 'Error al enviar interés', 'error');
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div className="w-full">
      {/* Banner full-bleed */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] relative overflow-hidden group/banner">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none transition-opacity duration-700 opacity-50 group-hover/banner:opacity-100" />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4 pb-4 relative z-10">
          {/* Fila: título + botón Mis intereses */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[11px] font-bold text-green-300/80 uppercase tracking-widest mb-0.5">Módulo</p>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-white leading-tight drop-shadow-sm">Oferta de Productores</h1>
              <p className="text-green-100/80 text-[13px] mt-0.5 font-medium">Datos agregados por municipio</p>
            </div>
            <button
              onClick={() => navigate('/maiz/bodega/oferta/mis-intereses')}
              className="flex-shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl px-3 py-2 text-[12px] font-bold transition-all duration-300 active:scale-[0.98]"
            >
              <Heart size={13} className={intereses.size > 0 ? 'fill-white' : ''} />
              Mis intereses{intereses.size > 0 ? ` (${intereses.size})` : ''}
            </button>
          </div>

          {/* Filtro tipo de maíz — pills horizontales dentro del banner */}
          <div className="flex items-center gap-1.5 w-full overflow-x-auto scrollbar-none pb-0.5">
            {[['', 'Todos'], ['blanco', 'Maíz Blanco'], ['amarillo', 'Maíz Amarillo'], ['criollo', 'Criollo / Local']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTipoMaiz(val)}
                className={'flex-shrink-0 px-3.5 py-1.5 rounded-xl text-[12px] font-bold transition-all duration-200 ' +
                  (tipoMaiz === val
                    ? 'bg-white text-[#1A5C38] shadow-sm'
                    : 'bg-white/15 text-white/80 hover:bg-white/25 hover:text-white border border-white/10')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Fallback message */}
        {mensaje && (
          <div className="bg-amber-50 border border-amber-200 rounded-[1rem] px-5 py-3 mb-5">
            <p className="text-[14px] font-medium text-amber-800">{mensaje}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        ) : datos.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-gray-400">
            <Wheat size={48} className="text-gray-200" />
            <p className="text-[15px] font-medium">Sin datos de oferta disponibles</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {datos.map((d, i) => (
              <div key={i} className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 flex flex-col gap-4 h-full hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 hover:border-black/[0.08] transition-all duration-500 group/card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[16px] text-gray-900 leading-tight group-hover/card:text-[#1A5C38] transition-colors">{d.municipio}</p>
                    <p className="text-[12.5px] text-gray-500 font-medium truncate">{d.estado}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="bg-[#1A5C38]/[0.08] text-[#1A5C38] text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 capitalize">
                      {d.ventana_predominante === 'esta_semana' ? 'Esta semana' : d.ventana_predominante === '15_dias' ? '15 días' : d.ventana_predominante || 'Esta semana'}
                    </span>
                    {Number(d.distancia_km) > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                        <MapPin size={9} />{d.distancia_km} km
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-xl p-3 ${
                    Number(d.productores_disponibles) >= 10 ? 'bg-green-100' :
                    Number(d.productores_disponibles) >= 5 ? 'bg-yellow-50' : 'bg-[#eef8f2]'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users size={12} className="text-gray-400" />
                      <p className="text-[11px] text-gray-400">Productores</p>
                    </div>
                    <p className={`text-[22px] font-black ${
                      Number(d.productores_disponibles) >= 10 ? 'text-green-700' :
                      Number(d.productores_disponibles) >= 5 ? 'text-amber-700' : 'text-[#1A5C38]'
                    }`}>{d.productores_disponibles}</p>
                  </div>
                  <div className={`rounded-xl p-3 ${
                    Number(d.toneladas_estimadas) >= 500 ? 'bg-green-100' :
                    Number(d.toneladas_estimadas) >= 100 ? 'bg-yellow-50' : 'bg-[#eef8f2]'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wheat size={12} className="text-gray-400" />
                      <p className="text-[11px] text-gray-400">Toneladas</p>
                    </div>
                    <p className={`text-[22px] font-black ${
                      Number(d.toneladas_estimadas) >= 500 ? 'text-green-700' :
                      Number(d.toneladas_estimadas) >= 100 ? 'text-amber-700' : 'text-gray-800'
                    }`}>{formatNum(d.toneladas_estimadas)}</p>
                  </div>
                </div>
                {Number(d.precio_minimo_promedio) > 0 && (
                  <div className="flex items-center gap-1.5 -mt-1">
                    <Tag size={13} className="text-[#1A5C38]" />
                    <p className="text-[13px] font-bold text-[#1A5C38]">
                      desde ${Number(d.precio_minimo_promedio).toLocaleString('es-MX')}/ton
                    </p>
                  </div>
                )}
                {Array.isArray(d.variedades) && d.variedades.length > 0 && (
                  <div className="flex flex-wrap gap-1 -mt-1">
                    {d.variedades.map((v: string) => (
                      <span key={v} className="bg-green-100 text-green-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
                        {v}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2 mt-auto pt-1">
                  {(() => {
                    const clave = claveInteres(d.municipio, tipoMaiz || '');
                    const yaInteresa = intereses.has(clave);
                    const cargando = enviando === clave;
                    return (
                      <button
                        onClick={() => yaInteresa ? navigate('/maiz/bodega/oferta/mis-intereses') : marcarInteres(d.municipio, d.estado)}
                        disabled={cargando}
                        className={`w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] transition-all duration-300 disabled:opacity-50 ${
                          yaInteresa ? 'bg-[#1A5C38] hover:bg-[#154a2d] text-white shadow-md' : 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                        }`}
                      >
                        <Heart size={14} className={yaInteresa ? 'fill-white' : ''} />
                        {cargando ? '...' : yaInteresa ? 'Interesado' : 'Me interesa'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => navigate(`/maiz/bodega/requerimientos?municipio=${encodeURIComponent(d.municipio)}`)}
                    className="w-full flex items-center justify-center gap-2 bg-[#1A5C38]/[0.08] hover:bg-[#1A5C38]/[0.12] text-[#1A5C38] rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] transition-all duration-300"
                  >
                    <Signal size={14} /> Requerimiento
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
