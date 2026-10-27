import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, UserCheck } from 'lucide-react';
import { api } from '../../../services/api';
import { Aviso, Campo, Texto, Tarjeta } from '../ui';
import { esCurp, vacioParcela } from '../validacion';
import type { Borrador, ParcelaExistente } from '../tipos';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  enLinea: boolean;
  alAvanzar: (paso: number) => void;
  /** CURP con la que se busca sola al abrir (p. ej. "agregar otra parcela") */
  curpInicial?: string;
}

interface Respuesta {
  codigo: string; mensaje?: string; tecnico?: string; producer_id?: number; token_verificacion?: string;
  datos?: Record<string, string | null | boolean>; parcelas?: ParcelaExistente[]; frijol_productor?: Record<string, unknown> | null;
}

// Paso 1 de 7 — Buscar productor por CURP. Nada se guarda en el teléfono hasta que la búsqueda es exitosa.
export default function Paso1Curp({ b, actualizar, enLinea, alAvanzar, curpInicial }: Props) {
  const navigate = useNavigate();
  const [curp, setCurp] = useState(curpInicial || b.curp);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Respuesta | null>(null);

  const valida = esCurp(curp);
  const yaBusco = useRef(false);

  async function buscar() {
    setError(''); setResultado(null);
    if (!valida) { setError('La CURP debe tener 18 caracteres con formato válido'); return; }
    if (!enLinea) { setError('Necesitas señal para buscar la CURP. Tu captura no se pierde.'); return; }
    setBuscando(true);
    try {
      const r = (await api.frijol.consultarCurp(curp.trim().toUpperCase())) as Respuesta;
      setResultado(r); // el técnico lee el resultado y decide con los botones (no se avanza solo)
    } catch (e: unknown) {
      const err = e as Error & { status?: number; codigo?: string };
      if (err.message === 'SIN_CONEXION') setError('Necesitas señal para buscar la CURP. Tu captura no se pierde.');
      else if (err.codigo === 'CURP_NO_VALIDA') setError('Esta CURP no existe en RENAPO. Revisa que esté bien escrita.');
      else if (err.codigo === 'CURP_FALLECIDO') setError('La CURP corresponde a una persona fallecida.');
      else setError(err.message || 'No se pudo consultar la CURP');
    } finally { setBuscando(false); }
  }

  // "Agregar otra parcela": busca sola con la CURP recibida
  useEffect(() => {
    if (curpInicial && !yaBusco.current && esCurp(curpInicial)) { yaBusco.current = true; void buscar(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Prellena el borrador con lo que encontró la búsqueda y pasa al paso siguiente. */
  function aplicar(r: Respuesta, irAParcela = false) {
    const d = (r.datos || {}) as Record<string, string | null>;
    const fecha = (d.fecha_nacimiento || '').toString().slice(0, 10);
    actualizar(prev => ({
      ...prev,
      curp: curp.trim().toUpperCase(),
      consulta: {
        codigo: r.codigo as never, producer_id: r.producer_id, token_verificacion: r.token_verificacion,
        parcelas: r.parcelas || [], tiene_cuenta: !!(d.tiene_cuenta as unknown as boolean), telefono_original: (d.telefono as string) || '',
        bloqueados: ((r as unknown as { campos?: { campo: string; editable: boolean }[] }).campos || []).filter(c => !c.editable).map(c => c.campo),
      },
      productor: {
        nombres: d.nombres || d.nombres === '' ? (d.nombres as string) : prev.productor.nombres,
        apellido_paterno: (d.apellido_paterno as string) || prev.productor.apellido_paterno,
        apellido_materno: (d.apellido_materno as string) || prev.productor.apellido_materno,
        sexo: ((d.sexo || d.genero) as 'H' | 'M') || prev.productor.sexo,
        fecha_nacimiento: fecha || prev.productor.fecha_nacimiento,
        telefono: ((d.telefono as string) || prev.productor.telefono || '').replace(/\D/g, '').slice(-10),
        correo: (d.correo as string) || prev.productor.correo,
      },
      complementaria: r.frijol_productor ? {
        total_ups: Number(r.frijol_productor.total_ups_declaradas) || 1,
        participa: r.frijol_productor.participa_programas_sader as boolean,
        programas_sader: (r.frijol_productor.programas_sader as string[]) || [],
        programas_otro: (r.frijol_productor.programas_sader_otro as string) || '',
        organizacion: (r.frijol_productor.organizacion as string) || '',
        seguro: (r.frijol_productor.seguro_agricola as string) || '',
        seguro_nombre: (r.frijol_productor.seguro_agricola_nombre as string) || '',
      } : prev.complementaria,
      complementaria_resumen: !!r.frijol_productor,
      parcela: vacioParcela(),
      paso: irAParcela ? 4 : 2,
    }));
    alAvanzar(irAParcela ? 4 : 2);
  }

  const c = resultado?.codigo;
  const nombreHallado = resultado?.datos ? `${resultado.datos.nombres || ''} ${resultado.datos.apellido_paterno || ''}`.trim() : '';

  return (
    <div className="space-y-5">
      <Tarjeta>
        <Campo etiqueta="CURP del productor" error={error} ayuda="Escríbela tal como aparece en su documento. Son 18 caracteres.">
          <Texto valor={curp} alCambiar={v => { setCurp(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18)); setResultado(null); setError(''); }}
            maxLength={18} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="XXXX000000XXXXXX00"
            className="font-mono tracking-wider uppercase" error={error} inputMode="text" />
        </Campo>
        <p className="text-[12.5px] text-slate-400 mt-2 text-right" aria-live="polite">{curp.length} / 18</p>
        <button type="button" onClick={buscar} disabled={buscando || !valida}
          className="mt-3 w-full min-h-[54px] rounded-2xl bg-[#1A5C38] text-white text-[16px] font-bold flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition">
          {buscando ? <><Loader2 size={18} className="animate-spin" /> Buscando…</> : <><Search size={18} /> Buscar</>}
        </button>
      </Tarjeta>

      {c === 'EN_FRIJOL_OTRO_TECNICO' && (
        <Aviso tipo="rojo">Este productor ya fue registrado en Frijol por <strong>{resultado?.tecnico}</strong>. No es posible registrarlo de nuevo.</Aviso>
      )}

      {c === 'EN_FRIJOL_PROPIO' && (
        <Tarjeta>
          <div className="flex items-start gap-3 mb-4">
            <UserCheck className="text-[#1A5C38] mt-0.5" size={22} />
            <p className="text-[15px] text-slate-800 leading-snug">Ya registraste a <strong>{String(resultado?.datos?.nombres || '')} {String(resultado?.datos?.apellido_paterno || '')}</strong> en Frijol.</p>
          </div>
          <div className="space-y-2.5">
            <button type="button" onClick={() => aplicar(resultado!, true)}
              className="w-full min-h-[52px] rounded-2xl bg-[#1A5C38] text-white text-[15px] font-bold active:scale-[0.98]">Agregar otra parcela</button>
            <button type="button" onClick={() => navigate(`/frijol/tecnico/productor/${resultado?.producer_id}`)}
              className="w-full min-h-[52px] rounded-2xl bg-white border-2 border-slate-200 text-slate-700 text-[15px] font-bold active:scale-[0.98]">Ver su registro</button>
          </div>
        </Tarjeta>
      )}

      {c === 'EN_SIMAC' && (
        <Aviso tipo="verde">Encontramos a <strong>{nombreHallado}</strong> en SIMAC. Usaremos sus datos y sus parcelas registradas.</Aviso>
      )}
      {c === 'PADRON_SADER' && <Aviso tipo="verde">Encontrado en el padrón de SADER: <strong>{nombreHallado}</strong>.</Aviso>}
      {c === 'RENAPO' && <Aviso tipo="verde">Persona válida en RENAPO: <strong>{nombreHallado}</strong>. No está en los padrones; completa sus datos.</Aviso>}
      {c === 'NO_VERIFICABLE' && (
        <Aviso tipo="ambar">No pudimos verificar la CURP en este momento. Puedes continuar; el sistema la verificará después automáticamente.</Aviso>
      )}

      {resultado && c !== 'EN_FRIJOL_OTRO_TECNICO' && c !== 'EN_FRIJOL_PROPIO' && (
        <button type="button" onClick={() => aplicar(resultado)}
          className="w-full min-h-[54px] rounded-2xl bg-[#1A5C38] text-white text-[16px] font-bold active:scale-[0.98]">Continuar</button>
      )}
    </div>
  );
}
