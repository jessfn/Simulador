import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, Clock, Inbox, Loader2, Lock, Pencil, Send, ShieldCheck, X } from 'lucide-react';
import { api } from '../../services/api';

// T10 · Edición única y solicitudes de cambio (técnicos de maíz y de frijol; mismo componente, cada programa conserva su color en el encabezado).
export type Programa = 'simac_maiz' | 'frijol_afb';
export type CampoPersonal = 'nombres' | 'apellido_paterno' | 'apellido_materno' | 'sexo' | 'fecha_nacimiento' | 'correo' | 'telefono';

export const ETIQUETA_CAMPO: Record<CampoPersonal, string> = {
  nombres: 'Nombre(s)', apellido_paterno: 'Apellido paterno', apellido_materno: 'Apellido materno', sexo: 'Sexo',
  fecha_nacimiento: 'Fecha de nacimiento', correo: 'Correo', telefono: 'Teléfono',
};
const ORDEN: CampoPersonal[] = ['nombres', 'apellido_paterno', 'apellido_materno', 'sexo', 'fecha_nacimiento', 'telefono', 'correo'];
const VERDE = '#14532d';

interface EstadoCampo { campo: CampoPersonal; etiqueta: string; editable: boolean; bloqueo: 'EDICION_USADA' | 'TELEFONO_CON_CUENTA' | null; solicitud_pendiente_id: number | null }
interface CamposRespuesta { campos: EstadoCampo[]; valores: Record<string, string | null>; tiene_cuenta: boolean; pendientes: { id: number; campo: CampoPersonal; valor_propuesto: string }[] }

export const mensajeError = (e: unknown, defecto: string) => (e as Error).message === 'SIN_CONEXION' ? 'Sin conexión. Intenta de nuevo cuando tengas señal.' : (e as Error).message || defecto;

export function formatoValor(campo: CampoPersonal | string, v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  if (campo === 'sexo') return v === 'H' ? 'Hombre' : v === 'M' ? 'Mujer' : v;
  if (campo === 'fecha_nacimiento') { const [a, m, d] = String(v).slice(0, 10).split('-'); return d && m && a ? `${d}/${m}/${a}` : v; }
  return v;
}

const fechaCorta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Aviso({ tipo, children }: { tipo: 'rojo' | 'ambar' | 'verde' | 'info'; children: React.ReactNode }) {
  const est = { rojo: 'bg-red-50 border-red-200 text-red-800', ambar: 'bg-amber-50 border-amber-200 text-amber-900', verde: 'bg-emerald-50 border-emerald-200 text-emerald-900', info: 'bg-sky-50 border-sky-200 text-sky-900' }[tipo];
  return <div role={tipo === 'rojo' ? 'alert' : undefined} className={`rounded-2xl border px-4 py-3 text-[14px] leading-snug break-words ${est}`}>{children}</div>;
}

