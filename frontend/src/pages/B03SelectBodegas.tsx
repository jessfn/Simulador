import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Plus, X, MapPin, CheckCircle, ChevronLeft,
  Warehouse, List, Map as MapIcon, Layers, AlertCircle, ChevronDown
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import { formatNum } from '../utils/format';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapClickHandler({ onCoords }: { onCoords: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onCoords(e.latlng.lat, e.latlng.lng); } });
  return null;
}

interface Bodega { id: number; nombre: string; municipio: string; estado: string; capacidad_ton: number; latitud?: number; longitud?: number; semaforo_compra?: string; }

const iconoVerde = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;background:#1A5C38;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [12, 12] as [number, number], iconAnchor: [6, 6] as [number, number],
});
const iconoVerdeCheck = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;background:#0f3520;border-radius:50%;border:2.5px solid #4ade80;box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center"><span style="color:white;font-size:9px;line-height:1">checkmark</span></div>'.replace('checkmark', '&#10003;'),
  iconSize: [16, 16] as [number, number], iconAnchor: [8, 8] as [number, number],
});

// Fuerza a Leaflet a recalcular su tamaño cuando el contenedor se hace visible
// (al cambiar a la pestaña Mapa). Sin esto el mapa queda gris/invisible.
function InvalidarTamano() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 60);
    const t2 = setTimeout(() => map.invalidateSize(), 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  return null;
}

function MapController({ bounds, flyTo }: { bounds: [number, number][] | null; flyTo: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds || bounds.length === 0) return;
    if (bounds.length === 1) map.flyTo(bounds[0], 12, { animate: true, duration: 0.8 });
    else map.fitBounds(bounds, { padding: [50, 50] });
  }, [bounds, map]);
  useEffect(() => {
    if (!flyTo) return;
    map.flyTo(flyTo, 14, { animate: true, duration: 0.8 });
  }, [flyTo, map]);
  return null;
}

