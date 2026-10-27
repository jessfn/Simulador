import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, AlertTriangle, Trash2, FileEdit, ChevronRight, WifiOff } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/auth';
import IconoFrijol from '../../components/IconoFrijol';
import { borrarBorrador, listarBorradores } from './almacen';
import { useConexion } from './useConexion';
import { ResumenSolicitudes } from '../../components/solicitudes/SolicitudesCambio';
import { NOMBRES_PASOS } from './tipos';
import type { Borrador } from './tipos';

interface Contadores { total: number; enviados: number; pendientes_verificacion: number; requieren_correccion: number }

const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Tablero de Frijol (F0): acceso al registro, borradores sin enviar, correcciones pendientes y contadores.
export default function FrijolTableroPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const enLinea = useConexion();
  const nombre = user?.nombre_completo || user?.nombres || 'Técnico';
  const [contadores, setContadores] = useState<Contadores | null>(null);
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [confirmar, setConfirmar] = useState<Borrador | null>(null);

  const cargar = useCallback(async () => {
    setBorradores(await listarBorradores());
    try { const r: any = await api.frijol.misRegistros(); setContadores(r.contadores); } catch { /* sin señal: se quedan los últimos contadores */ }
  }, []);
  useEffect(() => { void cargar(); }, [cargar, enLinea]);

  async function eliminar(b: Borrador) { await borrarBorrador(b.id); setConfirmar(null); setBorradores(await listarBorradores()); }

  const tarjeta = 'rounded-3xl p-4 text-left w-full active:scale-[0.99] transition-transform';
  return (
    <div className="px-4 py-5 space-y-4">
      {!enLinea && <div className="rounded-2xl bg-amber-400 text-amber-950 text-[13.5px] font-semibold px-4 py-2.5 flex items-center gap-2" role="status"><WifiOff size={16} /> Sin conexión. Lo que captures se guarda en tu teléfono.</div>}

      <section className="rounded-3xl bg-gradient-to-br from-[#0f3821] to-[#1A5C38] text-white p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <IconoFrijol className="h-10 w-10 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-emerald-200/90 uppercase tracking-[0.12em]">Registro de Frijol{user?.tipo_tecnico_etiqueta ? ` · ${user.tipo_tecnico_etiqueta}` : ''}</p>
            <h1 className="text-[22px] font-bold leading-tight break-words" style={{ fontFamily: 'Patria, Georgia, serif' }}>Hola, {nombre}</h1>
          </div>
        </div>
        <button onClick={() => navigate('/frijol/tecnico/nuevo')}
          className="mt-5 w-full min-h-[56px] flex items-center justify-center gap-2 rounded-2xl bg-white text-[#1A5C38] font-bold text-[17px] active:scale-[0.98] transition-transform">
          <Plus size={21} /> Nuevo registro
        </button>
      </section>

      <ResumenSolicitudes ruta="/frijol/tecnico/solicitudes" />

      {borradores.length > 0 && (
        <section className="rounded-3xl bg-white border border-amber-200 p-4" aria-label="Registros sin enviar">
          <h2 className="text-[15px] font-bold text-slate-900 flex items-center gap-2"><FileEdit size={17} className="text-amber-600" /> Tienes {borradores.length} registro{borradores.length === 1 ? '' : 's'} sin enviar</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {borradores.map(b => {
              const quien = `${b.productor.nombres} ${b.productor.apellido_paterno}`.trim() || b.curp;
              return (
                <li key={b.id} className="py-3">
                  <p className="text-[15px] font-semibold text-slate-900 break-words">{quien}</p>
                  <p className="text-[13px] text-slate-500">{b.estado === 'listo_para_enviar' ? 'Listo para enviar' : `Paso ${b.paso}: ${NOMBRES_PASOS[b.paso - 1]}`} · {fmt(b.actualizado)}</p>
                  <div className="flex gap-2.5 mt-2.5">
                    <button onClick={() => navigate(`/frijol/tecnico/nuevo/${b.id}`)} className="flex-1 min-h-[46px] rounded-2xl bg-[#1A5C38] text-white text-[14px] font-bold">{b.estado === 'listo_para_enviar' ? 'Revisar y enviar' : 'Continuar'}</button>
                    <button onClick={() => setConfirmar(b)} aria-label={`Eliminar el borrador de ${quien}`} className="min-w-[46px] min-h-[46px] rounded-2xl bg-white border-2 border-slate-200 text-slate-500 flex items-center justify-center"><Trash2 size={17} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {contadores && contadores.requieren_correccion > 0 && (
        <button onClick={() => navigate('/frijol/tecnico/registros?estatus=requiere_correccion')} className={`${tarjeta} bg-red-50 border border-red-200 flex items-center gap-3`}>
          <AlertTriangle className="text-red-600 flex-shrink-0" size={22} />
          <span className="flex-1"><span className="block text-[15px] font-bold text-red-800">{contadores.requieren_correccion} registro{contadores.requieren_correccion === 1 ? ' necesita' : 's necesitan'} corrección</span>
            <span className="block text-[13px] text-red-700">La CURP no es válida. Toca para corregirla.</span></span>
          <ChevronRight className="text-red-400" size={18} />
        </button>
      )}

      <div className="grid grid-cols-3 gap-2.5" aria-label="Resumen">
        {[
          { n: contadores?.enviados, t: 'Enviados', c: 'text-emerald-700' },
          { n: contadores?.pendientes_verificacion, t: 'Por verificar', c: 'text-amber-700' },
          { n: contadores?.requieren_correccion, t: 'Por corregir', c: 'text-red-700' },
        ].map(x => (
          <div key={x.t} className="rounded-2xl bg-white border border-slate-100 py-3.5 text-center">
            <p className={`text-[24px] font-bold leading-none ${x.c}`}>{x.n ?? '—'}</p>
            <p className="text-[12px] text-slate-500 font-medium mt-1.5">{x.t}</p>
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/frijol/tecnico/registros')} className={`${tarjeta} bg-white border border-slate-200 flex items-center gap-3`}>
        <span className="w-12 h-12 rounded-2xl bg-[#eef8f2] text-[#1A5C38] flex items-center justify-center"><ClipboardList size={22} /></span>
        <span className="flex-1"><span className="block text-[16px] font-bold text-slate-900">Mis registros</span><span className="block text-[13px] text-slate-500">Productores de frijol que has registrado</span></span>
        <ChevronRight className="text-slate-300" size={18} />
      </button>

      {confirmar && (
        <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmar(null)} />
          <div className="relative bg-white rounded-3xl p-5 w-full max-w-sm">
            <h3 className="text-[17px] font-bold text-slate-900">¿Eliminar este borrador?</h3>
            <p className="text-[14px] text-slate-600 mt-1.5">Se perderá lo que capturaste de {`${confirmar.productor.nombres} ${confirmar.productor.apellido_paterno}`.trim() || confirmar.curp}. No se puede deshacer.</p>
            <div className="flex gap-2.5 mt-4">
              <button onClick={() => setConfirmar(null)} className="flex-1 min-h-[50px] rounded-2xl bg-slate-100 text-slate-700 font-bold">Cancelar</button>
              <button onClick={() => eliminar(confirmar)} className="flex-1 min-h-[50px] rounded-2xl bg-red-600 text-white font-bold">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
