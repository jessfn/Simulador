// Inferencia del ciclo agrícola según el calendario SIAP (fecha de siembra + régimen hídrico).
// COPIA EXACTA de backend/src/services/cicloSIAP.ts: si cambia una, cambia la otra. El servidor siempre recalcula.
// Está aquí para que el técnico vea el ciclo al instante y pueda llenar el formulario sin señal.

export type TipoCiclo = 'PV' | 'OI' | 'ANUAL';
export type Regimen = 'temporal' | 'riego';

export interface CicloInferido {
  necesitaElegir: boolean;
  opciones: TipoCiclo[];
  cycle_type?: TipoCiclo;
  cycle_year?: number;
  etiqueta?: string;
  mes: number;
}

export interface CicloResuelto { cycle_type: TipoCiclo; cycle_year: number; etiqueta: string }

function partesFecha(fecha: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''));
  if (!m) return null;
  const anio = Number(m[1]); const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return { anio, mes };
}

function etiquetaDe(tipo: TipoCiclo, anio: number): string {
  if (tipo === 'OI') return `OI ${anio}-${String((anio + 1) % 100).padStart(2, '0')}`;
  if (tipo === 'PV') return `PV ${anio}`;
  return `Anual ${anio}`;
}

function anioDelCiclo(tipo: TipoCiclo, anio: number, mes: number): number {
  if (tipo === 'OI') return mes <= 3 ? anio - 1 : anio;
  return anio;
}

export function resolverCiclo(fecha: string, tipo: TipoCiclo): CicloResuelto | null {
  const f = partesFecha(fecha);
  if (!f) return null;
  const cycle_year = anioDelCiclo(tipo, f.anio, f.mes);
  return { cycle_type: tipo, cycle_year, etiqueta: etiquetaDe(tipo, cycle_year) };
}

export function inferirCiclo(fecha: string, regimen: Regimen): CicloInferido | null {
  const f = partesFecha(fecha);
  if (!f) return null;
  const { mes } = f;
  if (regimen === 'riego') {
    return { necesitaElegir: true, opciones: ['PV', 'OI', 'ANUAL'], mes };
  }
  if (mes === 3 || mes === 8 || mes === 9) {
    return { necesitaElegir: true, opciones: ['PV', 'OI'], mes };
  }
  const tipo: TipoCiclo = mes >= 4 && mes <= 7 ? 'PV' : 'OI';
  const r = resolverCiclo(fecha, tipo)!;
  return { necesitaElegir: false, opciones: [], cycle_type: r.cycle_type, cycle_year: r.cycle_year, etiqueta: r.etiqueta, mes };
}

export function cicloFinal(fecha: string, regimen: Regimen, elegido?: string | null): { ok: true; ciclo: CicloResuelto } | { ok: false; error: string } {
  const inf = inferirCiclo(fecha, regimen);
  if (!inf) return { ok: false, error: 'La fecha de siembra no es válida' };
  if (!inf.necesitaElegir) {
    return { ok: true, ciclo: { cycle_type: inf.cycle_type!, cycle_year: inf.cycle_year!, etiqueta: inf.etiqueta! } };
  }
  const tipo = String(elegido || '').toUpperCase() as TipoCiclo;
  if (!inf.opciones.includes(tipo)) {
    return { ok: false, error: `Elige el tipo de ciclo (${inf.opciones.join(', ')}) para esta fecha de siembra` };
  }
  return { ok: true, ciclo: resolverCiclo(fecha, tipo)! };
}
