# -*- coding: utf-8 -*-
"""Herramienta "maíz no cambió".

Captura las cifras del panel de administración de MAÍZ (tarjetas del tablero, listados y hojas de la exportación)
y compara dos capturas para decir, en una tabla, qué cambió y qué no.

Uso (desde backend/):
  python tests/maiz_no_cambio.py capturar antes                 guarda tests/.tmp/maiz/antes.json
  ... se hace el cambio que se quiere revisar ...
  python tests/maiz_no_cambio.py comparar antes                 captura "ahora" y lo compara contra antes.json
  python tests/maiz_no_cambio.py comparar antes despues         compara dos capturas ya guardadas

Código de salida: 0 = sin diferencias; 1 = hay diferencias; 2 = no se pudo capturar.
Solo LEE (consultas GET). Corre únicamente contra el ambiente de pruebas (la misma protección que npm test).
"""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from lib import *
import io, datetime

CARPETA = AQUI / '.tmp' / 'maiz'

# Qué se mide. (etiqueta legible, ruta del API)
ENDPOINTS = [
    ('Tablero · resumen',                 '/dashboard/admin/resumen'),
    ('Tablero · producción',              '/dashboard/admin/produccion'),
    ('Tablero · infraestructura',         '/dashboard/admin/infraestructura'),
    ('Tablero · alertas',                 '/dashboard/admin/alertas'),
    ('Tablero · operación',               '/dashboard/admin/operacion'),
    ('Tablero · mapa',                    '/dashboard/admin/mapa'),
    ('Listado · usuarios y productores',  '/admin/usuarios'),
    ('Listado · parcelas',                '/admin/parcelas'),
    ('Filtros · parcelas',                '/admin/parcelas/filtros'),
    ('Bodegas · estadísticas',            '/admin/bodegas/estadisticas'),
    ('Inicio · cifras públicas',          '/home/stats'),
    ('Encuesta de insumos · resumen',     '/admin/insumos/resumen'),
    ('Técnicos · listado',                '/admin/tecnicos'),
    ('Búsqueda de productores',           '/productores/buscar?q=garcia'),
    ('Mis productores (sesión admin)',    '/mis-productores'),
]
# Campos que cambian solos (horas, marcas de tiempo) y no son cifras de negocio
VOLATIL = ('actualiz', 'generado', 'timestamp', 'hora', 'ultimo_login', 'updated_at', 'now', 'created_at', 'fecha_alta', 'ultimo_intento')

def limpiar(x):
    if isinstance(x, dict):
        return {k: limpiar(v) for k, v in x.items() if not any(t in k.lower() for t in VOLATIL)}
    if isinstance(x, list):
        lista = [limpiar(i) for i in x]
        if lista and isinstance(lista[0], dict):
            for k in ('up_id', 'producer_id', 'id'):
                if k in lista[0]:
                    lista.sort(key=lambda d: str(d.get(k))); break
        return lista
    return x

def aplanar(x, ruta=''):
    """Convierte el JSON en {ruta: valor} con solo cifras: números, textos cortos y la cantidad de elementos de cada lista."""
    out = {}
    if isinstance(x, dict):
        for k, v in x.items(): out.update(aplanar(v, f'{ruta}/{k}'))
    elif isinstance(x, list):
        out[f'{ruta} (renglones)'] = len(x)
        # Las listas cortas (tarjetas, desgloses por estado/ciclo) se miden elemento por elemento; las largas solo por cantidad
        if len(x) <= 60:
            for i, v in enumerate(x): out.update(aplanar(v, f'{ruta}[{i}]'))
    elif isinstance(x, (int, float, bool)) or x is None:
        out[ruta] = x
    elif isinstance(x, str):
        try: out[ruta] = float(x) if re.fullmatch(r'-?\d+(\.\d+)?', x) else x[:60]
        except Exception: out[ruta] = x[:60]
    return out

