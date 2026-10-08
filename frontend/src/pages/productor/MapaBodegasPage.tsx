import { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MapPin, Package, Warehouse, Map as MapIcon,
  CheckCircle2, Wheat, Navigation, Layers, ChevronDown, Compass, Flag
} from 'lucide-react';
import * as turf from '@turf/turf';

mapboxgl.accessToken = [
  'pk.eyJ1IjoibWFyaWVsMDgi',
  'LCJhIjoiY202emV3MDhhMDN6Y',
  'jJscHVqaXExdGpjMyJ9.F_ACoKzS_4e280lD0XndEw'
].join('');

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Bodega {
  id: number; nombre: string; municipio: string;
  latitud: number; longitud: number;
  estado_compra: string; precio_compra_hoy: number;
  is_ventanilla: boolean;
  capacidad_ton?: number; stock_actual?: number;
  senal_activa?: { id: number; precio_oferta: number; volumen_ton: number; tipo_maiz: string } | null;
}

interface ParcelaData {
  id: number;
  lat: number; lng: number;
  poligono: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  tiene_poligono?: boolean;
  nombre_up?: string;
  municipio?: string;
}

interface UpData {
  lat: number; lng: number;
  location_confirmed: boolean; centroid_source: string;
  municipio?: string; estado?: string;
  parcelas?: ParcelaData[];
}



