import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, RefreshCw, Wheat, Store, Globe, ArrowLeftRight, DollarSign, Gift, Clock, AlertTriangle, Activity } from 'lucide-react';
import { PageBanner } from '../components/Layout';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const HDR  = () => ({ Authorization: `Bearer ${localStorage.getItem('simac_token')}` });

const BONO_MAIZ_USD = 50;

interface MercadoData {
  precio_chicago_usd_bushel: number;
  tipo_cambio_mxn: number;
  bono_maiz_usd: number;
  margen_negociacion_mxn: number;
  timestamp_chicago: string;
  precio_origen_mxn: number;
  servicios_bodega_mxn: number;
  precio_compra_mxn: number;
  pct_productor: number;
  pct_servicios: number;
  precio_venta_mxn: number;
  precio_cedis_disponible: boolean;
  precio_cedis_mxn: number | null;
  series: { fecha: string; precio_compra: number; margen_negociacion: number; precio_venta: number }[];
}

function fmt(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtUsd(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Spinner() {
  return <div className="w-5 h-5 border-2 border-[#1A5C38]/20 border-t-[#1A5C38] rounded-full animate-spin" />;
}

export default function B22PreciosMercado() {
  const [data, setData]       = useState<MercadoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/precios/mercado`, { headers: HDR() });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      setData(await r.json());
    } catch {
      setError('No se pudieron cargar los precios.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const LABEL: Record<string, string> = {
    precio_compra:      'Precio de Compra',
    margen_negociacion: 'Margen de Negociación',
    precio_venta:       'Precio de Venta',
  };

  const esDatosDeAyer = data
    ? (new Date().getTime() - new Date(data.timestamp_chicago).getTime() > 24 * 60 * 60 * 1000)
    : false;

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-gray-50/50 to-gray-100/30">
      <PageBanner title="Precios del maíz blanco · Hoy" subtitle="Referencias de mercado actualizadas en tiempo real" back={-1} />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md border border-black/[0.04] rounded-[1.25rem] px-5 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${esDatosDeAyer ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${esDatosDeAyer ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-none">
              {esDatosDeAyer ? 'Datos de ayer' : 'Maíz Blanco en Vivo'}
            </p>
          </div>
          <button 
            onClick={cargar} 
            disabled={loading}
            className="flex items-center gap-1.5 text-[12px] text-[#1A5C38] font-bold bg-[#1A5C38]/5 hover:bg-[#1A5C38]/10 px-3 py-1.5 rounded-lg active:scale-95 transition-all duration-200 disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>

        {error && (
          <div className="bg-red-50/80 backdrop-blur-md rounded-2xl p-4 text-red-600 text-[13px] border border-red-100/50 flex items-center gap-2">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {/* 3 Precios Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* PRECIO 1 — Margen de Negociación */}
          <section className="bg-white/80 backdrop-blur-md rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6 space-y-5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-500 group/card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">1</span>
                <h2 className="text-[14px] font-bold text-gray-800 tracking-tight">Margen de Negociación</h2>
              </div>
              {esDatosDeAyer && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/30">Ayer</span>
              )}
            </div>
            
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Referencia internacional basada en Chicago CME convertido a pesos + Bono Maíz Blanco.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#f4fbf7]/50 rounded-xl p-2.5 border border-gray-100">
                <div className="flex items-center gap-1">
                  <Globe size={10} className="text-gray-400" />
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">CME Chicago</span>
                </div>
                <p className="text-[16px] font-black text-gray-850 mt-0.5 leading-tight">
                  {loading ? '—' : fmtUsd(data?.precio_chicago_usd_bushel ?? 0)}
                </p>
                <p className="text-[9px] text-gray-400">USD/bushel</p>
              </div>

              <div className="bg-[#f4fbf7]/50 rounded-xl p-2.5 border border-gray-100">
                <div className="flex items-center gap-1">
                  <ArrowLeftRight size={10} className="text-gray-400" />
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Conversión</span>
                </div>
                <p className="text-[16px] font-black text-gray-850 mt-0.5 leading-tight">
                  {loading ? '—' : fmtUsd((data?.precio_chicago_usd_bushel ?? 0) * 39.368)}
                </p>
                <p className="text-[9px] text-gray-400">USD/ton metric</p>
              </div>

              <div className="bg-[#f4fbf7]/50 rounded-xl p-2.5 border border-gray-100">
                <div className="flex items-center gap-1">
                  <DollarSign size={10} className="text-gray-400" />
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Dólar FIX</span>
                </div>
                <p className="text-[16px] font-black text-gray-850 mt-0.5 leading-tight">
                  {loading ? '—'
                    : data?.tipo_cambio_mxn != null
                      ? `$${data.tipo_cambio_mxn.toFixed(2)}`
                      : <span className="text-amber-500 text-sm font-semibold">Sin datos</span>
                  }
                </p>
                <p className="text-[9px] text-gray-400">MXN/USD</p>
              </div>

              <div className="bg-[#f4fbf7]/50 rounded-xl p-2.5 border border-gray-100">
                <div className="flex items-center gap-1">
                  <Gift size={10} className="text-gray-400" />
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Bono Blanco</span>
                </div>
                <p className="text-[16px] font-black text-gray-850 mt-0.5 leading-tight">
                  +${BONO_MAIZ_USD} USD
                </p>
                <p className="text-[9px] text-gray-400">
                  ={loading ? '—'
                    : data?.tipo_cambio_mxn != null
                      ? fmt(BONO_MAIZ_USD * data.tipo_cambio_mxn)
                      : <span className="text-amber-500">Sin datos</span>
                  }/t
                </p>
              </div>
            </div>

            {/* Total Margen Negociación */}
            <div className="bg-gray-900 rounded-[1.25rem] p-5 text-center shadow-inner relative overflow-hidden transition-transform duration-500 group-hover/card:scale-[1.01]">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Margen de Negociación Total</p>
              {loading ? (
                <div className="flex justify-center py-1"><Spinner /></div>
              ) : (
                <p className="text-[32px] font-black text-white tracking-tight leading-none">{fmt(data?.margen_negociacion_mxn)}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">MXN/tonelada métrica</p>
            </div>
          </section>

          {/* PRECIO 2 — Precio de Compra (PO + S) */}
          <section className="bg-white/80 backdrop-blur-md rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6 space-y-5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-500 group/card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-[#1A5C38] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">2</span>
                <h2 className="text-[14px] font-bold text-gray-800 tracking-tight">Precio de Compra</h2>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#1A5C38] bg-[#1A5C38]/5 px-2 py-0.5 rounded-full">Bodega</span>
            </div>
            
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Costo real del maíz en la cadena, sumando el pago al productor y el costo de servicios.
            </p>

            <div className="rounded-[1.25rem] overflow-hidden border border-gray-100 divide-y divide-gray-100 shadow-inner">
              {/* Productor (PO) */}
              <div className="bg-[#1A5C38]/5 p-4 flex justify-between items-center transition-colors hover:bg-[#1A5C38]/10">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Wheat size={12} className="text-[#1A5C38]" />
                    <span className="text-[10px] font-bold text-[#1A5C38] uppercase tracking-wider">Gana Productor (PO)</span>
                  </div>
                  <p className="text-[10px] text-[#1A5C38]/80 leading-snug">Promedio pagado últimos 7 días</p>
                </div>
                <div className="text-right">
                  {loading ? (
                    <Spinner />
                  ) : (
                    <>
                      <p className="text-[20px] font-black text-[#1A5C38] leading-none">{fmt(data?.precio_origen_mxn)}</p>
                      <span className="text-[9px] font-bold text-[#1A5C38]/80 mt-0.5 inline-block bg-[#1A5C38]/10 px-1.5 py-0.2 rounded">{data?.pct_productor}%</span>
                    </>
                  )}
                </div>
              </div>

              {/* Servicios (S) */}
              <div className="bg-[#1B4F8A]/5 p-4 flex justify-between items-center transition-colors hover:bg-[#1B4F8A]/10">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Store size={12} className="text-[#1B4F8A]" />
                    <span className="text-[10px] font-bold text-[#1B4F8A] uppercase tracking-wider">Servicios Bodega (S)</span>
                  </div>
                  <p className="text-[10px] text-[#1B4F8A]/80 leading-snug">Limpieza, secado y acopio</p>
                </div>
                <div className="text-right">
                  {loading ? (
                    <Spinner />
                  ) : (
                    <>
                      <p className="text-[20px] font-black text-[#1B4F8A] leading-none">{fmt(data?.servicios_bodega_mxn)}</p>
                      <span className="text-[9px] font-bold text-[#1B4F8A]/80 mt-0.5 inline-block bg-[#1B4F8A]/10 px-1.5 py-0.2 rounded">{data?.pct_servicios}%</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Total Compra */}
            <div className="bg-white rounded-[1.25rem] p-5 border border-black/[0.04] text-center shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-transform duration-500 group-hover/card:scale-[1.01]">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Precio de Compra Total</p>
              {loading ? (
                <div className="flex justify-center py-1"><Spinner /></div>
              ) : (
                <p className="text-[32px] font-black text-gray-800 tracking-tight leading-none">{fmt(data?.precio_compra_mxn)}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">MXN/tonelada métrica</p>
            </div>
          </section>

        </div>

        {/* PRECIO 3 — Precio de Venta (Compra - Margen) & PRECIO 4 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Precio de Venta (Resta Visual) */}
          <section className="md:col-span-2 bg-white/80 backdrop-blur-md rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6 space-y-5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-500 group/card">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#1B4F8A] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">3</span>
              <h2 className="text-[14px] font-bold text-gray-800 tracking-tight">Precio de Venta (Diferencial de Mercado)</h2>
            </div>

            <div className="rounded-[1.25rem] border border-black/[0.04] p-5 bg-[#f4fbf7]/50 space-y-3 transition-transform duration-500 group-hover/card:scale-[1.01]">
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-gray-400">Precio de Compra (PO + S)</span>
                <span className="font-semibold text-gray-700">{loading ? '—' : fmt(data?.precio_compra_mxn)}/t</span>
              </div>
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-gray-400">− Margen de Negociación</span>
                <span className="font-semibold text-gray-700">{loading ? '—' : fmt(data?.margen_negociacion_mxn)}/t</span>
              </div>
              <div className="h-px bg-gray-200/60" />
              <div className="flex items-end justify-between pt-1">
                <div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-0.5">Precio de Venta</span>
                  <p className="text-[10px] text-gray-400">Diferencia neta vs mercado global</p>
                </div>
                <div className="text-right">
                  {loading ? (
                    <Spinner />
                  ) : (
                    <>
                      <p className={`text-[32px] font-black leading-none ${(data?.precio_venta_mxn ?? 0) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {fmt(data?.precio_venta_mxn)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">MXN/tonelada</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Alerta si es negativo */}
            {!loading && data && data.precio_venta_mxn < 0 && (
              <div className="flex items-start gap-2 bg-red-50/50 border border-red-100/50 rounded-xl p-2.5 text-red-600 text-[11px] leading-relaxed">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                <p>
                  <strong>Diferencial negativo detectado:</strong> El costo de compra excede la referencia internacional de Chicago. Ajustar el margen operativo para evitar pérdidas.
                </p>
              </div>
            )}
          </section>

          {/* PRECIO 4 — CEDIS */}
          <section className="bg-white/80 backdrop-blur-md rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6 flex flex-col justify-between hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-500 group/card">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-6 h-6 rounded-full bg-amber-400 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">4</span>
                <h2 className="text-[14px] font-bold text-gray-800 tracking-tight">Precio CEDIS</h2>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Referencia de compra directa en Centrales de Abasto menos el Margen de Negociación internacional.
              </p>
            </div>
            
            <div className="border-2 border-dashed border-gray-200/60 rounded-xl p-3 bg-amber-50/5 text-center mt-3">
              <span className="bg-amber-100/70 border border-amber-200/40 text-amber-800 text-[9px] font-bold px-2 py-0.5 rounded-full inline-block mb-1.5 uppercase tracking-wider">
                En Desarrollo
              </span>
              <p className="text-[11px] text-gray-450 leading-normal">
                Integración de tarifas en centrales metropolitanas próximamente disponible.
              </p>
            </div>
          </section>

        </div>

        {/* Gráfica de Tendencia */}
        <div className="bg-white/80 backdrop-blur-md rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6 space-y-5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-500 group/card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-emerald-500" />
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Tendencia Histórica · 30 días</p>
            </div>
            <span className="text-[10px] text-gray-400">Base: MXN/ton</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48"><Spinner /></div>
          ) : !data || data.series.length < 2 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <TrendingUp size={30} className="text-gray-300" />
              <p className="text-[12px] text-gray-400 text-center leading-normal">
                Datos históricos en proceso de recopilación.<br />
                Las tendencias se visualizarán al acumularse más días.
              </p>
            </div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${(Number(v)/1000).toFixed(1)}k`} tickLine={false} axisLine={false} width={45} />
                  <Tooltip
                    formatter={(v: any, name: any) => [
                      `$${Number(v || 0).toLocaleString('es-MX')} MXN`,
                      LABEL[name] || name,
                    ]}
                    labelStyle={{ fontSize: 11, fontWeight: 'bold' }}
                    contentStyle={{ 
                      borderRadius: 12, 
                      border: '1px solid rgba(229, 231, 235, 0.5)', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)', 
                      fontSize: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.95)'
                    }}
                  />
                  <Legend 
                    formatter={n => LABEL[n] || n} 
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ fontSize: 10, paddingTop: 10 }} 
                  />
                  <Line type="monotone" name="precio_compra" dataKey="precio_compra" stroke="#1A5C38" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" name="margen_negociacion" dataKey="margen_negociacion" stroke="#2563eb" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 4" />
                  <Line type="monotone" name="precio_venta" dataKey="precio_venta" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="3 3" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Footer Timestamp */}
        <div className="flex items-center justify-center gap-1.5 pt-2 text-[10px] text-gray-400">
          <Clock size={10} className="text-gray-300" />
          <p>
            Fuentes oficiales: CBOT (Chicago CME ZC=F) · Banco de México (TC SF43718) · Actualizado al día de hoy
          </p>
        </div>

      </div>
    </div>
  );
}
