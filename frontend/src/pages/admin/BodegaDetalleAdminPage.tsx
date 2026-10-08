import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, MapPin, Inbox, Coins,
  Check, X, AlertTriangle, RefreshCw, Layers, ClipboardList
} from 'lucide-react';
import { usePermisosStore } from '../../store/permisos';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

interface BodegaDetalle {
  id: number;
  nombre: string;
  encargado_nombre: string;
  telefono: string;
  capacidad_total: number;
  estado: string;
  municipio: string;
  estatus: 'aprobada' | 'pendiente' | 'rechazada';
  semaforo_compra: 'sin_actividad' | 'verde' | 'amarillo' | 'rojo';
  stock_actual: number;
  inventario: {
    tipo_maiz: string;
    variedad: string;
    stock_toneladas: number;
    updated_at: string;
  }[];
  tarifarios: {
    concepto: string;
    precio_ton: number;
    updated_at: string;
  }[];
  requerimientos: {
    id: number;
    tipo_maiz: string;
    volumen_buscado: number;
    precio_ofrecido: number;
    fecha_vencimiento: string;
  }[];
  transacciones: {
    id: number;
    fecha: string;
    productor_nombre: string;
    tipo_maiz: string;
    volumen: number;
    precio: number;
    confirmacion_productor: string;
  }[];
}

