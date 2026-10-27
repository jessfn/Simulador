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
  return `EXISTS (SELECT 1 FROM productor_programa _pm WHERE _pm.productor_id = ${aliasProducer}.productor_id AND _pm.programa = '${PROGRAMA_MAIZ}')`;
}

/**
 * T11 §11.3 · LA regla de "esta parcela cuenta en maíz": su origen es maíz O tiene un ciclo de maíz.
 * Una parcela que solo registró frijol (programa_origen = 'frijol_afb', sin ciclo de maíz) no cuenta: sus hectáreas y su cuenta no se suman a las cifras de maíz.
 * Si luego se le crea un ciclo de maíz, pasa a contar sola. Úsala con el alias de la tabla up:  WHERE ... AND ${parcelaDeMaiz('u')}
 * (No mira al productor: para eso está soloMaiz / soloMaizDeUp.)
 */
export function parcelaDeMaiz(aliasUp: string): string {
  return `(${aliasUp}.programa_origen = '${PROGRAMA_MAIZ}' OR EXISTS (SELECT 1 FROM ciclo _cm WHERE _cm.up_id = ${aliasUp}.up_id AND _cm.cultivo = 'maiz'))`;
}

/** Parcelas de SIMAC Maíz: el productor está en maíz Y la parcela cuenta en maíz (ver parcelaDeMaiz). Alias de la tabla up. */
export function soloMaizDeUp(aliasUp: string): string {
  return `(EXISTS (SELECT 1 FROM productor_programa _pm WHERE _pm.productor_id = ${aliasUp}.productor_id AND _pm.programa = '${PROGRAMA_MAIZ}') AND ${parcelaDeMaiz(aliasUp)})`;
}

/**
 * Propiedad de un productor para un técnico de MAÍZ: es el responsable en el programa simac_maiz.
 * (Un productor que llegó primero por frijol tiene como dueño de producer a otro técnico; maíz se rige por producer_programa.)
 * `paramTecnico` es el parámetro SQL con el id del técnico, p. ej. '$2'.
 */
export function tecnicoDeMaiz(aliasProducer: string, paramTecnico: string): string {
  return `EXISTS (SELECT 1 FROM productor_programa _tm WHERE _tm.productor_id = ${aliasProducer}.productor_id AND _tm.programa = '${PROGRAMA_MAIZ}' AND _tm.usuario_capturista_id = ${paramTecnico})`;
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
      `SELECT u.tipo_tecnico, c.etiqueta AS etiqueta
         FROM usuarios u
         LEFT JOIN cat_catalogo c ON c.catalogo = 'tipo_tecnico' AND c.codigo = u.tipo_tecnico
        WHERE u.id = $1`,
      [usuarioId]
    ),
    db.query(
      `SELECT z.estado_id, z.municipio_id, gs.nombre AS state_name, gm.nombre AS municipality_name
         FROM tecnico_zona z
         LEFT JOIN geo_estado gs ON gs.estado_id = z.estado_id
         LEFT JOIN geo_municipio gm ON gm.municipio_id = z.municipio_id
        WHERE z.usuario_id = $1
        ORDER BY gs.nombre, gm.nombre`,
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
