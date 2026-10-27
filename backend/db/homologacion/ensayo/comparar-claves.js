// Ensayo de la homologación: compara, consulta por consulta, los NOMBRES DE COLUMNA que devuelve el código viejo (esquema viejo) contra los que
// devuelve el código nuevo (esquema homologado + capa de compatibilidad). Deben ser idénticos: así se demuestra que el JSON de la API no cambia.
// Uso (en el servidor, sobre el esquema "ensayo"):  node comparar-claves.js viejo <consultas_base.json> <salida.json>
//                                                    node comparar-claves.js nuevo <consultas.json>      <salida.json>
require('dotenv').config({ path: '/var/www/Simulador/backend/.env' });
const { Client } = require('pg');
const fs = require('fs');
const modo = process.argv[2], entrada = process.argv[3], salida = process.argv[4];
const HUECO = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;

function rellenar(sql) {
  const s = sql.replace(/\$\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '$1');
  let out = '', ultimo = 0, m; HUECO.lastIndex = 0;
  while ((m = HUECO.exec(s))) {
    const a = s.slice(Math.max(0, m.index - 60), m.index).replace(/\s+/g, ' ').trimEnd().toUpperCase();
    const d = s.slice(m.index + m[0].length, m.index + m[0].length + 30).replace(/\s+/g, ' ').trimStart().toUpperCase();
    let r;
    if (/^AS\b/.test(d)) r = 'NULL';
    else if (!/(ORDER BY|GROUP BY|LIMIT|OFFSET|WHERE|AND|OR|SELECT|,|\(|ON|HAVING|SET|FROM|JOIN)$/.test(a) && /^(ORDER|GROUP|LIMIT|OFFSET|HAVING|RETURNING|UNION|\)|$)/.test(d)) r = '';
    else if (/(LIMIT|OFFSET)$/.test(a) || /ORDER BY$/.test(a)) r = '1';
    else if (/(FROM|JOIN)$/.test(a)) r = 'geo_estado';
    else if (/(WHERE|AND|OR|ON|\()$/.test(a) && /^(AND|OR|\)|ORDER|GROUP|LIMIT|HAVING|RETURNING|UNION|$|\$)/.test(d)) r = 'TRUE';
    else if (/(SELECT|,)$/.test(a) && /^(AS|,|FROM)/.test(d)) r = 'NULL';
    else r = "''";
    out += s.slice(ultimo, m.index) + r; ultimo = m.index + m[0].length;
  }
  return out + s.slice(ultimo);
}

(async () => {
  const consultas = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  const cfg = { host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '-c search_path=ensayo,public' };
  const Result = require('/home/jesus.rios/ensayo_app/node_modules/pg/lib/result');
  let capturados = null;
  if (modo === 'nuevo') {
    const compat = require('/home/jesus.rios/ensayo_app/dist/config/compatibilidadApi.js');
    compat.instalarCapaCompatibilidad();
    const c0 = new Client(cfg); await c0.connect(); await compat.cargarTablasCompatibilidad(c0); await c0.end();
  }
  const orig = Result.prototype.addFields;
  Result.prototype.addFields = function (fd) { capturados = fd.map(f => f.name); return orig.call(this, fd); };

  const c = new Client(cfg); await c.connect();
  const res = {};
  for (const q of consultas) {
    const sql = q.interp ? rellenar(q.sql) : q.sql;
    const n = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
    capturados = null;
    try { await c.query('BEGIN'); await c.query({ text: sql, values: Array(n).fill(null) }); } catch { /* el error ocurre al ejecutar; los nombres llegan antes */ }
    await c.query('ROLLBACK').catch(() => {});
    res[`${q.f}:${q.l}`] = capturados;
  }
  fs.writeFileSync(salida, JSON.stringify(res));
  console.log(modo, Object.keys(res).length, 'consultas;', Object.values(res).filter(Boolean).length, 'con columnas capturadas');
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
