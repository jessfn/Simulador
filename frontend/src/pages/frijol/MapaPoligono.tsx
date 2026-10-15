import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Map as LeafletMap } from 'leaflet';
import { CheckCircle2, Footprints, Loader2, Trash2, Undo2, X } from 'lucide-react';
import DibujarPoligonoUP from '../../components/productor/DibujarPoligonoUP';
import type { DibujarPoligonoHandle } from '../../components/productor/DibujarPoligonoUP';
import NominatimSearch from '../../components/productor/NominatimSearch';
import ParcelasExistentesLayer from '../../components/productor/ParcelasExistentesLayer';
import type { ParcelaExistente } from './tipos';

interface Props {
  vertices: [number, number][];
  poligono: [number, number][] | null;
  /** parcelas propias del productor (se muestran en verde y no pueden encimarse) */
  propias: ParcelaExistente[];
  alCambiarVertices: (v: [number, number][]) => void;
  alTerminar: (poligono: [number, number][], areaHa: number) => void;
  alBorrarTodo: () => void;
  alCerrar: () => void;
  mensajeServidor?: string;
}

const CENTRO_MEXICO: [number, number] = [23.6, -102.5];

function anillo(g: ParcelaExistente['geom_geojson']): [number, number][] | null {
  if (!g) return null;
  const c = g.coordinates as number[][][] | number[][][][];
  const ring = (g.type === 'MultiPolygon' ? (c as number[][][][])[0]?.[0] : (c as number[][][])[0]) as number[][] | undefined;
  return ring && ring.length >= 3 ? ring.map(([ln, la]) => [la, ln] as [number, number]) : null;
}

