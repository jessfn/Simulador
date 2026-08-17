import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, MapPin, Undo2, Pencil, Trash2, CheckCircle2, Loader2, Footprints,
} from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import NominatimSearch from '../../components/productor/NominatimSearch';
import CoordenadasGPSInput from '../../components/productor/CoordenadasGPSInput';
import DibujarPoligonoUP from '../../components/productor/DibujarPoligonoUP';
import type { DibujarPoligonoHandle, DrawMode } from '../../components/productor/DibujarPoligonoUP';
import ParcelasExistentesLayer from '../../components/productor/ParcelasExistentesLayer';
import SearchPinMarker from '../../components/productor/SearchPinMarker';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function CompletarUbicacionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const upId = searchParams.get('up_id');
  const mapRef = useRef<L.Map>(null);
  const dibujarRef = useRef<DibujarPoligonoHandle>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [poligono, setPoligono] = useState<[number, number][] | null>(null);
  const [areaCalc, setAreaCalc] = useState<number | null>(null);
  const [areaReal, setAreaReal] = useState('');
  const [coincideArea, setCoincideArea] = useState<boolean | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('idle');
  const [pointCount, setPointCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [geoDetectado, setGeoDetectado] = useState<{ estado: string; municipio: string } | null>(null);
  const [detectandoGeo, setDetectandoGeo] = useState(false);
  const [capturandoGPS, setCapturandoGPS] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [searchPin, setSearchPin] = useState<[number, number] | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  // Detecta estado/municipio EXACTOS según dónde quedó marcada la parcela
  const detectarUbicacion = async (lat: number, lng: number) => {
    setDetectandoGeo(true);
    try {
      const r = await fetch(`${BASE}/productor/geo/reverse?lat=${lat}&lng=${lng}`);
      const d = await r.json();
      if (d.estado || d.municipio) setGeoDetectado({ estado: d.estado || '', municipio: d.municipio || '' });
    } catch { /* el backend lo resuelve al guardar */ }
    finally { setDetectandoGeo(false); }
  };

  const [poligonoInicial, setPoligonoInicial] = useState<[number, number][] | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number }>({ lat: 23.6345, lng: -102.5528 });
  const [cargado, setCargado] = useState(false);
  const [tieneExistente, setTieneExistente] = useState(false);
  const [misOtrasUpIds, setMisOtrasUpIds] = useState<number[]>([]);
  const overlapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/mis-ups`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const ups = d.ups ?? (Array.isArray(d) ? d : []);
        const up = upId ? ups.find((u: any) => String(u.up_id) === String(upId)) : ups[0];
        setMisOtrasUpIds(
          ups.map((u: any) => u.up_id).filter((id: number) => String(id) !== String(upId))
        );
        if (up) {
          const geom = up.geom_geojson;
          if (geom?.coordinates) {
            const ring = geom.type === 'MultiPolygon' ? geom.coordinates[0]?.[0] : geom.coordinates[0];
            if (ring?.length >= 3) {
              // GeoJSON guarda [lng, lat] → convertir a [lat, lng]
              const latlng = (ring as [number, number][]).map(([ln, la]) => [la, ln] as [number, number]);
              setPoligonoInicial(latlng);
              setTieneExistente(true);
            }
          }
          const lat = up.lat ?? up.centroid_lat;
          const lng = up.lng ?? up.centroid_lng;
          if (lat && lng) setCenter({ lat, lng });
        }
      })
      .catch(() => {})
      .finally(() => setCargado(true));
  }, []);

  const guardar = async () => {
    if (!poligono && !coords) return;
    setLoading(true);
    setErrorGuardar(null);
    try {
      const token = localStorage.getItem('simac_token');
      const centroide = coords || center;
      const areaRealNum = coincideArea === false && areaReal ? Number(areaReal) : areaCalc;
      const res = await fetch(`${BASE}/productor/ubicacion`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          up_id: upId || undefined,
          lat: centroide.lat, lng: centroide.lng,
          poligono: poligono || null,
          area_calc_ha: areaCalc || null,
          area_real_ha: areaRealNum,
          coincide_area: coincideArea ?? true,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorGuardar(d.error || 'No se pudo guardar la parcela. Intenta de nuevo.');
        return;
      }
      localStorage.removeItem('dismiss_ubicacion');
      navigate('/productor/perfil');
    } catch {
      setErrorGuardar('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const puntosNecesarios = Math.max(0, 3 - pointCount);
  const puedeTerminar = pointCount >= 3;
  const dibujando = drawMode === 'drawing' || (drawMode === 'idle' && !poligono);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#0c2e1a] z-[2000]"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-black/50 backdrop-blur-md border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className="text-green-300/80 flex-shrink-0" />
            {drawMode === 'idle' && !poligono && (
              <p className="text-white font-bold text-sm leading-tight truncate">
                {tieneExistente ? 'Actualizar parcela' : 'Marca tu parcela'}
              </p>
            )}
            {drawMode === 'drawing' && (
              <p className="text-green-300 font-bold text-sm leading-tight">
                {pointCount} punto{pointCount !== 1 ? 's' : ''} · {puedeTerminar ? 'puedes finalizar' : `faltan ${puntosNecesarios}`}
              </p>
            )}
            {drawMode === 'idle' && poligono && (
              <p className="text-white font-bold text-sm leading-tight">Parcela lista · {areaCalc} ha</p>
            )}
            {drawMode === 'editing' && (
              <p className="text-amber-300 font-bold text-sm leading-tight">Editando parcela</p>
            )}
          </div>
          <p className="text-white/45 text-xs truncate">
            {drawMode === 'editing' ? 'Arrastra los puntos para ajustar'
              : poligono ? 'Revisa el área y guarda'
              : 'Toca cada esquina en el mapa (o usa la mira y el botón)'}
          </p>
        </div>
      </div>

      {/* Mapa */}
      <div className="flex-1 relative min-h-0">
        {/* Aviso de traslape con otra parcela */}
        {overlapWarning && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[700] pointer-events-none w-[calc(100%-1.5rem)] max-w-sm">
            <div className="bg-red-900/90 backdrop-blur-md rounded-2xl px-4 py-2.5 flex items-start gap-2 shadow-lg">
              <MapPin size={14} className="text-red-300 flex-shrink-0 mt-0.5" />
              <p className="text-white/95 text-xs font-medium leading-snug">{overlapWarning}</p>
            </div>
          </div>
        )}

        {/* Hint de edición */}
        {!overlapWarning && drawMode === 'editing' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[700] pointer-events-none w-[calc(100%-1.5rem)] max-w-sm">
            <div className="bg-amber-900/85 backdrop-blur-md rounded-full px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
              <Pencil size={13} className="text-amber-300 flex-shrink-0" />
              <p className="text-white/95 text-xs font-medium">Arrastra los puntos para ajustar</p>
            </div>
          </div>
        )}

        {cargado && (
          <MapContainer
            ref={mapRef}
            center={[center.lat, center.lng]}
            zoom={tieneExistente ? 15 : 5}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              opacity={0.6}
            />
            <ParcelasExistentesLayer excluirUpIds={upId ? [parseInt(upId)] : []} />
            <DibujarPoligonoUP
              ref={dibujarRef}
              poligonoInicial={poligonoInicial ?? undefined}
              excluirUpIds={upId ? [parseInt(upId)] : []}
              misUpIds={misOtrasUpIds}
              onPoligonoCompleto={(c, centroide, ha) => {
                setOverlapWarning(null);
                setPoligono(c);
                setCoords(centroide);
                setAreaCalc(ha);
                setCoincideArea(null);
                setAreaReal('');
                detectarUbicacion(centroide.lat, centroide.lng);
              }}
              onPoligonoEliminado={() => {
                setOverlapWarning(null);
                setPoligono(null);
                setAreaCalc(null);
                setCoincideArea(null);
                setAreaReal('');
                setGeoDetectado(null);
              }}
              onOverlap={({ pctOverlap, esPropia }) => {
                setOverlapWarning(
                  esPropia
                    ? 'No puedes dibujar esta parcela encima de otra parcela tuya. Ajusta el contorno.'
                    : `Esta parcela se encima con una ya registrada por otro productor (${Math.round(pctOverlap * 100)}% de traslape). Ajusta el contorno.`
                );
                if (overlapTimerRef.current) clearTimeout(overlapTimerRef.current);
                overlapTimerRef.current = setTimeout(() => setOverlapWarning(null), 2500);
              }}
              onModeChange={mode => { setDrawMode(mode); if (mode !== 'idle') setOverlapWarning(null); }}
              onPointCountChange={n => { setPointCount(n); if (n > 0) setSearchPin(null); }}
            />
            {/* Pin de búsqueda — desaparece al empezar a dibujar */}
            {searchPin && !poligono && <SearchPinMarker position={searchPin} />}
          </MapContainer>
        )}

        {/* Buscador — arriba centrado */}
        {dibujando && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-[1000]"
            onClick={e => e.stopPropagation()}
          >
            <NominatimSearch
              placeholder="Buscar ejido, localidad..."
              onSelect={(lat, lng) => {
                mapRef.current?.flyTo([lat, lng], 17);
                setSearchPin([lat, lng]);
              }}
            />
          </div>
        )}

        {/* Zoom manual */}
        <div className="absolute right-3 bottom-3 z-[1000] flex flex-col gap-2">
          <button onClick={() => mapRef.current?.zoomIn()}
            className="w-11 h-11 bg-black/60 backdrop-blur-md rounded-xl text-white text-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform">+</button>
          <button onClick={() => mapRef.current?.zoomOut()}
            className="w-11 h-11 bg-black/60 backdrop-blur-md rounded-xl text-white text-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-transform">−</button>
        </div>
      </div>

      {/* Footer contextual */}
      <div className="flex-shrink-0 bg-black/65 backdrop-blur-md border-t border-white/10 px-4 pt-3 pb-3">

        {/* Dibujando */}
        {dibujando && (
          <div className="max-w-md mx-auto space-y-2.5">
            <p className="text-center text-white/55 text-xs px-2">
              {pointCount === 0
                ? 'Toca el mapa en cada esquina de tu parcela para marcarla.'
                : 'Toca la siguiente esquina. Cuando termines, pulsa Finalizar.'}
            </p>
            <div onClick={e => e.stopPropagation()}>
              <CoordenadasGPSInput
                onSelect={(lat, lng) => { mapRef.current?.flyTo([lat, lng], 17); setSearchPin([lat, lng]); }}
                theme="dark"
                className="w-full justify-center rounded-xl px-4 py-3"
              />
            </div>
            <button
              onClick={() => {
                setCapturandoGPS(true); setGpsMsg(null);
                dibujarRef.current?.addPointGPS((info) => {
                  setCapturandoGPS(false);
                  if (!info.ok) setGpsMsg(info.error);
                  else if (info.accuracy > 30) setGpsMsg(`Punto registrado, señal GPS débil (±${Math.round(info.accuracy)} m).`);
                  else setGpsMsg(`Punto registrado (±${Math.round(info.accuracy)} m).`);
                });
              }}
              disabled={capturandoGPS}
              className="w-full bg-white/10 ring-1 ring-white/20 text-white py-3.5 rounded-2xl text-sm font-semibold
                         flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {capturandoGPS
                ? (<><Loader2 size={16} className="animate-spin" /> Obteniendo ubicación…</>)
                : (<><Footprints size={16} /> Estoy en este punto — registrar GPS</>)}
            </button>
            {gpsMsg && (
              <p className="text-center text-[11px] text-white/70 bg-white/5 rounded-lg px-3 py-2">{gpsMsg}</p>
            )}
            {pointCount > 0 && (
              <div className="flex gap-2">
                <button onClick={() => dibujarRef.current?.undoVertex()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 ring-1 ring-white/15 text-white/80 py-3 rounded-xl text-sm font-semibold active:scale-[0.97] transition-all">
                  <Undo2 size={16} /> Deshacer
                </button>
                <button onClick={() => dibujarRef.current?.finishDraw()} disabled={!puedeTerminar}
                  className="flex-[1.4] flex items-center justify-center gap-1.5 bg-white text-[#1A5C38] py-3 rounded-xl text-sm font-bold disabled:opacity-30 active:scale-[0.97] transition-all">
                  <CheckCircle2 size={17} />
                  {puedeTerminar ? `Finalizar (${pointCount})` : `Faltan ${puntosNecesarios}`}
                </button>
              </div>
            )}
            {pointCount === 0 && (
              <button onClick={() => navigate(-1)}
                className="w-full text-white/40 text-sm py-2 text-center hover:text-white/60 transition-colors">
                Ahora no
              </button>
            )}
          </div>
        )}

        {/* Polígono listo (dibujado o precargado) */}
        {drawMode === 'idle' && poligono && (
          <div className="max-w-md mx-auto space-y-3">
            {(detectandoGeo || geoDetectado) && (
              <div className="bg-white/10 ring-1 ring-white/15 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                <MapPin size={15} className="text-green-300 flex-shrink-0" />
                {detectandoGeo ? (
                  <p className="text-white/70 text-xs">Detectando estado y municipio…</p>
                ) : (
                  <p className="text-white/90 text-xs leading-tight">
                    <span className="text-white/50">Ubicación detectada: </span>
                    <span className="font-semibold">{geoDetectado?.municipio}</span>
                    {geoDetectado?.municipio && geoDetectado?.estado ? ', ' : ''}
                    <span className="font-semibold">{geoDetectado?.estado}</span>
                  </p>
                )}
              </div>
            )}
            {coincideArea === false ? (
              <div>
                <label className="block text-xs text-white/50 font-medium mb-2">¿Cuántas hectáreas tiene tu parcela?</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="0.1" max="5000" step="0.1" value={areaReal}
                    onChange={e => setAreaReal(e.target.value)} placeholder={String(areaCalc ?? '0.0')} inputMode="decimal"
                    className="flex-1 bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3.5 text-xl font-bold text-white text-center focus:ring-2 focus:ring-white/40 focus:outline-none" />
                  <span className="text-white/50 font-bold text-lg">ha</span>
                </div>
              </div>
            ) : (
              <div className="bg-green-500/12 ring-1 ring-green-400/25 rounded-2xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-white/70">Área calculada</span>
                <span className="text-green-300 font-bold text-lg">{areaCalc} ha</span>
              </div>
            )}

            {errorGuardar && (
              <div className="bg-red-500/15 ring-1 ring-red-400/25 rounded-xl px-3.5 py-2.5 text-red-200 text-xs font-medium">
                {errorGuardar}
              </div>
            )}

            <button onClick={guardar} disabled={loading}
              className="w-full bg-white text-[#1A5C38] py-4 rounded-2xl text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Guardando...</> : 'Guardar ubicación'}
            </button>

            <div className="flex gap-2">
              <button onClick={() => dibujarRef.current?.startEdit()}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 ring-1 ring-white/15 text-white/80 py-3 rounded-xl text-sm font-medium active:scale-[0.97] transition-all">
                <Pencil size={14} /> Ajustar forma
              </button>
              <button onClick={() => { setCoincideArea(coincideArea === false ? null : false); }}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 ring-1 ring-white/15 text-white/80 py-3 rounded-xl text-sm font-medium active:scale-[0.97] transition-all">
                Corregir área
              </button>
              <button onClick={() => dibujarRef.current?.clear()}
                className="flex-1 flex items-center justify-center gap-1.5 text-red-400/70 py-3 rounded-xl text-sm font-medium hover:text-red-400 active:scale-[0.97] transition-all">
                <Trash2 size={14} /> Redibujar
              </button>
            </div>
          </div>
        )}

        {/* Editando */}
        {drawMode === 'editing' && (
          <div className="max-w-md mx-auto flex gap-2.5">
            <button onClick={() => dibujarRef.current?.cancelEdit()}
              className="flex-1 bg-white/10 ring-1 ring-white/15 text-white/70 py-3.5 rounded-2xl text-sm font-semibold active:scale-[0.97] transition-all">
              Cancelar
            </button>
            <button onClick={() => { dibujarRef.current?.saveEdit(); setCoincideArea(null); }}
              className="flex-1 bg-green-500 text-white py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
              <CheckCircle2 size={17} /> Guardar cambios
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
