import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import area from '@turf/area';
import centroid from '@turf/centroid';
import { polygon } from '@turf/helpers';
import { calcularTraslape, type ParcelaExistente } from '../../utils/overlap';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export type DrawMode = 'idle' | 'drawing' | 'editing';

export interface DibujarPoligonoHandle {
  /** Agrega un vértice en el centro actual del mapa (la mira). */
  addPoint: () => void;
  /** Modo caminata: captura la ubicación GPS real del dispositivo y la agrega como vértice. */
  addPointGPS: (
    onResult?: (info: { ok: true; accuracy: number } | { ok: false; error: string }) => void
  ) => void;
  /** Quita el último vértice agregado. */
  undoVertex: () => void;
  /** Cierra el polígono (requiere ≥3 vértices) y calcula área/centroide. */
  finishDraw: () => void;
  /** Borra todo y reinicia. */
  clear: () => void;
  /** Activa el modo de edición (arrastrar vértices). */
  startEdit: () => void;
  /** Guarda la edición y recalcula. */
  saveEdit: () => void;
  /** Cancela la edición y revierte a la forma previa. */
  cancelEdit: () => void;
}

interface Props {
  poligonoInicial?: [number, number][];
  onPoligonoCompleto: (
    coordenadas: [number, number][],
    centroide: { lat: number; lng: number },
    areaHa: number
  ) => void;
  onPoligonoEliminado: () => void;
  onModeChange?: (mode: DrawMode) => void;
  onPointCountChange?: (count: number) => void;
  /** IDs de UPs a ignorar en la validación de traslape (ej. la propia UP al editarla). */
  excluirUpIds?: number[];
  /** IDs de UPs propias del productor (distintas a la que se está editando).
   *  Contra estas, CUALQUIER traslape bloquea — nunca debe permitirse que
   *  dos parcelas del mismo productor queden encimadas. Contra el resto
   *  (parcelas de otros productores) se tolera hasta 10%. */
  misUpIds?: number[];
  /** Se dispara cuando el polígono dibujado se traslapa lo suficiente para
   *  bloquearse (ver misUpIds/UMBRAL_BLOQUEO_AJENA) — el polígono NO se
   *  confirma (no se llama a onPoligonoCompleto) hasta que se corrija. */
  onOverlap?: (info: { pctOverlap: number; esPropia: boolean }) => void;
}

const GREEN = '#34d079';
const GREEN_DARK = '#16a34a';

/**
 * Dibujo de parcela tipo "mira + botón": el usuario navega/hace zoom libremente
 * sin riesgo de agregar puntos por error. Cada vértice se agrega SOLO al tocar
 * el botón (que llama a addPoint()), tomando el centro visible del mapa.
 */
const RED = '#ef4444';
const RED_DARK = '#b91c1c';

