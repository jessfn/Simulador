import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import {
  Search, SlidersHorizontal, X, ChevronDown, MapPin, Layers, RefreshCw,
  Map as MapIcon, List, Trash2, AlertTriangle, CheckCircle2, Sprout,
  Users, BarChart3,
} from 'lucide-react';

const LEAFLET_SELECT = `
  .leaflet-popup-content { user-select:text!important;-webkit-user-select:text!important;cursor:auto!important; }
  .leaflet-popup-content * { user-select:text!important;-webkit-user-select:text!important; }
  .leaflet-container { cursor:crosshair; }
`;

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
}

function parsePoly(geom: any): [number,number][]|null {
  if (!geom?.coordinates) return null;
  const ring: number[][] = geom.type==='MultiPolygon' ? geom.coordinates[0]?.[0] : geom.coordinates[0];
  if (!ring||ring.length<3) return null;
  return ring.map(([ln,la]:number[])=>[la,ln]);
}

function makeFlag(color: string) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="26" viewBox="0 0 22 26" style="overflow:visible;display:block">
    <line x1="5" y1="0" x2="5" y2="22" stroke="white" stroke-width="5" stroke-linecap="round"/>
    <polygon points="5,0 20,6 5,12" fill="white" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="5" cy="22" r="5.5" fill="white"/>
    <line x1="5" y1="0" x2="5" y2="22" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    <polygon points="5,0 19,6 5,12" fill="${color}"/>
    <circle cx="5" cy="22" r="3.5" fill="${color}"/>
  </svg>`;
  return L.divIcon({ html:svg, className:'', iconSize:[22,26], iconAnchor:[5,26], popupAnchor:[2,-28] });
}

function FlyToController({ target }: { target:[number,number]|null }) {
  const map = useMap();
  useEffect(()=>{ if(target) map.flyTo(target,15,{animate:true,duration:1.0}); },[target]);
  return null;
}

// Reporta límites y zoom actuales del mapa para renderizar solo lo visible
// en vez de las ~9,500 parcelas de golpe (lo que trababa el navegador).
function ViewportTracker({ onChange }: { onChange:(bounds:L.LatLngBounds, zoom:number)=>void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(()=>{ onChange(map.getBounds(), map.getZoom()); }, []);
  return null;
}

const MAX_MARCADORES_VISIBLES = 500;
const ZOOM_MIN_POLIGONOS = 10;

function fmtHa(n:number):string {
  if(n>=1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if(n>=10_000)    return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString('es-MX',{maximumFractionDigits:0});
}

function PopupContent({ p, nombre, color }: { p:Parcela; nombre:string; color:string }) {
  const ha = p.area_ha_calc!=null ? parseFloat(String(p.area_ha_calc)) : null;
  return (
    <div style={{fontFamily:'system-ui,sans-serif',padding:'2px 0',minWidth:230,userSelect:'text',WebkitUserSelect:'text'}}>
      <div style={{display:'flex',alignItems:'flex-start',gap:9,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f0f0f0'}}>
        <div style={{width:34,height:34,borderRadius:10,background:color+'18',border:`1.5px solid ${color}50`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:1}}>
          <div style={{width:12,height:12,borderRadius:'50%',background:color}}/>
        </div>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontWeight:800,fontSize:13,color:'#111827',lineHeight:1.25,marginBottom:3}}>{nombre}</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'3px 8px'}}>
            {p.curp&&<span style={{fontSize:9.5,fontFamily:'monospace',color:'#6b7280',background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:4,padding:'1px 5px'}}>{p.curp}</span>}
            <span style={{fontSize:9.5,fontFamily:'monospace',color,background:color+'12',border:`1px solid ${color}30`,borderRadius:4,padding:'1px 5px',fontWeight:700}}>UP-{p.up_id}</span>
          </div>
          <div style={{fontSize:10.5,color:'#9ca3af',marginTop:4}}>{p.up_name||'Sin nombre'}</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px'}}>
        <div><div style={{color:'#9ca3af',fontWeight:700,textTransform:'uppercase',fontSize:9,letterSpacing:'0.06em',marginBottom:2}}>Superficie</div>
          <div style={{color:'#111827',fontWeight:800,fontSize:15}}>{ha!=null?`${ha.toFixed(2)} ha`:'—'}</div></div>
        <div><div style={{color:'#9ca3af',fontWeight:700,textTransform:'uppercase',fontSize:9,letterSpacing:'0.06em',marginBottom:2}}>Cultivo</div>
          <div style={{color:'#374151',fontWeight:600,fontSize:12}}>{p.cultivo_principal||'—'}</div></div>
        <div><div style={{color:'#9ca3af',fontWeight:700,textTransform:'uppercase',fontSize:9,letterSpacing:'0.06em',marginBottom:2}}>Municipio</div>
          <div style={{color:'#374151',fontWeight:600,fontSize:12}}>{p.municipality_name||'—'}</div></div>
        <div><div style={{color:'#9ca3af',fontWeight:700,textTransform:'uppercase',fontSize:9,letterSpacing:'0.06em',marginBottom:2}}>Estado</div>
          <div style={{color:'#374151',fontWeight:600,fontSize:12}}>{p.state_name||'—'}</div></div>
      </div>
      <div style={{marginTop:10,paddingTop:9,borderTop:'1px solid #f0f0f0',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:10,color:'#9ca3af'}}>{p.created_at?new Date(p.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}):'—'}</span>
        <span style={{fontSize:9,padding:'2px 8px',borderRadius:20,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',
          background:p.estado_validacion==='activo'?'#dcfce7':p.estado_validacion==='pendiente'?'#fef9c3':'#fee2e2',
          color:p.estado_validacion==='activo'?'#15803d':p.estado_validacion==='pendiente'?'#a16207':'#b91c1c'}}>
          {p.estado_validacion}
        </span>
      </div>
    </div>
  );
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
  const [flyTarget,       setFlyTarget]       = useState<[number,number]|null>(null);
  const [activeTab,       setActiveTab]       = useState<'mapa'|'lista'>('mapa');
  const [filtroLista,     setFiltroLista]     = useState('');
  const [parcelaAEliminar, setParcelaAEliminar] = useState<Parcela|null>(null);
  const [eliminando,       setEliminando]       = useState(false);
  const [toast,            setToast]            = useState<{msg:string;tipo:'ok'|'err'}|null>(null);
  const toastTimer = useRef<number|null>(null);
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds|null>(null);
  const [mapZoom,   setMapZoom]   = useState(6);
  const onViewportChange = useCallback((bounds:L.LatLngBounds, zoom:number)=>{
    setMapBounds(bounds); setMapZoom(zoom);
  },[]);

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

  // Los marcadores se agrupan en clusters (react-leaflet-cluster), así que
  // TODAS las parcelas se muestran siempre — el clustering se encarga de
  // que sea rápido incluso con miles de puntos.
  //
  // Los polígonos (la forma real de la parcela) sí siguen acotados por
  // viewport + zoom + tope duro, porque dibujar la geometría vectorial
  // completa de miles de parcelas a la vez es costoso y un cluster no
  // aplica a polígonos.
  const poligonosEnViewport = useMemo(()=>{
    if(!mapBounds) return filtradas;
    return filtradas.filter(p=>
      p.centroid_lat!=null && p.centroid_lng!=null &&
      mapBounds.contains([p.centroid_lat,p.centroid_lng])
    );
  },[filtradas,mapBounds]);

  const poligonosVisibles = useMemo(()=>{
    if(poligonosEnViewport.length<=MAX_MARCADORES_VISIBLES) return poligonosEnViewport;
    const paso = Math.ceil(poligonosEnViewport.length/MAX_MARCADORES_VISIBLES);
    return poligonosEnViewport.filter((_,i)=>i%paso===0);
  },[poligonosEnViewport]);

  const hayRecortePoligonos = mapZoom>=ZOOM_MIN_POLIGONOS && poligonosEnViewport.length>poligonosVisibles.length;

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
  useEffect(()=>{
    const el=document.createElement('style');
    el.id='leaflet-text-select';el.textContent=LEAFLET_SELECT;
    document.head.appendChild(el);
    return()=>{document.getElementById('leaflet-text-select')?.remove();};
  },[]);

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
            {hayRecortePoligonos && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-sm shadow-lg rounded-full px-4 py-1.5 text-[11px] font-semibold text-gray-600 border border-gray-100">
                Mostrando el contorno de {poligonosVisibles.length.toLocaleString('es-MX')} de {poligonosEnViewport.length.toLocaleString('es-MX')} parcelas en esta área — acércate para ver el resto
              </div>
            )}
            <MapContainer center={[24.8083,-107.3941]} zoom={6} style={{height:'100%',width:'100%'}} zoomControl preferCanvas>
              <FlyToController target={flyTarget}/>
              <ViewportTracker onChange={onViewportChange}/>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="ESRI"/>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" attribution="" opacity={0.65}/>
              {mapZoom>=ZOOM_MIN_POLIGONOS && poligonosVisibles.map(p=>{
                const pos=parsePoly(p.geom_geojson);
                const color=colorPorEstado.get(p.state_name||'')||'#2563eb';
                if(!pos) return null;
                return <Polygon key={`poly-${p.up_id}`} positions={pos}
                  pathOptions={{color,fillColor:color,fillOpacity:0.28,weight:2,opacity:0.9}}
                  eventHandlers={{click:()=>setFlyTarget([p.centroid_lat,p.centroid_lng])}}/>;
              })}
              {/* Todas las parcelas, agrupadas en clusters — rápido incluso con miles de puntos */}
              <MarkerClusterGroup chunkedLoading maxClusterRadius={60} spiderfyOnMaxZoom disableClusteringAtZoom={ZOOM_MIN_POLIGONOS+2}>
                {filtradas.map(p=>{
                  if(p.centroid_lat==null||p.centroid_lng==null) return null;
                  const color=colorPorEstado.get(p.state_name||'')||'#2563eb';
                  const nombre=[p.nombres,p.apellido_paterno,p.apellido_materno].filter(Boolean).join(' ');
                  return (
                    <Marker key={`flag-${p.up_id}`} position={[p.centroid_lat,p.centroid_lng]}
                      icon={makeFlag(color)} eventHandlers={{click:()=>setFlyTarget([p.centroid_lat,p.centroid_lng])}}>
                      <Popup minWidth={230} maxWidth={300}>
                        <PopupContent p={p} nombre={nombre} color={color}/>
                      </Popup>
                    </Marker>
                  );
                })}
              </MarkerClusterGroup>
            </MapContainer>
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
    </div>
  );
}
