// Carga tests/.env (si existe) sin pisar las variables que ya vengan del sistema.
const fs = require('fs');
const path = require('path');
const archivo = path.join(__dirname, '.env');
if (fs.existsSync(archivo)) {
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linea);
    if (!m || linea.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
