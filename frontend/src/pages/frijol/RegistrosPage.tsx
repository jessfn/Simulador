import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, Loader2, ClipboardList } from 'lucide-react';
import { api } from '../../services/api';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';
import { useConexion } from './useConexion';

interface Fila {
  producer_id: number; curp: string; nombres: string; apellido_paterno: string; apellido_materno: string | null; municipio: string | null;
  verificacion_identidad: 'verificada' | 'pendiente' | 'no_valida'; estatus_registro: string; fecha_alta: string; parcelas_frijol: number; ha_frijol: number;
}

const FILTROS = [
  { clave: '', texto: 'Todos' },
  { clave: 'pendiente', texto: 'Por verificar' },
  { clave: 'requiere_correccion', texto: 'Por corregir' },
] as const;

export function EtiquetaEstado({ fila }: { fila: Pick<Fila, 'verificacion_identidad' | 'estatus_registro'> }) {
  if (fila.estatus_registro === 'requiere_correccion' || fila.verificacion_identidad === 'no_valida') return <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-800 whitespace-nowrap">Requiere corrección</span>;
  if (fila.verificacion_identidad === 'pendiente') return <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">Pendiente de verificación</span>;
  return <span className="text-[12px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">Enviado</span>;
}

// F9 — Mis registros: buscador y filtros por estado.
export default function RegistrosPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const enLinea = useConexion();
  const [q, setQ] = useState('');
  const filtro = params.get('estatus') === 'requiere_correccion' ? 'requiere_correccion' : params.get('verificacion') === 'pendiente' ? 'pendiente' : '';
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    try {
      const r: any = await api.frijol.misRegistros({
        q: q.trim() || undefined,
        estatus: filtro === 'requiere_correccion' ? 'requiere_correccion' : undefined,
        verificacion: filtro === 'pendiente' ? 'pendiente' : undefined,
      });
      setFilas(r.registros);
    } catch { setError('No se pudieron cargar tus registros. Revisa tu conexión.'); setFilas(prev => prev ?? []); }
  }, [q, filtro]);

  useEffect(() => { const t = setTimeout(() => void cargar(), 250); return () => clearTimeout(t); }, [cargar, enLinea]);

  function elegir(clave: string) {
    const n = new URLSearchParams();
    if (clave === 'requiere_correccion') n.set('estatus', clave);
    if (clave === 'pendiente') n.set('verificacion', 'pendiente');
    setParams(n, { replace: true });
  }

  return (
    <div>
      <PageHeaderTecnico title="Mis registros" back="/frijol/tecnico" />
      <div className="px-4 pt-2 pb-6 space-y-3.5">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o CURP" aria-label="Buscar por nombre o CURP"
            className="w-full min-h-[52px] bg-white border-2 border-slate-200 rounded-2xl pl-11 pr-4 text-[16px] outline-none focus:border-[#1A5C38]" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar registros">
          {FILTROS.map(f => (
            <button key={f.clave} role="tab" aria-selected={filtro === f.clave} onClick={() => elegir(f.clave)}
              className={`min-h-[44px] px-4 rounded-full text-[14px] font-bold border-2 whitespace-nowrap ${filtro === f.clave ? 'bg-[#1A5C38] border-[#1A5C38] text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{f.texto}</button>
          ))}
        </div>

        {error && <div className="rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[14px] px-4 py-3">{error}</div>}
        {filas === null ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#1A5C38]" size={26} /></div>
        ) : filas.length === 0 ? (
          <div className="text-center py-14 text-slate-400"><ClipboardList className="mx-auto mb-3" size={34} /><p className="text-[15px] font-semibold text-slate-500">Sin registros</p><p className="text-[13px]">{q || filtro ? 'Ningún registro coincide con tu búsqueda.' : 'Aún no has registrado productores de frijol.'}</p></div>
        ) : (
          <ul className="space-y-2.5">
            {filas.map(f => (
              <li key={f.producer_id}>
                <button onClick={() => navigate(`/frijol/tecnico/productor/${f.producer_id}`)}
                  className="w-full text-left bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-bold text-slate-900 truncate">{[f.nombres, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')}</p>
                    <p className="text-[13px] text-slate-500 mt-0.5 truncate">{f.municipio || '—'} · {f.parcelas_frijol} parcela{f.parcelas_frijol === 1 ? '' : 's'} · {Number(f.ha_frijol).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha de frijol</p>
                    <div className="mt-2"><EtiquetaEstado fila={f} /></div>
                  </div>
                  <ChevronRight className="text-slate-300 flex-shrink-0" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
