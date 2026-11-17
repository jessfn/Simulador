// Utilidad de frontend para validación y extracción de datos de la CURP (SIMAC).

export const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;

export interface DatosCurp {
  valida: boolean;
  curp: string;
  sexo: 'H' | 'M' | null;
  fechaNacimiento: string | null; // AAAA-MM-DD
  entidad: string | null;
  error?: string;
}

export const esCurp = (v: string): boolean => {
  if (!v || typeof v !== 'string') return false;
  return CURP_RE.test(v.trim().toUpperCase());
};

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || (anio % 400 === 0);
}

function diasEnMes(anio: number, mes: number): number {
  const diasPorMes = [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return diasPorMes[mes - 1] || 0;
}

/**
 * Extrae sexo ('H' | 'M') y fecha de nacimiento ISO (AAAA-MM-DD) directamente de la CURP.
 */
export function extraerDatosCurp(curpRaw: string): DatosCurp {
  const curp = String(curpRaw || '').trim().toUpperCase();
  if (!CURP_RE.test(curp)) {
    return { valida: false, curp, sexo: null, fechaNacimiento: null, entidad: null, error: 'La CURP no tiene formato válido' };
  }

  const sexoChar = curp[10];
  const sexo: 'H' | 'M' = sexoChar === 'M' ? 'M' : 'H';
  const entidad = curp.slice(11, 13);

  const yy = parseInt(curp.slice(4, 6), 10);
  const mm = parseInt(curp.slice(6, 8), 10);
  const dd = parseInt(curp.slice(8, 10), 10);

  const sigloChar = curp[16];
  const siglo = /[A-Z]/.test(sigloChar) ? 2000 : 1900;
  const anio = siglo + yy;

  if (mm < 1 || mm > 12) {
    return { valida: false, curp, sexo, fechaNacimiento: null, entidad, error: 'Mes inválido en CURP' };
  }

  const maxDias = diasEnMes(anio, mm);
  if (dd < 1 || dd > maxDias) {
    return { valida: false, curp, sexo, fechaNacimiento: null, entidad, error: 'Día inválido en CURP' };
  }

  const fechaNacimiento = `${anio}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return { valida: true, curp, sexo, fechaNacimiento, entidad };
}

/**
 * Verifica si los datos proporcionados coinciden con los de la CURP.
 */
export function coincideConCurp(
  curpRaw: string,
  datos: { fecha_nacimiento?: string | null; sexo?: string | null }
): { coincide: boolean; error?: string } {
  const d = extraerDatosCurp(curpRaw);
  if (!d.valida) return { coincide: false, error: d.error };

  if (datos.sexo && datos.sexo !== d.sexo) {
    return { coincide: false, error: 'El sexo no coincide con la CURP' };
  }

  if (datos.fecha_nacimiento && String(datos.fecha_nacimiento).slice(0, 10) !== d.fechaNacimiento) {
    return { coincide: false, error: 'La fecha de nacimiento no coincide con la CURP' };
  }

  return { coincide: true };
}
