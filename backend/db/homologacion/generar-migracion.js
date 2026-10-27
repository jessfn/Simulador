// Genera backend/db/migrations/0008_homologar_nombres_espanol.sql a partir de mapa.js y de la foto del esquema de producción
// (esquema_antes.tsv y objetos_antes.tsv). Todo renombre queda LISTADO de forma explícita (auditable); nada se adivina en la migración.
// Uso: node backend/db/homologacion/generar-migracion.js
const fs = require('fs'), path = require('path');
const { TABLAS, COLUMNAS, EXENTAS, FUNCIONES, PALABRAS_EN_NOMBRES, DISPARADORES } = require('./mapa');

const leer = f => fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').filter(Boolean).map(l => l.split('|'));
const columnasAntes = leer('esquema_antes.tsv');       // tabla|columna|tipo|posición
const objetosAntes = leer('objetos_antes.tsv');         // C|tabla|restricción   I|tabla|índice   S|secuencia|

const tablasAntes = [...new Set(columnasAntes.map(f => f[0]))].filter(t => !EXENTAS.includes(t));
const nuevaTabla = t => TABLAS[t] || t;

// Traducción de nombres de objetos: busca la coincidencia más larga de palabras separadas por "_"
const mapaNombres = { ...TABLAS, ...COLUMNAS, ...PALABRAS_EN_NOMBRES };
function traducir(nombre) {
  const p = nombre.split('_'); const out = []; let i = 0;
  while (i < p.length) {
    let hallado = false;
    for (let j = Math.min(p.length, i + 7); j > i; j--) {
      const cand = p.slice(i, j).join('_');
      if (mapaNombres[cand]) { out.push(mapaNombres[cand]); i = j; hallado = true; break; }
    }
    if (!hallado) { out.push(p[i]); i++; }
  }
  return out.join('_');
}

const tablas = Object.entries(TABLAS).filter(([v]) => tablasAntes.includes(v));
const columnas = [];
for (const [t, c] of columnasAntes) if (!EXENTAS.includes(t) && COLUMNAS[c]) columnas.push([nuevaTabla(t), c, COLUMNAS[c]]);

const restricciones = [], indices = [], secuencias = [];
for (const [tipo, a, b] of objetosAntes) {
  if (tipo === 'C') { const n = traducir(b); if (n !== b) restricciones.push([nuevaTabla(a), b, n]); }
  if (tipo === 'I') { const n = traducir(b); if (n !== b) indices.push([b, n]); }
  if (tipo === 'S') { const n = traducir(a); if (n !== a) secuencias.push([a, n]); }
}
// verificaciones de seguridad
const todos = [...restricciones.map(x => x[2]), ...indices.map(x => x[1]), ...secuencias.map(x => x[1])];
for (const n of todos) if (n.length > 63) throw new Error('Nombre de más de 63 caracteres: ' + n);
const relNuevos = [...indices.map(x => x[1]), ...secuencias.map(x => x[1]), ...tablas.map(x => x[1])];
if (new Set(relNuevos).size !== relNuevos.length) throw new Error('Nombres de relación duplicados tras traducir');
const existentes = new Set([...objetosAntes.filter(o => o[0] === 'I').map(o => o[2]), ...objetosAntes.filter(o => o[0] === 'C').map(o => o[2]), ...objetosAntes.filter(o => o[0] === 'S').map(o => o[1]), ...tablasAntes]);
for (const n of relNuevos) if (existentes.has(n) && !tablas.some(t => t[0] === n) && !indices.some(i => i[0] === n) && !secuencias.some(s => s[0] === n)) throw new Error('El nombre nuevo ya existe: ' + n);

const q = s => `'${String(s).replace(/'/g, "''")}'`;
const filas = (pares) => pares.map(p => `    (${p.map(q).join(', ')})`).join(',\n');
const inv = pares => pares.map(p => [...p].reverse());

const cuerpoFuncion = `BEGIN NEW.actualizado_en = CURRENT_TIMESTAMP; RETURN NEW; END;`;
const cuerpoFuncionVieja = `BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;`;
const funciones = Object.entries(FUNCIONES);
const disparadores = Object.entries(DISPARADORES).map(([v, [n, t]]) => [v, n, t]); // [viejo, nuevo, tabla vieja]

