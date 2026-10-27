import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { api } from '../../../services/api';
import { usePermisosStore } from '../../../store/permisos';
import { ETIQUETA_CAMPO, EtiquetaEstadoSolicitud, NOMBRE_PROGRAMA, formatoValor, mensajeError } from '../../../components/solicitudes/SolicitudesCambio';
import type { Solicitud } from '../../../components/solicitudes/SolicitudesCambio';

// T10 §10.8 — Panel: bandeja de solicitudes de cambio de datos personales, con filtros e historial completo de cada una.
// Permiso propio: vista "solicitudes_cambio" (ver / resolver).
const fecha = (iso?: string | null) => iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

interface Detalle { solicitud: Solicitud; cambio_aplicado: { valor_anterior: string | null; valor_nuevo: string | null; created_at: string; aprobado_por_nombre: string | null } | null; valor_ahora: string | null }
interface Conteos { por_resolver_admin: number; escaladas: number; con_tecnico: number }

export default function SolicitudesCambioAdminPage() {
  const puedoResolver = usePermisosStore(s => s.puedo)('solicitudes_cambio', 'resolver');
  const [filtros, setFiltros] = useState({ estado: 'pendiente', programa: '', tecnico: '', escaladas: false, telefono: false, bandeja: 'admin', q: '' });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<{ solicitudes: Solicitud[]; total: number; limite: number; contadores: Conteos } | null>(null);
  const [tecnicos, setTecnicos] = useState<{ id: number; nombre_completo: string }[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<Detalle | null>(null);
  const [motivo, setMotivo] = useState('');
  const [rechazando, setRechazando] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<{ texto: string; confirmar?: boolean } | null>(null);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r: any = await api.admin.solicitudes.lista({
        estado: filtros.estado, programa: filtros.programa, tecnico: filtros.tecnico, escaladas: filtros.escaladas ? 'true' : '',
        campo: filtros.telefono ? 'telefono' : '', bandeja: filtros.estado === 'pendiente' ? filtros.bandeja : '', q: filtros.q, pagina,
      });
      setDatos(r); setError('');
    } catch (e) { setError(mensajeError(e, 'No se pudieron cargar las solicitudes')); }
    finally { setCargando(false); }
  }, [filtros, pagina]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { api.admin.solicitudes.tecnicos().then((r: any) => setTecnicos(r.tecnicos)).catch(() => {}); }, []);

  async function abrir(id: number) {
    setErrorDetalle(null); setRechazando(false); setMotivo('');
    try { setAbierta((await api.admin.solicitudes.detalle(id)) as Detalle); } catch (e) { setError(mensajeError(e, 'No se pudo abrir la solicitud')); }
  }
  async function resolver(aprobar: boolean, confirmar = false) {
    if (!abierta) return;
    const id = abierta.solicitud.id;
    if (!aprobar && motivo.trim().length < 5) { setErrorDetalle({ texto: 'Escribe el motivo del rechazo (al menos 5 letras).' }); return; }
    setOcupada(true); setErrorDetalle(null);
    try {
      const r: any = aprobar ? await api.admin.solicitudes.aprobar(id, confirmar) : await api.admin.solicitudes.rechazar(id, motivo.trim());
      setMsg(r.mensaje); setAbierta(null); await cargar();
    } catch (e) {
      const err = e as { codigo?: string; datos?: { valor_ahora?: string | null } };
      if (err.codigo === 'VALOR_CAMBIO') setErrorDetalle({ texto: `${(e as Error).message} Valor actual: ${formatoValor(abierta.solicitud.campo, err.datos?.valor_ahora)}.`, confirmar: true });
      else { setErrorDetalle({ texto: mensajeError(e, 'No se pudo resolver') }); await cargar(); }
    } finally { setOcupada(false); }
  }

  const set = <K extends keyof typeof filtros>(k: K, v: (typeof filtros)[K]) => { setPagina(1); setFiltros(f => ({ ...f, [k]: v })); };
  const sel = 'min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[14px]';
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.limite)) : 1;
  const s = abierta?.solicitud;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold text-slate-900">Solicitudes de cambio</h1>
        <p className="text-[14px] text-slate-500">Cambios a datos personales de productores que pidieron los técnicos de maíz y de frijol.</p>
      </div>

      {datos && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[['Por resolver (administrador)', datos.contadores.por_resolver_admin, 'text-[#1A5C38]'], ['Escaladas por vencimiento', datos.contadores.escaladas, 'text-orange-700'], ['Con un técnico', datos.contadores.con_tecnico, 'text-slate-700']].map(([t, n, c]) => (
            <div key={String(t)} className="bg-white rounded-2xl border border-slate-200 p-4"><p className={`text-[26px] font-bold leading-none ${c}`}>{String(n)}</p><p className="text-[13px] text-slate-500 mt-1.5">{String(t)}</p></div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <select aria-label="Estado" className={sel} value={filtros.estado} onChange={e => set('estado', e.target.value)}>
          <option value="">Todos los estados</option><option value="pendiente">Pendientes</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option><option value="cancelada">Canceladas</option>
        </select>
        <select aria-label="Programa" className={sel} value={filtros.programa} onChange={e => set('programa', e.target.value)}>
          <option value="">Todos los programas</option><option value="simac_maiz">Maíz</option><option value="frijol_afb">Frijol</option>
        </select>
        <select aria-label="Técnico" className={sel} value={filtros.tecnico} onChange={e => set('tecnico', e.target.value)}>
          <option value="">Todos los técnicos</option>{tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre_completo}</option>)}
        </select>
        <input aria-label="Buscar productor o CURP" className={sel} placeholder="Buscar productor o CURP" value={filtros.q} onChange={e => set('q', e.target.value)} />
        <label className="flex items-center gap-2 text-[14px] min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={filtros.escaladas} onChange={e => set('escaladas', e.target.checked)} /> Solo escaladas por vencimiento</label>
        <label className="flex items-center gap-2 text-[14px] min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={filtros.telefono} onChange={e => set('telefono', e.target.checked)} /> Solo teléfono</label>
        {filtros.estado === 'pendiente' && (
          <label className="flex items-center gap-2 text-[14px] min-h-[44px]"><input type="checkbox" className="w-5 h-5" checked={filtros.bandeja === 'admin'} onChange={e => set('bandeja', e.target.checked ? 'admin' : '')} /> Solo las que me tocan a mí (administrador)</label>
        )}
      </div>

      {msg && <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[14px] px-4 py-3">{msg}</div>}
      {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-[14px] px-4 py-3">{error}</div>}

      {cargando && !datos ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#1A5C38]" /></div> : (
        <div className="space-y-2.5">
          {datos?.solicitudes.length === 0 && <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">No hay solicitudes con estos filtros</div>}
          {datos?.solicitudes.map(x => (
            <button key={x.id} onClick={() => abrir(x.id)} className="w-full text-left bg-white rounded-2xl border border-slate-200 hover:border-[#1A5C38]/50 p-4 transition">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-[15.5px] font-bold text-slate-900 break-words">{x.productor}</p><p className="text-[12px] font-mono text-slate-400 break-all">{x.curp}</p></div>
                <EtiquetaEstadoSolicitud s={x} />
              </div>
              <p className="text-[13.5px] text-slate-600 mt-2 break-words">
                <b>{ETIQUETA_CAMPO[x.campo]}</b>: {formatoValor(x.campo, x.valor_actual)} → <b>{formatoValor(x.campo, x.valor_propuesto)}</b>
              </p>
              <p className="text-[12.5px] text-slate-500 mt-1">Pidió {x.solicitante} ({NOMBRE_PROGRAMA[x.programa_solicitante]}) · {fecha(x.created_at)}{x.escalada ? ` · le tocaba a ${x.asignado_original_nombre || 'un técnico'}` : ''}</p>
            </button>
          ))}
        </div>
      )}

      {datos && datos.total > datos.limite && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="min-h-[44px] w-11 rounded-xl border border-slate-300 flex items-center justify-center disabled:opacity-40" aria-label="Anterior"><ChevronLeft size={18} /></button>
          <span className="text-[14px] text-slate-600">Página {pagina} de {totalPaginas}</span>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)} className="min-h-[44px] w-11 rounded-xl border border-slate-300 flex items-center justify-center disabled:opacity-40" aria-label="Siguiente"><ChevronRight size={18} /></button>
        </div>
      )}

      {abierta && s && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Detalle de la solicitud" onClick={() => setAbierta(null)}>
          <div className="bg-white w-full sm:max-w-[640px] max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h2 className="text-[18px] font-bold text-slate-900 break-words">{s.productor}</h2><p className="text-[12px] font-mono text-slate-400 break-all">{s.curp}</p></div>
              <button onClick={() => setAbierta(null)} aria-label="Cerrar" className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"><X size={18} /></button>
            </div>
            <EtiquetaEstadoSolicitud s={s} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[14.5px]">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-[12px] text-slate-500">{ETIQUETA_CAMPO[s.campo]} cuando se pidió</p><p className="font-semibold break-words">{formatoValor(s.campo, s.valor_actual)}</p></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-[12px] text-emerald-800">Valor propuesto</p><p className="font-semibold break-words">{formatoValor(s.campo, s.valor_propuesto)}</p></div>
            </div>
            {s.estado === 'pendiente' && abierta.valor_ahora !== s.valor_actual && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[14px] px-4 py-3">El dato del productor cambió desde que se pidió. Hoy dice: <b>{formatoValor(s.campo, abierta.valor_ahora)}</b>.</div>
            )}

            <div>
              <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-[0.08em] mb-2">Historial</h3>
              <ol className="space-y-2 text-[14px] border-l-2 border-slate-200 pl-4">
                <li><b>{s.solicitante}</b> ({NOMBRE_PROGRAMA[s.programa_solicitante]}) pidió el cambio · {fecha(s.created_at)}<p className="text-slate-600 break-words">Motivo: {s.motivo}</p></li>
                <li className="text-slate-600">{s.motivo_asignacion}</li>
                {s.escalada && <li className="text-orange-800">Sin respuesta en 7 días: pasó al administrador · {fecha(s.escalada_at)}{s.asignado_original_nombre ? ` (le tocaba a ${s.asignado_original_nombre})` : ''}</li>}
                {s.estado !== 'pendiente' && (
                  <li><b>{s.resuelto_por_nombre}</b> {s.estado === 'aprobada' ? 'aprobó' : s.estado === 'rechazada' ? 'rechazó' : 'canceló'} · {fecha(s.resuelto_at)}
                    {s.motivo_rechazo && <p className="text-red-800 break-words">Motivo del rechazo: {s.motivo_rechazo}</p>}
                    {abierta.cambio_aplicado && <p className="text-emerald-800">Se aplicó: {formatoValor(s.campo, abierta.cambio_aplicado.valor_anterior)} → {formatoValor(s.campo, abierta.cambio_aplicado.valor_nuevo)} (aprobado por {abierta.cambio_aplicado.aprobado_por_nombre})</p>}
                  </li>
                )}
              </ol>
            </div>

            {errorDetalle && <div role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-[14px] px-4 py-3">{errorDetalle.texto}</div>}
            {s.estado === 'pendiente' && puedoResolver && (rechazando ? (
              <div className="space-y-2.5">
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500} placeholder="Motivo del rechazo (el solicitante lo verá)" className="w-full rounded-xl border-2 border-slate-300 focus:border-red-600 outline-none px-3 py-2.5 text-[15px]" />
                <div className="flex gap-3">
                  <button onClick={() => { setRechazando(false); setErrorDetalle(null); }} disabled={ocupada} className="min-h-[48px] px-5 rounded-xl border-2 border-slate-200 font-bold text-slate-700">Cancelar</button>
                  <button onClick={() => resolver(false)} disabled={ocupada} className="flex-1 min-h-[48px] rounded-xl bg-red-600 text-white font-bold disabled:opacity-60">{ocupada ? 'Rechazando…' : 'Confirmar rechazo'}</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button onClick={() => setRechazando(true)} disabled={ocupada} className="flex-1 min-h-[48px] rounded-xl border-2 border-red-300 text-red-700 font-bold flex items-center justify-center gap-2"><X size={16} /> Rechazar</button>
                <button onClick={() => resolver(true, !!errorDetalle?.confirmar)} disabled={ocupada} className="flex-1 min-h-[48px] rounded-xl bg-[#1A5C38] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  {ocupada ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {errorDetalle?.confirmar ? 'Aprobar de todos modos' : 'Aprobar'}
                </button>
              </div>
            ))}
            {s.estado === 'pendiente' && !puedoResolver && <p className="text-[13.5px] text-slate-500">Puedes ver esta solicitud, pero no tienes permiso para resolverla.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
