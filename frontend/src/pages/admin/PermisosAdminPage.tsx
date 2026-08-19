import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck, Plus, Pencil, Trash2, X,
  Copy, Download, CheckCircle2, AlertTriangle,
  Loader2, RefreshCw, UserPlus,
  TriangleAlert, Sparkles, LayoutDashboard, Users, Warehouse,
  TrendingUp, Sprout, BarChart3, Leaf, Search, ChevronLeft, ChevronRight, Layers,
  Eye, EyeOff, KeyRound, MessageCircle,
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('simac_token')}`,
});

/* ─── Tipos ──────────────────────────────────────────────────────────── */
interface RolPanel { clave: string; etiqueta: string; permisos_totales: boolean; aplica_filtro_estado: boolean; vistas_default: Record<string, string[]> | null; }
interface UsuarioPanel { id: number; nombre_completo: string; email: string; rol: string; rol_etiqueta: string; activo: boolean; estado_asignado: string | null; debe_cambiar_pass: boolean; ultimo_login: string | null; created_at: string; permisos_totales: boolean; aplica_filtro_estado: boolean; }
interface Permiso { vista: string; sub_accion: string; habilitado: boolean; }
interface CredencialesNuevas { email: string; password_temporal: string; nombre_completo: string; rol: string; estado_asignado: string | null; }

const VISTAS_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  resumen:             { label: 'Resumen',           icon: <LayoutDashboard size={14} className="text-blue-500" /> },
  productores:         { label: 'Productores',       icon: <Users size={14} className="text-emerald-500" /> },
  parcelas:            { label: 'Parcelas',          icon: <Layers size={14} className="text-blue-600" /> },
  bodegas:             { label: 'Bodegas',           icon: <Warehouse size={14} className="text-amber-500" /> },
  alertas:             { label: 'Alertas',           icon: <AlertTriangle size={14} className="text-red-500" /> },
  precios:             { label: 'Precios',           icon: <TrendingUp size={14} className="text-violet-500" /> },
  produccion:          { label: 'Producción',        icon: <Sprout size={14} className="text-green-600" /> },
  mercado:             { label: 'Mercado',           icon: <BarChart3 size={14} className="text-cyan-500" /> },
  senasica:            { label: 'SENASICA',          icon: <Leaf size={14} className="text-lime-600" /> },
  'avisos-privacidad': { label: 'Avisos Privacidad', icon: <ShieldCheck size={14} className="text-slate-500" /> },
  chats_ayuda:         { label: 'Chats de Ayuda',     icon: <MessageCircle size={14} className="text-teal-500" /> },
};

const ACCION_LABELS: Record<string, string> = {
  ver: 'Ver', ver_detalle: 'Ver detalle', crear: 'Crear', editar: 'Editar', eliminar: 'Eliminar', exportar: 'Exportar', responder: 'Responder',
};

const VISTAS_ACCIONES: Record<string, string[]> = {
  resumen:             ['ver'],
  productores:         ['ver', 'ver_detalle', 'editar', 'eliminar', 'exportar'],
  parcelas:            ['ver', 'eliminar'],
  bodegas:             ['ver', 'ver_detalle', 'crear', 'editar', 'eliminar', 'exportar'],
  alertas:             ['ver', 'crear', 'eliminar'],
  precios:             ['ver', 'editar'],
  produccion:          ['ver', 'editar', 'exportar'],
  mercado:             ['ver', 'exportar'],
  senasica:            ['ver', 'crear', 'eliminar'],
  'avisos-privacidad': ['ver', 'exportar'],
  chats_ayuda:         ['ver', 'responder'],
};

const ESTADOS_MX = [
  'Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua',
  'Ciudad de México','Coahuila de Zaragoza','Colima','Durango','Guanajuato','Guerrero',
  'Hidalgo','Jalisco','México','Michoacán de Ocampo','Morelos','Nayarit','Nuevo León',
  'Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora',
  'Tabasco','Tamaulipas','Tlaxcala','Veracruz de Ignacio de la Llave','Yucatán','Zacatecas',
];

/* ─── Toggle switch iOS-style ────────────────────────────────────────── */
function Toggle({ on, onChange, disabled = false, size = 'md' }: {
  on: boolean; onChange: () => void; disabled?: boolean; size?: 'sm' | 'md';
}) {
  const dims = size === 'sm'
    ? { w: 34, h: 20, thumb: 14, pad: 3 }
    : { w: 44, h: 26, thumb: 20, pad: 3 };
  const travel = dims.w - dims.thumb - dims.pad * 2;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      disabled={disabled}
      style={{ width: dims.w, height: dims.h, padding: dims.pad }}
      className={`relative shrink-0 rounded-full inline-flex items-center transition-colors duration-300 ease-[cubic-bezier(.4,0,.2,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0e5c33]/60
        ${on
          ? 'bg-[#0e5c33] shadow-[0_2px_10px_rgba(14,92,51,0.40)]'
          : 'bg-gray-200'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
    >
      <span
        style={{
          width: dims.thumb,
          height: dims.thumb,
          transform: `translateX(${on ? travel : 0}px)`,
        }}
        className="bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]"
      />
    </button>
  );
}

/* ─── Input / Select base ────────────────────────────────────────────── */
const iCls = 'w-full bg-gray-50/80 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#0e5c33]/50 focus:ring-2 focus:ring-[#0e5c33]/10 transition-all duration-200';
const lCls = 'text-[9px] font-black text-gray-400 uppercase tracking-[0.1em] mb-1 block';

