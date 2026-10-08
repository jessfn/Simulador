import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search, Check, X, Eye, EyeOff, ShieldAlert, RefreshCw,
  AlertTriangle, BarChart3, ChevronLeft, ChevronRight,
  Users, UserX, Clock, Download, Filter, Trash2,
  Phone, Mail, MapPin, Calendar, User, KeyRound, ExternalLink,
  Loader2, Copy, CheckCheck
} from 'lucide-react';
import { usePermisosStore } from '../../store/permisos';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

interface Productor {
  id: number;
  nombre: string;
  apellidos: string;
  curp: string;
  email: string;
  telefono: string;
  rol: string;
  estado_validacion: 'pendiente' | 'activo' | 'rechazado' | 'suspendido';
  created_at: string;
  tipo_productor: 'A' | 'B';
  up_estado?: string;
  up_municipio?: string;
  up_cultivo?: string;
}

function calcularGeneroDesadeCurp(curp: string): 'H' | 'M' | null {
  if (!curp || curp.length < 11) return null;
  const g = curp.charAt(10).toUpperCase();
  return g === 'H' || g === 'M' ? g : null;
}

function calcularEdadDesdeCurp(curp: string): number | null {
  if (!curp || curp.length < 10) return null;
  const yy = parseInt(curp.substring(4, 6), 10);
  const mm = parseInt(curp.substring(6, 8), 10) - 1;
  const dd = parseInt(curp.substring(8, 10), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return null;
  const siglo = yy <= 30 ? 2000 : 1900;
  const nacimiento = new Date(siglo + yy, mm, dd);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mDiff = hoy.getMonth() - nacimiento.getMonth();
  if (mDiff < 0 || (mDiff === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad >= 0 && edad < 130 ? edad : null;
}

const STATUS_CFG = {
  activo:    { label: 'Activo',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  pendiente: { label: 'Pendiente', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  rechazado: { label: 'Rechazado', color: 'text-red-700 bg-red-50 border-red-200' },
  suspendido:{ label: 'Suspendido',color: 'text-gray-600 bg-gray-100 border-gray-200' },
};

/* ─── helpers visuales ───────────────────────────────────────────── */
function Initials({ nombre, apellidos }: { nombre: string; apellidos: string }) {
  const letters = ((nombre[0] || '') + (apellidos[0] || '')).toUpperCase();
  return (
    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-900/20 flex-shrink-0">
      <span className="text-white font-black text-2xl tracking-tight">{letters}</span>
    </div>
  );
}

function InfoTile({ icon, label, value, mono = false }: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-emerald-500">{icon}</span>
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-[13px] font-semibold text-gray-800 leading-snug ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}

/* ─── Modal Ver Productor — Apple 2026 ──────────────────────────── */
function ModalVerProductor({
  prod, onClose,
}: {
  prod: Productor;
  onClose: () => void;
  onAprobar: () => void; onRechazar: () => void;
  onSuspender: () => void; onReactivar: () => void;
  onEliminar: () => void;
}) {
  const navigate = useNavigate();
  const { puedo, permisosTotal } = usePermisosStore();
  const puedeEditar = permisosTotal || puedo('productores', 'editar');
  const [nipVisible, setNipVisible] = useState(false);
  const [nipReal, setNipReal]       = useState<string | null>(null);
  const [nipLoading, setNipLoading] = useState(false);
  const [nipError, setNipError]     = useState('');
  const [copiado, setCopiado]       = useState(false);

  const genero = calcularGeneroDesadeCurp(prod.curp);
  const edad   = calcularEdadDesdeCurp(prod.curp);

  const cfg    = STATUS_CFG[prod.estado_validacion];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function handleVerNip() {
    if (nipReal !== null && nipReal !== '') { setNipVisible(v => !v); return; }
    setNipLoading(true); setNipError('');
    try {
      const res = await fetch(`${BASE}/admin/productor-nip/${prod.id}`, {
        headers: HDR(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al obtener NIP');
      const pin = data.pin ?? '';
      setNipReal(pin);
      if (pin) setNipVisible(true);
    } catch (e: any) {
      setNipError(e.message);
    } finally {
      setNipLoading(false);
    }
  }

  async function handleAsignarNip() {
    setNipLoading(true); setNipError('');
    try {
      const res = await fetch(`${BASE}/admin/asignar-nip/${prod.id}`, {
        method: 'POST',
        headers: { ...HDR(), 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al asignar NIP');
      setNipReal(data.pin);
      setNipVisible(true);
    } catch (e: any) {
      setNipError(e.message);
    } finally {
      setNipLoading(false);
    }
  }

  function copiarNip() {
    if (!nipReal) return;
    navigator.clipboard.writeText(nipReal).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />

      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2rem] shadow-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        style={{ boxShadow: '0 40px 80px -10px rgba(0,0,0,0.45)', animation: 'slideUpSheet .28s cubic-bezier(.34,1.25,.64,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle mobile */}
        <div className="sm:hidden flex justify-center pt-3 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header hero */}
        <div className="flex-shrink-0 px-6 pt-5 pb-4 flex items-start gap-4">
          <Initials nombre={prod.nombre} apellidos={prod.apellidos} />
          <div className="flex-1 min-w-0 pt-1">
            <p className="text-[18px] font-extrabold text-gray-900 leading-tight">
              {prod.nombre} {prod.apellidos}
            </p>
            <p className="font-mono text-[10px] text-gray-400 mt-0.5 truncate">{prod.curp || 'Sin CURP'}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.color}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                {cfg.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                prod.tipo_productor === 'B' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>Tipo {prod.tipo_productor}</span>
              {genero && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                  {genero === 'H' ? 'Hombre' : 'Mujer'}
                  {edad ? ` · ${edad} años` : ''}
                </span>
              )}
            </div>
          </div>
          {/* Botones top-right */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <X size={14} className="text-gray-500" />
            </button>
            <button
              onClick={() => { onClose(); navigate(`/maiz/admin/productores/${prod.id}`); }}
              className="w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-100 flex items-center justify-center transition-colors"
              title="Ver perfil completo"
            >
              <ExternalLink size={13} className="text-emerald-600" />
            </button>
          </div>
        </div>

        {/* Scroll body */}
        <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-3">

          {/* Grid de info */}
          <div className="grid grid-cols-2 gap-2.5">
            <InfoTile icon={<Phone size={13} />} label="Teléfono" value={prod.telefono} />
            <InfoTile icon={<Mail size={13} />}  label="Correo"   value={prod.email} />
            <InfoTile
              icon={<Calendar size={13} />}
              label="Registro"
              value={prod.created_at ? new Date(prod.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
            />
            <InfoTile icon={<User size={13} />} label="ID" value={`#${String(prod.id).padStart(6,'0')}`} mono />
          </div>

          {/* Ubicación UP */}
          {(prod.up_estado || prod.up_municipio) ? (
            <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-emerald-500"><MapPin size={13} /></span>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Ubicación UP</p>
              </div>
              <p className="text-[13px] font-semibold text-gray-800">
                {[prod.up_municipio, prod.up_estado].filter(Boolean).join(', ')}
              </p>
              {prod.up_cultivo && (
                <p className="text-[11px] text-gray-400 mt-0.5">{prod.up_cultivo}</p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-3.5 border border-dashed border-gray-200">
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-gray-300" />
                <p className="text-[12px] text-gray-400 italic">Sin ubicación UP registrada</p>
              </div>
            </div>
          )}

          {/* NIP de acceso — dato sensible, requiere permiso de editar */}
          {puedeEditar && (
          <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-100">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-emerald-500"><KeyRound size={13} /></span>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">NIP de acceso</p>
            </div>

            {nipError && (
              <p className="text-[11px] text-red-500 mb-2">{nipError}</p>
            )}

            {/* Estado: aún no cargado */}
            {nipReal === null && (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-1">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="w-9 h-11 rounded-xl bg-white border-2 border-gray-100 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleVerNip}
                  disabled={nipLoading}
                  className="h-9 px-3 rounded-xl bg-white border border-gray-200 flex items-center gap-1.5 hover:bg-emerald-50 hover:border-emerald-200 transition-colors text-[11px] font-bold text-gray-500 hover:text-emerald-700 disabled:opacity-50"
                >
                  {nipLoading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                  {nipLoading ? 'Cargando…' : 'Ver NIP'}
                </button>
              </div>
            )}

            {/* Estado: sin pin_texto — cuenta antigua */}
            {nipReal === '' && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400 leading-snug">
                  NIP no recuperable.<br />
                  <span className="text-gray-300">Asigna uno nuevo para verlo aquí.</span>
                </p>
                <button
                  onClick={handleAsignarNip}
                  disabled={nipLoading}
                  className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[.97] flex items-center gap-1.5 text-white text-[11px] font-bold transition-all disabled:opacity-50 flex-shrink-0"
                >
                  {nipLoading ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                  {nipLoading ? 'Asignando…' : 'Asignar NIP'}
                </button>
              </div>
            )}

            {/* Estado: NIP cargado */}
            {nipReal !== null && nipReal !== '' && (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-1">
                  {nipVisible ? (
                    nipReal.split('').map((d, i) => (
                      <div key={i} className="w-9 h-11 rounded-xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-sm">
                        <span className="text-[22px] font-black text-emerald-700 tabular-nums">{d}</span>
                      </div>
                    ))
                  ) : (
                    [0,1,2,3].map(i => (
                      <div key={i} className="w-9 h-11 rounded-xl bg-white border-2 border-gray-100 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-1.5">
                  {nipVisible && (
                    <button onClick={copiarNip} className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-emerald-50 hover:border-emerald-200 transition-colors" title="Copiar NIP">
                      {copiado ? <CheckCheck size={14} className="text-emerald-600" /> : <Copy size={14} className="text-gray-400" />}
                    </button>
                  )}
                  <button
                    onClick={() => setNipVisible(v => !v)}
                    className="h-9 px-3 rounded-xl bg-white border border-gray-200 flex items-center gap-1.5 hover:bg-emerald-50 hover:border-emerald-200 transition-colors text-[11px] font-bold text-gray-500 hover:text-emerald-700"
                  >
                    {nipVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                    {nipVisible ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Ver perfil */}
          <div className="pt-1">
            <button
              onClick={() => { onClose(); navigate(`/maiz/admin/productores/${prod.id}`); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-[.97] text-gray-700 text-[13px] font-bold transition-all"
            >
              <ExternalLink size={15} /> Ver perfil completo
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ProductoresAdminPage() {
  const { puedo, permisosTotal } = usePermisosStore();
  const puedeEditar     = permisosTotal || puedo('productores', 'editar');
  const puedeEliminar   = permisosTotal || puedo('productores', 'eliminar');
  const puedeExportar   = permisosTotal || puedo('productores', 'exportar');
  const puedeVerDetalle = permisosTotal || puedo('productores', 'ver_detalle');

  const [tab, setTab] = useState<'todos' | 'pendiente' | 'suspendido'>('todos');
  const [productores, setProductores] = useState<Productor[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarStats, setMostrarStats] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [estatusFilter, setEstatusFilter] = useState('');
  const [estadosDisponibles, setEstadosDisponibles] = useState<string[]>([]);

  const [verProductor, setVerProductor] = useState<Productor | null>(null);

  const [selectedProd, setSelectedProd] = useState<Productor | null>(null);
  const [modalType, setModalType] = useState<'aprobar' | 'rechazar' | 'suspender' | 'reactivar' | null>(null);
  const [notaInterna, setNotaInterna] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<Productor | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  // Reset NIP modal state
  const [resetNipTarget, setResetNipTarget] = useState<Productor | null>(null);
  const [resetNipLoading, setResetNipLoading] = useState(false);
  const [resetNipResult, setResetNipResult] = useState<{ pin: string; nombre: string } | null>(null);
  const [resetNipError, setResetNipError] = useState('');

  const [page, setPage] = useState(1);
  const limit = 50;

  function descargarExcel() {
    const headers = ['#','Nombre','Apellidos','CURP','Email','Teléfono','Tipo','Estatus','Estado (UP)','Municipio (UP)','Cultivo','Fecha registro'];
    const rows = productores.map((p, i) => [
      i + 1, p.nombre, p.apellidos, p.curp || '', p.email || '', p.telefono || '',
      p.tipo_productor === 'B' ? 'Tipo B (Silos/Báscula)' : 'Tipo A (Auto-declarado)',
      p.estado_validacion, p.up_estado || '', p.up_municipio || '', p.up_cultivo || 'Maíz Blanco',
      p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : '',
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Maiz_Productores_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function cargarProductores() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/admin/usuarios`, { headers: HDR() });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json();
      const prods = data.productores || data.usuarios || data;
      setProductores(prods.map((u: any) => ({
        id: u.id || u.producer_id,
        nombre: u.nombres || u.nombre || '',
        apellidos: [u.apellido_paterno, u.apellido_materno].filter(Boolean).join(' ') || u.apellidos || '',
        curp: u.curp || '',
        email: u.correo || u.email || '',
        telefono: u.telefono || '',
        rol: 'productor',
        estado_validacion: u.estado_validacion || 'pendiente',
        created_at: u.fecha_registro || u.created_at || new Date().toISOString(),
        tipo_productor: (u.tipo_registro || 'B') as 'A' | 'B',
        up_estado: u.estado_up || '',
        up_municipio: u.municipio_up || '',
        up_cultivo: 'Maíz Blanco',
      })));
    } catch (e) {
      console.error(e);
      setProductores([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarProductores();
    fetch(`${BASE}/admin/usuarios/estados-disponibles`, { headers: HDR() })
      .then(r => r.json())
      .then(d => setEstadosDisponibles(d.estados || []))
      .catch(() => setEstadosDisponibles(['Sinaloa','Jalisco','Guanajuato','Michoacán','Colima','Querétaro','Nayarit','Durango']));
  }, []);

  async function handleConfirmAction() {
    if (!selectedProd || !modalType) return;
    setActionError('');
    if (modalType === 'rechazar' && notaInterna.trim().length < 20) {
      setActionError('Debes ingresar un motivo detallado (mínimo 20 caracteres).');
      return;
    }
    let nuevoEstatus: 'activo' | 'rechazado' | 'suspendido' = 'activo';
    if (modalType === 'rechazar')  nuevoEstatus = 'rechazado';
    if (modalType === 'suspender') nuevoEstatus = 'suspendido';
    setActionLoading(true);
    try {
      await fetch(`${BASE}/admin/usuarios/${selectedProd.id}/estatus`, {
        method: 'PATCH',
        headers: { ...HDR(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado_validacion: nuevoEstatus, nota: notaInterna }),
      });
    } catch { /* continúa con cambio local */ } finally {
      setProductores(prev => prev.map(p => p.id === selectedProd.id ? { ...p, estado_validacion: nuevoEstatus } : p));
      setSelectedProd(null); setModalType(null); setNotaInterna(''); setActionLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteError('');
    setDeleteLoading(true);
    try {
      const r = await fetch(`${BASE}/admin/productores/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: HDR(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      setProductores(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteSuccess(`${deleteTarget.nombre} ${deleteTarget.apellidos} fue eliminado del padrón.`);
      setDeleteTarget(null);
      setTimeout(() => setDeleteSuccess(''), 4000);
    } catch (e: any) {
      setDeleteError(e.message || 'Error al eliminar el productor.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const filteredProductores = productores.filter(p => {
    if (tab === 'pendiente'  && p.estado_validacion !== 'pendiente')  return false;
    if (tab === 'suspendido' && p.estado_validacion !== 'suspendido') return false;
    if (tab === 'todos' && estatusFilter && p.estado_validacion !== estatusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(p.nombre + ' ' + p.apellidos).toLowerCase().includes(q) && !p.curp.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q)) return false;
    }
    if (estadoFilter && p.up_estado !== estadoFilter) return false;
    if (tipoFilter  && p.tipo_productor !== tipoFilter) return false;
    return true;
  });

  const totalItems = filteredProductores.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const paginatedList = filteredProductores.slice((page - 1) * limit, page * limit);
  const cntPendiente  = productores.filter(p => p.estado_validacion === 'pendiente').length;
  const cntSuspendido = productores.filter(p => p.estado_validacion === 'suspendido').length;
  const cntActivo     = productores.filter(p => p.estado_validacion === 'activo').length;

  const hayFiltrosActivos = search || estadoFilter || tipoFilter || (tab === 'todos' && estatusFilter);

  return (
    <div className="flex flex-col h-[calc(100vh-76px)] overflow-hidden gap-2">

      {/* Modal ver productor */}
      {verProductor && (
        <ModalVerProductor
          prod={verProductor}
          onClose={() => setVerProductor(null)}
          onAprobar={() => { setSelectedProd(verProductor); setModalType('aprobar'); }}
          onRechazar={() => { setSelectedProd(verProductor); setModalType('rechazar'); }}
          onSuspender={() => { setSelectedProd(verProductor); setModalType('suspender'); }}
          onReactivar={() => { setSelectedProd(verProductor); setModalType('reactivar'); }}
          onEliminar={() => { setDeleteTarget(verProductor); setDeleteError(''); }}
        />
      )}

      {/* Toast de éxito al eliminar */}
      {deleteSuccess && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 px-4 py-3 bg-gray-900 text-white text-[12.5px] font-semibold rounded-2xl shadow-2xl"
          style={{ animation: 'slideUpFade 0.3s ease' }}
        >
          <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center flex-shrink-0">
            <Check size={11} strokeWidth={3} className="text-gray-900" />
          </div>
          {deleteSuccess}
        </div>
      )}

      {/* ── Barra verde: tabs arriba / contadores abajo ── */}
      <div className="bg-[#eef8f2] flex-shrink-0 rounded-b-2xl border border-[#1A5C38]/30 border-t-0 overflow-hidden">
        {/* Fila 1: pestañas + acciones */}
        <div className="px-2 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {([
              { key: 'todos',      label: 'Padrón general', icon: Users, cnt: productores.length },
              { key: 'pendiente',  label: 'Pendientes',     icon: Clock, cnt: cntPendiente },
              { key: 'suspendido', label: 'Suspendidos',    icon: UserX, cnt: cntSuspendido },
            ] as const).map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150 whitespace-nowrap ${
                  tab === t.key ? 'bg-[#1A5C38] text-white shadow-sm' : 'text-[#1A5C38] hover:bg-[#d4efe1] hover:text-[#0e3d24]'
                }`}>
                <t.icon size={11} />
                {t.label}
                {t.cnt > 0 && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20 text-white' : 'bg-[#1A5C38]/10 text-[#1A5C38]'}`}>{t.cnt}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMostrarStats(!mostrarStats)}
              className={`p-1.5 rounded-lg transition-all duration-150 ${mostrarStats ? 'bg-[#1A5C38] text-white shadow-sm' : 'text-[#1A5C38] hover:bg-[#d4efe1]'}`}>
              <BarChart3 size={11} />
            </button>
            {puedeExportar && (
              <button onClick={descargarExcel} disabled={loading || productores.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#1A5C38] bg-[#d4efe1] hover:bg-[#1A5C38] hover:text-white text-[11px] font-bold border border-[#1A5C38]/20 hover:border-transparent transition disabled:opacity-40">
                <Download size={11} /> CSV
              </button>
            )}
            <button onClick={cargarProductores}
              className="p-1.5 rounded-lg text-[#1A5C38] bg-[#d4efe1] hover:bg-[#1A5C38] hover:text-white border border-[#1A5C38]/20 hover:border-transparent transition">
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Divisor */}
        <div className="border-t border-[#1A5C38]/15 mx-2" />

        {/* Fila 2: contadores */}
        <div className="px-3 py-1.5 flex items-center gap-3">
          {[
            { label: 'Total',       val: productores.length, color: 'text-[#1A5C38]',  dot: 'bg-[#1A5C38]' },
            { label: 'Activos',     val: cntActivo,          color: 'text-emerald-700', dot: 'bg-emerald-500' },
            { label: 'Pendientes',  val: cntPendiente,       color: 'text-amber-700',   dot: 'bg-amber-400' },
            { label: 'Suspendidos', val: cntSuspendido,      color: 'text-gray-500',    dot: 'bg-gray-400' },
          ].map(({ label, val, color, dot }, i) => (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="w-px h-3 bg-[#1A5C38]/15" />}
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <span className={`text-[12px] font-black ${color}`}>{loading ? '—' : val}</span>
                <span className="text-[9.5px] text-[#1A5C38]/50 font-medium">{label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabla principal ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">

        {/* Stats row (colapsable) */}
        {mostrarStats && (() => {
          const conCurp = productores.filter(p => p.curp && p.curp.length >= 11);
          const hombres = conCurp.filter(p => calcularGeneroDesadeCurp(p.curp) === 'H').length;
          const mujeres = conCurp.filter(p => calcularGeneroDesadeCurp(p.curp) === 'M').length;
          const edades = conCurp.map(p => calcularEdadDesdeCurp(p.curp)).filter((e): e is number => e !== null);
          const edadPromedio = edades.length > 0 ? Math.round(edades.reduce((s, e) => s + e, 0) / edades.length) : 0;
          const mayores60 = edades.filter(e => e >= 60).length;
          return (
            <div className="grid grid-cols-4 border-b border-[#1A5C38]/10 bg-[#eef8f2]/40 flex-shrink-0">
              {[
                { label: 'Hombres',       val: hombres,          sub: 'productores' },
                { label: 'Mujeres',       val: mujeres,          sub: 'productoras' },
                { label: 'Edad promedio', val: `${edadPromedio}`, sub: `años (${edades.length} con CURP)` },
                { label: 'Mayores de 60', val: mayores60,        sub: 'adultos mayores' },
              ].map(({ label, val, sub }) => (
                <div key={label} className="px-4 py-2.5 border-r border-[#1A5C38]/10 last:border-0">
                  <p className="text-[9px] font-bold text-[#1A5C38]/50 uppercase tracking-wide">{label}</p>
                  <p className="text-[18px] font-black text-gray-900 leading-tight">{val}</p>
                  <p className="text-[9.5px] text-gray-400">{sub}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Filtros */}
        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Buscar nombre, CURP o correo..."
                value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#1A5C38]/40 focus:bg-white transition" />
            </div>
            <button onClick={() => setMostrarFiltros(!mostrarFiltros)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${hayFiltrosActivos ? 'bg-[#1A5C38] text-white border-transparent' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              <Filter size={11} /> Filtros {hayFiltrosActivos ? '•' : ''}
            </button>
            <span className="text-[10.5px] text-gray-400 font-medium ml-auto whitespace-nowrap">
              {totalItems} resultado{totalItems !== 1 ? 's' : ''}
            </span>
          </div>
          {mostrarFiltros && (
            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-100">
              <select value={estadoFilter} onChange={e => { setEstadoFilter(e.target.value); setPage(1); }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-[#1A5C38]/40 cursor-pointer transition min-w-[130px]">
                <option value="">Estado (todos)</option>
                {estadosDisponibles.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
              <select value={tipoFilter} onChange={e => { setTipoFilter(e.target.value); setPage(1); }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-[#1A5C38]/40 cursor-pointer transition">
                <option value="">Tipo A / B</option>
                <option value="A">Tipo A</option>
                <option value="B">Tipo B</option>
              </select>
              {tab === 'todos' && (
                <select value={estatusFilter} onChange={e => { setEstatusFilter(e.target.value); setPage(1); }}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-[#1A5C38]/40 cursor-pointer transition">
                  <option value="">Estatus (todos)</option>
                  <option value="activo">Activo</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="rechazado">Rechazado</option>
                  <option value="suspendido">Suspendido</option>
                </select>
              )}
              {hayFiltrosActivos && (
                <button onClick={() => { setSearch(''); setEstadoFilter(''); setTipoFilter(''); setEstatusFilter(''); setPage(1); }}
                  className="text-[11px] text-red-500 hover:text-red-700 font-bold px-2 transition">
                  Limpiar
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={20} className="text-[#1A5C38] animate-spin" />
            <p className="text-[12px] text-gray-400">Cargando productores...</p>
          </div>
        ) : paginatedList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <ShieldAlert size={28} className="text-gray-300" />
            <p className="text-[13px] font-bold text-gray-500">Sin resultados</p>
            <p className="text-[11px] text-gray-400">No hay productores que coincidan.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse" style={{ fontSize: '11.5px' }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50/90 border-b border-gray-100">
                  {['#', 'Productor', 'CURP', 'Ubicación UP', 'Tipo', 'Estatus', 'Acciones'].map(h => (
                    <th key={h} className="py-2 px-3 text-[9.5px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-4 last:pr-4 last:text-right">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedList.map((prod, idx) => {
                  const cfg = STATUS_CFG[prod.estado_validacion];
                  const rowNum = (page - 1) * limit + idx + 1;
                  return (
                    <tr key={prod.id} className="hover:bg-[#f9fdfb] transition-colors">
                      <td className="py-2 pl-4 pr-2 text-[10px] text-gray-300 font-mono w-8">{rowNum}</td>
                      <td className="py-2 px-3">
                        <p className="font-bold text-gray-800 leading-tight whitespace-nowrap">{prod.nombre} {prod.apellidos}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 whitespace-nowrap">{prod.email || '—'}</p>
                      </td>
                      <td className="py-2 px-3 font-mono text-[10.5px] text-gray-500 whitespace-nowrap">
                        {prod.curp || <span className="text-gray-300 italic">Sin CURP</span>}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {prod.up_estado || prod.up_municipio ? (
                          <>
                            <p className="font-semibold text-gray-700 text-[11px]">{prod.up_municipio || '—'}</p>
                            <p className="text-[10px] text-gray-400">{prod.up_estado || ''}</p>
                          </>
                        ) : <span className="text-gray-300 text-[10px] italic">Sin ubicación</span>}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`text-[9.5px] font-black px-2 py-0.5 rounded-full border ${prod.tipo_productor === 'B' ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                          Tipo {prod.tipo_productor}
                        </span>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                      </td>
                      <td className="py-2 px-3 pr-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          {puedeVerDetalle && (
                            <button
                              onClick={() => setVerProductor(prod)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#eef8f2] text-[#1A5C38] hover:bg-[#1A5C38] hover:text-white text-[10px] font-bold border border-[#1A5C38]/20 hover:border-transparent transition"
                              title="Ver productor"
                            >
                              <Eye size={11} /> Ver
                            </button>
                          )}
                          {puedeEditar && prod.estado_validacion === 'pendiente' && (
                            <>
                              <button onClick={() => { setSelectedProd(prod); setModalType('aprobar'); }}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition" title="Aprobar">
                                <Check size={12} />
                              </button>
                              <button onClick={() => { setSelectedProd(prod); setModalType('rechazar'); }}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition" title="Rechazar">
                                <X size={12} />
                              </button>
                            </>
                          )}
                          {puedeEditar && prod.estado_validacion === 'activo' && (
                            <button onClick={() => { setSelectedProd(prod); setModalType('suspender'); }}
                              className="text-[9.5px] font-bold px-2 py-1 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-100 hover:border-red-200 transition">
                              Suspender
                            </button>
                          )}
                          {puedeEditar && prod.estado_validacion === 'suspendido' && (
                            <button onClick={() => { setSelectedProd(prod); setModalType('reactivar'); }}
                              className="text-[9.5px] font-bold px-2 py-1 rounded-lg text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 border border-gray-100 hover:border-emerald-200 transition">
                              Reactivar
                            </button>
                          )}
                          {/* Botón resetear NIP — dato sensible, requiere editar */}
                          {puedeEditar && (
                            <button
                              onClick={() => { setResetNipTarget(prod); setResetNipResult(null); setResetNipError(''); }}
                              className="text-[9.5px] font-bold px-2 py-1 rounded-lg text-gray-500 hover:text-purple-700 hover:bg-purple-50 border border-gray-100 hover:border-purple-200 transition"
                              title="Resetear NIP">
                              🔑 NIP
                            </button>
                          )}
                          {/* Botón eliminar */}
                          {puedeEliminar && (
                            <button
                              onClick={() => { setDeleteTarget(prod); setDeleteError(''); }}
                              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all duration-150"
                              title="Eliminar productor">
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

        {/* Paginación */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50 bg-gray-50/50 flex-shrink-0">
            <p className="text-[10.5px] text-gray-400">
              Pág. <strong className="text-gray-700">{page}</strong> / {totalPages} · {totalItems} productores
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 transition text-[10px] font-bold">«</button>
              <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 transition">
                <ChevronLeft size={12} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-6 h-6 rounded text-[10.5px] font-bold transition ${p === page ? 'bg-[#1A5C38] text-white' : 'text-gray-400 hover:bg-gray-100'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 transition">
                <ChevronRight size={12} />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20 transition text-[10px] font-bold">»</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal acción (aprobar/rechazar/suspender/reactivar) ── */}
      {selectedProd && modalType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl max-w-[400px] w-full shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${modalType === 'aprobar' || modalType === 'reactivar' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                {modalType === 'aprobar' || modalType === 'reactivar' ? <Check size={15} /> : <AlertTriangle size={15} />}
              </div>
              <h3 className="text-[14px] font-extrabold text-gray-900">
                {modalType === 'aprobar' && 'Aprobar productor'}
                {modalType === 'rechazar' && 'Rechazar productor'}
                {modalType === 'suspender' && 'Suspender productor'}
                {modalType === 'reactivar' && 'Reactivar productor'}
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12.5px] text-gray-600 leading-relaxed">
                {modalType === 'aprobar' && 'Se activará el acceso de '}
                {modalType === 'rechazar' && 'Se rechazará el registro de '}
                {modalType === 'suspender' && 'Se suspenderá temporalmente a '}
                {modalType === 'reactivar' && 'Se reactivará la cuenta de '}
                <strong className="text-gray-900">{selectedProd.nombre} {selectedProd.apellidos}</strong>.
              </p>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  {modalType === 'rechazar' ? 'Motivo (obligatorio, mín. 20 caracteres)' : 'Nota interna (opcional)'}
                </label>
                <textarea rows={3}
                  placeholder={modalType === 'rechazar' ? 'Describe el motivo del rechazo...' : 'Nota adicional...'}
                  value={notaInterna} onChange={e => setNotaInterna(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-[12px] text-gray-800 placeholder-gray-400 outline-none focus:border-[#1A5C38]/40 resize-none transition" />
              </div>
              {actionError && (
                <div className="flex items-start gap-2 text-[11.5px] text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /><p>{actionError}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => { setSelectedProd(null); setModalType(null); setNotaInterna(''); setActionError(''); }}
                className="px-3 py-2 rounded-xl text-[12px] font-bold text-gray-500 hover:bg-gray-100 transition" disabled={actionLoading}>
                Cancelar
              </button>
              <button onClick={handleConfirmAction} disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-[12px] font-bold text-white transition ${modalType === 'aprobar' || modalType === 'reactivar' ? 'bg-[#1A5C38] hover:bg-[#15482d]' : 'bg-red-600 hover:bg-red-700'}`}>
                {actionLoading ? 'Aplicando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal eliminar productor — Apple 2026 ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ animation: 'fadeInBackdrop 0.2s ease' }}
        >
          {/* Backdrop con blur */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[6px]"
            onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteError(''); } }}
          />

          {/* Sheet / Card */}
          <div
            className="relative bg-white/95 backdrop-blur-xl w-full sm:max-w-[380px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.28)]"
            style={{ animation: 'slideUpSheet 0.28s cubic-bezier(0.34,1.3,0.64,1)' }}
          >
            {/* Handle (solo mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-gray-300/80" />
            </div>

            {/* Ícono destructivo */}
            <div className="flex flex-col items-center pt-6 pb-2 px-6">
              <div className="w-16 h-16 rounded-[22px] bg-red-50 flex items-center justify-center mb-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]">
                <Trash2 size={28} className="text-red-500" strokeWidth={1.8} />
              </div>
              <h2 className="text-[18px] font-bold text-gray-900 text-center leading-tight">
                Eliminar productor
              </h2>
              <p className="mt-2 text-[13.5px] text-gray-500 text-center leading-relaxed px-2">
                Se eliminará permanentemente a{' '}
                <span className="font-semibold text-gray-800">
                  {deleteTarget.nombre} {deleteTarget.apellidos}
                </span>
                {deleteTarget.curp && (
                  <span className="block text-[11.5px] font-mono text-gray-400 mt-0.5">
                    {deleteTarget.curp}
                  </span>
                )}
              </p>
            </div>

            {/* Warning */}
            <div className="mx-5 mt-3 mb-1 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-red-600 leading-relaxed">
                Se eliminarán también todas sus parcelas, ciclos productivos y registros asociados.
                <strong className="block mt-0.5">Esta acción no se puede deshacer.</strong>
              </p>
            </div>

            {/* Error */}
            {deleteError && (
              <div className="mx-5 mt-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                <X size={12} className="text-red-500 flex-shrink-0" />
                <p className="text-[12px] text-red-600">{deleteError}</p>
              </div>
            )}

            {/* Botones estilo iOS */}
            <div className="px-5 pt-4 pb-6 space-y-2.5">
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-white transition-all duration-150 active:scale-[0.97]"
                style={{
                  background: deleteLoading
                    ? 'linear-gradient(135deg, #f87171, #ef4444)'
                    : 'linear-gradient(135deg, #ef4444, #dc2626)',
                  boxShadow: deleteLoading ? 'none' : '0 4px 14px rgba(239,68,68,0.35)',
                }}
              >
                {deleteLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3"/>
                      <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    Eliminando...
                  </span>
                ) : 'Eliminar definitivamente'}
              </button>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
                disabled={deleteLoading}
                className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-150 active:scale-[0.97] disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal resetear NIP — Apple 2026 ── */}
      {resetNipTarget && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6"
          style={{ animation: 'fadeInBackdrop .2s ease' }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[8px]"
            onClick={() => { if (!resetNipLoading) { setResetNipTarget(null); setResetNipResult(null); } }} />
          <div className="relative bg-white w-full max-w-sm rounded-[28px] shadow-[0_40px_100px_rgba(0,0,0,0.35)]"
            style={{ animation: 'slideUpSheet .28s cubic-bezier(0.34,1.25,0.64,1)' }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />

            <div className="px-5 pt-3 pb-2">
              <div className="flex items-center justify-center mb-3">
                <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-2xl">🔑</div>
              </div>
              <h2 className="text-[17px] font-bold text-slate-900 text-center">Resetear NIP</h2>
              <p className="text-[13px] text-slate-500 text-center mt-1 mb-3 leading-relaxed">
                Se generará un NIP temporal de 4 dígitos para <strong className="text-slate-700">{resetNipTarget.nombre} {resetNipTarget.apellidos}</strong>.
                El productor deberá cambiarlo al ingresar.
              </p>

              {resetNipError && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[12px]">{resetNipError}</div>
              )}

              {resetNipResult ? (
                <div className="mb-3 p-4 bg-purple-50 border border-purple-200 rounded-2xl text-center">
                  <p className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide mb-1">NIP temporal generado</p>
                  <p className="text-4xl font-black text-purple-800 tracking-[0.3em]">{resetNipResult.pin}</p>
                  <p className="text-[11px] text-purple-500 mt-2">Comparte este NIP con el productor.<br/>Caduca en el próximo inicio de sesión.</p>
                </div>
              ) : null}
            </div>

            <div className="px-5 pt-2 pb-6 space-y-2.5">
              {!resetNipResult ? (
                <>
                  <button
                    onClick={async () => {
                      setResetNipLoading(true); setResetNipError('');
                      try {
                        const res = await fetch(`${BASE}/admin/reset-nip/${resetNipTarget.id}`, {
                          method: 'POST', headers: { ...HDR(), 'Content-Type': 'application/json' }
                        });
                        const data = await res.json();
                        if (!res.ok) { setResetNipError(data.error || 'Error al resetear'); return; }
                        setResetNipResult({ pin: data.pin_temporal, nombre: data.nombre });
                      } catch { setResetNipError('Error de conexión'); }
                      finally { setResetNipLoading(false); }
                    }}
                    disabled={resetNipLoading}
                    className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {resetNipLoading ? 'Generando...' : 'Generar NIP temporal'}
                  </button>
                  <button
                    onClick={() => { setResetNipTarget(null); setResetNipError(''); }}
                    disabled={resetNipLoading}
                    className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setResetNipTarget(null); setResetNipResult(null); }}
                  className="w-full py-3.5 rounded-[16px] text-[15px] font-semibold text-white bg-[#1A5C38] hover:bg-[#15482d] active:scale-[0.97] transition-all"
                >
                  Listo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animaciones */}
      <style>{`
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUpSheet {
          from { opacity: 0; transform: translateY(40px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translate(-50%, 16px); }
          to   { opacity: 1; transform: translate(-50%, 0);    }
        }
      `}</style>
    </div>
  );
}
