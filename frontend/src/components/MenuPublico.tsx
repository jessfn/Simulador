import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import '../pages/simac-menu.css';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Punto { fecha: string; chicago_usd_bushel: number; tc_fix: number; referencia_mxn_ton: number }
interface Datos {
  fecha: string;
  actualizado_en: string;
  hoy: { referencia_mxn_ton: number; chicago_usd_bushel: number; chicago_usd_ton: number; tc_fix: number };
  cambio_dia: { mxn_ton: number; porcentaje: number };
  rango: { minimo: number; maximo: number; dias: number };
  serie: Punto[];
  fuentes: string[];
  nota: string;
}

type ClaveSerie = 'mxn' | 'chicago' | 'fix';
const SERIES: Record<ClaveSerie, { etiqueta: string; valor: (p: Punto) => number; formato: (v: number) => string }> = {
  mxn: { etiqueta: 'Pesos por ton', valor: p => p.referencia_mxn_ton, formato: v => `$${Math.round(v).toLocaleString('es-MX')}` },
  chicago: { etiqueta: 'Chicago', valor: p => p.chicago_usd_bushel, formato: v => `$${v.toFixed(3)} USD/bu` },
  fix: { etiqueta: 'Dólar FIX', valor: p => p.tc_fix, formato: v => `$${v.toFixed(4)}` },
};
const RANGOS = [7, 15, 30];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]}`; };

/* ---------- Gráfica de línea (SVG propio) ---------- */
function Grafica({ puntos, serie }: { puntos: Punto[]; serie: ClaveSerie }) {
  const W = 340, H = 168, PX = 10, PT = 18, PB = 26;
  const [activo, setActivo] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { valor, formato } = SERIES[serie];

  const geo = useMemo(() => {
    const vals = puntos.map(valor);
    const min = Math.min(...vals), max = Math.max(...vals);
    const margen = (max - min) * 0.18 || max * 0.01 || 1;
    const lo = min - margen, hi = max + margen;
    const xs = (i: number) => PX + (puntos.length === 1 ? (W - 2 * PX) / 2 : (i * (W - 2 * PX)) / (puntos.length - 1));
    const ys = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
    const pts = vals.map((v, i) => [xs(i), ys(v)] as const);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${H - PB} L${pts[0][0].toFixed(1)},${H - PB} Z`;
    return { vals, pts, d, area, min, max };
  }, [puntos, valor]);

  const mover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    let mejor = 0, dist = Infinity;
    geo.pts.forEach((p, i) => { const dd = Math.abs(p[0] - x); if (dd < dist) { dist = dd; mejor = i; } });
    setActivo(mejor);
  };

  const idx = activo ?? puntos.length - 1;
  const [px, py] = geo.pts[idx];
  const lineasY = [0.25, 0.5, 0.75].map(f => PT + f * (H - PT - PB));
  const izq = (px / W) * 100;

  return (
    <div className="sm-grafica">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfica de ${SERIES[serie].etiqueta}`}
        onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setActivo(null)}>
        <defs>
          <linearGradient id="sm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity=".34" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
        </defs>
        {lineasY.map((y, i) => <line key={i} x1={PX} x2={W - PX} y1={y} y2={y} className="sm-malla" />)}
        <path d={geo.area} fill="url(#sm-area)" key={`a-${serie}-${puntos.length}`} className="sm-area" />
        <path d={geo.d} pathLength={1} className="sm-linea" key={`l-${serie}-${puntos.length}`} />
        {activo !== null && <line x1={px} x2={px} y1={PT - 6} y2={H - PB} className="sm-guia" />}
        <circle cx={px} cy={py} r="8" className="sm-halo" />
        <circle cx={px} cy={py} r="4" className="sm-punto" />
        <text x={PX} y={H - 8} className="sm-eje" textAnchor="start">{fechaCorta(puntos[0].fecha)}</text>
        <text x={W / 2} y={H - 8} className="sm-eje" textAnchor="middle">{fechaCorta(puntos[Math.floor((puntos.length - 1) / 2)].fecha)}</text>
        <text x={W - PX} y={H - 8} className="sm-eje" textAnchor="end">{fechaCorta(puntos[puntos.length - 1].fecha)}</text>
      </svg>
      <div className="sm-tip" style={{ left: `${Math.min(86, Math.max(14, izq))}%`, top: `${(py / H) * 100}%` }}>
        <b>{formato(geo.vals[idx])}</b>
        <span>{fechaCorta(puntos[idx].fecha)}</span>
      </div>
    </div>
  );
}

/* ---------- Panel ---------- */
export default function MenuPublico({ onEntrarMaiz }: { onEntrarMaiz: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'error'>('idle');
  const [serie, setSerie] = useState<ClaveSerie>('mxn');
  const [dias, setDias] = useState(30);
  const botonRef = useRef<HTMLButtonElement>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const cargadoEn = useRef(0);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const r = await fetch(`${BASE}/publico/maiz`);
      if (!r.ok) throw new Error('http');
      setDatos(await r.json());
      cargadoEn.current = Date.now();
      setEstado('idle');
    } catch {
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (abierto && (!datos || Date.now() - cargadoEn.current > 5 * 60 * 1000) && estado !== 'cargando') cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const cerrar = useCallback(() => { setAbierto(false); botonRef.current?.focus(); }, []);

  useEffect(() => {
    if (!abierto) return;
    const t = window.setTimeout(() => cerrarRef.current?.focus(), 60);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cerrar(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const foco = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])');
      if (!foco.length) return;
      const primero = foco[0], ultimo = foco[foco.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    window.addEventListener('keydown', tecla);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', tecla); };
  }, [abierto, cerrar]);

  const puntos = useMemo(() => (datos ? datos.serie.slice(-dias) : []), [datos, dias]);
  const resumen = useMemo(() => {
    if (!puntos.length) return null;
    const v = puntos.map(SERIES[serie].valor);
    return { min: Math.min(...v), max: Math.max(...v), prom: v.reduce((a, b) => a + b, 0) / v.length };
  }, [puntos, serie]);

  const cambio = datos?.cambio_dia;
  const sube = (cambio?.mxn_ton ?? 0) > 0, baja = (cambio?.mxn_ton ?? 0) < 0;
  const actualizado = datos ? new Date(datos.actualizado_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <>
      <button ref={botonRef} className={`sm-btn${abierto ? ' abierto' : ''}`} onClick={() => setAbierto(v => !v)}
        aria-label={abierto ? 'Cerrar menú' : 'Abrir menú de información'} aria-expanded={abierto} aria-controls="sm-panel">
        <span className="barras" aria-hidden="true"><i /><i /><i /></span>
      </button>

      <div className={`sm-capa${abierto ? ' abierto' : ''}`} aria-hidden={!abierto}>
        <div className="sm-fondo" onClick={cerrar} />
        <aside id="sm-panel" ref={panelRef} className="sm-panel" role="dialog" aria-modal="true" aria-label="Información pública">
          <header className="sm-cab">
            <div>
              <p className="sm-eyebrow">SIMAC</p>
              <h2>Información pública</h2>
            </div>
            <button ref={cerrarRef} className="sm-cerrar" onClick={cerrar} aria-label="Cerrar menú" tabIndex={abierto ? 0 : -1}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div className="sm-cuerpo">
            <section className="sm-cultivo">
              <div className="sm-cultivo-cab">
                <img src="/images/maiz-icono.png" alt="" />
                <h3>Maíz</h3>
                {datos && <span className="sm-fecha">Hoy · {fechaCorta(datos.fecha)}</span>}
              </div>

              {estado === 'cargando' && !datos && (
                <div className="sm-esqueleto" aria-busy="true"><i /><i /><i /></div>
              )}
              {estado === 'error' && !datos && (
                <div className="sm-error">
                  <p>No pudimos cargar la información en este momento.</p>
                  <button onClick={cargar} tabIndex={abierto ? 0 : -1}>Reintentar</button>
                </div>
              )}

              {datos && resumen && (
                <>
                  <div className="sm-precio">
                    <p className="sm-etq">Referencia internacional del maíz hoy</p>
                    <div className="sm-precio-fila">
                      <span className="sm-num">${datos.hoy.referencia_mxn_ton.toLocaleString('es-MX')}</span>
                      <span className="sm-unidad">MXN por tonelada</span>
                    </div>
                    <span className={`sm-cambio${sube ? ' sube' : baja ? ' baja' : ''}`}>
                      {sube ? '▲' : baja ? '▼' : '■'} {cambio!.mxn_ton > 0 ? '+' : ''}{cambio!.mxn_ton.toLocaleString('es-MX')} ({cambio!.porcentaje > 0 ? '+' : ''}{cambio!.porcentaje}%) vs. el día anterior
                    </span>
                  </div>

                  <div className="sm-tarjeta">
                    <div className="sm-controles">
                      <div className="sm-seg" role="tablist" aria-label="Indicador">
                        {(Object.keys(SERIES) as ClaveSerie[]).map(k => (
                          <button key={k} role="tab" aria-selected={serie === k} className={serie === k ? 'on' : ''} onClick={() => setSerie(k)} tabIndex={abierto ? 0 : -1}>{SERIES[k].etiqueta}</button>
                        ))}
                      </div>
                      <div className="sm-seg chico" role="tablist" aria-label="Periodo">
                        {RANGOS.map(r => (
                          <button key={r} role="tab" aria-selected={dias === r} className={dias === r ? 'on' : ''} onClick={() => setDias(r)} tabIndex={abierto ? 0 : -1}>{r} d</button>
                        ))}
                      </div>
                    </div>
                    <Grafica puntos={puntos} serie={serie} />
                    <div className="sm-stats">
                      <div><span>Mínimo</span><b>{SERIES[serie].formato(resumen.min)}</b></div>
                      <div><span>Promedio</span><b>{SERIES[serie].formato(resumen.prom)}</b></div>
                      <div><span>Máximo</span><b>{SERIES[serie].formato(resumen.max)}</b></div>
                    </div>
                  </div>

                  <div className="sm-tiles">
                    <div><span>Futuro en Chicago</span><b>${datos.hoy.chicago_usd_bushel.toFixed(2)}</b><small>USD por bushel</small></div>
                    <div><span>Equivale a</span><b>${datos.hoy.chicago_usd_ton.toFixed(1)}</b><small>USD por tonelada</small></div>
                    <div><span>Dólar FIX</span><b>${datos.hoy.tc_fix.toFixed(4)}</b><small>pesos por dólar</small></div>
                  </div>

                  <p className="sm-nota">{datos.nota}</p>
                  <p className="sm-fuentes">Actualizado: {actualizado}. Fuentes: {datos.fuentes.join(' y ')}.</p>
                </>
              )}

              <button className="sm-entrar" onClick={() => { setAbierto(false); onEntrarMaiz(); }} tabIndex={abierto ? 0 : -1}>
                Entrar a Maíz
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </section>

            <section className="sm-proximos">
              <h4>Próximamente</h4>
              {['Frijol', 'Trigo'].map(n => (
                <div key={n} className="sm-prox">
                  <span>{n}</span>
                  <em><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>Pronto</em>
                </div>
              ))}
            </section>

            <p className="sm-acerca"><b>SIMAC</b> es el Sistema de Información de Mercados Agrícolas y Consulta de la Secretaría de Agricultura y Desarrollo Rural.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
