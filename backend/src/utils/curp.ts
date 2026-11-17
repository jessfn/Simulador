// Utilidad centralizada de validación y extracción de metadatos de CURP (SIMAC).
// Cumple con la estructura oficial de RENAPO.

export const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;

export interface DatosCurp {
  valida: boolean;
  curp: string;
  sexo: 'H' | 'M' | null;
  fechaNacimiento: string | null; // AAAA-MM-DD
  entidad: string | null;
  error?: string;
}

export function validarEstructuraCurp(curp: string): boolean {
  if (!curp || typeof curp !== 'string') return false;
  return CURP_RE.test(curp.trim().toUpperCase());
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || (anio % 400 === 0);
}

function diasEnMes(anio: number, mes: number): number {
  const diasPorMes = [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return diasPorMes[mes - 1] || 0;
}

/**
 * Extrae sexo, fecha de nacimiento ISO y entidad federativa directamente de la CURP.
 * La posición 17 (índice 16) determina el siglo:
 *  - Si es letra (A-Z) -> siglo XXI (2000-2099).
 *  - Si es dígito (0-9) -> siglo XX (1900-1999).
 */
export function extraerDatosCurp(curpRaw: string): DatosCurp {
  const curp = String(curpRaw || '').trim().toUpperCase();
  if (!CURP_RE.test(curp)) {
    return { valida: false, curp, sexo: null, fechaNacimiento: null, entidad: null, error: 'Formato de CURP inválido (18 caracteres con estructura oficial)' };
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
    return { valida: false, curp, sexo, fechaNacimiento: null, entidad, error: `Mes en CURP inválido: ${mm}` };
  }

  const maxDias = diasEnMes(anio, mm);
  if (dd < 1 || dd > maxDias) {
    return { valida: false, curp, sexo, fechaNacimiento: null, entidad, error: `Día en CURP inválido para el mes ${mm}: ${dd}` };
  }

  const fechaNacimiento = `${anio}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  return { valida: true, curp, sexo, fechaNacimiento, entidad };
}

/**
 * Valida que los datos provistos coincidan con los codificados en la CURP.
 */
export function coincideConCurp(
  curpRaw: string,
  datos: { fecha_nacimiento?: string | null; sexo?: string | null }
): { coincide: boolean; error?: string } {
  const d = extraerDatosCurp(curpRaw);
  if (!d.valida) return { coincide: false, error: d.error || 'CURP inválida' };

  if (datos.sexo) {
    const s = String(datos.sexo).trim().toUpperCase();
    const sexoNorm = s === 'M' || s === 'MUJER' ? 'M' : s === 'H' || s === 'HOMBRE' ? 'H' : s;
    if (sexoNorm !== d.sexo) {
      return { coincide: false, error: `El sexo (${sexoNorm}) no coincide con el sexo de la CURP (${d.sexo})` };
    }
  }

  if (datos.fecha_nacimiento) {
    const fn = String(datos.fecha_nacimiento).trim().slice(0, 10);
    if (fn !== d.fechaNacimiento) {
      return { coincide: false, error: `La fecha de nacimiento (${fn}) no coincide con la fecha de la CURP (${d.fechaNacimiento})` };
    }
  }

  return { coincide: true };
}
