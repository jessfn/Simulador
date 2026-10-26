# -*- coding: utf-8 -*-
"""T09 (A) · §9.1 el endpoint de cultivos de ciclo es solo para maíz (M4) y §9.2 la corrección de frijol valida los catálogos (M2)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *

t1 = login(EM('frijol1')); tm = login(EM('maiz1')); adm = login_admin()
sql("update cat_programas_gobierno set activo=true where clave='semillas_bienestar'")   # por si una corrida anterior se interrumpió

# ---------- datos de prueba: un productor de maíz con parcela y un registro de frijol ----------
curp_m = curp_nueva('REN')
st, rmz = http('/tecnico/registro-alterno', tm, 'POST', {'curp': curp_m, 'nombres': 'Maicero', 'apellido_paterno': 'Ciclos', 'apellido_materno': 'Prueba', 'telefono': '6181111111',
                                                      'state_id': '10', 'municipality_id': '10005', 'sexo': 'H', 'fecha_nac': '1985-03-03', 'estado_up': 'Durango', 'municipio_up': 'Durango', 'nombre_up': 'Parcela ciclos'})
UP = str(rmz.get('up_id')); PM = rmz.get('producer_id')
anio = 2031   # año que ningún dato real usa, para no chocar con ciclos existentes
st, r = http(f'/ups/{UP}/cycles', tm, 'POST', {'cycle_year': anio, 'cycle_type': 'PV', 'tipo_riego': 'temporal'})
ciclo_maiz = (r or {}).get('cycle', {}).get('cycle_id') or val(f"select cycle_id from cycle where up_id={UP} and cycle_year={anio} and crop='maiz'")
ok('preparación: productor de maíz con su ciclo', st in (200, 201) and str(ciclo_maiz).isdigit(), f'{st} ciclo {ciclo_maiz}')

# un ciclo de frijol en esa misma parcela (como lo dejaría un registro de frijol)
sql(f"insert into cycle (up_id, cycle_year, cycle_type, estado_ciclo, tipo_riego, crop) values ({UP}, {anio}, 'OI', 'activo', 'temporal', 'frijol')")
ciclo_frijol = val(f"select cycle_id from cycle where up_id={UP} and crop='frijol' and cycle_year={anio}")
sql(f"insert into cycle_crop (cycle_id, crop, variety_id, area_sown_ha, planting_date, yield_expected) values ({ciclo_frijol}, 'frijol', 'PINTO_SALTILLO', 0.5, '{anio}-10-10', 0.9)")
cc_frijol = val(f"select cycle_crop_id from cycle_crop where cycle_id={ciclo_frijol}")

cult_maiz = {'variety_id': 'SB-101', 'area_sown_ha': 1, 'planting_date': f'{anio}-07-01', 'yield_expected': 6}

print('--- 9.1 · POST /cycles/:id/crops solo acepta maíz')
st, r = http(f'/cycles/{ciclo_maiz}/crops', tm, 'POST', {'crop': 'frijol', 'variety_id': 'PINTO_SALTILLO', 'area_sown_ha': 1, 'planting_date': f'{anio}-07-01'})
ok('crop = frijol hacia un ciclo de MAÍZ -> 400 con el mensaje nuevo', st == 400 and 'solo para maíz' in (r or {}).get('error', ''), f'{st} {(r or {}).get("error", "")[:70]}')
st, r = http(f'/cycles/{ciclo_frijol}/crops', tm, 'POST', {'crop': 'frijol', 'variety_id': 'PINTO_SALTILLO', 'area_sown_ha': 9, 'planting_date': f'{anio}-07-01'})
ok('crop = frijol hacia un ciclo de FRIJOL -> 400 (no pisa el cultivo)', st == 400 and 'solo para maíz' in (r or {}).get('error', ''), f'{st}')
ok('el cultivo de frijol quedó intacto (0.5 ha)', val(f"select area_sown_ha from cycle_crop where cycle_crop_id={cc_frijol}") in ('0.5', '0.50'))
st, r = http(f'/cycles/{ciclo_maiz}/crops', tm, 'POST', {'crop': 'trigo', 'variety_id': 'X', 'area_sown_ha': 1, 'planting_date': f'{anio}-07-01'})
ok('cualquier otro cultivo -> 400', st == 400)
st, r = http(f'/cycles/{ciclo_maiz}/crops', tm, 'POST', {'crop': 'maiz', **cult_maiz})
ok('crop = maiz hacia un ciclo de maíz sigue funcionando (crear)', st == 201, f'{st} {(r or {}).get("error", "")}')
st, r = http(f'/cycles/{ciclo_maiz}/crops', tm, 'POST', {'crop': 'maiz', **{**cult_maiz, 'area_sown_ha': 1.5}})
ok('el mismo POST de maíz sigue ACTUALIZANDO el cultivo (comportamiento de maíz intacto)', st == 201 and val(f"select area_sown_ha from cycle_crop where cycle_id={ciclo_maiz}") in ('1.5', '1.50'), f'{st}')
st, r = http(f'/cycles/{ciclo_frijol}/crops', tm, 'POST', {'crop': 'maiz', **cult_maiz})
ok('crop = maiz hacia un ciclo de FRIJOL -> 400 por incoherencia', st == 400 and 'Este ciclo es de frijol' in (r or {}).get('error', ''), f'{st} {(r or {}).get("error", "")[:70]}')
ok('el cultivo de frijol sigue sin cambios tras los dos intentos', val(f"select variety_id||'|'||area_sown_ha from cycle_crop where cycle_crop_id={cc_frijol}").startswith('PINTO_SALTILLO|0.5'))

print('--- 9.1 · los demás endpoints de maíz no tocan ciclos de otro cultivo')
st, _ = http(f'/cycle-crops/{cc_frijol}', tm, 'PATCH', {'area_sown_ha': 0.3})
ok('PATCH /cycle-crops/:id sobre un cultivo de frijol -> 403', st == 403, str(st))
st, _ = http(f'/cycles/{ciclo_frijol}/estado', tm, 'PATCH', {'estado': 'cancelado'})
ok('PATCH /cycles/:id/estado sobre un ciclo de frijol -> 404', st == 404, str(st))
st, _ = http(f'/cycles/{ciclo_frijol}', tm, 'DELETE')
ok('DELETE /cycles/:id sobre un ciclo de frijol -> 404', st == 404, str(st))
ok('el ciclo de frijol sigue ahí y activo', val(f"select estado_ciclo from cycle where cycle_id={ciclo_frijol}") == 'activo')

print('--- 9.2 · la corrección de frijol valida los catálogos')
curp_f = curp_nueva('REN'); st, c = consultar(t1, curp_f)
st, reg = registrar(t1, cuerpo(curp_f, token=c.get('verificacion_token')))
CC = (reg or {}).get('cycle_crop_id'); PF = (reg or {}).get('producer_id')
ok('preparación: registro de frijol', st == 201 and CC, f'{st} {(reg or {}).get("error", "")}')
def corregir(**campos):
    return http(f'/frijol/cultivos/{CC}', t1, 'PATCH', {'cultivo': campos})
for campo, malo, nombre in [('destino', 'xyz', 'destino'), ('tipo_siembra', 'xyz', 'tipo de siembra'), ('rotacion', 'xyz', 'rotación')]:
    st, r = corregir(**{campo: malo})
    ok(f'PATCH con {nombre} inventado -> 400 con campo cultivo.{campo}', st == 400 and (r or {}).get('campo') == f'cultivo.{campo}', f'{st} {(r or {}).get("campo")}')
st, r = corregir(usa_fertilizante=True, tipos_fertilizante=['xyz'])
ok('PATCH con fertilizante inventado -> 400 con campo cultivo.tipos_fertilizante', st == 400 and (r or {}).get('campo') == 'cultivo.tipos_fertilizante', f'{st} {(r or {}).get("campo")}')
st, r = corregir(variety_id='NO_EXISTE')
ok('PATCH con variedad inventada -> 400 con campo cultivo.variety_id', st == 400 and (r or {}).get('campo') == 'cultivo.variety_id', f'{st}')
ok('nada de lo inventado se guardó', val(f"select coalesce(tipo_siembra,'')||'|'||rotacion from frijol_cultivo where cycle_crop_id={CC}") == 'monocultivo|rota')
st, r = corregir(destino='autoconsumo', tipo_siembra='asociada', rotacion='un_cultivo', usa_fertilizante=True, tipos_fertilizante=['organico', 'biofertilizante'], densidad_kg_ha=50)
ok('PATCH con valores válidos funciona como antes', st == 200, f'{st} {(r or {}).get("error", "")}')
ok('y quedaron guardados', val(f"select tipo_siembra||'|'||rotacion from frijol_cultivo where cycle_crop_id={CC}") == 'asociada|un_cultivo' and val(f"select destination from cycle_crop where cycle_crop_id={CC}") == 'autoconsumo')

print('--- 9.2.3 · corrección del productor: seguro agrícola y programas contra el catálogo')
def corregir_prod(**fp):
    base = {'total_ups_declaradas': 1, 'participa_programas_sader': True, 'programas_sader': ['fertilizantes_bienestar'], 'programas_sader_otro': None,
            'organizacion': 'SPR Los Llanos', 'seguro_agricola': 'cadena', 'seguro_agricola_nombre': None}
    return http(f'/frijol/productores/{PF}', t1, 'PATCH', {'frijol_productor': {**base, **fp}})
st, r = corregir_prod(seguro_agricola='inventado')
ok('seguro agrícola inventado -> 400 con campo frijol_productor.seguro_agricola', st == 400 and (r or {}).get('campo') == 'frijol_productor.seguro_agricola', f'{st} {(r or {}).get("campo")}')
st, r = corregir_prod(programas_sader=['programa_inventado'])
ok('programa inventado -> 400 con campo frijol_productor.programas_sader', st == 400 and (r or {}).get('campo') == 'frijol_productor.programas_sader', f'{st} {(r or {}).get("campo")}')
st, r = corregir_prod(seguro_agricola='no', programas_sader=['semillas_bienestar'])
ok('valores válidos del catálogo se aceptan', st == 200, f'{st} {(r or {}).get("error", "")}')
sql("update cat_programas_gobierno set activo=false where clave='semillas_bienestar'")
st, r = corregir_prod(programas_sader=['semillas_bienestar'])
ok('un programa desactivado en el catálogo ya no se acepta (se lee del catálogo, no de una lista fija)', st == 400 and (r or {}).get('campo') == 'frijol_productor.programas_sader', f'{st}')
sql("update cat_programas_gobierno set activo=true where clave='semillas_bienestar'")
st, r = corregir_prod(programas_sader=['semillas_bienestar'])
ok('al reactivarlo vuelve a aceptarse', st == 200, str(st))

print('--- registro nuevo: usa la misma función compartida')
curp_g = curp_nueva('REN'); st, c = consultar(t1, curp_g)
st, r = registrar(t1, cuerpo(curp_g, token=c.get('verificacion_token'), cultivo__destino='xyz'))
ok('registro nuevo con destino inventado -> 400 cultivo.destino', st == 400 and (r or {}).get('campo') == 'cultivo.destino', f'{st} {(r or {}).get("campo")}')
st, r = registrar(t1, cuerpo(curp_g, token=c.get('verificacion_token'), cultivo__tipos_fertilizante=['xyz']))
ok('registro nuevo con fertilizante inventado -> 400', st == 400 and (r or {}).get('campo') == 'cultivo.tipos_fertilizante', f'{st}')

# limpieza de lo que se creó para esta prueba (el ciclo de frijol insertado a mano)
sql(f"delete from cycle_crop where cycle_id={ciclo_frijol}"); sql(f"delete from cycle where cycle_id={ciclo_frijol}")
resumen('T09 (A)')
