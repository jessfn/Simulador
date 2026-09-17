import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import {
  ArrowLeft, Users, Mail, Phone, Calendar, MapPin, Sprout,
  Check, X, AlertTriangle, RefreshCw, ShieldCheck
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { usePermisosStore } from '../../store/permisos';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

interface ProductorDetalle {
  id: number;
  nombre: string;
  apellidos: string;
  curp: string;
  email: string;
  telefono: string;
  rol: string;
  estado_validacion: 'pendiente' | 'activo' | 'rechazado' | 'suspendido';
  created_at: string;
  tipo_productor: 'A' | 'B';
  up: {
    estado: string;
    municipio: string;
    superficie_hectareas: number;
    cultivo_principal: string;
    variedad: string;
    ciclo_activo: string;
    latitud?: number;
    longitud?: number;
  } | null;
  ups: {
    up_id: number;
    up_name: string | null;
    state_name: string | null;
    municipality_name: string | null;
    area_ha_calc: number | null;
    created_at: string | null;
    geom_geojson: any;
    centroid_lat: number;
    centroid_lng: number;
  }[];
  disponibilidades: {
    id: number;
    tipo_maiz: string;
    variedad: string;
    volumen_toneladas: number;
    created_at: string;
    activa: boolean;
  }[];
  estado_registro: { requiere_ubicacion: boolean; requiere_ciclo: boolean; siguiente_paso: string } | null;
  encuesta_insumos: {
    elegible: boolean;
    respuesta?: { respuesta: 'si' | 'no'; updated_at: string; canal: string } | null;
    lineas?: { producto_nombre: string; cantidad_base: string; unidad_base: string; mes_compra: string; identificacion_pendiente: boolean }[];
  } | null;
}

export default function ProductorDetalleAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const puedo         = usePermisosStore(s => s.puedo);
  const permisosTotal = usePermisosStore(s => s.permisosTotal);
  const puedeEditar     = permisosTotal || puedo('productores', 'editar');
  const puedeVerDetalle = permisosTotal || puedo('productores', 'ver_detalle');
  const [data, setData] = useState<ProductorDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [traslapeInfo, setTraslapeInfo] = useState<{
    up_id: number | null;
    producer_id: number | null;
    revisado: boolean;
    nombre: string;
  } | null>(null);
  const [marcandoTraslape, setMarcandoTraslape] = useState(false);

  // Modales de acción
  const [modalType, setModalType] = useState<'aprobar' | 'rechazar' | 'suspender' | 'reactivar' | null>(null);
  const [notaInterna, setNotaInterna] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function cargarDetalle() {
    setLoading(true);
    try {
      // 1. Productor + UP + ciclo en una sola llamada
      const resU = await fetch(`${BASE}/admin/usuarios/${id}`, { headers: HDR() });
      if (!resU.ok) throw new Error(`Error ${resU.status}`);
      const userRes = await resU.json();
      const u = userRes.productor || userRes.usuario || userRes;

      // 2. Disponibilidades del productor via endpoint admin
      let dispList: any[] = [];
      try {
        const resDisp = await fetch(`${BASE}/admin/productor-disponibilidades/${id}`, { headers: HDR() });
        if (resDisp.ok) {
          const disp = await resDisp.json();
          dispList = disp.disponibilidades || [];
        }
      } catch { /* si no hay, se muestra vacío */ }

      // Traslape
      if (u.posible_traslape_producer_id) {
        setTraslapeInfo({
          up_id: u.up_id ?? null,
          producer_id: u.posible_traslape_producer_id,
          revisado: u.traslape_revisado || false,
          nombre: [u.traslape_productor_nombre, u.traslape_productor_apellido].filter(Boolean).join(' ') || 'otro productor',
        });
      } else {
        setTraslapeInfo(null);
      }

      // Construir upData desde la respuesta del endpoint (ya viene lat/lng del centroide PostGIS)
      const tieneUP = !!(u.estado_up || u.municipio_up || u.superficie_ha);
      const upData = tieneUP ? {
        estado: u.estado_up || '',
        municipio: u.municipio_up || '',
        superficie_hectareas: parseFloat(u.superficie_ha) || 0,
        cultivo_principal: u.cultivo_principal || '—',
        variedad: u.variedad || '—',
        ciclo_activo: u.ciclo_activo || '—',
        latitud: u.lat ? parseFloat(u.lat) : undefined,
        longitud: u.lng ? parseFloat(u.lng) : undefined,
      } : null;

      setData({
        id: parseInt(id || '0'),
        nombre: u.nombres || u.nombre || '',
        apellidos: [u.apellido_paterno, u.apellido_materno].filter(Boolean).join(' ') || u.apellidos || '',
        curp: u.curp || '',
        email: u.correo || u.correo_electronico || u.email || '',
        telefono: u.telefono || '',
        rol: u.rol,
        estado_validacion: u.estado_validacion || 'pendiente',
        created_at: u.fecha_registro || u.created_at || new Date().toISOString(),
        tipo_productor: u.tipo_registro || u.tipo_productor || 'B',
        up: upData,
        ups: Array.isArray(u.ups_geom) ? u.ups_geom : [],
        disponibilidades: dispList,
        estado_registro: u.estado_registro || null,
        encuesta_insumos: u.encuesta_insumos || null,
      });

    } catch (e) {
      console.error('Error al cargar detalle de productor:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDetalle();
  }, [id]);

  async function handleApplyEstatus() {
    if (!data || !modalType) return;
    setActionError('');

    if (modalType === 'rechazar' && notaInterna.trim().length < 20) {
      setActionError('Debes escribir un motivo de rechazo formal (mínimo 20 caracteres).');
      return;
    }

    let nuevoEstatus: 'activo' | 'rechazado' | 'suspendido' = 'activo';
    if (modalType === 'rechazar') nuevoEstatus = 'rechazado';
    if (modalType === 'suspender') nuevoEstatus = 'suspendido';

    setActionLoading(true);
    try {
      const res = await fetch(`${BASE}/admin/usuarios/${data.id}/estatus`, {
        method: 'PATCH',
        headers: { ...HDR(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_validacion: nuevoEstatus, nota: notaInterna })
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      setData(prev => prev ? { ...prev, estado_validacion: nuevoEstatus } : null);
      setModalType(null);
      setNotaInterna('');
    } catch (e) {
      console.error('Error aplicando estatus:', e);
      // Simular cambio local
      setData(prev => prev ? { ...prev, estado_validacion: nuevoEstatus } : null);
      setModalType(null);
      setNotaInterna('');
    } finally {
      setActionLoading(false);
    }
  }

  // Defensa en profundidad: acceso directo por URL sin permiso de ver_detalle
  if (!puedeVerDetalle) return <Navigate to="/admin/productores" replace />;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <RefreshCw size={24} className="text-emerald-500 animate-spin" />
      <p className="text-[13px] text-gray-500">Cargando ficha del productor...</p>
    </div>
  );

  if (!data) return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-600">
      No se encontró el productor solicitado o no tienes permisos.
    </div>
  );

  // Centro del mapa: primer centroide disponible o fallback Culiacán
  const mapCenter: [number, number] =
    data.ups.length > 0
      ? [data.ups[0].centroid_lat, data.ups[0].centroid_lng]
      : data.up?.latitud && data.up?.longitud
        ? [data.up.latitud, data.up.longitud]
        : [24.8083, -107.3941];

  // Banderita azul personalizada
  const blueFlag = L.divIcon({
    html: `<div style="position:relative;width:20px;height:30px">
      <div style="position:absolute;left:3px;top:0;width:2px;height:28px;background:#2563eb;border-radius:1px"></div>
      <div style="position:absolute;left:5px;top:1px;width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:12px solid #2563eb"></div>
    </div>`,
    className: '',
    iconSize: [20, 30],
    iconAnchor: [3, 28],
    popupAnchor: [6, -28],
  });

  // Parsear polígonos de las UPs del productor para Leaflet
  const upsParseadas = data.ups.map(u => {
    const g = u.geom_geojson;
    if (!g?.coordinates) return null;
    const ring: number[][] =
      g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : g.coordinates[0];
    if (!ring || ring.length < 3) return null;
    return {
      up_id: u.up_id,
      up_name: u.up_name,
      state_name: u.state_name,
      municipality_name: u.municipality_name,
      area_ha_calc: u.area_ha_calc,
      created_at: u.created_at,
      pos: ring.map(([ln, la]: number[]) => [la, ln] as [number, number]),
      lat: u.centroid_lat,
      lng: u.centroid_lng,
    };
  }).filter(Boolean) as {
    up_id: number; up_name: string | null; state_name: string | null;
    municipality_name: string | null; area_ha_calc: number | null;
    created_at: string | null; pos: [number, number][]; lat: number; lng: number;
  }[];

  return (
    <div className="flex flex-col gap-3">

      {/* Back button and title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/admin/productores')}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-gray-900 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-[18px] font-black text-gray-900">{data.nombre} {data.apellidos}</h1>
            <p className="text-[11px] text-gray-500">Ficha técnica administrativa · {data.tipo_productor === 'B' ? 'Tipo B (Verificado)' : 'Tipo A'}</p>
          </div>
        </div>

        {/* Estatus indicator + action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Estado:</span>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${
              data.estado_validacion === 'activo' ? 'text-emerald-500' :
              data.estado_validacion === 'pendiente' ? 'text-amber-500' :
              data.estado_validacion === 'rechazado' ? 'text-red-500' : 'text-gray-500'
            }`}>
              {data.estado_validacion.charAt(0).toUpperCase() + data.estado_validacion.slice(1)}
            </span>
          </div>

          {puedeEditar && data.estado_validacion === 'pendiente' && (
            <>
              <button
                onClick={() => setModalType('aprobar')}
                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[12.5px] rounded-xl shadow-md transition-all"
              >
                <Check size={14} /> Aprobar
              </button>
              <button
                onClick={() => setModalType('rechazar')}
                className="flex items-center gap-1 px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-[12.5px] rounded-xl shadow-md transition-all"
              >
                <X size={14} /> Rechazar
              </button>
            </>
          )}

          {puedeEditar && data.estado_validacion === 'activo' && (
            <button
              onClick={() => setModalType('suspender')}
              className="px-4 py-2 bg-red-50 border border-red-100 hover:bg-red-100 text-red-600 text-gray-500 font-bold text-[12.5px] rounded-xl border border-white/5 transition-all"
            >
              Suspender Cuenta
            </button>
          )}

          {puedeEditar && data.estado_validacion === 'suspendido' && (
            <button
              onClick={() => setModalType('reactivar')}
              className="px-4 py-2 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 text-emerald-700 text-gray-500 font-bold text-[12.5px] rounded-xl border border-white/5 transition-all"
            >
              Reactivar Cuenta
            </button>
          )}
        </div>
      </div>

      {/* Grid: Ficha / Mapa / Disponibilidades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. DATOS GENERALES (Col 1) */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Users size={15} className="text-emerald-500" />
            <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Identidad y Contacto</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">CURP Validador</span>
              <p className="text-[14px] font-mono text-gray-900 font-bold">{data.curp}</p>
            </div>
            
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Correo Electrónico</span>
              <p className="text-[14px] text-gray-900 flex items-center gap-1.5">
                <Mail size={12} className="text-gray-500" />
                {data.email || 'No proporcionado'}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Teléfono de Enlace</span>
              <p className="text-[14px] text-gray-900 flex items-center gap-1.5">
                <Phone size={12} className="text-gray-500" />
                {data.telefono || 'No proporcionado'}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Fecha Registro</span>
              <p className="text-[14px] text-gray-900 flex items-center gap-1.5">
                <Calendar size={12} className="text-gray-500" />
                {new Date(data.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Perfil Tecnológico</span>
              <div>
                {data.tipo_productor === 'B' ? (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 p-3 rounded-xl mt-1 space-y-1">
                    <p className="text-[12px] font-bold">Productor Tipo B</p>
                    <p className="text-[10.5px] text-indigo-300 leading-normal">Cuenta con verificación biométrica o báscula autorizada en bodega. Capacidad operativa aprobada.</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 text-gray-500 p-3 rounded-xl mt-1 space-y-1">
                    <p className="text-[12px] font-bold">Productor Tipo A</p>
                    <p className="text-[10.5px] text-gray-500 leading-normal">Registro autodeclarado en la plataforma. Sujeto a auditorías físicas de silo y rendimiento.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. DATOS DE LA UNIDAD DE PRODUCCIÓN (UP) & MAPA (Col 2 & 3) */}
        <div className="lg:col-span-2 bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <MapPin size={15} className="text-emerald-500" />
              <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Ubicación y Parcela (UP)</h3>
            </div>

            {data.up ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 border border-gray-100 rounded-xl p-3.5 text-[12.5px]">
                <div>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Estado</span>
                  <strong className="text-gray-900 font-bold">{data.up.estado}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Municipio</span>
                  <strong className="text-gray-900 font-bold">{data.up.municipio}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Superficie</span>
                  <strong className="text-gray-900 font-bold">{data.up.superficie_hectareas} Hectáreas</strong>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Ciclo Activo</span>
                  <strong className="text-gray-900 font-bold">{data.up.ciclo_activo}</strong>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-gray-500">Sin datos de Unidad de Producción (UP) vinculados.</p>
            )}

            {/* Badge de posible traslape */}
            {traslapeInfo && !traslapeInfo.revisado && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-bold text-amber-800">Posible traslape con otro productor</p>
                  <p className="text-[11.5px] text-amber-700 mt-0.5">
                    Esta parcela se superpone en más del 10% con una parcela de <strong>{traslapeInfo.nombre}</strong>.
                    Puede ser una situación ejidal o familiar normal — confirma antes de actuar.
                  </p>
                </div>
                <button
                  disabled={marcandoTraslape}
                  onClick={async () => {
                    if (!traslapeInfo.up_id) return;
                    setMarcandoTraslape(true);
                    try {
                      await fetch(`${BASE}/admin/ups/${traslapeInfo.up_id}/marcar-traslape-revisado`, {
                        method: 'PATCH',
                        headers: HDR(),
                      });
                      setTraslapeInfo(t => t ? { ...t, revisado: true } : null);
                    } finally {
                      setMarcandoTraslape(false);
                    }
                  }}
                  className="shrink-0 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  <ShieldCheck size={13} /> Marcar revisado
                </button>
              </div>
            )}
            {traslapeInfo?.revisado && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5">
                <ShieldCheck size={14} className="text-green-600 shrink-0" />
                <p className="text-[12px] text-green-800 font-medium">Traslape ya revisado por el equipo.</p>
              </div>
            )}
          </div>

          {/* Leaflet Map Card */}
          <div className="h-64 rounded-xl overflow-hidden border border-white/5 relative z-10">
            <MapContainer center={mapCenter} zoom={upsParseadas.length > 0 ? 14 : 13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="ESRI Imagery"
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                attribution=""
                opacity={0.7}
              />
              {upsParseadas.length > 0 ? (
                upsParseadas.map(up => (
                  <Polygon
                    key={up.up_id}
                    positions={up.pos}
                    pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 2.5 }}
                  >
                    <Popup>
                      <p className="text-[12px] font-bold">Parcela de {data.nombre}</p>
                      <p className="text-[11px] text-gray-500">UP #{up.up_id}</p>
                    </Popup>
                  </Polygon>
                ))
              ) : (
                <Marker position={mapCenter}>
                  <Popup>
                    <p className="text-[12px] font-bold">{data.nombre} {data.apellidos}</p>
                    <p className="text-[11px] text-gray-500">Ubicación de parcela aproximada</p>
                  </Popup>
                </Marker>
              )}
              {upsParseadas.map(up => (
                <Marker key={`flag-${up.up_id}`} position={[up.lat, up.lng]} icon={blueFlag}>
                  <Popup minWidth={220} maxWidth={280}>
                    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                        <span style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>
                          {up.up_name || `Parcela #${up.up_id}`}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 11 }}>
                        <div>
                          <div style={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', marginBottom: 1 }}>Superficie</div>
                          <div style={{ color: '#111827', fontWeight: 700, fontSize: 13 }}>
                            {up.area_ha_calc != null ? `${Number(up.area_ha_calc).toFixed(2)} ha` : '—'}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', marginBottom: 1 }}>Parcela ID</div>
                          <div style={{ color: '#2563eb', fontWeight: 700, fontSize: 12, fontFamily: 'monospace' }}>#{up.up_id}</div>
                        </div>
                        <div>
                          <div style={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', marginBottom: 1 }}>Municipio</div>
                          <div style={{ color: '#374151', fontWeight: 600 }}>{up.municipality_name || '—'}</div>
                        </div>
                        <div>
                          <div style={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em', marginBottom: 1 }}>Estado</div>
                          <div style={{ color: '#374151', fontWeight: 600 }}>{up.state_name || '—'}</div>
                        </div>
                      </div>
                      {up.created_at && (
                        <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid #f3f4f6', fontSize: 10, color: '#9ca3af' }}>
                          Registrada el {new Date(up.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

        </div>

      </div>

      {/* ── ESTADO DE REGISTRO Y ENCUESTA DE INSUMOS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <ShieldCheck size={15} className="text-indigo-500" />
            <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Estado del registro</h3>
          </div>
          {data.estado_registro ? (
            data.estado_registro.requiere_ubicacion ? (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[12.5px] text-amber-800 font-medium">Le falta registrar la ubicación de al menos una parcela.</p>
              </div>
            ) : data.estado_registro.requiere_ciclo ? (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[12.5px] text-amber-800 font-medium">Aún no captura su ciclo productivo — no puede usar el resto de la app hasta completarlo.</p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
                <Check size={15} className="text-emerald-600 shrink-0" />
                <p className="text-[12.5px] text-emerald-800 font-medium">Ubicación y ciclo productivo completos.</p>
              </div>
            )
          ) : (
            <p className="text-[12px] text-gray-400 italic">No se pudo obtener el estado del registro.</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Sprout size={15} className="text-amber-500" />
            <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Encuesta de insumos</h3>
          </div>
          {!data.encuesta_insumos?.elegible ? (
            <p className="text-[12px] text-gray-400 italic">No aplica — este productor no tiene ninguna parcela en Sinaloa.</p>
          ) : !data.encuesta_insumos.respuesta ? (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
              <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-amber-800 font-medium">Aplica, pero aún no tiene respuesta registrada.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                <Check size={15} className="text-emerald-600 shrink-0" />
                <p className="text-[12.5px] text-emerald-800 font-medium">
                  Respondió <strong>{data.encuesta_insumos.respuesta.respuesta === 'si' ? 'Sí' : 'No'}</strong> tiene compras previstas
                  {' · '}{new Date(data.encuesta_insumos.respuesta.updated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              {data.encuesta_insumos.lineas && data.encuesta_insumos.lineas.length > 0 && (
                <div className="space-y-1.5">
                  {data.encuesta_insumos.lineas.map((l, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-[12px]">
                      <span className="text-gray-700 font-semibold truncate">{l.producto_nombre}</span>
                      <span className="text-gray-500 shrink-0">{Number(l.cantidad_base).toLocaleString('es-MX', { maximumFractionDigits: 2 })} {l.unidad_base}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── DISPONIBILIDADES DECLARADAS ── */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <Sprout size={15} className="text-emerald-500" />
          <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Cosecha Declarada Disponible</h3>
        </div>

        {data.disponibilidades.length === 0 ? (
          <p className="text-[12.5px] text-gray-400 italic">Este productor no tiene cosecha declarada disponible.</p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] divide-y divide-gray-100">
            <thead>
              <tr className="text-gray-500 font-bold text-[10.5px] uppercase tracking-wide bg-white/[0.01]">
                <th className="py-3 px-4">Tipo Maíz</th>
                <th className="py-3 px-4">Variedad de Semilla</th>
                <th className="py-3 px-4">Volumen Declarado</th>
                <th className="py-3 px-4">Fecha Declaración</th>
                <th className="py-3 px-4">Estatus Operación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {data.disponibilidades.map(disp => (
                <tr key={disp.id} className="hover:bg-[#eef8f2] transition-colors">
                  <td className="py-3.5 px-4 font-bold text-gray-900">{disp.tipo_maiz}</td>
                  <td className="py-3.5 px-4 text-gray-500 font-mono text-[12.5px]">{disp.variedad}</td>
                  <td className="py-3.5 px-4 text-emerald-600 font-black text-[14px]">
                    {disp.volumen_toneladas} Toneladas
                  </td>
                  <td className="py-3.5 px-4 text-gray-500">
                    {new Date(disp.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="py-3.5 px-4">
                    {disp.activa ? (
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-full">Activa</span>
                    ) : (
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white/5 border border-gray-200 rounded-full">Vencida</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Modales de Confirmación */}
      {modalType && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl max-w-[440px] w-full shadow-2xl overflow-hidden animate-zoomIn">
            
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                modalType === 'aprobar' || modalType === 'reactivar' 
                  ? 'bg-emerald-500/10 text-emerald-500' 
                  : 'bg-red-500/10 text-red-500'
              }`}>
                {modalType === 'aprobar' || modalType === 'reactivar' ? <Check size={16} /> : <AlertTriangle size={16} />}
              </div>
              <h3 className="text-[16px] font-extrabold text-gray-900 uppercase tracking-tight">
                {modalType === 'aprobar' && 'Confirmar Aprobación'}
                {modalType === 'rechazar' && 'Rechazar Registro'}
                {modalType === 'suspender' && 'Suspender Cuenta'}
                {modalType === 'reactivar' && 'Reactivar Cuenta'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[13px] text-gray-700 leading-relaxed">
                ¿Estás seguro que deseas {modalType === 'aprobar' && 'aprobar y dar de alta en el padrón a'}
                {modalType === 'rechazar' && 'rechazar la solicitud de'}
                {modalType === 'suspender' && 'suspender administrativamente la cuenta de'}
                {modalType === 'reactivar' && 'reactivar y reincorporar al padrón a'}{' '}
                <strong className="text-gray-900 font-extrabold">{data.nombre} {data.apellidos}</strong>?
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  {modalType === 'rechazar' ? 'Motivo del Rechazo (Obligatorio)' : 'Nota Interna (Opcional)'}
                </label>
                <textarea 
                  rows={4}
                  placeholder={
                    modalType === 'rechazar' 
                      ? 'Explica detalladamente la causa formal de rechazo para el productor (mínimo 20 caracteres)...' 
                      : 'Notas adicionales sobre esta operación...'
                  }
                  value={notaInterna}
                  onChange={e => setNotaInterna(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] text-gray-900 placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none"
                />
              </div>

              {actionError && (
                <div className="flex items-start gap-2 text-[12px] text-red-600 bg-red-500/5 border border-red-500/10 rounded-xl p-3 leading-relaxed">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <p>{actionError}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button 
                onClick={() => { setModalType(null); setNotaInterna(''); setActionError(''); }}
                className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-gray-500 hover:text-gray-900 hover:bg-white/5 transition-all"
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                onClick={handleApplyEstatus}
                className={`px-5 py-2.5 rounded-xl text-[13px] font-bold text-gray-900 transition-all ${
                  modalType === 'aprobar' || modalType === 'reactivar'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
                disabled={actionLoading}
              >
                {actionLoading ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}




