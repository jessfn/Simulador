// Extrae todas las consultas SQL del código (literales con palabras clave SQL) para validarlas con PREPARE contra un esquema ya homologado.
const fs = require('fs'), path = require('path');
const ts = require(path.join(__dirname, '..', '..', 'node_modules', 'typescript'));
const RAIZ = process.env.RAIZ_SRC || path.join(__dirname, '..', '..');
const SALIDA = process.env.SALIDA || path.join(__dirname, 'consultas.json');
const ES_SQL = /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|FROM|JOIN|WHERE|RETURNING|ORDER BY|GROUP BY|ON CONFLICT)\b/;
const HUECO = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;
const salida = [];

function procesar(archivo) {
  const src = fs.readFileSync(archivo, 'utf8');
  const sf = ts.createSourceFile(archivo, src, ts.ScriptTarget.Latest, true);
  const rel = path.relative(RAIZ, archivo).split(path.sep).join('/');
  const visitar = n => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      const t = n.getText(sf).slice(1, -1);
      const sinHuecos = t.replace(HUECO, ' ');
      if (/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sinHuecos) && ES_SQL.test(sinHuecos)) {
        salida.push({ f: rel, l: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, sql: t, interp: /\$\{/.test(t) });
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
}
(function rec(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) rec(p); else if (p.endsWith('.ts')) procesar(p);
  }
})(path.join(RAIZ, 'src'));
fs.writeFileSync(SALIDA, JSON.stringify(salida));
console.log('consultas', salida.length, 'con interpolación', salida.filter(s => s.interp).length);