function EntradaCampo({ campo, valor, alCambiar }: { campo: CampoPersonal; valor: string; alCambiar: (v: string) => void }) {
  const base = 'w-full min-h-[50px] rounded-2xl border-2 border-slate-300 focus:border-[#14532d] outline-none px-4 text-[16px] bg-white';
  if (campo === 'sexo') {
    return (
      <div className="flex gap-3">
        {(['H', 'M'] as const).map(s => (
          <button key={s} type="button" onClick={() => alCambiar(s)} aria-pressed={valor === s}
            className={`flex-1 min-h-[50px] rounded-2xl text-[16px] font-bold border-2 ${valor === s ? 'bg-[#14532d] border-[#14532d] text-white' : 'bg-white border-slate-300 text-slate-700'}`}>{s === 'H' ? 'Hombre' : 'Mujer'}</button>
        ))}
      </div>
    );
  }
  if (campo === 'fecha_nacimiento') return <input type="date" className={base} value={valor} onChange={e => alCambiar(e.target.value)} min={`${new Date().getFullYear() - 100}-01-01`} max={`${new Date().getFullYear() - 15}-12-31`} />;
  if (campo === 'telefono') return <input className={base} inputMode="numeric" value={valor} onChange={e => alCambiar(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10 dígitos" autoComplete="off" />;
  if (campo === 'correo') return <input className={base} type="email" inputMode="email" autoCapitalize="none" value={valor} onChange={e => alCambiar(e.target.value)} autoComplete="off" />;
  return <input className={base} value={valor} onChange={e => alCambiar(e.target.value)} autoComplete="off" maxLength={100} />;
}

// ───────────────────────────── Ficha: datos personales y su estado de edición ─────────────────────────────
export function FichaDatosPersonales({ producerId, programa, onEditar, onCambio }: {
  producerId: number; programa: Programa;
  /** Edición directa (la única vez). Cada programa la manda a su propia ruta. */
  onEditar: (campo: CampoPersonal, valor: string) => Promise<void>;
  onCambio?: () => void;
}) {
  const [d, setD] = useState<CamposRespuesta | null>(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<CampoPersonal | null>(null);
  const [pidiendo, setPidiendo] = useState<CampoPersonal | null>(null);
  const [valor, setValor] = useState('');
  const [errorEdicion, setErrorEdicion] = useState<{ texto: string; codigo?: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    try { setD((await api.solicitudes.campos(producerId, programa)) as CamposRespuesta); setError(''); }
    catch (e) { setError(mensajeError(e, 'No se pudieron cargar los datos del productor')); }
  }, [producerId, programa]);
  useEffect(() => { void cargar(); }, [cargar]);

  function empezar(c: CampoPersonal) { setEditando(c); setPidiendo(null); setValor(d?.valores[c] ?? ''); setErrorEdicion(null); setMsg(''); }

  async function guardar() {
    if (!editando) return;
    setGuardando(true); setErrorEdicion(null);
    try { await onEditar(editando, valor.trim()); setEditando(null); setMsg('Dato corregido. Ya no se podrá cambiar directo: otro cambio irá por solicitud.'); await cargar(); onCambio?.(); }
    catch (e) { setErrorEdicion({ texto: mensajeError(e, 'No se pudo guardar'), codigo: (e as { codigo?: string }).codigo }); await cargar(); }
    finally { setGuardando(false); }
  }

  if (error && !d) return <Aviso tipo="rojo">{error}</Aviso>;
  if (!d) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#14532d]" size={22} /></div>;

  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5" aria-label="Datos personales del productor">
      <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-[0.1em]">Datos personales</h3>
      <p className="text-[13.5px] text-slate-500 mt-1">Cada dato se puede corregir directo <b>una sola vez</b>. Después, se pide el cambio.</p>
      {msg && <div className="mt-3"><Aviso tipo="verde">{msg}</Aviso></div>}

      <ul className="mt-3 divide-y divide-slate-100">
        {ORDEN.map(campo => {
          const st = d.campos.find(c => c.campo === campo)!;
          const pend = d.pendientes.find(p => p.campo === campo);
          const abierto = editando === campo || pidiendo === campo;
          return (
            <li key={campo} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="text-[12.5px] text-slate-500">{ETIQUETA_CAMPO[campo]}</p>
                  <p className="text-[16px] font-semibold text-slate-900 break-words">{formatoValor(campo, d.valores[campo])}</p>
                </div>
                {pend ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full px-3 py-1.5 bg-amber-100 text-amber-900"><Clock size={13} /> Cambio pendiente</span>
                ) : st.editable ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full px-3 py-1.5 bg-emerald-100 text-emerald-900"><Pencil size={13} /> Editable una vez</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold rounded-full px-3 py-1.5 bg-slate-200 text-slate-700"><Lock size={13} /> Bloqueado</span>
                )}
              </div>
              {pend && <p className="text-[13.5px] text-amber-900 mt-1.5 break-words">Pediste cambiarlo a: <b>{formatoValor(campo, pend.valor_propuesto)}</b>. Revisa “Mis solicitudes”.</p>}
              {!pend && st.bloqueo === 'TELEFONO_CON_CUENTA' && <p className="text-[13px] text-slate-600 mt-1.5">Este productor ya tiene cuenta: su teléfono solo lo cambia un administrador, con tu solicitud.</p>}
              {!pend && st.bloqueo === 'EDICION_USADA' && <p className="text-[13px] text-slate-600 mt-1.5">Ya se corrigió una vez. Para cambiarlo, pide el cambio.</p>}

              {!pend && !abierto && (
                <div className="mt-2.5">
                  {st.editable
                    ? <button type="button" onClick={() => empezar(campo)} className="min-h-[48px] w-full sm:w-auto px-5 rounded-2xl bg-slate-100 text-slate-800 font-bold flex items-center justify-center gap-2 active:scale-[0.98]"><Pencil size={15} /> Corregir (una sola vez)</button>
                    : <button type="button" onClick={() => { setPidiendo(campo); setEditando(null); setMsg(''); }} className="min-h-[48px] w-full sm:w-auto px-5 rounded-2xl text-white font-bold flex items-center justify-center gap-2 active:scale-[0.98]" style={{ background: VERDE }}><Send size={15} /> Pedir cambio</button>}
                </div>
              )}

              {editando === campo && (
                <div className="mt-3 space-y-3">
                  <EntradaCampo campo={campo} valor={valor} alCambiar={setValor} />
                  <Aviso tipo="ambar">Al guardar, este dato <b>ya no se podrá cambiar directo</b>. Revísalo bien.</Aviso>
                  {errorEdicion && (
                    <Aviso tipo="rojo">
                      {errorEdicion.texto}
                      {(errorEdicion.codigo === 'EDICION_USADA' || errorEdicion.codigo === 'TELEFONO_CON_CUENTA') && (
                        <button type="button" onClick={() => { setPidiendo(campo); setEditando(null); }} className="mt-2 block min-h-[44px] px-4 rounded-xl bg-red-700 text-white font-bold">Pedir cambio</button>
                      )}
                    </Aviso>
                  )}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setEditando(null)} disabled={guardando} className="min-h-[50px] px-5 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-bold">Cancelar</button>
                    <button type="button" onClick={guardar} disabled={guardando} className="flex-1 min-h-[50px] rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: VERDE }}>
                      {guardando ? <><Loader2 size={17} className="animate-spin" /> Guardando…</> : 'Guardar'}
                    </button>
                  </div>
                </div>
              )}

              {pidiendo === campo && (
                <FormularioPedirCambio producerId={producerId} programa={programa} campo={campo} actual={d.valores[campo]}
                  alCancelar={() => setPidiendo(null)} alEnviar={async m => { setPidiendo(null); setMsg(m); await cargar(); onCambio?.(); }} />
              )}
            </li>
          );
        })}
      </ul>
      {!d.tiene_cuenta && <p className="text-[12.5px] text-slate-400 mt-2">El teléfono de un productor sin cuenta sigue la misma regla de una sola corrección.</p>}
    </section>
  );
}

