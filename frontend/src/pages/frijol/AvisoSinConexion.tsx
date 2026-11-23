import { useEffect, useState } from 'react';
import { CheckCircle2, CloudDownload, Loader2, WifiOff } from 'lucide-react';
import { leerEstadoPrecarga, precargarSinConexion, type EstadoPrecarga } from './precargaSinConexion';

const fechaCorta = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Tarjeta del tablero: descarga con señal lo necesario para capturar en campo y dice si el teléfono ya está listo. */
export default function AvisoSinConexion({ enLinea }: { enLinea: boolean }) {
  const [estado, setEstado] = useState<EstadoPrecarga | null>(null);
  const [descargando, setDescargando] = useState(false);

  async function descargar(forzar: boolean) {
    setDescargando(true);
    try { setEstado(await precargarSinConexion(forzar)); } finally { setDescargando(false); }
  }

  useEffect(() => {
    let vivo = true;
    void leerEstadoPrecarga().then(guardado => { if (vivo) setEstado(guardado); });
    // Al abrir el tablero y cada vez que vuelve la señal
    if (enLinea) {
      void precargarSinConexion(false).then(nuevo => { if (vivo) setEstado(nuevo); });
    }
    return () => { vivo = false; };
  }, [enLinea]);

  if (descargando) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 flex items-center gap-2.5 text-[14px] text-slate-700" role="status">
        <Loader2 size={18} className="animate-spin text-[#1A5C38]" /> Descargando catálogos para trabajar sin señal…
      </div>
    );
  }

  if (!estado) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5 text-[14px] text-amber-900" role="status">
        <WifiOff size={18} className="flex-shrink-0 mt-0.5" />
        <span>{enLinea ? 'Preparando el teléfono para trabajar sin señal…' : 'Conéctate a internet una vez para descargar los catálogos antes de ir a campo.'}</span>
      </div>
    );
  }

  const faltan = estado.estadosPendientes.length;
  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-start gap-2.5 text-[14px] ${faltan ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-[#eef8f2] border-emerald-200 text-[#0f3f26]'}`} role="status">
      {faltan ? <CloudDownload size={18} className="flex-shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />}
      <span className="flex-1">
        <span className="block font-bold">{faltan ? `Faltan las localidades de ${faltan} estado${faltan === 1 ? '' : 's'} de tu zona` : 'Listo para trabajar sin señal'}</span>
        <span className="block text-[13px] opacity-80">Actualizado {fechaCorta(estado.actualizado)}{faltan ? ' · se descargan cuando haya señal' : ''}</span>
      </span>
      {enLinea && (
        <button type="button" onClick={() => void descargar(true)} className="min-h-[44px] px-3 rounded-xl text-[13px] font-bold text-[#1A5C38] active:bg-white/60">
          Actualizar
        </button>
      )}
    </div>
  );
}
