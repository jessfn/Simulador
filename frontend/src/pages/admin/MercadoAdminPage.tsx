import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, TrendingUp, Users, Warehouse, BarChart3, ArrowUpDown, Star } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

function fmtNum(v: number, dec = 0) {
  return Number(v).toLocaleString('es-MX', { maximumFractionDigits: dec });
}
function fmtMXN(v: number) {
  return `$${fmtNum(v, 0)}`;
}

const calcularDistanciaKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

interface Disponibilidad {
  id: number; lat: number; lng: number;
  municipio: string; estado: string;
  tipo_maiz: string; variedad_code: string;
  volumen_estimado_ton: number; nombre_productor: string;
}
interface Requerimiento {
  id: number; lat: number; lon: number;
  municipio: string; estado: string; nombre_bodega: string;
  tipo_maiz: string; volumen_ton: number; precio_ofrecido: number; radio_km: number;
}
interface Kpis {
  ofertadas_ton: number; demandadas_ton: number; balance_ton: number;
  precio_promedio_ofrecido: number; productores_con_disponibilidad: number; bodegas_buscando_maiz: number;
}
interface MercadoData {
  disponibilidades: Disponibilidad[];
  requerimientos: Requerimiento[];
  kpis: Kpis;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export default function MercadoAdminPage() {
  const [data, setData] = useState<MercadoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  async function cargar() {
    setLoading(true);
    setErrorCarga('');
    try {
      const r = await fetch(`${BASE}/admin/mercado/mapa`, { headers: HDR() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setData(null);
        setErrorCarga(d.error || 'No se pudo cargar la información de mercado.');
        return;
      }
      setData(d);
    } catch (e) {
      console.error(e);
      setErrorCarga('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const kpis = data?.kpis;

  /* ── Coincidencias geográficas ── */
  const coincidencias = useMemo(() => {
    if (!data) return [];
    const pairs: { disp: Disponibilidad; req: Requerimiento; distKm: number }[] = [];
    for (const r of data.requerimientos) {
      for (const d of data.disponibilidades) {
        const dist = calcularDistanciaKm(r.lat, r.lon, d.lat, d.lng);
        if (dist <= r.radio_km) {
          pairs.push({ disp: d, req: r, distKm: Math.round(dist * 10) / 10 });
        }
      }
    }
    return pairs;
  }, [data]);

  const dispIdsConCoincidencia = useMemo(() => new Set(coincidencias.map(c => c.disp.id)), [coincidencias]);
  const reqIdsConCoincidencia  = useMemo(() => new Set(coincidencias.map(c => c.req.id)), [coincidencias]);
  const CARD = 'bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-2';

  return (
    <div className="flex flex-col gap-3">
      {errorCarga && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{errorCarga}</div>
      )}

      {/* ── Barra de acción ── */}
      <div className="bg-[#eef8f2] flex-shrink-0 rounded-b-2xl border border-[#1A5C38]/30 border-t-0 px-3 py-1.5 flex justify-end">
        <button onClick={cargar} disabled={loading}
          className="flex items-center gap-1.5 text-[11px] font-bold text-[#1A5C38] bg-[#d4efe1] hover:bg-[#1A5C38] hover:text-white border border-[#1A5C38]/20 hover:border-transparent px-2.5 py-1.5 rounded-lg active:scale-95 transition-all duration-150 disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Recargar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Ofertado', value: `${fmtNum(kpis?.ofertadas_ton ?? 0)} t`, sub: 'ton disponibles', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', icon: <TrendingUp size={14} /> },
          { label: 'Demandado', value: `${fmtNum(kpis?.demandadas_ton ?? 0)} t`, sub: 'ton requeridas', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-100', icon: <BarChart3 size={14} /> },
          { label: 'Balance', value: `${(kpis?.balance_ton ?? 0) >= 0 ? '+' : ''}${fmtNum(kpis?.balance_ton ?? 0)} t`, sub: 'oferta - demanda', color: (kpis?.balance_ton ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700', bg: (kpis?.balance_ton ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100', icon: <ArrowUpDown size={14} /> },
          { label: 'Precio promedio', value: fmtMXN(kpis?.precio_promedio_ofrecido ?? 0), sub: 'MXN/ton ofrecido', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', icon: <TrendingUp size={14} /> },
          { label: 'Productores', value: fmtNum(kpis?.productores_con_disponibilidad ?? 0), sub: 'con disponibilidad', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-100', icon: <Users size={14} /> },
          { label: 'Bodegas', value: fmtNum(kpis?.bodegas_buscando_maiz ?? 0), sub: 'buscando maíz', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-100', icon: <Warehouse size={14} /> },
        ].map((kpi, i) => (
          <div key={i} className={CARD}>
            <div className="flex items-start justify-between">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">{kpi.label}</p>
              <div className={`w-7 h-7 rounded-lg ${kpi.bg} border flex items-center justify-center ${kpi.color} flex-shrink-0`}>{kpi.icon}</div>
            </div>
            <p className={`text-[18px] sm:text-[22px] font-black leading-none tracking-tight ${loading ? 'text-gray-400' : kpi.color}`}>
              {loading ? '—' : kpi.value}
            </p>
            <p className="text-[10px] text-gray-500">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Mapa + Listas lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Mapa Leaflet */}
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl overflow-hidden" style={{ minHeight: 380 }}>
          {coincidencias.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span className="text-[11px] font-bold text-amber-700">
                {coincidencias.length} coincidencia{coincidencias.length !== 1 ? 's' : ''} geográfica{coincidencias.length !== 1 ? 's' : ''} detectada{coincidencias.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200/60">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span className="text-[11px] font-bold text-gray-900">Disponibilidad (productores)</span>
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block ml-3" />
            <span className="text-[11px] font-bold text-gray-900">Requerimiento (bodegas)</span>
            {coincidencias.length > 0 && (
              <>
                <span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-amber-500 inline-block ml-3" />
                <span className="text-[11px] font-bold text-amber-600">Con coincidencia</span>
              </>
            )}
          </div>
          <MapContainer
            center={[23.6345, -102.5528]} zoom={5}
            style={{ height: 340, width: '100%' }}
            zoomControl
          >
            <TileLayer url={ESRI} attribution="ESRI" maxZoom={18} />
            {(data?.disponibilidades ?? []).map((d) => {
              const match = dispIdsConCoincidencia.has(d.id);
              return (
                <CircleMarker key={`d-${d.id}`} center={[d.lat, d.lng]}
                  radius={match ? 10 : 7}
                  color={match ? '#f59e0b' : '#1A5C38'}
                  fillColor="#22c55e" fillOpacity={0.7}
                  weight={match ? 3 : 1.5}
                >
                  <Popup>
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                      <strong>{d.nombre_productor}</strong><br />
                      {d.municipio}, {d.estado}<br />
                      {d.tipo_maiz} · {fmtNum(d.volumen_estimado_ton, 0)} ton
                      {match && <><br /><span style={{ color: '#d97706', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={11} /> Coincidencia geográfica</span></>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
            {(data?.requerimientos ?? []).map((r) => {
              const match = reqIdsConCoincidencia.has(r.id);
              return (
                <CircleMarker key={`r-${r.id}`} center={[r.lat, r.lon]}
                  radius={match ? 10 : 7}
                  color={match ? '#f59e0b' : '#1e40af'}
                  fillColor="#3b82f6" fillOpacity={0.7}
                  weight={match ? 3 : 1.5}
                >
                  <Popup>
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                      <strong>{r.nombre_bodega}</strong><br />
                      {r.municipio}, {r.estado}<br />
                      {r.tipo_maiz} · {fmtNum(r.volumen_ton, 0)} ton<br />
                      Precio: {fmtMXN(r.precio_ofrecido)}/ton · Radio: {r.radio_km} km
                      {match && <><br /><span style={{ color: '#d97706', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={11} /> Coincidencia geográfica</span></>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        {/* Listas */}
        <div className="space-y-3">
          {/* Top disponibilidades */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-200/60">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Disponibilidades recientes</p>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="px-3 py-2.5 h-12 animate-pulse bg-gray-50" />)
              ) : (data?.disponibilidades ?? []).slice(0, 5).map((d, i) => (
                <div key={i} className="px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <Users size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 line-clamp-1">{d.nombre_productor}</p>
                    <p className="text-[10px] text-gray-400">{d.municipio}, {d.estado} · <span className="text-emerald-600 font-semibold">{fmtNum(d.volumen_estimado_ton, 0)} t</span></p>
                  </div>
                </div>
              ))}
              {!loading && (data?.disponibilidades ?? []).length === 0 && (
                <p className="px-3 py-4 text-[11px] text-gray-500 text-center">Sin disponibilidades activas</p>
              )}
            </div>
          </div>

          {/* Top requerimientos */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-200/60">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Requerimientos recientes</p>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="px-3 py-2.5 h-12 animate-pulse bg-gray-50" />)
              ) : (data?.requerimientos ?? []).slice(0, 5).map((r, i) => (
                <div key={i} className="px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Warehouse size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 line-clamp-1">{r.nombre_bodega}</p>
                    <p className="text-[10px] text-gray-400">{r.municipio}, {r.estado} · <span className="text-blue-600 font-semibold">{fmtNum(r.volumen_ton, 0)} t</span></p>
                  </div>
                </div>
              ))}
              {!loading && (data?.requerimientos ?? []).length === 0 && (
                <p className="px-3 py-4 text-[11px] text-gray-500 text-center">Sin requerimientos activos</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