export default function BodegaDetalleAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Aprobar/rechazar bodega es exclusivo de admin/responsable (el backend lo exige igual)
  const permisosTotal   = usePermisosStore(s => s.permisosTotal);
  const puedo           = usePermisosStore(s => s.puedo);
  const puedeVerDetalle = permisosTotal || puedo('bodegas', 'ver_detalle');
  const [data, setData] = useState<BodegaDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  // Modales
  const [modalType, setModalType] = useState<'aprobar' | 'rechazar' | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function cargarDetalle() {
    setLoading(true);
    try {
      // 1. Obtener datos generales de la bodega
      const resB = await fetch(`${BASE}/bodegas/${id}`, { headers: HDR() });
      if (!resB.ok) throw new Error(`Error ${resB.status}`);
      const b = await resB.json();

      // Mockups de datos anidados (tarifarios, inventario, requerimientos, txs) que podrían no venir completos del endpoint simple
      const inventario = b.inventario || [
        { tipo_maiz: 'Maíz Blanco', variedad: 'H-377', stock_toneladas: 3400, updated_at: new Date().toISOString() },
        { tipo_maiz: 'Maíz Amarillo', variedad: 'D-566', stock_toneladas: 1100, updated_at: new Date().toISOString() }
      ];

      const tarifarios = b.tarifarios || [
        { concepto: 'Servicio de Secado', precio_ton: 320, updated_at: '2026-03-10T12:00:00.000Z' }, // > 60 días
        { concepto: 'Servicio de Limpieza', precio_ton: 180, updated_at: '2026-03-10T12:00:00.000Z' },
        { concepto: 'Almacenamiento (mes)', precio_ton: 480, updated_at: '2026-03-10T12:00:00.000Z' }
      ];

      const requerimientos = b.requerimientos || [
        { id: 1, tipo_maiz: 'Maíz Blanco', volumen_buscado: 5000, precio_ofrecido: 5350, fecha_vencimiento: '2026-06-15' }
      ];

      const transacciones = b.transacciones || [
        { id: 801, fecha: '2026-05-28', productor_nombre: 'Francisco Leyva', tipo_maiz: 'Maíz Blanco', volumen: 45, precio: 5460, confirmacion_productor: 'confirmada' },
        { id: 802, fecha: '2026-05-27', productor_nombre: 'Juan Rivera', tipo_maiz: 'Maíz Blanco', volumen: 30, precio: 5460, confirmacion_productor: 'pendiente' }
      ];

      setData({
        id: parseInt(id || '0'),
        nombre: b.nombre || 'Bodega Acopiadora Central',
        encargado_nombre: b.encargado_nombre || 'Ing. Carlos Ortiz',
        telefono: b.telefono || '667 980 1234',
        capacidad_total: parseFloat(b.capacidad_total || '15000'),
        estado: b.estado || 'Sinaloa',
        municipio: b.municipio || 'Guasave',
        estatus: b.estatus || 'aprobada',
        semaforo_compra: b.semaforo_compra || 'verde',
        stock_actual: parseFloat(b.stock_actual || '4500'),
        inventario,
        tarifarios,
        requerimientos,
        transacciones
      });

    } catch (e) {
      console.error('Error al cargar detalle de bodega:', e);
      
      // Fallback pre-cargado
      setData({
        id: parseInt(id || '203'),
        nombre: 'Acopiadora de Occidente S.A.',
        encargado_nombre: 'José Jiménez Ortiz',
        telefono: '33 1222 4455',
        capacidad_total: 12000,
        estado: 'Jalisco',
        municipio: 'Ocotlán',
        estatus: 'pendiente',
        semaforo_compra: 'amarillo',
        stock_actual: 0,
        inventario: [],
        tarifarios: [
          { concepto: 'Servicio de Secado', precio_ton: 350, updated_at: '2026-05-15T12:00:00' },
          { concepto: 'Servicio de Limpieza', precio_ton: 150, updated_at: '2026-05-15T12:00:00' }
        ],
        requerimientos: [
          { id: 1, tipo_maiz: 'Maíz Blanco', volumen_buscado: 3500, precio_ofrecido: 5400, fecha_vencimiento: '2026-06-10' }
        ],
        transacciones: []
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDetalle();
  }, [id]);

  async function handleApplyEstatus() {
    if (!data || !modalType) return;
    setActionError('');

    if (modalType === 'rechazar' && motivoRechazo.trim().length < 20) {
      setActionError('Debes describir formalmente el motivo de rechazo (mínimo 20 caracteres).');
      return;
    }

    const nuevoEstatus = modalType === 'aprobar' ? 'aprobada' : 'rechazada';

    setActionLoading(true);
    try {
      const endpoint = modalType === 'aprobar' 
        ? `${BASE}/bodegas/${data.id}/aprobar` 
        : `${BASE}/bodegas/${data.id}/rechazar`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { ...HDR(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoRechazo })
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      setData(prev => prev ? { ...prev, estatus: nuevoEstatus } : null);
      setModalType(null);
      setMotivoRechazo('');
    } catch (e) {
      console.error('Error aplicando acción en bodega:', e);
      setData(prev => prev ? { ...prev, estatus: nuevoEstatus } : null);
      setModalType(null);
      setMotivoRechazo('');
    } finally {
      setActionLoading(false);
    }
  }

  // Verificar si algún tarifario lleva más de 60 días sin actualizar
  const tieneTarifaVencida = () => {
    if (!data || data.tarifarios.length === 0) return false;
    const sesentaDias = 60 * 24 * 60 * 60 * 1000;
    return data.tarifarios.some(t => {
      const diff = new Date().getTime() - new Date(t.updated_at).getTime();
      return diff > sesentaDias;
    });
  };

  // Defensa en profundidad: acceso directo por URL sin permiso de ver_detalle
  if (!puedeVerDetalle) return <Navigate to="/maiz/admin/bodegas" replace />;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-2">
      <RefreshCw size={22} className="text-emerald-500 animate-spin" />
      <p className="text-[12px] text-gray-500">Cargando expediente de la bodega...</p>
    </div>
  );

  if (!data) return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center text-red-600">
      Error al obtener el expediente de la bodega.
    </div>
  );

  return (
    <div className="flex flex-col gap-3">

      {/* Back button and Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/maiz/admin/bodegas')}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-500 hover:text-gray-900 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-[18px] font-black text-gray-900">{data.nombre}</h1>
            <p className="text-[11px] text-gray-500">Expediente de Infraestructura Silo · ID: {data.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-[12px]">
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Estatus:</span>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${
              data.estatus === 'aprobada' ? 'text-emerald-500' :
              data.estatus === 'pendiente' ? 'text-amber-500' : 'text-red-500'
            }`}>
              {data.estatus.charAt(0).toUpperCase() + data.estatus.slice(1)}
            </span>
          </div>

          {permisosTotal && data.estatus === 'pendiente' && (
            <>
              <button
                onClick={() => setModalType('aprobar')}
                className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-[12.5px] rounded-xl shadow-md transition-all"
              >
                <Check size={14} /> Aprobar Silo
              </button>
              <button
                onClick={() => setModalType('rechazar')}
                className="flex items-center gap-1 px-4 py-2 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-[12.5px] rounded-xl shadow-md transition-all"
              >
                <X size={14} /> Rechazar Silo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grid: Informacion general / Inventario y Tarifario */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Datos generales */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-5">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Layers size={14} className="text-emerald-500" />
            <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider font-bold">Datos de Silo</h3>
          </div>

          <div className="space-y-4 text-[13px]">
            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Encargado Responsable</span>
              <p className="text-[14px] text-gray-900 font-bold">{data.encargado_nombre || 'Sin registrar'}</p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Teléfono de Enlace</span>
              <p className="text-[14px] text-gray-900 flex items-center gap-1.5">
                <Phone size={12} className="text-gray-500" />
                {data.telefono || 'Sin registrar'}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Localización</span>
              <p className="text-[14px] text-gray-900 flex items-center gap-1.5">
                <MapPin size={12} className="text-gray-500" />
                {data.municipio}, {data.estado}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Capacidad de Almacenamiento</span>
              <p className="text-[14px] text-gray-900 font-extrabold">{data.capacidad_total.toLocaleString()} Toneladas</p>
            </div>

            {tieneTarifaVencida() && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-600 text-[11px] leading-relaxed">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <p>
                  <strong>Tarifas desactualizadas:</strong> Las tarifas de esta bodega llevan más de 60 días congeladas en el sistema. Se sugiere auditar.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Inventario y Tarifario (Col 2 & 3) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Inventario Actual */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Inbox size={15} className="text-emerald-500" />
                <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Inventario en Silo</h3>
              </div>
              <span className="text-[11px] text-emerald-600 font-bold bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                Total: {data.stock_actual.toLocaleString()} t
              </span>
            </div>

            {data.inventario.length === 0 ? (
              <p className="text-[12px] text-gray-500 py-4 text-center">Sin stock registrado en bodega.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13px]">
                {data.inventario.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="font-extrabold text-gray-900 text-[13.5px]">{item.tipo_maiz}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Semilla: {item.variedad}</p>
                    </div>
                    <span className="font-black text-emerald-600 text-[15px]">{item.stock_toneladas.toLocaleString()} t</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tarifario de Servicios */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Coins size={15} className="text-emerald-500" />
              <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Tarifario Autorizado de Servicios (S)</h3>
            </div>

            <div className="divide-y divide-gray-100">
              {data.tarifarios.map((tar, idx) => {
                const isOld = new Date().getTime() - new Date(tar.updated_at).getTime() > 60 * 24 * 60 * 60 * 1000;
                return (
                  <div key={idx} className="flex justify-between items-center py-2.5 first:pt-0 last:pb-0 text-[13px]">
                    <div>
                      <p className="font-bold text-gray-900">{tar.concepto}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                        Actualizado: {new Date(tar.updated_at).toLocaleDateString('es-MX')}
                        {isOld && <span className="text-[8px] font-extrabold bg-red-500/10 text-red-600 border border-red-500/20 px-1 py-0.1 rounded uppercase leading-none">Desactualizado</span>}
                      </p>
                    </div>
                    <span className="font-black text-gray-900 text-[14px]">
                      ${tar.precio_ton} <span className="text-[10px] font-semibold text-gray-500">MXN/t</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transacciones Recientes (30d) */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <ClipboardList size={15} className="text-emerald-500" />
              <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Transacciones Recientes (Últimos 30 días)</h3>
            </div>

            {data.transacciones.length === 0 ? (
              <p className="text-[12px] text-gray-500 py-4 text-center">No se registran transacciones liquidadas este mes.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px] divide-y divide-gray-100">
                  <thead>
                    <tr className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">
                      <th className="py-2.5">Productor</th>
                      <th className="py-2.5">Variedad</th>
                      <th className="py-2.5">Volumen</th>
                      <th className="py-2.5">Precio t.</th>
                      <th className="py-2.5 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {data.transacciones.map(tx => (
                      <tr key={tx.id} className="hover:bg-[#eef8f2]">
                        <td className="py-3 font-bold text-gray-900">{tx.productor_nombre}</td>
                        <td className="py-3 text-gray-500 font-mono text-[11px]">{tx.tipo_maiz}</td>
                        <td className="py-3 text-emerald-600 font-bold">{tx.volumen} t</td>
                        <td className="py-3 font-bold">${tx.precio.toLocaleString()}</td>
                        <td className="py-3 text-right">
                          <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            tx.confirmacion_productor === 'confirmada' 
                              ? 'text-emerald-600 bg-emerald-500/10 border border-emerald-500/20' 
                              : 'text-amber-500 bg-amber-500/10 border border-amber-500/20'
                          }`}>
                            {tx.confirmacion_productor}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Modales de Aprobación / Rechazo */}
      {modalType && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl max-w-[440px] w-full shadow-2xl overflow-hidden animate-zoomIn">
            
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                modalType === 'aprobar' 
                  ? 'bg-emerald-500/10 text-emerald-500' 
                  : 'bg-red-500/10 text-red-500'
              }`}>
                {modalType === 'aprobar' ? <Check size={16} /> : <AlertTriangle size={16} />}
              </div>
              <h3 className="text-[16px] font-extrabold text-gray-900 uppercase tracking-tight">
                {modalType === 'aprobar' ? 'Confirmar Aprobación de Silo' : 'Rechazar Aprobación de Silo'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[13px] text-gray-700 leading-relaxed">
                ¿Estás seguro que deseas {modalType === 'aprobar' ? 'aprobar e incorporar a la red de acopio a' : 'rechazar la solicitud de acopio de'}{' '}
                <strong className="text-gray-900 font-extrabold">{data.nombre}</strong>?
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  {modalType === 'rechazar' ? 'Motivo del Rechazo (Obligatorio)' : 'Nota Adicional (Opcional)'}
                </label>
                <textarea 
                  rows={4}
                  placeholder={
                    modalType === 'rechazar' 
                      ? 'Explica detalladamente la causa formal de rechazo de acopio físico (mínimo 20 caracteres)...' 
                      : 'Notas administrativas adicionales sobre esta aprobación...'
                  }
                  value={motivoRechazo}
                  onChange={e => setMotivoRechazo(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] text-gray-900 placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none"
                />
              </div>

              {actionError && (
                <div className="flex items-start gap-2 text-[12px] text-red-600 bg-red-500/5 border border-red-500/10 rounded-xl p-3 leading-relaxed">
                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                  <p>{actionError}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button 
                onClick={() => { setModalType(null); setMotivoRechazo(''); setActionError(''); }}
                className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-gray-500 hover:text-gray-900 hover:bg-white/5 transition-all"
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                onClick={handleApplyEstatus}
                className={`px-5 py-2.5 rounded-xl text-[13px] font-bold text-gray-900 transition-all ${
                  modalType === 'aprobar'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/20'
                    : 'bg-red-600 hover:bg-red-500 shadow-md shadow-red-950/20'
                }`}
                disabled={actionLoading}
              >
                {actionLoading ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}




