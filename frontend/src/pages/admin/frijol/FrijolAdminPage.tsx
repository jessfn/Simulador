import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Download, Loader2, ChevronLeft, ChevronRight, Users, Layers, Sprout, AlertTriangle, WifiOff, Scale, Clock, SlidersHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../../../services/api';
import { usePermisosStore } from '../../../store/permisos';
import { COLOR_ESTATUS, Estado, claveEstatus, fmtNum, fmtFecha } from './compartido';

type Pestana = 'resumen' | 'registros' | 'mapa';
const CLAVES = ['q', 'estado', 'municipio', 'tecnico', 'tipo_tecnico', 'ciclo', 'variedad', 'verificacion', 'estatus', 'destino', 'semillas', 'pendiente14', 'desde', 'hasta'] as const;
type Filtros = Record<(typeof CLAVES)[number], string>;
const SIN_FILTROS = Object.fromEntries(CLAVES.map(k => [k, ''])) as Filtros;

function Tarjeta({ icono, valor, titulo, tono = 'text-slate-900', alTocar, activa }: { icono: React.ReactNode; valor: string; titulo: string; tono?: string; alTocar?: () => void; activa?: boolean }) {
  const cuerpo = (
    <>
      <div className="w-11 h-11 rounded-xl bg-[#eef8f2] text-[#1A5C38] flex items-center justify-center flex-shrink-0">{icono}</div>
      <div className="min-w-0 text-left"><p className={`text-[24px] font-bold leading-none ${tono}`}>{valor}</p><p className="text-[12.5px] text-slate-500 mt-1.5">{titulo}</p></div>
    </>
  );
  const base = `bg-white rounded-2xl border p-4 flex items-center gap-3.5 ${activa ? 'border-[#1A5C38] ring-2 ring-[#1A5C38]/20' : 'border-slate-200'}`;
  return alTocar ? <button onClick={alTocar} aria-pressed={!!activa} className={`${base} w-full hover:border-[#1A5C38]/50 transition`}>{cuerpo}</button> : <div className={base}>{cuerpo}</div>;
}

