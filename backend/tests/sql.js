// Ayudante: ejecuta una instrucción SQL en la base de PRUEBAS y la imprime con el mismo formato que psql
// (encabezado, línea de guiones, renglones), que es el que leen las pruebas en Python.
// Uso: node tests/sql.js "select 1"
require('./cargar-env');
const { exigirEntornoDePruebas } = require('./guardia');
exigirEntornoDePruebas();
const { Client } = require('../node_modules/pg');

(async () => {
  const consulta = process.argv.slice(2).join(' ');
  if (!consulta.trim()) { console.error('Falta la instrucción SQL.'); process.exit(1); }
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  try {
    // rowMode 'array': así las columnas con el mismo nombre (count, count) no se pisan entre sí
    const r = await c.query({ text: consulta, rowMode: 'array' });
    const rs = Array.isArray(r) ? r[r.length - 1] : r;
    if (rs.fields && rs.fields.length) {
      const nombres = rs.fields.map(f => f.name);
      const celda = v => (v === null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v));
      const filas = rs.rows.map(f => f.map(celda));
      console.log(' ' + nombres.join(' | '));
      console.log(nombres.map(n => '-'.repeat(n.length + 2)).join('+'));
      filas.forEach(f => console.log(' ' + f.join(' | ')));
      console.log(`(${filas.length} ${filas.length === 1 ? 'fila' : 'filas'})`);
    } else {
      console.log(`${rs.command || 'OK'} ${rs.rowCount ?? ''}`.trim());
    }
  } finally { await c.end(); }
})().catch(e => { console.error('ERROR SQL:', e.message); process.exit(1); });