/* ─── Password Input ─────────────────────────────────────────────────────── */
function PasswordInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className={lCls}>{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={iCls + ' pr-9'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  );
}

/* ─── Multi-selector de estados ──────────────────────────────────────── */
function EstadoMultiSelect({ value, onChange }: {
  value: string;            // "" = todos, "GUANAJUATO" o "GUANAJUATO,JALISCO"
  onChange: (v: string) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  const todos = selected.length === 0;
  const filtrados = ESTADOS_MX.filter(e => e.toLowerCase().includes(busqueda.trim().toLowerCase()));

  function toggleEstado(e: string) {
    if (selected.includes(e)) onChange(selected.filter(s => s !== e).join(','));
    else onChange([...selected, e].join(','));
  }

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      {/* Chips seleccionados */}
      {!todos && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pt-3 pb-2 border-b border-gray-100">
          {selected.map(e => (
            <button key={e} type="button" onClick={() => toggleEstado(e)}
              className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-[#0e5c33] text-white text-[10.5px] font-bold transition-all hover:bg-[#0a4227] active:scale-95">
              {e}
              <X size={10} className="opacity-70" />
            </button>
          ))}
        </div>
      )}

      {/* Fila "Todos" */}
      <button type="button" onClick={() => onChange('')}
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-bold transition-all border-b border-gray-100
          ${todos ? 'bg-emerald-50 text-[#0e5c33]' : 'text-gray-500 hover:bg-gray-50'}`}>
        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${todos ? 'border-[#0e5c33] bg-[#0e5c33]' : 'border-gray-300'}`}>
          {todos && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
        </span>
        Todos los estados (sin filtro)
      </button>

      {/* Buscador */}
      <div className="px-3 pt-2.5 pb-2">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar estado…"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[12px] text-gray-700 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#0e5c33]/40 transition-all"
        />
      </div>

      {/* Lista — una columna, sin corte de texto */}
      <div className="max-h-44 overflow-y-auto px-1.5 pb-2 flex flex-col gap-0.5">
        {filtrados.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-3">Sin coincidencias</p>
        ) : filtrados.map(e => {
          const checked = selected.includes(e);
          return (
            <button key={e} type="button" onClick={() => toggleEstado(e)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[11.5px] font-semibold text-left transition-all whitespace-nowrap
                ${checked ? 'bg-emerald-50 text-emerald-800' : 'text-gray-600 hover:bg-gray-50'}`}>
              <span className={`w-3.5 h-3.5 rounded border-2 shrink-0 flex items-center justify-center ${checked ? 'border-[#0e5c33] bg-[#0e5c33]' : 'border-gray-300'}`}>
                {checked && <span className="w-1.5 h-1.5 rounded-sm bg-white" />}
              </span>
              <span className="truncate">{e}</span>
            </button>
          );
        })}
      </div>

      {!todos && (
        <div className="border-t border-gray-100 px-3.5 py-1.5 bg-gray-50">
          <p className="text-[10px] text-gray-500 font-semibold">{selected.length} estado{selected.length !== 1 ? 's' : ''} seleccionado{selected.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Avatar ─────────────────────────────────────────────────────────── */
function Avatar({ nombre, size = 32, rol }: { nombre: string; size?: number; rol?: string }) {
  const ini = nombre.split(' ').slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();
  const bg  = rol === 'admin' ? 'from-[#0e5c33] to-[#1a7a44]'
             : rol === 'oref'  ? 'from-violet-500 to-violet-700'
             : 'from-emerald-400 to-emerald-600';
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`rounded-[${Math.round(size * 0.28)}px] bg-gradient-to-br ${bg} flex items-center justify-center text-white font-black shrink-0 shadow-sm`}>
      {ini}
    </div>
  );
}

/* ─── Rol chip ───────────────────────────────────────────────────────── */
function RolChip({ rol, etiqueta }: { rol: string; etiqueta: string }) {
  const cls = rol === 'admin'   ? 'bg-[#0e5c33] text-white'
            : rol === 'oref'    ? 'bg-violet-100 text-violet-700'
            : 'bg-emerald-100 text-emerald-800';
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${cls}`}>{etiqueta}</span>;
}

/* ─── MODAL BASE ─────────────────────────────────────────────────────── */
const SPRING = 'cubic-bezier(0.32,1.6,0.56,1)';

function ModalOverlay({ open, onClose, children, maxW = 'max-w-lg', noPad = false }: {
  open: boolean; onClose: () => void; children: React.ReactNode; maxW?: string; noPad?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-950/55 backdrop-blur-[18px]"
        style={{ animation: `fadein 180ms ease both` }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div ref={ref}
        className={`relative w-full ${maxW} bg-white rounded-[24px] sm:rounded-[28px] shadow-[0_32px_72px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.06)] flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden`}
        style={{ animation: `modalIn 220ms ${SPRING} both` }}>
        {!noPad && children}
        {noPad && children}
      </div>
      <style>{`
        @keyframes fadein{from{opacity:0}to{opacity:1}}
        @keyframes modalIn{from{opacity:0;transform:scale(.93) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}
      `}</style>
    </div>,
    document.body
  );
}

/* ─── ÁRBOL DE PERMISOS ──────────────────────────────────────────────── */
function ArbolPermisos({ permisos, onChange, disabled = false }: {
  permisos: Permiso[]; onChange: (p: Permiso[]) => void; disabled?: boolean;
}) {
  const getH = (v: string, a: string) => permisos.find(p => p.vista === v && p.sub_accion === a)?.habilitado ?? false;
  const vistaOn = (v: string) => getH(v, 'ver');

  function toggleVista(v: string) {
    const acciones = VISTAS_ACCIONES[v] ?? [];
    const on = vistaOn(v);
    const next = permisos.filter(p => p.vista !== v);
    // Al activar la vista, solo "ver" se enciende — los sub-permisos quedan
    // apagados hasta que el administrador los active manualmente.
    // Al desactivar la vista, todo se apaga.
    acciones.forEach(a => next.push({ vista: v, sub_accion: a, habilitado: a === 'ver' ? !on : false }));
    onChange(next);
  }

  function toggleAccion(v: string, a: string) {
    const on = getH(v, a);
    const next = permisos.filter(p => !(p.vista === v && p.sub_accion === a));
    next.push({ vista: v, sub_accion: a, habilitado: !on });
    onChange(next);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {Object.entries(VISTAS_LABELS).map(([vista, { label, icon }]) => {
        const acciones = VISTAS_ACCIONES[vista] ?? [];
        const on = vistaOn(vista);
        const subAcciones = acciones.filter(a => a !== 'ver');

        return (
          <div key={vista}
            className={`rounded-xl border transition-all duration-200 overflow-hidden
              ${on
                ? 'border-[#0e5c33]/20 bg-emerald-50/50'
                : 'border-gray-200/80 bg-gray-50/50'}`}>

            {/* Fila principal */}
            <div className="flex items-center gap-2 px-3 py-2">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                ${on ? 'bg-[#0e5c33]/10' : 'bg-gray-100'}`}>
                <span className={`transition-all duration-200 scale-[0.85] ${on ? 'opacity-100' : 'opacity-40'}`}>{icon}</span>
              </div>
              <span className={`text-[11.5px] font-bold flex-1 truncate transition-colors duration-200 ${on ? 'text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
              <Toggle on={on} onChange={() => !disabled && toggleVista(vista)} disabled={disabled} size="sm" />
            </div>

            {/* Sub-acciones: chips horizontales, apagadas por defecto */}
            {on && subAcciones.length > 0 && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {subAcciones.map(accion => {
                  const activa = getH(vista, accion);
                  return (
                    <button
                      key={accion}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleAccion(vista, accion)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all duration-200 active:scale-95
                        ${activa
                          ? 'bg-[#0e5c33] border-[#0e5c33] text-white shadow-[0_1px_5px_rgba(14,92,51,0.28)]'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className={`w-1 h-1 rounded-full shrink-0 ${activa ? 'bg-white/80' : 'bg-gray-300'}`} />
                      {ACCION_LABELS[accion] ?? accion}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── MODAL CREDENCIALES ─────────────────────────────────────────────── */
function ModalCredenciales({ creds, onClose }: { creds: CredencialesNuevas; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    const t = `Nombre: ${creds.nombre_completo}\nEmail: ${creds.email}\nContraseña temporal: ${creds.password_temporal}\nRol: ${creds.rol}${creds.estado_asignado ? `\nEstado: ${creds.estado_asignado}` : ''}`;
    navigator.clipboard.writeText(t);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  }

  function csv() {
    const blob = new Blob([`nombre_completo,email,password_temporal,rol,estado_asignado\n"${creds.nombre_completo}","${creds.email}","${creds.password_temporal}","${creds.rol}","${creds.estado_asignado ?? ''}"`], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `credenciales_SIMAC_${Date.now()}.csv` });
    a.click();
  }

  return (
    <ModalOverlay open onClose={onClose} maxW="max-w-sm" noPad>
      {/* Top strip */}
      <div className="bg-gradient-to-br from-[#0e5c33] to-[#1a7a44] px-5 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5">
        <div className="flex items-start justify-between mb-3.5 sm:mb-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/20 flex items-center justify-center">
            <Sparkles size={17} className="text-white" />
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-all">
            <X size={13} className="text-white/80" />
          </button>
        </div>
        <p className="text-white text-[14px] sm:text-[15px] font-black leading-tight">Usuario creado</p>
        <p className="text-white/60 text-[11px] sm:text-[11.5px] mt-0.5">Guarda estas credenciales ahora</p>
      </div>

      <div className="px-4 sm:px-5 py-4 sm:py-5 flex flex-col gap-3.5">
        {/* Warning */}
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-3">
          <TriangleAlert size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 text-[11.5px] leading-relaxed">La contraseña temporal <strong>solo aparece una vez</strong>. El usuario debe cambiarla en su primer acceso.</p>
        </div>

        {/* Credentials card */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2 font-mono text-[12px]">
          {[
            ['Nombre',       creds.nombre_completo, 'text-gray-800'],
            ['Email',        creds.email,            'text-gray-800'],
            ['Contraseña',   creds.password_temporal,'text-[#0e5c33] font-black tracking-wider'],
            ['Rol',          creds.rol,              'text-gray-800'],
            ...(creds.estado_asignado ? [['Estado', creds.estado_asignado, 'text-gray-800']] : []),
          ].map(([k, v, cls]) => (
            <div key={k} className="flex gap-2">
              <span className="text-gray-400 min-w-[80px] shrink-0">{k}</span>
              <span className={cls}>{v}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button onClick={copiar}
            className={`flex-1 flex items-center justify-center gap-1.5 text-[12px] font-bold py-2.5 rounded-2xl border transition-all active:scale-95 ${
              copiado ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
            }`}>
            <CheckCircle2 size={13} className={copiado ? '' : 'hidden'} />
            <Copy size={13} className={copiado ? 'hidden' : ''} />
            {copiado ? 'Copiado' : 'Copiar'}
          </button>
          <button onClick={csv}
            className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-bold py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-[#0e5c33] hover:bg-emerald-100 transition-all active:scale-95">
            <Download size={13} /> CSV
          </button>
        </div>

        <button onClick={onClose}
          className="w-full bg-[#0e5c33] hover:bg-[#0a3d22] active:scale-[0.98] text-white text-[13px] font-bold py-3 rounded-2xl transition-all shadow-sm hover:shadow-md">
          Entendido
        </button>
      </div>
    </ModalOverlay>
  );
}

/* ─── PÁGINA PRINCIPAL ───────────────────────────────────────────────── */
export default function PermisosAdminPage() {
  const [usuarios,  setUsuarios]  = useState<UsuarioPanel[]>([]);
  const [roles,     setRoles]     = useState<RolPanel[]>([]);
  const [loading,   setLoading]   = useState(true);

  /* Crear */
  const [modalCrear, setModalCrear] = useState(false);
  const [fCrear,  setFCrear]  = useState({ nombre_completo: '', email: '', rol: 'user', estado_asignado: '', password: '', password2: '' });
  const [pCrear,  setPCrear]  = useState<Permiso[]>([]);
  const [creando, setCreando] = useState(false);
  const [errCrear, setErrCrear] = useState('');
  const [creds,   setCreds]   = useState<CredencialesNuevas | null>(null);

  /* Editar */
  const [modalEditar, setModalEditar]   = useState(false);
  const [usuEdit,     setUsuEdit]       = useState<UsuarioPanel | null>(null);
  const [fEditar,  setFEditar]  = useState({ nombre_completo: '', email: '', rol: 'user', estado_asignado: '', nueva_password: '', nueva_password2: '' });
  const [pEditar,  setPEditar]  = useState<Permiso[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errEdit,  setErrEdit]  = useState('');
  const [savedOk,  setSavedOk]  = useState(false);

  /* Eliminar */
  const [modalDel, setModalDel]   = useState(false);
  const [usuDel,   setUsuDel]     = useState<UsuarioPanel | null>(null);
  const [deleting, setDeleting]   = useState(false);

  /* Búsqueda / filtro / paginación */
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const porPagina = 10;

  const rolDe = (clave: string) => roles.find(r => r.clave === clave);

  const conteoRoles = useMemo(() => {
    const c: Record<string, number> = {};
    usuarios.forEach(u => { c[u.rol] = (c[u.rol] ?? 0) + 1; });
    return c;
  }, [usuarios]);

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter(u => {
      const coincideTexto = !q || u.nombre_completo.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const coincideRol = filtroRol === 'todos' || u.rol === filtroRol;
      return coincideTexto && coincideRol;
    });
  }, [usuarios, busqueda, filtroRol]);

  useEffect(() => { setPage(1); }, [busqueda, filtroRol]);

  const totalPaginas = Math.max(1, Math.ceil(usuariosFiltrados.length / porPagina));
  const paginaSegura = Math.min(page, totalPaginas);
  const usuariosPagina = usuariosFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rU, rR] = await Promise.all([
        fetch(`${BASE}/admin/permisos/usuarios`, { headers: HDR() }),
        fetch(`${BASE}/admin/permisos/roles`,    { headers: HDR() }),
      ]);
      const [dU, dR] = await Promise.all([rU.json(), rR.json()]);
      setUsuarios(dU.usuarios ?? []);
      setRoles(dR.roles ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  /* Al cambiar rol en crear: todos los permisos inician apagados —
     el administrador decide manualmente qué vistas y sub-acciones habilitar. */
  useEffect(() => {
    const r = rolDe(fCrear.rol);
    if (!r || r.permisos_totales) { setPCrear([]); return; }
    const def: Permiso[] = [];
    Object.entries(VISTAS_ACCIONES).forEach(([v, acciones]) => {
      acciones.forEach(a => def.push({ vista: v, sub_accion: a, habilitado: false }));
    });
    setPCrear(def);
  }, [fCrear.rol, roles]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Abrir editar */
  async function abrirEditar(u: UsuarioPanel) {
    setUsuEdit(u);
    setFEditar({ nombre_completo: u.nombre_completo, email: u.email, rol: u.rol, estado_asignado: u.estado_asignado ?? '', nueva_password: '', nueva_password2: '' });
    setErrEdit(''); setSavedOk(false);
    try {
      const r = await fetch(`${BASE}/admin/permisos/${u.id}`, { headers: HDR() });
      const d = await r.json();
      if (d.permisos_totales) { setPEditar([]); }
      else {
        const perms: Permiso[] = [];
        Object.entries(VISTAS_ACCIONES).forEach(([v, acciones]) => {
          acciones.forEach(a => {
            const ex = d.permisos?.find((p: Permiso) => p.vista === v && p.sub_accion === a);
            perms.push({ vista: v, sub_accion: a, habilitado: ex?.habilitado ?? false });
          });
        });
        setPEditar(perms);
      }
    } catch { setPEditar([]); }
    setModalEditar(true);
  }

  /* Crear usuario */
  async function crearUsuario() {
    setErrCrear('');
    if (!fCrear.nombre_completo.trim() || !fCrear.email.trim()) { setErrCrear('Nombre y email son obligatorios'); return; }
    // Si puso contraseña, validar que coincidan
    if (fCrear.password.trim()) {
      if (fCrear.password.length < 6) { setErrCrear('La contraseña debe tener al menos 6 caracteres'); return; }
      if (fCrear.password !== fCrear.password2) { setErrCrear('Las contraseñas no coinciden'); return; }
    }
    const r = rolDe(fCrear.rol);
    setCreando(true);
    try {
      const resp = await fetch(`${BASE}/admin/permisos/usuarios`, {
        method: 'POST', headers: HDR(),
        body: JSON.stringify({
          nombre_completo: fCrear.nombre_completo.trim(),
          email: fCrear.email.trim().toLowerCase(),
          rol: fCrear.rol,
          password: fCrear.password.trim() || undefined,
          estado_asignado: r?.aplica_filtro_estado ? (fCrear.estado_asignado || null) : null,
          permisos: r?.permisos_totales ? [] : pCrear,
        }),
      });
      const d = await resp.json();
      if (!resp.ok) { setErrCrear(d.error || 'Error al crear usuario'); return; }
      setModalCrear(false);
      setFCrear({ nombre_completo: '', email: '', rol: 'user', estado_asignado: '', password: '', password2: '' });
      setCreds({ email: d.usuario.email, password_temporal: d.password_temporal, nombre_completo: d.usuario.nombre_completo, rol: d.usuario.rol, estado_asignado: d.usuario.estado_asignado ?? null });
      cargar();
    } catch { setErrCrear('Error de conexión'); } finally { setCreando(false); }
  }

  /* Guardar editar */
  async function guardarEditar() {
    if (!usuEdit) return;
    if (fEditar.nueva_password.trim()) {
      if (fEditar.nueva_password.length < 6) { setErrEdit('La contraseña debe tener al menos 6 caracteres'); return; }
      if (fEditar.nueva_password !== fEditar.nueva_password2) { setErrEdit('Las contraseñas no coinciden'); return; }
    }
    setGuardando(true); setErrEdit(''); setSavedOk(false);
    try {
      await fetch(`${BASE}/admin/permisos/usuarios/${usuEdit.id}`, {
        method: 'PATCH', headers: HDR(),
        body: JSON.stringify({
          nombre_completo: fEditar.nombre_completo.trim(),
          email: fEditar.email.trim().toLowerCase(),
          rol: fEditar.rol,
          estado_asignado: rolDe(fEditar.rol)?.aplica_filtro_estado ? fEditar.estado_asignado : null,
          nueva_password: fEditar.nueva_password.trim() || undefined,
        }),
      });
      const r2 = rolDe(fEditar.rol);
      if (!r2?.permisos_totales) {
        await fetch(`${BASE}/admin/permisos/${usuEdit.id}`, {
          method: 'PATCH', headers: HDR(),
          body: JSON.stringify({ permisos: pEditar }),
        });
      }
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
      cargar();
    } catch { setErrEdit('Error al guardar'); } finally { setGuardando(false); }
  }

  /* Eliminar */
  async function eliminar() {
    if (!usuDel) return;
    setDeleting(true);
    try {
      await fetch(`${BASE}/admin/permisos/usuarios/${usuDel.id}`, { method: 'DELETE', headers: HDR() });
      setModalDel(false); setUsuDel(null); cargar();
    } catch { /* ignore */ } finally { setDeleting(false); }
  }

  /* ── RENDER ─────────────────────────────────────────────────────── */
  return (
    <div className="h-[calc(100vh-88px)] flex flex-col gap-2.5 pt-3 sm:pt-4 overflow-hidden">

      {/* ── Panel superior: header + contadores + buscador, todo en una tarjeta verde suave ── */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-50/30 border border-emerald-100 rounded-2xl p-3 sm:p-3.5 flex flex-col gap-2.5 shrink-0">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0e5c33]/10 flex items-center justify-center shrink-0">
              <ShieldCheck size={15} className="text-[#0e5c33]" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-black text-gray-900 leading-none">Permisos Administrativos</p>
              <p className="text-[10.5px] text-gray-500 mt-0.5">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} del panel</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={cargar} className="w-8 h-8 rounded-xl bg-white border border-emerald-100 hover:bg-emerald-50 flex items-center justify-center transition-all active:scale-95 shrink-0">
              <RefreshCw size={13} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => { setErrCrear(''); setModalCrear(true); }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#0e5c33] hover:bg-[#0a3d22] active:scale-[0.97] text-white text-[12px] font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm hover:shadow-md">
              <UserPlus size={13} /> Nuevo usuario
            </button>
          </div>
        </div>

        {/* Contadores por rol */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: 'todos',       label: 'Todos',              count: usuarios.length,               color: 'text-gray-700 bg-gray-100' },
            { key: 'admin',       label: 'Administradores',    count: conteoRoles['admin'] ?? 0,       color: 'text-[#0e5c33] bg-[#0e5c33]/10' },
            { key: 'responsable', label: 'Responsables',       count: conteoRoles['responsable'] ?? 0, color: 'text-blue-700 bg-blue-100' },
            { key: 'user',        label: 'Usuarios operativos',count: conteoRoles['user'] ?? 0,        color: 'text-violet-700 bg-violet-100' },
          ].map(({ key, label, count, color }) => (
            <button key={key} onClick={() => setFiltroRol(key)}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.97] ${
                filtroRol === key ? 'border-[#0e5c33]/40 ring-2 ring-[#0e5c33]/15 bg-white shadow-sm' : 'border-emerald-100/70 bg-white/70 hover:bg-white hover:border-emerald-200'
              }`}>
              <div className="min-w-0">
                <p className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wide truncate">{label}</p>
                <p className="text-[17px] font-black text-gray-900 leading-tight">{count}</p>
              </div>
              <span className={`text-[9px] font-black p-1 rounded-full shrink-0 ${color}`}><ShieldCheck size={11} /></span>
            </button>
          ))}
        </div>

        {/* Buscador + filtro de rol */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o email…"
              className="w-full bg-white border border-emerald-100/70 rounded-xl pl-8 pr-3 py-2 text-[12px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#0e5c33]/40 focus:ring-2 focus:ring-[#0e5c33]/10 transition-all"
            />
          </div>
          <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)}
            className="bg-white border border-emerald-100/70 rounded-xl px-3 py-2 text-[11.5px] font-semibold text-gray-700 focus:outline-none focus:border-[#0e5c33]/40 transition-all sm:w-48">
            <option value="todos">Todos los roles</option>
            <option value="admin">Administradores</option>
            <option value="responsable">Responsables</option>
            <option value="user">Usuarios operativos</option>
          </select>
        </div>
      </div>

      {/* ── Tabla: ocupa el resto del alto disponible, scroll solo interno ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2.5 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[13px]">Cargando usuarios…</span>
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
            <ShieldCheck size={36} className="mb-3 opacity-20" />
            <p className="text-[13.5px] font-bold">
              {usuarios.length === 0 ? 'Sin usuarios del panel' : 'Sin resultados para tu búsqueda'}
            </p>
            <p className="text-[12px] mt-1">
              {usuarios.length === 0 ? 'Crea el primero con el botón de arriba' : 'Prueba con otro nombre, email o filtro'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.08em] px-5 py-2.5">Usuario</th>
                    <th className="text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.08em] px-5 py-2.5">Rol</th>
                    <th className="hidden md:table-cell text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.08em] px-5 py-2.5">Estado</th>
                    <th className="hidden lg:table-cell text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.08em] px-5 py-2.5">Último acceso</th>
                    <th className="hidden sm:table-cell text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.08em] px-5 py-2.5">Cuenta</th>
                    <th className="text-left text-[10px] font-black text-gray-400 uppercase tracking-[0.08em] px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosPagina.map((u, i) => (
                    <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50/70 transition-colors ${i === usuariosPagina.length - 1 ? 'border-b-0' : ''}`}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar nombre={u.nombre_completo} size={34} rol={u.rol} />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-bold text-gray-900 leading-none truncate">{u.nombre_completo}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-2.5"><RolChip rol={u.rol} etiqueta={u.rol_etiqueta ?? u.rol} /></td>
                      <td className="hidden md:table-cell px-5 py-2.5">
                        {u.estado_asignado
                          ? <div className="flex flex-wrap gap-1">{u.estado_asignado.split(',').map((e: string) => <span key={e} className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">{e.trim()}</span>)}</div>
                          : <span className="text-[11px] text-gray-400">Nacional</span>}
                      </td>
                      <td className="hidden lg:table-cell px-5 py-2.5 text-[12px] text-gray-500">
                        {u.ultimo_login
                          ? new Date(u.ultimo_login).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                          : <span className="text-amber-500 font-semibold text-[11px]">Nunca</span>}
                      </td>
                      <td className="hidden sm:table-cell px-5 py-2.5">
                        {u.debe_cambiar_pass
                          ? <span className="text-[10.5px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pass pendiente</span>
                          : <span className="text-[10.5px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Activo</span>}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => abrirEditar(u)}
                            className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-emerald-50 hover:text-[#0e5c33] text-gray-500 flex items-center justify-center transition-all active:scale-90 group">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { setUsuDel(u); setModalDel(true); }}
                            className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 flex items-center justify-center transition-all active:scale-90">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-5 py-3 border-t border-gray-100 bg-gray-50/40">
              <p className="text-[11.5px] text-gray-500 order-2 sm:order-1">
                Mostrando <span className="font-bold text-gray-700">{(paginaSegura - 1) * porPagina + 1}–{Math.min(paginaSegura * porPagina, usuariosFiltrados.length)}</span> de <span className="font-bold text-gray-700">{usuariosFiltrados.length}</span>
              </p>
              <div className="flex items-center gap-1.5 order-1 sm:order-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={paginaSegura <= 1}
                  className="w-8 h-8 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all">
                  <ChevronLeft size={14} className="text-gray-500" />
                </button>
                <span className="text-[12px] font-bold text-gray-600 px-2 min-w-[70px] text-center">{paginaSegura} / {totalPaginas}</span>
                <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura >= totalPaginas}
                  className="w-8 h-8 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all">
                  <ChevronRight size={14} className="text-gray-500" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══ MODAL CREAR ════════════════════════════════════════════════ */}
      <ModalOverlay open={modalCrear} onClose={() => setModalCrear(false)} maxW="max-w-3xl" noPad>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0c4f2c] via-[#0e5c33] to-[#15753f] px-5 pt-5 pb-4 shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.06]" style={{backgroundImage:'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)'}} />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
                <UserPlus size={15} className="text-white" />
              </div>
              <div>
                <p className="text-white text-[13px] font-black tracking-tight">Nuevo usuario</p>
                <p className="text-white/55 text-[10.5px] mt-0.5 font-medium">Contraseña temporal generada automáticamente</p>
              </div>
            </div>
            <button onClick={() => setModalCrear(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all active:scale-90 mt-0.5">
              <X size={12} className="text-white/70" />
            </button>
          </div>
        </div>

        {/* Body — una sola columna, secciones apiladas */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-4 sm:px-5 py-4 flex flex-col gap-4">

            {/* Sección: datos del usuario */}
            <section className="flex flex-col gap-2.5">
              <p className={lCls}>Datos del usuario</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={lCls}>Nombre completo *</label>
                  <input className={iCls} placeholder="María García López"
                    value={fCrear.nombre_completo} onChange={e => setFCrear(p => ({ ...p, nombre_completo: e.target.value }))} />
                </div>
                <div>
                  <label className={lCls}>Email institucional *</label>
                  <input type="email" className={iCls} placeholder="m.garcia@simac.mx"
                    value={fCrear.email} onChange={e => setFCrear(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className={rolDe(fCrear.rol)?.aplica_filtro_estado ? '' : 'sm:col-span-2'}>
                  <label className={lCls}>Rol *</label>
                  <select className={iCls} value={fCrear.rol}
                    onChange={e => setFCrear(p => ({ ...p, rol: e.target.value, estado_asignado: '' }))}>
                    {roles.map(r => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Sección: contraseña */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <KeyRound size={11} className="text-gray-400" />
                <p className={lCls + ' mb-0'}>Contraseña <span className="text-gray-400 font-normal normal-case">— vacío = se genera automáticamente</span></p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <PasswordInput label="Contraseña" value={fCrear.password}
                  onChange={v => setFCrear(p => ({ ...p, password: v }))} placeholder="Mínimo 6 caracteres" />
                <PasswordInput label="Confirmar contraseña" value={fCrear.password2}
                  onChange={v => setFCrear(p => ({ ...p, password2: v }))} placeholder="Repetir contraseña" />
              </div>
              {!fCrear.password.trim() && (
                <p className="text-[10.5px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Se generará una contraseña temporal que el usuario deberá cambiar en su primer acceso.
                </p>
              )}
            </section>

            {/* Sección: estados (si aplica) */}
            {rolDe(fCrear.rol)?.aplica_filtro_estado && (
              <section className="flex flex-col gap-1.5">
                <p className={lCls}>Estados asignados <span className="text-gray-400 font-normal normal-case">— vacío = todos</span></p>
                <EstadoMultiSelect value={fCrear.estado_asignado}
                  onChange={v => setFCrear(p => ({ ...p, estado_asignado: v }))} />
              </section>
            )}

            {/* Sección: permisos */}
            <section className="flex flex-col gap-1.5">
              <p className={lCls}>Permisos por vista <span className="text-gray-400 font-normal normal-case">— sub-acciones inician apagadas</span></p>
              {!rolDe(fCrear.rol)?.permisos_totales ? (
                <ArbolPermisos permisos={pCrear} onChange={setPCrear} />
              ) : (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <ShieldCheck size={14} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-emerald-800">Acceso total</p>
                    <p className="text-[10.5px] text-emerald-600 mt-0.5">No requiere configurar permisos individuales.</p>
                  </div>
                </div>
              )}
            </section>

            {errCrear && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-600">{errCrear}</p>
              </div>
            )}
          </div>

          {/* Footer sticky */}
          <div className="border-t border-gray-100 px-4 sm:px-5 py-3 flex justify-end gap-2 shrink-0 bg-white/90 backdrop-blur-sm">
            <button onClick={() => setModalCrear(false)}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95">
              Cancelar
            </button>
            <button onClick={crearUsuario} disabled={creando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-[#0e5c33] hover:bg-[#0a4227] transition-all active:scale-95 shadow-sm hover:shadow-md disabled:opacity-50">
              {creando ? <><Loader2 size={12} className="animate-spin" />Creando…</> : <><Plus size={12} />Crear usuario</>}
            </button>
          </div>
        </div>
      </ModalOverlay>

      {/* ═══ MODAL EDITAR ═══════════════════════════════════════════════ */}
      <ModalOverlay open={modalEditar} onClose={() => setModalEditar(false)} maxW="max-w-3xl" noPad>
        {/* Header con avatar del usuario */}
        <div className="bg-gradient-to-r from-[#1a1f2e] via-[#1e2438] to-[#141824] px-5 pt-5 pb-4 shrink-0 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage:'radial-gradient(circle at 85% 40%, #4f9cf9 0%, transparent 55%)'}} />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              {usuEdit && <Avatar nombre={usuEdit.nombre_completo} size={38} rol={usuEdit.rol} />}
              <div>
                <p className="text-white text-[13px] font-black tracking-tight truncate max-w-[220px] sm:max-w-none">{usuEdit?.nombre_completo}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {usuEdit && <RolChip rol={usuEdit.rol} etiqueta={usuEdit.rol_etiqueta ?? usuEdit.rol} />}
                  <span className="text-white/40 text-[10px]">·</span>
                  <span className="text-white/45 text-[10px] font-medium">Cambios en tiempo real</span>
                </div>
              </div>
            </div>
            <button onClick={() => setModalEditar(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all active:scale-90 mt-0.5">
              <X size={12} className="text-white/70" />
            </button>
          </div>
        </div>

        {/* Body — una sola columna, secciones apiladas */}
        <div className="flex flex-col min-h-0 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-4 sm:px-5 py-4 flex flex-col gap-4">

            {/* Sección: datos del usuario */}
            <section className="flex flex-col gap-2.5">
              <p className={lCls}>Datos del usuario</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={lCls}>Nombre completo</label>
                  <input className={iCls} value={fEditar.nombre_completo}
                    onChange={e => setFEditar(p => ({ ...p, nombre_completo: e.target.value }))} />
                </div>
                <div>
                  <label className={lCls}>Email</label>
                  <input type="email" className={iCls} value={fEditar.email}
                    onChange={e => setFEditar(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className={rolDe(fEditar.rol)?.aplica_filtro_estado ? '' : 'sm:col-span-2'}>
                  <label className={lCls}>Rol</label>
                  <select className={iCls} value={fEditar.rol}
                    onChange={e => setFEditar(p => ({ ...p, rol: e.target.value }))}>
                    {roles.map(r => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}
                  </select>
                </div>
              </div>
            </section>

            {/* Sección: cambiar contraseña (editar) */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <KeyRound size={11} className="text-gray-400" />
                <p className={lCls + ' mb-0'}>Nueva contraseña <span className="text-gray-400 font-normal normal-case">— vacío = no cambiar</span></p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <PasswordInput label="Nueva contraseña" value={fEditar.nueva_password}
                  onChange={v => setFEditar(p => ({ ...p, nueva_password: v }))} placeholder="Dejar vacío para no cambiar" />
                <PasswordInput label="Confirmar contraseña" value={fEditar.nueva_password2}
                  onChange={v => setFEditar(p => ({ ...p, nueva_password2: v }))} placeholder="Repetir nueva contraseña" />
              </div>
            </section>

            {/* Sección: estados (si aplica) */}
            {rolDe(fEditar.rol)?.aplica_filtro_estado && (
              <section className="flex flex-col gap-1.5">
                <p className={lCls}>Estados asignados <span className="text-gray-400 font-normal normal-case">— vacío = todos</span></p>
                <EstadoMultiSelect value={fEditar.estado_asignado}
                  onChange={v => setFEditar(p => ({ ...p, estado_asignado: v }))} />
              </section>
            )}

            {/* Sección: permisos */}
            <section className="flex flex-col gap-1.5">
              <p className={lCls}>Permisos por vista</p>
              {!rolDe(fEditar.rol)?.permisos_totales ? (
                <ArbolPermisos permisos={pEditar} onChange={setPEditar} />
              ) : (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <ShieldCheck size={14} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-emerald-800">Acceso total</p>
                    <p className="text-[10.5px] text-emerald-600 mt-0.5">No requiere permisos individuales.</p>
                  </div>
                </div>
              )}
            </section>

            {/* Feedback */}
            {errEdit && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-600">{errEdit}</p>
              </div>
            )}
            {savedOk && (
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <p className="text-[11px] text-emerald-700 font-bold">Guardado ✓</p>
              </div>
            )}
          </div>

          {/* Footer sticky */}
          <div className="border-t border-gray-100 px-4 sm:px-5 py-3 flex justify-end gap-2 shrink-0 bg-white/90 backdrop-blur-sm">
            <button onClick={() => setModalEditar(false)}
              className="px-4 py-2 rounded-xl text-[12px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95">
              Cerrar
            </button>
            <button onClick={guardarEditar} disabled={guardando}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-[#1a1f2e] hover:bg-[#252c42] transition-all active:scale-95 shadow-sm hover:shadow-md disabled:opacity-50">
              {guardando
                ? <><Loader2 size={12} className="animate-spin" />Guardando…</>
                : <><CheckCircle2 size={12} />Guardar cambios</>}
            </button>
          </div>
        </div>
      </ModalOverlay>

      {/* ═══ MODAL ELIMINAR ═════════════════════════════════════════════ */}
      <ModalOverlay open={modalDel} onClose={() => setModalDel(false)} maxW="max-w-sm" noPad>
        {/* Header */}
        <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 pt-6 pb-5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.07]" style={{backgroundImage:'radial-gradient(circle at 70% 30%, white 0%, transparent 55%)'}} />
          <div className="relative flex items-start justify-between">
            <div className="w-11 h-11 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <Trash2 size={18} className="text-white" />
            </div>
            <button onClick={() => setModalDel(false)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center transition-all active:scale-90">
              <X size={14} className="text-white/70" />
            </button>
          </div>
          <p className="text-white text-[15px] font-black tracking-tight mt-4">Eliminar usuario</p>
          <p className="text-white/55 text-[11.5px] mt-0.5 font-medium">Esta acción no se puede deshacer</p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-3.5">
            {usuDel && <Avatar nombre={usuDel.nombre_completo} size={36} rol={usuDel.rol} />}
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-gray-900 truncate">{usuDel?.nombre_completo}</p>
              <p className="text-[11.5px] text-gray-500 truncate">{usuDel?.email}</p>
            </div>
          </div>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            Perderá acceso inmediato al panel y <strong className="text-gray-800">todos sus permisos serán eliminados</strong>.
          </p>
          <div className="flex gap-2.5">
            <button onClick={() => setModalDel(false)}
              className="flex-1 py-3 rounded-2xl text-[13px] font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all active:scale-95">
              Cancelar
            </button>
            <button onClick={eliminar} disabled={deleting}
              className="flex-1 py-3 rounded-2xl text-[13px] font-bold text-white bg-red-600 hover:bg-red-700 transition-all active:scale-95 shadow-sm hover:shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
              {deleting ? <><Loader2 size={13} className="animate-spin" />Eliminando…</> : <><Trash2 size={13} />Sí, eliminar</>}
            </button>
          </div>
        </div>
      </ModalOverlay>

      {/* Credenciales */}
      {creds && <ModalCredenciales creds={creds} onClose={() => setCreds(null)} />}
    </div>
  );
}