function bloque(titulo, ejecuciones) { return `  -- ${titulo}\n${ejecuciones}\n`; }

const subir = `-- Up Migration
-- Homologación de la base de datos al español: tablas, columnas, restricciones, índices, secuencias, disparadores y funciones.
-- GENERADA por backend/db/homologacion/generar-migracion.js a partir de mapa.js (no editar a mano). Glosario: docs/GLOSARIO_BD.md
-- No cambia ningún dato ni ningún valor guardado; solo nombres. Los renombres son instantáneos (solo catálogo) y conservan relaciones,
-- índices, datos y secuencias. Se aplica sobre el esquema actual (current_schema()), de modo que también se puede ensayar en un esquema desechable.
-- Si alguna tabla está ocupada por una consulta larga, falla rápido (en 15 s) en lugar de dejar en espera a toda la aplicación; se reintenta.
SET LOCAL lock_timeout = '15s';
DO $homologacion$
DECLARE r record; n_t int := 0; n_c int := 0; n_o int := 0;
BEGIN
  -- 1) Tablas
  FOR r IN SELECT * FROM (VALUES
${filas(tablas)}
  ) AS v(vieja, nueva) LOOP
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.vieja, r.nueva); n_t := n_t + 1;
  END LOOP;

  -- 2) Columnas (la tabla ya tiene su nombre nuevo)
  FOR r IN SELECT * FROM (VALUES
${filas(columnas)}
  ) AS v(tabla, vieja, nueva) LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tabla, r.vieja, r.nueva); n_c := n_c + 1;
  END LOOP;

  -- 3) Restricciones (llaves foráneas, únicas, checks). Las de PK/UNIQUE renombran también su índice.
  FOR r IN SELECT * FROM (VALUES
${filas(restricciones)}
  ) AS v(tabla, vieja, nueva) LOOP
    EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.tabla, r.vieja, r.nueva); n_o := n_o + 1;
  END LOOP;

  -- 4) Índices que no respaldan una restricción
  FOR r IN SELECT * FROM (VALUES
${filas(indices)}
  ) AS v(vieja, nueva) LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.vieja, r.nueva); n_o := n_o + 1;
  END LOOP;

  -- 5) Secuencias
  FOR r IN SELECT * FROM (VALUES
${filas(secuencias)}
  ) AS v(vieja, nueva) LOOP
    EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', r.vieja, r.nueva); n_o := n_o + 1;
  END LOOP;

  RAISE NOTICE 'Homologación: % tablas, % columnas, % objetos dependientes renombrados', n_t, n_c, n_o;
END
$homologacion$;

-- 6) Funciones de disparador: se reescriben con la columna nueva y se renombran; después el disparador
${funciones.map(([v, n]) => `CREATE OR REPLACE FUNCTION ${v}() RETURNS trigger LANGUAGE plpgsql AS $$ ${cuerpoFuncion} $$;\nALTER FUNCTION ${v}() RENAME TO ${n};`).join('\n')}
${disparadores.map(([v, n, t]) => `ALTER TRIGGER ${v} ON ${nuevaTabla(t)} RENAME TO ${n};`).join('\n')}

-- 7) Verificación: ninguna tabla ni columna con nombre viejo debe quedar, y nada se perdió
DO $verificacion$
DECLARE restantes int; esq oid := to_regnamespace(current_schema())::oid;
BEGIN
  SELECT COUNT(*) INTO restantes FROM pg_class c WHERE c.relnamespace = esq AND c.relkind = 'r' AND c.relname IN (${Object.keys(TABLAS).map(q).join(', ')});
  IF restantes > 0 THEN RAISE EXCEPTION 'Quedaron % tabla(s) con nombre viejo', restantes; END IF;
  SELECT COUNT(*) INTO restantes FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
   WHERE c.relnamespace = esq AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND c.relname NOT IN (${EXENTAS.map(q).join(', ')})
     AND a.attname IN (${Object.keys(COLUMNAS).map(q).join(', ')});
  IF restantes > 0 THEN RAISE EXCEPTION 'Quedaron % columna(s) con nombre viejo', restantes; END IF;
END
$verificacion$;
`;