def hojas_excel(blob):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(blob), read_only=True)
        return {ws.title: ws.max_row - 1 for ws in wb.worksheets}     # renglones sin contar el encabezado
    except Exception as e:
        return {'(no se pudo leer el Excel)': str(e)[:60]}

def capturar():
    tok = login_admin()
    if not tok:
        print('No se pudo iniciar sesión como administrador de prueba. ¿Corriste npm run test:seed?'); sys.exit(2)
    cap = {'fecha': datetime.datetime.now().isoformat(timespec='seconds'), 'cifras': {}}
    for etiqueta, ruta in ENDPOINTS:
        st, d = http(ruta, tok)
        if st != 200:
            cap['cifras'][etiqueta] = {'(respuesta del servidor)': st}; continue
        cap['cifras'][etiqueta] = aplanar(limpiar(d))
    st, blob = http('/admin/exportar-bd', tok, raw=True)
    cap['cifras']['Exportación de la base · renglones por hoja'] = {f'hoja "{h}"': n for h, n in hojas_excel(blob).items()} if st == 200 else {'(respuesta del servidor)': st}
    return cap

def archivo(nombre):
    CARPETA.mkdir(parents=True, exist_ok=True)
    return CARPETA / (nombre if nombre.endswith('.json') else nombre + '.json')

def comparar(a, b, nombre_a, nombre_b):
    cambios = 0; total = 0
    print(f'\nComparación de cifras de MAÍZ\n  Antes : {nombre_a} ({a["fecha"]})\n  Después: {nombre_b} ({b["fecha"]})\n')
    for etiqueta in a['cifras']:
        ca, cb = a['cifras'][etiqueta], b['cifras'].get(etiqueta, {})
        diffs = []
        for k in sorted(set(ca) | set(cb)):
            va, vb = ca.get(k, '(no existía)'), cb.get(k, '(ya no existe)')
            if va != vb:
                delta = f'  ({vb - va:+g})' if isinstance(va, (int, float)) and isinstance(vb, (int, float)) and not isinstance(va, bool) else ''
                diffs.append((k, va, vb, delta))
        total += len(set(ca) | set(cb)); cambios += len(diffs)
        if not diffs:
            print(f'  ✅ igual      {etiqueta}  ({len(ca)} cifras)')
        else:
            print(f'  ⚠️ CAMBIÓ     {etiqueta}  ({len(diffs)} de {len(set(ca) | set(cb))} cifras)')
            for k, va, vb, delta in diffs[:12]: print(f'        {k}:  {va}  →  {vb}{delta}')
            if len(diffs) > 12: print(f'        … y {len(diffs) - 12} más')
    print(f'\nResultado: {total - cambios} de {total} cifras iguales, {cambios} cambiaron.' + ('  ✅ Maíz no cambió.' if not cambios else '  ⚠️ Revisa que cada cambio sea esperado (por ejemplo, los datos de prueba que creaste).'))
    return cambios

if __name__ == '__main__':
    modo = sys.argv[1] if len(sys.argv) > 1 else ''
    if modo == 'capturar' and len(sys.argv) >= 3:
        cap = capturar(); archivo(sys.argv[2]).write_text(json.dumps(cap, ensure_ascii=False, sort_keys=True), encoding='utf-8')
        n = sum(len(v) for v in cap['cifras'].values()); print(f'Captura guardada en {archivo(sys.argv[2])}  ({n} cifras en {len(cap["cifras"])} pantallas/listados).')
    elif modo == 'comparar' and len(sys.argv) >= 3:
        antes = json.loads(archivo(sys.argv[2]).read_text(encoding='utf-8'))
        if len(sys.argv) >= 4: despues = json.loads(archivo(sys.argv[3]).read_text(encoding='utf-8')); nb = sys.argv[3]
        else: despues = capturar(); nb = 'ahora'
        sys.exit(1 if comparar(antes, despues, sys.argv[2], nb) else 0)
    else:
        print(__doc__); sys.exit(2)
