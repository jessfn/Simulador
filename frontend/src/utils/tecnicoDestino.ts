// A dónde entra un técnico después de iniciar sesión, según los programas que tiene asignados.
//  - solo maíz          → /maiz/tecnico
//  - solo frijol        → /frijol/tecnico
//  - ambos              → /tecnico/elegir ("¿Qué vas a registrar hoy?")
// Si el servidor aún no manda `programas` (cuentas anteriores), se respeta el cultivo desde el que entró.

export const PROGRAMA_MAIZ = 'simac_maiz';
export const PROGRAMA_FRIJOL = 'frijol_afb';

export type CultivoEntrada = 'maiz' | 'frijol';

export function destinoTecnico(programas: string[] | undefined | null, entradaPor: CultivoEntrada = 'maiz'): string {
  if (!programas || programas.length === 0) return entradaPor === 'frijol' ? '/frijol/tecnico' : '/maiz/tecnico';
  const maiz = programas.includes(PROGRAMA_MAIZ);
  const frijol = programas.includes(PROGRAMA_FRIJOL);
  if (maiz && frijol) return '/tecnico/elegir';
  if (frijol) return '/frijol/tecnico';
  return '/maiz/tecnico';
}

export function tienePrograma(programas: string[] | undefined | null, programa: string): boolean {
  if (!programas || programas.length === 0) return programa === PROGRAMA_MAIZ; // cuentas anteriores: solo maíz
  return programas.includes(programa);
}
