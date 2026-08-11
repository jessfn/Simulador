import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Search, SlidersHorizontal, X, ChevronDown, MapPin, Layers, RefreshCw,
  Map as MapIcon, List, Trash2, AlertTriangle, CheckCircle2, Sprout,
  Users, BarChart3,
} from 'lucide-react';

mapboxgl.accessToken = [
  'pk.eyJ1IjoibWFyaWVsMDgi',
  'LCJhIjoiY202emV3MDhhMDN6Y',
  'jJscHVqaXExdGpjMyJ9.F_ACoKzS_4e280lD0XndEw',
].join('');

const ZOOM_MIN_POLIGONOS = 10;

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

const PALETA = [
  '#2563eb','#16a34a','#dc2626','#9333ea',
  '#ea580c','#0891b2','#ca8a04','#be185d',
  '#0d9488','#7c3aed','#b45309','#065f46',
];

interface Parcela {
  up_id: number;
  up_name: string | null;
  state_name: string | null;
  municipality_name: string | null;
  area_ha_calc: number | null;
  created_at: string | null;
  geom_geojson: any;
  centroid_lat: number;
  centroid_lng: number;
  producer_id: number;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  curp: string | null;
  correo: string | null;
  estado_validacion: string;
  ciclo_activo: string | null;
  cultivo_principal: string | null;
  tipo_cultivo: string | null;
}

