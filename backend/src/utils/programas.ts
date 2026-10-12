import { Pool, PoolClient } from 'pg';
import pool from '../config/database';

// Programas: "por qué" está registrado alguien en SIMAC. Los productores actuales son de 'simac_maiz';
// frijol agrega 'frijol_afb'. Un productor puede estar en varios sin duplicar a la persona.
export const PROGRAMA_MAIZ = 'simac_maiz';
export const PROGRAMA_FRIJOL = 'frijol_afb';

/**
 * Fragmento SQL para limitar un listado o conteo de productores a los de SIMAC Maíz.
 * Uso:  WHERE ... AND ${soloMaiz('p')}     (alias de la tabla producer)
 */
export function soloMaiz(aliasProducer: string): string {
  return `EXISTS (SELECT 1 FROM producer_programa _pm WHERE _pm.producer_id = ${aliasProducer}.producer_id AND _pm.programa = '${PROGRAMA_MAIZ}')`;
}

/** Igual que soloMaiz, pero a partir de una parcela (alias de la tabla up). */
export function soloMaizDeUp(aliasUp: string): string {
  return `EXISTS (SELECT 1 FROM producer_programa _pm WHERE _pm.producer_id = ${aliasUp}.producer_id AND _pm.programa = '${PROGRAMA_MAIZ}')`;
}

export interface ZonaTecnico { state_id: string; municipality_id: string | null; state_name?: string | null; municipality_name?: string | null }

export interface PerfilProgramas {
  programas: string[];
  tipo_tecnico: string | null;
  tipo_tecnico_etiqueta: string | null;
  zona: ZonaTecnico[];
}

type Consultable = Pool | PoolClient;

/** Programas, tipo y zona de un técnico (lo que el frontend usa para decidir a dónde entra). */
export async function perfilProgramasDeTecnico(usuarioId: number, db: Consultable = pool): Promise<PerfilProgramas> {
  const [progs, usr, zona] = await Promise.all([
    db.query('SELECT programa FROM usuario_programa WHERE usuario_id = $1 ORDER BY programa', [usuarioId]),
    db.query(
      `SELECT u.tipo_tecnico, c.label AS etiqueta
         FROM usuarios u
         LEFT JOIN cat_catalog c ON c.catalog = 'tipo_tecnico' AND c.code = u.tipo_tecnico
        WHERE u.id = $1`,
      [usuarioId]
    ),
    db.query(
      `SELECT z.state_id, z.municipality_id, gs.name AS state_name, gm.name AS municipality_name
         FROM tecnico_zona z
         LEFT JOIN geo_state gs ON gs.state_id = z.state_id
         LEFT JOIN geo_municipality gm ON gm.municipality_id = z.municipality_id
        WHERE z.usuario_id = $1
        ORDER BY gs.name, gm.name`,
      [usuarioId]
    ),
  ]);
  return {
    programas: progs.rows.map((r: { programa: string }) => r.programa),
    tipo_tecnico: usr.rows[0]?.tipo_tecnico ?? null,
    tipo_tecnico_etiqueta: usr.rows[0]?.etiqueta ?? null,
    zona: zona.rows,
  };
}
