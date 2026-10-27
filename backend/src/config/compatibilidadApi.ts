// Capa de compatibilidad de la API (homologación de la base de datos al español, migración 0008).
//
// La BASE DE DATOS usa nombres en español (productor_id, creado_en, nombre_up…). El CONTRATO de la API (las claves JSON que lee el frontend:
// producer_id, created_at, up_name…) se conserva tal cual para no romper ninguna pantalla ni exportación. En lugar de duplicar alias en cada
// consulta, aquí se traduce el nombre de cada columna del resultado a su clave histórica:
//   - PostgreSQL indica de qué tabla viene cada columna; el mapa (tabla nueva → columna nueva → clave histórica) la traduce.
//   - Si la consulta nombra explícitamente la columna (AS algo), manda el alias que puso el código: no se traduce.
// Las columnas calculadas (expresiones, UNION) no tienen tabla de origen: se quedan con el nombre que les dio la consulta.
// Plan: retirar esta capa cuando el frontend migre a las claves en español.
import { COLUMNAS_POR_TABLA } from './compatibilidadApi.datos';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Query = require('pg/lib/query');

const tablaPorOid = new Map<number, string>();
const aliasPorTexto = new Map<string, Set<string>>();
let instalada = false;

function aliasDe(texto: string): Set<string> {
  let s = aliasPorTexto.get(texto);
  if (!s) {
    s = new Set<string>();
    for (const m of texto.matchAll(/\bAS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) s.add(m[1]);
    if (aliasPorTexto.size > 2000) aliasPorTexto.clear();
    aliasPorTexto.set(texto, s);
  }
  return s;
}

/** Se instala una sola vez, antes de cualquier consulta. */
export function instalarCapaCompatibilidad(): void {
  if (instalada) return;
  instalada = true;
  const original = Query.prototype.handleRowDescription;
  Query.prototype.handleRowDescription = function (msg: { fields: Array<{ name: string; tableID: number }> }) {
    const texto: string = typeof this.text === 'string' ? this.text : '';
    const alias = texto ? aliasDe(texto) : null;
    for (const campo of msg.fields) {
      if (alias && alias.has(campo.name)) continue;                          // el código eligió ese nombre: se respeta
      const tabla = tablaPorOid.get(campo.tableID);
      const mapa = tabla ? COLUMNAS_POR_TABLA[tabla] : undefined;
      if (mapa && Object.prototype.hasOwnProperty.call(mapa, campo.name)) campo.name = mapa[campo.name];
    }
    return original.call(this, msg);
  };
}

/** Carga el catálogo oid → nombre de tabla (una consulta al arrancar). */
export async function cargarTablasCompatibilidad(db: { query: (texto: string) => Promise<{ rows: Array<{ oid: number; relname: string }> }> }): Promise<void> {
  const r = await db.query(`SELECT c.oid::int AS oid, c.relname FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = to_regnamespace(current_schema())`);
  tablaPorOid.clear();
  for (const f of r.rows) tablaPorOid.set(Number(f.oid), f.relname);
}
