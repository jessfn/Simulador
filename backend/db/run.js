// Ejecuta node-pg-migrate usando las mismas variables DB_* del .env del backend.
// Uso:  node db/run.js up | down | status | create <nombre> | fake-base
//   up / down      aplica o revierte migraciones pendientes (down revierte una)
//   status         muestra lo que se aplicaria (--dry-run), sin tocar la base
//   fake-base      marca la linea base (0000) como aplicada SIN ejecutarla (para bases que ya la tienen: produccion)
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
  'fake-base': ['up', ...dir, '--fake', '--count', '1'],
};
if (!mapa[accion]) {
  console.error('Accion desconocida:', accion, '\nUso: node db/run.js up|down|status|create <nombre>|fake-base');
  process.exit(1);
}

const r = spawnSync(process.execPath, [bin, ...mapa[accion]], { stdio: 'inherit', env: process.env });
process.exit(r.status === null ? 1 : r.status);
