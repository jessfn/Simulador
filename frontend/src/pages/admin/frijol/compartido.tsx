export const fmtNum = (n: number | null | undefined, d = 1) => (n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: d });
export const fmtFecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** Colores por estatus: los mismos en la tabla, la ficha y el mapa. */
export const COLOR_ESTATUS = { verde: '#1A5C38', ambar: '#d97706', rojo: '#dc2626' };
export function claveEstatus(verificacion: string, estatus: string): 'verde' | 'ambar' | 'rojo' {
  if (estatus === 'requiere_correccion' || verificacion === 'no_valida') return 'rojo';
  if (verificacion === 'pendiente') return 'ambar';
  return 'verde';
}

export function Estado({ v, e, dias }: { v: string; e: string; dias?: number | null }) {
  const k = claveEstatus(v, e);
  if (k === 'rojo') return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 whitespace-nowrap">{v === 'no_valida' && e !== 'requiere_correccion' ? 'No válida' : 'Requiere corrección'}</span>;
  if (k === 'ambar') return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">Por verificar{dias != null && dias > 14 ? ` · ${dias} días` : ''}</span>;
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">Verificada</span>;
}
