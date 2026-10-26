# -*- coding: utf-8 -*-
"""T11 (B) · Superficie combinada: maíz + frijol en la misma parcela, año y tipo de ciclo no pueden sumar más que la parcela (salvo siembra asociada)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *

t1 = login(EM('frijol1')); tm = login(EM('maiz1'))
suf = ''.join(random.choices(string.ascii_uppercase, k=6))
n = [0]

def parcela_con_maiz(ha_maiz, year=2026, tipo='PV', superficie=3.0):
    """Productor de maíz con una parcela de `superficie` ha y un ciclo de maíz con `ha_maiz` ha. Devuelve (curp, up_id, cycle_id, status_del_cultivo)."""
    n[0] += 1
    curp = curp_nueva('REN')
    st, r = http('/tecnico/registro-alterno', tm, 'POST', {'curp': curp, 'nombres': 'Combinado', 'apellido_paterno': f'Suma{suf}{n[0]}', 'apellido_materno': 'Prueba', 'telefono': '6181111111',
        'state_id': '10', 'municipality_id': '10005', 'sexo': 'H', 'fecha_nac': '1985-03-03', 'estado_up': 'Durango', 'municipio_up': 'Durango', 'nombre_up': 'Parcela combinada'})
    pid = r['producer_id']
    up = int(val(f"select up_id from up where producer_id={pid} order by up_id limit 1"))
    sql(f"update up set area_ha_real={superficie}, area_ha_calc={superficie} where up_id={up}")
    http(f'/ups/{up}/cycles', tm, 'POST', {'cycle_year': year, 'cycle_type': tipo, 'tipo_riego': 'temporal'})
    cid = int(val(f"select cycle_id from cycle where up_id={up} and crop='maiz' and cycle_year={year} and cycle_type='{tipo}'"))
    st, m = http(f'/cycles/{cid}/crops', tm, 'POST', {'crop': 'maiz', 'variety_id': 'SB-101', 'area_sown_ha': ha_maiz, 'planting_date': f'{year}-07-01', 'yield_expected': 6})
    return curp, up, cid, st

def frijol_en(curp, up, ha, tipo_siembra='monocultivo', siembra='2026-07-10', cosecha='2026-10-25'):
    stc, c = consultar(t1, curp)
    b = cuerpo(curp, token=None, siembra=siembra, cosecha=cosecha)
    b['productor'].update(nombres=c['datos']['nombres'], apellido_paterno=c['datos']['apellido_paterno'], apellido_materno=c['datos']['apellido_materno'],
                          sexo=c['datos']['sexo'] or 'H', fecha_nacimiento=c['datos']['fecha_nacimiento'] or '1985-03-03', telefono=c['datos'].get('telefono') or '6181111111')
    b['parcela'].update(up_id=int(up), nombre=None, poligono=None, water_regime=None)
    b['cultivo'].update(area_sown_ha=ha, tipo_siembra=tipo_siembra)
    return registrar(t1, b)

print('--- frijol registra sobre una parcela con maíz')
curp, up, cid, st = parcela_con_maiz(2.0)
ok('preparación: parcela de 3 ha con 2.0 ha de maíz', st in (200, 201), str(st))
st, r = frijol_en(curp, up, 1.0)
ok('2.0 maíz + 1.0 frijol = 3.0 (cabe justo): se guarda', st == 201, f'{st} {(r or {}).get("error", "")}')

curp2, up2, cid2, _ = parcela_con_maiz(2.0)
st, r = frijol_en(curp2, up2, 1.5)
ok('2.0 maíz + 1.5 frijol = 3.5 > 3.0: se rechaza con 409', st == 409 and (r or {}).get('codigo') == 'SUPERFICIE_COMBINADA', f'{st} {r}')
msg = (r or {}).get('error', '')
ok('el mensaje trae los números (parcela, lo que ya tiene, lo que registra, total)', all(x in msg for x in ['3.0', '2.0', '1.5', '3.5']), msg)
ok('indica el campo y las cifras para pintarlo en el paso del cultivo', r.get('campo') == 'cultivo.area_sown_ha' and r.get('suma') == 3.5 and r.get('superficie_parcela') == 3.0, str(r))
ok('no se creó ningún ciclo de frijol en la parcela rechazada', val(f"select count(*) from cycle where up_id={up2} and crop='frijol'") == '0')

curp3, up3, cid3, _ = parcela_con_maiz(2.0)
st, r = frijol_en(curp3, up3, 1.5, tipo_siembra='asociada')
ok('el mismo caso con siembra asociada (milpa) SÍ se guarda', st == 201, f'{st} {(r or {}).get("error", "")}')

print('--- correcciones')
curp4, up4, cid4, _ = parcela_con_maiz(2.0)
frijol_en(curp4, up4, 1.0)
cc4 = int(val(f"select cc.cycle_crop_id from cycle_crop cc join cycle c using(cycle_id) where c.up_id={up4} and c.crop='frijol'"))
st, r = http(f'/frijol/cultivos/{cc4}', t1, 'PATCH', {'cultivo': {'area_sown_ha': 1.0}})
ok('corregir frijol sin cambiar la superficie no se cuenta dos veces', st == 200, f'{st} {r}')
st, r = http(f'/frijol/cultivos/{cc4}', t1, 'PATCH', {'cultivo': {'area_sown_ha': 1.5}})
ok('corregir frijol a 1.5 (2.0 + 1.5 > 3.0) se rechaza con 409', st == 409 and (r or {}).get('suma') == 3.5, f'{st} {r}')
ok('la superficie del frijol no cambió tras el rechazo', float(val(f"select area_sown_ha::float from cycle_crop where cycle_crop_id={cc4}")) == 1.0)
cm4 = int(val(f"select cc.cycle_crop_id from cycle_crop cc where cc.cycle_id={cid4}"))
st, r = http(f'/cycle-crops/{cm4}', tm, 'PATCH', {'area_sown_ha': 2.5})
ok('corregir maíz a 2.5 (con 1.0 de frijol: 3.5 > 3.0) se rechaza con 409', st == 409 and r.get('suma') == 3.5, f'{st} {r}')
st, r = http(f'/cycle-crops/{cm4}', tm, 'PATCH', {'area_sown_ha': 2.0})
ok('corregir maíz a 2.0 (3.0 en total) se guarda', st == 200, f'{st} {r}')
st, r = http(f'/cycle-crops/{cm4}', tm, 'PATCH', {'yield_expected': 5})
ok('corregir otro dato del maíz (sin tocar la superficie) no revisa la suma', st == 200, f'{st} {r}')

print('--- alta de maíz sobre una parcela que ya tiene frijol')
curp5, up5, cid5, _ = parcela_con_maiz(1.0)
frijol_en(curp5, up5, 1.5)
http(f'/ups/{up5}/cycles', tm, 'POST', {'cycle_year': 2026, 'cycle_type': 'OI', 'tipo_riego': 'temporal'})
cid_oi = int(val(f"select cycle_id from cycle where up_id={up5} and crop='maiz' and cycle_type='OI'"))
st, r = http(f'/cycles/{cid_oi}/crops', tm, 'POST', {'crop': 'maiz', 'variety_id': 'SB-101', 'area_sown_ha': 3.0, 'planting_date': '2026-11-15', 'yield_expected': 6})
ok('otro tipo de ciclo (OI) no suma con el PV: se guarda', st == 201, f'{st} {r}')

print('--- lo que no cuenta')
curp6, up6, cid6, _ = parcela_con_maiz(2.0)
sql(f"update cycle set estado_ciclo='cancelado' where cycle_id={cid6}")
st, r = frijol_en(curp6, up6, 3.0)
ok('un ciclo de maíz cancelado no suma', st == 201, f'{st} {(r or {}).get("error", "")}')

curp7, up7, cid7, _ = parcela_con_maiz(2.0, year=2025)
st, r = frijol_en(curp7, up7, 3.0)
ok('un maíz de otro año no suma con el frijol de 2026', st == 201, f'{st} {(r or {}).get("error", "")}')

print('--- maíz solo no cambia')
curp8, up8, cid8, st8 = parcela_con_maiz(3.0)
ok('maíz solo, igual a la parcela: se guarda como siempre', st8 in (200, 201), str(st8))
curp9, up9, cid9, st9 = parcela_con_maiz(3.5)
ok('maíz solo, mayor a la parcela: lo sigue rechazando la regla de siempre (400)', st9 == 400, str(st9))

print('--- consulta de parcelas que ya pasan su superficie')
sqlf = (BACKEND / 'db' / 'consultas' / 't11b_parcelas_que_pasan_su_superficie.sql').read_text(encoding='utf-8')
sql(f"update cycle_crop set area_sown_ha=2.5 where cycle_id={cid4}")      # parcela 4 queda con 2.5 + 1.0 = 3.5 > 3.0
ups_marcadas = [int(x) for x in re.findall(r'(?m)^\s*(\d+)\s*\|', sql(sqlf))]
ok('la consulta de solo lectura marca la parcela que ya pasa', up4 in ups_marcadas, str(ups_marcadas[:5]))
ok('y no marca las parcelas sanas de esta prueba', not ({up, up3, up8} & set(ups_marcadas)), str(ups_marcadas[:5]))

resumen('T11 (B)')