const DibujarPoligonoUP = forwardRef<DibujarPoligonoHandle, Props>(
  ({ poligonoInicial, onPoligonoCompleto, onPoligonoEliminado, onModeChange, onPointCountChange, excluirUpIds, misUpIds, onOverlap }, ref) => {
    const map = useMap();
    const groupRef = useRef(new L.FeatureGroup());
    const verticesRef = useRef<[number, number][]>([]);
    const modeRef = useRef<DrawMode>('idle');
    const polyLayerRef = useRef<L.Layer | null>(null);
    const markerLayersRef = useRef<L.Marker[]>([]);
    const backupRef = useRef<[number, number][] | null>(null);
    const overlapRef = useRef(false);
    const parcelasExistentesRef = useRef<ParcelaExistente[]>([]);

    // Parcelas ya registradas (de cualquier productor) contra las que se
    // valida el traslape. Se cargan una vez; el mismo dataset que dibuja
    // ParcelasExistentesLayer en gris.
    useEffect(() => {
      fetch(`${BASE}/ups/geometrias`)
        .then(r => r.ok ? r.json() : { ups: [] })
        .then(d => {
          const resultado: ParcelaExistente[] = [];
          for (const u of (d.ups || [])) {
            const g = u.geom_geojson;
            if (!g?.coordinates) continue;
            const ring: number[][] = g.type === 'MultiPolygon' ? g.coordinates[0]?.[0] : g.coordinates[0];
            if (!ring || ring.length < 3) continue;
            resultado.push({ id: u.up_id, pos: ring.map(([ln, la]: number[]) => [la, ln] as [number, number]) });
          }
          parcelasExistentesRef.current = resultado;
        })
        .catch(() => {});
    }, []);

    const setMode = useCallback((m: DrawMode) => {
      modeRef.current = m;
      onModeChange?.(m);
    }, [onModeChange]);

    const emitCount = useCallback(() => {
      onPointCountChange?.(verticesRef.current.length);
    }, [onPointCountChange]);

    const computeAndEmit = useCallback(() => {
      const v = verticesRef.current;
      if (v.length < 3) return;

      const traslape = calcularTraslape(v, parcelasExistentesRef.current, excluirUpIds, misUpIds);
      if (traslape.bloqueado) {
        overlapRef.current = true;
        fullRedraw();
        onOverlap?.({ pctOverlap: traslape.pct, esPropia: !!traslape.esPropia });
        return; // No se confirma el polígono mientras se traslape.
      }
      if (overlapRef.current) {
        overlapRef.current = false;
        fullRedraw();
      }

      const ring = [...v.map(([la, ln]) => [ln, la]), [v[0][1], v[0][0]]];
      const poly = polygon([ring]);
      const areaHa = parseFloat((area(poly) / 10000).toFixed(4));
      const c = centroid(poly).geometry.coordinates; // [lng, lat]
      onPoligonoCompleto(
        v.map(([la, ln]) => [la, ln] as [number, number]),
        { lat: c[1], lng: c[0] },
        areaHa
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onPoligonoCompleto, onOverlap, excluirUpIds, misUpIds]);

    const vertexIcon = (index: number, editing: boolean) => {
      const size = editing ? 20 : 13;
      const color = overlapRef.current ? (index === 0 ? RED_DARK : RED) : (index === 0 ? GREEN_DARK : GREEN);
      return L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)${editing ? ';cursor:grab' : ''}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
    };

    const redrawPoly = useCallback(() => {
      const g = groupRef.current;
      if (polyLayerRef.current) { g.removeLayer(polyLayerRef.current); polyLayerRef.current = null; }
      const v = verticesRef.current;
      const col = overlapRef.current ? RED : GREEN;
      if (v.length >= 3 && modeRef.current !== 'drawing') {
        polyLayerRef.current = L.polygon(v as L.LatLngTuple[], {
          color: col, fillColor: col, fillOpacity: 0.22, weight: 3,
        });
      } else if (v.length >= 2) {
        polyLayerRef.current = L.polyline(v as L.LatLngTuple[], {
          color: col, weight: 3, dashArray: '7 7',
        });
      }
      if (polyLayerRef.current) g.addLayer(polyLayerRef.current);
    }, []);

    // Reconstrucción total: limpia TODO el grupo y vuelve a dibujar polígono +
    // marcadores desde cero. A prueba de duplicados (incl. StrictMode en dev).
    const fullRedraw = useCallback(() => {
      const g = groupRef.current;
      g.clearLayers();
      polyLayerRef.current = null;
      markerLayersRef.current = [];

      const v = verticesRef.current;
      const col = overlapRef.current ? RED : GREEN;
      // Polígono / línea
      if (v.length >= 3 && modeRef.current !== 'drawing') {
        polyLayerRef.current = L.polygon(v as L.LatLngTuple[], {
          color: col, fillColor: col, fillOpacity: 0.22, weight: 3,
        });
      } else if (v.length >= 2) {
        polyLayerRef.current = L.polyline(v as L.LatLngTuple[], {
          color: col, weight: 3, dashArray: '7 7',
        });
      }
      if (polyLayerRef.current) g.addLayer(polyLayerRef.current);

      // Marcadores de vértice
      const editing = modeRef.current === 'editing';
      v.forEach(([lat, lng], i) => {
        const m = L.marker([lat, lng], { icon: vertexIcon(i, editing), draggable: editing, keyboard: false });
        if (editing) {
          m.on('drag', (e: L.LeafletEvent) => {
            const ll = (e.target as L.Marker).getLatLng();
            verticesRef.current[i] = [ll.lat, ll.lng];
            redrawPoly(); // durante el arrastre solo se actualiza el contorno
          });
        }
        markerLayersRef.current.push(m);
        g.addLayer(m);
      });
    }, [redrawPoly]);

    useEffect(() => {
      const g = groupRef.current;
      map.addLayer(g);

      // Modo fluido: tocar/clic directo en el mapa coloca un vértice donde apunta el dedo/cursor.
      // Coexiste con la mira + botón. Guardas para no marcar por error:
      //  - nunca durante la edición de vértices (arrastre)
      //  - nunca cuando el polígono ya está cerrado (idle con ≥3 vértices)
      const onMapClick = (e: L.LeafletMouseEvent) => {
        if (modeRef.current === 'editing') return;
        if (modeRef.current === 'idle' && verticesRef.current.length >= 3) return;
        if (modeRef.current === 'idle') setMode('drawing');
        verticesRef.current.push([e.latlng.lat, e.latlng.lng]);
        fullRedraw();
        emitCount();
      };
      map.on('click', onMapClick);
      // El doble-toque/clic hace zoom (dispararía 2 clics y crearía puntos sueltos): lo desactivamos
      // mientras se dibuja. El zoom sigue disponible con pellizco, rueda y los controles +/−.
      map.doubleClickZoom.disable();

      if (poligonoInicial && poligonoInicial.length >= 3) {
        verticesRef.current = poligonoInicial.map(([la, ln]) => [la, ln] as [number, number]);
        setMode('idle');
        fullRedraw();
        const b = L.latLngBounds(verticesRef.current as L.LatLngTuple[]);
        map.fitBounds(b, { padding: [50, 50] });
        // Emitir el polígono precargado para que el padre tenga centroide/área lista
        computeAndEmit();
      }

      return () => {
        map.off('click', onMapClick);
        try { map.doubleClickZoom.enable(); } catch { /* noop */ }
        // Defensa: evita el crash "reading 'baseVal'" de Leaflet si el mapa se
        // desmonta con un arrastre colgado (Draggable.finishDrag sobre un
        // _lastTarget inválido). Limpiamos el estado antes de que React desmonte.
        try {
          const dr = (map as unknown as { dragging?: { _draggable?: { _lastTarget?: unknown; _moving?: boolean } } }).dragging?._draggable;
          if (dr) { dr._lastTarget = null; dr._moving = false; }
        } catch { /* noop */ }
        markerLayersRef.current = [];
        polyLayerRef.current = null;
        g.clearLayers();
        map.removeLayer(g);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    const addPoint = useCallback(() => {
      if (modeRef.current === 'idle' && verticesRef.current.length === 0) setMode('drawing');
      else if (modeRef.current === 'idle') setMode('drawing');
      const c = map.getCenter();
      verticesRef.current.push([c.lat, c.lng]);
      fullRedraw();
      emitCount();
    }, [map, setMode, fullRedraw, emitCount]);

    const addPointGPS = useCallback((
      onResult?: (info: { ok: true; accuracy: number } | { ok: false; error: string }) => void
    ) => {
      if (!navigator.geolocation) {
        onResult?.({ ok: false, error: 'Tu dispositivo no tiene GPS disponible.' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          if (modeRef.current === 'idle') setMode('drawing');
          verticesRef.current.push([latitude, longitude]);
          fullRedraw();
          emitCount();
          map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
          onResult?.({ ok: true, accuracy });
        },
        (error) => {
          let msg = 'Error al obtener ubicación. Intenta de nuevo.';
          if (error.code === error.PERMISSION_DENIED) msg = 'Permiso de ubicación denegado. Activa el GPS en la configuración de tu celular.';
          else if (error.code === error.POSITION_UNAVAILABLE) msg = 'No se pudo obtener tu ubicación. Sal a un lugar abierto e intenta de nuevo.';
          else if (error.code === error.TIMEOUT) msg = 'La ubicación tardó demasiado. Intenta de nuevo.';
          onResult?.({ ok: false, error: msg });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }, [map, setMode, fullRedraw, emitCount]);

    const undoVertex = useCallback(() => {
      verticesRef.current.pop();
      if (verticesRef.current.length === 0) setMode('drawing');
      fullRedraw();
      emitCount();
    }, [setMode, fullRedraw, emitCount]);

    const finishDraw = useCallback(() => {
      if (verticesRef.current.length < 3) return;
      setMode('idle');
      fullRedraw();
      computeAndEmit();
    }, [setMode, fullRedraw, computeAndEmit]);

    const clear = useCallback(() => {
      verticesRef.current = [];
      backupRef.current = null;
      setMode('idle');
      fullRedraw();
      emitCount();
      onPoligonoEliminado();
    }, [setMode, fullRedraw, emitCount, onPoligonoEliminado]);

    const startEdit = useCallback(() => {
      backupRef.current = verticesRef.current.map(([la, ln]) => [la, ln] as [number, number]);
      setMode('editing');
      fullRedraw();
    }, [setMode, fullRedraw]);

    const saveEdit = useCallback(() => {
      backupRef.current = null;
      setMode('idle');
      fullRedraw();
      computeAndEmit();
    }, [setMode, fullRedraw, computeAndEmit]);

    const cancelEdit = useCallback(() => {
      if (backupRef.current) verticesRef.current = backupRef.current;
      backupRef.current = null;
      setMode('idle');
      fullRedraw();
    }, [setMode, fullRedraw]);

    useImperativeHandle(ref, () => ({
      addPoint, addPointGPS, undoVertex, finishDraw, clear, startEdit, saveEdit, cancelEdit,
    }));

    return null;
  }
);

DibujarPoligonoUP.displayName = 'DibujarPoligonoUP';
export default DibujarPoligonoUP;
