# -*- coding: utf-8 -*-
"""T05 §5.7 · Un productor que llegó por frijol se registra después en maíz (por técnico)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *
t1 = login(EM('frijol1')); t2 = login(EM('frijol2')); tm = login(EM('maiz1'))
uid1 = val(f"select id from usuarios where correo_electronico='{EM('frijol1')}'")

P1 = str(estado_get('frijol_primero'))
curp = val(f"select curp from productor where productor_id={P1}")
dueno_producer = val(f"select usuario_capturista_id from productor where productor_id={P1}")
print('productor', P1, curp, 'dueno en producer =', dueno_producer)

st, c = http('/tecnico/consultar-curp', tm, 'POST', {'curp': curp})
ok('el tecnico de maiz lo encuentra y puede activarlo (PUEDE_ACTIVAR)', st == 200 and c.get('codigo') == 'PUEDE_ACTIVAR', f'{st} {c.get("codigo")}')
st, r = http('/tecnico/registro-alterno', tm, 'POST', {'producer_id_existente': int(P1), 'telefono': '6182223344', 'state_id': '10', 'municipality_id': '10005',
                                                      'estado_up': 'Durango', 'municipio_up': 'Durango', 'nombre_up': 'Parcela maiz del que llego por frijol'})
ok('un tecnico de maiz registra en maiz al productor que llego por frijol -> 201', st == 201, f'{st} {(r or {}).get("error", "")}')
ok('queda su renglon de maiz con el tecnico de maiz', val(f"select usuario_capturista_id from productor_programa where productor_id={P1} and programa='simac_maiz'") == val("select id from usuarios where correo_electronico='qa.maiz1@ejemplo.test'"))
ok('el dueño en producer sigue siendo el tecnico de frijol', val(f"select usuario_capturista_id from productor where productor_id={P1}") == dueno_producer)
ok('su programa de frijol sigue intacto', val(f"select usuario_capturista_id from productor_programa where productor_id={P1} and programa='frijol_afb'") == dueno_producer)
st, r = http(f'/tecnico/productor/{P1}/ups', tm)
ok('el tecnico de maiz ya puede trabajar sus parcelas (ownership por programa)', st == 200, str(st))
st, r = http(f'/tecnico/productor/{P1}/ups', t1)
ok('el tecnico de frijol NO accede por el flujo de maiz (403)', st == 403, str(st))
st, r = http(f'/frijol/productores/{P1}', t1)
ok('el tecnico de frijol sigue viendo su registro de frijol', st == 200 and len(r['cultivos']) >= 1, str(st))
# otro tecnico de maiz no puede tomarlo ahora
sql("delete from usuario_programa where usuario_id=(select id from usuarios where correo_electronico='qa.maiz2@ejemplo.test')")
sql("insert into usuario_programa select id,'simac_maiz' from usuarios where correo_electronico='qa.maiz2@ejemplo.test'")
tm2 = login('qa.maiz2@ejemplo.test')
st, r = http('/tecnico/registro-alterno', tm2, 'POST', {'producer_id_existente': int(P1), 'telefono': '6182223344', 'estado_up': 'Durango', 'municipio_up': 'Durango'})
ok('otro tecnico de maiz no puede tomarlo (403)', st == 403, f'{st} {(r or {}).get("error", "")}')
print('\nRESUMEN T05 5.7:', sum(res), '/', len(res))
