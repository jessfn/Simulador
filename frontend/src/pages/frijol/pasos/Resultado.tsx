import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, Plus, Home, Layers, Loader2 } from 'lucide-react';
import { api } from '../../../services/api';
import { Aviso } from '../ui';
import type { RespuestaRegistro } from '../tipos';

interface Props {
  resultado: RespuestaRegistro;
  nombre: string;
  curp: string;
  alOtraParcela: () => void;
}

// Pantalla F8 — resultado del envío. No se muestra ni se envía ningún PIN ni mensaje al productor.
export default function Resultado({ resultado, nombre, curp, alOtraParcela }: Props) {
  const navigate = useNavigate();
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

  async function acuse() {
    setBajando(true); setError('');
    try {
      const blob = await api.frijol.acuse(resultado.cycle_crop_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `acuse-frijol-${resultado.cycle_crop_id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { setError('No se pudo descargar el acuse. Revisa tu conexión e intenta de nuevo.'); }
    finally { setBajando(false); }
  }

  const btn = 'w-full min-h-[54px] rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition';
  return (
    <div className="px-4 py-8 space-y-5 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 mx-auto flex items-center justify-center"><CheckCircle2 size={44} className="text-emerald-600" /></div>
      <div>
        <h1 className="text-[26px] font-bold text-slate-900" style={{ fontFamily: 'Patria, Georgia, serif' }}>Registro enviado</h1>
        <p className="text-[16px] text-slate-700 mt-1 font-semibold">{nombre}</p>
        <p className="font-mono text-[12.5px] text-slate-400">{curp}</p>
      </div>
      <div className="bg-white rounded-3xl border border-slate-100 p-5 text-left space-y-2.5 text-[15px]">
        <div className="flex justify-between gap-4"><span className="text-slate-500">ID de parcela</span><strong data-testid="id-parcela">{resultado.id_parcela}</strong></div>
        <div className="flex justify-between gap-4"><span className="text-slate-500">Ciclo</span><strong>{resultado.ciclo}</strong></div>
      </div>
      {resultado.verificacion_identidad === 'pendiente' && (
        <Aviso tipo="ambar">La CURP se verificará automáticamente. Si hay un problema, te avisaremos aquí.</Aviso>
      )}
      {resultado.avisos?.map(a => <Aviso key={a} tipo="ambar">{a}</Aviso>)}
      {error && <Aviso tipo="rojo">{error}</Aviso>}
      <div className="space-y-3 pt-2">
        <button type="button" onClick={acuse} disabled={bajando} className={`${btn} bg-[#1A5C38] text-white disabled:opacity-60`}>
          {bajando ? <><Loader2 size={18} className="animate-spin" /> Descargando…</> : <><Download size={18} /> Descargar acuse</>}
        </button>
        <button type="button" onClick={alOtraParcela} className={`${btn} bg-white border-2 border-slate-200 text-slate-800`}><Layers size={18} /> Agregar otra parcela de este productor</button>
        <button type="button" onClick={() => navigate('/frijol/tecnico/nuevo', { replace: true, state: { nuevo: Date.now() } })} className={`${btn} bg-white border-2 border-slate-200 text-slate-800`}><Plus size={18} /> Nuevo registro</button>
        <button type="button" onClick={() => navigate('/frijol/tecnico')} className={`${btn} text-slate-500`}><Home size={18} /> Ir al inicio</button>
      </div>
    </div>
  );
}