const bajar = `
-- Down Migration
-- Regresa todos los nombres al estado anterior (inglés). Los datos no se tocan. (Los nombres de objetos dependientes se restauran de forma exacta.)
DO $reversa$
DECLARE r record;
BEGIN
${disparadores.map(([v, n, t]) => `  ALTER TRIGGER ${n} ON ${nuevaTabla(t)} RENAME TO ${v};`).join('\n')}
${funciones.map(([v, n]) => `  EXECUTE 'ALTER FUNCTION ${n}() RENAME TO ${v}';\n  EXECUTE 'CREATE OR REPLACE FUNCTION ${v}() RETURNS trigger LANGUAGE plpgsql AS $x$ ${cuerpoFuncionVieja} $x$';`).join('\n')}

  FOR r IN SELECT * FROM (VALUES
${filas(inv(secuencias))}
  ) AS v(vieja, nueva) LOOP EXECUTE format('ALTER SEQUENCE %I RENAME TO %I', r.vieja, r.nueva); END LOOP;

  FOR r IN SELECT * FROM (VALUES
${filas(inv(indices))}
  ) AS v(vieja, nueva) LOOP EXECUTE format('ALTER INDEX %I RENAME TO %I', r.vieja, r.nueva); END LOOP;

  FOR r IN SELECT * FROM (VALUES
${filas(restricciones.map(([t, v, n]) => [t, n, v]))}
  ) AS v(tabla, vieja, nueva) LOOP EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.tabla, r.vieja, r.nueva); END LOOP;

  FOR r IN SELECT * FROM (VALUES
${filas(columnas.map(([t, v, n]) => [t, n, v]))}
  ) AS v(tabla, vieja, nueva) LOOP EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.tabla, r.vieja, r.nueva); END LOOP;

  FOR r IN SELECT * FROM (VALUES
${filas(inv(tablas))}
  ) AS v(vieja, nueva) LOOP EXECUTE format('ALTER TABLE %I RENAME TO %I', r.vieja, r.nueva); END LOOP;
END
$reversa$;
`;

fs.writeFileSync(path.join(__dirname, '..', 'migrations', '0008_homologar_nombres_espanol.sql'), subir + bajar);
fs.writeFileSync(path.join(__dirname, 'renombres.json'), JSON.stringify({ tablas, columnas, restricciones, indices, secuencias, funciones, disparadores }, null, 1));
console.log({ tablas: tablas.length, columnas: columnas.length, restricciones: restricciones.length, indices: indices.length, secuencias: secuencias.length });

// ── Capa de compatibilidad de la API: mapa (tabla nueva → columna nueva → clave histórica) para que el JSON que consume el frontend NO cambie ──
const porTabla = {}, usos = {};
for (const [tabla, vieja, nueva] of columnas) { (porTabla[tabla] ??= {})[nueva] = vieja; (usos[nueva] ??= new Set()).add(vieja); }
const nombresQueYaExistian = new Set(columnasAntes.filter(f => !EXENTAS.includes(f[0]) && !COLUMNAS[f[1]]).map(f => f[1]));
const unico = {};
for (const [nueva, viejas] of Object.entries(usos)) if (viejas.size === 1 && !nombresQueYaExistian.has(nueva)) unico[nueva] = [...viejas][0];
const ts = `// GENERADO por backend/db/homologacion/generar-migracion.js — no editar a mano.
// La base de datos usa nombres en español; el contrato de la API (claves JSON que consume el frontend) conserva los nombres históricos.
// Este mapa traduce, en el resultado de cada consulta, el nombre de columna nuevo a la clave histórica.
export const COLUMNAS_POR_TABLA: Record<string, Record<string, string>> = ${JSON.stringify(porTabla, null, 2)};

`;
fs.writeFileSync(path.join(__dirname, '..', '..', 'src', 'config', 'compatibilidadApi.datos.ts'), ts);
console.log('compatibilidad: tablas', Object.keys(porTabla).length);
