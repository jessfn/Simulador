import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Phone, Warehouse, Package, Wrench } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface BodegaDetalle {
  id: number; nombre: string; estado: string; municipio: string;
  latitud: number; longitud: number; capacidad_ton: number;
  responsable: string; telefono: string;
  estado_compra?: string;
}

export default function DetalleBodegaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bodega, setBodega] = useState<BodegaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [tarifario, setTarifario] = useState<any[]>([]);
  const [stockActual, setStockActual] = useState<number | null>(null);
  const [cargandoServicios, setCargandoServicios] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/bodegas/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setBodega(d.bodega || d))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('simac_token');

    // Tarifario de servicios (público para productores)
    fetch(`${BASE}/bodegas/${id}/tarifario-publico`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTarifario(Array.isArray(d) ? d : d.servicios || []))
      .catch(() => setTarifario([]))
      .finally(() => setCargandoServicios(false));

    // Stock actual reportado
    fetch(`${BASE}/bodegas/${id}/stock-actual`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setStockActual(d.volumen_ton ?? null))
      .catch(() => setStockActual(null));
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!bodega) return <div className="min-h-screen flex items-center justify-center text-gray-400">No encontrada</div>;

  return (
    <div className="bg-[#eef8f2]">
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-1.5 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Mapa</p>
          <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">{bodega.nombre}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 py-5 space-y-4">
        <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-zinc-100">
          <h2 className="font-bold text-zinc-800 text-lg">{bodega.nombre}</h2>
          <div className="flex items-center gap-1 text-zinc-500 text-sm mt-1">
            <MapPin size={14} /> {bodega.municipio}, {bodega.estado}
          </div>

          {/* Semáforo de compra */}
          {bodega.estado_compra && (
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mt-2 ${
              bodega.estado_compra === 'comprando'
                ? 'bg-green-100 text-green-700'
                : bodega.estado_compra === 'limitado'
                ? 'bg-amber-100 text-amber-700'
                : bodega.estado_compra === 'no_compra'
                ? 'bg-red-100 text-red-700'
                : 'bg-[#eef8f2] text-gray-500'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                bodega.estado_compra === 'comprando' ? 'bg-green-500'
                : bodega.estado_compra === 'limitado' ? 'bg-amber-500'
                : bodega.estado_compra === 'no_compra' ? 'bg-red-500'
                : 'bg-gray-400'
              }`} />
              {bodega.estado_compra === 'comprando' ? 'Comprando maíz'
                : bodega.estado_compra === 'limitado' ? 'Capacidad limitada'
                : bodega.estado_compra === 'no_compra' ? 'No compra por ahora'
                : 'Sin actividad'}
            </div>
          )}

          {/* Mapa de ubicación de la bodega */}
          {bodega.latitud && bodega.longitud && (
            <div className="rounded-2xl overflow-hidden border border-gray-100 mt-4" style={{ height: '200px' }}>
              <MapContainer
                center={[bodega.latitud, bodega.longitud]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                scrollWheelZoom={false}
                dragging={false}
                doubleClickZoom={false}
                attributionControl={false}
              >
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  maxZoom={19}
                />
                <Marker position={[bodega.latitud, bodega.longitud]} />
              </MapContainer>
            </div>
          )}

          {bodega.responsable && (
            <div className="mt-2 flex justify-between bg-[#eef8f2] rounded-xl p-3">
              <span className="text-zinc-500 text-sm">Responsable</span>
              <span className="font-medium text-zinc-800 text-sm">{bodega.responsable}</span>
            </div>
          )}
        </div>

        {/* Capacidad y disponibilidad — vista unificada */}
        {bodega.capacidad_ton > 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm ring-1 ring-zinc-100">
            <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Warehouse size={18} className="text-gray-500" /> Capacidad y disponibilidad
            </h3>
            {stockActual !== null && (
              <>
                <div className="w-full bg-[#eef8f2] rounded-full h-3 mb-2">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      (stockActual / bodega.capacidad_ton) > 0.9 ? 'bg-red-400'
                      : (stockActual / bodega.capacidad_ton) > 0.7 ? 'bg-amber-400'
                      : 'bg-[#1A5C38]'
                    }`}
                    style={{ width: `${Math.min(100, (stockActual / bodega.capacidad_ton) * 100).toFixed(0)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 text-right mb-4">
                  {((stockActual / bodega.capacidad_ton) * 100).toFixed(0)}% ocupado
                </p>
              </>
            )}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#f4fbf7] rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Capacidad total</p>
                <p className="font-bold text-gray-800 text-lg">{bodega.capacidad_ton.toLocaleString('es-MX')}</p>
                <p className="text-xs text-gray-400">toneladas</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs text-blue-600 mb-1">Stock actual</p>
                <p className="font-bold text-blue-700 text-lg">{stockActual !== null ? stockActual.toLocaleString('es-MX') : '—'}</p>
                <p className="text-xs text-blue-400">toneladas</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-green-600 mb-1">Disponible</p>
                <p className="font-bold text-green-700 text-lg">{stockActual !== null ? Math.max(0, bodega.capacidad_ton - stockActual).toLocaleString('es-MX') : '—'}</p>
                <p className="text-xs text-green-400">toneladas libres</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm ring-1 ring-zinc-100">
            <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2"><Package size={18} className="text-gray-500" /> Stock actual</h3>
            {stockActual !== null ? (
              <p className="text-3xl font-bold text-[#1A5C38]">
                {stockActual.toLocaleString('es-MX')}
                <span className="text-base font-normal text-gray-500 ml-2">toneladas</span>
              </p>
            ) : (
              <p className="text-gray-400 text-sm">Sin información de stock disponible aún</p>
            )}
          </div>
        )}

        {/* Servicios y tarifario */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm ring-1 ring-zinc-100">
          <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Wrench size={18} className="text-gray-500" /> Servicios de la bodega
          </h3>
          {cargandoServicios ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-10 bg-[#eef8f2] rounded-lg animate-pulse" />
              ))}
            </div>
          ) : tarifario.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {tarifario.map((servicio, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <p className="text-gray-700">{servicio.concepto || servicio.nombre}</p>
                  <p className="font-semibold text-[#1A5C38]">
                    ${Number(servicio.precio)?.toLocaleString('es-MX')}
                    <span className="text-xs font-normal text-gray-400 ml-1">{servicio.unidad || 'MXN'}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">
              Esta bodega no tiene tarifario activo o sus precios
              tienen más de 90 días sin actualizar.
            </p>
          )}
        </div>

        {/* Botón Cómo llegar — solo si tiene coordenadas */}
        {bodega.latitud && bodega.longitud && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${bodega.latitud},${bodega.longitud}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 py-4 rounded-2xl font-semibold text-sm w-full active:scale-[0.98] transition-all"
          >
            <MapPin size={16} /> Cómo llegar
          </a>
        )}

        {bodega.telefono && (
          <a href={`tel:${bodega.telefono}`}
            className="flex items-center justify-center gap-2 bg-[#1A5C38] hover:bg-[#15482d] text-white py-4 rounded-2xl font-semibold transition-all duration-200 active:scale-[0.98]">
            <Phone size={18} /> Llamar a la bodega
          </a>
        )}

        <button onClick={() => navigate('/maiz/productor/mapa')}
          className="w-full ring-1 ring-zinc-300 text-zinc-600 py-3 rounded-2xl text-sm font-medium hover:bg-[#eef8f2] transition-colors">
          Volver al mapa
        </button>
      </div>
    </div>
  );
}
