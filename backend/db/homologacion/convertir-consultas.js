// Convierte los nombres de tablas y columnas DENTRO de las consultas SQL del código (strings y plantillas de backend/src) al español.
// Solo toca texto SQL: no cambia variables, propiedades ni claves JSON de TypeScript (el contrato de la API conserva sus claves históricas).
// Uso:  node backend/db/homologacion/convertir-consultas.js --dry     (solo reporta)
//       node backend/db/homologacion/convertir-consultas.js --aplicar (escribe los archivos)
const fs = require('fs'), path = require('path');
const ts = require(path.join(__dirname, '..', '..', 'node_modules', 'typescript'));
const { TABLAS, COLUMNAS, EXENTAS } = require('./mapa');

const RAIZ = path.join(__dirname, '..', '..');
const aplicar = process.argv.includes('--aplicar');
const archivos = [];
(function recorrer(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) recorrer(p); else if (p.endsWith('.ts')) archivos.push(p); } })(path.join(RAIZ, 'src'));

const ES_SQL = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|FROM|JOIN|WHERE|RETURNING|ORDER BY|GROUP BY|ON CONFLICT|SET)\b/;
// Fragmentos de SQL que no traen palabras clave (condiciones, columnas de orden o de SET armadas en piezas): se convierten a mano por línea.
const FORZAR = new Set([
  ...[30, 31, 36, 37, 42, 43, 68, 69, 88, 89, 90, 91, 120, 121].map(n => `src/routes/admin-frijol.ts:${n}`),
  ...[293, 295].map(n => `src/routes/admin-permisos.ts:${n}`),
  ...[132, 1253, 1256, 1316, 1339, 1340].map(n => `src/routes/admin.ts:${n}`),
  ...[504, 523].map(n => `src/routes/auth.ts:${n}`),
  ...[461, 462, 463, 464, 465, 466, 467, 468, 469, 470].map(n => `src/routes/cycles.ts:${n}`),
  ...[39, 73, 459].map(n => `src/routes/dashboard-admin.ts:${n}`),
  ...[63, 132].map(n => `src/routes/home.ts:${n}`),
  ...[102, 165].map(n => `src/routes/insumos-admin.ts:${n}`),
  ...[116, 152, 158].map(n => `src/routes/oferta.ts:${n}`),
  'src/routes/propuestas.ts:209',
  ...[83, 179].map(n => `src/routes/seguimiento.ts:${n}`),
  ...[700, 701].map(n => `src/routes/tecnico.ts:${n}`),
]);
// Fragmentos de condición sin palabras clave de sentencia (p. ej. "c.crop = 'frijol'", "email = $1", "u.geom IS NOT NULL"): se detectan por su forma.
const FRAGMENTO = /(\bIS (NOT )?NULL\b|\bILIKE\b|=\s*\$|=\s*'|\b[a-z]{1,4}\.[a-z_]+\s*(=|<|>|IN\b|IS\b|ASC|DESC)|^\s*[a-z_]+\s*=\s*\$)/;
const PALABRAS_TABLA = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'ONLY', 'REFERENCES']);

const informe = { archivos: 0, literalesSQL: 0, ediciones: 0, alias_en_conflicto: [], tabla_fuera_de_posicion: [], noSQLconTokens: [] };