function fmtHa(n:number):string {
  if(n>=1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if(n>=10_000)    return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString('es-MX',{maximumFractionDigits:0});
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
}

// Popup de Mapbox usa HTML plano (no React) — se construye el mismo
// diseño que antes tenía PopupContent, escapando todo dato dinámico.
// Íconos monolínea modernos (estilo SF Symbols) para el popup — currentColor
// para heredar el color de cada bloque.
const ICONS = {
  ruler: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15l6-6M8 15l2-2M12 15l2-2M16 15l2-2"/><path d="M2.5 17.5l4-4a2 2 0 0 1 2.8 0l10.2 10.2a2 2 0 0 1 0 2.8l-4 4a2 2 0 0 1-2.8 0L2.5 20.3a2 2 0 0 1 0-2.8Z" transform="translate(-1,-6)"/></svg>`,
  leaf:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 10-11 1 5-1 9-4 11a7 7 0 0 1-7 7"/><path d="M4 13c3.5 0 6.5 2 8 5"/></svg>`,
  pin:   `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  flag:  `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4a1 1 0 0 1 1-1h11.4a1 1 0 0 1 .8 1.6L15 9l3.2 4.4a1 1 0 0 1-.8 1.6H6"/></svg>`,
  calendar: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/></svg>`,
  check: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  id:    `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8" cy="12" r="2"/><path d="M13 10h6M13 14h4"/></svg>`,
};

function buildPopupHTML(p: Parcela, nombre: string, color: string): string {
  const ha = p.area_ha_calc!=null ? parseFloat(String(p.area_ha_calc)) : null;
  const estadoColor = p.estado_validacion==='activo'?'#15803d':p.estado_validacion==='pendiente'?'#a16207':'#b91c1c';
  const estadoBg = p.estado_validacion==='activo'?'rgba(220,252,231,.85)':p.estado_validacion==='pendiente'?'rgba(254,249,195,.85)':'rgba(254,226,226,.85)';
  const fecha = p.created_at?new Date(p.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}):'—';

  const campo = (icon:string, label:string, valor:string) => `
    <div style="min-width:0;">
      <div style="display:flex;align-items:center;gap:3px;color:rgba(60,60,67,0.6);margin-bottom:2px;">
        <span style="display:inline-flex;flex-shrink:0;">${icon}</span>
        <span style="font-weight:600;text-transform:uppercase;font-size:7.5px;letter-spacing:0.05em;">${label}</span>
      </div>
      <div style="color:#1c1c1e;font-weight:600;font-size:11px;overflow-wrap:anywhere;">${valor}</div>
    </div>`;

  // "Tipo" (variedad/color de grano) — si no está capturado, se muestra una
  // etiqueta explícita en vez de un guion, para distinguir "sin dato" de
  // un valor real.
  const campoTipo = (icon:string, label:string, valor:string|null) => `
    <div style="min-width:0;">
      <div style="display:flex;align-items:center;gap:3px;color:rgba(60,60,67,0.6);margin-bottom:2px;">
        <span style="display:inline-flex;flex-shrink:0;">${icon}</span>
        <span style="font-weight:600;text-transform:uppercase;font-size:7.5px;letter-spacing:0.05em;">${label}</span>
      </div>
      ${valor
        ? `<div style="color:#1c1c1e;font-weight:600;font-size:11px;overflow-wrap:anywhere;">${valor}</div>`
        : `<span style="display:inline-block;color:#a16207;background:rgba(254,249,195,.85);font-size:9px;font-weight:700;border-radius:5px;padding:1.5px 6px;white-space:nowrap;">Sin registrar</span>`
      }
    </div>`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif;width:100%;box-sizing:border-box;user-select:text;-webkit-user-select:text;padding-right:18px;">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(60,60,67,0.1);">
        <div style="width:30px;height:30px;border-radius:9px;background:linear-gradient(150deg, ${color}2e, ${color}12);border:1px solid ${color}40;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 1px 1px rgba(255,255,255,0.5);">
          <div style="width:9px;height:9px;border-radius:50%;background:${color};box-shadow:0 0 0 3px ${color}22;"></div>
        </div>
        <div style="min-width:0;flex:1;overflow-wrap:anywhere;">
          <div style="font-weight:700;font-size:11.5px;color:#1c1c1e;line-height:1.3;letter-spacing:-0.01em;margin-bottom:3px;">${escapeHtml(nombre)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px 5px;">
            ${p.curp?`<span style="display:inline-flex;align-items:center;gap:3px;font-size:8px;font-family:ui-monospace,monospace;color:rgba(60,60,67,0.7);background:rgba(120,120,128,0.12);border-radius:5px;padding:1.5px 5px 1.5px 4px;">${ICONS.id}${escapeHtml(p.curp)}</span>`:''}
            <span style="font-size:8px;font-family:ui-monospace,monospace;color:${color};background:${color}14;border-radius:5px;padding:1.5px 5px;font-weight:700;">UP-${p.up_id}</span>
          </div>
          ${p.up_name?`<div style="font-size:9px;color:rgba(60,60,67,0.55);margin-top:4px;">${escapeHtml(p.up_name)}</div>`:''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px 10px;">
        ${campo(ICONS.ruler, 'Superficie', ha!=null?`${ha.toFixed(2)} ha`:'—')}
        ${campoTipo(ICONS.leaf, 'Cultivo', p.cultivo_principal ? escapeHtml(p.cultivo_principal) : null)}
        ${campoTipo(ICONS.leaf, 'Tipo',    p.tipo_cultivo      ? escapeHtml(p.tipo_cultivo)      : null)}
        ${campo(ICONS.pin,   'Municipio',  escapeHtml(p.municipality_name||'—'))}
        ${campo(ICONS.flag,  'Estado',     escapeHtml(p.state_name||'—'))}
      </div>
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(60,60,67,0.1);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px;">
        <span style="display:inline-flex;align-items:center;gap:3px;font-size:8.5px;color:rgba(60,60,67,0.5);font-weight:500;">${ICONS.calendar}${fecha}</span>
        <span style="display:inline-flex;align-items:center;gap:3px;font-size:7.5px;padding:2.5px 7px 2.5px 6px;border-radius:20px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;background:${estadoBg};color:${estadoColor};backdrop-filter:blur(4px);">
          ${p.estado_validacion==='activo'?ICONS.check:''}${escapeHtml(p.estado_validacion)}
        </span>
      </div>
    </div>
  `;
}

function ModalEliminar({ parcela, onConfirm, onCancel, loading }: {
  parcela:Parcela; onConfirm:()=>void; onCancel:()=>void; loading:boolean;
}) {
  const nombre=[parcela.nombres,parcela.apellido_paterno,parcela.apellido_materno].filter(Boolean).join(' ');
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-red-500"/>
          </div>
          <div>
            <h3 className="text-[15px] font-black text-gray-900">Eliminar parcela</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Esta acción no se puede deshacer</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3.5 mb-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase w-16 flex-shrink-0">Parcela</span>
            <span className="text-[12px] font-bold text-gray-800">{parcela.up_name||`UP-${parcela.up_id}`}</span>
            <span className="text-[9px] font-mono text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 ml-auto">UP-{parcela.up_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase w-16 flex-shrink-0">Productor</span>
            <span className="text-[12px] text-gray-700">{nombre}</span>
          </div>
          {parcela.state_name&&(
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase w-16 flex-shrink-0">Estado</span>
              <span className="text-[12px] text-gray-700">{parcela.state_name}</span>
            </div>
          )}
        </div>
        <p className="text-[12px] text-gray-500 mb-5">Se eliminarán los ciclos y disponibilidades asociados. El productor no será eliminado.</p>
        <div className="flex gap-2">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-[13px] font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading ? <RefreshCw size={13} className="animate-spin"/> : <Trash2 size={13}/>} Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ msg, tipo }: { msg:string; tipo:'ok'|'err' }) {
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl text-[13px] font-bold text-white ${tipo==='ok'?'bg-emerald-600':'bg-red-600'}`}>
      {tipo==='ok'?<CheckCircle2 size={15}/>:<AlertTriangle size={15}/>}{msg}
    </div>
  );
}

