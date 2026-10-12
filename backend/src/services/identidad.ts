import fs from 'fs';
import { consultarPersonaPorCURP, DatosSADER } from './saderService';
import { consultarCURPEnRENAPO } from './renapoService';

// Verificación de identidad por CURP para el registro de frijol. A diferencia del registro de maíz, aquí nada bloquea:
//  - padrón SADER inactivo no bloquea: se pasa a RENAPO
//  - servicios caídos no bloquean: queda "no verificable" y se reintenta solo después
// Orden: SADER (padrón activo) -> RENAPO (persona viva) -> no verificable.

export interface DatosPersona {
  curp: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  sexo: string | null;           // 'H' | 'M'
  fecha_nacimiento: string | null; // AAAA-MM-DD
  telefono?: string | null;
  correo?: string | null;
  estado?: string | null;
  municipio?: string | null;
  localidad?: string | null;
}

export type ResultadoIdentidad =
  | { tipo: 'PADRON_SADER'; datos: DatosPersona }
  | { tipo: 'RENAPO'; datos: DatosPersona }
  | { tipo: 'NO_VERIFICABLE' }
  | { tipo: 'CURP_NO_VALIDA' }
  | { tipo: 'CURP_FALLECIDO' };

/** "15/10/1976" o "1976-10-15" -> "1976-10-15" */
export function fechaISO(f: string | null | undefined): string | null {
  if (!f) return null;
  const s = String(f).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// ─── Simulador para el ambiente de PRUEBAS ──────────────────────────────────
// Solo con IDENTIDAD_SIMULADA=true (nunca en producción). Permite probar todos los caminos sin llamar a SADER/RENAPO reales.
// Se decide por las tres consonantes internas de la CURP (posiciones 14 a 16):
//   SAD padrón SADER · REN persona válida en RENAPO · FAL fallecido · INV no existe en RENAPO
//   CAI servicio caído (válida cuando el archivo /tmp/identidad_caida deja de existir)
//   CAD servicio caído (no válida cuando el archivo /tmp/identidad_caida deja de existir)
//   cualquier otra: no verificable
const ARCHIVO_CAIDA = '/tmp/identidad_caida';

function simularIdentidad(curp: string): ResultadoIdentidad {
  const clave = curp.slice(13, 16);
  const sexo = curp[10] === 'M' ? 'M' : 'H';
  const base: DatosPersona = {
    curp, nombres: 'PERSONA', apellido_paterno: 'SIMULADA', apellido_materno: clave, sexo,
    fecha_nacimiento: '1980-01-01',
  };
  const caida = fs.existsSync(ARCHIVO_CAIDA);
  switch (clave) {
    case 'SAD': return { tipo: 'PADRON_SADER', datos: { ...base, telefono: '6180000099', estado: 'DURANGO', municipio: 'DURANGO', localidad: 'EJIDO SIMULADO' } };
    case 'REN': return { tipo: 'RENAPO', datos: base };
    case 'FAL': return { tipo: 'CURP_FALLECIDO' };
    case 'INV': return { tipo: 'CURP_NO_VALIDA' };
    case 'CAI': return caida ? { tipo: 'NO_VERIFICABLE' } : { tipo: 'RENAPO', datos: base };
    case 'CAD': return caida ? { tipo: 'NO_VERIFICABLE' } : { tipo: 'CURP_NO_VALIDA' };
    default: return { tipo: 'NO_VERIFICABLE' };
  }
}

function desdeSader(d: DatosSADER): DatosPersona {
  return {
    curp: d.curp, nombres: d.nombres, apellido_paterno: d.apellido_paterno, apellido_materno: d.apellido_materno,
    sexo: d.genero, fecha_nacimiento: fechaISO(d.fecha_nacimiento), telefono: d.telefono, correo: d.correo,
    estado: d.estado, municipio: d.municipio, localidad: d.localidad,
  };
}

export async function verificarIdentidad(curp: string): Promise<ResultadoIdentidad> {
  const c = curp.toUpperCase().trim();
  if (process.env.IDENTIDAD_SIMULADA === 'true' && process.env.NODE_ENV !== 'production') return simularIdentidad(c);

  let saderCaido = false;
  try {
    const sader = await consultarPersonaPorCURP(c);
    if (sader && sader.activo_padron) return { tipo: 'PADRON_SADER', datos: desdeSader(sader) };
    // SADER no lo tiene o lo tiene inactivo: no bloquea, se pasa a RENAPO
  } catch (e: any) {
    saderCaido = true;
    console.warn('[identidad] SADER no disponible:', e.message);
  }

  const renapo = await consultarCURPEnRENAPO(c);
  if (renapo.encontrado) {
    if (renapo.fallecido) return { tipo: 'CURP_FALLECIDO' };
    const d = renapo.datos!;
    return {
      tipo: 'RENAPO',
      datos: {
        curp: d.curp || c, nombres: d.nombres, apellido_paterno: d.apellidoPat, apellido_materno: d.apellidoMat,
        sexo: d.sexo === 'M' || d.sexo === 'MUJER' ? 'M' : d.sexo === 'H' || d.sexo === 'HOMBRE' ? 'H' : null,
        fecha_nacimiento: fechaISO(d.fechaNac),
      },
    };
  }
  if (renapo.codigo === 'NO_EN_RENAPO') return { tipo: 'CURP_NO_VALIDA' };
  void saderCaido;
  return { tipo: 'NO_VERIFICABLE' };
}
