import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Search, Eye, EyeOff, ShieldAlert, RefreshCw, Warehouse, BarChart3, X, CheckCircle,
  Weight, Package, Percent, FileText, LayoutGrid, MapPin, Edit3,
  Phone, Calendar, Building2, Save, Loader2, Table2, Navigation2, Trash2, AlertTriangle,
  Users, Mail, Lock
} from 'lucide-react';
import { usePermisosStore } from '../../store/permisos';

mapboxgl.accessToken = [
  'pk.eyJ1IjoibWFyaWVsMDgi',
  'LCJhIjoiY202emV3MDhhMDN6Y',
  'jJscHVqaXExdGpjMyJ9.F_ACoKzS_4e280lD0XndEw',
].join('');

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

interface Bodega {
  id: number;
  nombre: string;
  encargado_nombre: string;
  telefono: string;
  capacidad_total: number;
  estado: string;
  municipio: string;
  localidad?: string;
  direccion?: string;
  latitud: number;
  longitud: number;
  estatus: 'aprobada' | 'pendiente' | 'rechazada';
  semaforo_compra: 'sin_actividad' | 'verde' | 'amarillo' | 'rojo';
  stock_actual?: number;
  clave?: string;
  region_nombre?: string;
  created_at?: string;
  fecha_creacion?: string;
}

const ESTATUS_CFG = {
  aprobada:  { label: 'Aprobada',  color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  pendiente: { label: 'Pendiente', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  rechazada: { label: 'Rechazada', color: 'text-red-600 bg-red-50 border-red-200' },
};
const SEM_CFG = {
  verde:        { label: 'Comprando',    dot: 'bg-emerald-500' },
  amarillo:     { label: 'Limitado',     dot: 'bg-amber-400' },
  rojo:         { label: 'No compra',    dot: 'bg-red-500' },
  sin_actividad:{ label: 'Sin actividad',dot: 'bg-gray-300' },
};

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)); }
  catch { return d; }
}

interface BodegaAsociada {
  bodega_id: number;
  bodega_nombre: string;
  bodega_estado: string;
  bodega_municipio: string;
  bodega_estatus: string;
  asociacion_estatus: string; // pendiente | aprobada | rechazada
}

interface UsuarioBodega {
  id: number;
  nombre_completo: string;
  email: string;
  telefono: string;
  rol: string;
  activo: boolean;
  curp?: string;
  created_at: string;
  aviso_privacidad_aceptado?: boolean;
  aviso_privacidad_fecha?: string;
  bodegas: BodegaAsociada[];
  // legacy (detalle individual)
  bodega_id?: number;
  bodega_nombre?: string;
  bodega_estado?: string;
  bodega_municipio?: string;
  bodega_localidad?: string;
  bodega_direccion?: string;
  capacidad_ton?: number;
  bodega_estatus?: string;
  bodega_telefono?: string;
}

