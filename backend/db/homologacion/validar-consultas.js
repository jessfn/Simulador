// Corre en el servidor: valida con PREPARE cada consulta extraída contra el esquema "ensayo" (ya homologado). No ejecuta nada ni toca datos.
// Los huecos ${...} de las plantillas se reemplazan según su contexto (condición, orden, tabla, columna…) para poder preparar la consulta.
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const consultas = require(process.env.CONSULTAS || './consultas_tmp.json');
const ayudantes = process.env.AYUDANTES ? require(process.env.AYUDANTES) : null;
const HUECO = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;

function rellenar(sql, variante) {
  let s = sql.replace(/\$\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '$1');                  // $${idx} -> $1
  let out = '', ultimo = 0, m;
  HUECO.lastIndex = 0;
  while ((m = HUECO.exec(s))) {
    const antes = s.slice(Math.max(0, m.index - 60), m.index), despues = s.slice(m.index + m[0].length, m.index + m[0].length + 30);
    const a = antes.replace(/\s+/g, ' ').trimEnd().toUpperCase(), d = despues.replace(/\s+/g, ' ').trimStart().toUpperCase();
    let r;
    // Ayudantes de condición reales (soloMaiz, tecnicoDeMaiz, parcelaDeMaiz, soloMaizDeUp): se evalúan de verdad para validar el SQL que producen
    const h = /^\$\{\s*(soloMaiz|tecnicoDeMaiz|parcelaDeMaiz|soloMaizDeUp)\(\s*'([^']*)'\s*(?:,\s*'([^']*)')?\s*\)\s*\}$/.exec(m[0]);
    if (h && ayudantes) { r = ayudantes[h[1]](h[2], h[3]); out += s.slice(ultimo, m.index) + r; ultimo = m.index + m[0].length; continue; }
    if (/^AS\b/.test(d)) r = 'NULL';
    else if (/(ORDER BY|GROUP BY|LIMIT|OFFSET|WHERE|AND|OR|SELECT|,|\(|ON|HAVING|SET|FROM|JOIN)$/.test(a) === false && /^(ORDER|GROUP|LIMIT|OFFSET|HAVING|RETURNING|UNION|\)|$)/.test(d)) r = '';
    else if (/ORDER BY( [\w.]+( ASC| DESC)?,)*$/.test(a) || /(LIMIT|OFFSET)$/.test(a)) r = '1';
    else if (/(FROM|JOIN)$/.test(a)) r = 'geo_estado';
    else if (/(WHERE|AND|OR|ON|\()$/.test(a) && /^(AND|OR|\)|ORDER|GROUP|LIMIT|HAVING|RETURNING|UNION|$|\$)/.test(d)) r = variante === 0 ? 'TRUE' : '(1=1)';
    else if (/(SELECT|,)$/.test(a) && /^(AS|,|FROM)/.test(d)) r = 'NULL';
    else if (/'$/.test(a) && /^'/.test(d)) r = 'x';
    else r = variante === 0 ? "''" : variante === 1 ? 'NULL' : '1';
    out += s.slice(ultimo, m.index) + r; ultimo = m.index + m[0].length;
  }
  return out + s.slice(ultimo);
}

(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '-c search_path=ensayo,public' });
  await c.connect();
  let ok = 0; const errores = [];
  for (const q of consultas) {
    const intentos = q.interp ? [0, 1, 2].map(v => rellenar(q.sql, v)) : [q.sql];
    let pasado = false, ultimo = '';
    for (const sql of intentos) {
      try { await c.query('BEGIN'); await c.query('PREPARE s AS ' + sql); await c.query('ROLLBACK'); await c.query('DEALLOCATE s'); pasado = true; break; }
      catch (e) { ultimo = e.message; await c.query('ROLLBACK').catch(() => {}); await c.query('DEALLOCATE s').catch(() => {}); }
    }
    if (pasado) ok++; else errores.push({ f: q.f, l: q.l, error: ultimo, interp: q.interp });
  }
  console.log(JSON.stringify({ total: consultas.length, ok, errores: errores.length }));
  fs.writeFileSync('/tmp/errores_prepare.json', JSON.stringify(errores, null, 1));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