// ───────────────────────────── Formulario “Pedir cambio” ─────────────────────────────
function FormularioPedirCambio({ producerId, programa, campo, actual, alCancelar, alEnviar }: {
  producerId: number; programa: Programa; campo: CampoPersonal; actual: string | null | undefined;
  alCancelar: () => void; alEnviar: (mensaje: string) => void | Promise<void>;
}) {
  const [nuevo, setNuevo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setError('');
    if (!nuevo.trim() && campo !== 'apellido_materno' && campo !== 'correo') { setError('Escribe el valor nuevo.'); return; }
    if (motivo.trim().length < 5) { setError('Escribe el motivo del cambio (al menos 5 letras).'); return; }
    setEnviando(true);
    try {
      const r: any = await api.solicitudes.crear({ producer_id: producerId, programa, campo, valor_nuevo: nuevo.trim(), motivo: motivo.trim() });
      await alEnviar(r.mensaje || 'Solicitud enviada.');
    } catch (e) { setError(mensajeError(e, 'No se pudo enviar la solicitud')); }
    finally { setEnviando(false); }
  }

  return (
    <div className="mt-3 rounded-2xl bg-emerald-50/60 border border-emerald-200 p-4 space-y-3">
      <p className="text-[15px] font-bold text-slate-900">Pedir cambio de: {ETIQUETA_CAMPO[campo].toLowerCase()}</p>
      <p className="text-[13.5px] text-slate-600">Ahora: <b>{formatoValor(campo, actual)}</b></p>
      <label className="block text-[14px] font-semibold text-slate-700">Valor nuevo
        <div className="mt-1.5"><EntradaCampo campo={campo} valor={nuevo} alCambiar={setNuevo} /></div>
      </label>
      <label className="block text-[14px] font-semibold text-slate-700">¿Por qué se cambia?
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500} placeholder="Ej.: el productor me enseñó su INE y el dato estaba mal escrito"
          className="mt-1.5 w-full rounded-2xl border-2 border-slate-300 focus:border-[#14532d] outline-none px-4 py-3 text-[16px] bg-white" />
      </label>
      {error && <Aviso tipo="rojo">{error}</Aviso>}
      <div className="flex gap-3">
        <button type="button" onClick={alCancelar} disabled={enviando} className="min-h-[50px] px-5 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-bold">Cancelar</button>
        <button type="button" onClick={enviar} disabled={enviando} className="flex-1 min-h-[50px] rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: VERDE }}>
          {enviando ? <><Loader2 size={17} className="animate-spin" /> Enviando…</> : <><Send size={16} /> Enviar solicitud</>}
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── Bandejas del técnico ─────────────────────────────
export interface Solicitud {
  id: number; producer_id: number; campo: CampoPersonal; valor_actual: string | null; valor_propuesto: string; motivo: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada'; escalada: boolean; programa_solicitante: string; asignado_tipo: 'tecnico' | 'admin';
  motivo_asignacion: string; motivo_rechazo: string | null; created_at: string; vence_at: string; resuelto_at: string | null; escalada_at: string | null;
  curp: string; productor: string; solicitante: string; asignado_nombre: string | null; asignado_original_nombre: string | null;
  resuelto_por_nombre: string | null; resuelto_por_rol: string | null; visto_por_solicitante: boolean;
}

export const NOMBRE_PROGRAMA: Record<string, string> = { simac_maiz: 'Maíz', frijol_afb: 'Frijol' };

export function EtiquetaEstadoSolicitud({ s }: { s: Pick<Solicitud, 'estado' | 'escalada' | 'asignado_tipo'> }) {
  const [txt, cls] = s.estado === 'pendiente'
    ? (s.escalada ? ['Escalada al administrador', 'bg-orange-100 text-orange-900'] : s.asignado_tipo === 'admin' ? ['Con el administrador', 'bg-amber-100 text-amber-900'] : ['Esperando respuesta', 'bg-amber-100 text-amber-900'])
    : s.estado === 'aprobada' ? ['Aprobada', 'bg-emerald-100 text-emerald-900']
    : s.estado === 'rechazada' ? ['Rechazada', 'bg-red-100 text-red-800'] : ['Cancelada', 'bg-slate-200 text-slate-700'];
  return <span className={`inline-block text-[12.5px] font-bold rounded-full px-3 py-1 ${cls}`}>{txt}</span>;
}

function TarjetaSolicitud({ s, hijos }: { s: Solicitud; hijos?: React.ReactNode }) {
  return (
    <li className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[16px] font-bold text-slate-900 break-words">{s.productor}</p>
          <p className="text-[12px] font-mono text-slate-400 break-all">{s.curp}</p>
        </div>
        <EtiquetaEstadoSolicitud s={s} />
      </div>
      <p className="text-[13px] text-slate-500 mt-2">{ETIQUETA_CAMPO[s.campo]} · {NOMBRE_PROGRAMA[s.programa_solicitante] || s.programa_solicitante} · {fechaCorta(s.created_at)}</p>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[14.5px]">
        <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[12px] text-slate-500">Ahora</p><p className="font-semibold break-words">{formatoValor(s.campo, s.valor_actual)}</p></div>
        <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[12px] text-emerald-800">Propuesto</p><p className="font-semibold break-words">{formatoValor(s.campo, s.valor_propuesto)}</p></div>
      </div>
      <p className="text-[14px] text-slate-700 mt-2 break-words"><span className="text-slate-500">Pidió {s.solicitante}:</span> {s.motivo}</p>
      {s.estado === 'rechazada' && s.motivo_rechazo && <p className="mt-2 text-[14px] text-red-800 bg-red-50 rounded-xl p-2.5 break-words"><b>Motivo del rechazo:</b> {s.motivo_rechazo}</p>}
      {s.estado !== 'pendiente' && s.resuelto_por_nombre && <p className="text-[12.5px] text-slate-500 mt-2">{s.estado === 'cancelada' ? 'Cancelada por' : s.estado === 'aprobada' ? 'Aprobó' : 'Rechazó'} {s.resuelto_por_nombre} · {fechaCorta(s.resuelto_at)}</p>}
      {s.estado === 'pendiente' && <p className="text-[12.5px] text-slate-500 mt-2">{s.motivo_asignacion}{s.asignado_tipo === 'tecnico' ? ` · vence el ${fechaCorta(s.vence_at)}` : ''}</p>}
      {hijos}
    </li>
  );
}

export function BandejaSolicitudes({ programa }: { programa: Programa }) {
  const [pestana, setPestana] = useState<'resolver' | 'mias'>('resolver');
  const [porResolver, setPorResolver] = useState<Solicitud[] | null>(null);
  const [mias, setMias] = useState<Solicitud[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rechazando, setRechazando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [errorTarjeta, setErrorTarjeta] = useState<{ id: number; texto: string; confirmar?: boolean } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [a, b]: any[] = await Promise.all([api.solicitudes.porResolver(), api.solicitudes.mias(programa)]);
      setPorResolver(a.solicitudes); setMias(b.solicitudes); setError('');
    } catch (e) { setError(mensajeError(e, 'No se pudieron cargar las solicitudes')); }
  }, [programa]);
  useEffect(() => { void cargar(); }, [cargar]);
  // Al abrir “Mis solicitudes” las respuestas nuevas se dan por vistas
  useEffect(() => { if (pestana === 'mias' && mias?.some(s => !s.visto_por_solicitante)) { void api.solicitudes.marcarVistas().catch(() => {}); } }, [pestana, mias]);

  async function aprobar(s: Solicitud, confirmar = false) {
    setOcupada(s.id); setErrorTarjeta(null);
    try { const r: any = await api.solicitudes.aprobar(s.id, confirmar); setMsg(r.mensaje); await cargar(); }
    catch (e) {
      const err = e as { codigo?: string; datos?: { valor_ahora?: string | null } };
      if (err.codigo === 'VALOR_CAMBIO') setErrorTarjeta({ id: s.id, texto: `${(e as Error).message} Valor actual: ${formatoValor(s.campo, err.datos?.valor_ahora)}.`, confirmar: true });
      else { setErrorTarjeta({ id: s.id, texto: mensajeError(e, 'No se pudo aprobar') }); await cargar(); }
    } finally { setOcupada(null); }
  }
  async function rechazar(s: Solicitud) {
    if (motivo.trim().length < 5) { setErrorTarjeta({ id: s.id, texto: 'Escribe el motivo del rechazo (al menos 5 letras).' }); return; }
    setOcupada(s.id); setErrorTarjeta(null);
    try { const r: any = await api.solicitudes.rechazar(s.id, motivo.trim()); setMsg(r.mensaje); setRechazando(null); setMotivo(''); await cargar(); }
    catch (e) { setErrorTarjeta({ id: s.id, texto: mensajeError(e, 'No se pudo rechazar') }); await cargar(); }
    finally { setOcupada(null); }
  }
  async function cancelar(s: Solicitud) {
    setOcupada(s.id); setErrorTarjeta(null);
    try { await api.solicitudes.cancelar(s.id); setMsg('Solicitud cancelada.'); await cargar(); }
    catch (e) { setErrorTarjeta({ id: s.id, texto: mensajeError(e, 'No se pudo cancelar') }); await cargar(); }
    finally { setOcupada(null); }
  }

  const nuevas = mias?.filter(s => !s.visto_por_solicitante).length ?? 0;
  const pestanaCls = (activa: boolean) => `flex-1 min-h-[50px] rounded-2xl text-[15px] font-bold border-2 transition ${activa ? 'bg-[#14532d] border-[#14532d] text-white' : 'bg-white border-slate-200 text-slate-700'}`;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex gap-3" role="tablist">
        <button role="tab" aria-selected={pestana === 'resolver'} onClick={() => setPestana('resolver')} className={pestanaCls(pestana === 'resolver')}>Por resolver{porResolver && porResolver.length > 0 ? ` (${porResolver.length})` : ''}</button>
        <button role="tab" aria-selected={pestana === 'mias'} onClick={() => setPestana('mias')} className={pestanaCls(pestana === 'mias')}>Mis solicitudes{nuevas > 0 ? ` (${nuevas} nueva${nuevas === 1 ? '' : 's'})` : ''}</button>
      </div>
      {error && <Aviso tipo="rojo">{error}</Aviso>}
      {msg && <Aviso tipo="verde">{msg}</Aviso>}

      {pestana === 'resolver' && (porResolver === null ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#14532d]" /></div> : porResolver.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500"><Inbox className="mx-auto mb-2" size={28} /><p className="text-[15px] font-semibold">No tienes solicitudes por resolver</p></div>
      ) : (
        <ul className="space-y-3">
          {porResolver.map(s => (
            <TarjetaSolicitud key={s.id} s={s} hijos={
              <div className="mt-3 space-y-2.5">
                {errorTarjeta?.id === s.id && <Aviso tipo="rojo">{errorTarjeta.texto}</Aviso>}
                {rechazando === s.id ? (
                  <>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500} placeholder="Motivo del rechazo (el solicitante lo verá)"
                      className="w-full rounded-2xl border-2 border-slate-300 focus:border-red-600 outline-none px-4 py-3 text-[16px]" />
                    <div className="flex gap-3">
                      <button onClick={() => { setRechazando(null); setMotivo(''); setErrorTarjeta(null); }} disabled={ocupada === s.id} className="min-h-[50px] px-5 rounded-2xl bg-white border-2 border-slate-200 font-bold text-slate-700">Cancelar</button>
                      <button onClick={() => rechazar(s)} disabled={ocupada === s.id} className="flex-1 min-h-[50px] rounded-2xl bg-red-600 text-white font-bold disabled:opacity-60">{ocupada === s.id ? 'Rechazando…' : 'Confirmar rechazo'}</button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => { setRechazando(s.id); setErrorTarjeta(null); }} disabled={ocupada === s.id} className="flex-1 min-h-[52px] rounded-2xl bg-white border-2 border-red-300 text-red-700 font-bold flex items-center justify-center gap-2"><X size={17} /> Rechazar</button>
                    <button onClick={() => aprobar(s, errorTarjeta?.id === s.id && !!errorTarjeta.confirmar)} disabled={ocupada === s.id}
                      className="flex-1 min-h-[52px] rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: VERDE }}>
                      {ocupada === s.id ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} {errorTarjeta?.id === s.id && errorTarjeta.confirmar ? 'Aprobar de todos modos' : 'Aprobar'}
                    </button>
                  </div>
                )}
              </div>} />
          ))}
        </ul>
      ))}

      {pestana === 'mias' && (mias === null ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#14532d]" /></div> : mias.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500"><Inbox className="mx-auto mb-2" size={28} /><p className="text-[15px] font-semibold">Todavía no has pedido cambios</p><p className="text-[13.5px] mt-1">Los pides desde la ficha de un productor.</p></div>
      ) : (
        <ul className="space-y-3">
          {mias.map(s => (
            <TarjetaSolicitud key={s.id} s={s} hijos={
              s.estado === 'pendiente' ? (
                <div className="mt-3 space-y-2.5">
                  {errorTarjeta?.id === s.id && <Aviso tipo="rojo">{errorTarjeta.texto}</Aviso>}
                  <button onClick={() => cancelar(s)} disabled={ocupada === s.id} className="w-full min-h-[48px] rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-bold disabled:opacity-60">Cancelar solicitud</button>
                </div>
              ) : undefined} />
          ))}
        </ul>
      ))}
    </div>
  );
}

