import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Copy, CheckCheck, KeyRound, Loader2 } from 'lucide-react';
import { api } from '../../../services/api';

export interface TecnicoCompleto {
  id: number;
  email: string;
  curp?: string | null;
  nombre_completo: string;
  telefono?: string | null;
  activo: boolean;
  debe_cambiar_pass: boolean;
  ultimo_login: string | null;
  created_at: string;
  total_registros: number;
  total_ups: number;
  registros_frijol?: number;
  tipo_tecnico?: string | null;
  tipo_tecnico_etiqueta?: string | null;
  programas?: string[];
  zona?: { state_id: string; state_name?: string | null; municipality_id: string | null; municipality_name?: string | null }[];
}

interface Catalogos {
  tipos_tecnico: { code: string; label: string }[];
  programas: { clave: string; nombre: string; cultivo: string | null }[];
  estados: { state_id: string; name: string }[];
}

// Una entrada de zona en pantalla: un estado y, opcionalmente, municipios concretos (vacío = todo el estado)
interface ZonaUI { state_id: string; todo: boolean; municipios: string[] }

const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function zonaDesdeApi(z: TecnicoCompleto['zona']): ZonaUI[] {
  const por: Record<string, ZonaUI> = {};
  for (const r of z || []) {
    const e = (por[r.state_id] ||= { state_id: r.state_id, todo: false, municipios: [] });
    if (r.municipality_id) e.municipios.push(r.municipality_id); else e.todo = true;
  }
  return Object.values(por).map(e => (e.todo ? { ...e, municipios: [] } : e));
}

function zonaHaciaApi(z: ZonaUI[]) {
  const out: { state_id: string; municipality_id: string | null }[] = [];
  for (const e of z) {
    if (!e.state_id) continue;
    if (e.todo || e.municipios.length === 0) out.push({ state_id: e.state_id, municipality_id: null });
    else for (const m of e.municipios) out.push({ state_id: e.state_id, municipality_id: m });
  }
  return out;
}

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] outline-none focus:border-indigo-400 focus:bg-white transition-colors';
const labelCls = 'text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1';

