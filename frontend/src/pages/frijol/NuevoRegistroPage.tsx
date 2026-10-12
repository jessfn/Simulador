import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, WifiOff, X } from 'lucide-react';
import { api } from '../../services/api';
import { borrarBorrador, leerBorrador } from './almacen';
import { useBorrador, useCatalogos, useMunicipios } from './useRegistro';
import { useConexion } from './useConexion';
import {
  borradorNuevo, construirCuerpo, superficieParcela, validarCultivo, validarComplementaria, validarParcela, validarProductor, validarSemillas,
} from './validacion';
import type { Errores } from './validacion';
import { NOMBRES_PASOS } from './tipos';
import type { Borrador, RespuestaRegistro } from './tipos';
import Paso1Curp from './pasos/Paso1Curp';
import Paso2Productor from './pasos/Paso2Productor';
import Paso3Complementaria from './pasos/Paso3Complementaria';
import Paso4Parcela from './pasos/Paso4Parcela';
import Paso5Semillas from './pasos/Paso5Semillas';
import FormularioCultivo from './pasos/FormularioCultivo';
import Paso7Revisar from './pasos/Paso7Revisar';
import Resultado from './pasos/Resultado';
import { Aviso } from './ui';

const TOTAL_PASOS = 7;

// Asistente de registro de frijol: 7 pasos, borrador automático en el teléfono y envío con clave de idempotencia.
export default function NuevoRegistroPage() {
  const { id } = useParams();
  const location = useLocation();
  const [inicial, setInicial] = useState<Borrador | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setInicial(null);
    (async () => {
      const guardado = id ? await leerBorrador(id) : null;
      if (!vivo) return;
      setInicial(guardado || borradorNuevo(''));
      setCargando(false);
    })();
    return () => { vivo = false; };
    // "Nuevo registro" desde el resultado vuelve a esta misma ruta: location.key distingue la visita
  }, [id, location.key]);

  if (cargando || !inicial) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[#1A5C38]" size={28} /></div>;
  }
  return <Asistente key={inicial.id + location.key} inicial={inicial} curpInicial={(location.state as { curp?: string } | null)?.curp} />;
}

