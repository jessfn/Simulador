import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import MapaUP from '../../components/productor/MapaUP';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';
import { Aviso, Campo, Tarjeta, Texto } from './ui';
import { EtiquetaEstado } from './RegistrosPage';
import { FichaDatosPersonales } from '../../components/solicitudes/SolicitudesCambio';
import Paso2Productor from './pasos/Paso2Productor';
import Paso3Complementaria from './pasos/Paso3Complementaria';
import FormularioCultivo from './pasos/FormularioCultivo';
import { useCatalogos } from './useRegistro';
import { borradorNuevo, esCurp, validarComplementaria, validarCultivo, validarProductor } from './validacion';
import type { Borrador, ParcelaExistente } from './tipos';

interface Cultivo {
  cycle_crop_id: number; up_id: number; cycle_year: number; cycle_type: string; tipo_riego: string; variety_id: string; variety_other: string | null; variedad: string | null;
  area_sown_ha: number; fecha_siembra: string; fecha_cosecha_estimada: string; rendimiento_esperado_t_ha: number | null; destino: string | null; tipo_siembra: string | null;
  densidad_kg_ha: number | null; usa_fertilizante: boolean | null; tipos_fertilizante: string[] | null; rotacion: string | null; observaciones: string | null; sin_observaciones: boolean | null;
}
interface Detalle {
  datos: { producer_id: number; curp: string; nombres: string; apellido_paterno: string; apellido_materno: string | null; sexo: 'H' | 'M' | null; fecha_nacimiento: string | null; telefono: string | null; correo: string | null };
  frijol_productor: Record<string, unknown> | null; parcelas: ParcelaExistente[]; cultivos: Cultivo[];
  verificacion_identidad: 'verificada' | 'pendiente' | 'no_valida'; estatus_registro: string;
}

const etiquetaCiclo = (c: { cycle_type: string; cycle_year: number }) => c.cycle_type === 'OI' ? `OI ${c.cycle_year}-${String((c.cycle_year + 1) % 100).padStart(2, '0')}` : c.cycle_type === 'PV' ? `PV ${c.cycle_year}` : `Anual ${c.cycle_year}`;

function anillo(g: ParcelaExistente['geom_geojson']): [number, number][] | null {
  if (!g) return null;
  const c = g.coordinates as number[][][] | number[][][][];
  return ((g.type === 'MultiPolygon' ? (c as number[][][][])[0]?.[0] : (c as number[][][])[0]) as [number, number][] | undefined) || null;
}

