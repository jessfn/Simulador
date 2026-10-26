# -*- coding: utf-8 -*-
"""T03 · Un ciclo por cultivo: maíz y frijol conviven en la misma parcela; borrados protegidos."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *

tok = login('qa.maiz1@ejemplo.test')
adm = login_admin()
prod = str(estado_get('productor_maiz'))
up = sql(f"select up_id from up where producer_id={prod} limit 1").split('\n')[2].strip()
print('productor', prod, 'parcela', up)

# --- Ciclo de maiz con su cultivo (flujo normal de maiz)
st, r = http(f'/ups/{up}/cycles', tok, 'POST', {'cycle_year': 2026, 'cycle_type': 'PV', 'tipo_riego': 'temporal'})
ok('maiz: crear ciclo PV 2026', st in (201, 409), f'{st} {(r or {}).get("error", "")}')
st, ciclos = http(f'/ups/{up}/cycles', tok)
maiz_id = [c for c in ciclos['cycles'] if c['cycle_type'] == 'PV' and c['cycle_year'] == 2026][0]['cycle_id']
st, r = http(f'/cycles/{maiz_id}/crops', tok, 'POST', {'crop': 'maiz', 'variety_id': 'SB-101', 'area_sown_ha': 1, 'planting_date': '2026-07-01', 'yield_expected': 6})
ok('maiz: guardar cultivo maiz en su ciclo', st == 201, f'{st} {(r or {}).get("error", "")}')
st, r = http(f'/ups/{up}/cycles', tok, 'POST', {'cycle_year': 2026, 'cycle_type': 'PV'})
ok('segundo ciclo activo de maiz PV 2026 en la misma parcela sigue rechazado (409)', st == 409, str(st))
st, r = http(f'/cycles/{maiz_id}/crops', tok, 'POST', {'crop': 'frijol', 'variety_id': 'PINTO_SALTILLO', 'area_sown_ha': 1, 'planting_date': '2026-07-01'})
ok('crop distinto al del ciclo -> 400', st == 400, (r or {}).get('error', ''))

# --- Insertar a mano un ciclo de frijol PV 2026 activo en esa misma parcela
sql(f"insert into cycle (up_id, cycle_year, cycle_type, estado_ciclo, tipo_riego, crop) values ({up}, 2026, 'PV', 'activo', 'temporal', 'frijol')")
fid = sql(f"select cycle_id from cycle where up_id={up} and crop='frijol'").split('\n')[2].strip()
sql(f"insert into cycle_crop (cycle_id, crop, variety_id, area_sown_ha, planting_date) values ({fid}, 'frijol', 'PINTO_SALTILLO', 0.5, '2026-07-10')")
ok('frijol PV 2026 activo conviviendo con maiz PV 2026 en la misma parcela', fid.isdigit(), f'ciclo frijol {fid}')

st, ciclos = http(f'/ups/{up}/cycles', tok)
tipos = [c['cycle_id'] for c in ciclos['cycles']]
ok('el tecnico de maiz NO ve el ciclo de frijol', fid not in [str(t) for t in tipos] and str(maiz_id) in [str(t) for t in tipos], f've {tipos}')
ok('el ciclo de maiz sigue con su cultivo maiz', all(cr['crop'] == 'maiz' for c in ciclos['cycles'] for cr in c['crops']))

# el cultivo de frijol no se puede editar ni borrar desde el flujo de maiz
cc_f = sql(f"select cycle_crop_id from cycle_crop where cycle_id={fid}").split('\n')[2].strip()
st, _ = http(f'/cycle-crops/{cc_f}', tok, 'PATCH', {'area_sown_ha': 0.3})
ok('maiz no puede editar el cultivo de frijol', st == 403, str(st))
st, _ = http(f'/cycles/{fid}', tok, 'DELETE')
ok('maiz no puede borrar el ciclo de frijol', st == 404, str(st))
st, _ = http(f'/cycles/{fid}/estado', tok, 'PATCH', {'estado': 'cancelado'})
ok('maiz no puede cambiar el estado del ciclo de frijol', st == 404, str(st))

# --- Borrados protegidos (409)
sql(f"insert into producer_programa (producer_id, programa) values ({prod}, 'frijol_afb') on conflict do nothing")
st, r = http(f'/admin/productores/{prod}', adm, 'DELETE')
ok('admin no puede borrar un productor que tambien esta en Frijol (409)', st == 409, (r or {}).get('error', ''))
st, r = http(f'/admin/parcelas/{up}', adm, 'DELETE')
ok('admin no puede borrar una parcela con frijol (409)', st == 409, (r or {}).get('error', ''))
sql(f"delete from producer_programa where producer_id={prod} and programa='frijol_afb'")

# --- Limpieza del ciclo de frijol de prueba
sql(f"delete from cycle_crop where cycle_id={fid}"); sql(f"delete from cycle where cycle_id={fid} and crop='frijol'")
print('\nRESUMEN T03:', sum(res), '/', len(res))
estado_set('ciclo_maiz', f'{up},{maiz_id}')