// Tokeniza un texto SQL (con huecos ${...} opacos) y devuelve [{ini, fin, nuevo}] relativos al texto.
function convertir(texto) {
  const ed = []; let i = 0; const n = texto.length; let prev = '';           // prev: último token significativo en MAYÚSCULAS
  const alias = new Set(); const reemplazadas = [];
  while (i < n) {
    const c = texto[i];
    if (c === "'") { let j = i + 1; while (j < n) { if (texto[j] === "'" && texto[j + 1] === "'") j += 2; else if (texto[j] === "'") break; else j++; } i = j + 1; prev = "'"; continue; }
    if (c === '$' && texto[i + 1] === '{') { let d = 0, j = i + 1; while (j < n) { if (texto[j] === '{') d++; else if (texto[j] === '}') { d--; if (d === 0) break; } j++; } i = j + 1; prev = '${}'; continue; }
    if (c === '$' && /\d/.test(texto[i + 1] || '')) { let j = i + 1; while (/\d/.test(texto[j] || '')) j++; i = j; prev = '$'; continue; }
    if (c === '-' && texto[i + 1] === '-') { while (i < n && texto[i] !== '\n') i++; continue; }
    if (c === '/' && texto[i + 1] === '*') { const j = texto.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < n && /[A-Za-z0-9_]/.test(texto[j])) j++;
      const w = texto.slice(i, j); const W = w.toUpperCase();
      let k = j; while (k < n && /\s/.test(texto[k])) k++;
      const sig = texto[k];
      const antesC = texto[i - 1]; const antes2 = texto.slice(i - 2, i);
      const calificado = antesC === '.';
      const esCast = antes2 === '::';
      const esLlamada = sig === '(';
      if (prev === 'AS' && !calificado) { alias.add(w); }
      else if (!esCast && (!esLlamada || (TABLAS[w] && PALABRAS_TABLA.has(prev)))) {
        if (TABLAS[w] && !calificado) {
          if (PALABRAS_TABLA.has(prev) || sig === '.') { ed.push({ ini: i, fin: j, nuevo: TABLAS[w] }); reemplazadas.push(w); }
          else informe.tabla_fuera_de_posicion.push(w);
        } else if (COLUMNAS[w]) { ed.push({ ini: i, fin: j, nuevo: COLUMNAS[w] }); reemplazadas.push(w); }
      }
      prev = W; i = j; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  const conflicto = [...alias].filter(a => COLUMNAS[a] || TABLAS[a]);
  return { ed, conflicto, reemplazadas };
}

// Modo texto: convierte un archivo .sql completo (o cualquier archivo de SQL puro).  node convertir-consultas.js --sql ruta1 ruta2 ...
if (process.argv.includes('--sql')) {
  for (const f of process.argv.slice(process.argv.indexOf('--sql') + 1).filter(x => !x.startsWith('--'))) {
    const texto = fs.readFileSync(f, 'utf8'); const r = convertir(texto);
    let out = texto; for (const e of r.ed.sort((a, b) => b.ini - a.ini)) out = out.slice(0, e.ini) + e.nuevo + out.slice(e.fin);
    if (aplicar) fs.writeFileSync(f, out);
    console.log(f, r.ed.length, 'ediciones');
  }
  process.exit(0);
}
// Otros archivos TypeScript fuera de src (scripts): --extra ruta1,ruta2
const extra = (process.argv.find(a => a.startsWith('--extra=')) || '').replace('--extra=', '').split(',').filter(Boolean);
for (const e of extra) archivos.push(path.resolve(e));
for (const archivo of archivos) {
  const rel = path.relative(RAIZ, archivo).replace(/\\/g, '/');
  const src = fs.readFileSync(archivo, 'utf8');
  const sf = ts.createSourceFile(archivo, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edicionesArchivo = [];
  informe.archivos++;
  const visitar = nodo => {
    const esLit = ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo) || ts.isTemplateExpression(nodo);
    if (esLit) {
      const ini = nodo.getStart(sf), fin = nodo.getEnd();
      const texto = src.slice(ini, fin);
      // para comprobar si es SQL se ignoran los huecos ${...}
      const sinHuecos = texto.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ');
      const linea = sf.getLineAndCharacterOfPosition(ini).line + 1;
      const forzada = FORZAR.has(`${rel}:${linea}`) || /^'?\(?[a-z]{1,4}\.[a-z_0-9]+\)?'?\s*$/.test(sinHuecos.slice(1, -1).trim() ? sinHuecos.trim().replace(/^['"`]|['"`]$/g, '') : '') && /^[a-z]{1,4}\.(.+)$/.test(sinHuecos.trim().replace(/^['"`]|['"`]$/g, '')) && (COLUMNAS[sinHuecos.trim().replace(/^['"`]|['"`]$/g, '').split('.')[1]]);
      const fragmento = !forzada && !ES_SQL.test(sinHuecos) && FRAGMENTO.test(sinHuecos) && !/[áéíóúñ]/i.test(sinHuecos) && sinHuecos.length < 220 && !/^\s*['\"`]?\/?[A-Za-z]*:/.test(sinHuecos);
      if (fragmento) informe.fragmentos = (informe.fragmentos || []).concat(`${rel}:${linea} ${sinHuecos.replace(/\s+/g, ' ').slice(0, 100)}`);
      if (forzada || fragmento || (ES_SQL.test(sinHuecos) && !/^\s*import /.test(sinHuecos) && sinHuecos.length > 12)) {
        informe.literalesSQL++;
        const r = convertir(texto.slice(1, -1));
        if (r.conflicto.length) informe.alias_en_conflicto.push(`${rel}:${sf.getLineAndCharacterOfPosition(ini).line + 1} alias=${r.conflicto.join(',')}`);
        for (const e of r.ed) edicionesArchivo.push({ ini: ini + 1 + e.ini, fin: ini + 1 + e.fin, nuevo: e.nuevo });
      } else if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo) || ts.isTemplateExpression(nodo)) {
        const multi = Object.keys({ ...COLUMNAS, ...TABLAS }).filter(k => k.includes('_') && new RegExp('(^|[^A-Za-z0-9_])' + k + '([^A-Za-z0-9_]|$)').test(sinHuecos));
        if (multi.length) informe.noSQLconTokens.push(`${rel}:${sf.getLineAndCharacterOfPosition(ini).line + 1} [${multi.join(',')}] ${sinHuecos.replace(/\s+/g, ' ').slice(0, 90)}`);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  // las plantillas anidadas se visitan por separado: evitar ediciones duplicadas
  const unicas = [...new Map(edicionesArchivo.map(e => [e.ini + ':' + e.fin, e])).values()].sort((a, b) => b.ini - a.ini);
  informe.ediciones += unicas.length;
  if (aplicar && unicas.length) {
    let out = src; for (const e of unicas) out = out.slice(0, e.ini) + e.nuevo + out.slice(e.fin);
    fs.writeFileSync(archivo, out);
  }
}
fs.writeFileSync(path.join(__dirname, 'informe-conversion.json'), JSON.stringify(informe, null, 1));
console.log({ archivos: informe.archivos, literalesSQL: informe.literalesSQL, ediciones: informe.ediciones, alias_en_conflicto: informe.alias_en_conflicto.length, tabla_fuera_de_posicion: informe.tabla_fuera_de_posicion.length, noSQLconTokens: informe.noSQLconTokens.length });