/* ─── Selector de zona: estado + municipios ───────────────────────── */
function FilaZona({ valor, estados, usados, onChange, onQuitar, puedeQuitar }: {
  valor: ZonaUI; estados: Catalogos['estados']; usados: string[];
  onChange: (z: ZonaUI) => void; onQuitar: () => void; puedeQuitar: boolean;
}) {
  const [munis, setMunis] = useState<{ municipality_id: string; name: string }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    if (!valor.state_id) { setMunis([]); return; }
    let vivo = true;
    setCargando(true);
    api.admin.tecnicos.municipios(valor.state_id)
      .then((r: any) => { if (vivo) setMunis(r.municipios || []); })
      .catch(() => { if (vivo) setMunis([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [valor.state_id]);

  const visibles = useMemo(
    () => munis.filter(m => m.name.toLowerCase().includes(filtro.trim().toLowerCase())),
    [munis, filtro]
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <select value={valor.state_id} onChange={e => onChange({ state_id: e.target.value, todo: true, municipios: [] })}
          className={inputCls + ' flex-1'}>
          <option value="">Elige un estado…</option>
          {estados.map(e => (
            <option key={e.state_id} value={e.state_id} disabled={usados.includes(e.state_id) && e.state_id !== valor.state_id}>{e.name}</option>
          ))}
        </select>
        {puedeQuitar && (
          <button type="button" onClick={onQuitar} aria-label="Quitar este estado"
            className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition"><Trash2 size={15} /></button>
        )}
      </div>

      {valor.state_id && (
        <>
          <label className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={valor.todo}
              onChange={e => onChange({ ...valor, todo: e.target.checked, municipios: e.target.checked ? [] : valor.municipios })}
              className="w-4 h-4 accent-indigo-600" />
            Todo el estado
          </label>

          {!valor.todo && (
            <div className="space-y-1.5">
              <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar municipio…"
                className={inputCls + ' !py-2 !text-[12px]'} />
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white divide-y divide-gray-50">
                {cargando ? (
                  <p className="p-3 text-[12px] text-gray-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Cargando municipios…</p>
                ) : visibles.length === 0 ? (
                  <p className="p-3 text-[12px] text-gray-400">Sin resultados.</p>
                ) : visibles.map(m => {
                  const marcado = valor.municipios.includes(m.municipality_id);
                  return (
                    <label key={m.municipality_id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-gray-700 cursor-pointer hover:bg-indigo-50/50">
                      <input type="checkbox" checked={marcado} className="w-4 h-4 accent-indigo-600"
                        onChange={() => onChange({
                          ...valor,
                          municipios: marcado ? valor.municipios.filter(x => x !== m.municipality_id) : [...valor.municipios, m.municipality_id],
                        })} />
                      {m.name}
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400">
                {valor.municipios.length === 0 ? 'Marca al menos un municipio, o elige "Todo el estado".' : `${valor.municipios.length} municipio${valor.municipios.length !== 1 ? 's' : ''} elegido${valor.municipios.length !== 1 ? 's' : ''}.`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Contraseña temporal (se muestra una sola vez) ───────────────── */
export function ModalPasswordTemporal({ nombre, password, correoEnviado, onClose }: {
  nombre: string; password: string; correoEnviado: boolean | null; onClose: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    navigator.clipboard.writeText(password).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); });
  }
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[8px]" />
      <div className="relative bg-white w-full max-w-sm rounded-[28px] shadow-[0_40px_100px_rgba(0,0,0,0.35)] px-5 pt-6 pb-6">
        <div className="flex items-center justify-center mb-3">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center"><KeyRound size={24} className="text-emerald-700" /></div>
        </div>
        <h2 className="text-[17px] font-bold text-slate-900 text-center">Técnico creado</h2>
        <p className="text-[13px] text-slate-500 text-center mt-1 mb-3 leading-relaxed">
          Entrega esta contraseña a <strong className="text-slate-700">{nombre}</strong>.
        </p>
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1.5">Contraseña temporal</p>
          <div className="flex items-center justify-center gap-2">
            <p className="text-[22px] font-black text-emerald-900 tracking-wide font-mono break-all">{password}</p>
            <button onClick={copiar} className="w-8 h-8 rounded-lg bg-white border border-emerald-200 flex items-center justify-center flex-shrink-0" aria-label="Copiar contraseña">
              {copiado ? <CheckCheck size={14} className="text-emerald-600" /> : <Copy size={14} className="text-emerald-500" />}
            </button>
          </div>
        </div>
        <p className="text-[12px] text-slate-500 text-center mt-3 leading-relaxed">
          Esta contraseña <strong>solo se muestra una vez</strong>. El técnico deberá cambiarla en su primer acceso.
        </p>
        {correoEnviado === true && <p className="text-[12px] text-emerald-700 text-center mt-2">También se envió por correo.</p>}
        {correoEnviado === false && <p className="text-[12px] text-amber-700 text-center mt-2">No se pudo enviar el correo; entrégala tú.</p>}
        <button onClick={onClose} className="w-full mt-5 py-3.5 rounded-[16px] text-[15px] font-semibold text-white bg-[#1A5C38] hover:bg-[#15482d] active:scale-[.97] transition-all">
          Listo
        </button>
      </div>
    </div>,
    document.body
  );
}

/* ─── Formulario de alta / edición de técnico ─────────────────────── */
export function ModalFormularioTecnico({ tecnico, onClose, onGuardado }: {
  tecnico: TecnicoCompleto | null;           // null = alta
  onClose: () => void;
  onGuardado: (t: any, passwordTemporal?: string, correoEnviado?: boolean | null) => void;
}) {
  const edicion = !!tecnico;
  const [cat, setCat] = useState<Catalogos | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [nombre, setNombre] = useState(tecnico?.nombre_completo || '');
  const [curp, setCurp] = useState(tecnico?.curp || '');
  const [email, setEmail] = useState(tecnico?.email || '');
  const [telefono, setTelefono] = useState(tecnico?.telefono || '');
  const [tipo, setTipo] = useState(tecnico?.tipo_tecnico || '');
  const [programas, setProgramas] = useState<string[]>(tecnico?.programas || []);
  const [zona, setZona] = useState<ZonaUI[]>(() => {
    const z = zonaDesdeApi(tecnico?.zona);
    return z.length > 0 ? z : [{ state_id: '', todo: true, municipios: [] }];
  });
  const [enviarCorreo, setEnviarCorreo] = useState(false);
  const [activo, setActivo] = useState(tecnico?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    api.admin.tecnicos.catalogos().then((c: any) => setCat(c)).catch(() => setErrorCarga('No se pudieron cargar las listas. Intenta de nuevo.'));
    return () => { document.body.style.overflow = ''; };
  }, []);

  const errores = useMemo(() => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Escribe el nombre completo';
    if (!edicion) {
      if (!curp.trim()) e.curp = 'Escribe la CURP';
      else if (!CURP_RE.test(curp.trim().toUpperCase())) e.curp = 'La CURP debe tener 18 caracteres con formato válido';
    }
    if (!email.trim()) e.email = 'Escribe el correo';
    else if (!EMAIL_RE.test(email.trim())) e.email = 'El correo no tiene un formato válido';
    if (!/^\d{10}$/.test(telefono.trim())) e.telefono = 'El teléfono debe tener 10 dígitos';
    if (!tipo) e.tipo = 'Elige el tipo de técnico';
    if (programas.length === 0) e.programas = 'Elige al menos un programa';
    const zonaOk = zona.some(z => z.state_id) && zona.every(z => !z.state_id || z.todo || z.municipios.length > 0);
    if (!zonaOk) e.zona = 'Agrega al menos un estado; si no es todo el estado, marca sus municipios';
    return e;
  }, [nombre, curp, email, telefono, tipo, programas, zona, edicion]);

  const usados = zona.map(z => z.state_id).filter(Boolean);
  const mostrar = (k: string) => (tocado && errores[k] ? <p className="text-[11.5px] text-red-600 mt-1">{errores[k]}</p> : null);

  async function guardar() {
    setTocado(true); setError('');
    if (Object.keys(errores).length > 0) return;
    setGuardando(true);
    try {
      const cuerpo: Record<string, unknown> = {
        nombre_completo: nombre.trim(), email: email.trim().toLowerCase(), telefono: telefono.trim(),
        tipo_tecnico: tipo, programas, zona: zonaHaciaApi(zona),
      };
      if (edicion) {
        cuerpo.activo = activo;
        const r: any = await api.admin.tecnicos.editar(tecnico!.id, cuerpo);
        onGuardado(r.tecnico);
      } else {
        cuerpo.curp = curp.trim().toUpperCase();
        cuerpo.enviar_credenciales = enviarCorreo;
        const r: any = await api.admin.tecnicos.crear(cuerpo);
        onGuardado(r.tecnico, r.password_temporal, r.correo_enviado);
      }
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6" style={{ zIndex: 9999 }} onClick={() => { if (!guardando) onClose(); }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[8px]" />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl max-h-[95dvh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 px-5 pt-5 pb-3 flex items-center justify-between border-b border-gray-100">
          <h2 className="text-[17px] font-bold text-slate-900">{edicion ? 'Editar técnico' : 'Nuevo técnico'}</h2>
          <button onClick={onClose} disabled={guardando} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center" aria-label="Cerrar">
            <X size={14} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          {errorCarga && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 text-[12px] text-red-600">{errorCarga}</div>}

          <div>
            <label className={labelCls}>Nombre completo</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} autoComplete="off" />
            {mostrar('nombre')}
          </div>
          <div>
            <label className={labelCls}>CURP</label>
            <input value={curp} onChange={e => setCurp(e.target.value.toUpperCase())} maxLength={18} disabled={edicion}
              className={inputCls + ' font-mono tracking-wide' + (edicion ? ' opacity-60' : '')} autoComplete="off" />
            {edicion && <p className="text-[11px] text-gray-400 mt-1">La CURP no se puede cambiar.</p>}
            {mostrar('curp')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className={labelCls}>Correo electrónico</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className={inputCls} autoComplete="off" />
              {mostrar('email')}
            </div>
            <div>
              <label className={labelCls}>Teléfono (10 dígitos)</label>
              <input value={telefono} onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" className={inputCls} autoComplete="off" />
              {mostrar('telefono')}
            </div>
          </div>

          <div>
            <label className={labelCls}>Tipo de técnico</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputCls}>
              <option value="">Elige un tipo…</option>
              {cat?.tipos_tecnico.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
            {mostrar('tipo')}
          </div>

          <div>
            <label className={labelCls}>Programas</label>
            <div className="flex flex-wrap gap-2">
              {cat?.programas.map(p => {
                const on = programas.includes(p.clave);
                return (
                  <button key={p.clave} type="button" onClick={() => setProgramas(on ? programas.filter(x => x !== p.clave) : [...programas, p.clave])}
                    className={`px-3.5 py-2 rounded-xl text-[12.5px] font-semibold border transition ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
                    {p.cultivo === 'frijol' ? 'Frijol' : p.cultivo === 'maiz' ? 'Maíz' : p.nombre}
                  </button>
                );
              })}
            </div>
            {mostrar('programas')}
            {edicion && <p className="text-[11px] text-gray-400 mt-1">Quitar un programa no borra ni reasigna los registros que ya hizo: solo le impide registrar nuevos.</p>}
          </div>

          <div>
            <label className={labelCls}>Zona de operación</label>
            <div className="space-y-2.5">
              {cat && zona.map((z, i) => (
                <FilaZona key={i} valor={z} estados={cat.estados} usados={usados} puedeQuitar={zona.length > 1}
                  onChange={nz => setZona(zona.map((x, j) => (j === i ? nz : x)))}
                  onQuitar={() => setZona(zona.filter((_, j) => j !== i))} />
              ))}
              <button type="button" onClick={() => setZona([...zona, { state_id: '', todo: true, municipios: [] }])}
                className="flex items-center gap-1.5 text-[12.5px] font-bold text-indigo-700 hover:text-indigo-900">
                <Plus size={14} /> Agregar otro estado
              </button>
            </div>
            {mostrar('zona')}
          </div>

          {edicion ? (
            <button type="button" onClick={() => setActivo(a => !a)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200">
              <span className="text-[13px] font-semibold text-gray-700">Cuenta activa</span>
              <div className={`w-10 h-6 rounded-full transition-colors relative ${activo ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </div>
            </button>
          ) : (
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-700 cursor-pointer">
              <input type="checkbox" checked={enviarCorreo} onChange={e => setEnviarCorreo(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
              Enviar las credenciales por correo
            </label>
          )}

          {error && <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5"><p className="text-red-600 text-[12.5px] font-medium">{error}</p></div>}
        </div>

        <div className="flex-shrink-0 px-5 py-3.5 border-t border-gray-100 flex gap-2.5">
          <button onClick={onClose} disabled={guardando} className="flex-1 py-3 rounded-xl text-[13px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !cat} className="flex-1 py-3 rounded-xl text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {guardando ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : edicion ? 'Guardar cambios' : 'Crear técnico'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