export default function BodegasAdminPage() {
  const navigate = useNavigate();

  const puedo         = usePermisosStore(s => s.puedo);
  const permisosTotal = usePermisosStore(s => s.permisosTotal); // true solo para admin/responsable
  const puedeEditar   = permisosTotal || puedo('bodegas', 'editar');
  const puedeEliminar   = permisosTotal || puedo('bodegas', 'eliminar');
  const puedeVerDetalle = permisosTotal || puedo('bodegas', 'ver_detalle');
  // "Por aprobar" y "Usuarios" son acciones/datos exclusivos de admin y responsable —
  // un OREF (rol=user) jamás debe verlas, sin importar sus permisos de vista.
  const soloAdminVeTabsGestion = permisosTotal;

  const [bodegas, setBodegas]   = useState<Bodega[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<'bodegas' | 'lista' | 'estadisticas' | 'pendientes' | 'usuarios'>('bodegas');

  // Defensa en profundidad: si el tab activo es exclusivo de admin y el usuario
  // no tiene permisos totales, regresarlo a la vista general.
  useEffect(() => {
    if ((tab === 'pendientes' || tab === 'usuarios') && !soloAdminVeTabsGestion) setTab('bodegas');
  }, [tab, soloAdminVeTabsGestion]);

  // Solicitudes de asociación bodeguero↔bodega
  interface SolicitudBodega {
    id: number; estatus: string; fecha_solicitud: string;
    usuario_id: number; nombre_completo: string; email: string; telefono: string; rol: string;
    bodega_id: number; bodega_nombre: string; bodega_estado: string; bodega_municipio: string;
    bodega_estatus: string; capacidad_ton?: number;
  }
  const [solicitudes,     setSolicitudes]     = useState<SolicitudBodega[]>([]);
  const [solicLoad,       setSolicLoad]       = useState(false);
  const [solicAccionLoad, setSolicAccionLoad] = useState<number | null>(null);

  // Selección múltiple — "Por aprobar"
  const [seleccionBodegasPend, setSeleccionBodegasPend] = useState<Set<number>>(new Set());
  const [seleccionSolicitudes, setSeleccionSolicitudes] = useState<Set<number>>(new Set());
  const [bulkAprobandoBodegas, setBulkAprobandoBodegas] = useState(false);
  const [bulkAprobandoSolic,   setBulkAprobandoSolic]   = useState(false);
  const [solicModal,      setSolicModal]      = useState<SolicitudBodega | null>(null);

  function esNuevo(fecha: string) {
    return (Date.now() - new Date(fecha).getTime()) < 24 * 60 * 60 * 1000;
  }

  async function cargarSolicitudes() {
    setSolicLoad(true);
    try {
      const r = await fetch(`${BASE}/admin/solicitudes-bodega`, { headers: HDR() });
      if (r.ok) setSolicitudes((await r.json()).solicitudes || []);
    } finally { setSolicLoad(false); }
  }

  async function procesarSolicitud(id: number, accion: 'aprobar' | 'rechazar') {
    setSolicAccionLoad(id);
    try {
      await fetch(`${BASE}/admin/solicitudes-bodega/${id}/${accion}`, { method: 'PATCH', headers: HDR() });
      setSolicitudes(s => s.filter(x => x.id !== id));
      setSeleccionSolicitudes(prev => { const n = new Set(prev); n.delete(id); return n; });
      showToast(accion === 'aprobar' ? 'Solicitud aprobada' : 'Solicitud rechazada', accion === 'aprobar');
    } catch { showToast('Error al procesar solicitud', false); }
    finally { setSolicAccionLoad(null); }
  }

  function toggleSeleccionSolicitud(id: number) {
    setSeleccionSolicitudes(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSeleccionarTodasSolicitudes() {
    setSeleccionSolicitudes(prev =>
      prev.size === solicitudes.length ? new Set() : new Set(solicitudes.map(s => s.id))
    );
  }

  /** Aprueba en paralelo las solicitudes indicadas (o todas si no se pasa lista). */
  async function aprobarSolicitudesMasivo(ids?: number[]) {
    const objetivo = ids ?? Array.from(seleccionSolicitudes);
    if (objetivo.length === 0) return;
    setBulkAprobandoSolic(true);
    try {
      const resultados = await Promise.allSettled(
        objetivo.map(id =>
          fetch(`${BASE}/admin/solicitudes-bodega/${id}/aprobar`, { method: 'PATCH', headers: HDR() })
            .then(r => { if (!r.ok) throw new Error(); return id; })
        )
      );
      const exitosos = new Set(
        resultados.filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled').map(r => r.value)
      );
      const fallidos = objetivo.length - exitosos.size;
      setSolicitudes(prev => prev.filter(s => !exitosos.has(s.id)));
      setSeleccionSolicitudes(prev => {
        const n = new Set(prev);
        exitosos.forEach(id => n.delete(id));
        return n;
      });
      if (exitosos.size > 0) {
        showToast(
          fallidos > 0
            ? `${exitosos.size} solicitud(es) aprobada(s), ${fallidos} falló(aron)`
            : `${exitosos.size} solicitud(es) aprobada(s) correctamente`,
          fallidos === 0
        );
      } else {
        showToast('No se pudo aprobar ninguna solicitud', false);
      }
    } finally {
      setBulkAprobandoSolic(false);
    }
  }

  // Usuarios bodega
  const [usuarios,       setUsuarios]       = useState<UsuarioBodega[]>([]);
  const [usuariosLoad,   setUsuariosLoad]   = useState(false);
  const [usuarioSearch,  setUsuarioSearch]  = useState('');
  const [usuarioModal,   setUsuarioModal]   = useState<UsuarioBodega | null>(null);
  const [editUsuario, setEditUsuario] = useState<Partial<UsuarioBodega> | null>(null);
  const [editUsuErr, setEditUsuErr]   = useState('');
  const [editPassword, setEditPassword]     = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [guardandoUsu, setGuardandoUsu]     = useState(false);
  const [deleteUsuario,  setDeleteUsuario]  = useState<UsuarioBodega | null>(null);
  const [deleteUsuLoad,  setDeleteUsuLoad]  = useState(false);
  const debUsuRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stats, setStats]       = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Filtros
  const [search, setSearch]         = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [estatusFilter, setEstatusFilter] = useState('');

  // Mapa
  const mapContainer   = useRef<HTMLDivElement>(null);
  const map            = useRef<mapboxgl.Map | null>(null);
  const mapReady       = useRef(false);
  const mapInitialized = useRef(false);
  const popupRef       = useRef<mapboxgl.Popup | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Modal detalle
  const [detalleTarget, setDetalleTarget] = useState<Bodega | null>(null);
  const [detalleData, setDetalleData]     = useState<any>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  // Modal editar
  const [editTarget, setEditTarget]   = useState<Bodega | null>(null);
  const [editForm, setEditForm]       = useState<Partial<Bodega>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError]     = useState('');

  // Modal aprobar/rechazar
  const [modalAccion, setModalAccion] = useState<{ tipo: 'aprobar' | 'rechazar'; bodega: Bodega } | null>(null);
  const [accionLoading, setAccionLoading] = useState(false);

  // Modal eliminar
  const [deleteTarget, setDeleteTarget]   = useState<Bodega | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  /* ─── CARGA ─── */
  async function cargarBodegas() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/bodegas`, { headers: HDR() });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json();
      const lista = (data.bodegas || data).map((b: any) => ({
        id: b.id || b.bodega_id,
        nombre: b.nombre || 'Sin nombre',
        encargado_nombre: b.encargado_nombre || b.nombre_encargado || '',
        telefono: b.telefono || '',
        capacidad_total: parseFloat(b.capacidad_ton || b.capacidad_total || '0'),
        estado: b.estado || '',
        municipio: b.municipio || '',
        localidad: b.localidad || '',
        direccion: b.direccion || '',
        latitud: parseFloat(b.latitud || b.lat || '23.6'),
        longitud: parseFloat(b.longitud || b.lng || '-102.5'),
        estatus: b.estatus || 'aprobada',
        semaforo_compra: b.semaforo_compra || 'sin_actividad',
        stock_actual: parseFloat(b.stock_actual || '0'),
        clave: b.clave || '',
        region_nombre: b.region_nombre || '',
        created_at: b.created_at || b.fecha_creacion,
      }));

      // Mezclar pendientes
      try {
        const rp = await fetch(`${BASE}/admin/bodegas-pendientes`, { headers: HDR() });
        if (rp.ok) {
          const pend = await rp.json();
          const pendList = (pend.bodegas || pend || []).map((b: any) => ({
            id: b.id || b.bodega_id, nombre: b.nombre || 'Bodega Pendiente',
            encargado_nombre: b.encargado_nombre || '', telefono: b.telefono || '',
            capacidad_total: parseFloat(b.capacidad_ton || b.capacidad_total || '0'),
            estado: b.estado || '', municipio: b.municipio || '',
            latitud: parseFloat(b.latitud || '20.3'), longitud: parseFloat(b.longitud || '-102.7'),
            estatus: 'pendiente' as const, semaforo_compra: 'amarillo' as const, stock_actual: 0,
          }));
          const merged = [...lista];
          pendList.forEach((p: any) => { if (!merged.find(m => m.id === p.id)) merged.push(p); });
          setBodegas(merged);
        } else setBodegas(lista);
      } catch { setBodegas(lista); }
    } catch (e) {
      console.error(e);
      setBodegas([]);
    } finally {
      setLoading(false);
    }
  }

  function calcularStatsLocal(lista: Bodega[]) {
    const cap = lista.reduce((s, b) => s + (b.capacidad_total || 0), 0);
    const stk = lista.reduce((s, b) => s + (b.stock_actual || 0), 0);
    return {
      capacidad_total: cap,
      stock_total: stk,
      pct_ocupacion: cap > 0 ? ((stk / cap) * 100).toFixed(1) : '0',
      con_tarifario: lista.filter(b => b.estatus === 'aprobada').length,
      ventanillas_activas: lista.filter(b => b.estatus === 'aprobada').length,
      total: lista.length,
      aprobadas: lista.filter(b => b.estatus === 'aprobada').length,
      pendientes: lista.filter(b => b.estatus === 'pendiente').length,
    };
  }

  function cargarStats() {
    // Cálculo inmediato desde datos ya en memoria — sin esperar al API
    setStats(calcularStatsLocal(bodegas));
    setStatsLoading(false);

    // Enriquecimiento opcional en background (tarifarios reales, ventanillas)
    fetch(`${BASE}/admin/bodegas/estadisticas`, { headers: HDR() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && data.capacidad_total != null) setStats((prev: any) => ({ ...prev, ...data })); })
      .catch(() => {});
  }

  async function cargarUsuarios(q = '') {
    setUsuariosLoad(true);
    try {
      const r = await fetch(`${BASE}/admin/usuarios-bodega?q=${encodeURIComponent(q)}`, { headers: HDR() });
      const d = await r.json();
      setUsuarios(d.usuarios || []);
    } catch { setUsuarios([]); }
    finally { setUsuariosLoad(false); }
  }


  async function eliminarUsuario() {
    if (!deleteUsuario) return;
    setDeleteUsuLoad(true);
    try {
      const r = await fetch(`${BASE}/admin/usuarios-bodega/${deleteUsuario.id}`, { method: 'DELETE', headers: HDR() });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      showToast('Usuario eliminado');
      setDeleteUsuario(null);
      setUsuarioModal(null);
      cargarUsuarios(usuarioSearch);
    } catch (e: any) { showToast(e.message, false); }
    finally { setDeleteUsuLoad(false); }
  }

  async function guardarUsuario() {
    if (!usuarioModal || !editUsuario) return;
    if (editPassword && editPassword.length < 6) {
      setEditUsuErr('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setGuardandoUsu(true);
    setEditUsuErr('');
    try {
      const body: Record<string, unknown> = {
        nombre_completo: editUsuario.nombre_completo,
        email:           editUsuario.email,
        telefono:        editUsuario.telefono,
        activo:          editUsuario.activo,
      };
      if (editPassword) body.password = editPassword;

      const r = await fetch(`${BASE}/admin/usuarios-bodega/${usuarioModal.id}`, {
        method: 'PATCH',
        headers: { ...HDR(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');

      showToast('Usuario actualizado');
      setEditPassword('');
      setShowEditPassword(false);
      setEditUsuario(null);
      setUsuarioModal(null);
      cargarUsuarios(usuarioSearch);
    } catch (e: any) {
      setEditUsuErr(e.message);
    } finally {
      setGuardandoUsu(false);
    }
  }

  useEffect(() => { cargarBodegas(); }, []);
  useEffect(() => { if (tab === 'estadisticas') cargarStats(); }, [tab, bodegas]);
  useEffect(() => { if (tab === 'usuarios') cargarUsuarios(); }, [tab]);
  useEffect(() => { if (tab === 'pendientes') cargarSolicitudes(); }, [tab]);

  /* ─── FILTRADO ─── */
  const filteredList = bodegas.filter(b => {
    if (search && !b.nombre.toLowerCase().includes(search.toLowerCase()) &&
        !b.municipio.toLowerCase().includes(search.toLowerCase())) return false;
    if (estadoFilter && b.estado !== estadoFilter) return false;
    if (estatusFilter && b.estatus !== estatusFilter) return false;
    return true;
  });

  /* ─── MAPBOX INIT ─── */
  function buildGeoJSON(list: Bodega[]) {
    return {
      type: 'FeatureCollection' as const,
      features: list.map(b => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [b.longitud, b.latitud] },
        properties: { id: b.id, nombre: b.nombre, municipio: b.municipio,
          estado: b.estado, estatus: b.estatus, semaforo: b.semaforo_compra,
          capacidad: b.capacidad_total, encargado: b.encargado_nombre },
      })),
    };
  }

  const initMap = useCallback(() => {
    if (mapInitialized.current || !mapContainer.current) return;
    mapInitialized.current = true;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-102.5528, 23.6345],
      zoom: 5,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.current.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

    map.current.on('load', () => {
      mapReady.current = true;
      map.current!.addSource('bodegas', { type: 'geojson', data: buildGeoJSON(bodegas) });

      // Halo de selección
      map.current!.addLayer({
        id: 'bodegas-halo',
        type: 'circle',
        source: 'bodegas',
        filter: ['==', ['get', 'id'], -1],
        paint: {
          'circle-radius': 22,
          'circle-color': '#1A5C38',
          'circle-opacity': 0.18,
          'circle-stroke-width': 0,
        },
      });

      // Círculos principales
      map.current!.addLayer({
        id: 'bodegas-circles',
        type: 'circle',
        source: 'bodegas',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 10, 11, 14, 14],
          'circle-color': ['case',
            ['==', ['get', 'estatus'], 'aprobada'],  '#10B981',
            ['==', ['get', 'estatus'], 'pendiente'], '#f59e0b',
            '#9CA3AF',
          ],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 10, 2.5],
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      // Punto central de selección
      map.current!.addLayer({
        id: 'bodegas-selected',
        type: 'circle',
        source: 'bodegas',
        filter: ['==', ['get', 'id'], -1],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 10, 14, 14, 17],
          'circle-color': '#1A5C38',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 1,
        },
      });

      // Cursor
      map.current!.on('mouseenter', 'bodegas-circles', () => {
        map.current!.getCanvas().style.cursor = 'pointer';
      });
      map.current!.on('mouseleave', 'bodegas-circles', () => {
        map.current!.getCanvas().style.cursor = '';
      });

      // Click en marker
      map.current!.on('click', 'bodegas-circles', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const p = feat.properties as any;
        const coords = (feat.geometry as any).coordinates as [number, number];

        setSelectedId(p.id);
        map.current!.setFilter('bodegas-selected', ['==', ['get', 'id'], p.id]);
        map.current!.setFilter('bodegas-halo',     ['==', ['get', 'id'], p.id]);
        map.current!.flyTo({ center: coords, zoom: Math.max(map.current!.getZoom(), 11), duration: 900 });

        if (popupRef.current) popupRef.current.remove();
        popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '260px', offset: 16 })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-family:system-ui,-apple-system,sans-serif;padding:4px 2px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <span style="width:8px;height:8px;border-radius:50%;background:${
                  p.estatus === 'aprobada' ? '#10B981' : p.estatus === 'pendiente' ? '#f59e0b' : '#9CA3AF'
                };flex-shrink:0;display:inline-block;"></span>
                <span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:${
                  p.estatus === 'aprobada' ? '#065f46' : p.estatus === 'pendiente' ? '#92400e' : '#374151'
                };">${p.estatus}</span>
              </div>
              <h4 style="font-size:13px;font-weight:800;color:#111827;margin:0 0 3px;line-height:1.3;">${p.nombre}</h4>
              <p style="font-size:11px;color:#6B7280;margin:0 0 8px;">📍 ${p.municipio}, ${p.estado}</p>
              <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:10px;padding:8px 10px;font-size:11px;color:#374151;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                  <span style="color:#9CA3AF;">Capacidad</span>
                  <strong>${Number(p.capacidad||0).toLocaleString()} t</strong>
                </div>
                ${p.encargado ? `<div style="display:flex;justify-content:space-between;">
                  <span style="color:#9CA3AF;">Encargado</span>
                  <strong style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.encargado}</strong>
                </div>` : ''}
              </div>
              <button onclick="window.__bodegaNav(${p.id})"
                style="width:100%;background:#1A5C38;color:#fff;border:none;border-radius:12px;padding:9px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.01em;">
                Ver ficha completa →
              </button>
            </div>
          `)
          .addTo(map.current!);
      });

      // Click en mapa vacío
      map.current!.on('click', (e) => {
        const feats = map.current!.queryRenderedFeatures(e.point, { layers: ['bodegas-circles'] });
        if (!feats.length) {
          setSelectedId(null);
          map.current!.setFilter('bodegas-selected', ['==', ['get', 'id'], -1]);
          map.current!.setFilter('bodegas-halo',     ['==', ['get', 'id'], -1]);
        }
      });
    });
  }, [bodegas]);

  // Exponer navigate para el popup HTML
  useEffect(() => {
    (window as any).__bodegaNav = (id: number) => navigate(`/admin/bodegas/${id}`);
    return () => { delete (window as any).__bodegaNav; };
  }, [navigate]);

  // Inicializar mapa cuando se va a la pestaña lista
  useEffect(() => {
    if (tab === 'lista') {
      setTimeout(() => initMap(), 50);
    }
  }, [tab, initMap]);

  // Actualizar GeoJSON cuando cambia la lista filtrada
  useEffect(() => {
    if (!mapReady.current || !map.current) return;
    const src = map.current.getSource('bodegas') as mapboxgl.GeoJSONSource | undefined;
    src?.setData(buildGeoJSON(filteredList));
  }, [filteredList]);

  function focusBodega(b: Bodega) {
    setSelectedId(b.id);
    if (map.current && mapReady.current) {
      map.current.setFilter('bodegas-selected', ['==', ['get', 'id'], b.id]);
      map.current.setFilter('bodegas-halo',     ['==', ['get', 'id'], b.id]);
      map.current.flyTo({ center: [b.longitud, b.latitud], zoom: 12, duration: 1200 });
    }
  }

  /* ─── DETALLE ─── */
  async function abrirDetalle(b: Bodega) {
    setDetalleTarget(b);
    setDetalleData(null);
    setDetalleLoading(true);
    try {
      const r = await fetch(`${BASE}/bodegas/${b.id}`, { headers: HDR() });
      if (r.ok) { const d = await r.json(); setDetalleData(d.bodega || d); }
    } catch {}
    setDetalleLoading(false);
  }

  /* ─── EDITAR ─── */
  function abrirEditar(b: Bodega) {
    setEditTarget(b);
    setEditForm({
      nombre: b.nombre, estado: b.estado, municipio: b.municipio,
      localidad: b.localidad || '', direccion: b.direccion || '',
      telefono: b.telefono, capacidad_total: b.capacidad_total, estatus: b.estatus,
    });
    setEditError('');
  }

  async function guardarEdicion() {
    if (!editTarget) return;
    setEditLoading(true); setEditError('');
    try {
      const body = {
        nombre: editForm.nombre, estado: editForm.estado, municipio: editForm.municipio,
        localidad: editForm.localidad, direccion: editForm.direccion, telefono: editForm.telefono,
        capacidad_ton: editForm.capacidad_total, estatus: editForm.estatus,
      };
      const r = await fetch(`${BASE}/admin/bodegas/${editTarget.id}`, {
        method: 'PATCH', headers: { ...HDR(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      setBodegas(prev => prev.map(b => b.id === editTarget.id ? {
        ...b, nombre: editForm.nombre || b.nombre, estado: editForm.estado || b.estado,
        municipio: editForm.municipio || b.municipio, localidad: editForm.localidad,
        direccion: editForm.direccion, telefono: editForm.telefono || b.telefono,
        capacidad_total: Number(editForm.capacidad_total) || b.capacidad_total,
        estatus: (editForm.estatus as any) || b.estatus,
      } : b));
      setEditTarget(null);
      showToast(`Bodega "${editForm.nombre}" actualizada`);
    } catch (e: any) {
      setEditError(e.message || 'Error al guardar');
    } finally {
      setEditLoading(false);
    }
  }

  /* ─── ELIMINAR BODEGA ─── */
  async function confirmarEliminar() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const r = await fetch(`${BASE}/admin/bodegas/${deleteTarget.id}`, {
        method: 'DELETE', headers: HDR(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      setBodegas(prev => prev.filter(b => b.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDetalleTarget(null);
      showToast(`Bodega "${deleteTarget.nombre}" eliminada`);
    } catch (e: any) {
      showToast(e.message || 'Error al eliminar', false);
      setDeleteLoading(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  /* ─── APROBAR/RECHAZAR ─── */
  async function procesarAccion() {
    if (!modalAccion) return;
    setAccionLoading(true);
    try {
      const r = await fetch(`${BASE}/bodegas/${modalAccion.bodega.id}/${modalAccion.tipo}`, {
        method: 'PATCH', headers: HDR(),
      });
      if (!r.ok) throw new Error(`Error al ${modalAccion.tipo}`);
      const nuevoEstatus = modalAccion.tipo === 'aprobar' ? 'aprobada' : 'rechazada';
      setBodegas(prev => prev.map(b => b.id === modalAccion.bodega.id ? { ...b, estatus: nuevoEstatus as any } : b));
      showToast(`Bodega ${modalAccion.tipo === 'aprobar' ? 'aprobada' : 'rechazada'} correctamente`);
      setSeleccionBodegasPend(prev => { const n = new Set(prev); n.delete(modalAccion.bodega.id); return n; });
    } catch (e: any) { showToast(e.message, false); }
    finally { setModalAccion(null); setAccionLoading(false); }
  }

  function toggleSeleccionBodegaPend(id: number) {
    setSeleccionBodegasPend(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSeleccionarTodasBodegasPend() {
    const pendientesIds = bodegas.filter(b => b.estatus === 'pendiente').map(b => b.id);
    setSeleccionBodegasPend(prev =>
      prev.size === pendientesIds.length ? new Set() : new Set(pendientesIds)
    );
  }

  /** Aprueba en paralelo las bodegas indicadas (o todas si no se pasa lista). */
  async function aprobarBodegasMasivo(ids?: number[]) {
    const objetivo = ids ?? Array.from(seleccionBodegasPend);
    if (objetivo.length === 0) return;
    setBulkAprobandoBodegas(true);
    try {
      const resultados = await Promise.allSettled(
        objetivo.map(id =>
          fetch(`${BASE}/bodegas/${id}/aprobar`, { method: 'PATCH', headers: HDR() })
            .then(r => { if (!r.ok) throw new Error(); return id; })
        )
      );
      const exitosos = new Set(
        resultados.filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled').map(r => r.value)
      );
      const fallidos = objetivo.length - exitosos.size;
      setBodegas(prev => prev.map(b => exitosos.has(b.id) ? { ...b, estatus: 'aprobada' as const } : b));
      setSeleccionBodegasPend(prev => {
        const n = new Set(prev);
        exitosos.forEach(id => n.delete(id));
        return n;
      });
      if (exitosos.size > 0) {
        showToast(
          fallidos > 0
            ? `${exitosos.size} bodega(s) aprobada(s), ${fallidos} falló(aron)`
            : `${exitosos.size} bodega(s) aprobada(s) correctamente`,
          fallidos === 0
        );
      } else {
        showToast('No se pudo aprobar ninguna bodega', false);
      }
    } finally {
      setBulkAprobandoBodegas(false);
    }
  }

  const cntAprob   = bodegas.filter(b => b.estatus === 'aprobada').length;
  const cntPend    = bodegas.filter(b => b.estatus === 'pendiente').length;
  const cntPendTotal = cntPend + solicitudes.length;

  return (
    <div className="flex flex-col h-[calc(100vh-88px)] gap-3 overflow-hidden">

      {/* ── Tab Bar ── */}
      <div className="bg-[#eef8f2] flex-shrink-0 rounded-b-2xl overflow-hidden border border-[#1A5C38]/30 border-t-0">
        <div className="flex items-center justify-between gap-1.5 px-2 py-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { key: 'bodegas',      label: 'Bodegas',       icon: <Table2 size={11} />,      badge: bodegas.length,     soloAdmin: false },
              { key: 'lista',        label: 'Lista + Mapa',  icon: <Navigation2 size={11} />, badge: null,               soloAdmin: false },
              { key: 'estadisticas', label: 'Estadísticas',  icon: <BarChart3 size={11} />,   badge: null,               soloAdmin: false },
              { key: 'pendientes',   label: 'Por aprobar',   icon: <ShieldAlert size={11} />, badge: cntPendTotal || null, soloAdmin: true },
              { key: 'usuarios',     label: 'Usuarios',      icon: <Users size={11} />,       badge: null,               soloAdmin: true },
            ] as const).filter(t => !t.soloAdmin || soloAdminVeTabsGestion).map(({ key, label, icon, badge }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                  tab === key ? 'bg-[#1A5C38] text-white shadow-sm' : 'text-[#1A5C38] hover:bg-[#d4efe1]'
                }`}>
                {icon}{label}
                {badge !== null && badge > 0 && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    tab === key ? 'bg-white/20 text-white' : 'bg-[#1A5C38]/10 text-[#1A5C38]'
                  }`}>{badge}</span>
                )}
              </button>
            ))}
          </div>
          <button onClick={cargarBodegas} disabled={loading}
            className="p-1.5 rounded-lg text-[#1A5C38] bg-[#d4efe1] hover:bg-[#1A5C38] hover:text-white border border-[#1A5C38]/20 hover:border-transparent transition disabled:opacity-50">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          TAB: BODEGAS (tabla)
      ═══════════════════════════════════════ */}
      {tab === 'bodegas' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">

          {/* Cabecera stats */}
          <div className="px-4 py-2.5 border-b border-gray-50 flex-shrink-0 flex items-center gap-4 bg-[#eef8f2]/40">
            {[
              { label: 'Total',      val: bodegas.length,  dot: 'bg-[#1A5C38]',    color: 'text-[#1A5C38]' },
              { label: 'Aprobadas',  val: cntAprob,        dot: 'bg-emerald-500',  color: 'text-emerald-700' },
              { label: 'Pendientes', val: cntPend,         dot: 'bg-amber-400',    color: 'text-amber-700' },
              { label: 'Rechazadas', val: bodegas.filter(b=>b.estatus==='rechazada').length, dot:'bg-red-400', color:'text-red-600'},
            ].map(({ label, val, dot, color }, i) => (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className="w-px h-3 bg-[#1A5C38]/15" />}
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span className={`text-[12px] font-black ${color}`}>{loading ? '—' : val}</span>
                  <span className="text-[9.5px] text-[#1A5C38]/50 font-medium">{label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Buscar bodega o silo..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] outline-none focus:border-[#1A5C38]/40 focus:bg-white transition" />
            </div>
            <select value={estatusFilter} onChange={e => setEstatusFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-[#1A5C38]/40 cursor-pointer transition">
              <option value="">Estatus (todos)</option>
              <option value="aprobada">Aprobada</option>
              <option value="pendiente">Pendiente</option>
              <option value="rechazada">Rechazada</option>
            </select>
            <span className="text-[10.5px] text-gray-400 font-medium ml-auto">{filteredList.length} resultados</span>
          </div>

          {/* Tabla */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center gap-2">
              <RefreshCw size={18} className="text-[#1A5C38] animate-spin" />
              <p className="text-[12px] text-gray-400">Cargando bodegas...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              <ShieldAlert size={28} className="text-gray-300" />
              <p className="text-[13px] font-bold text-gray-500">Sin resultados</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse" style={{ fontSize: '11.5px' }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50/90 border-b border-gray-100">
                    {['#','Bodega','Ubicación','Capacidad','Estatus','Semáforo','Acciones'].map(h => (
                      <th key={h} className="py-2 px-3 text-[9.5px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-4 last:pr-4 last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredList.map((b, idx) => {
                    const ecfg = ESTATUS_CFG[b.estatus] || ESTATUS_CFG.rechazada;
                    const scfg = SEM_CFG[b.semaforo_compra] || SEM_CFG.sin_actividad;
                    return (
                      <tr key={b.id} className="hover:bg-[#f9fdfb] transition-colors">
                        <td className="py-2 pl-4 pr-2 text-[10px] text-gray-300 font-mono">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <p className="font-bold text-gray-800 leading-tight whitespace-nowrap">{b.nombre}</p>
                          {b.encargado_nombre && <p className="text-[10px] text-gray-400 mt-0.5">{b.encargado_nombre}</p>}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <p className="font-semibold text-gray-700 text-[11px]">{b.municipio || '—'}</p>
                          <p className="text-[10px] text-gray-400">{b.estado || ''}</p>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap font-semibold text-gray-700">
                          {b.capacidad_total > 0 ? `${b.capacidad_total.toLocaleString()} t` : '—'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${ecfg.color}`}>{ecfg.label}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${scfg.dot}`} />
                            <span className="text-[10px] text-gray-500">{scfg.label}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 pr-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            {puedeVerDetalle && (
                              <button onClick={() => abrirDetalle(b)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-[#1A5C38] hover:bg-[#eef8f2] transition" title="Ver detalle">
                                <Eye size={12} />
                              </button>
                            )}
                            {puedeEditar && (
                              <button onClick={() => abrirEditar(b)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition" title="Editar">
                                <Edit3 size={12} />
                              </button>
                            )}
                            {puedeEliminar && (
                              <button onClick={() => setDeleteTarget(b)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition" title="Eliminar">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: LISTA + MAPA (Mapbox)
      ═══════════════════════════════════════ */}
      <div style={{ display: tab === 'lista' ? 'flex' : 'none' }}
        className="flex-col flex-1 gap-3 overflow-hidden min-h-0">

        {/* Stats rápidos */}
        <div className="grid grid-cols-3 gap-3 flex-shrink-0">
          {[
            { icon: <Warehouse size={14}/>, color: 'bg-gray-100 text-gray-600', val: bodegas.length, label: 'Total' },
            { icon: <CheckCircle size={14}/>, color: 'bg-emerald-50 text-emerald-700', val: cntAprob, label: 'Aprobadas' },
            { icon: <ShieldAlert size={14}/>, color: 'bg-amber-50 text-amber-700', val: cntPend, label: 'Pendientes' },
          ].map(({ icon, color, val, label }) => (
            <div key={label} className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5 flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
              <div><p className="text-[16px] font-black text-gray-900 leading-none">{val}</p>
                <p className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">{label}</p></div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row flex-1 gap-3 overflow-hidden min-h-0">
          {/* Lista */}
          <div className="w-full lg:w-[360px] flex flex-col bg-white border border-gray-100 shadow-sm rounded-2xl flex-shrink-0 overflow-hidden">
            <div className="p-3 space-y-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Buscar bodega..." value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-7 pr-3 py-2 text-[11.5px] outline-none focus:border-[#1A5C38]/40 focus:bg-white transition" />
                </div>
                <span className="text-[10px] font-bold text-[#1A5C38] bg-[#eef8f2] border border-[#1A5C38]/20 px-2 py-1 rounded-lg">{filteredList.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-[11px] text-gray-700 outline-none focus:border-[#1A5C38]/40 transition">
                  <option value="">Estados</option>
                  {[...new Set(bodegas.map(b => b.estado).filter(Boolean))].sort().map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
                <select value={estatusFilter} onChange={e => setEstatusFilter(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2 text-[11px] text-gray-700 outline-none focus:border-[#1A5C38]/40 transition">
                  <option value="">Estatus</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <div className="flex items-center justify-center py-16 gap-2">
                  <RefreshCw size={16} className="text-[#1A5C38] animate-spin" />
                  <p className="text-[11.5px] text-gray-400">Cargando...</p>
                </div>
              ) : filteredList.map(b => (
                <div key={b.id} onClick={() => focusBodega(b)}
                  className={`px-3 py-3 cursor-pointer transition-all flex items-start gap-3 ${
                    selectedId === b.id ? 'bg-emerald-50/60 border-l-2 border-l-[#1A5C38]' : 'hover:bg-gray-50/70'
                  }`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    b.estatus === 'aprobada' ? 'bg-emerald-100 text-emerald-700' :
                    b.estatus === 'pendiente' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
                  }`}><Warehouse size={13} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-[11.5px] font-bold text-gray-900 leading-snug line-clamp-2">{b.nombre}</p>
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${ESTATUS_CFG[b.estatus]?.color}`}>
                        {ESTATUS_CFG[b.estatus]?.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-2">
                      <MapPin size={8} /> {b.municipio}, {b.estado}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${SEM_CFG[b.semaforo_compra]?.dot || 'bg-gray-300'}`} />
                        <span className="text-[10px] text-gray-500">{b.capacidad_total.toLocaleString()} t</span>
                      </div>
                      <button onClick={e => { e.stopPropagation(); navigate(`/admin/bodegas/${b.id}`); }}
                        className="text-[9.5px] font-bold text-[#1A5C38] bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 transition">
                        Ver <Eye size={8} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mapa Mapbox */}
          <div className="flex-1 bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden relative">
            <div ref={mapContainer} className="w-full h-full" />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          TAB: ESTADÍSTICAS
      ═══════════════════════════════════════ */}
      {tab === 'estadisticas' && (
        <div className="flex-1 overflow-y-auto">
          {statsLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw size={24} className="text-emerald-500 animate-spin" />
              <p className="text-[13px] text-gray-500">Cargando estadísticas...</p>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2 bg-white border border-gray-100 shadow-sm rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide">Ocupación de almacenamiento</p>
                    <p className="text-[36px] font-black text-gray-900 leading-none mt-1.5">
                      {stats.pct_ocupacion || 0}<span className="text-[16px] text-gray-400 ml-0.5">%</span>
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Percent size={20} /></div>
                </div>
                <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Number(stats.pct_ocupacion) || 0)}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 mt-1">
                  <div className="flex items-center gap-2.5 pt-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center"><Weight size={15} /></div>
                    <div><p className="text-[16px] font-black text-gray-900 leading-none">{Number(stats.capacidad_total || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Capacidad total (t)</p></div>
                  </div>
                  <div className="flex items-center gap-2.5 pt-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center"><Package size={15} /></div>
                    <div><p className="text-[16px] font-black text-gray-900 leading-none">{Number(stats.stock_total || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Stock actual (t)</p></div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex-1 bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><FileText size={17} /></div>
                  <div><p className="text-[22px] font-black text-gray-900 leading-none">{stats.con_tarifario || 0}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-1">Con Tarifario</p></div>
                </div>
                <div className="flex-1 bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><LayoutGrid size={17} /></div>
                  <div><p className="text-[22px] font-black text-gray-900 leading-none">{stats.ventanillas_activas || 0}</p>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mt-1">Ventanillas Activas</p></div>
                </div>
              </div>
            </div>
          ) : <div className="text-center py-16 text-gray-500 text-[13px]">No se pudieron cargar las estadísticas.</div>}
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB: PENDIENTES
      ═══════════════════════════════════════ */}
      {tab === 'pendientes' && (
        <div className="flex-1 overflow-y-auto space-y-4">

          {/* ── Sección 1: Bodegas pendientes de registro ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
              <Warehouse size={13} className="text-amber-500" />
              <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Registros de bodega pendientes</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 ml-1">
                {bodegas.filter(b => b.estatus === 'pendiente').length}
              </span>
              {bodegas.filter(b => b.estatus === 'pendiente').length > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  {seleccionBodegasPend.size > 0 && (
                    <button onClick={() => aprobarBodegasMasivo()} disabled={bulkAprobandoBodegas}
                      className="h-7 px-3 rounded-lg bg-[#1A5C38] hover:bg-[#15482d] text-white text-[10.5px] font-bold transition flex items-center gap-1.5 disabled:opacity-50">
                      {bulkAprobandoBodegas ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                      Aprobar seleccionadas ({seleccionBodegasPend.size})
                    </button>
                  )}
                  <button
                    onClick={() => aprobarBodegasMasivo(bodegas.filter(b => b.estatus === 'pendiente').map(b => b.id))}
                    disabled={bulkAprobandoBodegas}
                    className="h-7 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10.5px] font-bold transition flex items-center gap-1.5 disabled:opacity-50">
                    {bulkAprobandoBodegas ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    Aprobar todas
                  </button>
                </div>
              )}
            </div>
            {bodegas.filter(b => b.estatus === 'pendiente').length === 0 ? (
              <div className="py-10 flex flex-col items-center text-gray-300">
                <Warehouse size={26} className="mb-2" />
                <p className="text-[12px] font-semibold">Sin bodegas pendientes</p>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 px-4 py-2 border-b border-gray-50 bg-gray-50/50 cursor-pointer select-none">
                  <input type="checkbox"
                    checked={seleccionBodegasPend.size > 0 && seleccionBodegasPend.size === bodegas.filter(b => b.estatus === 'pendiente').length}
                    ref={el => { if (el) el.indeterminate = seleccionBodegasPend.size > 0 && seleccionBodegasPend.size < bodegas.filter(b => b.estatus === 'pendiente').length; }}
                    onChange={toggleSeleccionarTodasBodegasPend}
                    className="w-3.5 h-3.5 rounded accent-[#1A5C38]" />
                  <span className="text-[10.5px] font-bold text-gray-500">Seleccionar todas</span>
                </label>
                {bodegas.filter(b => b.estatus === 'pendiente').map(b => {
                  const nuevo = b.fecha_creacion ? esNuevo(b.fecha_creacion) : false;
                  const marcada = seleccionBodegasPend.has(b.id);
                  return (
                    <div key={b.id} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${marcada ? 'bg-emerald-50/40' : 'hover:bg-gray-50/60'}`}>
                      <input type="checkbox" checked={marcada} onChange={() => toggleSeleccionBodegaPend(b.id)}
                        className="w-3.5 h-3.5 rounded accent-[#1A5C38] flex-shrink-0" />
                      <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center flex-shrink-0">
                        <Warehouse size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-bold text-gray-900 truncate">{b.nombre}</p>
                          {nuevo && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500 text-white flex-shrink-0">NUEVO</span>}
                        </div>
                        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                          <MapPin size={9} />{b.municipio}, {b.estado}
                          {b.capacidad_total ? ` · ${b.capacidad_total.toLocaleString()} t` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {puedeVerDetalle && (
                          <button onClick={() => abrirDetalle(b)}
                            className="h-8 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold transition flex items-center gap-1">
                            <Eye size={12} /> Ver
                          </button>
                        )}
                        <button onClick={() => setModalAccion({ tipo: 'aprobar', bodega: b })}
                          className="h-8 px-3 rounded-xl bg-[#1A5C38] hover:bg-[#15482d] text-white text-[11px] font-bold transition flex items-center gap-1">
                          <CheckCircle size={12} /> Aprobar
                        </button>
                        <button onClick={() => setModalAccion({ tipo: 'rechazar', bodega: b })}
                          className="h-8 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 text-[11px] font-bold transition flex items-center gap-1">
                          <X size={12} /> Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* ── Sección 2: Solicitudes de acceso bodeguero↔bodega ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-wrap">
              <Users size={13} className="text-blue-500" />
              <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Solicitudes de acceso a bodega</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 ml-1">
                {solicitudes.length}
              </span>
              {solicitudes.length > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  {seleccionSolicitudes.size > 0 && (
                    <button onClick={() => aprobarSolicitudesMasivo()} disabled={bulkAprobandoSolic}
                      className="h-7 px-3 rounded-lg bg-[#1A5C38] hover:bg-[#15482d] text-white text-[10.5px] font-bold transition flex items-center gap-1.5 disabled:opacity-50">
                      {bulkAprobandoSolic ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                      Aprobar seleccionadas ({seleccionSolicitudes.size})
                    </button>
                  )}
                  <button
                    onClick={() => aprobarSolicitudesMasivo(solicitudes.map(s => s.id))}
                    disabled={bulkAprobandoSolic}
                    className="h-7 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10.5px] font-bold transition flex items-center gap-1.5 disabled:opacity-50">
                    {bulkAprobandoSolic ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    Aprobar todas
                  </button>
                </div>
              )}
            </div>
            {solicLoad ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))
            ) : solicitudes.length === 0 ? (
              <div className="py-10 flex flex-col items-center text-gray-300">
                <Users size={26} className="mb-2" />
                <p className="text-[12px] font-semibold">Sin solicitudes pendientes</p>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 px-4 py-2 border-b border-gray-50 bg-gray-50/50 cursor-pointer select-none">
                  <input type="checkbox"
                    checked={seleccionSolicitudes.size > 0 && seleccionSolicitudes.size === solicitudes.length}
                    ref={el => { if (el) el.indeterminate = seleccionSolicitudes.size > 0 && seleccionSolicitudes.size < solicitudes.length; }}
                    onChange={toggleSeleccionarTodasSolicitudes}
                    className="w-3.5 h-3.5 rounded accent-[#1A5C38]" />
                  <span className="text-[10.5px] font-bold text-gray-500">Seleccionar todas</span>
                </label>
                {solicitudes.map((s, idx) => {
                  const nuevo = esNuevo(s.fecha_solicitud);
                  const marcada = seleccionSolicitudes.has(s.id);
                  return (
                    <div key={`${s.id}-${s.bodega_id}-${idx}`} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors ${marcada ? 'bg-emerald-50/40' : 'hover:bg-gray-50/60'}`}>
                      <input type="checkbox" checked={marcada} onChange={() => toggleSeleccionSolicitud(s.id)}
                        className="w-3.5 h-3.5 rounded accent-[#1A5C38] flex-shrink-0" />
                      {/* Avatar usuario */}
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-[11px] flex-shrink-0">
                        {s.nombre_completo.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[12px] font-bold text-gray-900 truncate">{s.nombre_completo}</p>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0 capitalize">{s.rol}</span>
                          {nuevo && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500 text-white flex-shrink-0">NUEVO</span>}
                        </div>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">
                          Solicita: <span className="font-semibold text-gray-600">{s.bodega_nombre}</span>
                          {' · '}{s.bodega_municipio}, {s.bodega_estado}
                        </p>
                        <p className="text-[9px] text-gray-300 mt-0.5">
                          {new Date(s.fecha_solicitud).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })}
                        </p>
                      </div>
                      {/* Acciones */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => setSolicModal(s)}
                          className="h-8 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold transition flex items-center gap-1">
                          <Eye size={12} /> Ver
                        </button>
                        <button onClick={() => procesarSolicitud(s.id, 'aprobar')} disabled={solicAccionLoad === s.id}
                          className="h-8 px-3 rounded-xl bg-[#1A5C38] hover:bg-[#15482d] text-white text-[11px] font-bold transition flex items-center gap-1 disabled:opacity-50">
                          {solicAccionLoad === s.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />} Aprobar
                        </button>
                        <button onClick={() => procesarSolicitud(s.id, 'rechazar')} disabled={solicAccionLoad === s.id}
                          className="h-8 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 text-[11px] font-bold transition flex items-center gap-1 disabled:opacity-50">
                          <X size={11} /> Rechazar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

        </div>
      )}

      {/* ── MODAL VER SOLICITUD ── */}
      {solicModal && createPortal(
        <div className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6" style={{ zIndex: 9999 }} onClick={() => setSolicModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />
          <div className="relative w-full sm:max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden"
            style={{ animation: 'slideUpSheet .28s cubic-bezier(.34,1.25,.64,1)' }} onClick={e => e.stopPropagation()}>
            <div className="sm:hidden flex justify-center pt-3 flex-shrink-0"><div className="w-9 h-1 rounded-full bg-gray-200" /></div>
            {/* Header */}
            <div className="px-6 pt-5 pb-4 flex items-start gap-4 border-b border-gray-100 flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                {solicModal.nombre_completo.split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-[16px] font-extrabold text-gray-900 leading-tight">{solicModal.nombre_completo}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{solicModal.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 capitalize">{solicModal.rol}</span>
                  {solicModal.telefono && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">{solicModal.telefono}</span>}
                  {esNuevo(solicModal.fecha_solicitud) && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white">NUEVO</span>}
                </div>
              </div>
              <button onClick={() => setSolicModal(null)} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"><X size={14} className="text-gray-500" /></button>
            </div>
            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
              {/* Bodega solicitada */}
              <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Solicita acceso a</p>
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0"><Warehouse size={18} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-black text-gray-900 leading-tight">{solicModal.bodega_nombre}</p>
                      <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={9}/>{solicModal.bodega_municipio}, {solicModal.bodega_estado}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Capacidad', val: solicModal.capacidad_ton ? `${Number(solicModal.capacidad_ton).toLocaleString()} t` : '—' },
                      { label: 'Solicitud', val: 'Acceso pendiente' },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-white rounded-xl p-2.5 border border-gray-200">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                        <p className="text-[12px] font-bold text-gray-800">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Fecha */}
              <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fecha de solicitud</p>
                <p className="text-[13px] font-bold text-gray-800">
                  {new Date(solicModal.fecha_solicitud).toLocaleDateString('es-MX', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
                </p>
              </div>
            </div>
            {/* Footer acciones */}
            <div className="px-6 pb-6 pt-3 border-t border-gray-100 flex gap-2.5 flex-shrink-0">
              <button onClick={() => { procesarSolicitud(solicModal.id, 'rechazar'); setSolicModal(null); }} disabled={solicAccionLoad === solicModal.id}
                className="flex-1 py-3 rounded-2xl bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[13px] border border-red-200 transition flex items-center justify-center gap-2 disabled:opacity-50">
                <X size={14} /> Rechazar
              </button>
              <button onClick={() => { procesarSolicitud(solicModal.id, 'aprobar'); setSolicModal(null); }} disabled={solicAccionLoad === solicModal.id}
                className="flex-1 py-3 rounded-2xl bg-[#1A5C38] hover:bg-[#15482d] text-white font-bold text-[13px] transition flex items-center justify-center gap-2 disabled:opacity-50">
                {solicAccionLoad === solicModal.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Aprobar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════════════════════════════════
          TAB: USUARIOS BODEGA
      ═══════════════════════════════════════ */}
      {tab === 'usuarios' && (
        <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">

          {/* Barra búsqueda */}
          <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0 flex items-center gap-2">
            <div className="flex items-center gap-2 flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                value={usuarioSearch}
                onChange={e => {
                  setUsuarioSearch(e.target.value);
                  if (debUsuRef.current) clearTimeout(debUsuRef.current);
                  debUsuRef.current = setTimeout(() => cargarUsuarios(e.target.value), 300);
                }}
                placeholder="Buscar por nombre, correo o teléfono…"
                className="flex-1 text-[13px] text-gray-700 placeholder-gray-400 bg-transparent outline-none"
              />
              {usuarioSearch && <button onClick={() => { setUsuarioSearch(''); cargarUsuarios(''); }}><X size={12} className="text-gray-400" /></button>}
            </div>
            <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">{usuarios.length} usuarios</span>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {usuariosLoad ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-4 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                    <div className="h-2.5 bg-gray-100 rounded w-1/3" />
                  </div>
                </div>
              ))
            ) : usuarios.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Users size={40} className="mb-3 opacity-30" />
                <p className="text-[13px] font-semibold">No hay usuarios registrados</p>
              </div>
            ) : usuarios.map(u => {
              const initials = u.nombre_completo.split(' ').slice(0, 2).map(s => s[0]).join('').toUpperCase();
              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/60 transition-colors group">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-[13px] flex-shrink-0 ${u.activo ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                    {initials}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-bold text-gray-900 truncate">{u.nombre_completo}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${u.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 flex-shrink-0 capitalize">{u.rol}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{u.email}</p>
                    {u.bodegas?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.bodegas.slice(0,2).map((b: BodegaAsociada) => (
                          <span key={b.bodega_id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                            b.asociacion_estatus === 'aprobada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            b.asociacion_estatus === 'pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-500 border-red-200'}`}>
                            {b.bodega_nombre.length > 18 ? b.bodega_nombre.slice(0,18)+'…' : b.bodega_nombre} · {b.asociacion_estatus === 'aprobada' ? 'Autorizado' : b.asociacion_estatus === 'pendiente' ? 'Pendiente' : 'Denegado'}
                          </span>
                        ))}
                        {u.bodegas.length > 2 && <span className="text-[9px] text-gray-400">+{u.bodegas.length-2}</span>}
                      </div>
                    )}
                  </div>
                  {/* Acciones */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setUsuarioModal(u); setEditUsuario(null); setEditUsuErr(''); setEditPassword(''); setShowEditPassword(false); }}
                      className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-emerald-50 hover:text-emerald-600 text-gray-400 flex items-center justify-center transition-colors"
                      title="Ver detalles"
                    ><Eye size={14} /></button>
                    <button
                      onClick={() => { setEditUsuario({ nombre_completo: u.nombre_completo, email: u.email, telefono: u.telefono, activo: u.activo }); setUsuarioModal(u); setEditUsuErr(''); setEditPassword(''); setShowEditPassword(false); }}
                      className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 text-gray-400 flex items-center justify-center transition-colors"
                      title="Editar"
                    ><Edit3 size={14} /></button>
                    <button
                      onClick={() => setDeleteUsuario(u)}
                      className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors"
                      title="Eliminar"
                    ><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODAL USUARIO BODEGA ── */}
      {usuarioModal && createPortal(
        <div className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6" style={{ zIndex: 9999 }} onClick={() => { setUsuarioModal(null); setEditUsuario(null); setEditPassword(''); setShowEditPassword(false); setEditUsuErr(''); }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />
          <div
            className="relative w-full sm:max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl max-h-[95dvh] sm:max-h-[88vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 40px 80px -10px rgba(0,0,0,0.45)', animation: 'slideUpSheet .28s cubic-bezier(.34,1.25,.64,1)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle mobile */}
            <div className="sm:hidden flex justify-center pt-3 flex-shrink-0"><div className="w-9 h-1 rounded-full bg-gray-200" /></div>

            {/* Hero header */}
            <div className="px-6 pt-5 pb-4 flex items-start gap-4 flex-shrink-0">
              {/* Avatar */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-black text-xl flex-shrink-0 shadow-lg ${usuarioModal.activo ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-900/20' : 'bg-gradient-to-br from-gray-400 to-gray-500'}`}>
                {usuarioModal.nombre_completo.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-[17px] font-extrabold text-gray-900 leading-tight">{usuarioModal.nombre_completo}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{usuarioModal.email}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${usuarioModal.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${usuarioModal.activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    {usuarioModal.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 capitalize">{usuarioModal.rol}</span>
                  {usuarioModal.aviso_privacidad_aceptado && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">Aviso ✓</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button onClick={() => { setUsuarioModal(null); setEditUsuario(null); setEditPassword(''); setShowEditPassword(false); setEditUsuErr(''); }} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"><X size={14} className="text-gray-500" /></button>
              </div>
            </div>

            {/* Scroll body */}
            <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-3">

              {editUsuario ? (
                /* ── MODO EDICIÓN ── */
                <div className="space-y-3">
                  {editUsuErr && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[12px] font-medium flex items-center gap-1.5">
                      <AlertTriangle size={13} className="flex-shrink-0" /> {editUsuErr}
                    </div>
                  )}
                  <div>
                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Nombre completo</label>
                    <input
                      type="text"
                      value={editUsuario.nombre_completo || ''}
                      onChange={e => setEditUsuario(v => ({ ...v, nombre_completo: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Correo</label>
                      <input
                        type="email"
                        value={editUsuario.email || ''}
                        onChange={e => setEditUsuario(v => ({ ...v, email: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={editUsuario.telefono || ''}
                        onChange={e => setEditUsuario(v => ({ ...v, telefono: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
                      />
                    </div>
                  </div>

                  {/* Estado activo/inactivo */}
                  <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Estado de la cuenta</p>
                      <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{editUsuario.activo ? 'Activo' : 'Inactivo'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditUsuario(v => ({ ...v, activo: !v?.activo }))}
                      className={`w-12 h-7 rounded-full flex items-center px-0.5 transition-colors ${editUsuario.activo ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'}`}
                    >
                      <span className="w-6 h-6 rounded-full bg-white shadow" />
                    </button>
                  </div>

                  {/* Contraseña — solo en modo edición */}
                  <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lock size={13} className="text-emerald-500" />
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Contraseña</p>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-2">Por seguridad no se puede ver la contraseña actual. Escribe una nueva para reemplazarla, o deja el campo vacío para no cambiarla.</p>
                    <div className="relative">
                      <input
                        type={showEditPassword ? 'text' : 'password'}
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        placeholder="Nueva contraseña (mín. 6 caracteres)"
                        className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEditPassword(s => !s)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        title={showEditPassword ? 'Ocultar' : 'Mostrar'}
                      >
                        {showEditPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setEditUsuario(null); setEditPassword(''); setShowEditPassword(false); setEditUsuErr(''); }}
                      className="flex-1 py-2.5 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[13px] transition-all"
                    >Cancelar</button>
                    <button
                      onClick={guardarUsuario}
                      disabled={guardandoUsu}
                      className="flex-1 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[13px] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {guardandoUsu ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar cambios
                    </button>
                  </div>
                </div>
              ) : (
                /* ── MODO VISTA ── */
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { icon: <Phone size={13} />, label: 'Teléfono', val: usuarioModal.telefono },
                    { icon: <Mail size={13} />, label: 'Correo', val: usuarioModal.email },
                    { icon: <Calendar size={13} />, label: 'Registro', val: usuarioModal.created_at ? new Date(usuarioModal.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
                    { icon: <Users size={13} />, label: 'ID', val: `#${String(usuarioModal.id).padStart(6,'0')}` },
                  ].map(({ icon, label, val }) => (
                    <div key={label} className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-emerald-500">{icon}</span>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
                      </div>
                      <p className="text-[12px] font-semibold text-gray-800 leading-snug break-all">{val || '—'}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Bodegas asociadas */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Warehouse size={13} className="text-emerald-500" />
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Bodegas asociadas</p>
                  {usuarioModal.bodegas?.length > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">{usuarioModal.bodegas.length}</span>
                  )}
                </div>
                {(!usuarioModal.bodegas || usuarioModal.bodegas.length === 0) ? (
                  <div className="bg-gray-50 rounded-2xl p-3.5 border border-dashed border-gray-200 flex items-center gap-2">
                    <Warehouse size={13} className="text-gray-300" />
                    <p className="text-[12px] text-gray-400 italic">Sin bodegas asociadas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {usuarioModal.bodegas.map((b: BodegaAsociada) => (
                      <div key={b.bodega_id} className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-gray-900 leading-snug">{b.bodega_nombre}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{[b.bodega_municipio, b.bodega_estado].filter(Boolean).join(', ')}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 self-start mt-0.5 ${
                            b.asociacion_estatus === 'aprobada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            b.asociacion_estatus === 'pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-600 border-red-200'}`}>
                            {b.asociacion_estatus === 'aprobada' ? '✓ Acceso aprobado' : b.asociacion_estatus === 'pendiente' ? 'Acceso pendiente' : 'Acceso rechazado'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── MODAL CONFIRMAR ELIMINAR USUARIO ── */}
      {deleteUsuario && createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-6" style={{ zIndex: 10000 }} onClick={() => setDeleteUsuario(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()} style={{ animation: 'slideUpSheet .22s cubic-bezier(.34,1.25,.64,1)' }}>
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <div className="text-center">
              <p className="font-black text-gray-900 text-[16px]">¿Eliminar usuario?</p>
              <p className="text-[13px] text-gray-500 mt-1">Se eliminará <span className="font-bold text-gray-700">{deleteUsuario.nombre_completo}</span> permanentemente. Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteUsuario(null)} className="flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold text-[13px] transition-all">Cancelar</button>
              <button onClick={eliminarUsuario} disabled={deleteUsuLoad} className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold text-[13px] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {deleteUsuLoad ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Eliminar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════════════════════════════════
          MODAL: DETALLE COMPLETO
      ═══════════════════════════════════════ */}
      {detalleTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ animation: 'fadeInBackdrop .2s ease' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[6px]"
            onClick={() => setDetalleTarget(null)} />
          <div className="relative bg-white/96 backdrop-blur-xl w-full max-w-[520px] max-h-[88vh] rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.26)] overflow-hidden flex flex-col"
            style={{ animation: 'slideUpSheet .26s cubic-bezier(0.34,1.28,0.64,1)' }}>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0 ${
                  detalleTarget.estatus === 'aprobada' ? 'bg-emerald-100 text-emerald-700' :
                  detalleTarget.estatus === 'pendiente' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'
                }`}><Warehouse size={20} /></div>
                <div>
                  <h2 className="text-[17px] font-bold text-gray-900 leading-tight">{detalleTarget.nombre}</h2>
                  <p className="text-[11.5px] text-gray-500 mt-0.5">{detalleTarget.municipio}, {detalleTarget.estado}</p>
                </div>
              </div>
              <button onClick={() => setDetalleTarget(null)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition flex-shrink-0">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            {/* Cuerpo scroll */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {detalleLoading ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <Loader2 size={20} className="text-[#1A5C38] animate-spin" />
                  <p className="text-[12px] text-gray-400">Cargando datos completos...</p>
                </div>
              ) : (() => {
                const d = detalleData || detalleTarget;
                const rows = [
                  { icon: <Building2 size={12}/>, label:'Clave/ID',      val: d.clave || `#${d.id}` },
                  { icon: <Phone size={12}/>,     label:'Teléfono',       val: d.telefono || d.phone || '—' },
                  { icon: <Weight size={12}/>,    label:'Capacidad',      val: d.capacidad_ton ? `${Number(d.capacidad_ton).toLocaleString()} ton` : d.capacidad_total ? `${Number(d.capacidad_total).toLocaleString()} ton` : '—' },
                  { icon: <Package size={12}/>,   label:'Stock actual',   val: d.stock_actual != null ? `${Number(d.stock_actual).toLocaleString()} ton` : '—' },
                  { icon: <MapPin size={12}/>,    label:'Dirección',      val: [d.direccion, d.localidad, d.municipio, d.estado].filter(Boolean).join(', ') || '—' },
                  { icon: <Navigation2 size={12}/>,label:'Coordenadas',   val: `${d.latitud?.toFixed(5) || '—'}, ${d.longitud?.toFixed(5) || '—'}` },
                  { icon: <FileText size={12}/>,  label:'Región',         val: d.region_nombre || '—' },
                  { icon: <Calendar size={12}/>,  label:'Registro',       val: fmtDate(d.created_at || d.fecha_creacion) },
                ];
                return (
                  <>
                    {/* Status badges */}
                    <div className="flex gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${(ESTATUS_CFG as any)[d.estatus]?.color || ''}`}>
                        {(ESTATUS_CFG as any)[d.estatus]?.label || d.estatus}
                      </span>
                      <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
                        <div className={`w-2 h-2 rounded-full ${(SEM_CFG as any)[d.semaforo_compra]?.dot || 'bg-gray-300'}`} />
                        <span className="text-[11px] text-gray-600 font-semibold">{(SEM_CFG as any)[d.semaforo_compra]?.label || 'Sin actividad'}</span>
                      </div>
                    </div>

                    {/* Grid de datos */}
                    <div className="grid grid-cols-1 gap-0 bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                      {rows.map(({ icon, label, val }, i) => (
                        <div key={label} className={`flex items-center gap-3 px-4 py-3 ${i < rows.length-1 ? 'border-b border-gray-100' : ''}`}>
                          <div className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400">{icon}</div>
                          <span className="text-[11px] text-gray-500 w-24 flex-shrink-0">{label}</span>
                          <span className="text-[12px] font-semibold text-gray-800 flex-1">{val}</span>
                        </div>
                      ))}
                    </div>

                    {/* Encargado */}
                    {d.encargado_nombre && (
                      <div className="bg-[#eef8f2] border border-[#1A5C38]/15 rounded-2xl px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1A5C38] text-white flex items-center justify-center text-[13px] font-bold flex-shrink-0">
                          {d.encargado_nombre.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-gray-900">{d.encargado_nombre}</p>
                          <p className="text-[10.5px] text-gray-500">Encargado de bodega</p>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => { setDetalleTarget(null); navigate(`/admin/bodegas/${detalleTarget.id}`); }}
                className="w-full py-3 rounded-[14px] text-[14px] font-semibold text-white transition active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg,#1A5C38,#15482d)', boxShadow:'0 4px 14px rgba(26,92,56,.3)' }}>
                Abrir ficha completa →
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══════════════════════════════════════
          MODAL: EDITAR BODEGA — Apple 2026
      ═══════════════════════════════════════ */}
      {editTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ animation: 'fadeInBackdrop .2s ease' }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[6px]"
            onClick={() => { if (!editLoading) setEditTarget(null); }} />
          <div className="relative bg-white/96 backdrop-blur-xl w-full max-w-[480px] rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.26)] overflow-hidden"
            style={{ animation: 'slideUpSheet .26s cubic-bezier(0.34,1.28,0.64,1)' }}>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[13px] bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-gray-900">Editar bodega</h2>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[240px]">{editTarget.nombre}</p>
                </div>
              </div>
              <button onClick={() => setEditTarget(null)} disabled={editLoading}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition disabled:opacity-40">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            {/* Formulario */}
            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {[
                { key: 'nombre',    label: 'Nombre',    type: 'text',   placeholder: 'Nombre de la bodega' },
                { key: 'estado',    label: 'Estado',    type: 'text',   placeholder: 'Estado' },
                { key: 'municipio', label: 'Municipio', type: 'text',   placeholder: 'Municipio' },
                { key: 'localidad', label: 'Localidad', type: 'text',   placeholder: 'Localidad (opcional)' },
                { key: 'direccion', label: 'Dirección', type: 'text',   placeholder: 'Dirección (opcional)' },
                { key: 'telefono',  label: 'Teléfono',  type: 'text',   placeholder: 'Teléfono (opcional)' },
                { key: 'capacidad_total', label: 'Capacidad (ton)', type: 'number', placeholder: '0' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">{label}</label>
                  <input type={type} placeholder={placeholder}
                    value={(editForm as any)[key] ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: type === 'number' ? e.target.value : e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-[#1A5C38]/50 focus:bg-white transition" />
                </div>
              ))}

              {/* Estatus */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">Estatus</label>
                <select value={editForm.estatus || ''} onChange={e => setEditForm(f => ({ ...f, estatus: e.target.value as any }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-[#1A5C38]/50 transition cursor-pointer">
                  <option value="aprobada">Aprobada</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>

              {editError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                  <X size={12} className="text-red-500 flex-shrink-0" />
                  <p className="text-[12px] text-red-600">{editError}</p>
                </div>
              )}
            </div>

            {/* Botones */}
            <div className="px-6 pb-6 pt-4 border-t border-gray-100 flex gap-2.5">
              <button onClick={guardarEdicion} disabled={editLoading}
                className="flex-1 py-3.5 rounded-[16px] text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition active:scale-[.97] disabled:opacity-60"
                style={{ background:'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow:'0 4px 14px rgba(99,102,241,.35)' }}>
                {editLoading ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                             : <><Save size={15} /> Guardar cambios</>}
              </button>
              <button onClick={() => setEditTarget(null)} disabled={editLoading}
                className="px-5 py-3.5 rounded-[16px] text-[15px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition active:scale-[.97] disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══════════════════════════════════════
          MODAL: APROBAR / RECHAZAR
      ═══════════════════════════════════════ */}
      {modalAccion && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4"
          style={{ animation: 'fadeInBackdrop .18s ease' }}>
          <div className="bg-white border border-gray-100 w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden"
            style={{ animation: 'slideUpSheet .22s cubic-bezier(0.34,1.28,0.64,1)' }}>
            <div className="p-6 pb-4 border-b border-gray-100 flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                modalAccion.tipo === 'aprobar' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}>
                {modalAccion.tipo === 'aprobar' ? <CheckCircle size={24} /> : <X size={24} />}
              </div>
              <h3 className="text-gray-900 text-[18px] font-black tracking-tight">
                ¿{modalAccion.tipo === 'aprobar' ? 'Aprobar' : 'Rechazar'} bodega?
              </h3>
              <p className="text-gray-500 text-[13px] mt-1.5 leading-relaxed">
                <span className="text-gray-900 font-bold">{modalAccion.bodega.nombre}</span>
              </p>
            </div>
            <div className="p-4 flex gap-3">
              <button onClick={() => setModalAccion(null)} disabled={accionLoading}
                className="flex-1 py-3 rounded-xl text-[13px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition">
                Cancelar
              </button>
              <button onClick={procesarAccion} disabled={accionLoading}
                className={`flex-1 py-3 rounded-xl text-[13px] font-black text-white transition ${
                  modalAccion.tipo === 'aprobar' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-red-500 hover:bg-red-400'
                }`}>
                {accionLoading ? 'Procesando...' : `Sí, ${modalAccion.tipo}`}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ═══════════════════════════════════════
          MODAL: ELIMINAR BODEGA — Apple 2026
      ═══════════════════════════════════════ */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6"
          style={{ animation: 'fadeInBackdrop .2s ease' }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[8px]"
            onClick={() => { if (!deleteLoading) setDeleteTarget(null); }} />

          <div className="relative bg-white w-full max-w-sm rounded-[28px] shadow-[0_40px_100px_rgba(0,0,0,0.35)] overflow-hidden"
            style={{ animation: 'slideUpSheet .28s cubic-bezier(0.34,1.25,0.64,1)' }}>

            {/* Handle móvil */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Icono + título */}
            <div className="px-6 pt-5 pb-4 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-[22px] bg-red-50 flex items-center justify-center mb-4"
                style={{ boxShadow: '0 0 0 8px rgba(239,68,68,.08), 0 0 0 16px rgba(239,68,68,.04)' }}>
                <AlertTriangle size={30} className="text-red-500" />
              </div>
              <h3 className="text-[20px] font-black text-gray-900 tracking-tight leading-tight mb-2">
                Eliminar bodega
              </h3>
              <p className="text-[13.5px] text-gray-500 leading-relaxed">
                Se eliminará permanentemente{' '}
                <span className="font-bold text-gray-800">"{deleteTarget.nombre}"</span>
                {' '}y todos sus datos asociados. Esta acción no se puede deshacer.
              </p>
            </div>

            {/* Detalle de lo que se borrará */}
            <div className="mx-6 mb-5 bg-red-50/60 border border-red-100 rounded-2xl px-4 py-3">
              <p className="text-[10.5px] font-bold text-red-400 uppercase tracking-wide mb-2">Se eliminará todo lo relacionado</p>
              <div className="grid grid-cols-2 gap-1">
                {['Inventarios', 'Ventanillas', 'Tarifarios', 'Transacciones', 'Señales de compra', 'Bodegueros asignados'].map(item => (
                  <div key={item} className="flex items-center gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-[10.5px] text-red-600">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Botones iOS full-width */}
            <div className="px-4 pb-6 flex flex-col gap-2.5">
              <button onClick={confirmarEliminar} disabled={deleteLoading}
                className="w-full py-4 rounded-[18px] text-[15px] font-black text-white flex items-center justify-center gap-2.5 transition active:scale-[.97] disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 6px 20px rgba(239,68,68,.4)' }}>
                {deleteLoading
                  ? <><Loader2 size={17} className="animate-spin" /> Eliminando...</>
                  : <><Trash2 size={17} /> Sí, eliminar definitivamente</>}
              </button>
              <button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}
                className="w-full py-4 rounded-[18px] text-[15px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition active:scale-[.97] disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ── TOAST ── */}
      {toast && createPortal(
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl text-[12.5px] font-semibold ${
          toast.ok ? 'bg-gray-900 text-white' : 'bg-red-600 text-white'
        }`} style={{ animation: 'slideUpFade .3s ease' }}>
          {toast.ok
            ? <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center flex-shrink-0"><CheckCircle size={11} className="text-gray-900" /></div>
            : <X size={14} className="text-white flex-shrink-0" />}
          {toast.msg}
        </div>
      , document.body)}

      {/* Animaciones CSS globales — quedan en el <head> del documento */}
      {createPortal(
        <style>{`
          @keyframes fadeInBackdrop { from{opacity:0} to{opacity:1} }
          @keyframes slideUpSheet { from{opacity:0;transform:translateY(40px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
          @keyframes slideUpFade { from{opacity:0;transform:translate(-50%,16px)} to{opacity:1;transform:translate(-50%,0)} }
          .mapboxgl-popup-content { border-radius:16px!important; padding:14px!important; box-shadow:0 8px 32px rgba(0,0,0,.18)!important; border:1px solid rgba(0,0,0,.06)!important; }
          .mapboxgl-popup-close-button { font-size:18px; right:10px; top:8px; color:#9CA3AF; }
          .mapboxgl-popup-close-button:hover { color:#374151; background:none; }
        `}</style>
      , document.head)}
    </div>
  );
}
