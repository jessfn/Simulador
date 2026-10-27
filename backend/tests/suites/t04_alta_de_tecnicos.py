# -*- coding: utf-8 -*-
"""T04 · Alta, edición y baja de técnicos desde el panel de administración."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *

adm = login_admin()
# usuario del panel SIN permisos (lo siembra tests/seed.js)
sql("update usuarios set es_panel_usuario=true where correo_electronico='qa.sinpermisos@ejemplo.test'")
_, d = http('/auth/login', method='POST', body={'email': 'qa.sinpermisos@ejemplo.test', 'password': PASS})
sinperm = d.get('token')

sufijo = ''.join(random.choices(string.digits, k=4))
curp = 'PEAJ900101MDGRRN' + '0' + str(random.randint(0, 9))
email = f'juana.perez{sufijo}@ejemplo.test'
cuerpo = {'nombre_completo': 'Juana Perez Lopez', 'curp': curp, 'email': email, 'telefono': '6181234567',
          'tipo_tecnico': 'eca_productivo', 'programas': ['frijol_afb'],
          'zona': [{'state_id': '10', 'municipality_id': None}, {'state_id': '32', 'municipality_id': '32010'}]}

st, r = http('/admin/tecnicos', adm, 'POST', cuerpo)
ok('admin crea un tecnico de frijol (201)', st == 201, f'{st} {(r or {}).get("error", "")}')
pw = (r or {}).get('password_temporal', '')
tid = ((r or {}).get('tecnico') or {}).get('id')
ok('devuelve contrasena temporal de 12 caracteres, una sola vez', len(pw) == 12 and any(c.isdigit() for c in pw) and any(c.isupper() for c in pw))
st2, det = http(f'/admin/tecnicos/{tid}', adm)
ok('el detalle muestra que NO se guardo la contrasena en claro', 'password' not in json.dumps(det).lower())

# el tecnico puede entrar y debe cambiar la contrasena
st, l = http('/tecnico/auth/login', method='POST', body={'email': email, 'password': pw})
ok('el tecnico nuevo puede entrar', st == 200 and l.get('token'), str(st))
u = (l or {}).get('usuario', {})
ok('se le pide cambiar la contrasena', u.get('debe_cambiar_pass') is True)
ok('login devuelve programa frijol, tipo y zona', u.get('programas') == ['frijol_afb'] and u.get('tipo_tecnico') == 'eca_productivo' and len(u.get('zona', [])) == 2, str(u.get('zona')))
zona = {(z['state_id'], z['municipality_id']) for z in u.get('zona', [])}
ok('la zona guarda estado completo y municipio especifico', zona == {('10', None), ('32', '32010')}, str(zona))
st, c = http('/frijol/catalogos', l['token'])
ok('el tecnico de frijol entra a /frijol/catalogos', st == 200)
st, c = http('/tecnico/mis-registros', l['token'])
ok('el tecnico de frijol NO entra al flujo de maiz (403)', st == 403)

# duplicados y validaciones
st, r = http('/admin/tecnicos', adm, 'POST', {**cuerpo, 'email': 'otro' + sufijo + '@ejemplo.test'})
ok('CURP repetida -> 409 y no se crea nada', st == 409 and 'CURP' in (r or {}).get('error', ''), (r or {}).get('error', ''))
st, r = http('/admin/tecnicos', adm, 'POST', {**cuerpo, 'curp': 'PEAJ900101MDGRRN' + '9' + '9'})
ok('correo repetido -> 409', st == 409 and 'correo' in (r or {}).get('error', '').lower(), (r or {}).get('error', ''))
casos = [({'curp': 'ABC'}, 'CURP formato'), ({'telefono': '123'}, 'telefono'), ({'tipo_tecnico': 'inventado'}, 'tipo'),
         ({'programas': []}, 'programas vacios'), ({'programas': ['nada']}, 'programa invalido'), ({'zona': []}, 'zona vacia'),
         ({'zona': [{'state_id': '99'}]}, 'estado inexistente'), ({'zona': [{'state_id': '10', 'municipality_id': '32010'}]}, 'municipio de otro estado'),
         ({'email': 'sin-arroba'}, 'correo formato'), ({'nombre_completo': ''}, 'nombre vacio')]
for cambios, nombre in casos:
    st, r = http('/admin/tecnicos', adm, 'POST', {**cuerpo, 'curp': 'XXXX900101HDGRRN9' + '9', 'email': f'v{sufijo}@ejemplo.test', **cambios})
    ok(f'validacion: {nombre} -> 400', st == 400, (r or {}).get('error', ''))
n = sql(f"select count(*) from usuarios where correo_electronico like 'v{sufijo}%'").split('\n')[2].strip()
ok('las altas invalidas no crearon nada', n == '0', n)

# permisos
st, _ = http('/admin/tecnicos', sinperm, 'POST', cuerpo)
ok('sin permiso tecnicos:crear -> 403', st == 403, str(st))

# listado con tipo, programas, zona y filtros
st, lst = http('/admin/tecnicos', adm)
fila = [t for t in lst['tecnicos'] if t['id'] == tid][0]
ok('lista muestra tipo, programas y zona', fila['tipo_tecnico_etiqueta'] == 'ECA Productivo' and fila['programas'] == ['frijol_afb'] and len(fila['zona']) == 2)
ok('lista muestra conteo de registros de frijol', 'registros_frijol' in fila)
st, lst = http('/admin/tecnicos?programa=frijol_afb', adm)
ids = [t['id'] for t in lst['tecnicos']]
ok('filtro por programa frijol trae a los de frijol', tid in ids and all('frijol_afb' in t['programas'] for t in lst['tecnicos']), f'{len(ids)} tecnicos')
st, lst = http('/admin/tecnicos?programa=simac_maiz', adm)
ok('tecnicos existentes aparecen con programa simac_maiz', len(lst['tecnicos']) > 100 and tid not in [t['id'] for t in lst['tecnicos']], f'{len(lst["tecnicos"])} tecnicos')
st, lst = http('/admin/tecnicos?state_id=32', adm)
ok('filtro por estado (zona)', tid in [t['id'] for t in lst['tecnicos']])
st, lst = http('/admin/tecnicos?q=' + curp, adm)
ok('busqueda por CURP', [t['id'] for t in lst['tecnicos']] == [tid])

# editar: programas y zona reemplazan; quitar un programa no borra registros
sql(f"insert into productor_programa (productor_id, programa, usuario_capturista_id) select productor_id, 'frijol_afb', {tid} from productor where curp='FRTS900101HDGXXX01' on conflict (productor_id, programa) do update set usuario_capturista_id={tid}")
sql(f"update productor set usuario_capturista_id={tid} where curp='FRTS900101HDGXXX01'")
st, r = http(f'/admin/tecnicos/{tid}', adm, 'PATCH', {'programas': ['simac_maiz'], 'zona': [{'state_id': '25', 'municipality_id': None}], 'telefono': '6187654321'})
ok('editar programas, zona y telefono', st == 200 and r['tecnico']['programas'] == ['simac_maiz'] and len(r['tecnico']['zona']) == 1 and r['tecnico']['telefono'] == '6187654321', f'{st} {(r or {}).get("error", "")}')
n = sql(f"select count(*) from productor_programa where usuario_capturista_id={tid} and programa='frijol_afb'").split('\n')[2].strip()
ok('quitarle frijol NO borra sus registros de frijol', n == '1', n)
st, r = http(f'/admin/tecnicos/{tid}', adm, 'PATCH', {'programas': ['simac_maiz', 'frijol_afb']})
ok('con ambos programas queda con los dos', st == 200 and sorted(r['tecnico']['programas']) == ['frijol_afb', 'simac_maiz'])
st, _ = http(f'/admin/tecnicos/{tid}', sinperm, 'PATCH', {'telefono': '6180000000'})
ok('sin permiso de editar -> 403', st == 403)

# borrar tecnico con registros sin cuenta propia -> 409 (y desactivar si funciona)
st, r = http(f'/admin/tecnicos/{tid}', adm, 'DELETE')
ok('no se puede eliminar un tecnico responsable de productores sin cuenta (409)', st == 409 and r.get('codigo') == 'TECNICO_CON_REGISTROS', (r or {}).get('error', ''))
st, r = http(f'/admin/tecnicos/{tid}', adm, 'PATCH', {'activo': False})
ok('en su lugar se puede desactivar', st == 200 and r['tecnico']['activo'] is False)
st, l = http('/tecnico/auth/login', method='POST', body={'email': email, 'password': pw})
ok('un tecnico desactivado ya no entra', st == 401, str(st))

# limpieza: devolver el productor sintetico a su tecnico original y borrar el tecnico de prueba
sql("update productor_programa set usuario_capturista_id=(select id from usuarios where correo_electronico='qa.frijol1@ejemplo.test') where productor_id=(select productor_id from productor where curp='FRTS900101HDGXXX01') and programa='frijol_afb'")
sql("update productor set usuario_capturista_id=(select id from usuarios where correo_electronico='qa.frijol1@ejemplo.test') where curp='FRTS900101HDGXXX01'")
st, r = http(f'/admin/tecnicos/{tid}', adm, 'DELETE')
ok('sin registros a su cargo el tecnico si se puede eliminar', st == 200, (r or {}).get('mensaje', (r or {}).get('error', '')))
print('\nRESUMEN T04:', sum(res), '/', len(res))