// Color semáforo de bodegas
const SEMAFORO: Record<string, { fill: string; label: string }> = {
  comprando:     { fill: '#10B981', label: 'Comprando' },
  limitado:      { fill: '#F59E0B', label: 'Cap. Limitada' },
  no_compra:     { fill: '#EF4444', label: 'No compra' },
  sin_actividad: { fill: '#6B7280', label: 'Sin actividad' },
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function MapaBodegasPage() {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const parcelMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const upMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const [up, setUp] = useState<UpData | null>(null);
  const [parcelas, setParcelas] = useState<ParcelaData[]>([]);
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [loadingBodegas, setLoadingBodegas] = useState(true);
  const [radioKm, setRadioKm] = useState(100);
  const [filtroTipoMaiz, setFiltroTipoMaiz] = useState('');
  const [isMaizOpen, setIsMaizOpen] = useState(false);
  const [isKmOpen, setIsKmOpen] = useState(false);

  const [coordsAproximadas, setCoordsAproximadas] = useState(false);

  useEffect(() => {
    const handleClick = () => { setIsMaizOpen(false); setIsKmOpen(false); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);
  const [mapReady, setMapReady] = useState(false);

  const [confirmacionVisible, setConfirmacionVisible] = useState(false);
  const [bodegaConfirmada, setBodegaConfirmada] = useState('');
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');

  // â”€â”€ 1. Init mapa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ——— 1. Init mapa ——————————————————————————————————————————————————————————————
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-102.5528, 23.6345],
      zoom: 5,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.current.on('load', () => {
      setMapReady(true);
      map.current?.resize();
    });

    // Forzar resize para evitar contenedor de 0px en layouts flexibles
    setTimeout(() => map.current?.resize(), 100);
    setTimeout(() => map.current?.resize(), 500);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Toggle style
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const style = mapStyle === 'streets'
      ? 'mapbox://styles/mapbox/streets-v12'
      : 'mapbox://styles/mapbox/satellite-streets-v12';
    map.current.setStyle(style);
    map.current.once('styledata', () => {
      drawParcela();
      drawBodegas();
    });
  }, [mapStyle]); // eslint-disable-line

  // ── 2. Cargar UP + geometrías reales de parcelas ──
  useEffect(() => {
    const token = localStorage.getItem('simac_token');

    // (A) Datos generales del productor
    fetch(`${BASE}/productor/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const latReal = d.lat ?? null;
        const lngReal = d.lng ?? null;
        setCoordsAproximadas(!latReal || !lngReal);
        if (d.municipio) {
          setUp(prev => ({
            lat: latReal ?? 23.6345,
            lng: lngReal ?? -102.5528,
            location_confirmed: d.location_confirmed,
            centroid_source: d.centroid_source,
            municipio: d.municipio,
            estado: d.estado,
            parcelas: prev?.parcelas ?? [],
          }));
        }
      }).catch(() => {});

    // (B) Geometrías reales (mismo endpoint que Mi Perfil)
    fetch(`${BASE}/mis-ups`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const rows: any[] = d.ups ?? (Array.isArray(d) ? d : []);
        const parcelas: ParcelaData[] = rows
          .filter((u: any) => u.geom_geojson)
          .map((u: any) => ({
            id: u.up_id,
            lat: Number(u.centroid_lat ?? 0),
            lng: Number(u.centroid_lng ?? 0),
            poligono: u.geom_geojson as GeoJSON.Polygon | GeoJSON.MultiPolygon,
            nombre_up: u.up_name || 'Tu Parcela',
            municipio: u.municipio || ''
          }))
          .filter((p: ParcelaData) => p.lat !== 0 && p.lng !== 0);
        // Estado independiente: no se pierde por carrera con el fetch del dashboard
        setParcelas(parcelas);
        // Si el dashboard no nos dio ubicación, sembramos `up` desde la 1ª parcela
        // para que el mapa centre, cargue bodegas y se dibujen los polígonos.
        if (parcelas.length > 0) {
          setUp(prev => prev ?? {
            lat: parcelas[0].lat,
            lng: parcelas[0].lng,
            location_confirmed: true,
            centroid_source: 'parcela',
            municipio: parcelas[0].municipio || '',
            estado: '',
          });
        }
      }).catch(() => {});
  }, []);

  // â”€â”€ 3. Cargar bodegas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!up) return;
    const token = localStorage.getItem('simac_token');
    setLoadingBodegas(true);
    const params = new URLSearchParams({
      lat: String(up.lat), lng: String(up.lng),
      radio_km: String(radioKm),
      ...(filtroTipoMaiz ? { tipo_maiz: filtroTipoMaiz } : {}),
    });
    fetch(`${BASE}/bodegas?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setBodegas(Array.isArray(d) ? d : d.bodegas || []))
      .catch(() => {})
      .finally(() => setLoadingBodegas(false));
  }, [up, radioKm, filtroTipoMaiz]);

  // â”€â”€ 4. Dibuja polÃ­gono UP en el mapa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // ── 4. Dibuja parcelas del productor en el mapa ──
  const drawParcela = useCallback(() => {
    if (!map.current || !mapReady || !up) return;

    // Limpia capas anteriores
    ['up-fill', 'up-outline', 'up-pulse'].forEach(id => {
      if (map.current!.getLayer(id)) map.current!.removeLayer(id);
    });
    if (map.current.getSource('up-source')) map.current.removeSource('up-source');

    // Limpia marcadores anteriores
    if (upMarkerRef.current) { upMarkerRef.current.remove(); upMarkerRef.current = null; }
    parcelMarkersRef.current.forEach(m => m.remove());
    parcelMarkersRef.current = [];

    // Usar parcelas del backend (estado separado) O sintetizar una desde el centroide del UP
    const lista: ParcelaData[] = (parcelas && parcelas.length > 0)
      ? parcelas
      : [{ id: 0, lat: up.lat, lng: up.lng, poligono: null }];

    // --- POLÍGONOS ---
    const conPoligono = lista.filter(p => p.poligono);
    if (conPoligono.length > 0) {
      const features: GeoJSON.Feature[] = conPoligono.map(p => ({
        type: 'Feature' as const,
        geometry: p.poligono!,
        properties: { id: p.id }
      }));
      map.current.addSource('up-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features }
      });
      map.current.addLayer({
        id: 'up-fill', type: 'fill', source: 'up-source',
        paint: { 'fill-color': '#3B82F6', 'fill-opacity': 0.25 }
      });
      map.current.addLayer({
        id: 'up-outline', type: 'line', source: 'up-source',
        paint: { 'line-color': '#2563EB', 'line-width': 2.5 }
      });
    }

    // --- BANDERAS + BOUNDS ---
    const bounds = new mapboxgl.LngLatBounds();
    let hasBounds = false;

    lista.forEach(p => {
      if (!p.lat || !p.lng) return;

      let pLat = p.lat;
      let pLng = p.lng;
      if (p.poligono) {
        try {
          const center = turf.pointOnFeature(p.poligono as any);
          if (center && center.geometry && center.geometry.coordinates) {
            pLng = center.geometry.coordinates[0];
            pLat = center.geometry.coordinates[1];
          }
        } catch (e) {
          // fallback to DB centroid
        }
      }

      // Marcador punto azul pequeño
      const el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;background-color:#2563EB;border:2.5px solid #fff;border-radius:50%;cursor:pointer;box-sizing:border-box;';


      const popupNode = document.createElement('div');
      const popupRoot = createRoot(popupNode);
      popupRoot.render(
        <div className="w-52 p-3 space-y-2.5 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Flag size={14} className="text-blue-600" />
            </div>
            <div className="overflow-hidden">
              <p className="font-black text-gray-900 text-[13px] leading-tight truncate">{p.nombre_up || 'Tu Parcela'}</p>
              <p className="text-gray-500 text-[9px] truncate">{p.municipio || up.municipio || up.estado}</p>
            </div>
          </div>
          <div className="bg-blue-50/80 rounded-lg p-2.5 space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-gray-500 font-medium">Ubicación</span>
              <span className={`font-bold ${up.location_confirmed ? 'text-emerald-600' : 'text-amber-600'}`}>
                {up.location_confirmed ? '✓ Confirmada' : 'Aprox.'}
              </span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-gray-500 font-medium">Lat, Lng</span>
              <span className="font-mono text-gray-700">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
            </div>
          </div>
          {!up.location_confirmed && (
            <button onClick={() => navigate('/maiz/productor/ubicacion')}
              className="w-full bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-bold py-2 rounded-lg transition-all shadow-sm">
              Actualizar ubicación →
            </button>
          )}
        </div>
      );

      const popup = new mapboxgl.Popup({
        anchor: 'bottom', offset: [0, -18], closeButton: false, className: 'custom-premium-popup'
      }).setDOMContent(popupNode);

      popup.on('open', () => {
        const isMobile = window.innerWidth < 1024;
        map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14, duration: 800, offset: [0, isMobile ? 120 : 60] });
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([pLng, pLat])
        .setPopup(popup)
        .addTo(map.current!);
      parcelMarkersRef.current.push(marker);

      // Bounds
      if (p.poligono && p.poligono.type === 'Polygon') {
        p.poligono.coordinates[0].forEach(c => { bounds.extend(c as mapboxgl.LngLatLike); hasBounds = true; });
      } else if (p.poligono && p.poligono.type === 'MultiPolygon') {
        p.poligono.coordinates.forEach(poly => poly[0].forEach(c => { bounds.extend(c as mapboxgl.LngLatLike); hasBounds = true; }));
      } else {
        bounds.extend([p.lng, p.lat] as mapboxgl.LngLatLike); hasBounds = true;
      }
    });

    if (hasBounds) {
      const padding = conPoligono.length > 0 ? 80 : 0;
      const maxZoom = conPoligono.length > 0 ? 14 : (up.location_confirmed ? 13 : 9);
      map.current.fitBounds(bounds, { padding, maxZoom, duration: 1200 });
    }
  }, [up, mapReady, parcelas]);

  useEffect(() => { drawParcela(); }, [drawParcela]);

  // â”€â”€ 5. Dibuja marcadores de bodegas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const drawBodegas = useCallback(() => {
    if (!map.current || !mapReady) return;
    // Limpia anteriores
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    bodegas.filter(b => b.latitud && b.longitud).forEach(b => {
      const sem = SEMAFORO[b.estado_compra] || SEMAFORO.sin_actividad;

      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:24px;height:24px;cursor:pointer">
          <div style="position:absolute;inset:0;border-radius:50%;background:${sem.fill};border:2.5px solid #fff;box-sizing:border-box"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:7px;height:7px;border-radius:50%;background:#fff"></div>
          ${b.is_ventanilla ? `<div style="position:absolute;top:-3px;right:-3px;width:13px;height:13px;background:#7C3AED;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-sizing:border-box">
            <svg viewBox="0 0 24 24" style="width:6px;height:6px;fill:#fff"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>` : ''}
        </div>
      `;
      const popupNode = document.createElement('div');
      const popupRoot = createRoot(popupNode);
      
      const cap = Number(b.capacidad_ton || 0);
      const stock = Number(b.stock_actual || 0);
      const pct = cap > 0 ? Math.min(100, (stock / cap) * 100) : 0;
      const libre = Math.max(0, cap - stock);

      popupRoot.render(
        <div className="w-[240px] p-3 space-y-2.5 bg-white relative">
          <div className="flex justify-between items-start border-b border-gray-100 pb-2">
            <div className="w-full overflow-hidden">
              <span className="inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-full mb-1 border"
                style={{ color: sem.fill, borderColor: sem.fill + '40', background: sem.fill + '15' }}>
                {sem.label}
              </span>
              <h3 className="font-black text-gray-900 text-[13px] leading-tight truncate">{b.nombre}</h3>
              <p className="text-gray-500 text-[9px] flex items-center gap-1 mt-0.5 truncate">
                <MapPin size={9} className="flex-shrink-0" /> {b.municipio}
              </p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="bg-emerald-50 rounded-lg p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-md bg-[#1A5C38]/10 flex items-center justify-center flex-shrink-0">
                  <Wheat size={12} className="text-[#1A5C38]" />
                </div>
                <p className="text-[10px] text-gray-600 font-medium">Precio hoy</p>
              </div>
              <p className="font-black text-[#1A5C38] text-[14px]">
                {b.precio_compra_hoy > 0 ? `$${Number(b.precio_compra_hoy).toLocaleString('es-MX')}` : '-'}
              </p>
            </div>

            {cap > 0 && (
              <div className="bg-gray-50 rounded-lg p-2.5 space-y-1.5">
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div className={`h-1 rounded-full transition-all ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-gray-500 flex items-center gap-1"><Package size={9}/> {stock.toLocaleString()}t</span>
                  <span className="text-emerald-600 flex items-center gap-1"><Warehouse size={9}/> {libre.toLocaleString()}t</span>
                </div>
              </div>
            )}
            
            {b.senal_activa && (
              <div className="bg-blue-50/80 rounded-lg p-2.5">
                <p className="text-[9px] font-bold text-blue-600 uppercase mb-0.5">Señal de compra</p>
                <div className="flex justify-between items-end">
                  <p className="text-[10px] text-gray-700 font-medium">{b.senal_activa.volumen_ton}t {b.senal_activa.tipo_maiz}</p>
                  <p className="text-emerald-600 font-black text-[12px]">${Number(b.senal_activa.precio_oferta).toLocaleString('es-MX')}</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-1.5 pt-1 border-t border-gray-100">
            {b.senal_activa && (
              <button onClick={() => handleMeInteresa(b.senal_activa!.id, b.nombre)}
                className="flex-[1.5] bg-[#1A5C38] hover:bg-[#15482d] text-white text-[10px] font-black py-2 rounded-lg flex items-center justify-center gap-1 shadow-sm transition-all">
                <CheckCircle2 size={11} /> Me interesa
              </button>
            )}
            <button onClick={() => navigate(`/maiz/productor/mapa/bodega/${b.id}`)}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-all">
              <Navigation size={10} /> Detalle
            </button>
          </div>
        </div>
      );

      const popup = new mapboxgl.Popup({
        anchor: 'bottom',
        offset: [0, -16],
        closeButton: false,
        className: 'custom-premium-popup',
        maxWidth: '300px'
      }).setDOMContent(popupNode);

      popup.on('open', () => {
        const isMobile = window.innerWidth < 1024;
        map.current?.flyTo({ 
          center: [b.longitud, b.latitud], 
          zoom: 12.5, 
          duration: 800,
          offset: [0, isMobile ? 140 : 80]
        });
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([b.longitud, b.latitud])
        .setPopup(popup)
        .addTo(map.current!);
      markersRef.current.push(marker);
    });
  }, [bodegas, mapReady]);

  useEffect(() => { drawBodegas(); }, [drawBodegas]);

  // â”€â”€ Me Interesa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleMeInteresa = async (senalId: number, nombreBodega?: string) => {
    const token = localStorage.getItem('simac_token');
    await fetch(`${BASE}/senales-compra/${senalId}/interes`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setBodegaConfirmada(nombreBodega || 'la bodega');
    setConfirmacionVisible(true);
    setTimeout(() => setConfirmacionVisible(false), 4000);
  };

  const comprando  = bodegas.filter(b => b.estado_compra === 'comprando').length;

  // ── RENDER ────────────────────────────────────
  return (
    <div className="bg-[#eef8f2] w-full max-w-2xl mx-auto h-full flex flex-col overflow-hidden">

      {/* ── HEADER VERDE: título + stats + filtros ── */}
      <div className="flex-shrink-0 bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)] z-20">
        <div className="px-4 sm:px-6 pt-4 pb-4">


          {/* Título + subtítulo */}
          <p className="text-[10px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Mapa</p>
          <h1 className="text-[18px] sm:text-[20px] font-black text-white leading-tight tracking-tight">Mapa de Bodegas</h1>
          <p className="text-[11px] font-medium text-white/40 mt-0.5 mb-3">Encuentra bodegas activas cerca de tu parcela</p>

          {/* Stats horizontales compactos */}
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/10">
              <span className="text-white font-black text-[16px] leading-none">{bodegas.length}</span>
              <span className="text-green-300/70 text-[10px] font-semibold uppercase tracking-wide">Bodegas</span>
            </div>
            <div className="flex-1 bg-white/10 rounded-xl px-3 py-1.5 flex items-center gap-2 border border-white/10">
              <span className="text-emerald-400 font-black text-[16px] leading-none">{comprando}</span>
              <span className="text-green-300/70 text-[10px] font-semibold uppercase tracking-wide">Comprando</span>
            </div>
          </div>

          {/* Filtros dentro del header */}
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>

            {/* Tipo Maíz Dropdown */}
            <div className="relative flex-1">
              <button
                onClick={() => { setIsMaizOpen(!isMaizOpen); setIsKmOpen(false); }}
                className="w-full bg-white/15 border border-white/20 text-white text-[12px] font-bold rounded-xl py-2 pl-8 pr-6 flex items-center justify-between focus:outline-none transition-all"
              >
                <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
                  <Wheat size={13} className="text-green-300" />
                </div>
                <span className="truncate text-left">
                  {filtroTipoMaiz === 'blanco' ? 'Maíz Blanco' : filtroTipoMaiz === 'amarillo' ? 'Maíz Amarillo' : filtroTipoMaiz === 'criollo' ? 'Maíz Criollo' : 'Cualquier maíz'}
                </span>
                <ChevronDown size={13} className={`text-white/50 transition-transform duration-300 flex-shrink-0 ml-1 ${isMaizOpen ? 'rotate-180' : ''}`} />
              </button>
              <div className={`absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] border border-gray-100 overflow-hidden origin-top transition-all duration-300 z-30 ${isMaizOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}>
                {[
                  { val: '', label: 'Cualquier maíz' },
                  { val: 'blanco', label: 'Maíz Blanco' },
                  { val: 'amarillo', label: 'Maíz Amarillo' },
                  { val: 'criollo', label: 'Maíz Criollo' }
                ].map(opt => (
                  <button key={opt.val} onClick={() => { setFiltroTipoMaiz(opt.val); setIsMaizOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors ${filtroTipoMaiz === opt.val ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Radio Dropdown */}
            <div className="relative flex-1">
              <button
                onClick={() => { setIsKmOpen(!isKmOpen); setIsMaizOpen(false); }}
                className="w-full bg-white/15 border border-white/20 text-white text-[12px] font-bold rounded-xl py-2 pl-8 pr-6 flex items-center justify-between focus:outline-none transition-all"
              >
                <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
                  <Compass size={13} className="text-blue-300" />
                </div>
                <span className="truncate text-left">Radio: {radioKm} km</span>
                <ChevronDown size={13} className={`text-white/50 transition-transform duration-300 flex-shrink-0 ml-1 ${isKmOpen ? 'rotate-180' : ''}`} />
              </button>
              <div className={`absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] border border-gray-100 overflow-hidden origin-top transition-all duration-300 z-30 ${isKmOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}>
                {[50, 100, 200, 500].map(km => (
                  <button key={km} onClick={() => { setRadioKm(km); setIsKmOpen(false); }}
                    className={`w-full text-left px-4 py-2.5 text-[13px] font-medium transition-colors ${radioKm === km ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>
                    Radio: {km} km
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* —— Aviso aproximado —— */}
      {coordsAproximadas && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3">
          <MapPin size={14} className="text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-[11px] font-medium flex-1">
            Ubicación aproximada — distancias estimadas desde tu municipio.
          </p>
          <button onClick={() => navigate('/maiz/productor/ubicacion')}
            className="text-amber-700 text-[11px] font-bold underline flex-shrink-0">
            Actualizar →
          </button>
        </div>
      )}

      {/* ——— MAPA (llena el espacio restante, sin scroll) ——— */}
      <div className="flex-1 min-h-0 px-3 pt-3 pb-3">
        <div className="relative h-full rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.12)] ring-1 ring-black/5">
          <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

          {/* Loading overlay */}
          {loadingBodegas && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur-md rounded-full px-4 py-2 shadow-lg flex items-center gap-2 text-[12px] font-semibold text-gray-700">
              <div className="w-3 h-3 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
              Cargando bodegas...
            </div>
          )}

          {/* Style toggle */}
          <button
            onClick={() => setMapStyle(s => s === 'streets' ? 'satellite' : 'streets')}
            className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 shadow-lg flex items-center gap-1.5 text-[12px] font-bold text-gray-700 hover:bg-white transition-all">
            <Layers size={14} />
            {mapStyle === 'streets' ? 'Satélite' : 'Mapa'}
          </button>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-md rounded-xl p-2.5 shadow-lg space-y-1.5 border border-black/5">
            {Object.entries(SEMAFORO).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: v.fill }} />
                <span className="text-[10px] text-gray-700 font-medium">{v.label}</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-1.5 flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0" />
              <span className="text-[10px] text-gray-700 font-medium">Tu parcela</span>
            </div>
          </div>

          {/* Sin bodegas */}
          {bodegas.length === 0 && up && !loadingBodegas && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/70 backdrop-blur-sm">
              <div className="text-center px-6 max-w-xs bg-white rounded-2xl p-8 shadow-2xl">
                <MapIcon size={36} className="text-gray-300 mx-auto mb-3" />
                <p className="font-bold text-gray-800">No hay bodegas en {radioKm} km</p>
                <p className="text-sm text-gray-500 mt-1">Intenta ampliar el radio de búsqueda</p>
                {radioKm < 500 && (
                  <button onClick={() => setRadioKm(500)}
                    className="mt-4 px-4 py-2 bg-[#1A5C38] text-white rounded-xl text-sm font-semibold">
                    Buscar en 500 km
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* â”€â”€ Toast â”€â”€ */}
      {confirmacionVisible && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[3000] bg-[#1A5C38] text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 max-w-xs w-full mx-4">
          <CheckCircle2 size={22} className="flex-shrink-0" />
          <div>
            <p className="font-black text-[13px]">¡Interés registrado!</p>
            <p className="text-emerald-200 text-[11px] mt-0.5">{bodegaConfirmada} recibirá tu solicitud</p>
          </div>
        </div>
      )}
    </div>
  );
}

