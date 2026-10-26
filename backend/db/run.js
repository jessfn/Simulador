// Ejecuta node-pg-migrate usando las mismas variables DB_* del .env del backend.
// Uso:  node db/run.js up | down | status | create <nombre> | fake-base
//   up / down      aplica o revierte migraciones pendientes (down revierte una)
//   status         muestra lo que se aplicaria (--dry-run), sin tocar la base
//   fake-base      marca SOLO la linea base (0000) como aplicada, sin ejecutarla (para bases que ya la tienen: produccion).
//                  (node-pg-migrate con --fake --count 1 marcaba TODAS las pendientes; por eso se inserta el registro directamente)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawnSync } = require('child_process');
const path = require('path');

const { DB_HOST = 'localhost', DB_PORT = '5432', DB_USER, DB_PASSWORD = '', DB_NAME } = process.env;
if (!process.env.DATABASE_URL) {
  if (!DB_USER || !DB_NAME) {
    console.error('Faltan DB_USER / DB_NAME en backend/.env');
    process.exit(1);
  }
  process.env.DATABASE_URL =
    `postgres://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

const [accion = 'status', ...resto] = process.argv.slice(2);
const dir = ['--migrations-dir', path.join(__dirname, 'migrations')];
const bin = path.join(__dirname, '..', 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js');

const mapa = {
  up: ['up', ...dir, '--check-order', ...resto],
  down: ['down', ...dir, ...resto],
  status: ['up', '--dry-run', ...dir, ...resto],
  create: ['create', ...dir, '--migration-file-language', 'sql', ...resto],
};
if (accion === 'fake-base') {
  const { Client } = require('pg');
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
    await c.connect();
    await c.query('CREATE TABLE IF NOT EXISTS public.pgmigrations (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, run_on TIMESTAMP NOT NULL)');
    const r = await c.query("INSERT INTO public.pgmigrations (name, run_on) SELECT '0000_linea_base', NOW() WHERE NOT EXISTS (SELECT 1 FROM public.pgmigrations WHERE name = '0000_linea_base')");
    console.log(r.rowCount ? 'Linea base 0000_linea_base marcada como aplicada (no se ejecuto nada).' : 'La linea base ya estaba marcada.');
    await c.end();
  })().catch(e => { console.error('fake-base fallo:', e.message); process.exit(1); });
  return;
}
if (!mapa[accion]) {
  console.error('Accion desconocida:', accion, '\nUso: node db/run.js up|down|status|create <nombre>|fake-base');
  process.exit(1);
}

const r = spawnSync(process.execPath, [bin, ...mapa[accion]], { stdio: 'inherit', env: process.env });
process.exit(r.status === null ? 1 : r.status);