// F10 — Detalle del productor: datos, parcelas y cultivos de frijol, con sus correcciones.
export default function DetalleProductorFrijolPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { catalogos } = useCatalogos();
  const [d, setD] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<'ver' | 'datos' | 'complementaria' | { cultivo: number }>('ver');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorGuardar, setErrorGuardar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [curpNueva, setCurpNueva] = useState('');
  const [errorCurp, setErrorCurp] = useState('');

  const cargar = useCallback(async () => {
    try { setD((await api.frijol.productor(id!)) as Detalle); setError(''); }
    catch (e: unknown) { setError((e as Error).message === 'SIN_CONEXION' ? 'Sin conexión. Intenta de nuevo cuando tengas señal.' : (e as Error).message || 'No se pudo cargar el registro'); }
  }, [id]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Borrador "de edición" para reutilizar los mismos formularios del registro
  const [b, setB] = useState<Borrador | null>(null);
  const actualizar = useCallback((fn: (x: Borrador) => Borrador) => setB(prev => (prev ? fn(prev) : prev)), []);

  function abrir(m: typeof modo) {
    if (!d) return;
    const nuevo = borradorNuevo(d.datos.curp);
    nuevo.consulta = { codigo: 'EN_FRIJOL_PROPIO', producer_id: d.datos.producer_id };
    nuevo.productor = {
      nombres: d.datos.nombres || '', apellido_paterno: d.datos.apellido_paterno || '', apellido_materno: d.datos.apellido_materno || '',
      sexo: d.datos.sexo || '', fecha_nacimiento: d.datos.fecha_nacimiento || '', telefono: (d.datos.telefono || '').replace(/\D/g, '').slice(-10), correo: d.datos.correo || '',
    };
    const fp = d.frijol_productor;
    if (fp) nuevo.complementaria = {
      total_ups: Number(fp.total_ups_declaradas) || 1, participa: fp.participa_programas_sader as boolean, programas_sader: (fp.programas_sader as string[]) || [],
      programas_otro: (fp.programas_sader_otro as string) || '', organizacion: (fp.organizacion as string) || '', seguro: (fp.seguro_agricola as string) || '', seguro_nombre: (fp.seguro_agricola_nombre as string) || '',
    };
    nuevo.complementaria_resumen = false;
    if (typeof m === 'object') {
      const c = d.cultivos.find(x => x.cycle_crop_id === m.cultivo)!;
      nuevo.parcela = { ...nuevo.parcela, modo: 'existente', up_id: c.up_id, regimen: c.tipo_riego === 'riego' ? 'riego' : 'temporal' };
      nuevo.cultivo = {
        fecha_siembra: c.fecha_siembra, cycle_type: c.cycle_type, fecha_cosecha: c.fecha_cosecha_estimada, variety_id: c.variety_id, variety_other: c.variety_other || '',
        area_sembrada_ha: String(c.area_sown_ha), rendimiento: String(c.rendimiento_esperado_t_ha ?? ''), densidad: String(c.densidad_kg_ha ?? ''),
        usa_fertilizante: c.usa_fertilizante, tipos_fertilizante: c.tipos_fertilizante || [], rotacion: c.rotacion || '', tipo_siembra: c.tipo_siembra || '', destino: c.destino || '',
        observaciones: c.observaciones || '', sin_observaciones: !!c.sin_observaciones,
      };
    }
    setB(nuevo); setMostrar(false); setErrorGuardar(''); setMsg(''); setModo(m);
  }

  const parcelaDelCultivo = useMemo(() => {
    if (!d || typeof modo !== 'object') return null;
    const c = d.cultivos.find(x => x.cycle_crop_id === modo.cultivo);
    return d.parcelas.find(p => p.up_id === c?.up_id) || null;
  }, [d, modo]);
  const superficie = Number(parcelaDelCultivo?.area_ha_real || parcelaDelCultivo?.area_ha_calc || 0);

  const erroresActuales = useMemo(() => {
    if (!b) return {};
    if (modo === 'datos') return validarProductor(b);
    if (modo === 'complementaria') return validarComplementaria(b);
    if (typeof modo === 'object') return validarCultivo(b, superficie).errores;
    return {};
  }, [b, modo, superficie]);

  async function guardar() {
    if (!b || !d) return;
    if (Object.keys(erroresActuales).length > 0) { setMostrar(true); return; }
    setGuardando(true); setErrorGuardar('');
    try {
      if (modo === 'datos') {
        const p = b.productor;
        await api.frijol.corregirProductor(d.datos.producer_id, { productor: { nombres: p.nombres.trim(), apellido_paterno: p.apellido_paterno.trim(), apellido_materno: p.apellido_materno.trim(), sexo: p.sexo, fecha_nacimiento: p.fecha_nacimiento, telefono: p.telefono, correo: p.correo.trim() } });
      } else if (modo === 'complementaria') {
        const c = b.complementaria;
        await api.frijol.corregirProductor(d.datos.producer_id, { frijol_productor: { total_ups_declaradas: c.total_ups, participa_programas_sader: c.participa === true, programas_sader: c.participa ? c.programas_sader : [], programas_sader_otro: c.programas_sader.includes('otro_sader') ? c.programas_otro.trim() : null, organizacion: c.organizacion.trim() || null, seguro_agricola: c.seguro || null, seguro_agricola_nombre: c.seguro === 'otro' ? c.seguro_nombre.trim() : null } });
      } else if (typeof modo === 'object') {
        const cu = b.cultivo;
        await api.frijol.corregirCultivo(modo.cultivo, {
          fecha_siembra: cu.fecha_siembra, cycle_type: cu.cycle_type || undefined, fecha_cosecha_estimada: cu.fecha_cosecha, variety_id: cu.variety_id, variety_other: cu.variety_other.trim() || null,
          area_sown_ha: Number(cu.area_sembrada_ha), rendimiento_esperado_t_ha: Number(cu.rendimiento), destino: cu.destino || null, tipo_siembra: cu.tipo_siembra || null,
          densidad_kg_ha: Number(cu.densidad), usa_fertilizante: cu.usa_fertilizante === true, tipos_fertilizante: cu.usa_fertilizante ? cu.tipos_fertilizante : [], rotacion: cu.rotacion,
          observaciones: cu.sin_observaciones ? null : cu.observaciones.trim(), sin_observaciones: cu.sin_observaciones,
        });
      }
      await cargar(); setModo('ver'); setMsg('Cambios guardados.');
    } catch (e: unknown) { setErrorGuardar((e as Error).message === 'SIN_CONEXION' ? 'Sin conexión. Intenta de nuevo cuando tengas señal.' : (e as Error).message || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  }

  async function verificarCurp() {
    setErrorCurp('');
    if (!esCurp(curpNueva)) { setErrorCurp('La CURP debe tener 18 caracteres con formato válido'); return; }
    setGuardando(true);
    try { await api.frijol.corregirCurp(d!.datos.producer_id, curpNueva.trim().toUpperCase()); setCurpNueva(''); await cargar(); setMsg('CURP corregida y verificada.'); }
    catch (e: unknown) { setErrorCurp((e as Error).message || 'No se pudo verificar la CURP'); }
    finally { setGuardando(false); }
  }

  if (error && !d) return <div><PageHeaderTecnico title="Productor" back="/frijol/tecnico/registros" /><div className="px-4 py-6"><Aviso tipo="rojo">{error}</Aviso></div></div>;
  if (!d) return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#1A5C38]" size={28} /></div>;

  const nombre = [d.datos.nombres, d.datos.apellido_paterno, d.datos.apellido_materno].filter(Boolean).join(' ');
  const validado = d.estatus_registro === 'validado';
  const editando = modo !== 'ver';
  const e = mostrar ? erroresActuales : {};

  // ── Edición de datos, información complementaria o cultivo ──
  if (editando && b) {
    const titulo = modo === 'datos' ? 'Corregir datos' : modo === 'complementaria' ? 'Información complementaria' : 'Corregir cultivo';
    return (
      <div className="pb-24">
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/60 px-4 pt-3.5 pb-3.5 flex items-center gap-3">
          <button onClick={() => setModo('ver')} aria-label="Volver" className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center"><ArrowLeft size={19} /></button>
          <h1 className="text-[20px] font-bold text-slate-900">{titulo}</h1>
        </div>
        <div className="px-4 pt-2 space-y-4">
          {modo === 'datos' && <Paso2Productor b={b} actualizar={actualizar} errores={e} />}
          {modo === 'complementaria' && <Paso3Complementaria b={b} actualizar={actualizar} catalogos={catalogos} errores={e} />}
          {typeof modo === 'object' && <FormularioCultivo b={b} actualizar={actualizar} catalogos={catalogos} errores={e} avisos={validarCultivo(b, superficie).avisos} superficie={superficie} />}
          {errorGuardar && <Aviso tipo="rojo">{errorGuardar}</Aviso>}
        </div>
        <div className="fixed bottom-[68px] inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 flex gap-3">
          <button onClick={() => setModo('ver')} disabled={guardando} className="min-h-[52px] px-5 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-bold">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="flex-1 min-h-[52px] rounded-2xl bg-[#1A5C38] text-white text-[16px] font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            {guardando ? <><Loader2 size={18} className="animate-spin" /> Guardando…</> : 'Guardar cambios'}</button>
        </div>
      </div>
    );
  }

  const fp = d.frijol_productor;
  return (
    <div className="pb-8">
      <PageHeaderTecnico title="Productor" back="/frijol/tecnico/registros" />
      <div className="px-4 pt-2 space-y-4">
        {msg && <Aviso tipo="verde">{msg}</Aviso>}

        {d.verificacion_identidad === 'no_valida' && (
          <section className="rounded-3xl bg-red-50 border border-red-200 p-4" aria-label="Corregir la CURP">
            <p className="text-[15px] font-bold text-red-800 flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 flex-shrink-0" /> La CURP {d.datos.curp} no es válida en RENAPO. Verifícala con el productor.</p>
            <div className="mt-3 space-y-2.5">
              <Texto valor={curpNueva} alCambiar={v => setCurpNueva(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18))} maxLength={18} placeholder="CURP correcta" className="font-mono tracking-wider uppercase" error={errorCurp} aria-label="CURP correcta" />
              {errorCurp && <p role="alert" className="text-[13px] text-red-700 font-medium">{errorCurp}</p>}
              <button onClick={verificarCurp} disabled={guardando} className="w-full min-h-[52px] rounded-2xl bg-red-600 text-white font-bold disabled:opacity-60">{guardando ? 'Verificando…' : 'Verificar de nuevo'}</button>
            </div>
          </section>
        )}

        <Tarjeta>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[21px] font-bold text-slate-900 leading-tight" style={{ fontFamily: 'Patria, Georgia, serif' }}>{nombre}</h1>
              <p className="font-mono text-[12.5px] text-slate-400 mt-0.5">{d.datos.curp}</p>
            </div>
            <EtiquetaEstado fila={d} />
          </div>
          {d.verificacion_identidad === 'pendiente' && <p className="text-[13px] text-amber-800 mt-3">La CURP se verificará automáticamente.</p>}
          {validado && <p className="text-[13px] text-emerald-800 mt-3 flex items-center gap-1.5"><ShieldCheck size={15} /> Registro validado: ya no se puede corregir.</p>}
        </Tarjeta>

        {!validado && (
          <FichaDatosPersonales producerId={d.datos.producer_id} programa="frijol_afb" onCambio={() => void cargar()}
            onEditar={async (campo, valor) => { await api.frijol.corregirProductor(d.datos.producer_id, { productor: { [campo]: valor } }); }} />
        )}

        {fp && (
          <Tarjeta titulo="Información complementaria" acciones={!validado ? <button onClick={() => abrir('complementaria')} className="text-[14px] font-bold text-[#1A5C38] min-h-[44px] px-2">Corregir</button> : undefined}>
            <dl className="space-y-2 text-[14.5px]">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Parcelas en total</dt><dd className="font-semibold">{String(fp.total_ups_declaradas)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Otros programas</dt><dd className="font-semibold text-right">{fp.participa_programas_sader ? ((fp.programas_sader as string[]) || []).map(x => catalogos?.programas_sader.find(s => s.clave === x)?.nombre || x).join(', ') : 'No participa'}</dd></div>
              {fp.organizacion ? <div className="flex justify-between gap-4"><dt className="text-slate-500">Organización</dt><dd className="font-semibold text-right">{String(fp.organizacion)}</dd></div> : null}
            </dl>
          </Tarjeta>
        )}

        {d.parcelas.map(p => {
          const cultivos = d.cultivos.filter(c => c.up_id === p.up_id);
          if (cultivos.length === 0 && !p.tiene_frijol) return null;
          const a = anillo(p.geom_geojson);
          const lat = a ? a.reduce((s, x) => s + x[1], 0) / a.length : 0, lng = a ? a.reduce((s, x) => s + x[0], 0) / a.length : 0;
          return (
            <Tarjeta key={p.up_id} titulo={`Parcela ${p.numero_up ?? ''}`.trim()}>
              <p className="text-[17px] font-bold text-slate-900">{p.up_name}</p>
              <p className="text-[13.5px] text-slate-500 mt-0.5 mb-3">ID {p.up_id} · {p.municipality_name}, {p.state_name} · {(p.area_ha_real ?? p.area_ha_calc) ? `${Number(p.area_ha_real ?? p.area_ha_calc).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha` : ''}</p>
              {a && <MapaUP lat={lat} lng={lng} locationConfirmed centroidSource="productor" height="160px" zoom={15} poligono={a} />}
              <div className="mt-4 space-y-3">
                {cultivos.map(c => (
                  <div key={c.cycle_crop_id} className="rounded-2xl bg-slate-50 border border-slate-100 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[15px] font-bold text-slate-900">Frijol · {etiquetaCiclo(c)}</p>
                      <span className="text-[13px] text-slate-500">{Number(c.area_sown_ha).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha</span>
                    </div>
                    <p className="text-[13.5px] text-slate-600 mt-1">{c.variety_other || c.variedad} · siembra {c.fecha_siembra} · cosecha {c.fecha_cosecha_estimada}</p>
                    {!validado && <button onClick={() => abrir({ cultivo: c.cycle_crop_id })} className="mt-3 w-full min-h-[46px] rounded-2xl bg-white border-2 border-slate-200 text-slate-700 text-[14px] font-bold flex items-center justify-center gap-2"><Pencil size={14} /> Corregir cultivo</button>}
                  </div>
                ))}
              </div>
            </Tarjeta>
          );
        })}

        <button onClick={() => navigate('/frijol/tecnico/nuevo', { state: { curp: d.datos.curp, k: Date.now() } })}
          className="w-full min-h-[54px] rounded-2xl bg-[#1A5C38] text-white text-[16px] font-bold flex items-center justify-center gap-2 active:scale-[0.98]"><Plus size={19} /> Agregar otra parcela</button>
      </div>
    </div>
  );
}

void Campo;
