// Comprobante firmado de que la consulta de CURP verificó la identidad; el registro del productor lo exige.
import jwt from 'jsonwebtoken';

const USO_REGISTRO_PRODUCTOR = 'registro_productor';

export type FuenteVerificacion = 'padron_sader' | 'renapo';

export function firmarCurpVerificada(curp: string, fuente: FuenteVerificacion): string {
  return jwt.sign({ curp, fuente, uso: USO_REGISTRO_PRODUCTOR }, process.env.JWT_SECRET!, { expiresIn: '1d' });
}

export function esCurpVerificada(comprobante: unknown, curp: string): boolean {
  if (typeof comprobante !== 'string' || !comprobante) return false;
  try {
    const contenido = jwt.verify(comprobante, process.env.JWT_SECRET!) as { curp?: string; uso?: string };
    return contenido.uso === USO_REGISTRO_PRODUCTOR && contenido.curp === curp;
  } catch {
    return false;
  }
}