// Pantalla completa para dibujar la parcela: "caminar el borde con GPS" o "marcar puntos en el mapa".
// Los vértices se guardan en el borrador conforme se agregan, así que si se cierra la app a media caminata no se pierden.
export default function MapaPoligono({ vertices, poligono, propias, alCambiarVertices, alTerminar, alBorrarTodo, alCerrar, mensajeServidor }: Props) {
  const mapRef = useRef<LeafletMap | null>(null);
  const dibujarRef = useRef<DibujarPoligonoHandle>(null);
  const [puntos, setPuntos] = useState(vertices.length);
  const [gps, setGps] = useState(false);
  const [msgGps, setMsgGps] = useState<{ texto: string; tipo: 'ok' | 'ambar' | 'rojo' } | null>(null);
  const [alerta, setAlerta] = useState('');
  const [pendiente, setPendiente] = useState<{ poligono: [number, number][]; area: number } | null>(poligono ? { poligono, area: 0 } : null);
  const [centro, setCentro] = useState<[number, number]>(CENTRO_MEXICO);
  const [zoom, setZoom] = useState(5);

  // Arranque: sobre el trazado/polígono guardado, sobre la primera parcela propia, o sobre la ubicación del teléfono
  useEffect(() => {
    const base = poligono || (vertices.length > 0 ? vertices : null) || (propias[0] && anillo(propias[0].geom_geojson));
    if (base && base.length > 0) { setCentro(base[0]); setZoom(17); return; }
    navigator.geolocation?.getCurrentPosition(
      p => { setCentro([p.coords.latitude, p.coords.longitude]); setZoom(16); mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 16); },
      () => { /* sin permiso: se queda el mapa de México y se puede buscar un lugar */ },
      { enableHighAccuracy: true, timeout: 8000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (mensajeServidor) setAlerta(mensajeServidor); }, [mensajeServidor]);
  const puedeCerrar = puntos >= 3 && !pendiente;

  function usarGps() {
    setGps(true); setMsgGps(null);
    dibujarRef.current?.addPointGPS(info => {
      setGps(false);
      if (!info.ok) setMsgGps({ texto: info.error, tipo: 'rojo' });
      else if (info.accuracy > 15) setMsgGps({ texto: `Señal GPS débil (±${Math.round(info.accuracy)} m). Espera unos segundos o marca los puntos en el mapa.`, tipo: 'ambar' });
      else setMsgGps({ texto: `Punto registrado (±${Math.round(info.accuracy)} m).`, tipo: 'ok' });
    });
  }

  const propiasIds = propias.map(p => p.up_id);

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900 flex flex-col" role="dialog" aria-modal="true" aria-label="Dibujar la parcela">
      <div className="flex-1 relative min-h-0">
        <MapContainer ref={mapRef} center={centro} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="© Esri" maxZoom={19} />
          <ParcelasExistentesLayer excluirUpIds={propiasIds} />
          {propias.map(p => { const a = anillo(p.geom_geojson); return a ? <Polygon key={p.up_id} positions={a} pathOptions={{ color: '#facc15', fillColor: '#facc15', fillOpacity: 0.18, weight: 2 }} interactive={false} /> : null; })}
          <DibujarPoligonoUP
            ref={dibujarRef}
            misUpIds={propiasIds}
            poligonoInicial={poligono || undefined}
            verticesIniciales={poligono ? undefined : vertices}
            onPointCountChange={n => { setPuntos(n); if (n > 0) setAlerta(''); }}
            onVerticesChange={alCambiarVertices}
            onPoligonoCompleto={(poly, _c, area) => { setAlerta(''); setPendiente({ poligono: poly, area }); }}
            onPoligonoEliminado={() => { setPendiente(null); alBorrarTodo(); }}
            onModeChange={m => { if (m === 'drawing') setPendiente(null); }}
            onOverlap={({ pctOverlap, esPropia }) => setAlerta(esPropia
              ? 'El polígono se encima con otra parcela de este mismo productor. Ajusta el contorno.'
              : `El polígono se encima ${Math.round(pctOverlap * 100)} % con la parcela de otro productor. Ajusta el trazo.`)}
            onKinkError={() => setAlerta('El polígono tiene trazos cruzados. Ajusta los puntos para que los lados no se crucen.')}
          />
        </MapContainer>

        <div className="absolute top-0 inset-x-0 z-[1000] p-3 space-y-2" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 max-w-xl mx-auto">
            <div className="flex-1"><NominatimSearch placeholder="Buscar localidad o dirección…" onSelect={(lat, lng) => mapRef.current?.flyTo([lat, lng], 17)} /></div>
            <button type="button" onClick={alCerrar} aria-label="Cerrar el mapa" className="w-12 h-12 rounded-2xl bg-white shadow-lg flex items-center justify-center flex-shrink-0"><X size={20} /></button>
          </div>
          {alerta && <div role="alert" className="max-w-xl mx-auto bg-red-600 text-white rounded-2xl px-4 py-3 text-[14px] font-medium shadow-lg">{alerta}</div>}
        </div>
      </div>

      <div className="bg-[#0c2e1a] border-t border-white/10 px-4 pt-3 space-y-2.5" style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        {pendiente ? (
          <>
            <div className="flex items-center gap-3 text-white">
              <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={22} />
              <div><p className="font-bold text-[16px]">Parcela dibujada</p>
                <p className="text-white/60 text-[13px]">{pendiente.area > 0 ? `${pendiente.area.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha calculadas · ` : ''}{pendiente.poligono.length} puntos</p></div>
            </div>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => { dibujarRef.current?.clear(); setPendiente(null); }}
                className="flex-1 min-h-[52px] rounded-2xl bg-white/10 ring-1 ring-white/20 text-white text-[15px] font-semibold flex items-center justify-center gap-2"><Undo2 size={17} /> Redibujar</button>
              <button type="button" onClick={() => alTerminar(pendiente.poligono, pendiente.area)}
                className="flex-[1.5] min-h-[52px] rounded-2xl bg-emerald-500 text-white text-[16px] font-bold">Usar esta parcela</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-[13px] text-white/80">{puntos === 0 ? 'Camina el borde de la parcela con el GPS, o toca el mapa en cada esquina.' : `${puntos} punto${puntos === 1 ? '' : 's'} marcado${puntos === 1 ? '' : 's'}. Faltan ${Math.max(0, 3 - puntos)} para cerrar.`}</p>
            <button type="button" onClick={usarGps} disabled={gps}
              className="w-full min-h-[54px] rounded-2xl bg-[#1A5C38] ring-1 ring-white/25 text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98]">
              {gps ? <><Loader2 size={18} className="animate-spin" /> Obteniendo ubicación…</> : <><Footprints size={18} /> Estoy en la esquina — usar GPS</>}
            </button>
            {msgGps && <p className={`text-center text-[13px] rounded-xl px-3 py-1.5 ${msgGps.tipo === 'ok' ? 'text-emerald-200 bg-emerald-900/40' : msgGps.tipo === 'ambar' ? 'text-amber-200 bg-amber-900/40' : 'text-red-200 bg-red-900/40'}`}>{msgGps.texto}</p>}
            <div className="flex gap-2.5">
              <button type="button" onClick={() => dibujarRef.current?.undoVertex()} disabled={puntos === 0}
                className="flex-1 min-h-[50px] rounded-2xl bg-white/10 ring-1 ring-white/20 text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-30"><Undo2 size={16} /> Deshacer</button>
              <button type="button" onClick={() => { dibujarRef.current?.clear(); }} disabled={puntos === 0}
                className="flex-1 min-h-[50px] rounded-2xl bg-white/10 ring-1 ring-white/20 text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-30"><Trash2 size={16} /> Borrar todo</button>
              <button type="button" onClick={() => dibujarRef.current?.finishDraw()} disabled={!puedeCerrar}
                className="flex-[1.4] min-h-[50px] rounded-2xl bg-emerald-500 text-white text-[14px] font-bold disabled:opacity-30">Cerrar polígono</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
