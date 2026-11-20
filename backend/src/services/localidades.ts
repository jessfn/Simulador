import { PoolClient } from 'pg';
import pool from '../config/database';

const CLAVE_ESTADO_RE = /^\d{2}$/;
const CLAVE_LOCALIDAD_RE = /^\d{9}$/;

export function esClaveDeEstado(valor: unknown): boolean {
  return CLAVE_ESTADO_RE.test(String(valor ?? ''));
}

export function esClaveDeLocalidad(valor: unknown): boolean {
  return CLAVE_LOCALIDAD_RE.test(String(valor ?? ''));
}

/** Localidades de un estado como [clave, nombre]: el municipio son los primeros 5 dígitos de la clave y así la respuesta pesa la mitad. */
export async function listarLocalidadesDeEstado(estadoId: string): Promise<[string, string][]> {
  const resultado = await pool.query(
    `SELECT localidad_id, nombre AS nombre_localidad FROM geo_localidad WHERE municipio_id LIKE $1 ORDER BY municipio_id, nombre`,
    [`${estadoId}%`]
  );
  return resultado.rows.map((fila: { localidad_id: string; nombre_localidad: string }) => [fila.localidad_id, fila.nombre_localidad]);
}

/** Devuelve la localidad solo si pertenece al municipio indicado. */
export async function buscarLocalidadDeMunicipio(
  client: PoolClient, localidadId: unknown, municipioId: unknown
): Promise<{ localidadId: string; nombre: string } | null> {
  if (!esClaveDeLocalidad(localidadId)) return null;
  const resultado = await client.query(
    'SELECT localidad_id, nombre AS nombre_localidad FROM geo_localidad WHERE localidad_id = $1 AND municipio_id = $2',
    [String(localidadId), String(municipioId ?? '')]
  );
  if (resultado.rows.length === 0) return null;
  return { localidadId: resultado.rows[0].localidad_id, nombre: resultado.rows[0].nombre_localidad };
}
