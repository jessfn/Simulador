import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { 
  RefreshCw, Wheat, Store, Globe, DollarSign, 
  Clock, AlertTriangle, Activity, Download, Upload, ShieldCheck, Check
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

interface FiraCosto {
  id: number;
  estado: string;
  municipio?: string;
  ciclo: string;
  modalidad: string;
  costo_por_ton: number;
}

interface Discrepancia {
  id: number;
  tipo: string;
  prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  descripcion: string;
  creado_at: string;
}

interface Brecha {
  estado: string;
  po_real: number;
  brecha: number;
  nivel_criticidad: string;
  txns: number;
}

interface PreciosData {
  chicago_usd_bushel: number;
  chicago_usd_ton: number;
  chicago_mxn: number;
  tc_banxico: number;
  garantia_sader: number;
  costo_fira: number;
  actualizacion: string;
  fuente: string;
  error: boolean;
  costos_fira_detalle?: FiraCosto[];
}

export default function PreciosAdminPage() {
  const [refreshLoading, setRefreshLoading] = useState(false);

  // Datos principales — null hasta que el backend responda (no datos ficticios)
  const [preciosData, setPreciosData] = useState<PreciosData | null>(null);
  const [preciosError, setPreciosError] = useState<string | null>(null);

  const [preciosHoy, setPreciosHoy] = useState<{
    po: number;
    s: number;
    total_compra: number;
    precio_venta: number;
    pct_productor: number;
    pct_servicios: number;
  } | null>(null);

  const [series, setSeries] = useState<any[]>([]);
  const [bodegasHoy, setBodegasHoy] = useState<any[]>([]);
  const [discrepancias, setDiscrepancias] = useState<Discrepancia[]>([]);
  const [brechas, setBrechas] = useState<Brecha[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Modales
  const [showFiraModal, setShowFiraModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [firaLoading, setFiraLoading] = useState(false);
  const [firaResult, setFiraResult] = useState<any | null>(null);
  const [firaError, setFiraError] = useState('');

  const [resolvingDisc, setResolvingDisc] = useState<Discrepancia | null>(null);
  const [notaResolucion, setNotaResolucion] = useState('');
  const [resolveLoading, setResolveLoading] = useState(false);

  async function cargarTodo() {
    try {
      setPreciosError(null);
      // 1. Cargar referencias externas y costos FIRA
      const resRef = await fetch(`${BASE}/precios/referencias/externas`, { headers: HDR() });
      if (resRef.ok) {
        const ref = await resRef.json();
        setPreciosData(ref);
      } else {
        setPreciosError('No se pudieron cargar las referencias de precios');
      }

      // 2. Cargar mercado
      const resM = await fetch(`${BASE}/precios/mercado`, { headers: HDR() });
      if (resM.ok) {
        const m = await resM.json();
        setPreciosHoy({
          po: m.precio_origen_mxn ?? 0,
          s: m.servicios_bodega_mxn ?? 0,
          total_compra: m.precio_compra_mxn ?? 0,
          precio_venta: m.precio_venta_mxn ?? 0,
          pct_productor: m.pct_productor ?? 0,
          pct_servicios: m.pct_servicios ?? 0
        });
        if (m.series) {
          setSeries(m.series);
        }
      }

      // 3. Cargar bodegas con precio REAL publicado hoy (antes se fabricaba un
      // precio/hora/desviación con aritmética basada en el id cuando no
      // existía "precio_hoy" en /api/bodegas — que nunca existe ahí, así que
      // esta tabla mostraba 100% datos inventados siempre. Ahora se usan los
      // registros reales de la tabla `precios` (tipo_precio='bodega', fecha
      // de hoy) — si ninguna bodega publicó hoy, la tabla queda vacía en vez
      // de simular actividad que no ocurrió. Ver plan de rediseño (Fase 0,
      // punto 5, aplicado también aquí por ser el mismo problema).
      const hoyISO = new Date().toISOString().slice(0, 10);
      const [resBodegas, resPreciosHoy] = await Promise.all([
        fetch(`${BASE}/bodegas`, { headers: HDR() }),
        fetch(`${BASE}/precios?tipo_precio=bodega&fecha_inicio=${hoyISO}&fecha_fin=${hoyISO}`, { headers: HDR() }),
      ]);
      if (resBodegas.ok && resPreciosHoy.ok) {
        const bd = await resBodegas.json();
        const pr = await resPreciosHoy.json();
        const bodegasPorId = new Map((bd.bodegas || bd || []).map((b: any) => [b.id, b]));
        const preciosDelDia: any[] = pr.precios || [];
        const promedioHoy = preciosDelDia.length > 0
          ? preciosDelDia.reduce((sum, p) => sum + Number(p.precio), 0) / preciosDelDia.length
          : 0;
        const publicadas = preciosDelDia.map((p: any) => {
          const b: any = bodegasPorId.get(p.bodega_id) || {};
          const desviacion = promedioHoy > 0
            ? Math.round(((Number(p.precio) - promedioHoy) / promedioHoy) * 1000) / 10
            : 0;
          return {
            nombre: b.nombre || 'Bodega',
            municipio: p.municipio || b.municipio,
            estado: p.estado || b.estado,
            precio: Number(p.precio),
            tipo_maiz: p.tipo_maiz || '—',
            desviacion,
          };
        });
        setBodegasHoy(publicadas.slice(0, 5));
      }

      // 4. Cargar discrepancias
      const resDisc = await fetch(`${BASE}/precios/discrepancias`, { headers: HDR() });
      if (resDisc.ok) {
        const dc = await resDisc.json();
        setDiscrepancias(dc.discrepancias || dc || []);
      }

      // 5. Cargar brechas
      const resBrechas = await fetch(`${BASE}/precios/brechas/estados`, { headers: HDR() });
      if (resBrechas.ok) {
        const br = await resBrechas.json();
        setBrechas(br.brechas || br || []);
      }

      // 6. Cargar logs
      try {
        const resLogs = await fetch(`${BASE}/precios/actualizaciones-log`, { headers: HDR() });
        if (resLogs.ok) {
          const lg = await resLogs.json();
          setLogs(lg.logs || lg || []);
        }
      } catch (_) {}

    } catch (e) {
      console.error('Error al cargar panel de precios:', e);
      // Sin datos ficticios: marcar error explícito para mostrar el estado de error.
      setPreciosError('No se pudo conectar con el servidor de precios. Revisa tu conexión e intenta de nuevo.');
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function handleRefreshManual() {
    setRefreshLoading(true);
    try {
      const res = await fetch(`${BASE}/precios/actualizar-externas`, {
        method: 'POST',
        headers: HDR()
      });
      if (res.ok) {
        await cargarTodo();
      }
    } catch (e) {
      console.error('Error al actualizar externamente:', e);
    } finally {
      setRefreshLoading(false);
    }
  }

  // Carga de archivo CSV FIRA
  async function handleUploadFira(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setFiraError('');
    setFiraLoading(true);
    setFiraResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const token = localStorage.getItem('simac_token');
      const res = await fetch(`${BASE}/precios/fira/upload-csv`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al subir el CSV');

      setFiraResult(json);
      await cargarTodo();
    } catch (err: any) {
      setFiraError(err.message || 'Error al conectar al servidor');
    } finally {
      setFiraLoading(false);
    }
  }

  // Resolver discrepancia
  async function handleResolveDiscrepancia() {
    if (!resolvingDisc) return;
    setResolveLoading(true);
    try {
      const res = await fetch(`${BASE}/precios/discrepancias/${resolvingDisc.id}/resolver`, {
        method: 'PUT',
        headers: {
          ...HDR(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resolucion: 'Ajuste administrativo',
          notas: notaResolucion
        })
      });
      if (res.ok) {
        setDiscrepancias(prev => prev.filter(d => d.id !== resolvingDisc.id));
        setResolvingDisc(null);
        setNotaResolucion('');
      }
    } catch (e) {
      console.error('Error al resolver discrepancia:', e);
    } finally {
      setResolveLoading(false);
    }
  }

  // Exportar CSV del lado del cliente
  function exportarPreciosHoy() {
    if (!preciosData || !preciosHoy) return;
    const headers = 'Fecha,Margen Negociacion,Lo Gana Productor,Servicios Bodega,Precio Compra,Precio Venta,Chicago CME USD/bu,TC Banxico\n';
    const row = `${new Date().toISOString().split('T')[0]},${preciosHoy.precio_venta},${preciosHoy.po},${preciosHoy.s},${preciosHoy.total_compra},${preciosHoy.precio_venta},${preciosData.chicago_usd_bushel},${preciosData.tc_banxico}\n`;
    
    const blob = new Blob([headers + row], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'precios_mercado_hoy.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function fmt(v: number | undefined | null) {
    if (v == null || isNaN(Number(v))) return '$0';
    return `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  // Mientras carga o si hay error — NO mostrar números ficticios
  if (!preciosData) {
    return (
      <div className="flex flex-col gap-3">
        {preciosError ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-bold text-[14px]">Error al cargar precios</p>
            <p className="text-red-600/70 text-[12px] mt-1">{preciosError}</p>
            <button 
              onClick={cargarTodo}
              className="mt-4 px-5 py-2.5 bg-[#1A5C38] hover:bg-[#1e6b42] text-white font-bold text-[12px] rounded-xl shadow-md transition-all duration-200"
            >
              <RefreshCw size={12} className="inline mr-1" /> Reintentar
            </button>
          </div>
        ) : (
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-white/5 rounded-2xl"></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="h-32 bg-white/5 rounded-2xl"></div>
              <div className="h-32 bg-white/5 rounded-2xl"></div>
              <div className="h-32 bg-white/5 rounded-2xl"></div>
            </div>
            <div className="h-64 bg-white/5 rounded-2xl"></div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── BARRA DE ESTADO SUPERIOR (ANCHO COMPLETO) ── */}
      <div className="bg-[#eef8f2] border border-[#1A5C38]/30 border-t-0 rounded-b-2xl px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="space-y-0.5">
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Futuros Chicago (CME ZC=F)</span>
            <p className="text-[14px] font-black text-gray-900 flex items-center gap-1">
              <Globe size={13} className="text-gray-500" />
              ${preciosData.chicago_usd_bushel.toFixed(2)} <span className="text-[10px] text-gray-500">USD/bu</span>
              <span className="text-[11px] text-gray-500 ml-1">(= ${preciosData.chicago_usd_ton.toFixed(1)} USD/t)</span>
            </p>
          </div>

          <div className="h-6 w-px bg-white/10 hidden md:block" />

          <div className="space-y-0.5">
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Dólar FIX (Banxico SF43718)</span>
            <p className="text-[14px] font-black text-gray-900 flex items-center gap-1">
              <DollarSign size={13} className="text-gray-500" />
              ${preciosData.tc_banxico.toFixed(4)} <span className="text-[10px] text-gray-500">MXN</span>
            </p>
          </div>

          <div className="h-6 w-px bg-white/10 hidden md:block" />

          <div className="space-y-0.5">
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block">Última Actualización</span>
            <p className="text-[12.5px] text-gray-500 flex items-center gap-1">
              <Clock size={12} />
              {new Date(preciosData.actualizacion).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={exportarPreciosHoy}
            className="flex items-center gap-1 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-gray-100 rounded-xl text-[12px] font-bold text-gray-500 hover:text-gray-900 transition-all duration-200"
          >
            <Download size={12} /> Descargar CSV
          </button>
          <button 
            onClick={handleRefreshManual}
            disabled={refreshLoading}
            className="flex items-center gap-1 px-3.5 py-2 bg-[#1A5C38] hover:bg-[#1e6b42] active:scale-95 text-white font-bold text-[12px] rounded-xl shadow-md transition-all duration-200 disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshLoading ? 'animate-spin' : ''} /> Actualizar CME & TC
          </button>
        </div>
      </div>

      {/* Grid: 60% Precios y Tendencias / 40% FIRA, Discrepancias y Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── COLUMNA IZQUIERDA (60%) ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Tres Precios */}
          {preciosHoy ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Margen */}
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/20 transition-all duration-300">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Margen Negociación</span>
                <p className="text-[26px] font-black text-gray-900 leading-none">{fmt(preciosHoy.precio_venta)}</p>
                <p className="text-[10px] text-gray-500">Referencia Internacional</p>
              </div>
              <p className="text-[10px] text-gray-500 mt-4 leading-normal">Bolsa Chicago CME convertido + Bono $50 USD</p>
            </div>

            {/* Compra */}
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/20 transition-all duration-300">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Precio de Compra</span>
                <p className="text-[26px] font-black text-gray-900 leading-none">{fmt(preciosHoy.total_compra)}</p>
                <p className="text-[10px] text-gray-500">Promedio Bodega (PO + S)</p>
              </div>
              <p className="text-[10px] text-gray-500 mt-4 leading-normal">
                Ingreso Productor ({preciosHoy.pct_productor}%) + Servicios Bodega ({preciosHoy.pct_servicios}%)
              </p>
            </div>

            {/* Venta */}
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/20 transition-all duration-300">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">Precio de Venta</span>
                <p className={`text-[26px] font-black leading-none ${preciosHoy.precio_venta < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {fmt(preciosHoy.precio_venta)}
                </p>
                <p className="text-[10px] text-gray-500">Diferencial Neto</p>
              </div>
              <p className="text-[10px] text-gray-500 mt-4 leading-normal">Precio de Compra menos Margen de Negociación</p>
            </div>

          </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 animate-pulse space-y-3">
                  <div className="h-2.5 bg-white/10 rounded w-1/2" />
                  <div className="h-7 bg-white/10 rounded w-3/4" />
                  <div className="h-2 bg-white/10 rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {/* Gráfica 30d */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-emerald-500" />
                <h3 className="text-[12px] font-bold text-gray-900 uppercase tracking-wide">Gráfica Tendencia Histórica (30 días)</h3>
              </div>
              <span className="text-[10px] text-gray-500">Base: MXN/ton</span>
            </div>

            {series.length === 0 ? (
              <div className="flex items-center justify-center h-52">
                <RefreshCw size={24} className="text-emerald-500 animate-spin" />
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff/10" vertical={false} />
                    <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} tickFormatter={v => `$${(Number(v)/1000).toFixed(1)}k`} tickLine={false} axisLine={false} width={45} />
                    <Tooltip
                      formatter={(v: any) => [`$${Number(v || 0).toLocaleString('es-MX')} MXN/t`]}
                      contentStyle={{ borderRadius: 12, border: 'none', backgroundColor: '#0d131a', color: '#fff', fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                    <Line type="monotone" name="Precio Compra" dataKey="precio_compra" stroke="#1A5C38" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" name="Margen Negociación" dataKey="margen_negociacion" stroke="#2563eb" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 4" />
                    <Line type="monotone" name="Precio Venta" dataKey="precio_venta" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Bodegas que publicaron hoy */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Store size={15} className="text-emerald-500" />
                <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Acopios Reportados Hoy</h3>
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Fecha: Hoy</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px] divide-y divide-gray-100">
                <thead>
                  <tr className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">
                    <th className="py-2.5">Silo / Bodega</th>
                    <th className="py-2.5">Ubicación</th>
                    <th className="py-2.5">Precio Hoy</th>
                    <th className="py-2.5">Variedad</th>
                    <th className="py-2.5 text-right">Vs. Promedio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {bodegasHoy.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-gray-400">Ninguna bodega ha publicado su precio hoy todavía</td></tr>
                  )}
                  {bodegasHoy.map((b, idx) => (
                    <tr key={idx} className="hover:bg-[#eef8f2]">
                      <td className="py-3 font-bold text-gray-900">{b.nombre}</td>
                      <td className="py-3 text-gray-500">{b.municipio}, {b.estado}</td>
                      <td className="py-3 font-black text-gray-900">{fmt(b.precio)}</td>
                      <td className="py-3 text-gray-500">{b.tipo_maiz}</td>
                      <td className={`py-3 text-right font-bold ${b.desviacion >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {b.desviacion >= 0 ? '+' : ''}{b.desviacion}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* ── COLUMNA DERECHA (40%) ── */}
        <div className="flex flex-col gap-3">

          {/* Utilidad FIRA */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Wheat size={15} className="text-emerald-500" />
                <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Costos de Producción FIRA</h3>
              </div>
              <button 
                onClick={() => setShowFiraModal(true)}
                className="flex items-center gap-1 text-[11px] text-[#1A5C38] font-bold bg-[#1A5C38]/5 hover:bg-[#1A5C38]/10 px-2.5 py-1 rounded"
              >
                <Upload size={11} /> Cargar CSV
              </button>
            </div>

            <div className="space-y-3">
              {preciosData.costos_fira_detalle && preciosData.costos_fira_detalle.length > 0 ? (
                <div className="space-y-2 text-[12.5px] max-h-56 overflow-y-auto">
                  {preciosData.costos_fira_detalle.slice(0, 4).map((fira, idx) => {
                    const costoHa = (fira as any).costo_por_ha || (fira as any).precio_fira || (fira as any).costo_por_ton || 0;
                    const utilidad = (preciosHoy?.po ?? 0) - costoHa;
                    return (
                      <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <p className="font-extrabold text-gray-900">{fira.estado}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{fira.ciclo} · {fira.modalidad}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-500 font-semibold">Costo de producción (MXN/ha): {fmt(costoHa)} MXN/ha</p>
                          <span className={`text-[11px] font-bold ${utilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            Utilidad: {utilidad >= 0 ? '+' : ''}{fmt(utilidad)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-gray-500 py-2">No se han registrado costos FIRA oficiales en la BD.</p>
              )}
            </div>
          </div>

          {/* Discrepancias */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <ShieldCheck size={15} className="text-emerald-500" />
              <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Discrepancias de Precios</h3>
            </div>

            <div className="space-y-3">
              {discrepancias.length === 0 ? (
                <p className="text-[12px] text-gray-500 py-3 text-center">Sin discrepancias de precios pendientes.</p>
              ) : (
                discrepancias.map((disc, idx) => (
                  <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2 text-[12.5px]">
                    <div className="flex justify-between items-start">
                      <span className="px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider rounded text-red-600 bg-red-500/10 border border-red-500/20">
                        {disc.prioridad}
                      </span>
                      <span className="text-[10px] text-gray-500">{new Date(disc.creado_at).toLocaleDateString('es-MX')}</span>
                    </div>
                    <p className="text-gray-700 leading-normal">{disc.descripcion}</p>
                    <button 
                      onClick={() => setResolvingDisc(disc)}
                      className="text-emerald-500 hover:text-emerald-600 font-extrabold hover:underline"
                    >
                      Resolver Discrepancia →
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Logs */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Clock size={15} className="text-emerald-500" />
              <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Logs de Actualización (Chicago/TC)</h3>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-[12px] text-gray-500 py-2">Sin actualizaciones manuales registradas.</p>
              ) : (
                logs.slice(0, 5).map((log, idx) => (
                  <div key={idx} className="text-[11.5px] bg-gray-50 border border-gray-100 rounded-xl p-2.5 flex justify-between items-center text-gray-500">
                    <div>
                      <p className="font-bold text-gray-900">{new Date(log.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">Fuente: {log.fuente}</p>
                    </div>
                    <div className="text-right font-mono">
                      <p>Ch: ${parseFloat(log.chicago_usd_bushel).toFixed(2)} USD</p>
                      <p>TC: ${parseFloat(log.tc_banxico).toFixed(4)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* ── SECTION TABLA BRECHAS (ANCHO COMPLETO, ABAJO) ── */}
      <section className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-emerald-500" />
            <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-wider">Auditoría de Brechas Regionales</h3>
          </div>
          <span className="text-[11px] text-gray-500">Estados con transacciones</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px] divide-y divide-gray-100">
            <thead>
              <tr className="text-gray-500 font-bold text-[10px] uppercase tracking-wider">
                <th className="py-2.5">Estado</th>
                <th className="py-2.5">PO Bodegas</th>
                <th className="py-2.5">Referencia Internacional</th>
                <th className="py-2.5">Brecha Estimada</th>
                <th className="py-2.5">Criticidad</th>
                <th className="py-2.5 text-right">Muestras (7d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {brechas.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">Sin datos suficientes para calcular brechas por estado en los últimos 7 días</td></tr>
              )}
              {brechas.map((br, idx) => (
                <tr key={idx} className="hover:bg-[#eef8f2]">
                  <td className="py-3 font-bold text-gray-900">{br.estado}</td>
                  <td className="py-3 font-bold">{fmt(br.po_real)}</td>
                  <td className="py-3 font-bold">{fmt(preciosHoy?.precio_venta ?? 0)}</td>
                  <td className="py-3 text-red-600 font-black">{fmt(br.brecha)} MXN/t</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                      br.nivel_criticidad === 'CRITICA' ? 'text-red-600 bg-red-500/10' :
                      br.nivel_criticidad === 'ALTA' ? 'text-amber-600 bg-amber-500/10' : 'text-blue-600 bg-blue-500/10'
                    }`}>
                      {br.nivel_criticidad}
                    </span>
                  </td>
                  <td className="py-3 text-right font-medium text-gray-500">{br.txns} tx</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── MODAL: SUBIR CSV FIRA ── */}
      {showFiraModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUploadFira} className="bg-white border border-gray-100 rounded-2xl max-w-[440px] w-full shadow-2xl overflow-hidden animate-zoomIn">
            
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Upload size={16} />
              </div>
              <h3 className="text-[16px] font-extrabold text-gray-900 uppercase tracking-tight">Subir Datos FIRA</h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[12.5px] text-gray-500 leading-relaxed">
                Selecciona el archivo CSV de costos FIRA. El archivo debe contener las columnas: <strong className="text-gray-900">estado, ciclo, modalidad, costo_por_ha</strong>.
              </p>

              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-emerald-500/50 transition-all cursor-pointer relative bg-white/[0.01]">
                <input 
                  type="file" 
                  accept=".csv"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  required
                />
                <Upload className="mx-auto mb-2 text-gray-500" size={24} />
                <span className="text-[13px] font-bold text-gray-700 block">
                  {selectedFile ? selectedFile.name : 'Selecciona o arrastra el CSV'}
                </span>
                <span className="text-[10px] text-gray-500 mt-1 block">Tamaño máximo 2MB</span>
              </div>

              {firaError && (
                <div className="text-[12px] text-red-600 bg-red-500/5 border border-red-500/10 rounded-xl p-3 leading-relaxed">
                  {firaError}
                </div>
              )}

              {firaResult && (
                <div className="text-[12px] text-emerald-600 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 leading-relaxed space-y-1">
                  <p className="font-bold flex items-center gap-1"><Check size={12} /> Carga Finalizada Exitosamente</p>
                  <p>Insertados: {firaResult.insertados} · Actualizados: {firaResult.actualizados}</p>
                  {firaResult.errores?.length > 0 && (
                    <div className="text-amber-600 max-h-20 overflow-y-auto mt-2">
                      <p className="font-bold">Advertencias:</p>
                      {firaResult.errores.map((err: string, i: number) => (
                        <p key={i}>- {err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button 
                type="button"
                onClick={() => { setShowFiraModal(false); setSelectedFile(null); setFiraError(''); setFiraResult(null); }}
                className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-gray-500 hover:text-gray-900 hover:bg-white/5 transition-all"
                disabled={firaLoading}
              >
                Cerrar
              </button>
              <button 
                type="submit"
                className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-md shadow-emerald-950/20"
                disabled={firaLoading || !selectedFile || (firaResult !== null)}
              >
                {firaLoading ? 'Cargando...' : 'Subir CSV'}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* ── MODAL: RESOLVER DISCREPANCIA ── */}
      {resolvingDisc && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-100 rounded-2xl max-w-[440px] w-full shadow-2xl overflow-hidden animate-zoomIn">
            
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <Check size={16} />
              </div>
              <h3 className="text-[16px] font-extrabold text-gray-900 uppercase tracking-tight">Resolver Discrepancia</h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-[13px] text-gray-700 leading-normal">{resolvingDisc.descripcion}</p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Notas de Resolución (Auditoría)
                </label>
                <textarea 
                  rows={4}
                  placeholder="Detalla las acciones o el veredicto administrativo tomado sobre esta discrepancia de precios..."
                  value={notaResolucion}
                  onChange={e => setNotaResolucion(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] text-gray-900 placeholder-gray-600 outline-none focus:border-emerald-500/50 resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button 
                onClick={() => { setResolvingDisc(null); setNotaResolucion(''); }}
                className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-gray-500 hover:text-gray-900 hover:bg-white/5 transition-all"
                disabled={resolveLoading}
              >
                Cancelar
              </button>
              <button 
                onClick={handleResolveDiscrepancia}
                className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950/20 transition-all"
                disabled={resolveLoading}
              >
                {resolveLoading ? 'Guardando...' : 'Confirmar Resolución'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}




