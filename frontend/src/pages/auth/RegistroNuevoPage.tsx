import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ChevronLeft, Check, CheckCircle2, MapPin, Undo2, Footprints, Loader2, Plus, Search, UserCheck, Map, KeyRound, AlertTriangle, Pencil
} from 'lucide-react';
import DibujarPoligonoUP from '../../components/productor/DibujarPoligonoUP';
import ParcelasExistentesLayer from '../../components/productor/ParcelasExistentesLayer';
import type { DibujarPoligonoHandle, DrawMode } from '../../components/productor/DibujarPoligonoUP';
import NominatimSearch from '../../components/productor/NominatimSearch';
import CoordenadasGPSInput from '../../components/productor/CoordenadasGPSInput';
import SearchPinMarker from '../../components/productor/SearchPinMarker';
import * as turf from '@turf/turf';
import AvisoPrivacidadStep, { type AvisoData } from './AvisoPrivacidadStep';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface DatosPadron {
  curp: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  fecha_nacimiento: string | null;
  genero: string | null;
  telefono: string | null;
  correo: string | null;
  estado_padron: string | null;
  municipio_padron: string | null;
  localidad_padron: string | null;
}

interface UPRegistrada {
  poligono: [number, number][] | null;
  coords: { lat: number; lng: number } | null;
  areaCalc: number | null;
  estado: string;
  municipio: string;
  nombre?: string;
  coincide_area?: boolean | null;
  area_real_ha?: number | null;
}

interface CatalogoInsumos {
  edicion_id: number;
  version_catalogo: string;
  periodo_inicio: string;
  periodo_fin: string;
  categorias: { id: string; nombre: string; ayuda: string | null }[];
  productos: { id: string; categoria_id: string; nombre_visible: string; requiere_nombre_conocido: boolean; es_otro: boolean }[];
  presentaciones: { id: string; producto_id: string; envase: string; contenido: number; unidad: string }[];
}

// Borrador/línea ya guardada de la encuesta de insumos, en formato de UI
// (se traduce a lo que espera la API justo antes de enviar el registro).
interface LineaEncuestaUI {
  producto_id: string;
  producto_nombre: string; // para mostrar en el resumen
  presentacion_id: string | null;
  presentacion_label: string; // para mostrar en el resumen
  presentacion_otro_envase: string | null;
  presentacion_otro_contenido: number | null;
  presentacion_otro_unidad: string | null;
  a_granel: boolean;
  cantidad: number;
  mes_compra: string; // 'YYYY-MM'
  nombre_conocido: string | null;
  preferencia_marca: string | null;
  identificacion_no_disponible: boolean;
}

interface DatosManual {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  telefono: string;
  correo: string;
  genero: string;
  estadoPadron: string;
  municipioPadron: string;
}