function Asistente({ inicial, curpInicial }: { inicial: Borrador; curpInicial?: string }) {
  const navigate = useNavigate();
  const { b, actualizar, guardarYa } = useBorrador(inicial);
  const { catalogos, estados, zona, cargando: cargandoCat, sinDatos } = useCatalogos();
  const municipios = useMunicipios(b.parcela.state_id);
  const topRef = useRef<HTMLDivElement>(null);

  const enLinea = useConexion(en => { if (!en) actualizar(prev => ({ ...prev, hubo_desconexion: true })); });
  useEffect(() => { if (!enLinea && !b.hubo_desconexion) actualizar(prev => ({ ...prev, hubo_desconexion: true })); }, [enLinea, b.hubo_desconexion, actualizar]);

  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [errorMapa, setErrorMapa] = useState('');
  const [resultado, setResultado] = useState<RespuestaRegistro | null>(null);

  const paso = b.paso;
  const parcelaExistente = b.consulta?.parcelas?.find(u => u.up_id === b.parcela.up_id) || null;
  const superficie = superficieParcela(b.parcela, parcelaExistente);
  const nombreMunicipio = municipios.find(m => m.municipality_id === b.parcela.municipality_id)?.name || parcelaExistente?.municipality_name || '';

  const { errores, avisos } = useMemo((): { errores: Errores; avisos: ReturnType<typeof validarCultivo>['avisos'] } => {
    switch (paso) {
      case 2: return { errores: validarProductor(b), avisos: {} };
      case 3: return { errores: b.complementaria_resumen ? {} : validarComplementaria(b), avisos: {} };
      case 4: return { errores: validarParcela(b), avisos: {} };
      case 5: return { errores: validarSemillas(b), avisos: {} };
      case 6: return validarCultivo(b, superficie);
      case 7: return { errores: b.confirmacion ? {} : { confirmacion: 'Confirma que la información fue proporcionada por el productor' }, avisos: {} };
      default: return { errores: {}, avisos: {} };
    }
  }, [b, paso, superficie]);

  function irA(n: number) {
    setMostrar(false); setErrorEnvio(''); setErrorMapa('');
    actualizar(prev => ({ ...prev, paso: n }));
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: 'start' }));
  }

  function siguiente() {
    if (Object.keys(errores).length > 0) {
      setMostrar(true);
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    irA(Math.min(TOTAL_PASOS, paso + 1));
  }

  function atras() {
    // Si "agregar otra parcela" saltó directo al paso 4, regresar lleva al paso 3 (resumen)
    if (paso <= 1) { navigate('/frijol/tecnico'); return; }
    irA(paso - 1);
  }

  /** Lleva al paso donde está el campo que el servidor rechazó. */
  function pasoDeCampo(campo?: string): number {
    if (!campo) return 6;
    const pref = campo.split('.')[0];
    return ({ productor: 2, frijol_productor: 3, parcela: 4, semillas: 5, cultivo: 6 } as Record<string, number>)[pref] || 6;
  }

  async function enviar() {
    if (!b.confirmacion) { setMostrar(true); return; }
    setEnviando(true); setErrorEnvio('');
    const control = new AbortController();
    const reloj = window.setTimeout(() => control.abort(), 30000);
    try {
      guardarYa();
      const r = (await api.frijol.registrar(construirCuerpo(b), b.id, control.signal)) as RespuestaRegistro;
      await borrarBorrador(b.id);
      setResultado(r);
    } catch (e: unknown) {
      const err = e as Error & { status?: number; codigo?: string; campo?: string; name?: string };
      if (err.message === 'SIN_CONEXION' || err.name === 'AbortError') {
        actualizar(prev => ({ ...prev, estado: 'listo_para_enviar' }));
        setErrorEnvio('No se pudo enviar. Tu registro quedó guardado en el teléfono; toca "Reintentar" cuando tengas señal.');
      } else if (err.codigo === 'UP_OVERLAP' || err.codigo === 'UP_OVERLAP_CROSS') {
        setErrorMapa(err.message); irA(4);
      } else if (err.codigo === 'EN_FRIJOL_OTRO_TECNICO') {
        setErrorEnvio(err.message);
      } else if (err.status === 400 || err.status === 409) {
        setErrorEnvio(err.message);
        const campo = (err as unknown as { campo?: string }).campo;
        if (campo) { irA(pasoDeCampo(campo)); setMostrar(true); setErrorEnvio(err.message); }
      } else {
        setErrorEnvio(err.message || 'No se pudo enviar el registro.');
      }
    } finally { window.clearTimeout(reloj); setEnviando(false); }
  }

  if (resultado) {
    return (
      <Resultado resultado={resultado} curp={b.curp} nombre={`${b.productor.nombres} ${b.productor.apellido_paterno}`.trim()}
        alOtraParcela={() => navigate('/frijol/tecnico/nuevo', { replace: true, state: { curp: b.curp, k: Date.now() } })} />
    );
  }

  const progreso = (paso / TOTAL_PASOS) * 100;
  const e = mostrar ? errores : {};

  return (
    <div className="min-h-full flex flex-col">
      {!enLinea && (
        <div className="sticky top-0 z-30 bg-amber-400 text-amber-950 text-[13.5px] font-semibold px-4 py-2 flex items-center gap-2" role="status">
          <WifiOff size={16} /> Sin conexión. Lo que captures se guarda en tu teléfono.
        </div>
      )}

      <div ref={topRef} className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-bold text-[#1A5C38] uppercase tracking-[0.12em]">Paso {paso} de {TOTAL_PASOS}</p>
            <h1 className="text-[22px] font-bold text-slate-900 leading-tight" style={{ fontFamily: 'Patria, Georgia, serif' }}>{NOMBRES_PASOS[paso - 1]}</h1>
          </div>
          <button type="button" onClick={() => { guardarYa(); navigate('/frijol/tecnico'); }} aria-label="Salir (se guarda el borrador)"
            className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0"><X size={19} className="text-slate-500" /></button>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 mt-3 overflow-hidden" aria-hidden="true"><div className="h-full bg-[#1A5C38] transition-all duration-300" style={{ width: `${progreso}%` }} /></div>
      </div>

      <div className="flex-1 px-4 pt-3 pb-6 space-y-4">
        {sinDatos && !cargandoCat && <Aviso tipo="rojo">No se pudieron cargar las listas del formulario. Conéctate una vez para guardarlas en el teléfono.</Aviso>}
        {paso === 1 && <Paso1Curp b={b} actualizar={actualizar} enLinea={enLinea} alAvanzar={n => irA(n)} curpInicial={curpInicial} />}
        {paso === 2 && <Paso2Productor b={b} actualizar={actualizar} errores={e} />}
        {paso === 3 && <Paso3Complementaria b={b} actualizar={actualizar} catalogos={catalogos} errores={e} />}
        {paso === 4 && <Paso4Parcela b={b} actualizar={actualizar} catalogos={catalogos} estados={estados} zona={zona} errores={e} errorServidor={errorMapa} />}
        {paso === 5 && <Paso5Semillas b={b} actualizar={actualizar} errores={e} />}
        {paso === 6 && <FormularioCultivo b={b} actualizar={actualizar} catalogos={catalogos} errores={e} avisos={avisos} superficie={superficie} />}
        {paso === 7 && <Paso7Revisar b={b} actualizar={actualizar} catalogos={catalogos} estados={estados} nombreMunicipio={nombreMunicipio} irAPaso={irA} errorEnvio={errorEnvio} enLinea={enLinea} />}
        {paso === 7 && mostrar && errores.confirmacion && <p role="alert" className="text-[13px] text-red-600 font-medium">{errores.confirmacion}</p>}
      </div>

      {paso > 1 && (
        <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 flex gap-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={atras} disabled={enviando}
            className="min-h-[52px] px-5 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 text-[15px] font-bold flex items-center gap-1.5 active:scale-[0.98]"><ArrowLeft size={17} /> Atrás</button>
          {paso < TOTAL_PASOS ? (
            <button type="button" onClick={siguiente}
              className={`flex-1 min-h-[52px] rounded-2xl text-[16px] font-bold text-white active:scale-[0.98] transition ${Object.keys(errores).length > 0 ? 'bg-[#1A5C38]/50' : 'bg-[#1A5C38]'}`}>Siguiente</button>
          ) : (
            <button type="button" onClick={enviar} disabled={enviando}
              className="flex-1 min-h-[52px] rounded-2xl text-[16px] font-bold text-white bg-[#1A5C38] disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]">
              {enviando ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : b.estado === 'listo_para_enviar' || errorEnvio.includes('Reintentar') ? <><Send size={17} /> Reintentar</> : <><Send size={17} /> Enviar registro</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