export default function ParcelasAdminPage() {
  const [parcelas, setParcelas]   = useState<Parcela[]>([]);
  const [loading, setLoading]     = useState(true);
  const [estados, setEstados]     = useState<string[]>([]);
  const [municipiosMapa, setMunicipiosMapa] = useState<{state_name:string;municipality_name:string}[]>([]);

  const [filtroEstado,    setFiltroEstado]    = useState('');
  const [filtroMunicipio, setFiltroMunicipio] = useState('');
  const [panelOpen,       setPanelOpen]       = useState(true);
  const [activeTab,       setActiveTab]       = useState<'mapa'|'lista'>('mapa');
  const [filtroLista,     setFiltroLista]     = useState('');
  const [parcelaAEliminar, setParcelaAEliminar] = useState<Parcela|null>(null);
  const [eliminando,       setEliminando]       = useState(false);
  const [toast,            setToast]            = useState<{msg:string;tipo:'ok'|'err'}|null>(null);
  const toastTimer = useRef<number|null>(null);

  const mapContainer  = useRef<HTMLDivElement|null>(null);
  const map            = useRef<mapboxgl.Map|null>(null);
  const mapReady        = useRef(false);
  const mapInitialized = useRef(false);
  const popupRef       = useRef<mapboxgl.Popup|null>(null);
  const parcelasPorId  = useRef<globalThis.Map<number,{p:Parcela;nombre:string;color:string}>>(new globalThis.Map());

  function showToast(msg:string, tipo:'ok'|'err') {
    setToast({msg,tipo});
    if(toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current=window.setTimeout(()=>setToast(null),3200);
  }

  const colorPorEstado = useMemo(()=>{
    const m = new globalThis.Map<string,string>();
    [...new Set(parcelas.map(p=>p.state_name||''))].filter(Boolean)
      .forEach((e,i)=>m.set(e,PALETA[i%PALETA.length]));
    return m;
  },[parcelas]);

  const filtradas = useMemo(()=>parcelas.filter(p=>{
    if(filtroEstado    && p.state_name        !==filtroEstado)    return false;
    if(filtroMunicipio && p.municipality_name !==filtroMunicipio) return false;
    return true;
  }),[parcelas,filtroEstado,filtroMunicipio]);

  // Construye los GeoJSON que consume Mapbox (puntos para clustering nativo
  // + polígonos para el contorno real). Mapbox GL renderiza en GPU, así
  // que a diferencia de Leaflet no hace falta recortar manualmente por
  // viewport: el clustering de puntos y el minzoom de la capa de polígonos
  // ya evitan dibujar de más.
  const puntosGeoJSON = useMemo(():GeoJSON.FeatureCollection=>({
    type:'FeatureCollection',
    features: filtradas
      .filter(p=>p.centroid_lat!=null && p.centroid_lng!=null)
      .map(p=>({
        type:'Feature',
        geometry:{ type:'Point', coordinates:[p.centroid_lng,p.centroid_lat] },
        properties:{ up_id:p.up_id, color: colorPorEstado.get(p.state_name||'')||'#2563eb' },
      })),
  }),[filtradas,colorPorEstado]);

  const poligonosGeoJSON = useMemo(():GeoJSON.FeatureCollection=>({
    type:'FeatureCollection',
    features: filtradas
      .filter(p=>p.geom_geojson?.coordinates)
      .map(p=>({
        type:'Feature',
        geometry: p.geom_geojson,
        properties:{ up_id:p.up_id, color: colorPorEstado.get(p.state_name||'')||'#2563eb' },
      })),
  }),[filtradas,colorPorEstado]);

  const filtradasLista = useMemo(()=>{
    if(!filtroLista.trim()) return parcelas;
    const q=filtroLista.toLowerCase();
    return parcelas.filter(p=>{
      const nombre=`${p.nombres} ${p.apellido_paterno} ${p.apellido_materno||''}`.toLowerCase();
      return nombre.includes(q)||(p.curp?.toLowerCase().includes(q))||(p.correo?.toLowerCase().includes(q))||String(p.up_id).includes(q)||(p.up_name?.toLowerCase().includes(q));
    });
  },[parcelas,filtroLista]);

  // Paginación de la tabla — antes se montaban hasta ~9,500 <tr> de golpe.
  const FILAS_POR_PAGINA = 100;
  const [paginaLista, setPaginaLista] = useState(1);
  useEffect(()=>{ setPaginaLista(1); },[filtroLista,parcelas]);
  const totalPaginasLista = Math.max(1, Math.ceil(filtradasLista.length/FILAS_POR_PAGINA));
  const filtradasListaPagina = useMemo(()=>{
    const inicio=(paginaLista-1)*FILAS_POR_PAGINA;
    return filtradasLista.slice(inicio, inicio+FILAS_POR_PAGINA);
  },[filtradasLista,paginaLista]);

  const municipiosDisponibles = useMemo(()=>{
    const base=filtroEstado?municipiosMapa.filter(m=>m.state_name===filtroEstado):municipiosMapa;
    return [...new Set(base.map(m=>m.municipality_name))].sort();
  },[filtroEstado,municipiosMapa]);

  const totalHa    = useMemo(()=>filtradas.reduce((s,p)=>s+(parseFloat(String(p.area_ha_calc??0))||0),0),[filtradas]);
  const prodUnicos = useMemo(()=>new Set(filtradas.map(p=>p.producer_id)).size,[filtradas]);
  const totalHaAll = useMemo(()=>parcelas.reduce((s,p)=>s+(parseFloat(String(p.area_ha_calc??0))||0),0),[parcelas]);
  const prodAll    = useMemo(()=>new Set(parcelas.map(p=>p.producer_id)).size,[parcelas]);

  async function cargar() {
    setLoading(true);
    try {
      const [resP,resF]=await Promise.all([
        fetch(`${BASE}/admin/parcelas`,{headers:HDR()}),
        fetch(`${BASE}/admin/parcelas/filtros`,{headers:HDR()}),
      ]);
      if(resP.ok){const d=await resP.json();setParcelas(d.parcelas||[]);}
      if(resF.ok){const d=await resF.json();setEstados(d.estados||[]);setMunicipiosMapa(d.municipios||[]);}
    } catch{}
    setLoading(false);
  }

  async function eliminarParcela() {
    if(!parcelaAEliminar) return;
    setEliminando(true);
    try {
      const res=await fetch(`${BASE}/admin/parcelas/${parcelaAEliminar.up_id}`,{method:'DELETE',headers:HDR()});
      const data=await res.json();
      if(res.ok){setParcelas(prev=>prev.filter(p=>p.up_id!==parcelaAEliminar.up_id));showToast(data.message||'Parcela eliminada','ok');}
      else showToast(data.error||'Error al eliminar','err');
    } catch{showToast('Error de conexión','err');}
    setEliminando(false);
    setParcelaAEliminar(null);
  }

  useEffect(()=>{cargar();},[]);

  // Índice por up_id para resolver el popup al hacer click, sin depender
  // de closures viejas dentro de los listeners de Mapbox.
  useEffect(()=>{
    const idx = new globalThis.Map<number,{p:Parcela;nombre:string;color:string}>();
    filtradas.forEach(p=>{
      const color = colorPorEstado.get(p.state_name||'')||'#2563eb';
      const nombre = [p.nombres,p.apellido_paterno,p.apellido_materno].filter(Boolean).join(' ');
      idx.set(p.up_id,{p,nombre,color});
    });
    parcelasPorId.current = idx;
  },[filtradas,colorPorEstado]);

  const flyToParcela = useCallback((up_id:number)=>{
    const entry = parcelasPorId.current.get(up_id);
    if(!entry || !map.current) return;
    const coords: [number,number] = [entry.p.centroid_lng, entry.p.centroid_lat];
    // El popup siempre abre arriba del punto (anchor fijo, no se mueve de
    // lado). Se reserva espacio arriba con padding para que nunca se corte
    // contra el borde superior del mapa.
    map.current.easeTo({
      center: coords,
      zoom: Math.max(map.current.getZoom(),15),
      duration: 900,
      padding: { top:230, bottom:30, left:30, right:30 },
    });
    if(popupRef.current) popupRef.current.remove();
    popupRef.current = new mapboxgl.Popup({ closeButton:true, maxWidth:'min(360px, 92vw)', offset:14, anchor:'bottom' })
      .setLngLat(coords)
      .setHTML(buildPopupHTML(entry.p, entry.nombre, entry.color))
      .addTo(map.current);
  },[]);

  const initMap = useCallback(()=>{
    if(mapInitialized.current || !mapContainer.current) return;
    mapInitialized.current = true;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-102.5528, 23.6345],
      zoom: 5,
      attributionControl: false,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass:false }), 'bottom-right');
    map.current.addControl(new mapboxgl.AttributionControl({ compact:true }), 'bottom-left');

    map.current.on('load', ()=>{
      if(!map.current) return;

      map.current.addSource('parcelas-puntos', {
        type:'geojson', data: puntosGeoJSON,
        cluster:true, clusterMaxZoom: ZOOM_MIN_POLIGONOS+1, clusterRadius:60,
      });
      map.current.addSource('parcelas-poligonos', { type:'geojson', data: poligonosGeoJSON });

      // Contorno real de la parcela — solo visible al acercarse
      map.current.addLayer({
        id:'parcelas-fill', type:'fill', source:'parcelas-poligonos',
        minzoom: ZOOM_MIN_POLIGONOS,
        paint:{ 'fill-color':['get','color'], 'fill-opacity':0.28 },
      });
      map.current.addLayer({
        id:'parcelas-outline', type:'line', source:'parcelas-poligonos',
        minzoom: ZOOM_MIN_POLIGONOS,
        paint:{ 'line-color':['get','color'], 'line-width':2, 'line-opacity':0.9 },
      });

      // Clusters
      map.current.addLayer({
        id:'clusters', type:'circle', source:'parcelas-puntos',
        filter:['has','point_count'],
        paint:{
          'circle-color':['step',['get','point_count'],'#60a5fa',50,'#3b82f6',200,'#1d4ed8',1000,'#1e3a8a'],
          'circle-radius':['step',['get','point_count'],16,50,20,200,26,1000,32],
          'circle-stroke-width':2, 'circle-stroke-color':'#ffffff', 'circle-opacity':0.92,
        },
      });
      map.current.addLayer({
        id:'cluster-count', type:'symbol', source:'parcelas-puntos',
        filter:['has','point_count'],
        layout:{ 'text-field':'{point_count_abbreviated}', 'text-font':['DIN Pro Bold','Arial Unicode MS Bold'], 'text-size':12 },
        paint:{ 'text-color':'#ffffff' },
      });

      // Puntos individuales (sin cluster)
      map.current.addLayer({
        id:'unclustered-point', type:'circle', source:'parcelas-puntos',
        filter:['!',['has','point_count']],
        paint:{
          'circle-color':['get','color'],
          'circle-radius':7,
          'circle-stroke-width':2.5, 'circle-stroke-color':'#ffffff', 'circle-opacity':0.95,
        },
      });

      mapReady.current = true;

      // Click en cluster → zoom para expandirlo
      map.current.on('click','clusters', (e)=>{
        const feat = map.current!.queryRenderedFeatures(e.point,{layers:['clusters']})[0];
        if(!feat) return;
        const clusterId = feat.properties?.cluster_id;
        const src = map.current!.getSource('parcelas-puntos') as mapboxgl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId, (err, zoom)=>{
          if(err || zoom==null) return;
          map.current!.easeTo({ center:(feat.geometry as any).coordinates, zoom, duration:600 });
        });
      });

      // Click en punto individual → popup + centrar
      map.current.on('click','unclustered-point', (e)=>{
        const feat = e.features?.[0];
        if(!feat) return;
        flyToParcela(feat.properties?.up_id);
      });

      // Click en el contorno de la parcela → popup + centrar
      map.current.on('click','parcelas-fill', (e)=>{
        const feat = e.features?.[0];
        if(!feat) return;
        flyToParcela(feat.properties?.up_id);
      });

      // Cursor
      ['clusters','unclustered-point','parcelas-fill'].forEach(layer=>{
        map.current!.on('mouseenter',layer,()=>{ map.current!.getCanvas().style.cursor='pointer'; });
        map.current!.on('mouseleave',layer,()=>{ map.current!.getCanvas().style.cursor=''; });
      });
    });
  },[puntosGeoJSON,poligonosGeoJSON,flyToParcela]);

  useEffect(()=>{ initMap(); },[initMap]);

  // Actualiza las fuentes cuando cambian los filtros — sin recrear el mapa.
  useEffect(()=>{
    if(!mapReady.current || !map.current) return;
    const srcPuntos = map.current.getSource('parcelas-puntos') as mapboxgl.GeoJSONSource|undefined;
    const srcPoligonos = map.current.getSource('parcelas-poligonos') as mapboxgl.GeoJSONSource|undefined;
    srcPuntos?.setData(puntosGeoJSON);
    srcPoligonos?.setData(poligonosGeoJSON);
  },[puntosGeoJSON,poligonosGeoJSON]);

  const hayFiltros=!!(filtroEstado||filtroMunicipio);

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] gap-3 overflow-hidden">

      {/* ── TAB BAR (igual que BodegasAdminPage) ── */}
      <div className="bg-[#eef8f2] flex-shrink-0 rounded-b-2xl overflow-hidden border border-[#1A5C38]/30 border-t-0">
        <div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
          <div className="flex items-center gap-1">
            {([
              { key:'mapa',  label:'Mapa',  icon:<MapIcon size={11}/> },
              { key:'lista', label:'Lista', icon:<List size={11}/> },
            ] as const).map(({key,label,icon})=>(
              <button key={key} onClick={()=>setActiveTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                  activeTab===key?'bg-[#1A5C38] text-white shadow-sm':'text-[#1A5C38] hover:bg-[#d4efe1]'
                }`}>
                {icon}{label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!loading&&(
              <span className="text-[10.5px] text-[#1A5C38]/60 font-semibold hidden sm:inline">
                {parcelas.length.toLocaleString('es-MX')} parcelas · {fmtHa(totalHaAll)} ha · {prodAll} productores
              </span>
            )}
            {activeTab==='mapa'&&(
              <button onClick={()=>setPanelOpen(o=>!o)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                  panelOpen
                    ?'bg-[#1A5C38] text-white border-[#1A5C38]'
                    :'text-[#1A5C38] border-[#1A5C38]/30 hover:bg-[#d4efe1]'
                }`}>
                <SlidersHorizontal size={11}/>
                <span className="hidden sm:inline">{panelOpen?'Ocultar':'Filtros'}</span>
                {hayFiltros&&(
                  <span className={`text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center ${panelOpen?'bg-white/30 text-white':'bg-[#1A5C38] text-white'}`}>
                    {[filtroEstado,filtroMunicipio].filter(Boolean).length}
                  </span>
                )}
              </button>
            )}
            <button onClick={cargar} disabled={loading}
              className="p-1.5 rounded-lg text-[#1A5C38] bg-[#d4efe1] hover:bg-[#1A5C38] hover:text-white border border-[#1A5C38]/20 hover:border-transparent transition disabled:opacity-50">
              <RefreshCw size={11} className={loading?'animate-spin':''}/>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          PESTAÑA MAPA
      ══════════════════════════════════ */}
      {activeTab==='mapa'&&(
        <div className="flex-1 flex overflow-hidden rounded-2xl border border-gray-100 shadow-sm bg-white min-h-0">

          {/* Panel lateral */}
          <div className={`${panelOpen?'w-[248px]':'w-0'} flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-hidden transition-all duration-200`}>

            {/* Cabecera panel */}
            <div className="px-3 py-2.5 border-b border-[#eef8f2] bg-[#eef8f2]/60 flex-shrink-0">
              <p className="text-[9.5px] font-black text-[#1A5C38]/60 uppercase tracking-widest mb-2">Filtrar por</p>

              <div className="space-y-2">
                <div className="relative">
                  <select value={filtroEstado} onChange={e=>{setFiltroEstado(e.target.value);setFiltroMunicipio('');}}
                    className="w-full text-[11.5px] border border-[#1A5C38]/20 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#1A5C38]/50 appearance-none pr-7 transition-all text-gray-700">
                    <option value="">Todos los estados</option>
                    {estados.map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                  <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1A5C38]/40 pointer-events-none"/>
                </div>
                <div className="relative">
                  <select value={filtroMunicipio} onChange={e=>setFiltroMunicipio(e.target.value)}
                    className="w-full text-[11.5px] border border-[#1A5C38]/20 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#1A5C38]/50 appearance-none pr-7 transition-all text-gray-700">
                    <option value="">Todos los municipios</option>
                    {municipiosDisponibles.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#1A5C38]/40 pointer-events-none"/>
                </div>
              </div>

              {hayFiltros&&(
                <button onClick={()=>{setFiltroEstado('');setFiltroMunicipio('');}}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-[10.5px] font-bold text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-colors">
                  <X size={10}/> Limpiar filtros
                </button>
              )}
            </div>

            {/* Stats compact */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0 grid grid-cols-3 gap-1.5">
              <div className="text-center bg-blue-50/60 rounded-xl py-2">
                <p className="text-[14px] font-black text-blue-700 leading-none tabular-nums">
                  {filtradas.length>=1000?`${(filtradas.length/1000).toFixed(1)}k`:filtradas.length}
                </p>
                <p className="text-[8px] font-bold text-blue-400 uppercase tracking-wide mt-0.5">Parcelas</p>
              </div>
              <div className="text-center bg-emerald-50/60 rounded-xl py-2">
                <p className="text-[14px] font-black text-emerald-700 leading-none tabular-nums">{fmtHa(totalHa)}</p>
                <p className="text-[8px] font-bold text-emerald-400 uppercase tracking-wide mt-0.5">Ha</p>
              </div>
              <div className="text-center bg-purple-50/60 rounded-xl py-2">
                <p className="text-[14px] font-black text-purple-700 leading-none tabular-nums">{prodUnicos}</p>
                <p className="text-[8px] font-bold text-purple-400 uppercase tracking-wide mt-0.5">Product.</p>
              </div>
            </div>

            {/* Leyenda con scroll propio */}
            {colorPorEstado.size>0&&(
              <div className="flex flex-col flex-1 overflow-hidden">
                <p className="px-3 pt-2.5 pb-1 text-[9px] font-black text-[#1A5C38]/50 uppercase tracking-widest flex-shrink-0">Leyenda por estado</p>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                  {[...colorPorEstado.entries()].map(([estado,color])=>{
                    const count=filtradas.filter(p=>p.state_name===estado).length;
                    const ha=filtradas.filter(p=>p.state_name===estado).reduce((s,p)=>s+(parseFloat(String(p.area_ha_calc??0))||0),0);
                    const activo=filtroEstado===estado;
                    return (
                      <button key={estado} onClick={()=>setFiltroEstado(activo?'':estado)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all text-left ${
                          activo?'bg-[#eef8f2] border border-[#1A5C38]/30':'border border-transparent hover:bg-gray-50'
                        }`}>
                        <svg width="13" height="16" viewBox="0 0 22 26" style={{flexShrink:0,overflow:'visible'}}>
                          <line x1="5" y1="0" x2="5" y2="22" stroke="white" strokeWidth="5" strokeLinecap="round"/>
                          <polygon points="5,0 20,6 5,12" fill="white" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
                          <circle cx="5" cy="22" r="5" fill="white"/>
                          <line x1="5" y1="0" x2="5" y2="22" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
                          <polygon points="5,0 19,6 5,12" fill={color}/>
                          <circle cx="5" cy="22" r="3.5" fill={color}/>
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10.5px] font-bold text-gray-800 truncate leading-tight">{estado}</div>
                          <div className="text-[9px] text-gray-400">{fmtHa(ha)} ha</div>
                        </div>
                        <span className="text-[10px] font-black text-gray-500 flex-shrink-0 tabular-nums">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Área del mapa */}
          <div className="flex-1 relative overflow-hidden">

            {loading&&(
              <div className="absolute inset-0 z-[999] flex items-center justify-center bg-gray-900/20 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl px-6 py-5 flex items-center gap-3">
                  <RefreshCw size={18} className="text-[#1A5C38] animate-spin"/>
                  <p className="text-[13px] font-bold text-gray-700">Cargando parcelas…</p>
                </div>
              </div>
            )}
            {!loading&&filtradas.length===0&&(
              <div className="absolute inset-0 z-[500] flex items-center justify-center pointer-events-none">
                <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl px-7 py-6 text-center">
                  <MapPin size={28} className="text-gray-300 mx-auto mb-2"/>
                  <p className="text-[13px] font-bold text-gray-600">Sin parcelas para los filtros aplicados</p>
                  {hayFiltros&&<p className="text-[11px] text-gray-400 mt-1">Intenta cambiar los filtros</p>}
                </div>
              </div>
            )}
            <div ref={mapContainer} style={{height:'100%',width:'100%'}}/>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          PESTAÑA LISTA
      ══════════════════════════════════ */}
      {activeTab==='lista'&&(
        <div className="flex-1 flex flex-col overflow-hidden gap-3 min-h-0">

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 flex-shrink-0">
            {[
              { icon:<Layers size={14}/>,      bg:'bg-blue-50 text-blue-600',    val:parcelas.length,         label:'Total parcelas', bold:'text-blue-800' },
              { icon:<Sprout size={14}/>,      bg:'bg-emerald-50 text-emerald-600', val:`${fmtHa(totalHaAll)} ha`, label:'Superficie total', bold:'text-emerald-800' },
              { icon:<Users size={14}/>,       bg:'bg-purple-50 text-purple-600',   val:prodAll,               label:'Productores',     bold:'text-purple-800' },
            ].map(({icon,bg,val,label,bold})=>(
              <div key={label} className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>{icon}</div>
                <div>
                  <p className={`text-[17px] font-black leading-none tabular-nums ${bold}`}>{loading?'—':val}</p>
                  <p className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla card */}
          <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">

            {/* Barra superior tabla */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                <input value={filtroLista} onChange={e=>setFiltroLista(e.target.value)}
                  placeholder="Buscar por nombre, CURP, correo o ID de parcela…"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-7 py-1.5 text-[11px] outline-none focus:border-[#1A5C38]/40 focus:bg-white transition"/>
                {filtroLista&&(
                  <button onClick={()=>setFiltroLista('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={11}/></button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 size={11} className="text-[#1A5C38]"/>
                <span className="text-[10.5px] text-gray-400 font-medium">
                  {loading?'…':`${filtradasLista.length.toLocaleString('es-MX')} resultados`}
                </span>
              </div>
            </div>

            {/* Tabla */}
            {loading?(
              <div className="flex-1 flex items-center justify-center gap-2">
                <RefreshCw size={18} className="text-[#1A5C38] animate-spin"/>
                <p className="text-[12px] text-gray-400">Cargando parcelas…</p>
              </div>
            ):filtradasLista.length===0?(
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <MapPin size={28} className="text-gray-300"/>
                <p className="text-[13px] font-bold text-gray-500">Sin resultados</p>
                {filtroLista&&<p className="text-[11px] text-gray-400">Intenta con otra búsqueda</p>}
              </div>
            ):(
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse" style={{fontSize:'11.5px'}}>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50/90 border-b border-gray-100">
                      {['#','ID','Parcela','Productor','CURP','Correo','Estado / Municipio','Ha',''].map(h=>(
                        <th key={h} className="py-2 px-3 text-[9.5px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-4 last:pr-4 last:text-right">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtradasListaPagina.map((p,idx)=>{
                      const nombre=[p.nombres,p.apellido_paterno,p.apellido_materno].filter(Boolean).join(' ');
                      const color=colorPorEstado.get(p.state_name||'')||'#2563eb';
                      const ha=p.area_ha_calc!=null?parseFloat(String(p.area_ha_calc)):null;
                      return (
                        <tr key={p.up_id} className="hover:bg-[#f9fdfb] transition-colors">
                          <td className="py-2 pl-4 pr-2 text-[10px] text-gray-300 font-mono">{(paginaLista-1)*FILAS_POR_PAGINA+idx+1}</td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border"
                              style={{color,background:color+'12',borderColor:color+'30'}}>
                              UP-{p.up_id}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <p className="font-bold text-gray-800 leading-tight whitespace-nowrap">{p.up_name||'—'}</p>
                            {p.ciclo_activo&&<p className="text-[10px] text-gray-400 mt-0.5">{p.ciclo_activo}</p>}
                          </td>
                          <td className="py-2 px-3">
                            <p className="font-semibold text-gray-800 leading-tight whitespace-nowrap">{nombre}</p>
                            <span className={`inline-block text-[8.5px] px-1.5 py-0.5 rounded-full font-bold mt-0.5 border ${
                              p.estado_validacion==='activo'  ?'text-emerald-700 bg-emerald-50 border-emerald-200':
                              p.estado_validacion==='pendiente'?'text-amber-700 bg-amber-50 border-amber-200':
                                                                'text-red-600 bg-red-50 border-red-200'
                            }`}>{p.estado_validacion}</span>
                          </td>
                          <td className="py-2 px-3 hidden md:table-cell">
                            <span className="text-[10px] font-mono text-gray-500">{p.curp||'—'}</span>
                          </td>
                          <td className="py-2 px-3 hidden lg:table-cell">
                            <span className="text-[11px] text-gray-500">{p.correo||'—'}</span>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap hidden sm:table-cell">
                            <p className="font-semibold text-gray-700 text-[11px]">{p.state_name||'—'}</p>
                            <p className="text-[10px] text-gray-400">{p.municipality_name||''}</p>
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap font-semibold text-gray-700 hidden sm:table-cell tabular-nums">
                            {ha!=null?ha.toFixed(1):'—'}
                          </td>
                          <td className="py-2 px-3 pr-4 whitespace-nowrap text-right">
                            <button onClick={()=>setParcelaAEliminar(p)}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition" title="Eliminar parcela">
                              <Trash2 size={12}/>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && filtradasLista.length>FILAS_POR_PAGINA && (
              <div className="flex-shrink-0 px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-gray-400 font-medium">
                  Página {paginaLista} de {totalPaginasLista}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={()=>setPaginaLista(p=>Math.max(1,p-1))} disabled={paginaLista<=1}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                    Anterior
                  </button>
                  <button onClick={()=>setPaginaLista(p=>Math.min(totalPaginasLista,p+1))} disabled={paginaLista>=totalPaginasLista}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition">
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {parcelaAEliminar&&(
        <ModalEliminar parcela={parcelaAEliminar} onConfirm={eliminarParcela} onCancel={()=>setParcelaAEliminar(null)} loading={eliminando}/>
      )}
      {toast&&<Toast msg={toast.msg} tipo={toast.tipo}/>}

      {createPortal(
        <style>{`
          /* Popup "liquid glass" — vidrio translúcido con blur, al estilo iOS/macOS reciente */
          .mapboxgl-popup-content {
            border-radius:16px!important;
            padding:13px!important;
            max-width:100%!important;
            box-sizing:border-box!important;
            background:rgba(255,255,255,0.92)!important;
            -webkit-backdrop-filter:blur(24px) saturate(180%)!important;
            backdrop-filter:blur(24px) saturate(180%)!important;
            box-shadow:
              0 1px 1px rgba(255,255,255,0.6) inset,
              0 20px 45px -12px rgba(0,0,0,.28),
              0 0 0 1px rgba(255,255,255,0.6)!important;
            border:none!important;
          }

          /* Flechita apuntando al punto exacto del mapa — mismo tono que el vidrio */
          .mapboxgl-popup-tip { filter:drop-shadow(0 3px 3px rgba(0,0,0,.12)); }
          .mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip,
          .mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip,
          .mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip { border-top-color:rgba(255,255,255,0.92)!important; }
          .mapboxgl-popup-anchor-top .mapboxgl-popup-tip,
          .mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip,
          .mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip { border-bottom-color:rgba(255,255,255,0.92)!important; }
          .mapboxgl-popup-anchor-left .mapboxgl-popup-tip { border-right-color:rgba(255,255,255,0.92)!important; }
          .mapboxgl-popup-anchor-right .mapboxgl-popup-tip { border-left-color:rgba(255,255,255,0.92)!important; }

          .mapboxgl-popup-close-button {
            font-size:0; width:20px; height:20px; top:10px; right:10px;
            display:flex; align-items:center; justify-content:center;
            border-radius:50%; background:rgba(120,120,128,0.16);
            color:#3c3c43; transition:background .15s ease, transform .15s ease;
          }
          .mapboxgl-popup-close-button::before {
            content:''; width:8px; height:8px;
            background:currentColor;
            -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E") center/contain no-repeat;
            mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E") center/contain no-repeat;
          }
          .mapboxgl-popup-close-button:hover { background:rgba(120,120,128,0.28); transform:scale(1.06); }
          .mapboxgl-popup-close-button:active { transform:scale(0.94); }

          /* Animación de apertura — crece desde el punto de anclaje, como si "brotara" del mapa */
          .mapboxgl-popup { animation:popupPop .32s cubic-bezier(.34,1.56,.64,1); }
          .mapboxgl-popup-anchor-bottom, .mapboxgl-popup-anchor-bottom-left, .mapboxgl-popup-anchor-bottom-right { transform-origin:bottom center; }
          .mapboxgl-popup-anchor-top, .mapboxgl-popup-anchor-top-left, .mapboxgl-popup-anchor-top-right { transform-origin:top center; }
          .mapboxgl-popup-anchor-left { transform-origin:center left; }
          .mapboxgl-popup-anchor-right { transform-origin:center right; }
          @keyframes popupPop {
            0%   { opacity:0; transform:scale(.55); }
            60%  { opacity:1; transform:scale(1.03); }
            100% { opacity:1; transform:scale(1); }
          }
          @media (max-width:420px) {
            .mapboxgl-popup-content { padding:11px!important; }
          }
        `}</style>
      , document.head)}
    </div>
  );
}
