import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ChevronLeft, Undo2, CheckCircle2, Footprints, Loader2,
  AlertTriangle, Ruler, MapPin, Map, Check, Pencil, Route,
} from 'lucide-react';
import DibujarPoligonoUP from '../../components/productor/DibujarPoligonoUP';
import ParcelasExistentesLayer from '../../components/productor/ParcelasExistentesLayer';
import type { DibujarPoligonoHandle, DrawMode } from '../../components/productor/DibujarPoligonoUP';
import NominatimSearch from '../../components/productor/NominatimSearch';
import CoordenadasGPSInput from '../../components/productor/CoordenadasGPSInput';
import SearchPinMarker from '../../components/productor/SearchPinMarker';
import * as turf from '@turf/turf';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function AgregarUPPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('simac_token') || '';
  const dibujarRef = useRef<DibujarPoligonoHandle>(null);
  const mapRef = useRef<any>(null);

  const [nombreUP, setNombreUP] = useState('');
  const [estadoUp, setEstadoUp] = useState('');
  const [municipioUp, setMunicipioUp] = useState('');
  const [estadoId, setEstadoId] = useState('');
  const [estados, setEstados] = useState<{ state_id: string; name: string }[]>([]);
  const [municipios, setMunicipios] = useState<{ municipality_id: string; name: string }[]>([]);

  useEffect(() => {
    fetch(`${BASE}/auth/states`)
      .then(r => r.json())
      .then(d => setEstados(d.states || (Array.isArray(d) ? d : [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!estadoId) { setMunicipios([]); return; }
    fetch(`${BASE}/auth/municipalities?state_id=${estadoId}`)
      .then(r => r.json())
      .then(d => setMunicipios(d.municipalities || (Array.isArray(d) ? d : [])))
      .catch(() => {});
  }, [estadoId]);

  const [paso, setPaso] = useState<'info' | 'mapa'>('info');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorOverlap, setErrorOverlap] = useState<string | null>(null);
  const [advertenciaOverlap, setAdvertenciaOverlap] = useState<string | null>(null);

  const [drawMode, setDrawMode] = useState<DrawMode>('idle');
  const [pointCount, setPointCount] = useState(0);
  const [mostrarCaminos, setMostrarCaminos] = useState(false);
  const [capturandoGPS, setCapturandoGPS] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [center, setCenter] = useState<[number, number]>([23.6, -102.5]);
  const [mapReady, setMapReady] = useState(false);
  const [searchPin, setSearchPin] = useState<[number, number] | null>(null);

  const [pendingUP, setPendingUP] = useState<{
    poligono: [number, number][];
    coords: { lat: number; lng: number };
    area: number;
  } | null>(null);
  const [existentes, setExistentes] = useState<[number, number][][]>([]);
  const [existentesIds, setExistentesIds] = useState<number[]>([]);
  const [coincideArea, setCoincideArea] = useState<boolean | null>(null);
  const [areaReal, setAreaReal] = useState('');
  const [parcelaGuardada, setParcelaGuardada] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/mis-ups`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const ups = d.ups || (Array.isArray(d) ? d : []);
        const polys: [number, number][][] = [];
        const ids: number[] = [];
        for (const u of ups) {
          if (u.up_id) ids.push(u.up_id);
          const g = u.geom_geojson;
          if (!g?.coordinates) continue;
          const ring = g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : g.coordinates[0];
          if (!ring || ring.length < 3) continue;
          polys.push((ring as [number, number][]).map(([ln, la]) => [la, ln] as [number, number]));
        }
        setExistentes(polys);
        setExistentesIds(ids);
        if (polys.length && polys[0][0]) setCenter(polys[0][0]);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (paso === 'mapa' && existentes.length === 0 && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [paso]);

  const UMBRAL_TRASLAPE = 0.10;

  const validarOverlapLocal = (poly: [number, number][]) => {
    if (poly.length < 3) return { bloqueado: false, mensaje: null, porcentaje: 0 };
    try {
      const nueva = turf.polygon([[...poly.map(([la, ln]) => [ln, la]), [poly[0][1], poly[0][0]]]]);
      const areaNueva = turf.area(nueva);
      if (areaNueva <= 0) return { bloqueado: false, mensaje: null, porcentaje: 0 };
      for (let i = 0; i < existentes.length; i++) {
        const ex = existentes[i];
        if (!ex || ex.length < 3) continue;
        const exPoly = turf.polygon([[...ex.map(([la, ln]) => [ln, la]), [ex[0][1], ex[0][0]]]]);
        if (!turf.booleanIntersects(nueva, exPoly)) continue;
        const interseccion = turf.intersect(turf.featureCollection([nueva, exPoly]));
        if (!interseccion) continue;
        const pct = Math.round((turf.area(interseccion) / areaNueva) * 100);
        if (pct / 100 > UMBRAL_TRASLAPE) return { bloqueado: true, mensaje: `Tu parcela se empalma un ${pct}% con una parcela existente. El máximo permitido es 10%.`, porcentaje: pct };
        if (pct > 0) return { bloqueado: false, mensaje: `Traslape menor del ${pct}% con una parcela colindante. Intenta ajustar los bordes si puedes.`, porcentaje: pct };
      }
    } catch { /* no bloquear si falla turf */ }
    return { bloqueado: false, mensaje: null, porcentaje: 0 };
  };

  const onUPDibujada = (poly: [number, number][], centro: { lat: number; lng: number }, area: number) => {
    const r = validarOverlapLocal(poly);
    if (r.bloqueado) { setErrorOverlap(r.mensaje); setAdvertenciaOverlap(null); return; }
    setErrorOverlap(null);
    setAdvertenciaOverlap(r.mensaje ?? null);
    setPendingUP({ poligono: poly, coords: centro, area });
    setCoincideArea(null); setAreaReal('');
  };

  const redibujarUP = () => {
    setPendingUP(null); setPointCount(0); setGpsMsg(null); setErrorOverlap(null); setSearchPin(null);
    setTimeout(() => dibujarRef.current?.startEdit?.(), 50);
  };

  const guardar = async (
    poligono: [number, number][] | null,
    coords: { lat: number; lng: number } | null,
    areaCalc: number | null
  ) => {
    if (!estadoUp || !municipioUp) { setError('Selecciona el estado y municipio de tu parcela.'); return; }
    if (enviando) return;
    setEnviando(true); setError(null);
    try {
      const res = await fetch(`${BASE}/productor/ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre_up: nombreUP?.trim() || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          poligono: poligono ?? null,
          area_calc_ha: areaCalc,
          area_real_ha: (coincideArea === false && areaReal) ? Number(areaReal) : areaCalc,
          coincide_area: coincideArea ?? true,
          estado_up: estadoUp,
          municipio_up: municipioUp,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al guardar la parcela.'); if (res.status === 409) setPaso('mapa'); return; }
      setParcelaGuardada(data.up?.up_name || nombreUP?.trim() || 'Tu parcela');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally { setEnviando(false); }
  };

  const puedeTerminar = pointCount >= 3;

  // ── Modal de éxito ──
  if (parcelaGuardada !== null) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center"
           style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}>
        {/* Fondo difuminado */}
        <div className="absolute inset-0 bg-[#0c2e1a]/80 backdrop-blur-md" />
        {/* Card */}
        <div className="relative bg-white rounded-3xl mx-5 w-full max-w-sm shadow-2xl overflow-hidden"
             style={{ animation: 'pfPop .35s cubic-bezier(.34,1.56,.64,1) both' }}>
          <style>{`@keyframes pfPop { from { opacity:0; transform:scale(0.88) } to { opacity:1; transform:scale(1) } }`}</style>

          {/* Banda verde superior */}
          <div className="bg-gradient-to-br from-[#1A5C38] to-[#22783f] px-6 pt-8 pb-10 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/15 ring-4 ring-white/30 flex items-center justify-center">
              <CheckCircle2 size={34} className="text-white" />
            </div>
            <p className="text-white font-black text-[20px] text-center leading-tight mt-1">
              ¡Parcela registrada!
            </p>
            <p className="text-white/70 text-[13px] text-center">Tu parcela ha sido guardada correctamente</p>
          </div>

          {/* Nombre */}
          <div className="px-6 py-5 flex flex-col items-center gap-4">
            <div className="w-full bg-[#eef8f2] rounded-2xl px-4 py-3.5 text-center">
              <p className="text-[10px] font-bold text-[#1A5C38]/60 uppercase tracking-widest mb-0.5">Nombre de la parcela</p>
              <p className="text-[17px] font-black text-[#1A5C38]">{parcelaGuardada}</p>
            </div>

            <button
              onClick={() => navigate('/productor/perfil')}
              className="w-full bg-[#1A5C38] text-white font-bold text-[14px] py-3.5 rounded-2xl active:scale-[0.98] transition-all shadow-lg shadow-[#1A5C38]/25">
              Ver mi perfil
            </button>
            <button
              onClick={() => { setParcelaGuardada(null); setPaso('info'); setPendingUP(null); setNombreUP(''); setCoincideArea(null); setAreaReal(''); }}
              className="w-full text-slate-500 font-medium text-[13px] py-2 active:opacity-60 transition-opacity">
              Agregar otra parcela
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAPA (paso === 'mapa') — pantalla completa, respeta AppHeader (64px) y bottom nav (62px) ──
  if (paso === 'mapa') {
    return (
      <div
        className="fixed left-0 right-0 bottom-0 flex flex-col overflow-hidden bg-[#0c2e1a]"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 62px)',
        }}
      >
        {/* Header oscuro */}
        <div className="bg-[#0c2e1a] px-4 py-2.5 flex items-center gap-3 z-10 shadow-md flex-shrink-0">
          <button
            onClick={() => setPaso('info')}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-[10px] font-bold text-green-300 uppercase tracking-wider">Geolocalización</p>
            <p className="text-xs text-white/80 mt-0.5">{municipioUp}, {estadoUp}</p>
          </div>
        </div>

        <div className="flex-1 relative min-h-0">
          <MapContainer
            ref={mapRef}
            center={center}
            zoom={mapReady ? 16 : 5}
            style={{ height: '100%', width: '100%' }}
            whenReady={() => setMapReady(true)}
          >
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="© Esri"
            />
            <TileLayer
              url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              opacity={0.6}
            />
            {mostrarCaminos && (
              <TileLayer
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                opacity={0.8}
              />
            )}
            {/* Parcelas de OTROS productores — gris tenue */}
            <ParcelasExistentesLayer excluirUpIds={existentesIds} />
            {/* Parcelas propias ya existentes — gris con borde punteado más visible */}
            {existentes.map((poly, i) => (
              <Polygon key={`ex-${i}`} positions={poly}
                pathOptions={{ color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.18, weight: 2, dashArray: '5 5' }} />
            ))}
            <DibujarPoligonoUP
              ref={dibujarRef}
              onModeChange={mode => { setDrawMode(mode); if (mode !== 'idle') setErrorOverlap(null); }}
              onPointCountChange={n => { setPointCount(n); if (n > 0) setSearchPin(null); }}
              onPoligonoCompleto={(poly, centro, area) => { setSearchPin(null); onUPDibujada(poly, centro, area); }}
              onPoligonoEliminado={() => {}}
              onOverlap={({ pctOverlap }) => {
                setErrorOverlap(`Esta parcela se encima con una ya registrada (${Math.round(pctOverlap * 100)}% de traslape). Ajusta el contorno para separarla.`);
                setAdvertenciaOverlap(null);
              }}
            />
            {pendingUP && (
              <Polygon
                positions={pendingUP.poligono}
                pathOptions={{ color: '#4ade80', fillColor: '#22c55e', fillOpacity: 0.3, weight: 2.5, dashArray: '6 4' }}
              />
            )}
            {/* Pin de búsqueda — desaparece al empezar a dibujar */}
            {searchPin && !pendingUP && <SearchPinMarker position={searchPin} />}
          </MapContainer>

          {/* Buscador — solo cuando no hay pendingUP */}
          {!pendingUP && (
            <div
              className="absolute top-3 left-3 right-3 z-[1000] max-w-md mx-auto"
              onClick={e => e.stopPropagation()}
            >
              <NominatimSearch
                placeholder="Buscar dirección o localidad…"
                onSelect={(lat, lng) => {
                  mapRef.current?.flyTo([lat, lng], 17);
                  setSearchPin([lat, lng]);
                }}
              />
            </div>
          )}

          {/* Toggle caminos — esquina superior derecha */}
          <button
            onClick={e => { e.stopPropagation(); setMostrarCaminos(v => !v); }}
            title={mostrarCaminos ? 'Ocultar caminos' : 'Mostrar caminos'}
            className={`absolute top-3 right-3 z-[1001] w-9 h-9 flex items-center justify-center rounded-xl shadow-lg transition-all active:scale-95 ${
              mostrarCaminos
                ? 'bg-green-500 text-white ring-2 ring-green-300/60'
                : 'bg-black/60 backdrop-blur-md text-white/70 ring-1 ring-white/20 hover:bg-black/80'
            }`}
          >
            <Route size={17} />
          </button>

          {/* Panel de confirmación */}
          {pendingUP ? (
            <div
              className="absolute bottom-0 left-0 right-0 z-[1000] animate-auth-in"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none rounded-t-3xl" />
              <div className="relative bg-[#0c2e1a]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-6 shadow-2xl">
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center ring-1 ring-green-400/30">
                    <CheckCircle2 size={16} className="text-green-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-[15px] leading-tight">¿Confirmar esta parcela?</p>
                    <p className="text-white/50 text-[11px]">Revisa el polígono en el mapa antes de guardar</p>
                  </div>
                </div>

                {/* Nombre de la parcela (solo lectura, viene del paso 1) */}
                {nombreUP?.trim() && (
                  <div className="mb-3 bg-white/5 rounded-xl px-3 py-2 ring-1 ring-white/10 flex items-center gap-2">
                    <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">Parcela</span>
                    <span className="text-white text-[13px] font-bold flex-1 truncate">{nombreUP.trim()}</span>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                    <p className="text-green-300 font-black text-[17px] leading-none">
                      {pendingUP.area.toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Hectáreas</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                    <p className="text-white font-black text-[17px] leading-none">{pendingUP.poligono.length}</p>
                    <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Vértices</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                    <p className="text-white font-black text-[13px] leading-tight truncate">{municipioUp.split(' ')[0]}</p>
                    <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Municipio</p>
                  </div>
                </div>

                {/* ¿Coincide el área? */}
                <div className="mb-4">
                  <p className="text-white/70 text-[12px] font-medium mb-2">¿El área calculada coincide con tu parcela?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setCoincideArea(true); setAreaReal(''); }}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ring-1 transition-all active:scale-[0.97] ${coincideArea === true ? 'bg-green-500 text-white ring-green-400' : 'bg-white/5 text-white/70 ring-white/15'}`}
                    >
                      Sí, coincide
                    </button>
                    <button
                      onClick={() => setCoincideArea(false)}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ring-1 transition-all active:scale-[0.97] ${coincideArea === false ? 'bg-amber-500 text-white ring-amber-400' : 'bg-white/5 text-white/70 ring-white/15'}`}
                    >
                      No, difiere
                    </button>
                  </div>
                  {coincideArea === false && (
                    <div className="mt-2.5">
                      <label className="block text-white/50 text-[11px] mb-1.5">Superficie real de tu parcela</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={areaReal}
                          onChange={e => setAreaReal(e.target.value)}
                          placeholder={String(pendingUP.area)}
                          min="0.1" step="0.1" inputMode="decimal"
                          className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3 pr-12 text-white text-[16px] font-bold focus:ring-2 focus:ring-green-400/50 focus:outline-none placeholder-white/30"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-semibold">ha</span>
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mb-3 p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-xs flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />{error}
                  </div>
                )}

                <div className="flex gap-2.5">
                  <button
                    onClick={redibujarUP}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
                  >
                    <Undo2 size={16} /> Redibujar
                  </button>
                  <button
                    onClick={() => guardar(pendingUP.poligono, pendingUP.coords, pendingUP.area)}
                    disabled={enviando || coincideArea === null || (coincideArea === false && !areaReal)}
                    className="flex-[1.6] flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-white py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all shadow-lg shadow-green-900/50 disabled:opacity-40"
                  >
                    {enviando
                      ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
                      : <><CheckCircle2 size={17} /> Confirmar Parcela</>}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Controles de dibujo */
            <div
              className="absolute bottom-4 left-4 right-4 z-[1000] max-w-md mx-auto space-y-2.5 animate-auth-in"
              onClick={e => e.stopPropagation()}
            >
              {errorOverlap && (
                <div className="bg-red-500/20 ring-1 ring-red-400/40 backdrop-blur-md rounded-xl p-3">
                  <p className="text-red-200 text-sm font-bold flex items-center gap-1.5">
                    <AlertTriangle size={14} className="shrink-0" /> {errorOverlap}
                  </p>
                  <button
                    onClick={() => { setErrorOverlap(null); setAdvertenciaOverlap(null); dibujarRef.current?.startEdit?.(); }}
                    className="mt-2 text-xs text-red-300 font-bold underline flex items-center gap-1"
                  >
                    <Pencil size={11} /> Editar puntos para corregir
                  </button>
                </div>
              )}

              {advertenciaOverlap && !errorOverlap && (
                <div className="bg-amber-500/20 ring-1 ring-amber-400/40 backdrop-blur-md rounded-xl p-3">
                  <p className="text-amber-200 text-sm font-bold flex items-center gap-1.5">
                    <Ruler size={14} className="shrink-0" /> {advertenciaOverlap}
                  </p>
                  <button
                    onClick={() => { setAdvertenciaOverlap(null); dibujarRef.current?.startEdit?.(); }}
                    className="mt-2 text-xs text-amber-300 font-medium underline"
                  >
                    Ajustar bordes de todas formas
                  </button>
                </div>
              )}

              <p className="text-center text-xs text-white bg-black/60 backdrop-blur-md rounded-xl px-4 py-2 font-medium ring-1 ring-white/10">
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
                className="w-full bg-[#1A5C38]/90 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-all"
              >
                {capturandoGPS
                  ? <><Loader2 size={16} className="animate-spin" /> Obteniendo ubicación…</>
                  : <><Footprints size={16} /> Estoy en este punto — registrar GPS</>}
              </button>

              {gpsMsg && (
                <p className="text-center text-[11px] text-green-200 bg-[#1A5C38]/80 backdrop-blur-md rounded-xl px-3 py-1.5 ring-1 ring-green-400/30">
                  {gpsMsg}
                </p>
              )}

              {pointCount > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => dibujarRef.current?.undoVertex()}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
                  >
                    <Undo2 size={16} /> Deshacer
                  </button>
                  <button
                    onClick={() => dibujarRef.current?.finishDraw()}
                    disabled={!puedeTerminar}
                    className="flex-[1.4] flex items-center justify-center gap-1.5 bg-green-500 text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-green-900/50"
                  >
                    <CheckCircle2 size={17} /> {puedeTerminar ? `Continuar (${pointCount})` : `Faltan ${Math.max(0, 3 - pointCount)}`}
                  </button>
                </div>
              )}

              {drawMode === 'editing' && (
                <button
                  onClick={() => dibujarRef.current?.saveEdit()}
                  className="w-full bg-green-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-green-900/50 active:scale-[0.98] transition-all"
                >
                  Guardar ajustes
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PASO INFO — fondo verde oscuro, respeta el AppHeader del layout (h-16 + safe-area) ──
  const inputCls = 'w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-2.5 sm:py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all appearance-none [&>option]:text-gray-900';
  const labelCls = 'block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5';

  return (
    <div
      className="fixed left-0 right-0 bottom-0 flex flex-col bg-gradient-to-b from-[#061510] via-[#0c2e1a] to-[#1A5C38]"
      // Empieza justo debajo del AppHeader (h-16=64px + safe-area-inset-top)
      // Así la barra blanca de SIMAC NO absorbe el color verde del backdrop-blur
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_50%_at_50%_0%,rgba(52,208,121,0.08),transparent)]" />
      </div>

      {/* Mini-header con botón atrás — visible debajo del AppHeader blanco */}
      <div className="relative flex-shrink-0 flex items-center px-4 h-11 border-b border-white/[0.07]">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-white/70 hover:text-white active:text-white/50 transition-colors"
        >
          <ChevronLeft size={18} />
          <span className="text-sm font-semibold">Volver</span>
        </button>
        <div className="flex-1 flex justify-center items-center gap-2">
          <div className="w-5 h-5 bg-green-400/15 rounded-md flex items-center justify-center ring-1 ring-green-400/20">
            <MapPin size={11} className="text-green-300" />
          </div>
          <span className="text-sm font-semibold text-white/80">Nueva parcela</span>
        </div>
        <div className="w-16" />
      </div>

      {/* Contenido */}
      <div className="relative flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-6 py-4"
           style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)' }}>
        <div className="w-full max-w-sm lg:max-w-4xl flex flex-col lg:flex-row lg:items-center lg:gap-16">

          {/* Left panel — desktop branding */}
          <div className="hidden lg:flex flex-col items-start flex-1 px-4">
            <div className="w-14 h-14 bg-[#1A5C38] rounded-[18px] flex items-center justify-center shadow-xl shadow-green-900/40 mb-5">
              <MapPin size={26} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Nueva parcela</h1>
            <p className="text-white/50 text-base leading-relaxed">
              Indica el estado y municipio de tu parcela para continuar al mapa satelital.
            </p>
          </div>

          {/* Form panel */}
          <div className="flex-1 lg:max-w-sm w-full">

            {/* Título — mobile */}
            <div className="flex lg:hidden items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 ring-1 ring-sky-400/20 flex items-center justify-center flex-shrink-0">
                <MapPin size={16} className="text-sky-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">Ubicación de parcela</h1>
                <p className="text-white/45 text-xs mt-0.5">Estado y municipio donde se encuentra.</p>
              </div>
            </div>

            {/* Card principal */}
            <div className="bg-white/[0.08] backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-4 sm:p-5 space-y-3">

              {/* Nombre */}
              <div>
                <label className={labelCls}>
                  Nombre <span className="text-white/25 normal-case font-normal text-[10px]">— opcional</span>
                </label>
                <input
                  type="text"
                  value={nombreUP}
                  onChange={e => setNombreUP(e.target.value)}
                  placeholder="Ej: Parcela Norte, El Potrero…"
                  className={inputCls}
                />
              </div>

              {/* Estado */}
              <div>
                <label className={labelCls}>Estado <span className="text-red-400">*</span></label>
                <select
                  value={estadoId}
                  onChange={e => {
                    const sel = estados.find(s => s.state_id === e.target.value);
                    setEstadoId(e.target.value);
                    setEstadoUp(sel?.name || '');
                    setMunicipios([]);
                    setMunicipioUp('');
                  }}
                  className={inputCls}
                >
                  <option value="">Selecciona tu estado</option>
                  {estados.map(s => <option key={s.state_id} value={s.state_id}>{s.name}</option>)}
                </select>
              </div>

              {/* Municipio */}
              <div>
                <label className={labelCls}>Municipio <span className="text-red-400">*</span></label>
                <select
                  value={municipioUp}
                  onChange={e => setMunicipioUp(e.target.value)}
                  disabled={!estadoId}
                  className={`${inputCls} disabled:opacity-35`}
                >
                  <option value="">{estadoId ? 'Selecciona tu municipio' : 'Elige estado primero'}</option>
                  {municipios.map(m => <option key={m.municipality_id} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              {error && (
                <div className="p-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl text-red-300 text-sm flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />{error}
                </div>
              )}

              <button
                onClick={() => { setError(null); setPaso('mapa'); }}
                disabled={!estadoUp || !municipioUp}
                className="w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 text-sm font-bold disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Map size={16} /> Ir al mapa a dibujar la parcela
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-[11px] font-medium">o</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              <button
                onClick={() => guardar(null, null, null)}
                disabled={!estadoUp || !municipioUp || enviando}
                className="w-full bg-white/[0.08] ring-1 ring-white/15 hover:bg-white/[0.12] text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {enviando
                  ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                  : <><Check size={14} /> Guardar solo con municipio</>}
              </button>
            </div>

            <p className="text-white/25 text-xs text-center mt-3 leading-relaxed">
              Puedes dibujar el polígono en el mapa satelital, o guardar solo con municipio.
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}
