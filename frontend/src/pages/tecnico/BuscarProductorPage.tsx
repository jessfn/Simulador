import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, CheckCircle2, AlertTriangle, UserX, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';

type Resultado =
  | { tipo: 'PUEDE_ACTIVAR'; nombres: string; apellido_paterno: string; producer_id: number; fuente: string }
  | { tipo: 'NO_EN_PADRON'; datos_renapo: any; fuente: string }
  | { tipo: 'CURP_DUPLICADA' }
  | { tipo: 'ERROR_RED' };

const validarCURP = (c: string) => /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(c.toUpperCase().trim());

export default function BuscarProductorPage() {
  const navigate = useNavigate();
  const [curp, setCurp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function consultar() {
    if (!validarCURP(curp)) {
      setError('El formato de la CURP no es válido.');
      return;
    }
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const res: any = await api.tecnico.consultarCurp(curp.toUpperCase().trim());
      if (res.codigo === 'CURP_DUPLICADA') {
        setResultado({ tipo: 'CURP_DUPLICADA' });
      } else if (res.codigo === 'PUEDE_ACTIVAR') {
        setResultado({
          tipo: 'PUEDE_ACTIVAR',
          nombres: res.nombres,
          apellido_paterno: res.apellido_paterno,
          producer_id: res.producer_id,
          fuente: res.fuente,
        });
      } else if (res.codigo === 'NO_EN_PADRON') {
        setResultado({ tipo: 'NO_EN_PADRON', datos_renapo: res.datos_renapo, fuente: res.fuente });
      } else {
        setError('Respuesta inesperada del servidor.');
      }
    } catch (err: any) {
      if (err?.codigo === 'CURP_DUPLICADA') {
        setResultado({ tipo: 'CURP_DUPLICADA' });
      } else if (err?.codigo === 'CURP_FALLECIDO') {
        setError('Esta CURP corresponde a una persona fallecida. No es posible registrarla.');
      } else if (err?.codigo === 'CURP_NO_VALIDA_RENAPO') {
        setError('Esta CURP no existe en el Registro Nacional de Población. Verifica que esté bien escrita.');
      } else if (err?.codigo === 'INACTIVO_PADRON') {
        setError('El registro de esta CURP en el padrón no está activo.');
      } else {
        setResultado({ tipo: 'ERROR_RED' });
      }
    } finally {
      setLoading(false);
    }
  }

  function continuar() {
    const curpUpper = curp.toUpperCase().trim();
    if (resultado?.tipo === 'PUEDE_ACTIVAR') {
      navigate(`/tecnico/registrar/${curpUpper}/datos`, {
        state: {
          curp: curpUpper,
          nombres: resultado.nombres,
          apellido_paterno: resultado.apellido_paterno,
          producer_id: resultado.producer_id,
          fuente: resultado.fuente,
        },
      });
    } else if (resultado?.tipo === 'NO_EN_PADRON') {
      const d = resultado.datos_renapo || {};
      navigate(`/tecnico/registrar/${curpUpper}/datos`, {
        state: {
          curp: curpUpper,
          nombres: d.nombres,
          apellido_paterno: d.apellido_pat,
          apellido_materno: d.apellido_mat,
          sexo: d.sexo,
          fecha_nac: d.fecha_nac,
          fuente: resultado.fuente,
        },
      });
    }
  }

  const inputCls =
    'w-full border border-slate-200 rounded-2xl px-4 py-3.5 text-[18px] font-mono uppercase text-center tracking-wider focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20 focus:border-[#1A5C38] transition-all';

  return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico title="Registrar productor" subtitle="Paso 1 · Verificación de CURP" back="/tecnico" />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <label className="block text-[13px] font-bold text-slate-700 mb-2">CURP del productor</label>
          <input
            type="text"
            value={curp}
            onChange={e => { setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18)); setError(''); setResultado(null); }}
            placeholder="AAAA000000AAAAAA00"
            maxLength={18}
            className={inputCls}
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-[11px] text-slate-400">18 caracteres obligatorios</p>
            <p className="text-[11px] font-mono text-slate-400">{curp.length}/18</p>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-[12.5px] text-red-600">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> <span>{error}</span>
            </div>
          )}

          <button onClick={consultar} disabled={curp.length !== 18 || loading}
            className="w-full mt-4 bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
            {loading ? (<><Loader2 size={16} className="animate-spin" /> Consultando…</>) : (<><Search size={16} /> Verificar CURP</>)}
          </button>
        </div>

        {resultado?.tipo === 'CURP_DUPLICADA' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
            <UserX size={26} className="text-amber-500 mx-auto mb-2" />
            <p className="text-[14px] font-bold text-amber-800">Este productor ya tiene cuenta activa</p>
            <p className="text-[12.5px] text-amber-600 mt-1">No es necesario registrarlo nuevamente.</p>
          </div>
        )}

        {resultado?.tipo === 'ERROR_RED' && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <AlertTriangle size={26} className="text-red-500 mx-auto mb-2" />
            <p className="text-[13.5px] font-semibold text-red-700">No se puede verificar la CURP en este momento. Intenta más tarde.</p>
          </div>
        )}

        {resultado?.tipo === 'PUEDE_ACTIVAR' && (
          <div className="bg-white rounded-2xl border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-emerald-600" />
              <p className="text-[14px] font-bold text-slate-800">Encontrado en padrón SADER</p>
            </div>
            <p className="text-[16px] font-semibold text-slate-900">{resultado.nombres} {resultado.apellido_paterno}</p>
            <button onClick={continuar}
              className="w-full mt-4 bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              Continuar registro <ArrowRight size={16} />
            </button>
          </div>
        )}

        {resultado?.tipo === 'NO_EN_PADRON' && (
          <div className="bg-white rounded-2xl border border-blue-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-blue-600" />
              <p className="text-[14px] font-bold text-slate-800">Validado por RENAPO</p>
            </div>
            <p className="text-[12.5px] text-slate-500">No está en el padrón SADER, pero su identidad fue confirmada.</p>
            {resultado.datos_renapo?.nombres && (
              <p className="text-[16px] font-semibold text-slate-900 mt-2">
                {resultado.datos_renapo.nombres} {resultado.datos_renapo.apellido_pat} {resultado.datos_renapo.apellido_mat || ''}
              </p>
            )}
            <button onClick={continuar}
              className="w-full mt-4 bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              Continuar registro <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
