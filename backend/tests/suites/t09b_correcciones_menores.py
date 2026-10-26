# -*- coding: utf-8 -*-
"""T09 (B) · §9.3 límite de consultas de CURP, §9.4 clave de idempotencia, §9.6 orden estable, §9.7 contraseña temporal,
§9.9 fecha de nacimiento, §9.10 bajada de la migración 0001 y §9.12 correo sin HTML inyectado."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *
import uuid, time

t1 = login(EM('frijol1')); adm = login_admin()
SRC = BACKEND / 'src'

print('--- 9.3 · límite de consultas de CURP (por técnico), con un backend aparte y la configuración por defecto')
proc, base = backend_aparte()
try:
    tl = http('/tecnico/auth/login', method='POST', body={'email': EM('limite'), 'password': PASS}, base=base)[1].get('token')
    t_otro = http('/tecnico/auth/login', method='POST', body={'email': EM('frijol2'), 'password': PASS}, base=base)[1].get('token')
    codigos = []; ultimo = None
    for i in range(1, 60):
        st, ultimo = http('/frijol/consultar-curp', tl, 'POST', {'curp': 'X'}, base=base)   # CURP mal formada: responde al instante, pero la consulta cuenta
        codigos.append(st)
        if st == 429: break
    ok('el uso normal no se ve afectado: las primeras 40 consultas de un técnico pasan', codigos[:40] == [400] * 40, str(set(codigos[:40])))
    ok('la consulta 41 en 15 minutos responde 429', len(codigos) == 41 and codigos[-1] == 429, f'bloqueo en la consulta {len(codigos)}')
    ok('el mensaje es claro y trae código', (ultimo or {}).get('error') == 'Hiciste muchas consultas en poco tiempo. Espera unos minutos.' and (ultimo or {}).get('codigo') == 'DEMASIADAS_CONSULTAS', str(ultimo))
    st, _ = http('/frijol/consultar-curp', t_otro, 'POST', {'curp': 'X'}, base=base)
    ok('el límite es POR TÉCNICO: otro técnico sigue pudiendo consultar', st == 400, str(st))
finally:
    proc.terminate()

print('--- 9.4 · clave de idempotencia')
curp = curp_nueva('REN'); st, c = consultar(t1, curp)
b = cuerpo(curp, token=c.get('verificacion_token'))
st, r = http('/frijol/registros', t1, 'POST', b, {'Idempotency-Key': 'k' * 200})
ok('clave de 200 caracteres -> 400 claro (no 500)', st == 400 and r.get('codigo') == 'IDEMPOTENCY_KEY_LARGA', f'{st} {(r or {}).get("codigo")}')
st, r = http('/frijol/registros', t1, 'POST', b, {'Idempotency-Key': 'k' * 61})
ok('61 caracteres (uno más del máximo) -> 400', st == 400 and r.get('codigo') == 'IDEMPOTENCY_KEY_LARGA', str(st))
st, r = http('/frijol/registros', t1, 'POST', b)
ok('sin clave -> 400 con su código', st == 400 and r.get('codigo') == 'SIN_IDEMPOTENCY_KEY', str(st))
st, r = http('/frijol/registros', t1, 'POST', b, {'Idempotency-Key': str(uuid.uuid4())})
ok('una clave UUID normal funciona igual', st == 201, f'{st} {(r or {}).get("error", "")}')
st, r2 = http('/frijol/registros', t1, 'POST', b, {'Idempotency-Key': 'k' * 60})
ok('60 caracteres (el máximo) también funciona', st in (200, 201, 409), str(st))   # 409 = el productor ya existe con otra clave; lo importante es que NO sea 400/500

print('--- 9.5 · el correo se escribe en las dos columnas de producer')
curp_c = curp_nueva('REN'); st, c = consultar(t1, curp_c)
st, reg_c = registrar(t1, cuerpo(curp_c, token=c.get('verificacion_token'), productor__correo='Prueba.Correo@Ejemplo.Test'))
PC = (reg_c or {}).get('producer_id')
ok('registro nuevo: correo y correo_electronico quedan iguales (y en minúsculas)', st == 201 and primera_fila(f"select correo, correo_electronico from producer where producer_id={PC}") == ['prueba.correo@ejemplo.test', 'prueba.correo@ejemplo.test'], f'{st}')
st, r = http(f'/frijol/productores/{PC}', t1, 'PATCH', {'productor': {'correo': 'otro.correo@ejemplo.test'}})
ok('corrección: ambas columnas cambian juntas', st == 200 and primera_fila(f"select correo, correo_electronico from producer where producer_id={PC}") == ['otro.correo@ejemplo.test', 'otro.correo@ejemplo.test'], f'{st}')

print('--- 9.6 · orden estable: toda agregación con ORDER BY')
import re as _re
sin_orden = []
for f in sorted(SRC.rglob('*.ts')):
    texto = f.read_text(encoding='utf-8')
    for m in _re.finditer(r'\b(json_agg|jsonb_agg|array_agg|string_agg)\(', texto):
        i = m.end(); nivel = 1
        while i < len(texto) and nivel > 0:
            nivel += (texto[i] == '(') - (texto[i] == ')'); i += 1
        if 'ORDER BY' not in texto[m.end():i].upper().replace('ORDER  BY', 'ORDER BY'):
            sin_orden.append(f'{f.relative_to(BACKEND)}:{texto.count(chr(10), 0, m.start()) + 1}')
ok('ninguna agregación (json_agg, string_agg...) queda sin ORDER BY', not sin_orden, ', '.join(sin_orden))

print('--- 9.7 · contraseña temporal del reinicio')
suf = ''.join(random.choices(string.digits, k=6)); correo = f'reinicio{suf}@{DOMINIO}'
st, r = http('/admin/tecnicos', adm, 'POST', {'nombre_completo': 'Tecnico Reinicio Prueba', 'curp': f'REIN900101HDGRRS{suf[:2]}', 'email': correo, 'telefono': '6181234567', 'tipo_tecnico': 'eca_productivo', 'programas': ['frijol_afb'], 'zona': [{'state_id': '10', 'municipality_id': None}]})
tid = ((r or {}).get('tecnico') or {}).get('id')
ok('preparación: técnico desechable', st == 201 and tid, f'{st} {(r or {}).get("error", "")}')
st, r1 = http(f'/admin/tecnicos/{tid}/reset-password', adm, 'POST')
st, r2 = http(f'/admin/tecnicos/{tid}/reset-password', adm, 'POST')
p1, p2 = (r1 or {}).get('password_temporal', ''), (r2 or {}).get('password_temporal', '')
ok('el reinicio devuelve una contraseña de 12 caracteres', len(p1) == 12 and len(p2) == 12, f'{len(p1)} y {len(p2)}')
ok('tiene mayúscula, minúscula y número (mismo generador que el alta)', all(any(f(c) for c in p) for p in (p1, p2) for f in (str.isupper, str.islower, str.isdigit)))
ok('dos reinicios dan contraseñas distintas', p1 != p2 and p1 and p2)
st, l = http('/tecnico/auth/login', method='POST', body={'email': correo, 'password': p2})
ok('el técnico entra con la última contraseña temporal', st == 200 and l.get('token'), str(st))
codigo_tecnicos = chr(10).join(l for l in (SRC / 'routes' / 'admin-tecnicos.ts').read_text(encoding='utf-8').splitlines() if not l.strip().startswith('//'))
ok('el generador inseguro (Math.random) ya no se usa en el código', 'Math.random(' not in codigo_tecnicos)
http(f'/admin/tecnicos/{tid}', adm, 'DELETE')

print('--- 9.9 · fecha de nacimiento al corregir al productor')
curp_p = curp_nueva('REN'); st, c = consultar(t1, curp_p)
st, reg = registrar(t1, cuerpo(curp_p, token=c.get('verificacion_token'))); PF = (reg or {}).get('producer_id')
def corregir_fecha(f): return http(f'/frijol/productores/{PF}', t1, 'PATCH', {'productor': {'fecha_nacimiento': f}})
for f, nombre in [('no-es-fecha', 'texto'), ('2020-01-01', 'edad de 6 años'), ('1900-01-01', 'edad de más de 100'), ('', 'vacía')]:
    st, r = corregir_fecha(f)
    ok(f'fecha {nombre} -> 400 con campo productor.fecha_nacimiento', st == 400 and (r or {}).get('campo') == 'productor.fecha_nacimiento', f'{st} {(r or {}).get("campo")}')
st, r = corregir_fecha('1981-03-04')
ok('fecha válida se acepta y deja historial', st == 200 and val(f"select count(*) from producer_cambios where producer_id={PF} and campo='fecha_nacimiento'") == '1', f'{st} {(r or {}).get("error", "")}')
curp_n = curp_nueva('REN'); st, c = consultar(t1, curp_n)
st, r = registrar(t1, cuerpo(curp_n, token=c.get('verificacion_token'), productor__fecha_nacimiento='2020-01-01'))
ok('el registro nuevo usa la misma regla (edad 6 -> 400)', st == 400 and r.get('campo') == 'productor.fecha_nacimiento', f'{st}')

print('--- 9.10 · bajada de la migración 0001: no borra programas en uso')
mig = (BACKEND / 'db' / 'migrations' / '0001_catalogos_frijol.sql').read_text(encoding='utf-8')
bajada = mig.split('-- Down Migration')[1]
# separar las instrucciones sencillas del bloque DO $$ ... $$ para ejecutarlas una por una
bloque_do = _re.search(r'DO \$\$.*?END \$\$;', bajada, _re.S).group(0)
resto = _re.sub(r'DO \$\$.*?END \$\$;', '', bajada, flags=_re.S)
resto = _re.sub(r'(?m)^\s*--.*$', '', resto)          # los comentarios pueden llevar punto y coma
sueltas = [x.strip() for x in resto.split(';') if x.strip()]
pid = val("select producer_id from producer order by producer_id limit 1")
prueba = ["update frijol_productor set programas_sader = '{}'", "update producer set programas_beneficiario = '{}'",      # se despeja todo uso (se revierte al final)
          "update producer set programas_beneficiario = ARRAY['acopio_bienestar'] where producer_id=" + pid,
          *[s for s in sueltas if s], bloque_do.rstrip(';'),
          "select (select count(*) from cat_programas_gobierno where clave='acopio_bienestar') as en_uso, (select count(*) from cat_programas_gobierno where clave='otro_sader') as sin_uso"]
res_b = [l.strip() for l in sql_revertido(prueba).splitlines() if l.strip()]
ok('la bajada se ejecuta sin errores', res_b and not res_b[0].startswith('ERROR_SQL'), res_b[0][:120] if res_b else 'sin salida')
fila_b = [c.strip() for c in res_b[2].split('|')] if len(res_b) > 2 else []
ok('el programa que un productor usa se CONSERVA', fila_b[:1] == ['1'], str(fila_b))
ok('el programa que nadie usa sí se borra', fila_b[1:2] == ['0'], str(fila_b))
ok('la base de pruebas quedó intacta (todo se revirtió)', val("select count(*) from cat_programas_gobierno where clave in ('acopio_bienestar','otro_sader')") == '2')

print('--- 9.12 · el correo de credenciales escapa el HTML')
compilar_backend()
js = r"""
process.env.SMTP_HOST='x'; process.env.SMTP_USER='u@x'; process.env.SMTP_PASS='p'; process.env.APP_URL='https://sitio.test/"><script>';
const nm = require('nodemailer'); let cap; nm.createTransport = () => ({ sendMail: async o => { cap = o; } });
const m = require('./dist/utils/mailer');
m.enviarCredencialesTecnico('a@b.test', '<img src=x onerror=alert(1)> "Juan" & Co', 'Ab3<&">').then(() => console.log(JSON.stringify({ html: cap.html })));
"""
sal = subprocess.run(['node', '-e', js], cwd=str(BACKEND), capture_output=True, text=True, encoding='utf-8')
html = (json.loads(sal.stdout.strip().splitlines()[-1]) if sal.stdout.strip() else {}).get('html', '')
ok('el nombre con etiquetas sale escapado', '&lt;img src=x onerror=alert(1)&gt;' in html and '<img' not in html, html[:90].replace('\n', ' '))
ok('comillas y & también salen escapadas', '&quot;Juan&quot; &amp; Co' in html)
ok('la dirección con comillas no rompe el enlace', '<script>' not in html)

resumen('T09 (B)')
