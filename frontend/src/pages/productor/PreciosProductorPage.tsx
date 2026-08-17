import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  TrendingUp, DollarSign, Tag, Calculator,
  CircleDollarSign, Settings, Award, AlertTriangle, BookOpen, Search, Check
} from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const BONO_MAIZ_BLANCO_USD = 50; // fijo — se configurará desde Admin en el futuro

export default function PreciosProductorPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem('simac_token');

  // Modo de precios: promedio estatal vs. bodega específica
  const [modoPrecio, setModoPrecio] = useState<'estatal' | 'bodega'>('estatal');
  const [busquedaBodega, setBusquedaBodega] = useState('');
  const [bodegaSeleccionada, setBodegaSeleccionada] = useState<any>(null);
  const [resultadosBusqueda, setResultadosBusqueda] = useState<any[]>([]);
  const [preciosBodega, setPreciosBodega] = useState<any>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/productor/precios`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // Buscador de bodega con debounce (mínimo 3 caracteres)
  useEffect(() => {
    if (!busquedaBodega || busquedaBodega.length < 3) { setResultadosBusqueda([]); return; }
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`${BASE}/bodegas?q=${encodeURIComponent(busquedaBodega)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        setResultadosBusqueda((Array.isArray(d) ? d : (d.bodegas || d.data || [])).slice(0, 8));
      } catch { setResultadosBusqueda([]); }
      finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [busquedaBodega]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-[#1A5C38]/20 border-t-[#1A5C38] rounded-full animate-spin" /></div>;
  if (!data) return null;

  // ── Cálculos ────────────────────────────────────────────────────────────
  // Fuente de datos: promedio estatal (data) o bodega específica (preciosBodega)
  const usandoBodega = modoPrecio === 'bodega' && !!preciosBodega;

  const chicago     = data.precio_chicago_usd_bushel;
  const tipoCambio  = data.tipo_cambio_mxn;
  const tieneChicago = chicago != null && tipoCambio != null;

  const po          = usandoBodega ? preciosBodega.po : data.precio_compra;          // PO
  const servicios   = usandoBodega ? preciosBodega.servicios : data.servicios_promedio; // S
  const tieneServicios = servicios != null && servicios > 0;
  const tienePO        = po != null;

  // Margen de Negociación = (Chicago × 39.368 × tipo_cambio) + (Bono × tipo_cambio)
  const margenEstatal = tieneChicago
    ? (chicago * 39.368 * tipoCambio) + (BONO_MAIZ_BLANCO_USD * tipoCambio)
    : null;
  const margen = usandoBodega ? preciosBodega.margen : margenEstatal;

  // Precio de Compra = PO + S
  const precioCompra = usandoBodega
    ? preciosBodega.precio_compra
    : (tienePO && tieneServicios ? po + servicios : null);

  // Precio de Venta = Precio de Compra − Margen de Negociación
  const precioVenta = usandoBodega
    ? preciosBodega.precio_venta
    : (precioCompra != null && margen != null ? precioCompra - margen : null);

  const esFavorable = precioVenta != null && precioVenta >= 0;

  return (
    <div className="flex flex-col font-sans w-full min-h-full pb-8 bg-[#eef8f2]">
      
      {/* ── HEADER VERDE ── */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-[32px] shadow-[0_4px_20px_rgba(26,92,56,0.25)] relative z-10">
        <div className="max-w-[700px] mx-auto px-4 sm:px-6 pt-4 pb-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest">Precios del Maíz</p>
              <div className="shrink-0 flex items-center gap-1.5 text-[10px] text-green-900 font-bold bg-green-400 border border-green-300 rounded-full px-2 py-0.5 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-100 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white m-auto"></span>
                </span>
                En vivo
              </div>
            </div>
            <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">Análisis de Precios</h1>
            <p className="text-[12px] font-medium text-white/60 mt-0.5">Referencia internacional y rentabilidad</p>
          </div>
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="w-full max-w-[700px] mx-auto px-4 sm:px-6 pt-5 space-y-4">

      {/* ── SELECTOR DE MODO: estatal vs bodega específica ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
        <p className="text-sm font-medium text-slate-700 mb-3">Ver precios para:</p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={modoPrecio === 'estatal'}
              onChange={() => { setModoPrecio('estatal'); setBodegaSeleccionada(null); setPreciosBodega(null); setBusquedaBodega(''); }}
              className="w-4 h-4 accent-[#1A5C38]"
            />
            <span className="text-sm text-slate-800">
              Promedio de mi estado
              {data?.estado && <span className="text-slate-400 ml-1">({data.estado})</span>}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              checked={modoPrecio === 'bodega'}
              onChange={() => setModoPrecio('bodega')}
              className="w-4 h-4 accent-[#1A5C38]"
            />
            <span className="text-sm text-slate-800">Una bodega específica</span>
          </label>
        </div>

        {modoPrecio === 'bodega' && (
          <div className="mt-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={busquedaBodega}
              onChange={e => { setBusquedaBodega(e.target.value); setBodegaSeleccionada(null); setPreciosBodega(null); }}
              placeholder="Buscar bodega por nombre o municipio..."
              className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C38]"
            />

            {buscando && <p className="text-xs text-slate-400 mt-2">Buscando…</p>}

            {resultadosBusqueda.length > 0 && !bodegaSeleccionada && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                {resultadosBusqueda.map(b => (
                  <button
                    key={b.id}
                    onClick={async () => {
                      setBodegaSeleccionada(b);
                      setBusquedaBodega(b.nombre);
                      setResultadosBusqueda([]);
                      try {
                        const r = await fetch(`${BASE}/precios/bodega/${b.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        setPreciosBodega(await r.json());
                      } catch { /* ignore */ }
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-[#eef8f2] border-b border-slate-50 last:border-0"
                  >
                    <p className="text-sm font-medium text-slate-800">{b.nombre}</p>
                    <p className="text-xs text-slate-500">
                      {b.municipio}, {b.estado}
                      {b.precio_compra_hoy > 0 && (
                        <span className="ml-2 text-[#1A5C38] font-medium">
                          ${Number(b.precio_compra_hoy).toLocaleString('es-MX')}/ton hoy
                        </span>
                      )}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {bodegaSeleccionada && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-green-800">{bodegaSeleccionada.nombre}</p>
                  <p className="text-xs text-green-600">{bodegaSeleccionada.municipio}, {bodegaSeleccionada.estado}</p>
                </div>
                <button
                  onClick={() => { setBodegaSeleccionada(null); setPreciosBodega(null); setBusquedaBodega(''); }}
                  className="text-green-500 hover:text-green-700 text-lg"
                >
                  ×
                </button>
              </div>
            )}

            {preciosBodega && !preciosBodega.tiene_precio_hoy && (
              <div className="mt-2 flex items-center gap-2 text-amber-600">
                <AlertTriangle size={14} />
                <span className="text-xs">
                  Precio de hace {preciosBodega.dias_antiguedad_precio} día{preciosBodega.dias_antiguedad_precio !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Aviso cuando aún no hay precio de bodega en la región del productor */}
      {!tienePO && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={17} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-bold text-amber-900">
              Aún no hay precios de bodega en tu región{data.estado ? ` (${data.estado})` : ''}
            </p>
            <p className="text-[12px] text-amber-700 mt-1 leading-relaxed">
              La <strong>referencia internacional</strong> de abajo ya está disponible.
              El <strong>precio de compra y de venta</strong> aparecerán en cuanto una bodega de
              tu estado publique sus precios. Mientras tanto, usa el margen como referencia para negociar.
            </p>
          </div>
        </div>
      )}

      {/* ── PRECIO 1 — Referencia internacional ── */}
      <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <div className="w-8 h-8 bg-[#1A5C38] text-white rounded-lg flex items-center justify-center text-[14px] font-bold shadow-md shrink-0">
            1
          </div>
          <div>
            <p className="font-bold text-slate-900 text-[14px] tracking-tight">
              Referencia internacional
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed max-w-lg">
              Calculado en tiempo real (Chicago + TC + Bono).
            </p>
          </div>
        </div>

        <div className="mx-4 mb-4 bg-gradient-to-br from-[#1A2F1F] to-[#0f1d13] rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          
          <div className="flex flex-col mb-4 relative z-10">
            <p className="text-[28px] sm:text-[34px] leading-none font-black text-white tracking-tight">
              {margen != null
                ? `$${margen.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
                : <span className="text-[20px] text-slate-400 font-medium tracking-normal">Sin datos</span>
              }
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-green-500/20 text-green-300 text-[9px] font-bold px-2 py-1 rounded border border-green-400/20 uppercase tracking-wider">
                Margen de negociación
              </span>
              <span className="text-slate-400 text-[9px] font-bold tracking-wider uppercase">MXN/ton</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 relative z-10">
            {[
              { icon: TrendingUp, label: 'Futuro Chicago', value: tieneChicago ? `$${chicago} USD/bu` : 'Sin datos' },
              { icon: DollarSign, label: 'Dólar FIX', value: tipoCambio != null ? `$${tipoCambio} MXN` : 'Sin datos' },
              { icon: Tag, label: 'Bono maíz', value: `+$${BONO_MAIZ_BLANCO_USD} USD` },
            ].map((item) => (
              <div key={item.label} className="bg-white/[0.04] border border-white/10 rounded-xl p-2.5 flex items-center sm:flex-col sm:items-start sm:justify-between transition-colors hover:bg-white/[0.08]">
                <div className="w-[28px] h-[28px] bg-white/[0.08] text-white rounded-md flex items-center justify-center shrink-0 mr-3 sm:mr-0 sm:mb-2">
                  <item.icon size={14} />
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-medium leading-tight">
                    {item.label}
                  </p>
                  <p className="text-[12px] font-bold text-white mt-0.5">
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2 relative z-10">
            <Calculator size={12} className="text-slate-400 shrink-0" />
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium">
              <span className="text-white/60">(Futuro × 39.368 × dólar) + bono =</span> <span className="text-green-400 font-bold ml-1">Margen</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── PRECIO 2 — Precio de compra ── */}
      <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#1A5C38] text-white rounded-lg flex items-center justify-center text-[14px] font-bold shadow-md shrink-0">
              2
            </div>
            <div>
              <p className="font-bold text-slate-900 text-[14px] tracking-tight">
                Precio de compra
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed">
                Pago de la bodega más servicios.
              </p>
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">

            {/* PO */}
            <div className="w-full sm:flex-1 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center sm:flex-col sm:items-start sm:justify-center">
              <div className="w-8 h-8 bg-[#1A5C38] text-white rounded-lg flex items-center justify-center shadow-sm shrink-0 mr-3 sm:mr-0 sm:mb-2">
                <CircleDollarSign size={16} />
              </div>
              <div>
                <p className="text-[9px] text-[#1A5C38] font-bold uppercase tracking-wider mb-0.5">
                  Pago bodega (PO)
                </p>
                <p className="text-[18px] sm:text-[20px] font-black text-[#1A5C38] tracking-tight leading-none">
                  {tienePO ? `$${po.toLocaleString('es-MX')}` : <span className="text-[14px] text-slate-400 font-medium tracking-normal">Sin datos</span>}
                </p>
              </div>
            </div>

            <div className="text-lg font-black text-slate-300 shrink-0 rotate-90 sm:rotate-0 my-0.5 sm:my-0">+</div>

            {/* S */}
            <div className="w-full sm:flex-1 bg-blue-50/50 border border-blue-100 rounded-2xl p-3 sm:p-4 shadow-sm flex items-center sm:flex-col sm:items-start sm:justify-center">
              <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-sm shrink-0 mr-3 sm:mr-0 sm:mb-2">
                <Settings size={16} />
              </div>
              <div>
                <p className="text-[9px] text-blue-700 font-bold uppercase tracking-wider mb-0.5">
                  Servicios (S)
                </p>
                <p className="text-[18px] sm:text-[20px] font-black text-blue-700 tracking-tight leading-none">
                  {tieneServicios ? `$${servicios.toLocaleString('es-MX')}` : <span className="text-[13px] text-slate-400 font-medium tracking-normal">Sin tarifario activo</span>}
                </p>
              </div>
            </div>

            <div className="text-lg font-black text-slate-300 shrink-0 rotate-90 sm:rotate-0 my-0.5 sm:my-0">=</div>

            {/* Total */}
            <div className="w-full sm:flex-1 bg-slate-800 rounded-2xl p-3 sm:p-4 shadow-md flex items-center sm:flex-col sm:items-start sm:justify-center">
              <div className="w-8 h-8 bg-slate-700 text-white rounded-lg flex items-center justify-center shadow-inner shrink-0 mr-3 sm:mr-0 sm:mb-2">
                <Tag size={16} />
              </div>
              <div>
                <p className="text-[9px] text-slate-300 font-bold uppercase tracking-wider mb-0.5">
                  Total Compra
                </p>
                <p className="text-[18px] sm:text-[20px] font-black text-white tracking-tight leading-none">
                  {precioCompra != null ? `$${precioCompra.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : <span className="text-[14px] text-slate-400 font-medium tracking-normal">Sin datos</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PRECIO 3 — Precio de venta ── */}
      <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <div className="flex items-center gap-3 p-4 pb-2">
          <div className="w-8 h-8 bg-[#1A5C38] text-white rounded-lg flex items-center justify-center text-[14px] font-bold shadow-md shrink-0">
            3
          </div>
          <div>
            <p className="font-bold text-slate-900 text-[14px] tracking-tight">
              Precio de venta
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium leading-relaxed">
              Neto resultante al restar el margen a la compra.
            </p>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="bg-[#eef8f2] rounded-2xl p-4 mb-4 border border-slate-100 shadow-sm">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-3">
              Versión 1 — Productor con servicios
            </p>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600 font-medium flex items-center gap-2">
                  <CircleDollarSign size={14} className="text-slate-400"/> Precio de compra
                </span>
                <span className="font-bold text-slate-900">
                  {precioCompra != null ? `$${precioCompra.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-600 font-medium flex items-center gap-2">
                  <TrendingUp size={14} className="text-slate-400"/> Margen de negociación
                </span>
                <span className="font-bold text-slate-900">
                  {margen != null ? `$${margen.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : '—'}
                </span>
              </div>
              
              <div className="w-full h-px bg-slate-200 my-3"></div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                <span className="font-black text-slate-900 flex items-center gap-2 text-[14px]">
                  <Award size={16} className="text-amber-500"/> Diferencial de venta
                </span>
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-100 w-fit">
                  <span className={`text-[18px] sm:text-[20px] font-black tracking-tight leading-none
                    ${precioVenta == null ? 'text-slate-400'
                      : esFavorable ? 'text-[#1A5C38]'
                      : 'text-rose-600'}`}>
                    {precioVenta != null
                      ? `$${Math.abs(precioVenta).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`
                      : 'Sin datos'
                    }
                  </span>
                  {precioVenta != null && (
                    <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider inline-flex items-center gap-1
                      ${esFavorable
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                      {esFavorable ? (<><Check size={11} /> Favorable</>) : (<><AlertTriangle size={11} /> Deficit</>)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {precioVenta != null && !esFavorable && (
              <div className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200/60 rounded-xl p-3 font-medium mt-3 shadow-sm">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <p>Alerta: El precio de compra actual se encuentra por debajo del margen de negociación sugerido.</p>
              </div>
            )}
          </div>

          <div className="border border-dashed border-slate-200 rounded-2xl p-4 bg-[#eef8f2]/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
              <p className="text-[12px] font-bold text-slate-600">
                Versión 2 — Precio CEDIS
              </p>
              <span className="bg-amber-100 text-amber-800 text-[9px] font-bold tracking-widest uppercase px-2 py-1 rounded-md w-fit">
                En desarrollo
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              Precio en Centrales de Abasto menos el Margen de Negociación. 
              Se habilitará cuando el administrador configure los módulos.
            </p>
          </div>
        </div>
      </div>

      {/* ── HISTÓRICO 30 DÍAS ── */}
      <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-100 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                <TrendingUp size={16} />
              </div>
              <p className="text-[15px] font-bold text-slate-900 tracking-tight">
                Histórico a 30 días
              </p>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-[#eef8f2] px-2.5 py-1 rounded-md border border-slate-100">MXN / TON</p>
          </div>
          
          {data.tendencia?.length > 0 ? (
          <div className="h-48 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.tendencia} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tickFormatter={(f) => new Date(f).toLocaleDateString('es-MX', {day: 'numeric', month: 'short'})} dy={10} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickFormatter={v => `$${(Number(v)/1000).toFixed(1)}k`} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  formatter={(v: any) => [
                    `$${Number(v || 0).toLocaleString('es-MX')} MXN`,
                    'Precio Compra',
                  ]}
                  labelFormatter={(f) => new Date(f).toLocaleDateString('es-MX', {day: 'numeric', month: 'short', year: 'numeric'})}
                  labelStyle={{ fontSize: 12, fontWeight: '800', color: '#1e293b', marginBottom: 4 }}
                  contentStyle={{ 
                    borderRadius: 16, 
                    border: '1px solid rgba(226, 232, 240, 0.8)', 
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', 
                    fontSize: 13,
                    fontWeight: '600',
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    padding: '12px 16px'
                  }}
                />
                <Line type="monotone" name="precio_compra" dataKey="precio_compra" stroke="#10b981" strokeWidth={3} dot={{ r: 0 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <TrendingUp size={40} className="text-gray-300 mb-3" />
              <p className="text-gray-600 font-medium">Historial en construcción</p>
              <p className="text-gray-400 text-sm mt-1 max-w-xs">
                El historial de precios estará disponible después de los primeros 30 días de operación del sistema.
              </p>
            </div>
          )}
        </div>

      {/* ── FIRA ── */}
      {data.fira && (
        <div className="bg-[#eef8f2] border border-slate-200 rounded-[24px] p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center text-slate-600 shadow-inner">
              <BookOpen size={16} />
            </div>
            <p className="text-[15px] font-bold text-slate-800 tracking-tight">
              Referencia FIRA · {data.estado}
            </p>
          </div>
          
          <div className="grid gap-2 text-[13px]">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
              <span className="text-slate-500 font-medium mb-0.5 sm:mb-0">Modalidad de riego</span>
              <span className="font-bold text-slate-800">{data.fira.modalidad}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
              <span className="text-slate-500 font-medium mb-0.5 sm:mb-0">Costo productivo por hectárea</span>
              <span className="font-bold text-slate-800">
                ${data.fira.costo_por_ha.toLocaleString('es-MX')}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-emerald-50 rounded-xl p-3 border border-emerald-100 shadow-sm">
              <span className="text-emerald-700 font-bold mb-0.5 sm:mb-0">Precio FIRA sugerido</span>
              <span className="font-black text-[#1A5C38] text-[14px]">
                ${data.fira.precio_fira.toLocaleString('es-MX')} / ton
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold mt-4 text-center uppercase tracking-wide">
            Fuente: Costos FIRA · Ciclo PV 2026
          </p>
        </div>
      )}

    </div>
    </div>
  );
}
