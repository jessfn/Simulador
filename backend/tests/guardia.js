// Protección: las pruebas NUNCA corren contra producción.
// Se usa desde run.js, seed.js y sql.js (y lib.py llama a este mismo archivo), para que no haya dos reglas distintas.
//
// Se niega a correr si:
//  - la base de datos está en Amazon RDS o en un dominio de la Secretaría (agricultura.gob.mx), o
//  - el nombre de la base no indica que es de pruebas (debe contener test, prueba, qa o dev), o
//  - la dirección del API es la del sitio público.
// Quien sepa lo que hace y necesite otra base de pruebas puede agregar patrones propios en TEST_PROD_PATRONES
// (separados por coma); nunca se puede quitar ninguno de los de aquí.

const PATRONES_PRODUCCION = [/rds\.amazonaws\.com/i, /agricultura\.gob\.mx/i, /sader\.gob\.mx/i];

function revisarEntorno(env = process.env) {
  const problemas = [];
  const extra = (env.TEST_PROD_PATRONES || '').split(',').map(s => s.trim()).filter(Boolean).map(s => new RegExp(s, 'i'));
  const patrones = [...PATRONES_PRODUCCION, ...extra];

  if (!env.TEST_DATABASE_URL) problemas.push('Falta TEST_DATABASE_URL (la base de PRUEBAS). Copia tests/.env.example a tests/.env y llénalo.');
  if (!env.TEST_API_URL) problemas.push('Falta TEST_API_URL (la dirección del API de pruebas, por ejemplo http://localhost:3000/api).');

  if (env.TEST_DATABASE_URL) {
    let u;
    try { u = new URL(env.TEST_DATABASE_URL); } catch { problemas.push('TEST_DATABASE_URL no es una dirección válida (postgres://usuario:clave@servidor:puerto/base).'); }
    if (u) {
      const host = u.hostname, base = decodeURIComponent(u.pathname.replace(/^\//, ''));
      if (patrones.some(p => p.test(host))) problemas.push(`La base apunta a "${host}", que parece un servidor de PRODUCCIÓN. Las pruebas se niegan a correr.`);
      if (!/(test|prueba|qa|dev)/i.test(base)) problemas.push(`La base se llama "${base}". El nombre de una base de pruebas debe contener test, prueba, qa o dev; así se evita correr contra la real.`);
    }
  }
  if (env.TEST_API_URL) {
    let a;
    try { a = new URL(env.TEST_API_URL); } catch { problemas.push('TEST_API_URL no es una dirección válida.'); }
    if (a && patrones.some(p => p.test(a.hostname))) problemas.push(`El API apunta a "${a.hostname}", que parece el sitio de PRODUCCIÓN. Las pruebas se niegan a correr.`);
  }
  return problemas;
}

function exigirEntornoDePruebas(env = process.env) {
  const problemas = revisarEntorno(env);
  if (problemas.length) {
    console.error('\n⛔ Las pruebas no se ejecutaron:\n');
    problemas.forEach(p => console.error('  - ' + p));
    console.error('\nNo se hizo ningún cambio en ninguna base de datos.\n');
    process.exit(2);
  }
}

module.exports = { revisarEntorno, exigirEntornoDePruebas };

if (require.main === module) { require('./cargar-env'); exigirEntornoDePruebas(); console.log('Entorno de pruebas verificado.'); }
