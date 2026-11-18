import { PoolClient } from 'pg';
import { postgisDisponible } from '../utils/postgis';
import { validarUbicacionParcela, validarSuperficieDeclarada, ErrorUbicacion } from './ubicacionParcela';

type ParcelaNuevaFrijol = { poligono: unknown; area_real_ha?: unknown; state_id: unknown };
export type ErrorUbicacionFrijol = ErrorUbicacion & { campo: string };

/** El estado y el tope de superficie de una parcela nueva los decide el polígono, no lo que eligió el técnico. */
export async function validarUbicacionDeParcelaNueva(
  client: PoolClient, parcela: ParcelaNuevaFrijol, nombreEstadoElegido: string
): Promise<ErrorUbicacionFrijol | null> {
  if (!(await postgisDisponible())) return null;
  const ubicacion = await validarUbicacionParcela(client, parcela.poligono);
  if (!ubicacion.ok) return { ...ubicacion, campo: 'parcela.poligono' };
  const superficieDeclarada = validarSuperficieDeclarada(parcela.area_real_ha);
  if (!superficieDeclarada.ok) return { ...superficieDeclarada, campo: 'parcela.area_real_ha' };
  if (ubicacion.estadoId !== String(parcela.state_id)) {
    return {
      ok: false, status: 409, codigo: 'ESTADO_NO_COINCIDE', campo: 'parcela.state_id',
      mensaje: `La parcela dibujada está en ${ubicacion.estadoNombre}, pero elegiste ${nombreEstadoElegido}. Revisa el estado o el trazo.`,
    };
  }
  return null;
}