export default function RegistroNuevoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const esModoManual = searchParams.get('modo') === 'manual';
  const curpDesdeActivar = searchParams.get('curp') ?? '';

  // Clave de idempotencia estable durante toda la sesión de registro: un
  // reintento (doble clic, error de red) reusa la misma clave para que el
  // backend nunca duplique la cuenta/encuesta.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const [paso, setPaso] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTipo, setErrorTipo] = useState<'duplicada' | 'puede_activar' | null>(null);
  const [errorNombres, setErrorNombres] = useState<string | null>(null);

  // Paso 1
  const [curp, setCurp] = useState('');

  // Paso 2
  const [datosPadron, setDatosPadron] = useState<DatosPadron | null>(null);
  const [telefonoEditable, setTelefonoEditable] = useState('');
  // C14 — estado/municipio editable cuando SADER los devuelve vacíos
  const [estadoEditable, setEstadoEditable] = useState('');
  const [municipioEditable, setMunicipioEditable] = useState('');
  const [municipiosDisponibles, setMunicipiosDisponibles] = useState<{id: string; name: string}[]>([]);

  // Pasos 3-5 — UPs
  const [ups, setUps] = useState<UPRegistrada[]>([]);
  const [upActual, setUpActual] = useState<{ estado: string; municipio: string; nombre?: string; coincide_area?: boolean | null; area_real_ha?: string }>({ estado: '', municipio: '', nombre: '' });
  const [estados, setEstados] = useState<any[]>([]);
  const [municipios, setMunicipios] = useState<any[]>([]);
  const [estadoId, setEstadoId] = useState('');
  const [enDibujo, setEnDibujo] = useState(false);

  // Mapa
  const dibujarRef = useRef<DibujarPoligonoHandle>(null);
  const overlapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('idle');
  const [pointCount, setPointCount] = useState(0);
  const [capturandoGPS, setCapturandoGPS] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [center, setCenter] = useState<[number, number]>([23.6, -102.5]);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);
  const [searchPin, setSearchPin] = useState<[number, number] | null>(null);
  const [errorOverlap, setErrorOverlap] = useState<string | null>(null);
  const [parcelaEnPadron, setParcelaEnPadron] = useState<boolean | null>(null);

  // Paso 45 — Confirmación previa de parcela
  const [pendingUP, setPendingUP] = useState<{
    poligono: [number, number][];
    coords: { lat: number; lng: number };
    area: number;
  } | null>(null);

  // Nombre automático de cada parcela según su orden
  const nombreAutomaticoUP = (indice: number): string =>
    indice === 0 ? 'Parcela principal' : indice === 1 ? 'Parcela secundaria' : `Parcela ${indice + 1}`;

  // Validación de overlap en cliente contra las parcelas ya dibujadas en esta sesión
  // (en el registro no hay token aún, así que se valida localmente con turf).
  const validarOverlapLocal = (poly: [number, number][]): string | null => {
    if (poly.length < 3) return null;
    try {
      const nueva = turf.polygon([[...poly.map(([la, ln]) => [ln, la]), [poly[0][1], poly[0][0]]]]);
      for (let i = 0; i < ups.length; i++) {
        const ex = ups[i].poligono;
        if (!ex || ex.length < 3) continue;
        const exPoly = turf.polygon([[...ex.map(([la, ln]) => [ln, la]), [ex[0][1], ex[0][0]]]]);
        if (turf.booleanIntersects(nueva, exPoly)) {
          return `Esta parcela se intersecta con "${ups[i].nombre || nombreAutomaticoUP(i)}" que ya dibujaste. Dibújala en un área diferente.`;
        }
      }
    } catch { /* si turf falla, no bloquear */ }
    return null;
  };

  // Paso 25 — Aviso de privacidad
  const [avisoData, setAvisoData] = useState<AvisoData | null>(null);

  // Paso 6 — PIN
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Paso 7 — Encuesta de insumos (solo si alguna parcela quedó en Sinaloa)
  const [catalogoInsumos, setCatalogoInsumos] = useState<CatalogoInsumos | null>(null);
  const [catalogoCargando, setCatalogoCargando] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [encuestaRespuesta, setEncuestaRespuesta] = useState<'si' | 'no' | null>(null);
  const [encuestaLineas, setEncuestaLineas] = useState<LineaEncuestaUI[]>([]);
  const [mostrarFormLinea, setMostrarFormLinea] = useState(false);
  const [lineaEnEdicion, setLineaEnEdicion] = useState<number | null>(null);
  const [errorEncuesta, setErrorEncuesta] = useState<string | null>(null);

  const draftLineaVacia = {
    categoriaId: '', productoId: '', presentacionId: '',
    modoPresentacion: 'catalogo' as 'catalogo' | 'otra' | 'granel',
    presOtroEnvase: '', presOtroContenido: '', presOtroUnidad: '',
    granelUnidad: '', cantidad: '', mesCompra: '',
    nombreConocido: '', identificacionNoDisponible: false, preferenciaMarca: '',
  };
  const [draftLinea, setDraftLinea] = useState(draftLineaVacia);

  // Elegibilidad: al menos una parcela cuyo estado sea Sinaloa (determinada
  // por el nombre elegido en el selector de la parcela; el servidor vuelve a
  // determinarla con autoridad final a partir de state_id al guardar).
  const encuestaAplica = ups.some(u => (u.estado || '').trim().toLowerCase() === 'sinaloa');

  const cargarCatalogoInsumos = async () => {
    if (catalogoInsumos) return;
    setCatalogoCargando(true); setCatalogoError(null);
    try {
      const r = await fetch(`${BASE}/productor/auth/catalogo-insumos`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setCatalogoInsumos(d);
    } catch {
      setCatalogoError('No se pudo cargar el catálogo de insumos.');
    } finally {
      setCatalogoCargando(false);
    }
  };

  // Modo manual (registro sin padrón SADER)
  const [datosManual, setDatosManual] = useState<DatosManual>({
    nombres: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    telefono: '',
    correo: '',
    genero: '',
    estadoPadron: '',
    municipioPadron: '',
  });
  const [erroresManual, setErroresManual] = useState<Record<string, string>>({});
  const [datosDeRenapo, setDatosDeRenapo] = useState(false);

  const validarCURP = (c: string) =>
    /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(c.toUpperCase().trim());

  const consultarCURP = async () => {
    if (!validarCURP(curp)) {
      setError('El formato de la CURP no es válido.');
      return;
    }
    setCargando(true); setError(null); setErrorTipo(null); setErrorNombres(null);
    try {
      const res = await fetch(`${BASE}/productor/auth/consultar-curp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curp: curp.toUpperCase().trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.codigo === 'CURP_DUPLICADA') {
          setErrorTipo('duplicada');
          setErrorNombres(data.nombres || null);
          return;
        }
        if (data.codigo === 'PUEDE_ACTIVAR') {
          setErrorTipo('puede_activar');
          setErrorNombres(data.nombres || null);
          return;
        }
        // Bloqueos explícitos
        if (data.codigo === 'CURP_NO_VALIDA_RENAPO') {
          setError('Esta CURP no existe en el Registro Nacional de Población. Verifica que la escribiste correctamente.');
          return;
        }
        if (data.codigo === 'CURP_FALLECIDO') {
          setError('La CURP ingresada corresponde a una persona fallecida. No es posible crear una cuenta.');
          return;
        }
        if (data.codigo === 'VERIFICACION_NO_DISPONIBLE') {
          setError('No es posible verificar tu identidad en este momento. Intenta más tarde.');
          return;
        }
        // CURP no en padrón SADER pero RENAPO confirmó que existe y está viva → formulario manual
        if (
          (data.codigo === 'NO_EN_PADRON' || data.codigo === 'SADER_NO_DISPONIBLE') &&
          data.datos_renapo
        ) {
          setDatosManual(d => ({
            ...d,
            nombres:         data.datos_renapo.nombres      || '',
            apellidoPaterno: data.datos_renapo.apellido_pat || '',
            apellidoMaterno: data.datos_renapo.apellido_mat || '',
            genero:          data.datos_renapo.sexo === 'HOMBRE' ? 'H'
                           : data.datos_renapo.sexo === 'MUJER'  ? 'M' : '',
          }));
          setDatosDeRenapo(true);
          navigate(`/registro-nuevo?modo=manual&curp=${curp.toUpperCase().trim()}`);
          return;
        }
        setError(data.error || 'No se pudo verificar la CURP.');
        return;
      }
      setDatosPadron(data.datos);
      setTelefonoEditable(data.datos.telefono || '');
      // C14 — precargar estados si SADER no devuelve estado/municipio
      if (!data.datos.estado_padron || !data.datos.municipio_padron) cargarEstados();
      setPaso(2);
    } catch {
      setError('Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally { setCargando(false); }
  };

  const cargarEstados = async () => {
    try {
      const r = await fetch(`${BASE}/auth/states`);
      const d = await r.json();
      setEstados(Array.isArray(d) ? d : d.states || []);
    } catch { /* ignore */ }
  };

  const cargarMunicipios = async (sid: string) => {
    try {
      const r = await fetch(`${BASE}/auth/municipalities?state_id=${sid}`);
      const d = await r.json();
      setMunicipios(Array.isArray(d) ? d : d.municipalities || []);
    } catch { setMunicipios([]); }
  };

  useEffect(() => {
    if (!esModoManual) return;
    if (curpDesdeActivar) setCurp(curpDesdeActivar);
    cargarEstados();
    setPaso(2);
  }, [esModoManual]); // reacciona cuando React Router cambia los query params en la misma ruta

  useEffect(() => {
    if (paso === 4 && enDibujo && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {}, { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [paso, enDibujo]);

  const onUPDibujada = (poly: [number, number][], centro: { lat: number; lng: number }, area: number) => {
    const errOv = validarOverlapLocal(poly);
    if (errOv) {
      setErrorOverlap(errOv);
      if (overlapTimerRef.current) clearTimeout(overlapTimerRef.current);
      overlapTimerRef.current = setTimeout(() => setErrorOverlap(null), 2500);
      return;
    }
    setErrorOverlap(null);
    setPendingUP({ poligono: poly, coords: centro, area });
    setUpActual(prev => ({ ...prev, coincide_area: null, area_real_ha: '' }));
  };

  const confirmarUP = () => {
    if (pendingUP) {
      setUps(prev => [...prev, {
        ...upActual,
        areaCalc: pendingUP.area,
        coords: pendingUP.coords,
        poligono: pendingUP.poligono,
        area_real_ha: (upActual.coincide_area === false && upActual.area_real_ha) ? Number(upActual.area_real_ha) : pendingUP.area,
      }]);
      setPendingUP(null);
      setEnDibujo(false);
      setPaso(5); // Resumen
    }
  };

  const redibujarUP = () => {
    setPendingUP(null);
    setPointCount(0);
    setGpsMsg(null);
    setErrorOverlap(null);
    // El mapa ya está montado, solo reseteamos el dibujo
    setTimeout(() => dibujarRef.current?.startEdit?.(), 50);
  };

  const validarFormularioManual = (): boolean => {
    const errs: Record<string, string> = {};
    if (!datosManual.nombres.trim()) errs.nombres = 'Requerido';
    if (!datosManual.apellidoPaterno.trim()) errs.apellidoPaterno = 'Requerido';
    if (!datosManual.apellidoMaterno.trim()) errs.apellidoMaterno = 'Requerido';
    if (!datosManual.genero) errs.genero = 'Selecciona tu género';
    if (!datosManual.telefono || datosManual.telefono.length < 10) errs.telefono = 'Teléfono de 10 dígitos requerido';
    if (!datosManual.correo.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datosManual.correo)) errs.correo = 'Correo electrónico válido requerido';
    if (!datosManual.estadoPadron) errs.estadoPadron = 'Selecciona tu estado';
    if (!datosManual.municipioPadron) errs.municipioPadron = 'Selecciona tu municipio';
    setErroresManual(errs);
    return Object.keys(errs).length === 0;
  };

  // C14 — cargar municipios para el selector editable del paso 2
  const handleEstadoEditableChange = async (estadoId: string) => {
    setEstadoEditable(estadoId);
    setMunicipioEditable('');
    setMunicipiosDisponibles([]);
    if (!estadoId) return;
    try {
      const r = await fetch(`${BASE}/auth/municipalities?state_id=${estadoId}`);
      const d = await r.json();
      const lista = Array.isArray(d) ? d : (d.municipalities ?? []);
      setMunicipiosDisponibles(lista.map((m: any) => ({ id: String(m.municipality_id), name: m.name || m.municipality_name })));
    } catch { /* si falla, el selector queda vacío */ }
  };

  const registrar = async () => {
    if (pin !== confirmPin) { setError('Los PINs no coinciden.'); return; }
    if (pin.length !== 4) { setError('El PIN debe ser de 4 dígitos.'); return; }

    setCargando(true); setError(null);
    try {
      const upsPayload = ups.map((up, i) => ({
        lat: up.coords?.lat ?? null,
        lng: up.coords?.lng ?? null,
        poligono: up.poligono ?? null,
        area_calc_ha: up.areaCalc,
        area_real_ha: up.area_real_ha ?? up.areaCalc,
        coincide_area: up.coincide_area ?? true,
        estado_up: up.estado,
        municipio_up: up.municipio,
        nombre_up: up.nombre || nombreAutomaticoUP(i),
      }));

      const body = esModoManual ? {
        curp: curp.toUpperCase().trim(),
        nombres: datosManual.nombres,
        apellido_paterno: datosManual.apellidoPaterno,
        apellido_materno: datosManual.apellidoMaterno,
        fecha_nacimiento: null,
        genero: datosManual.genero || null,
        telefono: datosManual.telefono,
        correo: datosManual.correo || null,
        pin,
        ups: upsPayload,
      } : {
        curp: curp.toUpperCase().trim(),
        nombres: datosPadron?.nombres,
        apellido_paterno: datosPadron?.apellido_paterno,
        apellido_materno: datosPadron?.apellido_materno,
        fecha_nacimiento: datosPadron?.fecha_nacimiento,
        genero: datosPadron?.genero,
        telefono: telefonoEditable,
        correo: datosPadron?.correo,
        // C14 — usar valor editable si SADER devolvió vacío
        estado_padron:    datosPadron?.estado_padron || estadoEditable || null,
        municipio_padron: datosPadron?.municipio_padron || municipioEditable || null,
        pin,
        ups: upsPayload,
      };

      const encuestaInsumos = encuestaAplica ? {
        respuesta: encuestaRespuesta,
        lineas: encuestaRespuesta === 'si' ? encuestaLineas.map(l => ({
          producto_id: l.producto_id,
          presentacion_id: l.presentacion_id,
          presentacion_otro_envase: l.presentacion_otro_envase,
          presentacion_otro_contenido: l.presentacion_otro_contenido,
          presentacion_otro_unidad: l.presentacion_otro_unidad,
          a_granel: l.a_granel,
          cantidad: l.cantidad,
          mes_compra: l.mes_compra,
          nombre_conocido: l.nombre_conocido,
          preferencia_marca: l.preferencia_marca,
          identificacion_no_disponible: l.identificacion_no_disponible,
        })) : [],
      } : undefined;

      const res = await fetch(`${BASE}/productor/auth/registro-nuevo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          aviso_privacidad_aceptado: avisoData?.aceptado ?? true,
          aviso_privacidad_fecha: avisoData?.fecha ?? new Date().toISOString(),
          aviso_privacidad_lat: avisoData?.lat ?? null,
          aviso_privacidad_lng: avisoData?.lng ?? null,
          aviso_privacidad_version: avisoData?.version ?? '1.0',
          aviso_privacidad_foto_url: avisoData?.fotoUrl ?? null,
          encuesta_insumos: encuestaInsumos,
          idempotency_key: idempotencyKeyRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al registrar.'); return; }
      setPaso(99);
    } finally { setCargando(false); }
  };

  const handleBack = () => {
    if (paso === 6) setPaso(encuestaAplica ? 7 : 5);
    else if (paso === 7) setPaso(5);
    else if (paso === 5) {
      const lastUP = ups[ups.length - 1];
      if (lastUP) setUpActual({ estado: lastUP.estado, municipio: lastUP.municipio });
      setUps(prev => prev.slice(0, -1));
      setPaso(3);
    }
    else if (paso === 4 && enDibujo) {
      if (pendingUP) { redibujarUP(); }
      else { setEnDibujo(false); setPaso(3); }
    }
    else if (paso === 3) {
      if (ups.length > 0) setPaso(5);
      else setPaso(25); // volver al aviso, no a datos
    }
    else if (paso === 25) setPaso(2);
    else if (paso === 2) {
      // Siempre volver a paso 1 (CURP). En modo manual limpiar también la URL para evitar blank page.
      setPaso(1);
      if (esModoManual) navigate('/registro-nuevo', { replace: true });
    }
    else navigate('/login-productor');
  };

  // --- STYLES ---
  const inputCls = 'w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-2.5 sm:py-3.5 text-sm sm:text-base tracking-wide text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all';
  const labelCls = 'block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1 sm:mb-1.5';
  const btnCls = 'w-full bg-white hover:bg-white/90 active:bg-white/80 text-[#1A5C38] rounded-xl py-3 sm:py-4 text-sm sm:text-base font-bold disabled:opacity-30 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2';

  // --- MAPA (Paso 4) ---
  if (paso === 4 && enDibujo) {
    const puedeTerminar = pointCount >= 3;
    return (
      <div 
        className="h-[100dvh] flex flex-col overflow-hidden bg-[#0c2e1a]"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="bg-[#0c2e1a] px-4 py-3 flex items-center gap-3 z-10 shadow-md">
          <button onClick={handleBack} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div>
            <p className="text-[10px] font-bold text-green-300 uppercase tracking-wider">Geolocalización</p>
            <p className="text-xs text-white/80 mt-0.5">Parcela {ups.length + 1} — {upActual.municipio}, {upActual.estado}</p>
          </div>
        </div>
        <div className="flex-1 relative">
          <MapContainer ref={mapRef} center={center} zoom={mapReady ? 16 : 5} style={{ height: '100%', width: '100%' }} whenReady={() => setMapReady(true)}>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="© Esri" />
            <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" opacity={0.6} />
            <ParcelasExistentesLayer />
            <DibujarPoligonoUP
              ref={dibujarRef}
              onModeChange={mode => { setDrawMode(mode); if (mode !== 'idle') setErrorOverlap(null); }}
              onPointCountChange={n => { setPointCount(n); if (n > 0) setSearchPin(null); }}
              onPoligonoCompleto={(poly, centro, area) => { setSearchPin(null); onUPDibujada(poly, centro, area); }}
              onPoligonoEliminado={() => {}}
              onOverlap={({ pctOverlap }) => {
                setErrorOverlap(`Esta parcela se encima con una ya registrada en el sistema (${Math.round(pctOverlap * 100)}% de traslape). Ajusta el contorno para separarla.`);
                if (overlapTimerRef.current) clearTimeout(overlapTimerRef.current);
                overlapTimerRef.current = setTimeout(() => setErrorOverlap(null), 2500);
              }}
            />
            {/* Polígono visible durante confirmación */}
            {pendingUP && (
              <Polygon
                positions={pendingUP.poligono}
                pathOptions={{ color: '#4ade80', fillColor: '#22c55e', fillOpacity: 0.3, weight: 2.5, dashArray: '6 4' }}
              />
            )}
            {/* Pin de búsqueda — desaparece al empezar a dibujar */}
            {searchPin && !pendingUP && <SearchPinMarker position={searchPin} />}
          </MapContainer>

          {/* Buscador de dirección/localidad — ocultarlo en confirmación */}
          {!pendingUP && (
            <div
              className="absolute top-3 left-3 right-3 z-[1000] max-w-md mx-auto"
              onClick={e => e.stopPropagation()}
            >
              <NominatimSearch
                placeholder="Buscar dirección o localidad…"
                onSelect={(lat, lng) => { mapRef.current?.flyTo([lat, lng], 17); setSearchPin([lat, lng]); }}
              />
            </div>
          )}

          {/* ===== PANEL CONFIRMACIÓN (overlay encima del mapa) ===== */}
          {pendingUP ? (
            <div className="absolute bottom-0 left-0 right-0 z-[1000] animate-auth-in">
              {/* Backdrop difuminado en la parte superior */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none rounded-t-3xl" />
              <div className="relative bg-[#0c2e1a]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-6 shadow-2xl">
                {/* Handle */}
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

                <div className="mb-4">
                  <label className="block text-white/70 text-[12px] font-medium mb-1.5">Nombre de la parcela (opcional)</label>
                  <input
                    type="text" value={upActual.nombre || ''} onChange={e => setUpActual(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Ej: Parcela Norte, El Potrero, etc."
                    className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-2.5 text-white text-[14px] focus:ring-2 focus:ring-green-400/50 focus:outline-none placeholder-white/30"
                  />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                    <p className="text-green-300 font-black text-[17px] leading-none">{pendingUP.area.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</p>
                    <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Hectáreas</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                    <p className="text-white font-black text-[17px] leading-none">{pendingUP.poligono.length}</p>
                    <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Vértices</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                    <p className="text-white font-black text-[13px] leading-tight truncate">{upActual.municipio.split(' ')[0]}</p>
                    <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Municipio</p>
                  </div>
                </div>

                {/* ¿El área calculada coincide? */}
                <div className="mb-4">
                  <p className="text-white/70 text-[12px] font-medium mb-2">¿El área calculada coincide con tu parcela?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUpActual(prev => ({ ...prev, coincide_area: true, area_real_ha: '' }))}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ring-1 transition-all active:scale-[0.97] ${
                        upActual.coincide_area === true ? 'bg-green-500 text-white ring-green-400' : 'bg-white/5 text-white/70 ring-white/15'
                      }`}
                    >
                      Sí, coincide
                    </button>
                    <button
                      onClick={() => setUpActual(prev => ({ ...prev, coincide_area: false }))}
                      className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ring-1 transition-all active:scale-[0.97] ${
                        upActual.coincide_area === false ? 'bg-amber-500 text-white ring-amber-400' : 'bg-white/5 text-white/70 ring-white/15'
                      }`}
                    >
                      No, difiere
                    </button>
                  </div>
                  {upActual.coincide_area === false && (
                    <div className="mt-2.5 animate-fade-in">
                      <label className="block text-white/50 text-[11px] mb-1">Superficie real de tu parcela</label>
                      <div className="relative">
                        <input
                          type="number" value={upActual.area_real_ha || ''} onChange={e => setUpActual(prev => ({ ...prev, area_real_ha: e.target.value }))}
                          placeholder={String(pendingUP.area)} min="0.1" step="0.1" inputMode="decimal"
                          className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3 pr-12 text-white text-[16px] font-bold focus:ring-2 focus:ring-green-400/50 focus:outline-none placeholder-white/30"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-semibold">ha</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botones */}
                <div className="flex gap-2.5">
                  <button
                    onClick={redibujarUP}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
                  >
                    <Undo2 size={16} /> Redibujar
                  </button>
                  <button
                    onClick={confirmarUP}
                    disabled={upActual.coincide_area === undefined || upActual.coincide_area === null || (upActual.coincide_area === false && !upActual.area_real_ha)}
                    className="flex-[1.6] flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-white py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all shadow-lg shadow-green-900/50 disabled:opacity-40"
                  >
                    <CheckCircle2 size={17} /> Confirmar Parcela
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute bottom-4 left-4 right-4 z-[1000] max-w-md mx-auto space-y-2.5 animate-auth-in">
            {errorOverlap && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-3">
                <p className="text-red-700 text-sm font-medium flex items-center gap-1.5"><AlertTriangle size={14} /> {errorOverlap}</p>
                <p className="text-red-600 text-xs mt-1">Ajusta los puntos o redibuja en otra área.</p>
                <button onClick={() => { setErrorOverlap(null); dibujarRef.current?.startEdit?.(); }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-red-600 font-semibold underline">
                  <Pencil size={12} /> Editar puntos
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
                ? (<><Loader2 size={16} className="animate-spin" /> Obteniendo ubicación…</>)
                : (<><Footprints size={16} /> Estoy en este punto — registrar GPS</>)}
            </button>
            {gpsMsg && <p className="text-center text-[11px] text-green-200 bg-[#1A5C38]/80 backdrop-blur-md rounded-xl px-3 py-1.5 ring-1 ring-green-400/30">{gpsMsg}</p>}
            {pointCount > 0 && (
              <div className="flex gap-2">
                <button onClick={() => dibujarRef.current?.undoVertex()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all">
                  <Undo2 size={16} /> Deshacer
                </button>
                <button onClick={() => dibujarRef.current?.finishDraw()} disabled={!puedeTerminar}
                  className="flex-[1.4] flex items-center justify-center gap-1.5 bg-green-500 text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-green-900/50">
                  <CheckCircle2 size={17} /> {puedeTerminar ? `Continuar (${pointCount})` : `Faltan ${Math.max(0, 3 - pointCount)}`}
                </button>
              </div>
            )}
            {drawMode === 'editing' && (
              <button onClick={() => dibujarRef.current?.saveEdit()}
                className="w-full bg-green-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-green-900/50 active:scale-[0.98] transition-all">
                Guardar ajustes
              </button>
            )}
          </div>
          )}
        </div>
      </div>
    );
  }

  // Paso 25 — renderizado completo (toma toda la pantalla, sin el shell de abajo)
  if (paso === 25) {
    return (
      <AvisoPrivacidadStep
        nombreTitular={datosPadron ? `${datosPadron.nombres} ${datosPadron.apellido_paterno}` : ''}
        onAceptar={(datos) => {
          setAvisoData(datos);
          cargarEstados();
          setPaso(3);
        }}
        onBack={() => setPaso(2)}
      />
    );
  }

  // Helper para saber el "paso visual" en el header (1 al 4)
  const getVisualStep = () => {
    if (paso === 1) return 1;
    if (paso === 2) return 2;
    if (paso >= 3 && paso <= 5) return 3;
    if (paso === 6 || paso === 7) return 4;
    return 4;
  };

  const visualStep = getVisualStep();
  const stepLabels = ['Verificar CURP', 'Tus datos', 'Parcela', 'NIP'];
  const stepDesc   = ['Verificación en SADER', 'Información personal', 'Geolocalización', 'Contraseña de acceso'];

  const card = 'bg-white/[0.08] backdrop-blur-md ring-1 ring-white/10 rounded-2xl shadow-2xl shadow-black/30';
  const sectionTitle = (icon: React.ReactNode, title: string, subtitle: string, iconBg: string) => (
    <div className="flex items-start gap-3 px-1 mb-5">
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>{icon}</div>
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-[26px] font-bold text-white leading-tight">{title}</h1>
        <p className="text-white/45 text-sm mt-0.5">{subtitle}</p>
      </div>
    </div>
  );

  // ── Encuesta de insumos: helpers ──────────────────────────────────────
  const productosDeCategoria = catalogoInsumos
    ? catalogoInsumos.productos.filter(p => p.categoria_id === draftLinea.categoriaId)
    : [];
  const presentacionesDelProducto = catalogoInsumos
    ? catalogoInsumos.presentaciones.filter(p => p.producto_id === draftLinea.productoId)
    : [];
  const productoSeleccionado = catalogoInsumos?.productos.find(p => p.id === draftLinea.productoId) || null;

  const mesesDisponibles = (() => {
    if (!catalogoInsumos) return [];
    const inicio = new Date(catalogoInsumos.periodo_inicio);
    const fin = new Date(catalogoInsumos.periodo_fin);
    const meses: { valor: string; label: string }[] = [];
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const finMes = new Date(fin.getFullYear(), fin.getMonth(), 1);
    const nombresMes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    while (cursor <= finMes) {
      meses.push({
        valor: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: `${nombresMes[cursor.getMonth()]} ${cursor.getFullYear()}`,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return meses;
  })();

  // Vista previa de conversión (informativa; el servidor recalcula con autoridad).
  const previaCantidadBase = (): string | null => {
    const cantidad = Number(draftLinea.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
    const convertir = (valor: number, unidad: string): { v: number; u: string } | null => {
      if (unidad === 'semillas') return { v: valor, u: 'semillas' };
      if (unidad === 'g') return { v: valor / 1000, u: 'kg' };
      if (unidad === 'kg') return { v: valor, u: 'kg' };
      if (unidad === 'ton') return { v: valor * 1000, u: 'kg' };
      if (unidad === 'mL') return { v: valor / 1000, u: 'L' };
      if (unidad === 'L') return { v: valor, u: 'L' };
      return null;
    };
    if (draftLinea.modoPresentacion === 'granel') {
      if (!draftLinea.granelUnidad) return null;
      const c = convertir(cantidad, draftLinea.granelUnidad);
      return c ? `${cantidad} ${draftLinea.granelUnidad} = ${c.v.toFixed(2)} ${c.u}` : null;
    }
    if (draftLinea.modoPresentacion === 'catalogo') {
      const pres = presentacionesDelProducto.find(p => p.id === draftLinea.presentacionId);
      if (!pres || !Number.isInteger(cantidad)) return null;
      const c = convertir(pres.contenido * cantidad, pres.unidad);
      return c ? `${cantidad} ${pres.envase.toLowerCase()}${cantidad !== 1 ? 's' : ''} de ${pres.contenido} ${pres.unidad} = ${c.v.toFixed(2)} ${c.u}` : null;
    }
    // otra
    const contenido = Number(draftLinea.presOtroContenido);
    if (!Number.isFinite(contenido) || contenido <= 0 || !draftLinea.presOtroUnidad || !Number.isInteger(cantidad)) return null;
    const c = convertir(contenido * cantidad, draftLinea.presOtroUnidad);
    return c ? `${cantidad} × ${contenido} ${draftLinea.presOtroUnidad} = ${c.v.toFixed(2)} ${c.u}` : null;
  };

  const resetDraftLinea = () => { setDraftLinea(draftLineaVacia); setLineaEnEdicion(null); setMostrarFormLinea(false); setErrorEncuesta(null); };

  const guardarLineaDraft = () => {
    setErrorEncuesta(null);
    if (!draftLinea.categoriaId || !draftLinea.productoId) { setErrorEncuesta('Selecciona la categoría y el producto.'); return; }
    const cantidad = Number(draftLinea.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) { setErrorEncuesta('Indica una cantidad válida.'); return; }
    if (!draftLinea.mesCompra) { setErrorEncuesta('Indica el mes en que lo necesita.'); return; }

    const necesitaNombre = productoSeleccionado?.es_otro || productoSeleccionado?.requiere_nombre_conocido;
    if (productoSeleccionado?.es_otro && !draftLinea.nombreConocido.trim()) {
      setErrorEncuesta('Escribe el nombre que conoces del producto.'); return;
    }
    if (necesitaNombre && !productoSeleccionado?.es_otro && !draftLinea.nombreConocido.trim() && !draftLinea.identificacionNoDisponible) {
      setErrorEncuesta('Indica la variedad/fórmula que conoces, o marca que no la identificas.'); return;
    }

    let presentacionId: string | null = null;
    let presOtroEnvase: string | null = null;
    let presOtroContenido: number | null = null;
    let presOtroUnidad: string | null = null;
    let aGranel = false;
    let presentacionLabel = '';

    if (draftLinea.modoPresentacion === 'granel') {
      if (!draftLinea.granelUnidad) { setErrorEncuesta('Indica la unidad de la compra a granel.'); return; }
      if (!Number.isFinite(cantidad) || cantidad <= 0) { setErrorEncuesta('Indica una cantidad válida.'); return; }
      aGranel = true;
      presOtroUnidad = draftLinea.granelUnidad;
      presentacionLabel = `A granel (${draftLinea.granelUnidad})`;
    } else if (draftLinea.modoPresentacion === 'catalogo') {
      const pres = presentacionesDelProducto.find(p => p.id === draftLinea.presentacionId);
      if (!pres) { setErrorEncuesta('Selecciona una presentación.'); return; }
      if (!Number.isInteger(cantidad)) { setErrorEncuesta('La cantidad de envases debe ser un número entero.'); return; }
      presentacionId = pres.id;
      presentacionLabel = `${pres.envase} de ${pres.contenido} ${pres.unidad}`;
    } else {
      if (!draftLinea.presOtroEnvase.trim() || !draftLinea.presOtroContenido || !draftLinea.presOtroUnidad) {
        setErrorEncuesta('Especifica envase, contenido y unidad de la presentación.'); return;
      }
      if (!Number.isInteger(cantidad)) { setErrorEncuesta('La cantidad de envases debe ser un número entero.'); return; }
      presOtroEnvase = draftLinea.presOtroEnvase.trim();
      presOtroContenido = Number(draftLinea.presOtroContenido);
      presOtroUnidad = draftLinea.presOtroUnidad;
      presentacionLabel = `${presOtroEnvase} de ${presOtroContenido} ${presOtroUnidad}`;
    }

    const nueva: LineaEncuestaUI = {
      producto_id: draftLinea.productoId,
      producto_nombre: productoSeleccionado?.es_otro
        ? `${productoSeleccionado.nombre_visible}: ${draftLinea.nombreConocido.trim()}`
        : (productoSeleccionado?.nombre_visible || ''),
      presentacion_id: presentacionId,
      presentacion_label: presentacionLabel,
      presentacion_otro_envase: presOtroEnvase,
      presentacion_otro_contenido: presOtroContenido,
      presentacion_otro_unidad: presOtroUnidad,
      a_granel: aGranel,
      cantidad,
      mes_compra: draftLinea.mesCompra,
      nombre_conocido: draftLinea.nombreConocido.trim() || null,
      preferencia_marca: draftLinea.preferenciaMarca.trim() || null,
      identificacion_no_disponible: draftLinea.identificacionNoDisponible,
    };

    setEncuestaLineas(prev => {
      if (lineaEnEdicion !== null) {
        const copia = [...prev]; copia[lineaEnEdicion] = nueva; return copia;
      }
      return [...prev, nueva];
    });
    resetDraftLinea();
  };

  const editarLinea = (i: number) => {
    const l = encuestaLineas[i];
    const producto = catalogoInsumos?.productos.find(p => p.id === l.producto_id);
    setDraftLinea({
      categoriaId: producto?.categoria_id || '',
      productoId: l.producto_id,
      presentacionId: l.presentacion_id || '',
      modoPresentacion: l.a_granel ? 'granel' : (l.presentacion_id ? 'catalogo' : 'otra'),
      presOtroEnvase: l.presentacion_otro_envase || '',
      presOtroContenido: l.presentacion_otro_contenido != null ? String(l.presentacion_otro_contenido) : '',
      presOtroUnidad: l.a_granel ? '' : (l.presentacion_otro_unidad || ''),
      granelUnidad: l.a_granel ? (l.presentacion_otro_unidad || '') : '',
      cantidad: String(l.cantidad),
      mesCompra: l.mes_compra,
      nombreConocido: l.nombre_conocido || '',
      identificacionNoDisponible: l.identificacion_no_disponible,
      preferenciaMarca: l.preferencia_marca || '',
    });
    setLineaEnEdicion(i);
    setMostrarFormLinea(true);
  };

  const quitarLinea = (i: number) => setEncuestaLineas(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div
      className="fixed inset-0 flex bg-gradient-to-br from-[#061510] via-[#0b271a] to-[#142e1d]"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Fondo decorativo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-green-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 -left-20 w-80 h-80 rounded-full bg-green-400/[0.04] blur-3xl" />
      </div>

      {/* ── SIDEBAR — solo desktop, oculto en mapa ── */}
      {paso !== 4 && (
        <aside className="hidden lg:flex w-[260px] xl:w-[290px] flex-shrink-0 flex-col z-10 border-r border-white/[0.06] px-7 py-10">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 bg-green-400/15 rounded-xl flex items-center justify-center ring-1 ring-green-400/20">
              <UserCheck size={18} className="text-green-300" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">SIMAC</p>
              <p className="text-white/35 text-[11px] mt-0.5">Sistema de Maíz</p>
            </div>
          </div>

          {/* Pasos */}
          <nav className="flex-1 space-y-1.5">
            {stepLabels.map((label, i) => {
              const n = i + 1, done = visualStep > n, active = visualStep === n;
              return (
                <div key={n} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${active ? 'bg-white/[0.09] ring-1 ring-white/10' : ''}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${done ? 'bg-green-400' : active ? 'bg-white' : 'bg-white/[0.07] ring-1 ring-white/10'}`}>
                    {done ? <Check size={13} className="text-[#061510]" strokeWidth={3} /> : <span className={`text-[11px] font-bold ${active ? 'text-[#0b271a]' : 'text-white/25'}`}>{n}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${active ? 'text-white' : done ? 'text-green-300/80' : 'text-white/25'}`}>{label}</p>
                    <p className={`text-[11px] truncate ${active ? 'text-white/45' : 'text-white/15'}`}>{stepDesc[i]}</p>
                  </div>
                </div>
              );
            })}
          </nav>

          <p className="text-white/15 text-[11px] leading-relaxed">Secretaría de Agricultura<br />y Desarrollo Rural</p>
        </aside>
      )}

      {/* ── ÁREA DERECHA ── */}
      <div className="flex-1 flex flex-col min-w-0 z-10">

        {/* Header: back + stepper */}
        {paso < 99 && (
          <div className="flex-shrink-0 flex items-center gap-3 px-4 sm:px-6 lg:px-10 py-3.5 border-b border-white/[0.06]">
            <button onClick={handleBack} className="p-2 -ml-1 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors flex-shrink-0">
              <ChevronLeft size={20} className="text-white/55" />
            </button>

            {/* Stepper mobile/tablet — oculto en lg (sidebar) */}
            <div className="flex items-center gap-1 lg:hidden flex-1 justify-center">
              {stepLabels.map((label, i) => {
                const n = i + 1, done = visualStep > n, active = visualStep === n;
                return (
                  <div key={n} className="flex items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center transition-all ${done ? 'bg-green-400' : active ? 'bg-white' : 'bg-white/10 ring-1 ring-white/20'}`}>
                        {done ? <Check size={11} className="text-[#061510]" strokeWidth={3} /> : <span className={`text-[10px] font-bold ${active ? 'text-[#0b271a]' : 'text-white/30'}`}>{n}</span>}
                      </div>
                      <span className={`text-[8px] sm:text-[9px] font-medium hidden xs:block ${active ? 'text-white/60' : 'text-white/15'}`}>{label}</span>
                    </div>
                    {i < 3 && <div className={`w-6 sm:w-10 h-px mx-1 mb-3 ${done ? 'bg-green-400' : 'bg-white/12'}`} />}
                  </div>
                );
              })}
            </div>

            {/* Desktop: texto del paso actual */}
            <p className="hidden lg:block text-white/35 text-sm flex-1">
              Paso {visualStep} de 4 &nbsp;—&nbsp; <span className="text-white/65 font-medium">{stepLabels[visualStep - 1]}</span>
            </p>

            <div className="w-8 flex-shrink-0" />
          </div>
        )}

        {/* Contenido scrollable — my-auto para centrar cuando hay espacio */}
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full flex flex-col items-center px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
            <div className="w-full max-w-[540px] my-auto">

              {/* ── PASO 1: CURP ── */}
              {paso === 1 && (
                <div className="animate-auth-in">
                  <div className="text-center mb-7">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 bg-green-400/10 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-green-400/20">
                      <UserCheck size={28} className="text-green-300" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Nuevo Registro</h1>
                    <p className="text-white/45 text-sm sm:text-base mt-2">Verificaremos tu identidad en el padrón SADER</p>
                  </div>

                  <div className={`${card} p-5 sm:p-7`}>
                    <label className={labelCls}>Tu CURP</label>
                    <input
                      type="text" value={curp}
                      onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="AAAA000000AAAAAA00" maxLength={18}
                      className={`${inputCls} font-mono uppercase text-center text-xl sm:text-2xl tracking-widest`}
                    />
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[11px] text-white/30">18 caracteres</span>
                      <span className={`text-[11px] font-mono font-semibold ${curp.length === 18 ? 'text-green-400' : 'text-white/30'}`}>{curp.length}/18</span>
                    </div>
                    {error && !errorTipo && (
                      <div className="mt-4 p-3 bg-red-500/15 ring-1 ring-red-400/25 rounded-xl text-red-200 text-sm flex gap-2">
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /><span>{error}</span>
                      </div>
                    )}

                    {/* Cuenta duplicada — UI especial */}
                    {errorTipo === 'duplicada' && (
                      <div className="mt-4 rounded-xl ring-1 ring-amber-400/25 bg-amber-500/10 p-4 animate-auth-in">
                        <div className="flex items-start gap-2.5 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-400/15 ring-1 ring-amber-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <UserCheck size={15} className="text-amber-300" />
                          </div>
                          <div>
                            <p className="text-amber-200 font-bold text-sm leading-tight">Ya tienes una cuenta</p>
                            {errorNombres && <p className="text-amber-300/70 text-xs mt-0.5">Registrado como: <span className="font-semibold text-amber-200">{errorNombres}</span></p>}
                            <p className="text-amber-300/60 text-xs mt-1">Esta CURP ya está registrada en SIMAC. Inicia sesión con tu CURP y NIP.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate('/login-productor')}
                          className="w-full bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-[#1a1200] py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
                        >
                          <UserCheck size={15} /> Iniciar Sesión
                        </button>
                        <button
                          onClick={() => { setCurp(''); setErrorTipo(null); setErrorNombres(null); }}
                          className="w-full mt-2 text-amber-300/60 hover:text-amber-200 text-xs font-medium py-1.5 transition-colors"
                        >
                          Usar otra CURP
                        </button>
                      </div>
                    )}

                    {/* En padrón pero sin cuenta activa */}
                    {errorTipo === 'puede_activar' && (
                      <div className="mt-4 rounded-xl ring-1 ring-sky-400/25 bg-sky-500/10 p-4 animate-auth-in">
                        <div className="flex items-start gap-2.5 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-sky-400/15 ring-1 ring-sky-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <AlertTriangle size={15} className="text-sky-300" />
                          </div>
                          <div>
                            <p className="text-sky-200 font-bold text-sm leading-tight">CURP en el padrón SIMAC</p>
                            {errorNombres && <p className="text-sky-300/70 text-xs mt-0.5">Nombre registrado: <span className="font-semibold text-sky-200">{errorNombres}</span></p>}
                            <p className="text-sky-300/60 text-xs mt-1">Tu CURP ya está en SIMAC pero tu cuenta no ha sido activada. Contacta a tu técnico territorial.</p>
                          </div>
                        </div>
                        <button
                          onClick={() => { setCurp(''); setErrorTipo(null); setErrorNombres(null); }}
                          className="w-full mt-1 text-sky-300/60 hover:text-sky-200 text-xs font-medium py-1.5 transition-colors"
                        >
                          Usar otra CURP
                        </button>
                      </div>
                    )}

                    {!errorTipo && (
                      <button onClick={consultarCURP} disabled={curp.length !== 18 || cargando} className={`mt-5 ${btnCls}`}>
                        {cargando ? <><Loader2 size={17} className="animate-spin" /> Verificando…</> : <><Search size={17} /> Verificar Identidad</>}
                      </button>
                    )}
                  </div>

                  <p className="text-center mt-5">
                    <button onClick={() => navigate('/login-productor')} className="text-sm text-green-300/70 hover:text-green-200 transition-colors font-medium">
                      ¿Ya tienes cuenta? Iniciar sesión
                    </button>
                  </p>
                </div>
              )}

              {/* ── PASO 2: MANUAL ── */}
              {paso === 2 && esModoManual && (
                <div className="animate-auth-in">
                  {sectionTitle(<Pencil size={16} className="text-amber-300" />, 'Registro manual', 'Tu CURP no está en SADER. Completa tus datos.', 'bg-amber-500/15 ring-1 ring-amber-400/20')}

                  <div className={`${card} p-5 sm:p-6`}>
                    {/* CURP */}
                    <div className="mb-4 pb-4 border-b border-white/[0.08]">
                      <label className={labelCls}>CURP</label>
                      <input type="text" value={curp}
                        onChange={e => setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="AAAA000000AAAAAA00" maxLength={18}
                        className={`${inputCls} font-mono uppercase text-center text-base tracking-widest`} />
                      <p className={`text-[11px] font-mono text-right mt-1 ${curp.length === 18 ? 'text-green-400' : 'text-white/20'}`}>{curp.length}/18</p>
                    </div>

                    {datosDeRenapo && (
                      <div className="flex items-center gap-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl px-4 py-2.5 mb-4">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <p className="text-emerald-300 text-xs font-medium">CURP verificada correctamente en RENAPO. Nombre y apellidos confirmados.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5">
                      <div>
                        <label className={labelCls}>Nombre(s) <span className="text-red-400">*</span></label>
                        <input type="text" value={datosManual.nombres}
                          onChange={e => !datosDeRenapo && setDatosManual(p => ({ ...p, nombres: e.target.value }))}
                          readOnly={datosDeRenapo}
                          placeholder="Juan Carlos"
                          className={`${inputCls} ${datosDeRenapo ? 'opacity-70 cursor-not-allowed select-none' : ''}`} />
                        {erroresManual.nombres && <p className="text-red-300 text-[11px] mt-1">{erroresManual.nombres}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Apellido Paterno <span className="text-red-400">*</span></label>
                        <input type="text" value={datosManual.apellidoPaterno}
                          onChange={e => !datosDeRenapo && setDatosManual(p => ({ ...p, apellidoPaterno: e.target.value }))}
                          readOnly={datosDeRenapo}
                          placeholder="García"
                          className={`${inputCls} ${datosDeRenapo ? 'opacity-70 cursor-not-allowed select-none' : ''}`} />
                        {erroresManual.apellidoPaterno && <p className="text-red-300 text-[11px] mt-1">{erroresManual.apellidoPaterno}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Apellido Materno <span className="text-red-400">*</span></label>
                        <input type="text" value={datosManual.apellidoMaterno}
                          onChange={e => !datosDeRenapo && setDatosManual(p => ({ ...p, apellidoMaterno: e.target.value }))}
                          readOnly={datosDeRenapo}
                          placeholder="López"
                          className={`${inputCls} ${datosDeRenapo ? 'opacity-70 cursor-not-allowed select-none' : ''}`} />
                        {erroresManual.apellidoMaterno && <p className="text-red-300 text-[11px] mt-1">{erroresManual.apellidoMaterno}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Género <span className="text-red-400">*</span></label>
                        <select value={datosManual.genero}
                          onChange={e => setDatosManual(p => ({ ...p, genero: e.target.value }))}
                          className={`${inputCls} appearance-none [&>option]:text-gray-900`}>
                          <option value="">Selecciona...</option>
                          <option value="M">Masculino</option>
                          <option value="F">Femenino</option>
                        </select>
                        {erroresManual.genero && <p className="text-red-300 text-[11px] mt-1">{erroresManual.genero}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Teléfono <span className="text-red-400">*</span></label>
                        <input type="tel" inputMode="numeric" value={datosManual.telefono}
                          onChange={e => setDatosManual(p => ({ ...p, telefono: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                          placeholder="10 dígitos" maxLength={10} className={inputCls} />
                        {erroresManual.telefono && <p className="text-red-300 text-[11px] mt-1">{erroresManual.telefono}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Correo electrónico <span className="text-red-400">*</span></label>
                        <input type="email" value={datosManual.correo}
                          onChange={e => setDatosManual(p => ({ ...p, correo: e.target.value }))}
                          placeholder="correo@ejemplo.com" className={inputCls} />
                        {erroresManual.correo && <p className="text-red-300 text-[11px] mt-1">{erroresManual.correo}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Estado <span className="text-red-400">*</span></label>
                        <select value={estadoId}
                          onChange={e => {
                            const sel = estados.find(s => String(s.state_id) === e.target.value);
                            setEstadoId(e.target.value);
                            setDatosManual(p => ({ ...p, estadoPadron: sel?.name || sel?.state_name || '', municipioPadron: '' }));
                            setMunicipios([]);
                            if (e.target.value) cargarMunicipios(e.target.value);
                          }}
                          className={`${inputCls} appearance-none [&>option]:text-gray-900`}>
                          <option value="">Selecciona...</option>
                          {estados.map(s => <option key={s.state_id} value={s.state_id}>{s.name || s.state_name}</option>)}
                        </select>
                        {erroresManual.estadoPadron && <p className="text-red-300 text-[11px] mt-1">{erroresManual.estadoPadron}</p>}
                      </div>
                      <div>
                        <label className={labelCls}>Municipio <span className="text-red-400">*</span></label>
                        <select value={datosManual.municipioPadron}
                          onChange={e => setDatosManual(p => ({ ...p, municipioPadron: e.target.value }))}
                          disabled={!estadoId}
                          className={`${inputCls} appearance-none [&>option]:text-gray-900 disabled:opacity-35`}>
                          <option value="">{estadoId ? 'Selecciona...' : 'Elige estado primero'}</option>
                          {municipios.map(m => <option key={m.municipality_id} value={m.name || m.municipality_name}>{m.name || m.municipality_name}</option>)}
                        </select>
                        {erroresManual.municipioPadron && <p className="text-red-300 text-[11px] mt-1">{erroresManual.municipioPadron}</p>}
                      </div>
                    </div>

                    <button onClick={() => { if (validarFormularioManual()) setPaso(3); }} className={`mt-5 ${btnCls}`}>
                      <Check size={17} /> Continuar
                    </button>
                  </div>
                </div>
              )}

              {/* ── PASO 2: SADER ENCONTRADO ── */}
              {paso === 2 && datosPadron && !esModoManual && (
                <div className="animate-auth-in">
                  {sectionTitle(<CheckCircle2 size={16} className="text-green-300" />, 'Identidad verificada', 'Encontramos tu registro en el padrón SADER.', 'bg-green-500/15 ring-1 ring-green-400/20')}

                  <div className={`${card} p-5 sm:p-6`}>
                    {/* Perfil */}
                    <div className="flex items-center gap-3.5 pb-4 border-b border-white/[0.08] mb-4">
                      <div className="w-12 h-12 rounded-xl bg-green-500/15 ring-1 ring-green-400/25 flex items-center justify-center flex-shrink-0">
                        <UserCheck size={22} className="text-green-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-base sm:text-lg leading-tight">
                          {datosPadron.nombres} {datosPadron.apellido_paterno} {datosPadron.apellido_materno}
                        </p>
                        <p className="text-green-300/60 text-xs font-mono mt-0.5">{datosPadron.curp}</p>
                      </div>
                    </div>

                    {/* Fecha y género — siempre de solo lectura */}
                    <div className="grid grid-cols-2 gap-2.5 mb-4">
                      {[
                        { l: 'Fecha de nac.', v: datosPadron.fecha_nacimiento || '—' },
                        { l: 'Género', v: datosPadron.genero === 'H' ? 'Masculino' : datosPadron.genero === 'M' ? 'Femenino' : '—' },
                      ].map(it => (
                        <div key={it.l} className="bg-white/[0.05] rounded-xl px-3 py-2.5 ring-1 ring-white/[0.07]">
                          <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wide">{it.l}</p>
                          <p className="text-sm font-medium text-white mt-0.5 truncate">{it.v}</p>
                        </div>
                      ))}
                    </div>

                    {/* Estado — solo lectura si SADER lo tiene; editable si viene vacío */}
                    {datosPadron.estado_padron ? (
                      <div className="bg-white/[0.05] rounded-xl px-3 py-2.5 ring-1 ring-white/[0.07] mb-2.5">
                        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wide">Estado</p>
                        <p className="text-sm font-medium text-white mt-0.5">{datosPadron.estado_padron}</p>
                      </div>
                    ) : (
                      <div className="mb-2.5">
                        <label className={labelCls}>
                          Estado <span className="text-amber-400 normal-case font-normal text-[10px]">— no disponible en el padrón, selecciona</span>
                        </label>
                        <select
                          value={estadoEditable}
                          onChange={e => handleEstadoEditableChange(e.target.value)}
                          className={`${inputCls} appearance-none [&>option]:text-gray-900`}
                        >
                          <option value="">Selecciona tu estado</option>
                          {estados.map(e => (
                            <option key={e.state_id} value={e.state_id}>{e.name || e.state_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Municipio — solo lectura si SADER lo tiene; editable si viene vacío */}
                    {datosPadron.municipio_padron ? (
                      <div className="bg-white/[0.05] rounded-xl px-3 py-2.5 ring-1 ring-white/[0.07] mb-4">
                        <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wide">Municipio</p>
                        <p className="text-sm font-medium text-white mt-0.5">{datosPadron.municipio_padron}</p>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <label className={labelCls}>
                          Municipio <span className="text-amber-400 normal-case font-normal text-[10px]">— no disponible en el padrón, selecciona</span>
                        </label>
                        <select
                          value={municipioEditable}
                          onChange={e => setMunicipioEditable(e.target.value)}
                          disabled={!estadoEditable}
                          className={`${inputCls} appearance-none [&>option]:text-gray-900 disabled:opacity-35`}
                        >
                          <option value="">
                            {estadoEditable ? 'Selecciona tu municipio' : 'Primero selecciona el estado'}
                          </option>
                          {municipiosDisponibles.map(m => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="mb-4">
                      <label className={labelCls}>Teléfono <span className="text-white/25 normal-case font-normal text-[10px]">— puedes editarlo</span></label>
                      <input type="tel" value={telefonoEditable}
                        onChange={e => setTelefonoEditable(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10 dígitos" maxLength={10} className={inputCls} />
                    </div>

                    <button
                      onClick={() => { if (!esModoManual) cargarEstados(); setPaso(25); }}
                      disabled={
                        (!datosPadron.estado_padron && !estadoEditable) ||
                        (!datosPadron.municipio_padron && !municipioEditable)
                      }
                      className={`${btnCls} disabled:opacity-30`}
                    >
                      <Check size={17} /> Confirmar y Continuar
                    </button>
                  </div>
                </div>
              )}

              {/* ── PASO 3: UBICACIÓN UP ── */}
              {paso === 3 && (
                <div className="animate-auth-in">
                  {sectionTitle(<MapPin size={15} className="text-sky-300" />, ups.length === 0 ? 'Ubicación de parcela' : `Parcela ${ups.length + 1}`, 'Estado y municipio donde se encuentra tu parcela.', 'bg-sky-500/15 ring-1 ring-sky-400/20')}

                  <div className={`${card} p-5 sm:p-6 space-y-4`}>
                    <div>
                      <label className={labelCls}>Nombre de la parcela <span className="text-white/25 font-normal normal-case text-[10px]">— opcional</span></label>
                      <input type="text" value={upActual.nombre || ''}
                        onChange={e => setUpActual(prev => ({ ...prev, nombre: e.target.value }))}
                        placeholder="Ej: Parcela Norte, El Potrero…" className={`${inputCls} mt-0.5`} />
                    </div>

                    {datosPadron?.estado_padron && ups.length === 0 && parcelaEnPadron === null ? (
                      <div>
                        <p className="text-white/50 text-sm mb-2.5">Según SADER, tu domicilio registrado es:</p>
                        <div className="bg-green-500/10 ring-1 ring-green-400/20 rounded-xl px-4 py-3 mb-3">
                          <p className="text-green-200 font-semibold">{datosPadron.municipio_padron}, {datosPadron.estado_padron}</p>
                        </div>
                        <p className="text-white/50 text-sm mb-3">¿Tu parcela está en ese municipio?</p>
                        <div className="grid grid-cols-2 gap-2.5">
                          <button onClick={() => { setParcelaEnPadron(true); setUpActual({ estado: datosPadron.estado_padron || '', municipio: datosPadron.municipio_padron || '' }); setEnDibujo(true); setPaso(4); }}
                            className="py-3 rounded-xl bg-green-500 hover:bg-green-400 text-white font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
                            <Check size={15} /> Sí, ahí está
                          </button>
                          <button onClick={() => setParcelaEnPadron(false)}
                            className="py-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] ring-1 ring-white/15 text-white font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all">
                            <Search size={15} /> No, es otro lugar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
                          <div>
                            <label className={labelCls}>Estado</label>
                            <select value={estadoId}
                              onChange={e => { const sel = estados.find(s => String(s.state_id) === e.target.value); setEstadoId(e.target.value); setUpActual({ estado: sel?.name || sel?.state_name || '', municipio: '' }); setMunicipios([]); if (e.target.value) cargarMunicipios(e.target.value); }}
                              className={`${inputCls} appearance-none [&>option]:text-gray-900`}>
                              <option value="">Selecciona...</option>
                              {estados.map(s => <option key={s.state_id} value={s.state_id}>{s.name || s.state_name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Municipio</label>
                            <select value={upActual.municipio || ''} disabled={!estadoId}
                              onChange={e => setUpActual(prev => ({ ...prev, municipio: e.target.value }))}
                              className={`${inputCls} appearance-none [&>option]:text-gray-900 disabled:opacity-35`}>
                              <option value="">{estadoId ? 'Selecciona...' : 'Elige estado primero'}</option>
                              {municipios.map(m => <option key={m.municipality_id} value={m.name || m.municipality_name}>{m.name || m.municipality_name}</option>)}
                            </select>
                          </div>
                        </div>
                        {error && <div className="mb-3 p-3 bg-red-500/15 ring-1 ring-red-400/25 rounded-xl text-red-200 text-sm">{error}</div>}
                        <button
                          onClick={() => { if (!upActual.estado || !upActual.municipio) { setError('Selecciona estado y municipio.'); return; } setError(null); setEnDibujo(true); setPaso(4); }}
                          disabled={!upActual.estado || !upActual.municipio}
                          className={btnCls}>
                          <Map size={17} /> Ir al Mapa
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── PASO 5: ¿OTRA UP? ── */}
              {paso === 5 && (
                <div className="animate-auth-in">
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-3 ring-1 ring-green-400/30">
                      <CheckCircle2 size={26} className="text-green-300" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Parcela guardada</h1>
                    <p className="text-white/45 text-sm mt-1">{ups.length} {ups.length === 1 ? 'parcela registrada' : 'parcelas registradas'}</p>
                  </div>

                  <div className={`${card} p-5 sm:p-6`}>
                    <div className="space-y-2 mb-5">
                      {ups.map((up, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white/[0.05] rounded-xl p-3 ring-1 ring-white/[0.07]">
                          <div className="w-8 h-8 rounded-lg bg-green-500/15 ring-1 ring-green-400/25 flex items-center justify-center text-green-300 font-bold text-sm flex-shrink-0">{i + 1}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate">{up.nombre || nombreAutomaticoUP(i)}</p>
                            <p className="text-xs text-white/40">{up.municipio}, {up.estado}{up.areaCalc ? ` · ${up.areaCalc.toFixed(2)} ha` : ''}</p>
                          </div>
                          <Check size={14} className="text-green-400 flex-shrink-0" />
                        </div>
                      ))}
                    </div>

                    <p className="text-center text-white/55 text-sm font-medium mb-3.5">¿Tienes otra parcela?</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button onClick={() => { setUpActual({ estado: '', municipio: '' }); setEstadoId(''); setMunicipios([]); setParcelaEnPadron(false); setPaso(3); }}
                        className="py-3 bg-white/[0.08] hover:bg-white/[0.12] ring-1 ring-white/15 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]">
                        <Plus size={16} /> Agregar otra
                      </button>
                      <button
                        onClick={() => { if (encuestaAplica) { cargarCatalogoInsumos(); setPaso(7); } else setPaso(6); }}
                        className="py-3 bg-white hover:bg-white/90 text-[#0b271a] rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]">
                        {encuestaAplica ? 'Continuar' : 'Crear NIP'} <ChevronLeft size={14} className="rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── PASO 7: ENCUESTA DE INSUMOS (solo Sinaloa) ── */}
              {paso === 7 && (
                <div className="animate-auth-in">
                  {sectionTitle(<Search size={15} className="text-amber-300" />, '¿Qué insumos necesita comprar?', 'Paso adicional para productores de Sinaloa.', 'bg-amber-500/15 ring-1 ring-amber-400/20')}

                  <div className={`${card} p-5 sm:p-6 space-y-4`}>
                    <p className="text-white/60 text-[13px] leading-relaxed">
                      Cuéntenos qué necesita comprar para sus parcelas de Sinaloa durante los próximos seis meses
                      {catalogoInsumos && (
                        <> ({new Date(catalogoInsumos.periodo_inicio).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })} – {new Date(catalogoInsumos.periodo_fin).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })})</>
                      )}. La Secretaría usará esta información para buscar mejores condiciones de compra. No es un pedido ni garantiza un descuento.
                    </p>

                    {catalogoCargando && (
                      <div className="flex items-center justify-center py-6 gap-2 text-white/50 text-sm"><Loader2 size={16} className="animate-spin" /> Cargando catálogo…</div>
                    )}
                    {catalogoError && (
                      <div className="p-3 bg-red-500/15 ring-1 ring-red-400/25 rounded-xl text-red-200 text-sm text-center">
                        {catalogoError}
                        <button onClick={cargarCatalogoInsumos} className="block mx-auto mt-2 underline">Reintentar</button>
                      </div>
                    )}

                    {catalogoInsumos && (
                      <>
                        <div>
                          <p className={labelCls}>¿Tiene previsto comprar insumos?</p>
                          <div className="grid grid-cols-2 gap-2.5 mt-1.5">
                            <button
                              onClick={() => { setEncuestaRespuesta('si'); setErrorEncuesta(null); }}
                              className={`py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.97] ${encuestaRespuesta === 'si' ? 'bg-white text-[#0b271a]' : 'bg-white/[0.08] ring-1 ring-white/15 text-white'}`}>
                              Sí
                            </button>
                            <button
                              onClick={() => { setEncuestaRespuesta('no'); setEncuestaLineas([]); resetDraftLinea(); }}
                              className={`py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.97] ${encuestaRespuesta === 'no' ? 'bg-white text-[#0b271a]' : 'bg-white/[0.08] ring-1 ring-white/15 text-white'}`}>
                              No tengo compras previstas
                            </button>
                          </div>
                        </div>

                        {encuestaRespuesta === 'si' && !mostrarFormLinea && (
                          <>
                            {encuestaLineas.length > 0 && (
                              <div className="space-y-2">
                                {encuestaLineas.map((l, i) => (
                                  <div key={i} className="bg-white/[0.05] rounded-xl p-3 ring-1 ring-white/[0.07]">
                                    <p className="text-sm font-semibold text-white">{l.producto_nombre}</p>
                                    <p className="text-xs text-white/45 mt-0.5">{l.cantidad} · {l.presentacion_label} · {mesesDisponibles.find(m => m.valor === l.mes_compra)?.label || l.mes_compra}</p>
                                    <div className="flex gap-3 mt-1.5">
                                      <button onClick={() => editarLinea(i)} className="text-[11px] font-semibold text-amber-300">Cambiar</button>
                                      <button onClick={() => quitarLinea(i)} className="text-[11px] font-semibold text-red-300">Quitar</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button onClick={() => setMostrarFormLinea(true)}
                              className="w-full py-3 bg-white/[0.08] hover:bg-white/[0.12] ring-1 ring-white/15 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]">
                              <Plus size={16} /> Agregar {encuestaLineas.length > 0 ? 'otro' : 'un'} producto
                            </button>
                          </>
                        )}

                        {encuestaRespuesta === 'si' && mostrarFormLinea && (
                          <div className="space-y-3.5 bg-white/[0.04] rounded-xl p-3.5 ring-1 ring-white/[0.08]">
                            <div>
                              <label className={labelCls}>Categoría</label>
                              <select value={draftLinea.categoriaId}
                                onChange={e => setDraftLinea(d => ({ ...d, categoriaId: e.target.value, productoId: '', presentacionId: '' }))}
                                className={inputCls}>
                                <option value="" className="text-black">Selecciona una categoría</option>
                                {catalogoInsumos.categorias.map(c => <option key={c.id} value={c.id} className="text-black">{c.nombre}</option>)}
                              </select>
                              {draftLinea.categoriaId && (
                                <p className="text-[11px] text-white/40 mt-1">{catalogoInsumos.categorias.find(c => c.id === draftLinea.categoriaId)?.ayuda}</p>
                              )}
                            </div>

                            {draftLinea.categoriaId && (
                              <div>
                                <label className={labelCls}>Producto o fórmula</label>
                                <select value={draftLinea.productoId}
                                  onChange={e => setDraftLinea(d => ({ ...d, productoId: e.target.value, presentacionId: '', modoPresentacion: 'catalogo' }))}
                                  className={inputCls}>
                                  <option value="" className="text-black">Selecciona un producto</option>
                                  {productosDeCategoria.map(p => <option key={p.id} value={p.id} className="text-black">{p.nombre_visible}</option>)}
                                </select>
                              </div>
                            )}

                            {productoSeleccionado?.es_otro && (
                              <div>
                                <label className={labelCls}>Nombre que conoce del producto</label>
                                <input type="text" value={draftLinea.nombreConocido}
                                  onChange={e => setDraftLinea(d => ({ ...d, nombreConocido: e.target.value }))}
                                  placeholder="Ej. nombre en la etiqueta" className={inputCls} />
                              </div>
                            )}
                            {productoSeleccionado?.requiere_nombre_conocido && !productoSeleccionado.es_otro && (
                              <div>
                                <label className={labelCls}>Variedad/fórmula que conoce</label>
                                <input type="text" value={draftLinea.nombreConocido}
                                  disabled={draftLinea.identificacionNoDisponible}
                                  onChange={e => setDraftLinea(d => ({ ...d, nombreConocido: e.target.value }))}
                                  placeholder="Ej. híbrido o fórmula" className={`${inputCls} disabled:opacity-40`} />
                                <label className="flex items-center gap-2 mt-2 text-xs text-white/60">
                                  <input type="checkbox" checked={draftLinea.identificacionNoDisponible}
                                    onChange={e => setDraftLinea(d => ({ ...d, identificacionNoDisponible: e.target.checked, nombreConocido: e.target.checked ? '' : d.nombreConocido }))} />
                                  No identifico la variedad/fórmula
                                </label>
                              </div>
                            )}

                            {draftLinea.productoId && (
                              <div>
                                <label className={labelCls}>Presentación</label>
                                <div className="flex gap-2 mb-2">
                                  {presentacionesDelProducto.length > 0 && (
                                    <button onClick={() => setDraftLinea(d => ({ ...d, modoPresentacion: 'catalogo' }))}
                                      className={`flex-1 py-2 rounded-lg text-xs font-semibold ${draftLinea.modoPresentacion === 'catalogo' ? 'bg-white text-[#0b271a]' : 'bg-white/[0.08] text-white/70'}`}>Del catálogo</button>
                                  )}
                                  <button onClick={() => setDraftLinea(d => ({ ...d, modoPresentacion: 'otra' }))}
                                    className={`flex-1 py-2 rounded-lg text-xs font-semibold ${draftLinea.modoPresentacion === 'otra' ? 'bg-white text-[#0b271a]' : 'bg-white/[0.08] text-white/70'}`}>Otra</button>
                                  <button onClick={() => setDraftLinea(d => ({ ...d, modoPresentacion: 'granel' }))}
                                    className={`flex-1 py-2 rounded-lg text-xs font-semibold ${draftLinea.modoPresentacion === 'granel' ? 'bg-white text-[#0b271a]' : 'bg-white/[0.08] text-white/70'}`}>A granel</button>
                                </div>

                                {draftLinea.modoPresentacion === 'catalogo' && (
                                  <select value={draftLinea.presentacionId}
                                    onChange={e => setDraftLinea(d => ({ ...d, presentacionId: e.target.value }))}
                                    className={inputCls}>
                                    <option value="" className="text-black">Selecciona una presentación</option>
                                    {presentacionesDelProducto.map(p => <option key={p.id} value={p.id} className="text-black">{p.envase} de {p.contenido} {p.unidad}</option>)}
                                  </select>
                                )}
                                {draftLinea.modoPresentacion === 'otra' && (
                                  <div className="grid grid-cols-3 gap-2">
                                    <input type="text" placeholder="Envase" value={draftLinea.presOtroEnvase}
                                      onChange={e => setDraftLinea(d => ({ ...d, presOtroEnvase: e.target.value }))} className={`${inputCls} col-span-1`} />
                                    <input type="number" placeholder="Contenido" value={draftLinea.presOtroContenido}
                                      onChange={e => setDraftLinea(d => ({ ...d, presOtroContenido: e.target.value }))} className={`${inputCls} col-span-1`} />
                                    <select value={draftLinea.presOtroUnidad}
                                      onChange={e => setDraftLinea(d => ({ ...d, presOtroUnidad: e.target.value }))} className={`${inputCls} col-span-1`}>
                                      <option value="" className="text-black">Unidad</option>
                                      {['kg','g','ton','L','mL','semillas'].map(u => <option key={u} value={u} className="text-black">{u}</option>)}
                                    </select>
                                  </div>
                                )}
                                {draftLinea.modoPresentacion === 'granel' && (
                                  <select value={draftLinea.granelUnidad}
                                    onChange={e => setDraftLinea(d => ({ ...d, granelUnidad: e.target.value }))} className={inputCls}>
                                    <option value="" className="text-black">Unidad de compra a granel</option>
                                    {['kg','g','ton','L','mL'].map(u => <option key={u} value={u} className="text-black">{u}</option>)}
                                  </select>
                                )}
                              </div>
                            )}

                            {draftLinea.productoId && (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className={labelCls}>¿Cuántos necesita comprar?</label>
                                  <input type="number" inputMode="decimal" value={draftLinea.cantidad}
                                    onChange={e => setDraftLinea(d => ({ ...d, cantidad: e.target.value }))}
                                    placeholder="0" className={inputCls} />
                                </div>
                                <div>
                                  <label className={labelCls}>¿Para qué mes los necesita?</label>
                                  <select value={draftLinea.mesCompra}
                                    onChange={e => setDraftLinea(d => ({ ...d, mesCompra: e.target.value }))} className={inputCls}>
                                    <option value="" className="text-black">Selecciona el mes</option>
                                    {mesesDisponibles.map(m => <option key={m.valor} value={m.valor} className="text-black">{m.label}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}

                            {previaCantidadBase() && (
                              <p className="text-[11px] text-amber-200 bg-amber-500/10 ring-1 ring-amber-400/20 rounded-lg px-3 py-1.5">{previaCantidadBase()}</p>
                            )}

                            {draftLinea.productoId && (
                              <div>
                                <label className={labelCls}>Marca de preferencia (opcional)</label>
                                <input type="text" value={draftLinea.preferenciaMarca}
                                  onChange={e => setDraftLinea(d => ({ ...d, preferenciaMarca: e.target.value }))}
                                  placeholder="Opcional" className={inputCls} />
                              </div>
                            )}

                            <p className="text-[11px] text-white/40">Incluya solo lo que necesita comprar; no lo que ya tiene o recibirá como apoyo.</p>

                            {errorEncuesta && <div className="p-2.5 bg-red-500/15 ring-1 ring-red-400/25 rounded-lg text-red-200 text-xs text-center">{errorEncuesta}</div>}

                            <div className="grid grid-cols-2 gap-2.5">
                              <button onClick={resetDraftLinea} className="py-3 bg-white/[0.08] ring-1 ring-white/15 text-white rounded-xl font-semibold text-sm">Cancelar</button>
                              <button onClick={guardarLineaDraft} className="py-3 bg-white text-[#0b271a] rounded-xl font-bold text-sm">Guardar producto</button>
                            </div>
                          </div>
                        )}

                        {!mostrarFormLinea && (
                          <>
                            {errorEncuesta && <div className="p-2.5 bg-red-500/15 ring-1 ring-red-400/25 rounded-lg text-red-200 text-xs text-center">{errorEncuesta}</div>}
                            <button
                              onClick={() => {
                                if (!encuestaRespuesta) { setErrorEncuesta('Responde si tiene o no compras previstas.'); return; }
                                if (encuestaRespuesta === 'si' && encuestaLineas.length === 0) { setErrorEncuesta('Agrega al menos un producto.'); return; }
                                setPaso(6);
                              }}
                              className={btnCls}>
                              Continuar con mi registro
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── PASO 6: NIP ── */}
              {paso === 6 && (
                <div className="animate-auth-in">
                  {sectionTitle(<KeyRound size={15} className="text-violet-300" />, 'Crea tu NIP', '4 dígitos para acceder junto con tu CURP.', 'bg-violet-500/15 ring-1 ring-violet-400/20')}

                  <div className={`${card} p-5 sm:p-6`}>
                    <div className="grid grid-cols-2 gap-4 mb-1">
                      <div>
                        <label className={`${labelCls} text-center`}>NIP</label>
                        <input type="password" inputMode="numeric" value={pin}
                          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="••••" maxLength={4}
                          className={`${inputCls} text-center text-3xl tracking-[1em] indent-[1em]`} />
                      </div>
                      <div>
                        <label className={`${labelCls} text-center`}>Confirmar</label>
                        <input type="password" inputMode="numeric" value={confirmPin}
                          onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="••••" maxLength={4}
                          className={`${inputCls} text-center text-3xl tracking-[1em] indent-[1em] ${confirmPin.length === 4 && pin !== confirmPin ? 'ring-red-400/50' : ''}`} />
                      </div>
                    </div>
                    {confirmPin.length === 4 && pin !== confirmPin && (
                      <p className="text-red-300 text-xs text-center mb-3 flex items-center justify-center gap-1.5 mt-2">
                        <AlertTriangle size={11} /> Los NIPs no coinciden
                      </p>
                    )}
                    {error && <div className="mt-3 p-3 bg-red-500/15 ring-1 ring-red-400/25 rounded-xl text-red-200 text-sm text-center mb-1">{error}</div>}
                    <button onClick={registrar}
                      disabled={pin.length !== 4 || confirmPin.length !== 4 || pin !== confirmPin || cargando}
                      className={`mt-4 ${btnCls}`}>
                      {cargando ? <><Loader2 size={17} className="animate-spin" /> Registrando…</> : <><CheckCircle2 size={18} /> Finalizar Registro</>}
                    </button>
                  </div>
                </div>
              )}

              {/* ── PASO 99: ÉXITO ── */}
              {paso === 99 && (
                <div className="animate-auth-in text-center py-8">
                  <div className="w-20 h-20 bg-green-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(74,222,128,0.35)]" style={{ animation: 'pfPop 0.5s ease' }}>
                    <Check size={40} className="text-[#061510]" strokeWidth={3} />
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">¡Registro Exitoso!</h2>
                  <p className="text-white/50 mb-8 text-base">Tu cuenta de productor ha sido creada.</p>
                  <button onClick={() => navigate('/login-productor')}
                    className="w-full bg-white hover:bg-white/90 active:scale-[0.98] text-[#0b271a] py-3.5 rounded-xl font-bold text-base transition-all shadow-lg">
                    Iniciar Sesión
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