export default function B03SelectBodegas() {
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState('');
  const [results, setResults] = useState<Bodega[]>([]);
  const [selected, setSelected] = useState<Bodega[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [states, setStates] = useState<any[]>([]);
  const [municipios, setMunicipios] = useState<any[]>([]);
  const [municipio, setMunicipio] = useState('');
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [altaForm, setAltaForm] = useState({ nombre: '', estado: '', municipio: '', localidad: '', capacidad_ton: '', responsable: '', telefono: '', email: '' });
  const [altaEstados, setAltaEstados] = useState<any[]>([]);
  const [altaMunicipios, setAltaMunicipios] = useState<any[]>([]);
  const [enviandoAlta, setEnviandoAlta] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista');
  const [stats, setStats] = useState<{ total_bodegas: number; total_capacidad_ton: number } | null>(null);
  const [mapBounds, setMapBounds] = useState<[number, number][] | null>(null);
  const [flyToCoords, setFlyToCoords] = useState<[number, number] | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  async function search(q = query, est = estado, mun = municipio) {
    setLoading(true);
    try {
      const res = await api.bodegas.list({ q, estado: est, municipio: mun });
      setResults((res.bodegas || res).slice(0, 30));
    } catch { } finally { setLoading(false); }
  }

  useEffect(() => {
    api.auth.states().then((r: any) => { setStates(r.states || r); setAltaEstados(r.states || r); }).catch(() => {});
    search('', '', '');
  }, []);

  useEffect(() => {
    if (estado) {
      const st = states.find((s: any) => s.name === estado);
      if (st) api.auth.municipalities(st.state_id).then((r: any) => setMunicipios(r.municipalities || [])).catch(() => {});
    } else { setMunicipios([]); setMunicipio(''); }
  }, [estado, states]);

  useEffect(() => {
    if (altaForm.estado) {
      const st = altaEstados.find((s: any) => s.name === altaForm.estado || String(s.state_id) === altaForm.estado);
      if (st) api.auth.municipalities(st.state_id).then((r: any) => setAltaMunicipios(r.municipalities || [])).catch(() => {});
    } else { setAltaMunicipios([]); }
  }, [altaForm.estado, altaEstados]);

  useEffect(() => {
    const t = setTimeout(() => search(query, estado, municipio), 400);
    return () => clearTimeout(t);
  }, [query, estado, municipio]);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE_URL}/bodegas/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setStats).catch(() => {});

      
  }, []);

  useEffect(() => {
    if (vista !== 'mapa') return;
    const withCoords = results.filter(b => b.latitud && b.longitud && Math.abs(b.latitud) > 0.001);
    setMapBounds(withCoords.length > 0 ? withCoords.map(b => [b.latitud!, b.longitud!]) : null);
  }, [results, vista]);

  function toggle(b: Bodega) {
    setSelected(s => s.some(x => x.id === b.id) ? s.filter(x => x.id !== b.id) : [...s, b]);
  }

  async function continuar() {
    if (selected.length === 0) return;
    setSaving(true); setError('');
    const failed: string[] = [];
    for (const b of selected) {
      try { await api.bodeguero.solicitar(b.id); }
      catch (err: any) { failed.push(`${b.nombre}: ${err.message}`); }
    }
    setSaving(false);
    if (failed.length > 0) { setError(failed.join('\n')); return; }
    navigate('/maiz/bodega/mis-bodegas');
  }

  return (
    /*
      h-full + flex flex-col = ocupa exactamente el alto del <main> (que es el scroll container)
      El scroll de página NUNCA ocurre. Solo el recuadro de resultados hace scroll interno.
    */
    <div className="fixed inset-0 flex flex-col bg-[#eef8f2] overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ══ BANNER VERDE — sticky, nunca scrollea, rounded-b-3xl ══ */}
      <div className="flex-shrink-0 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.22)] relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 pt-3 pb-3.5 relative z-10">

          {/* Fila 1: Volver — independiente, pequeño, arriba a la izq */}
          <button
            onClick={() => navigate('/maiz/bodega/login')}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-2 active:opacity-60 hover:text-green-100 transition-opacity"
          >
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" />
            Volver
          </button>

          {/* Fila 2: Título + subtítulo alineados solos */}
          <div className="mb-3">
            <h1 className="text-[21px] sm:text-[23px] font-bold text-white leading-tight drop-shadow-sm">
              Selecciona tus bodegas
            </h1>
            <p className="text-green-100/70 text-[12px] mt-0.5 font-medium">
              {stats
                ? `${stats.total_bodegas.toLocaleString('es-MX')} bodegas en el catálogo nacional`
                : 'Busca en el catálogo nacional'}
            </p>
          </div>

          {/* Toggle Lista / Mapa */}
          <div className="flex items-center w-full bg-white/10 backdrop-blur-sm rounded-xl p-0.5 mb-2">
            <button
              onClick={() => setVista('lista')}
              className={'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-[12.5px] font-bold transition-all duration-300 ' + (vista === 'lista' ? 'bg-white text-[#1A5C38] shadow-sm' : 'text-white/75 hover:text-white hover:bg-white/10')}
            >
              <List size={13} /> Lista
            </button>
            <button
              onClick={() => setVista('mapa')}
              className={'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-[12.5px] font-bold transition-all duration-300 ' + (vista === 'mapa' ? 'bg-white text-[#1A5C38] shadow-sm' : 'text-white/75 hover:text-white hover:bg-white/10')}
            >
              <MapIcon size={13} /> Mapa
            </button>
          </div>

          {/* Toolbar de filtros — apilado en móvil, una sola fila en desktop */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
            {/* Buscador */}
            <div className={'sm:flex-1 flex items-center gap-2 bg-white/15 backdrop-blur-md rounded-xl px-3 py-1.5 border transition-all duration-300 ' + (searchFocused ? 'border-white/50 bg-white/20 shadow-[0_0_0_3px_rgba(255,255,255,0.08)]' : 'border-white/10')}>
              <Search size={14} className={'flex-shrink-0 transition-colors duration-300 ' + (searchFocused ? 'text-white' : 'text-white/55')} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Buscar bodega, municipio..."
                className="flex-1 bg-transparent text-white placeholder-white/40 text-[12.5px] font-medium outline-none min-w-0"
              />
              {query && (
                <button onClick={() => setQuery('')} className="flex-shrink-0 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center active:opacity-70 hover:bg-white/30">
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>

            {/* Estado + Municipio */}
            <div className="grid grid-cols-2 sm:flex gap-1.5">
              {/* Estado */}
              <div className={'relative flex items-center sm:w-40 backdrop-blur-md rounded-xl border transition-all duration-300 ' + (estado ? 'border-white/40 bg-white/20' : 'bg-white/15 border-white/10')}>
                <MapPin size={13} className="absolute left-2.5 text-white/70 pointer-events-none flex-shrink-0" />
                <select
                  value={estado}
                  onChange={e => { setEstado(e.target.value); setMunicipio(''); }}
                  className="w-full bg-transparent text-white text-[12px] font-semibold rounded-xl pl-8 pr-7 py-1.5 outline-none cursor-pointer truncate"
                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                >
                  <option value="" className="text-gray-900 bg-white">Todos los estados</option>
                  {states.map((s: any) => <option key={s.state_id} value={s.name} className="text-gray-900 bg-white">{s.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 text-white/70 pointer-events-none" />
              </div>

              {/* Municipio */}
              <div className={'relative flex items-center sm:w-40 backdrop-blur-md rounded-xl border transition-all duration-300 ' + (!estado ? 'bg-white/[0.06] border-white/5 opacity-50' : municipio ? 'bg-white/20 border-white/40' : 'bg-white/15 border-white/10')}>
                <select
                  value={municipio}
                  onChange={e => setMunicipio(e.target.value)}
                  disabled={!estado || municipios.length === 0}
                  className="w-full bg-transparent text-white text-[12px] font-semibold rounded-xl pl-3 pr-7 py-1.5 outline-none cursor-pointer truncate disabled:cursor-not-allowed"
                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                >
                  <option value="" className="text-gray-900 bg-white">{estado ? 'Todos los municipios' : 'Municipio'}</option>
                  {municipios.map((m: any) => <option key={m.municipality_id} value={m.name} className="text-gray-900 bg-white">{m.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 text-white/70 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Chips de filtros activos — claros y con "quitar" */}
          {(estado || municipio) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {estado && (
                <span className="inline-flex items-center gap-1 bg-white text-[#1A5C38] text-[11px] font-bold rounded-full pl-2.5 pr-1.5 py-1 shadow-sm">
                  {estado}
                  <button onClick={() => { setEstado(''); setMunicipio(''); }} className="w-4 h-4 rounded-full bg-[#1A5C38]/10 flex items-center justify-center active:bg-[#1A5C38]/20">
                    <X size={9} className="text-[#1A5C38]" />
                  </button>
                </span>
              )}
              {municipio && (
                <span className="inline-flex items-center gap-1 bg-white/90 text-[#1A5C38] text-[11px] font-bold rounded-full pl-2.5 pr-1.5 py-1 shadow-sm">
                  {municipio}
                  <button onClick={() => setMunicipio('')} className="w-4 h-4 rounded-full bg-[#1A5C38]/10 flex items-center justify-center active:bg-[#1A5C38]/20">
                    <X size={9} className="text-[#1A5C38]" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ ZONA MEDIA — flex-1, NO scrollea la página ══ */}
      <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 pt-3 gap-2.5 max-w-2xl mx-auto w-full">

        {/* KPIs mini */}
        {stats && (
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-black/[0.04] p-3 flex items-center gap-2.5 shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-[#1A5C38]/10 flex items-center justify-center flex-shrink-0">
                <Warehouse size={15} className="text-[#1A5C38]" />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-black text-[#1A5C38] leading-tight">{stats.total_bodegas.toLocaleString('es-MX')}</p>
                <p className="text-[10px] text-gray-400 font-medium leading-tight">Bodegas en catálogo</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-black/[0.04] p-3 flex items-center gap-2.5 shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Layers size={15} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-black text-blue-700 leading-tight">{formatNum(stats.total_capacidad_ton)} ton</p>
                <p className="text-[10px] text-gray-400 font-medium leading-tight">Capacidad total</p>
              </div>
            </div>
          </div>
        )}

        {/* Chips seleccionadas — fijas, no en el scroll */}
        {selected.length > 0 && (
          <div className="flex-shrink-0 bg-[#1A5C38]/[0.07] border border-[#1A5C38]/20 rounded-2xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-bold text-[#1A5C38] uppercase tracking-wide">{selected.length} seleccionada{selected.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setSelected([])} className="text-[11px] text-gray-400 active:text-red-500 transition-colors">Limpiar</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selected.map(b => (
                <span key={b.id} className="bg-white border border-[#1A5C38]/25 text-[#1A5C38] text-[11px] font-semibold rounded-full px-2.5 py-1 flex items-center gap-1.5">
                  {b.nombre.length > 18 ? b.nombre.slice(0, 18) + '…' : b.nombre}
                  <button onClick={() => toggle(b)} className="text-[#1A5C38]/50 active:text-red-500"><X size={10} /></button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/*
          ══ RECUADRO DE RESULTADOS ══
          flex-1 min-h-0 = ocupa el espacio restante exacto sin desbordarse
          overflow-y-auto = scroll SOLO aquí adentro, la página NO scrollea
        */}
        <div className="flex-1 min-h-0 bg-white rounded-2xl border border-black/[0.04] shadow-sm overflow-hidden flex flex-col">

          {/* Vista Lista — scroll interno */}
          {vista === 'lista' && (
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {loading && (
                <div className="p-4 space-y-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-[60px] bg-[#eef8f2] rounded-xl animate-pulse" />)}
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4 gap-2">
                  <MapPin size={30} className="text-gray-200" />
                  <p className="text-[14px] font-medium text-gray-400">Sin resultados</p>
                  <p className="text-[12px] text-gray-300 text-center">Prueba con otro nombre, estado o municipio</p>
                </div>
              )}
              {results.map(b => {
                const isSelected = selected.some(x => x.id === b.id);
                return (
                  <div key={b.id} className={'flex items-center gap-3 px-4 py-3.5 transition-colors ' + (isSelected ? 'bg-[#1A5C38]/[0.04]' : 'hover:bg-[#f4fbf7]/80')}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[14px] text-gray-900 truncate leading-tight">{b.nombre}</p>
                      <p className="text-[12px] text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={10} className="flex-shrink-0" />
                        {b.municipio}, {b.estado}
                        {b.capacidad_ton > 0 && <span className="ml-1 flex-shrink-0">· {formatNum(b.capacidad_ton)} ton</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => toggle(b)}
                      className={'w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ' + (isSelected ? 'bg-[#1A5C38] text-white shadow-md' : 'bg-[#eef8f2] text-gray-500')}
                    >
                      {isSelected ? <CheckCircle size={16} /> : <Plus size={16} />}
                    </button>
                  </div>
                );
              })}

            </div>
          )}

          {/* Vista Mapa */}
          {vista === 'mapa' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {!loading && results.filter(b => b.latitud && b.longitud && Math.abs(b.latitud) > 0.001).length === 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex-shrink-0">
                  <AlertCircle size={13} className="text-amber-500 flex-shrink-0" />
                  <p className="text-[12px] text-amber-700">Las bodegas filtradas no tienen coordenadas registradas</p>
                </div>
              )}
              <div className="flex-1 min-h-0">
                <MapContainer center={[23.6345, -102.5528]} zoom={5} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution="© CartoDB" />
                  <InvalidarTamano />
                  <MapController bounds={mapBounds} flyTo={flyToCoords} />
                  {results.filter(b => b.latitud && b.longitud && Math.abs(b.latitud) > 0.001).map(b => (
                    <Marker key={b.id} position={[b.latitud!, b.longitud!]} icon={selected.some(s => s.id === b.id) ? iconoVerdeCheck : iconoVerde} eventHandlers={{ click: () => setFlyToCoords([b.latitud!, b.longitud!]) }}>
                      <Popup>
                        <div style={{ minWidth: 186 }}>
                          <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 3px' }}>{b.nombre}</p>
                          <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px' }}>{b.municipio}, {b.estado}</p>
                          {b.capacidad_ton > 0 && <p style={{ fontSize: 11, color: '#374151', margin: '0 0 4px' }}>Capacidad: {formatNum(b.capacidad_ton)} ton</p>}
                          {selected.some(s => s.id === b.id) ? (
                            <p style={{ fontSize: 12, color: '#1A5C38', fontWeight: 600, margin: 0 }}>checkmark Ya agregada</p>
                          ) : (
                            <button onClick={() => toggle(b)} style={{ width: '100%', background: '#1A5C38', color: 'white', fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', marginTop: 6 }}>+ Agregar</button>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          )}
        </div>

        {/* ══ Solicitar alta — barra SIEMPRE visible (fuera del scroll) ══ */}
        <button
          onClick={() => setMostrarAlta(true)}
          className="flex-shrink-0 w-full flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-green-50 border border-[#1A5C38]/20 rounded-2xl pl-3 pr-3.5 py-2.5 shadow-sm active:scale-[0.99] hover:border-[#1A5C38]/40 transition-all"
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#1A5C38]/10 flex items-center justify-center flex-shrink-0">
              <Warehouse size={16} className="text-[#1A5C38]" />
            </span>
            <span className="text-left min-w-0">
              <span className="block text-[12.5px] font-bold text-gray-800 leading-tight truncate">¿No encuentras tu bodega?</span>
              <span className="block text-[11.5px] text-[#1A5C38] font-semibold leading-tight">Solicitar alta de bodega nueva</span>
            </span>
          </span>
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#1A5C38] flex-shrink-0">
            <Plus size={15} className="text-white" />
          </span>
        </button>

        {/* Continuar sin asociar */}
        <button onClick={() => navigate('/maiz/bodega/dashboard')} className="flex-shrink-0 w-full text-[13px] text-gray-400 font-medium py-1 active:opacity-70 transition-opacity">
          Continuar sin asociar bodega por ahora
        </button>
      </div>

      {/* ══ BARRA INFERIOR FIJA — siempre visible, respeta el espacio ══ */}
      <div className="flex-shrink-0 w-full bg-white/95 backdrop-blur-md border-t border-gray-200/60 px-4 py-3">
        <div className="max-w-2xl mx-auto w-full">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
              <p className="text-[12px] text-red-600 whitespace-pre-line">{error}</p>
            </div>
          )}
          <button
            onClick={continuar}
            disabled={selected.length === 0 || saving}
            className="w-full bg-[#1A5C38] text-white rounded-2xl py-3.5 text-[16px] font-semibold active:opacity-80 transition-opacity disabled:opacity-35 shadow-lg"
          >
            {saving ? 'Guardando…' : `Asociar ${selected.length} bodega${selected.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* ══ MODAL SOLICITAR ALTA ══ */}
      {mostrarAlta && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
              <p className="text-[16px] font-bold text-[#1A5C38]">Solicitar alta de bodega</p>
              <button onClick={() => setMostrarAlta(false)} className="w-8 h-8 rounded-full bg-[#eef8f2] flex items-center justify-center text-gray-500 active:bg-gray-200">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[12px] text-gray-400">Un administrador revisará y aprobará tu solicitud.</p>
              {[{ k: 'nombre', label: 'Nombre de la bodega *', type: 'text' }].map(({ k, label, type }) => (
                <div key={k}>
                  <label className="block text-[13px] font-medium text-gray-600 mb-1">{label}</label>
                  <input type={type} value={(altaForm as any)[k]} onChange={e => setAltaForm(f => ({ ...f, [k]: e.target.value }))} className="w-full bg-[#eef8f2] rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0" />
                </div>
              ))}
              <div>
                <label className="block text-[13px] font-medium text-gray-600 mb-1">Estado *</label>
                <select value={altaForm.estado} onChange={e => setAltaForm(f => ({ ...f, estado: e.target.value, municipio: '' }))} className="w-full bg-[#eef8f2] rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0">
                  <option value="">Selecciona estado</option>
                  {altaEstados.map((s: any) => <option key={s.state_id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-gray-600 mb-1">Municipio *</label>
                <select value={altaForm.municipio} onChange={e => setAltaForm(f => ({ ...f, municipio: e.target.value }))} className="w-full bg-[#eef8f2] rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0">
                  <option value="">Selecciona municipio</option>
                  {altaMunicipios.map((m: any) => <option key={m.municipality_id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              {[{ k: 'localidad', label: 'Localidad', type: 'text' }, { k: 'capacidad_ton', label: 'Capacidad total (ton) *', type: 'number' }, { k: 'responsable', label: 'Nombre del responsable *', type: 'text' }, { k: 'telefono', label: 'Teléfono *', type: 'tel' }, { k: 'email', label: 'Correo electrónico', type: 'email' }].map(({ k, label, type }) => (
                <div key={k}>
                  <label className="block text-[13px] font-medium text-gray-600 mb-1">{label}</label>
                  <input type={type} value={(altaForm as any)[k]} onChange={e => setAltaForm(f => ({ ...f, [k]: e.target.value }))} className="w-full bg-[#eef8f2] rounded-xl px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0" />
                </div>
              ))}
              <div>
                <label className="block text-[13px] font-medium text-gray-600 mb-1">Ubicación en el mapa</label>
                <p className="text-[11px] text-gray-400 mb-2">Toca para marcar la ubicación exacta</p>
                <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 180 }}>
                  <MapContainer center={[23.6345, -102.5528]} zoom={5} style={{ height: '100%', width: '100%' }} attributionControl={false}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution="© CartoDB" />
                    <MapClickHandler onCoords={(lat, lon) => setCoords({ lat, lon })} />
                    {coords && <Marker position={[coords.lat, coords.lon]} />}
                  </MapContainer>
                </div>
                {coords ? <p className="text-[11px] text-green-600 mt-1">✓ {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}</p>
                  : <p className="text-[11px] text-gray-400 mt-1">Sin ubicación — el administrador la completará</p>}
              </div>
              <button
                disabled={enviandoAlta || !altaForm.nombre || !altaForm.estado || !altaForm.municipio || !altaForm.capacidad_ton || !altaForm.responsable || !altaForm.telefono}
                onClick={async () => {
                  setEnviandoAlta(true);
                  try {
                    await api.bodegas.create({ nombre: altaForm.nombre, estado: altaForm.estado, municipio: altaForm.municipio, localidad: altaForm.localidad, capacidad_ton: Number(altaForm.capacidad_ton), latitud: coords?.lat ?? 0, longitud: coords?.lon ?? 0, responsable: altaForm.responsable, telefono: altaForm.telefono, email: altaForm.email, estatus: 'pendiente' });
                    toast('Tu solicitud fue enviada. Te notificaremos cuando sea aprobada.', 'success');
                    setMostrarAlta(false); setCoords(null);
                    setAltaForm({ nombre: '', estado: '', municipio: '', localidad: '', capacidad_ton: '', responsable: '', telefono: '', email: '' });
                  } catch (err: any) { toast(err.message || 'Error al enviar solicitud', 'error'); }
                  finally { setEnviandoAlta(false); }
                }}
                className="w-full bg-[#1A5C38] text-white rounded-2xl py-3.5 text-[14px] font-semibold active:opacity-80 transition-opacity disabled:opacity-40"
              >
                {enviandoAlta ? 'Enviando…' : 'Enviar solicitud de alta'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
