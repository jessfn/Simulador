import { Response, NextFunction } from 'express';
import pool from '../config/database';
import { AuthRequest, tienePermisosTotales } from './auth';

const ROLES_DE_CUENTA_DE_BODEGA = ['bodeguero', 'bodega', 'industria'];

type EstadosDelRegistro = (id: string) => Promise<string[]>;

/** Estados asignados al usuario del panel, en mayúsculas; null cuando ve todo el país. */
export async function estadosAsignados(req: AuthRequest): Promise<string[] | null> {
  const { rows } = await pool.query(
    `SELECT r.aplica_filtro_estado, u.estado_asignado
       FROM usuarios u LEFT JOIN roles_panel r ON r.clave = u.rol
      WHERE u.id = $1`,
    [req.user?.userId]
  );
  const fila = rows[0];
  if (!fila?.aplica_filtro_estado || !fila.estado_asignado?.trim()) return null;
  return String(fila.estado_asignado).split(',').map(e => e.trim().toUpperCase()).filter(Boolean);
}

/** Deja pasar solo si el registro de req.params[parametro] está en alguno de los estados del usuario. */
export function soloDeSuEstado(estadosDelRegistro: EstadosDelRegistro, parametro = 'id') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const asignados = await estadosAsignados(req);
      if (!asignados) { next(); return; }
      const delRegistro = await estadosDelRegistro(req.params[parametro]);
      if (delRegistro.some(e => asignados.includes(e.toUpperCase()))) { next(); return; }
      res.status(403).json({ error: 'Ese registro no pertenece a tu estado' });
    } catch (error) {
      console.error('Error al revisar el estado del registro:', error);
      res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

/** Sin permisos totales solo se administran cuentas de bodega; así nadie edita la cuenta de un administrador. */
export function soloCuentasDeBodega(parametro = 'id') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await tienePermisosTotales(req.user?.rol)) { next(); return; }
      const { rows } = await pool.query('SELECT rol FROM usuarios WHERE id = $1', [req.params[parametro]]);
      if (rows[0] && ROLES_DE_CUENTA_DE_BODEGA.includes(rows[0].rol)) { next(); return; }
      res.status(404).json({ error: 'Usuario no encontrado' });
    } catch (error) {
      console.error('Error al revisar la cuenta de bodega:', error);
      res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

/** Condición SQL: el productor tiene alguna parcela en los estados del parámetro (text[] en mayúsculas). */
export const productorEnEstados = (aliasProductor: string, parametro: string) =>
  `EXISTS (SELECT 1 FROM up WHERE up.productor_id = ${aliasProductor}.productor_id AND UPPER(up.nombre_estado) = ANY(${parametro}::text[]))`;

/** Condición SQL: la cuenta tiene alguna bodega en los estados del parámetro (text[] en mayúsculas). */
export const cuentaDeBodegaEnEstados = (aliasUsuario: string, parametro: string) =>
  `EXISTS (SELECT 1 FROM bodeguero_bodegas bb JOIN bodegas b ON b.id = bb.bodega_id
            WHERE bb.usuario_id = ${aliasUsuario}.id AND UPPER(b.estado) = ANY(${parametro}::text[]))`;

const columnaEstado = async (sql: string, id: string): Promise<string[]> =>
  (await pool.query(sql, [id])).rows.map(f => f.estado).filter(Boolean);

export const estadosDeProductor: EstadosDelRegistro = id =>
  columnaEstado('SELECT DISTINCT nombre_estado AS estado FROM up WHERE productor_id = $1', id);

export const estadosDeParcela: EstadosDelRegistro = id =>
  columnaEstado('SELECT nombre_estado AS estado FROM up WHERE up_id = $1', id);

export const estadosDeBodega: EstadosDelRegistro = id =>
  columnaEstado('SELECT estado FROM bodegas WHERE id = $1', id);

export const estadosDeCuentaDeBodega: EstadosDelRegistro = id =>
  columnaEstado(
    `SELECT DISTINCT b.estado FROM bodeguero_bodegas bb JOIN bodegas b ON b.id = bb.bodega_id WHERE bb.usuario_id = $1`,
    id
  );
