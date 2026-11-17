import fs from 'fs';
import { consultarPersonaPorCURP, DatosSADER } from './saderService';
import { consultarCURPEnRENAPO } from './renapoService';
import { extraerDatosCurp } from '../utils/curp';

// Flujo independiente de verificación de identidad para el programa de Frijol.
// Consulta SADER (Padrón activo) y recurre a RENAPO si no se encuentra en SADER.
// No maneja datos de domicilio, estado, municipio ni localidad (Frijol no gestiona domicilio).

export interface DatosPersonaFrijol {
  curp: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  sexo: string | null;           // 'H' | 'M'
  fecha_nacimiento: string | null; // AAAA-MM-DD
  telefono?: string | null;
  correo?: string | null;
}

export type ResultadoIdentidadFrijol =
  | { tipo: 'PADRON_SADER'; datos: DatosPersonaFrijol }
  | { tipo: 'RENAPO'; datos: DatosPersonaFrijol }
  | { tipo: 'NO_VERIFICABLE'; datos?: Partial<DatosPersonaFrijol> }
  | { tipo: 'CURP_NO_VALIDA' }
  | { tipo: 'CURP_FALLECIDO' };

/** Convierte "15/10/1976" o "1976-10-15" a formato ISO "1976-10-15" */
export function fechaISO(f: string | null | undefined): string | null {
  if (!f) return null;
  const s = String(f).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// ─── Simulador para el ambiente de pruebas ──────────────────────────────────
const ARCHIVO_CAIDA = '/tmp/identidad_caida';

function simularIdentidad(curp: string): ResultadoIdentidadFrijol {
  const clave = curp.slice(13, 16);
  const curpData = extraerDatosCurp(curp);
  const sexo = curpData.valida && curpData.sexo ? curpData.sexo : (curp[10] === 'M' ? 'M' : 'H');
  const fechaNac = curpData.valida && curpData.fechaNacimiento ? curpData.fechaNacimiento : '1980-01-01';
  const base: DatosPersonaFrijol = {
    curp,
    nombres: 'PERSONA',
    apellido_paterno: 'SIMULADA',
    apellido_materno: clave,
    sexo,
    fecha_nacimiento: fechaNac,
  };
  const caida = fs.existsSync(ARCHIVO_CAIDA);
  switch (clave) {
    case 'SAD':
      return { tipo: 'PADRON_SADER', datos: { ...base, telefono: '6180000099' } };
    case 'REN':
      return { tipo: 'RENAPO', datos: base };
    case 'FAL':
      return { tipo: 'CURP_FALLECIDO' };
    case 'INV':
      return { tipo: 'CURP_NO_VALIDA' };
    case 'CAI':
      return caida ? { tipo: 'NO_VERIFICABLE', datos: { curp, sexo, fecha_nacimiento: fechaNac } } : { tipo: 'RENAPO', datos: base };
    case 'CAD':
      return caida ? { tipo: 'NO_VERIFICABLE', datos: { curp, sexo, fecha_nacimiento: fechaNac } } : { tipo: 'CURP_NO_VALIDA' };
    default:
      return { tipo: 'NO_VERIFICABLE', datos: { curp, sexo, fecha_nacimiento: fechaNac } };
  }
}

function desdeSader(d: DatosSADER): DatosPersonaFrijol {
  const curpData = extraerDatosCurp(d.curp);
  const sexoNorm = d.genero === 'M' || d.genero === 'MUJER'
    ? 'M'
    : d.genero === 'H' || d.genero === 'HOMBRE'
      ? 'H'
      : (curpData.valida ? curpData.sexo : null);
  const fechaNorm = fechaISO(d.fecha_nacimiento) || (curpData.valida ? curpData.fechaNacimiento : null);

  return {
    curp: d.curp,
    nombres: d.nombres,
    apellido_paterno: d.apellido_paterno,
    apellido_materno: d.apellido_materno,
    sexo: sexoNorm,
    fecha_nacimiento: fechaNorm,
    telefono: d.telefono ? d.telefono.replace(/\D/g, '').slice(-10) : null,
    correo: d.correo || null,
  };
}

/**
 * Consulta la CURP de forma independiente para Frijol:
 * 1. Consulta la API de SADER. Si se encuentra con padrón activo, devuelve PADRON_SADER.
 * 2. Si SADER no la tiene o está inactiva, consulta RENAPO.
 * 3. Si RENAPO la valida como persona viva, devuelve RENAPO.
 * 4. Si los servicios externos no responden, devuelve NO_VERIFICABLE con datos derivados de la CURP.
 */
export async function consultarIdentidadFrijol(curp: string): Promise<ResultadoIdentidadFrijol> {
  const c = curp.toUpperCase().trim();
  if (process.env.IDENTIDAD_SIMULADA === 'true' && process.env.NODE_ENV !== 'production') {
    return simularIdentidad(c);
  }

  const curpData = extraerDatosCurp(c);

  // 1. Intentar consulta en SADER
  try {
    const sader = await consultarPersonaPorCURP(c);
    if (sader && sader.activo_padron) {
      return { tipo: 'PADRON_SADER', datos: desdeSader(sader) };
    }
  } catch (e: any) {
    console.warn('[frijolIdentidad] SADER no disponible:', e.message);
  }

  // 2. Intentar consulta en RENAPO
  try {
    const renapo = await consultarCURPEnRENAPO(c);
    if (renapo.encontrado) {
      if (renapo.fallecido) {
        return { tipo: 'CURP_FALLECIDO' };
      }
      const d = renapo.datos!;
      const sexoNorm = d.sexo === 'M' || d.sexo === 'MUJER'
        ? 'M'
        : d.sexo === 'H' || d.sexo === 'HOMBRE'
          ? 'H'
          : (curpData.valida ? curpData.sexo : null);
      const fechaNorm = fechaISO(d.fechaNac) || (curpData.valida ? curpData.fechaNacimiento : null);

      return {
        tipo: 'RENAPO',
        datos: {
          curp: d.curp || c,
          nombres: d.nombres,
          apellido_paterno: d.apellidoPat,
          apellido_materno: d.apellidoMat,
          sexo: sexoNorm,
          fecha_nacimiento: fechaNorm,
        },
      };
    }
    if (renapo.codigo === 'NO_EN_RENAPO') {
      return { tipo: 'CURP_NO_VALIDA' };
    }
  } catch (e: any) {
    console.warn('[frijolIdentidad] RENAPO no disponible:', e.message);
  }

  // 3. Servicios no disponibles -> NO_VERIFICABLE con datos matemáticos de la CURP
  return {
    tipo: 'NO_VERIFICABLE',
    datos: {
      curp: c,
      sexo: curpData.valida ? curpData.sexo : null,
      fecha_nacimiento: curpData.valida ? curpData.fechaNacimiento : null,
    },
  };
}
