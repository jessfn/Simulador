import { useState, useEffect, useRef } from 'react';
import { Settings, Save, Users, Plus, X, Eye, EyeOff, List, CheckCircle, Download, Database, FileSpreadsheet, FileJson, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';
import { createPortal } from 'react-dom';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

interface Parametros {
  margen_pct: number; ventana_dias: number; min_txns: number;
  harineras_n: number; servicios_default: number; flete_default: number;
  costo_fira: number; precio_garantia_sader: number;
}
interface Usuario { id: number; nombre_completo: string; email: string; rol: string; activo: boolean; }
interface NuevoUsuario { nombre_completo: string; email: string; password: string; rol: string; }
interface Concepto { id: number; nombre: string; estatus: string; }

// ── Modal exportar BD ────────────────────────────────────────────────────────
type ExportState = 'idle' | 'loading' | 'done' | 'error';

function ModalExportarBD({ onClose }: { onClose: () => void }) {
  const [estado, setEstado] = useState<ExportState>('idle');
  const [progreso, setProgreso] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const rafRef = useRef<number | undefined>(undefined);
  const startRef = useRef<number>(0);

  const DURACION = 7000; // ms estimados de generación

  function animarProgreso(hasta: number, desde?: number) {
    const inicio = desde ?? progreso;
    startRef.current = performance.now();
    function tick(now: number) {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / DURACION, 1);
      // ease-out cuártico
      const ease = 1 - Math.pow(1 - t, 4);
      const val = inicio + (hasta - inicio) * ease;
      setProgreso(val);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function cancelarAnim() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }

  async function descargar() {
    setEstado('loading');
    setProgreso(0);
    setErrorMsg('');
    animarProgreso(88); // llega al 88% durante la espera

    try {
      const token = localStorage.getItem('simac_token');
      const res = await fetch(`${BASE}/admin/exportar-bd`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Error al generar el archivo');
      }

      cancelarAnim();
      setProgreso(100);
      setEstado('done');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fecha = new Date().toISOString().slice(0, 10);
      a.download = `SIMAC_BD_${fecha}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      cancelarAnim();
      setProgreso(0);
      setEstado('error');
      setErrorMsg(err.message || 'Error de conexión');
    }
  }

  useEffect(() => () => cancelarAnim(), []);

  const HOJAS = [
    'Productores', 'Bodegas', 'Transacciones', 'Inventarios',
    'Precios Maíz', 'Alertas', 'Disponibilidad', 'Señales Compra',
    'Usuarios Productores', 'Seguimiento',
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-950/50 backdrop-blur-[14px]"
        style={{ animation: 'fadein 180ms ease both' }}
        onClick={estado === 'loading' ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.22)] overflow-hidden"
        style={{ animation: 'modalUp 240ms cubic-bezier(0.32,1.6,0.56,1) both' }}
      >
        {/* Header verde */}
        <div className="bg-gradient-to-br from-[#0e5c33] to-[#1a7a44] px-5 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
                <Database size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-[15px] font-black text-white leading-tight">Exportar Base de Datos</h3>
                <p className="text-[11px] text-white/60 mt-0.5">10 hojas · Formato Excel (.xlsx)</p>
              </div>
            </div>
            {estado !== 'loading' && (
              <button onClick={onClose} className="text-white/50 hover:text-white transition-colors mt-0.5">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-4">

          {/* Lista de hojas incluidas */}
          {estado === 'idle' && (
            <div>
              <p className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-2">Contenido del archivo</p>
              <div className="grid grid-cols-2 gap-1.5">
                {HOJAS.map(h => (
                  <div key={h} className="flex items-center gap-1.5 text-[11px] text-gray-600">
                    <FileSpreadsheet size={10} className="text-[#1A5C38] flex-shrink-0" />
                    {h}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                No incluye avisos de privacidad ni datos de usuarios administradores.
              </p>
            </div>
          )}

          {/* Barra de progreso */}
          {estado === 'loading' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-gray-700">Generando archivo…</p>
                <span className="text-[11px] font-bold text-[#1A5C38]">{Math.round(progreso)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1A5C38] to-[#34d399] transition-none"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <p className="text-[10.5px] text-gray-400 text-center">
                Consultando tablas y construyendo el Excel…
              </p>
            </div>
          )}

          {/* Éxito */}
          {estado === 'done' && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-emerald-500" />
              </div>
              <p className="text-[13px] font-bold text-gray-800">¡Descarga lista!</p>
              <p className="text-[11px] text-gray-400 text-center">El archivo se guardó en tu carpeta de descargas.</p>
            </div>
          )}

          {/* Error */}
          {estado === 'error' && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-3.5">
              <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[12px] font-bold text-red-700">Error al generar el archivo</p>
                <p className="text-[11px] text-red-500 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2.5 pt-1">
            {estado !== 'loading' && (
              <button
                onClick={onClose}
                className="flex-1 text-[12px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 py-2.5 rounded-2xl transition-all duration-150 active:scale-95"
              >
                {estado === 'done' ? 'Cerrar' : 'Cancelar'}
              </button>
            )}
            {(estado === 'idle' || estado === 'error') && (
              <button
                onClick={descargar}
                className="flex-1 flex items-center justify-center gap-2 text-[12px] font-bold text-white bg-gradient-to-br from-[#1A5C38] to-[#227a4a] hover:from-[#154d2f] hover:to-[#1a6038] py-2.5 rounded-2xl transition-all duration-150 active:scale-95 shadow-[0_4px_16px_rgba(26,92,56,0.3)]"
              >
                <Download size={13} />
                {estado === 'error' ? 'Reintentar' : 'Descargar Excel'}
              </button>
            )}
            {estado === 'loading' && (
              <div className="flex-1 flex items-center justify-center gap-2 text-[12px] font-bold text-white bg-[#1A5C38]/70 py-2.5 rounded-2xl cursor-not-allowed">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Generando…
              </div>
            )}
          </div>
        </div>

        <style>{`
          @keyframes fadein { from { opacity:0 } to { opacity:1 } }
          @keyframes modalUp { from { opacity:0; transform:translateY(24px) scale(.97) } to { opacity:1; transform:none } }
        `}</style>
      </div>
    </div>,
    document.body
  );
}

// ── Modal exportar polígonos de parcelas ────────────────────────────────────
interface ParcelaExport {
  up_id: number; up_name: string | null; state_name: string | null; municipality_name: string | null;
  area_ha_calc: number | null; created_at: string | null; geom_geojson: any;
  centroid_lat: number; centroid_lng: number; producer_id: number;
  nombres: string; apellido_paterno: string; apellido_materno: string | null;
  curp: string | null; correo: string | null; estado_validacion: string;
  ciclo_activo: string | null; cultivo_principal: string | null; tipo_cultivo: string | null;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function descargarBlob(contenido: string, nombreArchivo: string, mime: string) {
  const blob = new Blob([contenido], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ModalExportarParcelas({ onClose }: { onClose: () => void }) {
  const [formato, setFormato] = useState<'geojson' | 'csv'>('geojson');
  const [estado, setEstado] = useState<ExportState>('idle');
  const [progreso, setProgreso] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [totalExportado, setTotalExportado] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  function animarProgreso(hasta: number) {
    const inicio = 0;
    const startTime = performance.now();
    const DURACION = 4500;
    function tick(now: number) {
      const t = Math.min((now - startTime) / DURACION, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      setProgreso(inicio + (hasta - inicio) * ease);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }
  function cancelarAnim() { if (rafRef.current) cancelAnimationFrame(rafRef.current); }
  useEffect(() => () => cancelarAnim(), []);

  async function descargar() {
    setEstado('loading');
    setProgreso(0);
    setErrorMsg('');
    animarProgreso(88);
    try {
      const res = await fetch(`${BASE}/admin/parcelas`, { headers: HDR() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Error al obtener las parcelas');
      }
      const data = await res.json();
      const todas: ParcelaExport[] = data.parcelas || [];
      const conPoligono = todas.filter(p => p.geom_geojson?.coordinates);
      if (conPoligono.length === 0) throw new Error('No hay parcelas con polígono registrado');

      const fecha = new Date().toISOString().slice(0, 10);

      if (formato === 'geojson') {
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: conPoligono.map(p => ({
            type: 'Feature',
            geometry: p.geom_geojson,
            properties: {
              up_id: p.up_id, up_name: p.up_name,
              productor: [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' '),
              curp: p.curp, correo: p.correo, estado_validacion: p.estado_validacion,
              estado: p.state_name, municipio: p.municipality_name, area_ha: p.area_ha_calc,
              cultivo_principal: p.cultivo_principal, tipo_cultivo: p.tipo_cultivo,
              ciclo_activo: p.ciclo_activo, fecha_registro: p.created_at,
            },
          })),
        };
        descargarBlob(JSON.stringify(fc), `parcelas_poligonos_simac_${fecha}.geojson`, 'application/geo+json');
      } else {
        const columnas = [
          'up_id','up_name','productor','curp','correo','estado_validacion',
          'estado','municipio','area_ha','cultivo_principal','tipo_cultivo',
          'ciclo_activo','fecha_registro','centroid_lat','centroid_lng','poligono_geojson',
        ];
        const filas = conPoligono.map(p => [
          p.up_id, p.up_name ?? '',
          [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' '),
          p.curp ?? '', p.correo ?? '', p.estado_validacion ?? '', p.state_name ?? '',
          p.municipality_name ?? '', p.area_ha_calc ?? '', p.cultivo_principal ?? '',
          p.tipo_cultivo ?? '', p.ciclo_activo ?? '', p.created_at ?? '',
          p.centroid_lat ?? '', p.centroid_lng ?? '', JSON.stringify(p.geom_geojson),
        ]);
        const csv = [columnas.join(','), ...filas.map(f => f.map(csvCell).join(','))].join('\n');
        descargarBlob('﻿' + csv, `parcelas_poligonos_simac_${fecha}.csv`, 'text/csv');
      }

      cancelarAnim();
      setProgreso(100);
      setTotalExportado(conPoligono.length);
      setEstado('done');
    } catch (err: any) {
      cancelarAnim();
      setProgreso(0);
      setEstado('error');
      setErrorMsg(err.message || 'Error de conexión');
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-gray-950/50 backdrop-blur-[14px]" style={{ animation: 'fadein 180ms ease both' }}
        onClick={estado === 'loading' ? undefined : onClose} />

      <div className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-[0_32px_80px_rgba(0,0,0,0.22)] overflow-hidden"
        style={{ animation: 'modalUp 240ms cubic-bezier(0.32,1.6,0.56,1) both' }}>

        {/* Header rojo */}
        <div className="bg-gradient-to-br from-[#b91c1c] to-[#dc2626] px-5 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
                <MapPin size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-[15px] font-black text-white leading-tight">Polígonos de Parcelas</h3>
                <p className="text-[11px] text-white/70 mt-0.5">Base completa de predios registrados</p>
              </div>
            </div>
            {estado !== 'loading' && (
              <button onClick={onClose} className="text-white/50 hover:text-white transition-colors mt-0.5">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 pt-4 pb-5 space-y-4">

          {estado === 'idle' && (
            <>
              <div>
                <p className="text-[10.5px] font-bold text-gray-400 uppercase tracking-wide mb-2">Formato de exportación</p>
                <div className="flex flex-col gap-2">
                  {([
                    { key: 'geojson' as const, icon: <FileJson size={15} />, titulo: 'GeoJSON', desc: 'Polígono real de cada parcela — QGIS, ArcGIS, Google Earth.' },
                    { key: 'csv' as const, icon: <FileSpreadsheet size={15} />, titulo: 'CSV', desc: 'Tabla de productor/ciclo + columna con el polígono completo (no solo centroide).' },
                  ]).map(op => (
                    <button key={op.key} onClick={() => setFormato(op.key)}
                      className={`flex items-start gap-3 text-left px-3.5 py-3 rounded-2xl border transition-all ${
                        formato === op.key ? 'border-red-300 ring-2 ring-red-100 bg-red-50/60' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${formato === op.key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        {op.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-bold text-gray-900">{op.titulo}</p>
                        <p className="text-[10.5px] text-gray-500 mt-0.5 leading-snug">{op.desc}</p>
                      </div>
                      <span className={`w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center ${formato === op.key ? 'border-red-600 bg-red-600' : 'border-gray-300'}`}>
                        {formato === op.key && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-3.5 py-3">
                <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10.5px] text-amber-700 leading-relaxed">Incluye datos personales (nombre, CURP, correo). Úsalo conforme al aviso de privacidad vigente.</p>
              </div>
            </>
          )}

          {estado === 'loading' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-gray-700">Generando archivo…</p>
                <span className="text-[11px] font-bold text-red-600">{Math.round(progreso)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400 transition-none" style={{ width: `${progreso}%` }} />
              </div>
              <p className="text-[10.5px] text-gray-400 text-center">Consultando parcelas y construyendo el {formato.toUpperCase()}…</p>
            </div>
          )}

          {estado === 'done' && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-emerald-500" />
              </div>
              <p className="text-[13px] font-bold text-gray-800">¡Descarga lista!</p>
              <p className="text-[11px] text-gray-400 text-center">{totalExportado.toLocaleString('es-MX')} polígonos exportados en {formato.toUpperCase()}.</p>
            </div>
          )}

          {estado === 'error' && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-3.5">
              <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[12px] font-bold text-red-700">Error al generar el archivo</p>
                <p className="text-[11px] text-red-500 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2.5 pt-1">
            {estado !== 'loading' && (
              <button onClick={onClose}
                className="flex-1 text-[12px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 py-2.5 rounded-2xl transition-all duration-150 active:scale-95">
                {estado === 'done' ? 'Cerrar' : 'Cancelar'}
              </button>
            )}
            {(estado === 'idle' || estado === 'error') && (
              <button onClick={descargar}
                className="flex-1 flex items-center justify-center gap-2 text-[12px] font-bold text-white bg-gradient-to-br from-[#b91c1c] to-[#dc2626] hover:from-[#991616] hover:to-[#c11f1f] py-2.5 rounded-2xl transition-all duration-150 active:scale-95 shadow-[0_4px_16px_rgba(220,38,38,0.3)]">
                <Download size={13} />
                {estado === 'error' ? 'Reintentar' : `Descargar ${formato.toUpperCase()}`}
              </button>
            )}
            {estado === 'loading' && (
              <div className="flex-1 flex items-center justify-center gap-2 text-[12px] font-bold text-white bg-red-600/70 py-2.5 rounded-2xl cursor-not-allowed">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Generando…
              </div>
            )}
          </div>
        </div>

        <style>{`
          @keyframes fadein { from { opacity:0 } to { opacity:1 } }
          @keyframes modalUp { from { opacity:0; transform:translateY(24px) scale(.97) } to { opacity:1; transform:none } }
        `}</style>
      </div>
    </div>,
    document.body
  );
}

export default function ConfiguracionAdminPage() {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showParcelasModal, setShowParcelasModal] = useState(false);
  const [params, setParams]         = useState<Parametros | null>(null);

  const [editParams, setEditParams] = useState<Partial<Parametros>>({});
  const [savingParams, setSavingParams] = useState(false);
  const [savedParams, setSavedParams]   = useState(false);
  const [admins, setAdmins]             = useState<Usuario[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [nuevoUser, setNuevoUser]       = useState<NuevoUsuario>({ nombre_completo: '', email: '', password: '', rol: 'responsable' });
  const [showPass, setShowPass]         = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError]   = useState('');
  const [conceptos, setConceptos]       = useState<Concepto[]>([]);
  const [loadingConceptos, setLoadingConceptos] = useState(true);
  const [showConceptoModal, setShowConceptoModal] = useState(false);
  const [nuevoConcepto, setNuevoConcepto] = useState('');
  const [creatingConcepto, setCreatingConcepto] = useState(false);
  const [conceptoError, setConceptoError] = useState('');

  async function cargarParams() {
    try {
      const r = await fetch(`${BASE}/precios/parametros`, { headers: HDR() });
      const d = await r.json();
      setParams(d.parametros); setEditParams(d.parametros);
    } catch (e) { console.error(e); }
  }
  async function cargarAdmins() {
    setLoadingAdmins(true);
    try {
      const r = await fetch(`${BASE}/admin/usuarios?rol=admin`, { headers: HDR() });
      const d = await r.json();
      setAdmins(d.usuarios ?? d.productores ?? []);
    } catch (e) { console.error(e); } finally { setLoadingAdmins(false); }
  }
  async function cargarConceptos() {
    setLoadingConceptos(true);
    try {
      const r = await fetch(`${BASE}/cat-conceptos-servicio`, { headers: HDR() });
      const d = await r.json();
      setConceptos(d.conceptos ?? d ?? []);
    } catch (e) { console.error(e); } finally { setLoadingConceptos(false); }
  }
  async function proponerConcepto() {
    setConceptoError('');
    if (!nuevoConcepto.trim()) { setConceptoError('El nombre es obligatorio'); return; }
    setCreatingConcepto(true);
    try {
      const r = await fetch(`${BASE}/cat-conceptos-servicio/proponer`, {
        method: 'POST', headers: HDR(), body: JSON.stringify({ nombre: nuevoConcepto.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setConceptoError(d.error || 'Error al proponer concepto'); return; }
      setShowConceptoModal(false); setNuevoConcepto(''); cargarConceptos();
    } catch { setConceptoError('Error de conexión'); } finally { setCreatingConcepto(false); }
  }
  async function toggleAprobar(id: number) {
    try {
      await fetch(`${BASE}/cat-conceptos-servicio/${id}/aprobar`, { method: 'PATCH', headers: HDR() });
      cargarConceptos();
    } catch (e) { console.error(e); }
  }
  useEffect(() => { cargarParams(); cargarAdmins(); cargarConceptos(); }, []);
  async function guardarParams() {
    setSavingParams(true);
    try {
      const r = await fetch(`${BASE}/precios/parametros`, { method: 'PUT', headers: HDR(), body: JSON.stringify(editParams) });
      if (r.ok) { setSavedParams(true); setTimeout(() => setSavedParams(false), 2000); cargarParams(); }
    } catch (e) { console.error(e); } finally { setSavingParams(false); }
  }
  async function crearUsuario() {
    setCreateError('');
    if (!nuevoUser.nombre_completo || !nuevoUser.email || !nuevoUser.password) { setCreateError('Todos los campos son obligatorios'); return; }
    if (nuevoUser.password.length < 8) { setCreateError('La contraseña debe tener al menos 8 caracteres'); return; }
    setCreatingUser(true);
    try {
      const r = await fetch(`${BASE}/admin/crear-usuario`, {
        method: 'POST', headers: HDR(),
        body: JSON.stringify({ ...nuevoUser, curp: 'XXXXX00000XXXXXX00', telefono: '0000000000' }),
      });
      const d = await r.json();
      if (!r.ok) { setCreateError(d.error || 'Error al crear usuario'); return; }
      setShowModal(false); setNuevoUser({ nombre_completo: '', email: '', password: '', rol: 'responsable' }); cargarAdmins();
    } catch (e) { setCreateError('Error de conexión'); } finally { setCreatingUser(false); }
  }

  const INPUT = 'w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#1A5C38]/40 focus:bg-white transition-all duration-150';
  const LABEL = 'text-[9.5px] font-bold text-gray-400 uppercase tracking-wide mb-1 block';

  return (
    <div className="flex flex-col gap-4 pt-4 pb-6">

      {/* ── Fila de tarjetas de acción rápida ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Tarjeta: Exportar BD */}
        <div className="bg-gradient-to-br from-[#0d5530] to-[#1a7a44] rounded-2xl p-4 flex flex-col gap-3 shadow-[0_4px_24px_rgba(13,85,48,0.25)] relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5" />
          <div className="absolute -bottom-6 -left-4 w-20 h-20 rounded-full bg-white/5" />
          <div className="flex items-center gap-2.5 relative">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <Database size={16} className="text-white" />
            </div>
            <div>
              <p className="text-[12.5px] font-black text-white leading-tight">Exportar Base de Datos</p>
              <p className="text-[10px] text-white/55 mt-0.5">10 tablas · Formato Excel</p>
            </div>
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            className="relative flex items-center justify-center gap-2 text-[11.5px] font-bold text-[#0d5530] bg-white hover:bg-white/90 py-2 rounded-xl transition-all duration-150 active:scale-95 shadow-sm"
          >
            <Download size={12} />
            Descargar Excel
          </button>
        </div>

        {/* Tarjeta: Nuevo Administrador */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <Users size={16} className="text-blue-600" />
            </div>
            <div>
              <p className="text-[12.5px] font-black text-gray-900 leading-tight">Administradores</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{loadingAdmins ? '…' : `${admins.length} usuario${admins.length !== 1 ? 's' : ''} registrado${admins.length !== 1 ? 's' : ''}`}</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 text-[11.5px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-transparent py-2 rounded-xl transition-all duration-150 active:scale-95"
          >
            <Plus size={12} />
            Nuevo usuario
          </button>
        </div>

        {/* Tarjeta: Nuevo Concepto */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
              <List size={16} className="text-amber-600" />
            </div>
            <div>
              <p className="text-[12.5px] font-black text-gray-900 leading-tight">Catálogos</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{loadingConceptos ? '…' : `${conceptos.length} concepto${conceptos.length !== 1 ? 's' : ''} de servicio`}</p>
            </div>
          </div>
          <button
            onClick={() => setShowConceptoModal(true)}
            className="flex items-center justify-center gap-2 text-[11.5px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-600 hover:text-white border border-amber-200 hover:border-transparent py-2 rounded-xl transition-all duration-150 active:scale-95"
          >
            <Plus size={12} />
            Nuevo concepto
          </button>
        </div>

        {/* Tarjeta: Polígonos de Parcelas (roja) */}
        <div className="bg-gradient-to-br from-[#b91c1c] to-[#dc2626] rounded-2xl p-4 flex flex-col gap-3 shadow-[0_4px_24px_rgba(220,38,38,0.25)] relative overflow-hidden">
          <div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5" />
          <div className="absolute -bottom-6 -left-4 w-20 h-20 rounded-full bg-white/5" />
          <div className="flex items-center gap-2.5 relative">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <MapPin size={16} className="text-white" />
            </div>
            <div>
              <p className="text-[12.5px] font-black text-white leading-tight">Polígonos de Parcelas</p>
              <p className="text-[10px] text-white/60 mt-0.5">GeoJSON o CSV · Predios completos</p>
            </div>
          </div>
          <button
            onClick={() => setShowParcelasModal(true)}
            className="relative flex items-center justify-center gap-2 text-[11.5px] font-bold text-[#b91c1c] bg-white hover:bg-white/90 py-2 rounded-xl transition-all duration-150 active:scale-95 shadow-sm"
          >
            <Download size={12} />
            Descargar base
          </button>
        </div>
      </div>

      {/* ── Grid principal 2 columnas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Parámetros del sistema */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#eef8f2] flex items-center justify-center">
                <Settings size={12} className="text-[#1A5C38]" />
              </div>
              <div>
                <h2 className="text-[12.5px] font-bold text-gray-900">Parámetros del Sistema</h2>
                <p className="text-[9.5px] text-gray-400">Señales de compra y precios</p>
              </div>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
            {[
              { key: 'margen_pct'             as keyof Parametros, label: 'Umbral brecha crítica (%)',    hint: 'Porcentaje sobre PO+S' },
              { key: 'ventana_dias'           as keyof Parametros, label: 'Ventana promedio PO (días)',    hint: 'Días para cálculo promedio' },
              { key: 'servicios_default'      as keyof Parametros, label: 'Servicios bodega defecto',     hint: 'MXN/ton' },
              { key: 'flete_default'          as keyof Parametros, label: 'Flete por defecto',            hint: 'MXN/ton' },
              { key: 'costo_fira'             as keyof Parametros, label: 'Costo FIRA por defecto',       hint: 'MXN/ton' },
              { key: 'precio_garantia_sader'  as keyof Parametros, label: 'Precio garantía SADER',        hint: 'MXN/ton' },
            ].map(({ key, label, hint }) => (
              <div key={key} className="space-y-1">
                <label className={LABEL}>{label}</label>
                <input
                  type="number" step="0.01" className={INPUT}
                  value={editParams[key] ?? params?.[key] ?? ''}
                  onChange={e => setEditParams(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                />
                <p className="text-[9px] text-gray-400">{hint}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={guardarParams} disabled={savingParams}
              className={`w-full flex items-center justify-center gap-2 text-[11.5px] font-bold py-2.5 rounded-xl border transition-all duration-150 active:scale-95 disabled:opacity-50 ${
                savedParams
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-[#eef8f2] border-[#1A5C38]/20 text-[#1A5C38] hover:bg-[#1A5C38] hover:text-white hover:border-transparent'
              }`}
            >
              <Save size={12} />
              {savedParams ? 'Guardado ✓' : savingParams ? 'Guardando…' : 'Guardar parámetros'}
            </button>
          </div>
        </div>

        {/* Columna derecha: Admins + Catálogos */}
        <div className="flex flex-col gap-4">

          {/* Administradores */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users size={12} className="text-blue-600" />
                </div>
                <h2 className="text-[12.5px] font-bold text-gray-900">Administradores</h2>
              </div>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 text-[10.5px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-transparent px-2.5 py-1.5 rounded-lg transition-all duration-150 active:scale-95">
                <Plus size={10} /> Nuevo
              </button>
            </div>
            <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="text-gray-400 text-[9.5px] uppercase tracking-wide font-bold bg-gray-50/90 backdrop-blur-sm">
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Email</th>
                    <th className="px-4 py-2.5 text-center">Rol</th>
                    <th className="px-4 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingAdmins ? (
                    [1,2,3].map(i => (
                      <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : admins.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-[12px] text-gray-400">Sin administradores registrados</td></tr>
                  ) : admins.map((u, i) => (
                    <tr key={i} className="hover:bg-gray-50/60 transition-all duration-150">
                      <td className="px-4 py-2.5 text-[11.5px] font-semibold text-gray-800">{u.nombre_completo}</td>
                      <td className="px-4 py-2.5 text-[11px] text-gray-500 hidden sm:table-cell">{u.email}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-[9.5px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 uppercase">
                          {u.rol.charAt(0).toUpperCase() + u.rol.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[9.5px] font-bold rounded-full px-2 py-0.5 ${u.activo ? 'text-emerald-600 bg-emerald-50 border border-emerald-200' : 'text-red-600 bg-red-50 border border-red-200'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catálogos */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex-1">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                  <List size={12} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="text-[12.5px] font-bold text-gray-900">Catálogos</h2>
                  <p className="text-[9.5px] text-gray-400">Conceptos de servicio de bodega</p>
                </div>
              </div>
              <button onClick={() => setShowConceptoModal(true)}
                className="flex items-center gap-1.5 text-[10.5px] font-bold text-amber-600 bg-amber-50 hover:bg-amber-600 hover:text-white border border-amber-200 hover:border-transparent px-2.5 py-1.5 rounded-lg transition-all duration-150 active:scale-95">
                <Plus size={10} /> Nuevo
              </button>
            </div>
            <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="text-gray-400 text-[9.5px] uppercase tracking-wide font-bold bg-gray-50/90 backdrop-blur-sm">
                    <th className="px-4 py-2.5">Nombre</th>
                    <th className="px-4 py-2.5 text-center">Estatus</th>
                    <th className="px-4 py-2.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loadingConceptos ? (
                    [1,2,3].map(i => (
                      <tr key={i}><td colSpan={3} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : conceptos.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-[12px] text-gray-400">Sin conceptos registrados</td></tr>
                  ) : conceptos.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-all duration-150">
                      <td className="px-4 py-2.5 text-[11.5px] font-semibold text-gray-800">{c.nombre}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-[9.5px] font-bold rounded-full px-2 py-0.5 ${
                          c.estatus === 'aprobado'
                            ? 'text-emerald-600 bg-emerald-50 border border-emerald-200'
                            : 'text-amber-600 bg-amber-50 border border-amber-200'
                        }`}>{c.estatus}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => toggleAprobar(c.id)}
                          className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-2.5 py-1 rounded-lg border transition-all duration-150 active:scale-95 ${
                            c.estatus === 'aprobado'
                              ? 'text-gray-500 bg-gray-50 border-gray-200 hover:bg-white'
                              : 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-transparent'
                          }`}>
                          <CheckCircle size={9} />
                          {c.estatus === 'aprobado' ? 'Revocar' : 'Aprobar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal concepto */}
      {showConceptoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13.5px] font-bold text-gray-900">Nuevo concepto de servicio</h3>
              <button onClick={() => { setShowConceptoModal(false); setConceptoError(''); }} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Nombre del concepto</label>
                <input className={INPUT} value={nuevoConcepto} onChange={e => setNuevoConcepto(e.target.value)} placeholder="Ej. Secado, Fumigación" />
              </div>
              {conceptoError && <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{conceptoError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowConceptoModal(false); setConceptoError(''); }} className="flex-1 text-[12px] font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 py-2 rounded-xl transition-all duration-150 active:scale-95">Cancelar</button>
                <button onClick={proponerConcepto} disabled={creatingConcepto} className="flex-1 text-[12px] font-bold text-white bg-amber-600 hover:bg-amber-500 py-2 rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50">
                  {creatingConcepto ? 'Creando...' : 'Proponer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal exportar BD */}
      {showExportModal && <ModalExportarBD onClose={() => setShowExportModal(false)} />}

      {/* Modal exportar polígonos de parcelas */}
      {showParcelasModal && <ModalExportarParcelas onClose={() => setShowParcelasModal(false)} />}

      {/* Modal usuario */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
          <div className="bg-white border border-gray-100 rounded-2xl p-5 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13.5px] font-bold text-gray-900">Crear nuevo usuario</h3>
              <button onClick={() => { setShowModal(false); setCreateError(''); }} className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'nombre_completo', label: 'Nombre completo', type: 'text', placeholder: 'Ej. Juan Pérez García' },
                { key: 'email',           label: 'Email',           type: 'email', placeholder: 'usuario@ejemplo.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className={LABEL}>{f.label}</label>
                  <input type={f.type} className={INPUT} placeholder={f.placeholder}
                    value={(nuevoUser as any)[f.key]}
                    onChange={e => setNuevoUser(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className={LABEL}>Contraseña</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className={INPUT + ' pr-9'} value={nuevoUser.password}
                    onChange={e => setNuevoUser(p => ({ ...p, password: e.target.value }))} placeholder="Mín. 8 caracteres" />
                  <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors">
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              <div>
                <label className={LABEL}>Rol</label>
                <select className={INPUT} value={nuevoUser.rol} onChange={e => setNuevoUser(p => ({ ...p, rol: e.target.value }))}>
                  <option value="admin">Admin</option>
                  <option value="responsable">Responsable</option>
                </select>
              </div>
              {createError && <p className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowModal(false); setCreateError(''); }} className="flex-1 text-[12px] font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 py-2 rounded-xl transition-all duration-150 active:scale-95">Cancelar</button>
                <button onClick={crearUsuario} disabled={creatingUser} className="flex-1 text-[12px] font-bold text-white bg-[#1A5C38] hover:bg-[#154d2f] py-2 rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-50">
                  {creatingUser ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

