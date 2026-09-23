import { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Punto { fecha: string; precio_compra?: number | null; margen_negociacion?: number | null; precio_venta?: number | null; }

const SERIES = [
  { key: 'precio_compra',      label: 'Precio de compra',   color: '#1A5C38' },
  { key: 'margen_negociacion', label: 'Margen negociación', color: '#2563eb' },
  { key: 'precio_venta',       label: 'Precio de venta',    color: '#d97706' },
] as const;
type Clave = typeof SERIES[number]['key'];

const RANGOS = [7, 15, 30];
const MXN = (v: number) => `$${Math.round(v).toLocaleString('es-MX')}`;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiqueta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// El backend manda "MM-DD" sin año: se resuelve contra hoy (un mes futuro pertenece al año pasado).
function aFecha(mmdd: string, hoy: Date): Date {
  const [m, d] = mmdd.split('-').map(Number);
  const y = m - 1 > hoy.getMonth() ? hoy.getFullYear() - 1 : hoy.getFullYear();
  return new Date(y, m - 1, d);
}

function TooltipTendencia({ active, payload, activas }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-white shadow-lg ring-1 ring-black/5 px-3.5 py-3 min-w-[190px]">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">{p.etiquetaLarga}</p>
      <div className="space-y-1.5">
        {SERIES.filter(s => activas[s.key] && p[s.key] != null).map(s => (
          <div key={s.key} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.label}
            </span>
            <span className="font-bold text-gray-900 tabular-nums">{MXN(p[s.key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GraficaTendenciaPrecios({ series }: { series: Punto[] }) {
  const [dias, setDias] = useState(30);
  const [activas, setActivas] = useState<Record<Clave, boolean>>({
    precio_compra: true, margen_negociacion: true, precio_venta: true,
  });

  const { datos, conDatos } = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const porFecha = new Map<string, Punto>();
    series.forEach(s => porFecha.set(iso(aFecha(s.fecha, hoy)), s));
    const out: any[] = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date(hoy); d.setDate(hoy.getDate() - i);
      const p = porFecha.get(iso(d));
      out.push({
        etiqueta: etiqueta(d),
        etiquetaLarga: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
        precio_compra: p?.precio_compra ?? null,
        margen_negociacion: p?.margen_negociacion ?? null,
        precio_venta: p?.precio_venta ?? null,
      });
    }
    return { datos: out, conDatos: out.filter(o => o.precio_compra != null).length };
  }, [series, dias]);

  const resumen = (k: Clave) => {
    const v = datos.map(d => d[k]).filter((x: number | null) => x != null) as number[];
    if (!v.length) return { ultimo: null as number | null, delta: null as number | null };
    return { ultimo: v[v.length - 1], delta: v.length > 1 ? v[v.length - 1] - v[0] : null };
  };

  const visibles = SERIES.filter(s => activas[s.key]);
  const valores = datos.flatMap(d => visibles.map(s => d[s.key])).filter((x): x is number => x != null);
  const min = valores.length ? Math.min(...valores) : 0;
  const max = valores.length ? Math.max(...valores) : 1;
  const margen = Math.max((max - min) * 0.15, max * 0.05);
  const paso = max - min > 3000 ? 1000 : 500;
  const dominio: [number, number] = [Math.max(0, Math.floor((min - margen) / paso) * paso), Math.ceil((max + margen) / paso) * paso];
  let salto = paso;
  while ((dominio[1] - dominio[0]) / salto > 6) salto *= 2;
  dominio[1] = Math.ceil(dominio[1] / salto) * salto;
  dominio[0] = Math.floor(dominio[0] / salto) * salto;
  const ticksY: number[] = [];
  for (let t = dominio[0]; t <= dominio[1]; t += salto) ticksY.push(t);
  const intervalo = dias <= 7 ? 0 : dias <= 15 ? 2 : 4;

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Activity size={17} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-gray-900 leading-tight">Tendencia histórica de precios</h3>
            <p className="text-[11.5px] text-gray-500 mt-0.5">Últimos {dias} días · pesos por tonelada (MXN/t)</p>
          </div>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {RANGOS.map(r => (
            <button key={r} onClick={() => setDias(r)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${dias === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {r} días
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {SERIES.map(s => {
          const r = resumen(s.key);
          const on = activas[s.key];
          const Icono = r.delta == null || r.delta === 0 ? Minus : r.delta > 0 ? TrendingUp : TrendingDown;
          return (
            <button key={s.key} onClick={() => setActivas(a => ({ ...a, [s.key]: !a[s.key] }))}
              aria-pressed={on}
              className={`text-left rounded-xl border px-3.5 py-3 transition-all ${on ? 'border-gray-200 bg-white shadow-sm' : 'border-dashed border-gray-200 bg-gray-50 opacity-55'}`}>
              <div className="flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label}
              </div>
              <div className="flex items-end justify-between mt-1.5">
                <span className="text-[20px] font-black text-gray-900 tabular-nums leading-none">{r.ultimo != null ? MXN(r.ultimo) : '—'}</span>
                {r.delta != null && (
                  <span className={`flex items-center gap-1 text-[11.5px] font-bold ${r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    <Icono size={13} />{r.delta > 0 ? '+' : ''}{MXN(r.delta)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="h-72 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCompra" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1A5C38" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#1A5C38" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} interval={intervalo} />
            <YAxis domain={dominio} ticks={ticksY} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={56}
              tickFormatter={v => `$${Number(v).toLocaleString('es-MX')}`} />
            <Tooltip content={<TooltipTendencia activas={activas} />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
            {activas.precio_compra && (
              <Area type="monotone" dataKey="precio_compra" stroke="#1A5C38" strokeWidth={2.5} fill="url(#gradCompra)" connectNulls
                dot={{ r: 3.5, fill: '#fff', stroke: '#1A5C38', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            )}
            {activas.margen_negociacion && (
              <Line type="monotone" dataKey="margen_negociacion" stroke="#2563eb" strokeWidth={2} connectNulls
                dot={{ r: 3, fill: '#fff', stroke: '#2563eb', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            )}
            {activas.precio_venta && (
              <Line type="monotone" dataKey="precio_venta" stroke="#d97706" strokeWidth={2} connectNulls
                dot={{ r: 3, fill: '#fff', stroke: '#d97706', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {conDatos < 3 && (
        <p className="text-[12px] text-gray-500 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">
          {conDatos === 0
            ? 'Aún no hay precios publicados en este periodo.'
            : `Solo hay ${conDatos} ${conDatos === 1 ? 'día' : 'días'} con precios publicados en este periodo; la línea de tendencia se irá dibujando conforme las bodegas reporten más días.`}
        </p>
      )}
    </div>
  );
}