function Barras({ titulo, filas, etiqueta, valor, unidad }: { titulo: string; filas: any[]; etiqueta: string; valor: string; unidad: string }) {
  const max = Math.max(1, ...filas.map(f => Number(f[valor]) || 0));
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="text-[14px] font-bold text-slate-800 mb-3">{titulo}</h3>
      {filas.length === 0 ? <p className="text-[13px] text-slate-400 py-4 text-center">Sin datos con estos filtros</p> : (
        <ul className="space-y-2.5">
          {filas.map((f, i) => (
            <li key={i}>
              <div className="flex justify-between text-[12.5px] gap-3"><span className="text-slate-700 break-words min-w-0">{f[etiqueta]}</span><span className="font-semibold text-slate-900 whitespace-nowrap">{fmtNum(f[valor])} {unidad}</span></div>
              <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden"><div className="h-full rounded-full bg-[#1A5C38]" style={{ width: `${(Number(f[valor]) / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ajustar({ datos }: { datos: any }) {
  const map = useMap();
  useEffect(() => {
    if (!datos?.features?.length) return;
    try { const b = L.geoJSON(datos).getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 14 }); } catch { /* sin geometría válida */ }
  }, [datos, map]);
  return null;
}

const COLUMNAS: Array<{ t: string; orden?: string }> = [
  { t: 'Productor', orden: 'productor' }, { t: 'CURP' }, { t: 'Estado', orden: 'estado' }, { t: 'Municipio' }, { t: 'Localidad' }, { t: 'ID parcela' }, { t: 'Parcela' },
  { t: 'Sup. parcela (ha)' }, { t: 'Ciclo', orden: 'ciclo' }, { t: 'Variedad', orden: 'variedad' }, { t: 'Ha sembradas', orden: 'ha' }, { t: 'Rend. esperado (t/ha)' },
  { t: 'Producción est. (t)', orden: 'produccion' }, { t: 'Destino' }, { t: 'Técnico' }, { t: 'Verificación' }, { t: 'Estatus' }, { t: 'Registro', orden: 'fecha' },
];

export default function FrijolAdminPage() {
  const navigate = useNavigate();
  const puedo = usePermisosStore(s => s.puedo);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [aplicados, setAplicados] = useState<Filtros>(SIN_FILTROS);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [opciones, setOpciones] = useState<any>({ estados: [], municipios: [], tecnicos: [], ciclos: [], variedades: [], destinos: [], tipos_tecnico: [] });
  const [resumen, setResumen] = useState<any>(null);
  const [lista, setLista] = useState<any>(null);
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState({ campo: 'fecha', dir: 'desc' });
  const [mapa, setMapa] = useState<any>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const consulta = useMemo(() => Object.fromEntries(Object.entries(aplicados).filter(([, v]) => v)) as Record<string, string>, [aplicados]);
  const hayFiltros = Object.keys(consulta).length > 0;

  useEffect(() => { api.admin.frijol.filtros(filtros.estado).then(setOpciones).catch(() => {}); }, [filtros.estado]);
  useEffect(() => { api.admin.frijol.resumen(consulta).then(setResumen).catch(() => setError('No se pudo cargar el resumen.')); }, [consulta]);

  const cargarLista = useCallback(async () => {
    setCargando(true); setError('');
    try { setLista(await api.admin.frijol.registros({ ...consulta, pagina, orden: orden.campo, dir: orden.dir })); }
    catch { setError('No se pudieron cargar los registros.'); }
    finally { setCargando(false); }
  }, [consulta, pagina, orden]);
  useEffect(() => { if (pestana === 'registros') void cargarLista(); }, [pestana, cargarLista]);
  useEffect(() => {
    if (pestana !== 'mapa') return;
    setCargando(true);
    api.admin.frijol.mapa(consulta).then(setMapa).catch(() => setError('No se pudo cargar el mapa.')).finally(() => setCargando(false));
  }, [pestana, consulta]);

  const aplicar = (f: Filtros = filtros) => { setPagina(1); setFiltros(f); setAplicados(f); };
  const limpiar = () => aplicar(SIN_FILTROS);
  function porTarjeta(parche: Partial<Filtros>, destino: Pestana = 'registros') {
    aplicar({ ...SIN_FILTROS, ...parche }); setPestana(destino);
  }
  function ordenarPor(campo: string) { setPagina(1); setOrden(o => ({ campo, dir: o.campo === campo && o.dir === 'desc' ? 'asc' : 'desc' })); }

  async function exportar() {
    setExportando(true); setError('');
    try {
      const blob = await api.admin.frijol.exportar(consulta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `frijol_registros_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e?.message || 'No se pudo exportar.'); }
    finally { setExportando(false); }
  }

  const t = resumen?.totales;
  const campo = 'min-h-[40px] w-full bg-white border border-slate-200 rounded-xl px-3 text-[13.5px] outline-none focus:border-[#1A5C38]';
  const Etiqueta = ({ children }: { children: React.ReactNode }) => <span className="block text-[11.5px] font-bold uppercase tracking-wide text-slate-400 mb-1">{children}</span>;
  const Sel = ({ k, label, todos, items }: { k: keyof Filtros; label: string; todos: string; items: Array<[string, string]> }) => (
    <label className="block"><Etiqueta>{label}</Etiqueta>
      <select value={filtros[k]} onChange={e => setFiltros({ ...filtros, [k]: e.target.value, ...(k === 'estado' ? { municipio: '' } : {}) })} aria-label={label} className={campo}>
        <option value="">{todos}</option>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  const panel = (
    <aside className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 self-start">
      <label className="block"><Etiqueta>Buscar</Etiqueta>
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={filtros.q} onChange={e => setFiltros({ ...filtros, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && aplicar()} placeholder="Nombre o CURP" aria-label="Buscar por nombre o CURP" className={`${campo} pl-9`} /></div></label>
      <Sel k="estado" label="Estado" todos="Todos" items={opciones.estados.map((e: any) => [e.state_id, e.state_name])} />
      <Sel k="municipio" label="Municipio" todos="Todos" items={opciones.municipios.map((m: any) => [m.municipality_id, m.municipality_name])} />
      <Sel k="tecnico" label="Técnico" todos="Todos" items={opciones.tecnicos.map((x: any) => [String(x.id), x.nombre_completo])} />
      <Sel k="tipo_tecnico" label="Tipo de técnico" todos="Todos" items={opciones.tipos_tecnico.map((x: any) => [x.code, x.label])} />
      <Sel k="ciclo" label="Ciclo" todos="Todos" items={opciones.ciclos.map((c: string) => [c, c])} />
      <Sel k="variedad" label="Variedad" todos="Todas" items={opciones.variedades.map((x: any) => [x.code, x.label])} />
      <Sel k="verificacion" label="Verificación de identidad" todos="Todas" items={[['verificada', 'Verificada'], ['pendiente', 'Pendiente'], ['no_valida', 'No válida']]} />
      <Sel k="estatus" label="Estatus del registro" todos="Todos" items={[['enviado', 'Enviado'], ['requiere_correccion', 'Requiere corrección'], ['validado', 'Validado']]} />
      <Sel k="destino" label="Destino" todos="Todos" items={opciones.destinos.map((x: any) => [x.code, x.label])} />
      <Sel k="semillas" label="Cumple criterio de semillas" todos="Todos" items={[['si', 'Sí cumple'], ['no', 'No cumple']]} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><Etiqueta>Desde</Etiqueta><input type="date" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} aria-label="Registrados desde" className={campo} /></label>
        <label className="block"><Etiqueta>Hasta</Etiqueta><input type="date" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} aria-label="Registrados hasta" className={campo} /></label>
      </div>
      {filtros.pendiente14 === '1' && <p className="text-[12.5px] text-amber-800 bg-amber-50 rounded-lg px-3 py-2">Mostrando solo pendientes de verificar desde hace más de 14 días.</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={() => aplicar()} className="flex-1 min-h-[42px] rounded-xl bg-[#1A5C38] text-white text-[13.5px] font-bold">Filtrar</button>
        <button onClick={limpiar} className="min-h-[42px] px-3 rounded-xl bg-slate-100 text-slate-600 text-[13.5px] font-bold">Limpiar</button>
      </div>
    </aside>
  );

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div role="tablist" className="inline-flex bg-slate-100 rounded-xl p-1">
          {(['resumen', 'registros', 'mapa'] as Pestana[]).map(p => (
            <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
              className={`px-4 min-h-[38px] rounded-lg text-[13.5px] font-bold capitalize ${pestana === p ? 'bg-white text-[#1A5C38] shadow-sm' : 'text-slate-500'}`}>{p}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPanelAbierto(o => !o)} className="lg:hidden min-h-[40px] px-4 rounded-xl bg-white border border-slate-200 text-slate-700 text-[13.5px] font-bold flex items-center gap-2">
            <SlidersHorizontal size={15} /> Filtros{hayFiltros ? ` (${Object.keys(consulta).length})` : ''}
          </button>
          {puedo('frijol', 'exportar') && (
            <button onClick={exportar} disabled={exportando} className="min-h-[40px] px-4 rounded-xl bg-[#1A5C38] text-white text-[13.5px] font-bold flex items-center gap-2 disabled:opacity-60">
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Exportar a Excel
            </button>
          )}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13.5px] px-4 py-3">{error}</div>}
      {hayFiltros && <p className="text-[12.5px] text-slate-500">Filtros aplicados en las tarjetas, la tabla, el mapa y el Excel. <button onClick={limpiar} className="text-[#1A5C38] font-bold underline">Quitar filtros</button></p>}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr] items-start">
        <div className={`${panelAbierto ? 'block' : 'hidden'} lg:block`}>{panel}</div>
        <div className="min-w-0 space-y-5">
          {pestana === 'resumen' && (!resumen ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#1A5C38]" size={28} /></div> : (
            <>
              <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                <Tarjeta icono={<Users size={20} />} valor={fmtNum(t.productores, 0)} titulo="Productores" />
                <Tarjeta icono={<Layers size={20} />} valor={fmtNum(t.parcelas, 0)} titulo="Parcelas" />
                <Tarjeta icono={<Sprout size={20} />} valor={fmtNum(t.hectareas, 1)} titulo="Hectáreas sembradas" />
                <Tarjeta icono={<Scale size={20} />} valor={`${fmtNum(t.produccion_estimada_t, 1)} t`} titulo="Producción estimada" />
                <Tarjeta icono={<Clock size={20} />} valor={fmtNum(t.por_verificar, 0)} titulo="Pendientes de verificar" tono="text-amber-700" alTocar={() => porTarjeta({ verificacion: 'pendiente' })} activa={aplicados.verificacion === 'pendiente' && !aplicados.pendiente14} />
                <Tarjeta icono={<Clock size={20} />} valor={fmtNum(t.pendientes_14_dias, 0)} titulo="Pendientes más de 14 días" tono="text-amber-700" alTocar={() => porTarjeta({ verificacion: 'pendiente', pendiente14: '1' })} activa={aplicados.pendiente14 === '1'} />
                <Tarjeta icono={<AlertTriangle size={20} />} valor={fmtNum(t.por_corregir, 0)} titulo="Requieren corrección" tono="text-red-700" alTocar={() => porTarjeta({ estatus: 'requiere_correccion' })} activa={aplicados.estatus === 'requiere_correccion'} />
                <Tarjeta icono={<WifiOff size={20} />} valor={fmtNum(t.capturados_sin_senal, 0)} titulo="Capturados sin señal" />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <Barras titulo="Hectáreas por estado" filas={resumen.por_estado} etiqueta="estado" valor="hectareas" unidad="ha" />
                <Barras titulo="Productores por técnico" filas={resumen.por_tecnico} etiqueta="tecnico" valor="productores" unidad="prod." />
                <Barras titulo="Hectáreas por variedad" filas={resumen.por_variedad} etiqueta="variedad" valor="hectareas" unidad="ha" />
                <Barras titulo="Registros por ciclo" filas={resumen.por_ciclo} etiqueta="ciclo" valor="cultivos" unidad="cultivos" />
              </div>
              <Barras titulo="Altas de los últimos 30 días" filas={resumen.por_dia} etiqueta="dia" valor="registros" unidad="" />
            </>
          ))}

          {pestana === 'registros' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-slate-50 text-slate-500 text-left text-[11.5px] uppercase tracking-wide">
                    <tr>{COLUMNAS.map(c => (
                      <th key={c.t} className="px-3 py-2.5 font-bold whitespace-nowrap" aria-sort={c.orden && orden.campo === c.orden ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {c.orden ? <button onClick={() => ordenarPor(c.orden!)} className="inline-flex items-center gap-1 uppercase font-bold hover:text-[#1A5C38]">{c.t}{orden.campo === c.orden && (orden.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}</button> : c.t}
                      </th>))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cargando && !lista && <tr><td colSpan={COLUMNAS.length} className="py-14 text-center"><Loader2 className="animate-spin inline text-[#1A5C38]" /></td></tr>}
                    {lista?.registros.length === 0 && <tr><td colSpan={COLUMNAS.length} className="py-14 text-center text-slate-400">Ningún registro coincide con los filtros.</td></tr>}
                    {lista?.registros.map((r: any) => (
                      <tr key={r.cycle_crop_id} onClick={() => navigate(`/maiz/admin/frijol/productor/${r.producer_id}`)} className="hover:bg-[#f4faf6] cursor-pointer">
                        <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{r.productor}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px] text-slate-600">{r.curp}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.estado || '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.municipio || '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.localidad || '—'}</td>
                        <td className="px-3 py-2.5">{r.up_id}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.numero_up && r.total_ups_declaradas ? `${r.numero_up} de ${r.total_ups_declaradas}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right">{r.ha_parcela != null ? fmtNum(r.ha_parcela, 2) : '—'}</td>
                        <td className="px-3 py-2.5">{r.ciclo}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.variedad}</td>
                        <td className="px-3 py-2.5 text-right">{fmtNum(r.ha_sembradas, 2)}</td>
                        <td className="px-3 py-2.5 text-right">{r.rendimiento_esperado_t_ha != null ? fmtNum(r.rendimiento_esperado_t_ha, 2) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{r.produccion_estimada_t != null ? fmtNum(r.produccion_estimada_t, 2) : '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.destino || '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.tecnico || '—'}</td>
                        <td className="px-3 py-2.5"><Estado v={r.verificacion_identidad} e="enviado" dias={r.dias_pendiente} /></td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{r.estatus_registro === 'requiere_correccion' ? 'Requiere corrección' : r.estatus_registro === 'validado' ? 'Validado' : 'Enviado'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{fmtFecha(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lista && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-[13px] text-slate-600">
                  <span>{fmtNum(lista.total, 0)} registro{lista.total === 1 ? '' : 's'}</span>
                  <div className="flex items-center gap-2">
                    <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} aria-label="Página anterior" className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40"><ChevronLeft size={16} /></button>
                    <span>Página {lista.pagina} de {lista.paginas}</span>
                    <button disabled={pagina >= lista.paginas} onClick={() => setPagina(p => p + 1)} aria-label="Página siguiente" className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          )}

          {pestana === 'mapa' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-slate-600">
                {([['verde', 'Verificada'], ['ambar', 'Por verificar'], ['rojo', 'Requiere corrección']] as const).map(([k, l]) => (
                  <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: COLOR_ESTATUS[k] }} />{l}</span>
                ))}
                {mapa && <span className="text-slate-400">{fmtNum(mapa.features.length, 0)} parcelas</span>}
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden relative" style={{ height: '62vh', minHeight: 360 }}>
                {cargando && <div className="absolute inset-0 z-[500] bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-[#1A5C38]" size={26} /></div>}
                <MapContainer center={[23.6, -102.5]} zoom={5} style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {mapa && <GeoJSON key={JSON.stringify(consulta) + (mapa.features?.length ?? 0)} data={mapa}
                    style={f => { const c = COLOR_ESTATUS[claveEstatus((f?.properties as any).verificacion, (f?.properties as any).estatus)]; return { color: c, weight: 2, fillColor: c, fillOpacity: 0.35 }; }}
                    onEachFeature={(f, layer) => {
                      const p = f.properties as any;
                      const esc = (x: unknown) => String(x ?? '').replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch] as string));
                      const cont = document.createElement('div');
                      cont.innerHTML = `<strong>${esc(p.productor)}</strong><br/>${esc(p.nombre)}<br/>${esc([p.municipio, p.estado].filter(Boolean).join(', '))}<br/>${esc(p.variedad)} · ${fmtNum(p.ha_sembradas, 2)} ha sembradas<br/>`;
                      const enlace = document.createElement('a'); enlace.href = '#'; enlace.textContent = 'Ver detalle'; enlace.style.cssText = 'color:#1A5C38;font-weight:700';
                      enlace.onclick = ev => { ev.preventDefault(); navigate(`/maiz/admin/frijol/productor/${p.producer_id}`); };
                      cont.appendChild(enlace); layer.bindPopup(cont);
                    }} />}
                  <Ajustar datos={mapa} />
                </MapContainer>
                {mapa && mapa.features.length === 0 && !cargando && <div className="absolute inset-x-0 top-4 z-[500] mx-auto w-fit bg-white rounded-xl shadow px-4 py-2 text-[13px] text-slate-600">No hay parcelas con esos filtros.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
