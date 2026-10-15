import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Download, Loader2, X, ChevronLeft, ChevronRight, Users, Layers, Sprout, AlertTriangle, WifiOff, ShieldCheck } from 'lucide-react';
import { api } from '../../../services/api';
import { usePermisosStore } from '../../../store/permisos';

type Pestana = 'resumen' | 'registros' | 'mapa';
interface Filtros { q: string; estado: string; verificacion: string; tecnico: string; ciclo: string; desde: string; hasta: string }
const SIN_FILTROS: Filtros = { q: '', estado: '', verificacion: '', tecnico: '', ciclo: '', desde: '', hasta: '' };

const fmtNum = (n: number | null | undefined, d = 1) => (n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: d });
const fmtFecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function Estado({ v, e }: { v: string; e: string }) {
  if (e === 'requiere_correccion' || v === 'no_valida') return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 whitespace-nowrap">Requiere corrección</span>;
  if (v === 'pendiente') return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">Por verificar</span>;
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">Verificada</span>;
}

function Tarjeta({ icono, valor, titulo, tono = 'text-slate-900' }: { icono: React.ReactNode; valor: string; titulo: string; tono?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3.5">
      <div className="w-11 h-11 rounded-xl bg-[#eef8f2] text-[#1A5C38] flex items-center justify-center flex-shrink-0">{icono}</div>
      <div className="min-w-0"><p className={`text-[24px] font-bold leading-none ${tono}`}>{valor}</p><p className="text-[12.5px] text-slate-500 mt-1.5">{titulo}</p></div>
    </div>
  );
}

