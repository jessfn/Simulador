// Ejecuta todas las pruebas con un solo comando:  npm test   (desde backend/)
//   npm test                 pruebas de API (rápidas)
//   npm run test:ui          además, pruebas en pantalla con navegador (celular y escritorio)
//   npm test -- t05          solo los archivos cuyo nombre contenga "t05"
//   npm test -- --sin-seed   no vuelve a sembrar los usuarios ficticios
require('./cargar-env');
const { exigirEntornoDePruebas } = require('./guardia');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

exigirEntornoDePruebas();   // se niega a correr contra producción

const args = process.argv.slice(2);
const conUI = args.includes('--ui');
const sinSeed = args.includes('--sin-seed');
const filtro = args.filter(a => !a.startsWith('--'))[0];
const aqui = __dirname;

function python() {
  for (const c of ['python', 'python3', 'py']) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  console.error('No encontré Python 3. Instálalo (ver tests/README.md).'); process.exit(2);
}

function apiViva() {
  return new Promise(resolve => {
    const u = new URL(process.env.TEST_API_URL.replace(/\/$/, '') + '/health');
    const req = (u.protocol === 'https:' ? https : http).get(u, { timeout: 15000 }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0)); req.on('timeout', () => { req.destroy(); resolve(0); });
  });
}

(async () => {
  const py = python();
  const estado = path.join(aqui, '.tmp', 'estado.json');
  fs.mkdirSync(path.dirname(estado), { recursive: true }); fs.rmSync(estado, { force: true });

  const st = await apiViva();
  if (st !== 200) { console.error(`\n⛔ El API de pruebas (${process.env.TEST_API_URL}) no responde (código ${st}). ¿Está encendido el servidor de pruebas?\n`); process.exit(2); }

  if (!sinSeed) {
    const s = spawnSync(process.execPath, [path.join(aqui, 'seed.js')], { stdio: 'inherit' });
    if (s.status !== 0) process.exit(s.status || 1);
  }

  const carpetas = ['suites'].concat(conUI ? ['ui'] : []);
  const archivos = [];
  for (const c of carpetas) {
    const dir = path.join(aqui, c);
    if (!fs.existsSync(dir)) continue;
    fs.readdirSync(dir).filter(f => f.endsWith('.py')).sort().forEach(f => archivos.push(path.join(c, f)));
  }
  const elegidos = archivos.filter(f => !filtro || f.toLowerCase().includes(filtro.toLowerCase()));
  if (!elegidos.length) { console.error('Ningún archivo de prueba coincide con', filtro); process.exit(2); }

  const tabla = [];
  for (const f of elegidos) {
    console.log(`\n══════ ${f} ══════`);
    const r = spawnSync(py, [path.join(aqui, f)], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 64 * 1024 * 1024 });
    const salida = (r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
    process.stdout.write(salida.endsWith('\n') ? salida : salida + '\n');
    const resumenes = [...salida.matchAll(/RESUMEN ([^:]+): (\d+) \/ (\d+)/g)];
    const ultimo = resumenes[resumenes.length - 1];
    const fallas = (salida.match(/^FALLA /gm) || []).length;
    tabla.push({ archivo: f, pasan: ultimo ? +ultimo[2] : 0, total: ultimo ? +ultimo[3] : 0, fallas, error: r.status !== 0 || !ultimo });
  }

  console.log('\n══════ RESULTADO ══════');
  let pasan = 0, total = 0, mal = false;
  for (const t of tabla) {
    pasan += t.pasan; total += t.total;
    const bien = !t.error && t.fallas === 0 && t.pasan === t.total;
    if (!bien) mal = true;
    console.log(`${bien ? '✅' : '❌'} ${t.archivo.padEnd(44)} ${String(t.pasan).padStart(3)} / ${String(t.total).padEnd(3)}${t.fallas ? `  (${t.fallas} fallas)` : ''}${t.error && !t.fallas ? '  (el archivo terminó con error)' : ''}`);
  }
  console.log(`\nTotal: ${pasan} de ${total} comprobaciones pasan.${mal ? '  ⛔ HAY FALLAS' : '  ✅ Todo bien'}\n`);
  process.exit(mal ? 1 : 0);
})();