// ───────────────────────────── Aviso en el tablero ─────────────────────────────
/** Tarjeta del tablero: contador de solicitudes por resolver y de respuestas nuevas. Se oculta si no hay nada. */
export function ResumenSolicitudes({ ruta }: { ruta: string }) {
  const [r, setR] = useState<{ por_resolver: number; respuestas_nuevas: number } | null>(null);
  useEffect(() => { api.solicitudes.resumen().then(x => setR(x as { por_resolver: number; respuestas_nuevas: number })).catch(() => setR(null)); }, []);
  if (!r) return null;
  const hay = r.por_resolver > 0 || r.respuestas_nuevas > 0;
  return (
    <Link to={ruta} className={`flex items-center gap-3 rounded-3xl border p-4 min-h-[64px] active:scale-[0.99] ${hay ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${hay ? 'bg-amber-400 text-amber-950' : 'bg-slate-100 text-slate-500'}`}>{hay ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15.5px] font-bold text-slate-900">Solicitudes de cambio</span>
        <span className="block text-[13.5px] text-slate-600 break-words">
          {hay ? [r.por_resolver > 0 ? `${r.por_resolver} por resolver` : '', r.respuestas_nuevas > 0 ? `${r.respuestas_nuevas} respuesta${r.respuestas_nuevas === 1 ? '' : 's'} nueva${r.respuestas_nuevas === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ') : 'Sin pendientes'}
        </span>
      </span>
      <ChevronRight size={20} className="text-slate-400 flex-shrink-0" />
    </Link>
  );
}
