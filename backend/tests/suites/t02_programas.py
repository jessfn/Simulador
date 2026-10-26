# -*- coding: utf-8 -*-
"""T02 · Programas: cada técnico ve solo lo de su programa (maíz y frijol)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *

t_fri, u_fri = login_full('qa.frijol1@ejemplo.test')
t_mai, u_mai = login_full('qa.maiz1@ejemplo.test')
t_amb, u_amb = login_full('qa.ambos@ejemplo.test')
t_leg, u_leg = login_full('qa.legacy@ejemplo.test')

ok('login devuelve programas (frijol)', u_fri.get('programas') == ['frijol_afb'], str(u_fri.get('programas')))
ok('login devuelve programas (maiz)', u_mai.get('programas') == ['simac_maiz'], str(u_mai.get('programas')))
ok('login devuelve programas (ambos)', sorted(u_amb.get('programas', [])) == ['frijol_afb', 'simac_maiz'], str(u_amb.get('programas')))
ok('login sin programas asignados -> maiz por compatibilidad', u_leg.get('programas') == ['simac_maiz'], str(u_leg.get('programas')))
ok('login devuelve tipo de tecnico', u_fri.get('tipo_tecnico') == 'eca_productivo', str(u_fri.get('tipo_tecnico_etiqueta')))

st, perfil = http('/tecnico/perfil', t_fri)
ok('/perfil devuelve programas', st == 200 and perfil.get('programas') == ['frijol_afb'], str(perfil.get('programas')))

# Frijol
ok('tecnico frijol entra a /frijol/catalogos', http('/frijol/catalogos', t_fri)[0] == 200)
ok('tecnico solo maiz -> 403 en /frijol/catalogos', http('/frijol/catalogos', t_mai)[0] == 403)
ok('tecnico sin programas -> 403 en /frijol/catalogos', http('/frijol/catalogos', t_leg)[0] == 403)
ok('tecnico con ambos entra a /frijol/catalogos', http('/frijol/catalogos', t_amb)[0] == 200)
ok('sin sesion -> 401 en /frijol/catalogos', http('/frijol/catalogos')[0] == 401)

# Maiz
ok('tecnico maiz entra a /tecnico/mis-registros', http('/tecnico/mis-registros', t_mai)[0] == 200)
st, r = http('/tecnico/mis-registros', t_fri)
ok('tecnico solo frijol -> 403 en flujo de maiz', st == 403, str(r.get('codigo') if r else ''))
ok('tecnico con ambos entra al flujo de maiz', http('/tecnico/mis-registros', t_amb)[0] == 200)
ok('tecnico sin programas (cuenta anterior) entra al flujo de maiz', http('/tecnico/mis-registros', t_leg)[0] == 200)
ok('tecnico solo frijol SI puede ver su perfil', http('/tecnico/perfil', t_fri)[0] == 200)

# El productor solo-frijol sintetico NO aparece en los listados de maiz del tecnico con ambos programas
st, r = http('/tecnico/mis-registros', t_fri)
print('\nRESUMEN T02:', sum(res), '/', len(res))

# --- Productor nuevo de MAIZ por tecnico: queda con su renglon 'simac_maiz'
curp_nueva = 'QAPM900101HDG' + ''.join(random.choices(string.ascii_uppercase, k=3)) + '0' + random.choice(string.digits)
st, r = http('/tecnico/registro-alterno', t_mai, 'POST', {
    'curp': curp_nueva, 'nombres': 'Prueba', 'apellido_paterno': 'Maiz', 'apellido_materno': 'Alterno', 'telefono': '6181111111',
    'state_id': '10', 'municipality_id': '10005', 'sexo': 'H', 'fecha_nac': '1990-01-01',
    'estado_up': 'Durango', 'municipio_up': 'Durango', 'nombre_up': 'Parcela prueba maiz',
})
print('registro-alterno ->', st, (r or {}).get('error') or (r or {}).get('message'), (r or {}).get('producer_id'))
NUEVO = (r or {}).get('producer_id')
estado_set('productor_maiz', str(NUEVO))