function Barras({ titulo, filas, etiqueta, valor, unidad }: { titulo: string; filas: any[]; etiqueta: string; valor: string; unidad: string }) {
  const max = Math.max(1, ...filas.map(f => Number(f[valor]) || 0));
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4">
      <h3 className="text-[14px] font-bold text-slate-800 mb-3">{titulo}</h3>
      {filas.length === 0 ? <p className="text-[13px] text-slate-400 py-4 text-center">Sin datos todavía</p> : (
        <ul className="space-y-2.5">
          {filas.map((f, i) => (
            <li key={i}>
              <div className="flex justify-between text-[12.5px] gap-3"><span className="text-slate-700 truncate">{f[etiqueta]}</span><span className="font-semibold text-slate-900 whitespace-nowrap">{fmtNum(f[valor])} {unidad}</span></div>
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

export default function FrijolAdminPage() {
  const puedo = usePermisosStore(s => s.puedo);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [aplicados, setAplicados] = useState<Filtros>(SIN_FILTROS);
  const [opciones, setOpciones] = useState<{ estados: any[]; tecnicos: any[]; ciclos: string[] }>({ estados: [], tecnicos: [], ciclos: [] });
  const [resumen, setResumen] = useState<any>(null);
  const [lista, setLista] = useState<any>(null);
  const [pagina, setPagina] = useState(1);
  const [mapa, setMapa] = useState<any>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ficha, setFicha] = useState<any>(null);
  const [exportando, setExportando] = useState(false);

  const consulta = useMemo(() => Object.fromEntries(Object.entries(aplicados).filter(([, v]) => v)) as Record<string, string>, [aplicados]);

  useEffect(() => {
    api.admin.frijol.filtros().then(setOpciones).catch(() => {});
    api.admin.frijol.resumen().then(setResumen).catch(() => setError('No se pudo cargar el resumen.'));
  }, []);

  const cargarLista = useCallback(async () => {
    setCargando(true); setError('');
    try { setLista(await api.admin.frijol.registros({ ...consulta, pagina })); }
    catch { setError('No se pudieron cargar los registros.'); }
    finally { setCargando(false); }
  }, [consulta, pagina]);
  useEffect(() => { if (pestana === 'registros') void cargarLista(); }, [pestana, cargarLista]);
  useEffect(() => {
    if (pestana !== 'mapa') return;
    setCargando(true);
    api.admin.frijol.mapa(consulta).then(setMapa).catch(() => setError('No se pudo cargar el mapa.')).finally(() => setCargando(false));
  }, [pestana, consulta]);

  function aplicar() { setPagina(1); setAplicados(filtros); }
  function limpiar() { setPagina(1); setFiltros(SIN_FILTROS); setAplicados(SIN_FILTROS); }

  async function abrirFicha(id: number) {
    setFicha({ cargando: true });
    try { setFicha(await api.admin.frijol.productor(id)); } catch { setFicha(null); setError('No se pudo abrir la ficha del productor.'); }
  }

  async function exportar() {
    setExportando(true); setError('');
    try {
      const blob = await api.admin.frijol.exportar(consulta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `frijol_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { setError(e?.message || 'No se pudo exportar.'); }
    finally { setExportando(false); }
  }

  const t = resumen?.totales;
  const campo = 'min-h-[40px] bg-white border border-slate-200 rounded-xl px-3 text-[13.5px] outline-none focus:border-[#1A5C38]';

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div role="tablist" className="inline-flex bg-slate-100 rounded-xl p-1">
          {(['resumen', 'registros', 'mapa'] as Pestana[]).map(p => (
            <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
              className={`px-4 min-h-[38px] rounded-lg text-[13.5px] font-bold capitalize ${pestana === p ? 'bg-white text-[#1A5C38] shadow-sm' : 'text-slate-500'}`}>{p}</button>
          ))}
        </div>
        {puedo('frijol', 'exportar') && (
          <button onClick={exportar} disabled={exportando} className="min-h-[40px] px-4 rounded-xl bg-[#1A5C38] text-white text-[13.5px] font-bold flex items-center gap-2 disabled:opacity-60">
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Exportar a Excel
          </button>
        )}
      </div>

      {pestana !== 'resumen' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 grid gap-2.5 grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="relative col-span-2 xl:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={filtros.q} onChange={e => setFiltros({ ...filtros, q: e.target.value })} onKeyDown={e => e.key === 'Enter' && aplicar()} placeholder="Nombre o CURP" aria-label="Buscar por nombre o CURP" className={`${campo} w-full pl-9`} />
          </div>
          <select value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value })} aria-label="Estado" className={campo}>
            <option value="">Todos los estados</option>{opciones.estados.map(e => <option key={e.state_id} value={e.state_id}>{e.state_name}</option>)}
          </select>
          <select value={filtros.verificacion} onChange={e => setFiltros({ ...filtros, verificacion: e.target.value })} aria-label="Verificación" className={campo}>
            <option value="">Toda verificación</option><option value="verificada">Verificada</option><option value="pendiente">Por verificar</option><option value="no_valida">No válida</option>
          </select>
          <select value={filtros.tecnico} onChange={e => setFiltros({ ...filtros, tecnico: e.target.value })} aria-label="Técnico" className={campo}>
            <option value="">Todos los técnicos</option>{opciones.tecnicos.map(x => <option key={x.id} value={x.id}>{x.nombre_completo}</option>)}
          </select>
          <select value={filtros.ciclo} onChange={e => setFiltros({ ...filtros, ciclo: e.target.value })} aria-label="Ciclo" className={campo}>
            <option value="">Todos los ciclos</option>{opciones.ciclos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="date" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} aria-label="Registrados desde" className={campo} />
          <input type="date" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} aria-label="Registrados hasta" className={campo} />
          <div className="flex gap-2 col-span-2 lg:col-span-1">
            <button onClick={aplicar} className="flex-1 min-h-[40px] rounded-xl bg-[#1A5C38] text-white text-[13.5px] font-bold">Filtrar</button>
            <button onClick={limpiar} className="min-h-[40px] px-3 rounded-xl bg-slate-100 text-slate-600 text-[13.5px] font-bold">Limpiar</button>
          </div>
        </div>
      )}

      {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13.5px] px-4 py-3">{error}</div>}

      {pestana === 'resumen' && (!resumen ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#1A5C38]" size={28} /></div> : (
        <>
          <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
            <Tarjeta icono={<Users size={20} />} valor={fmtNum(t.productores, 0)} titulo="Productores registrados" />
            <Tarjeta icono={<Layers size={20} />} valor={fmtNum(t.parcelas, 0)} titulo="Parcelas" />
            <Tarjeta icono={<Sprout size={20} />} valor={fmtNum(t.hectareas, 1)} titulo="Hectáreas sembradas" />
            <Tarjeta icono={<ShieldCheck size={20} />} valor={fmtNum(t.cultivos, 0)} titulo="Cultivos registrados" />
            <Tarjeta icono={<AlertTriangle size={20} />} valor={fmtNum(t.por_verificar, 0)} titulo="Identidad por verificar" tono="text-amber-700" />
            <Tarjeta icono={<AlertTriangle size={20} />} valor={fmtNum(t.por_corregir, 0)} titulo="Requieren corrección" tono="text-red-700" />
            <Tarjeta icono={<Sprout size={20} />} valor={fmtNum(t.cumplen_criterio_semillas, 0)} titulo="Cumplen criterio de semillas" />
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
                <tr>{['Productor', 'CURP', 'Parcela', 'Ubicación', 'Ciclo', 'Variedad', 'Ha', 'Técnico', 'Estado', 'Registro'].map(h => <th key={h} className="px-3 py-2.5 font-bold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cargando && !lista && <tr><td colSpan={10} className="py-14 text-center"><Loader2 className="animate-spin inline text-[#1A5C38]" /></td></tr>}
                {lista?.registros.length === 0 && <tr><td colSpan={10} className="py-14 text-center text-slate-400">Ningún registro coincide con los filtros.</td></tr>}
                {lista?.registros.map((r: any) => (
                  <tr key={r.cycle_crop_id} onClick={() => abrirFicha(r.producer_id)} className="hover:bg-[#f4faf6] cursor-pointer">
                    <td className="px-3 py-2.5 font-semibold text-slate-900 whitespace-nowrap">{r.productor}</td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-slate-600">{r.curp}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.up_name} <span className="text-slate-400">#{r.up_id}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{[r.municipio, r.estado].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5">{r.ciclo}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.variedad}</td>
                    <td className="px-3 py-2.5 text-right">{fmtNum(r.ha_sembradas, 2)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.tecnico || '—'}</td>
                    <td className="px-3 py-2.5"><Estado v={r.verificacion_identidad} e={r.estatus_registro} /></td>
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
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden relative" style={{ height: '65vh', minHeight: 360 }}>
          {cargando && <div className="absolute inset-0 z-[500] bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-[#1A5C38]" size={26} /></div>}
          <MapContainer center={[23.6, -102.5]} zoom={5} style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {mapa && <GeoJSON key={JSON.stringify(consulta) + (mapa.features?.length ?? 0)} data={mapa}
              style={() => ({ color: '#1A5C38', weight: 2, fillColor: '#2f9e5f', fillOpacity: 0.35 })}
              onEachFeature={(f, layer) => {
                const p = f.properties as any;
                layer.bindPopup(`<strong>${String(p.nombre).replace(/</g, '&lt;')}</strong><br/>${String(p.productor).replace(/</g, '&lt;')}<br/>${[p.municipio, p.estado].filter(Boolean).join(', ')}<br/>${fmtNum(p.ha, 2)} ha`);
              }} />}
            <Ajustar datos={mapa} />
          </MapContainer>
          {mapa && mapa.features.length === 0 && !cargando && <div className="absolute inset-x-0 top-4 z-[500] mx-auto w-fit bg-white rounded-xl shadow px-4 py-2 text-[13px] text-slate-600">No hay parcelas con esos filtros.</div>}
        </div>
      )}

      {ficha && createPortal(
        <div className="fixed inset-0 z-[10000] flex justify-end" role="dialog" aria-modal="true" aria-label="Ficha del productor">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFicha(null)} />
          <aside className="relative bg-white w-full max-w-xl h-full overflow-y-auto p-5 space-y-5">
            <button onClick={() => setFicha(null)} aria-label="Cerrar" className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><X size={17} /></button>
            {ficha.cargando ? <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#1A5C38]" size={26} /></div> : (
              <>
                <header className="pr-10">
                  <h2 className="text-[20px] font-bold text-slate-900">{[ficha.nombres, ficha.apellido_paterno, ficha.apellido_materno].filter(Boolean).join(' ')}</h2>
                  <p className="font-mono text-[12.5px] text-slate-500 mt-0.5">{ficha.curp}</p>
                  <div className="mt-2"><Estado v={ficha.verificacion_identidad} e={ficha.estatus_registro} /></div>
                </header>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                  {[['Teléfono', ficha.telefono], ['Correo', ficha.correo], ['Nacimiento', ficha.fecha_nacimiento], ['Sexo', ficha.sexo === 'H' ? 'Hombre' : ficha.sexo === 'M' ? 'Mujer' : null],
                    ['Ubicación', [ficha.localidad, ficha.municipio, ficha.estado].filter(Boolean).join(', ')], ['Técnico', ficha.tecnico], ['Alta', fmtFecha(ficha.fecha_alta)],
                    ['Parcelas declaradas', ficha.total_ups_declaradas], ['Organización', ficha.organizacion], ['Seguro agrícola', ficha.seguro_agricola],
                    ['Programas de la Secretaría', ficha.participa_programas_sader ? (ficha.programas_sader || []).join(', ') : 'No participa']].map(([k, v]) => (
                    <div key={String(k)}><dt className="text-slate-400 text-[11.5px] uppercase tracking-wide">{k}</dt><dd className="text-slate-800 font-medium">{v ?? '—'}</dd></div>
                  ))}
                </dl>
                <section>
                  <h3 className="text-[14px] font-bold text-slate-800 mb-2">Parcelas ({ficha.parcelas.length})</h3>
                  <ul className="space-y-2">{ficha.parcelas.map((p: any) => (
                    <li key={p.up_id} className="rounded-xl border border-slate-200 p-3 text-[13px]">
                      <p className="font-semibold text-slate-900">{p.up_name} <span className="text-slate-400 font-normal">#{p.up_id}</span></p>
                      <p className="text-slate-600">{[p.localidad, p.municipio, p.estado].filter(Boolean).join(', ')} · {fmtNum(p.ha, 2)} ha · {p.water_regime}</p>
                      <p className="text-slate-500 text-[12px]">Criterio de semillas: {p.cumple_criterio_original == null ? '—' : p.cumple_criterio_original ? 'cumple' : 'no cumple'}</p>
                    </li>))}</ul>
                </section>
                <section>
                  <h3 className="text-[14px] font-bold text-slate-800 mb-2">Cultivos ({ficha.cultivos.length})</h3>
                  <ul className="space-y-2">{ficha.cultivos.map((c: any) => (
                    <li key={c.cycle_crop_id} className="rounded-xl border border-slate-200 p-3 text-[13px]">
                      <p className="font-semibold text-slate-900">{c.variedad} · {c.ciclo} · {fmtNum(c.ha_sembradas, 2)} ha</p>
                      <p className="text-slate-600">Siembra {c.fecha_siembra || '—'} · cosecha estimada {c.fecha_cosecha_estimada || '—'} · {c.rendimiento_esperado_t_ha ?? '—'} t/ha</p>
                      <p className="text-slate-500 text-[12px]">Registrado {fmtFecha(c.created_at)}{c.hubo_desconexion ? ' · capturado sin señal' : ''}</p>
                    </li>))}</ul>
                </section>
                <section>
                  <h3 className="text-[14px] font-bold text-slate-800 mb-2">Historial de cambios ({ficha.cambios.length})</h3>
                  {ficha.cambios.length === 0 ? <p className="text-[13px] text-slate-400">Sin cambios después del alta.</p> : (
                    <ul className="divide-y divide-slate-100 text-[13px]">{ficha.cambios.map((c: any) => (
                      <li key={c.id} className="py-2"><p className="text-slate-800"><strong>{c.campo}</strong>: {c.valor_anterior ?? '—'} → {c.valor_nuevo ?? '—'}</p><p className="text-slate-400 text-[12px]">{c.quien} · {fmtFecha(c.created_at)}</p></li>))}</ul>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}
