# -*- coding: utf-8 -*-
"""Convierte a español los nombres de tablas y columnas dentro de las CADENAS SQL de las pruebas (archivos .py y seed.js).
Solo toca texto SQL (cadenas que traen palabras clave); no cambia variables ni claves JSON de las respuestas de la API.
Uso:  python convertir_pruebas.py --dry | --aplicar
"""
import io, json, re, subprocess, sys, tokenize, pathlib

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
MAPA = json.loads(subprocess.check_output(['node', '-e', "const m=require('./mapa');console.log(JSON.stringify({t:m.TABLAS,c:m.COLUMNAS}))"], cwd=AQUI, text=True))
TABLAS, COLUMNAS = MAPA['t'], MAPA['c']
PALABRAS_TABLA = {'FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE', 'ONLY', 'REFERENCES'}
ES_SQL = re.compile(r'\b(select|insert\s+into|update|delete\s+from|from|join|where|returning|order\s+by|group\s+by|on\s+conflict|set)\b', re.I)
IDENT = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')


def convertir(texto):
    out, i, n, prev, cambios = [], 0, len(texto), '', 0
    while i < n:
        c = texto[i]
        if c == "'":                                         # literal SQL entre comillas simples
            j = i + 1
            while j < n:
                if texto[j] == "'" and texto[j + 1:j + 2] == "'": j += 2
                elif texto[j] == "'": break
                else: j += 1
            out.append(texto[i:j + 1]); i = j + 1; prev = "'"; continue
        if c == '{':                                         # hueco de f-string
            d, j = 0, i
            while j < n:
                if texto[j] == '{': d += 1
                elif texto[j] == '}':
                    d -= 1
                    if d == 0: break
                j += 1
            out.append(texto[i:j + 1]); i = j + 1; prev = '{}'; continue
        if c == '$' and texto[i + 1:i + 2].isdigit():
            j = i + 1
            while j < n and texto[j].isdigit(): j += 1
            out.append(texto[i:j]); i = j; prev = '$'; continue
        if c == '-' and texto[i + 1:i + 2] == '-':
            j = texto.find('\n', i); j = n if j < 0 else j
            out.append(texto[i:j]); i = j; continue
        m = IDENT.match(texto, i) if (c.isalpha() or c == '_') else None
        if m:
            w = m.group(0); j = m.end(); W = w.upper()
            k = j
            while k < n and texto[k].isspace(): k += 1
            sig = texto[k:k + 1]
            califica = i > 0 and texto[i - 1] == '.'
            es_cast = texto[max(0, i - 2):i] == '::'
            es_llamada = sig == '('
            nuevo = w
            if prev == 'AS' and not califica:
                pass
            elif not es_cast and (not es_llamada or (w in TABLAS and prev in PALABRAS_TABLA)):
                if w in TABLAS and not califica:
                    if prev in PALABRAS_TABLA or sig == '.': nuevo = TABLAS[w]
                elif w in COLUMNAS: nuevo = COLUMNAS[w]
            if nuevo != w: cambios += 1
            out.append(nuevo); prev = W; i = j; continue
        out.append(c)
        if not c.isspace(): prev = c
        i += 1
    return ''.join(out), cambios


def es_sql(t):
    return bool(ES_SQL.search(t)) and len(t) > 12


def convertir_py(ruta):
    src = ruta.read_text(encoding='utf-8')
    lineas = src.splitlines(keepends=True)
    desplaz = [0]
    for l in lineas: desplaz.append(desplaz[-1] + len(l))
    ediciones = []
    for tok in tokenize.generate_tokens(io.StringIO(src).readline):
        if tok.type in (tokenize.STRING, getattr(tokenize, 'FSTRING_MIDDLE', -1)):
            (f1, c1), (f2, c2) = tok.start, tok.end
            a, b = desplaz[f1 - 1] + c1, desplaz[f2 - 1] + c2
            trozo = src[a:b]
            if tok.type == tokenize.STRING:
                m = re.match(r'^([a-zA-Z]*)("""|\'\'\'|"|\')', trozo)
                pref, q = m.group(1), m.group(2)
                cuerpo_ini = a + len(pref) + len(q); cuerpo = src[cuerpo_ini:b - len(q)]
                if 'f' in pref.lower(): cuerpo_conv_base = cuerpo
            else:
                cuerpo_ini, cuerpo = a, trozo
            if es_sql(cuerpo):
                # el texto va dentro de una cadena Python con comillas: las comillas simples del SQL pueden ir escapadas; se trabaja sobre el texto tal cual
                nuevo, n = convertir(cuerpo)
                if n: ediciones.append((cuerpo_ini, cuerpo_ini + len(cuerpo), nuevo, n))
    return src, ediciones


def main():
    aplicar = '--aplicar' in sys.argv
    total = 0
    for ruta in sorted((RAIZ / 'tests').rglob('*.py')):
        if '.tmp' in ruta.parts: continue
        src, ed = convertir_py(ruta)
        if not ed: continue
        total += sum(e[3] for e in ed)
        print(f"{ruta.relative_to(RAIZ)}: {sum(e[3] for e in ed)} cambios")
        if aplicar:
            for a, b, nuevo, _ in sorted(ed, reverse=True): src = src[:a] + nuevo + src[b:]
            compile(src, str(ruta), 'exec')                  # que siga siendo Python válido
            ruta.write_text(src, encoding='utf-8')
    for ruta in [RAIZ / 'tests' / 'seed.js']:
        src = ruta.read_text(encoding='utf-8')
        # en JS las consultas van en cadenas con comillas o plantillas: se convierten cadenas completas que traen SQL
        def f(m):
            global_cambios = convertir(m.group(0))
            return global_cambios[0]
        nuevo = re.sub(r"`[^`]*`|'[^'\n]*'", lambda m: convertir(m.group(0)[1:-1])[0].join([m.group(0)[0], m.group(0)[-1]]) if es_sql(m.group(0)) else m.group(0), src)
        if nuevo != src:
            print(f"{ruta.relative_to(RAIZ)}: convertido")
            if aplicar: ruta.write_text(nuevo, encoding='utf-8')
    print('total cambios en .py:', total)


main()
