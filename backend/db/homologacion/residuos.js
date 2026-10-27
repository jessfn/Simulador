// Lista los literales de texto del código que todavía contienen nombres viejos de columnas/tablas (para revisar a mano: ¿SQL olvidado o clave de la API?).
const fs = require('fs'), path = require('path');
const ts = require(path.join(__dirname, '..', '..', 'node_modules', 'typescript'));
const { TABLAS, COLUMNAS } = require('./mapa');
const claves = Object.keys({ ...COLUMNAS, ...TABLAS });
const re = new RegExp('(^|[^A-Za-z0-9_$])(' + claves.sort((a, b) => b.length - a.length).join('|') + ')(?![A-Za-z0-9_])', 'g');
const RAIZ = path.join(__dirname, '..', '..', 'src');
const filas = [];
(function rec(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else if (p.endsWith('.ts')) proc(p); } })(RAIZ);
function proc(f) {
  const src = fs.readFileSync(f, 'utf8'); const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true);
  const rel = path.relative(path.join(RAIZ, '..'), f).split(path.sep).join('/');
  const v = n => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const t = n.getText(sf).slice(1, -1).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' ');
      const lim = t.replace(/'[^']*'/g, "''").replace(/bASs+[A-Za-z_]+/gi, 'AS _');                                  // texto fuera de comillas SQL
      const hits = [...lim.matchAll(re)].map(m => m[2]);
      if (hits.length && !/^[A-Za-z_.]+$/.test(t.trim())) filas.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} [${[...new Set(hits)].join(',')}] ${t.replace(/\s+/g, ' ').slice(0, 110)}`);
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}
console.log(filas.join('\n')); console.error(filas.length + ' literales');
