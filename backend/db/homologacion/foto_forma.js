// Foto de la FORMA (claves JSON) de las respuestas de lectura de la API, para comparar antes y después de la homologación en producción.
// Solo hace GET (lectura). Va despacio (1 por segundo) para no consumir el límite global de la aplicación. Tokens de 15 minutos firmados con el secreto del servidor.
// Uso (en el servidor, dentro de /var/www/Simulador/backend):  node foto_forma.js <salida.json>
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rutas = require('./rutas_foto.json');
const salida = process.argv[2];
const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000) + '/api';
const EXCLUIR = /\/stream|\/descargar|exportar|\/acuse|\/geocod|\/nominatim|reverse|chat|\/push|\/notificaciones\/leer/;

function forma(v, prof = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (!v.length) return '[vacio]';
    const claves = new Set();
    for (const e of v.slice(0, 5)) { const f = forma(e, prof + 1); if (typeof f === 'object') Object.entries(f).forEach(([k, s]) => claves.add(k + ':' + JSON.stringify(s))); else claves.add(String(f)); }
    return '[' + [...claves].sort().join('|') + ']';
  }
  if (typeof v === 'object') { if (prof > 6) return '{…}'; const o = {}; for (const k of Object.keys(v).sort()) o[k] = forma(v[k], prof + 1); return o; }
  return typeof v;
}

(async () => {
  const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const token = async rol => {
    const u = (await pool.query('SELECT * FROM usuarios WHERE rol = $1 AND activo ORDER BY id LIMIT 1', [rol])).rows[0];
    return u ? jwt.sign({ userId: u.id, email: u.email ?? u.correo_electronico, rol: u.rol }, process.env.JWT_SECRET, { expiresIn: '15m' }) : null;
  };
  const roles = { admin: await token('admin'), capturista: await token('capturista') };
  await pool.end();
  const fotos = {};
  for (const r of rutas) {
    if (EXCLUIR.test(r)) continue;
    const quienes = /^\/(tecnico|frijol|solicitudes-cambio)/.test(r) ? ['capturista', 'admin'] : ['admin'];
    for (const q of quienes) {
      if (!roles[q]) continue;
      try {
        const resp = await fetch(BASE + r, { headers: { Authorization: 'Bearer ' + roles[q] } });
        const t = await resp.text(); let j; try { j = JSON.parse(t); } catch { j = undefined; }
        fotos[`${q} ${r}`] = { status: resp.status, forma: j === undefined ? `texto(${resp.headers.get('content-type')})` : forma(j) };
      } catch (e) { fotos[`${q} ${r}`] = { status: 0, forma: String(e.message) }; }
      await new Promise(res => setTimeout(res, 1000));
    }
  }
  require('fs').writeFileSync(salida, JSON.stringify(fotos, null, 1));
  const cont = {}; for (const v of Object.values(fotos)) cont[v.status] = (cont[v.status] || 0) + 1;
  console.log('rutas', Object.keys(fotos).length, JSON.stringify(cont));
})().catch(e => { console.error(e); process.exit(1); });
