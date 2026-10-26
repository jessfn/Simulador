// Ayudante: ejecuta una lista de instrucciones SQL dentro de una transacción que SIEMPRE se revierte y devuelve el resultado de la última.
// Sirve para probar cosas como la "bajada" de una migración sin dejar ningún cambio en la base de pruebas.
// Uso: node tests/sql-rollback.js '["instrucción 1", "instrucción 2", "select ..."]'
require('./cargar-env');
const { exigirEntornoDePruebas } = require('./guardia');
exigirEntornoDePruebas();
const { Client } = require('../node_modules/pg');
(async () => {
  const instrucciones = JSON.parse(process.argv[2] || '[]');
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  try {
    await c.query('BEGIN');
    let r;
    for (const q of instrucciones) r = await c.query({ text: q, rowMode: 'array' });
    if (r && r.fields && r.fields.length) {
      console.log(' ' + r.fields.map(f => f.name).join(' | '));
      console.log(r.fields.map(f => '-'.repeat(f.name.length + 2)).join('+'));
      r.rows.forEach(f => console.log(' ' + f.map(v => (v === null ? '' : String(v))).join(' | ')));
    }
  } catch (e) { console.log('ERROR_SQL: ' + e.message); }
  finally { await c.query('ROLLBACK').catch(() => {}); await c.end(); }
})();
