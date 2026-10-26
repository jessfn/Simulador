# -*- coding: utf-8 -*-
"""T11 (A) · Origen de la parcela y cifras de maíz: una parcela cuenta en maíz si su origen es maíz O si tiene un ciclo de maíz."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *
import io

t1 = login(EM('frijol1')); tm = login(EM('maiz1')); adm = login_admin()
SRC = BACKEND / 'src'
suf = ''.join(random.choices(string.ascii_uppercase, k=6))

def total_ups_maiz():
    st, d = http('/dashboard/admin/operacion', adm)
    return (d or {}).get('calidad_datos', {}).get('total_ups')

def filas_hoja(nombre_hoja):
    import openpyxl
    st, blob = http('/admin/exportar-bd', adm, raw=True)
    wb = openpyxl.load_workbook(io.BytesIO(blob), read_only=True)
    return wb[nombre_hoja].max_row - 1

_cache_export = {}
def hoja_parcelas():
    """Renglones de la hoja 'Parcelas (UP)' de la exportación de maíz: lista de (ID UP, Productor). Se vuelve a descargar solo si pasa 'fresco'."""
    import openpyxl
    st, blob = http('/admin/exportar-bd', adm, raw=True)
    wb = openpyxl.load_workbook(io.BytesIO(blob), read_only=True)
    return [(int(r[0]), str(r[2])) for r in wb['Parcelas (UP)'].iter_rows(min_row=2, values_only=True) if r and r[0] is not None]

def parcelas_en_panel(apellido):
    """Parcelas que el panel de maíz muestra (hoja de parcelas de la exportación) para productores con ese apellido."""
    return sorted(u for u, nombre in hoja_parcelas() if apellido in nombre)

def ups_de(pid):
    return [int(x) for x in [l.strip() for l in sql(f"select up_id from up where producer_id={pid} order by up_id").splitlines()[2:] if l.strip() and not l.startswith('(')]]

def maiz_con(apellido, n_parcelas):
    curp = curp_nueva('REN')
    st, r = http('/tecnico/registro-alterno', tm, 'POST', {'curp': curp, 'nombres': 'Maicero', 'apellido_paterno': apellido, 'apellido_materno': 'Origen', 'telefono': '6181111111',
        'state_id': '10', 'municipality_id': '10005', 'sexo': 'H', 'fecha_nac': '1985-03-03', 'estado_up': 'Durango', 'municipio_up': 'Durango', 'nombre_up': 'Parcela maiz 1'})
    pid = (r or {}).get('producer_id')
    for k in range(2, n_parcelas + 1):
        http('/tecnico/registro-alterno', tm, 'POST', {'producer_id_existente': int(pid), 'telefono': '6181111111', 'state_id': '10', 'municipality_id': '10005',
                                                      'estado_up': 'Durango', 'municipio_up': 'Durango', 'nombre_up': f'Parcela maiz {k}'})
    return curp, pid

def frijol_sobre_maiz(curp, parcela_existente=None, numero=2, total=3, ha=0.1):
    """El técnico de frijol registra frijol a un productor que ya está en maíz: en una parcela NUEVA o en una existente."""
    stc, c = consultar(t1, curp)
    b = cuerpo(curp, token=None, numero=numero, total=total)
    b['productor'].update(nombres=c['datos']['nombres'], apellido_paterno=c['datos']['apellido_paterno'], apellido_materno=c['datos']['apellido_materno'],
                          sexo=c['datos']['sexo'] or 'H', fecha_nacimiento=c['datos']['fecha_nacimiento'] or '1985-03-03', telefono=c['datos'].get('telefono') or '6181111111')
    if parcela_existente:
        b['parcela'].update(up_id=int(parcela_existente), nombre=None, poligono=None, water_regime=None)
    b['cultivo'].update(area_sown_ha=ha)
    return registrar(t1, b)

print('--- 11.1 · la migración 0006')
ok('todas las parcelas existentes tienen origen (ninguna sin valor)', val("select count(*) from up where programa_origen is null") == '0')
ok('la columna tiene su DEFAULT simac_maiz (los INSERT de maíz no cambian)', "simac_maiz" in val("select column_default from information_schema.columns where table_name='up' and column_name='programa_origen'"))
ok('la columna apunta al catálogo de programas', val("select count(*) from information_schema.table_constraints tc join information_schema.key_column_usage k using(constraint_name) where tc.table_name='up' and tc.constraint_type='FOREIGN KEY' and k.column_name='programa_origen'") == '1')
ok('hay índice sobre la columna', val("select count(*) from pg_indexes where tablename='up' and indexname='idx_up_programa_origen'") == '1')

mig = (BACKEND / 'db' / 'migrations' / '0006_origen_de_parcela.sql').read_text(encoding='utf-8')
bajada = mig.split('-- Down Migration')[1]
bloque_do = re.search(r'DO \$\$.*?END \$\$;', bajada, re.S).group(0)
resto = [x.strip() for x in re.sub(r'(?m)^\s*--.*$', '', re.sub(r'DO \$\$.*?END \$\$;', '', bajada, flags=re.S)).split(';') if x.strip()]
pid_demo = val("select up_id from up order by up_id limit 1")
r_bloq = sql_revertido(["update up set programa_origen='frijol_afb' where up_id=" + pid_demo, bloque_do.rstrip(';'), "select 1"])
ok('la bajada se NIEGA si hay parcelas con origen frijol (mensaje claro)', 'ERROR_SQL' in r_bloq and 'No se puede revertir 0006' in r_bloq, r_bloq.strip()[:110])
r_ok = sql_revertido(["update up set programa_origen='simac_maiz'", bloque_do.rstrip(';'), *resto, "select count(*) as columna from information_schema.columns where table_name='up' and column_name='programa_origen'"])
lineas = [l.strip() for l in r_ok.splitlines() if l.strip()]
ok('sin parcelas de frijol, la bajada quita la columna sin errores (y se revierte para la prueba)', len(lineas) > 2 and lineas[2] == '0', r_ok.strip()[:100])
ok('la base de pruebas sigue con su columna después de la prueba de bajada', val("select count(*) from information_schema.columns where table_name='up' and column_name='programa_origen'") == '1')

print('--- 11.2 · quién escribe el origen')
ups_ini = total_ups_maiz(); hoja_ini = filas_hoja('Parcelas (UP)')
ap_a = 'OrigenA' + suf
curp_a, A = maiz_con(ap_a, 2)                  # productor de maíz con 2 parcelas de maíz
ups_a = ups_de(A)
ok('preparación: productor de maíz con 2 parcelas', len(ups_a) == 2, str(ups_a))
ok('las parcelas que crea maíz nacen con origen maíz', all(val(f"select programa_origen from up where up_id={u}") == 'simac_maiz' for u in ups_a))
st, ra = frijol_sobre_maiz(curp_a)             # frijol en una parcela NUEVA del mismo productor
UP_F = ra.get('up_id')
ok('el técnico de frijol le registra una parcela nueva de frijol', st == 201 and UP_F, f'{st} {(ra or {}).get("error", "")}')
ok('la parcela nueva que crea frijol nace con origen frijol_afb', val(f"select programa_origen from up where up_id={UP_F}") == 'frijol_afb')
ok('las parcelas de maíz del mismo productor NO cambian de origen', all(val(f"select programa_origen from up where up_id={u}") == 'simac_maiz' for u in ups_a))

ap_b = 'OrigenB' + suf
curp_b, Bp = maiz_con(ap_b, 1); UP_B = ups_de(Bp)[0]
http(f'/ups/{UP_B}/cycles', tm, 'POST', {'cycle_year': 2031, 'cycle_type': 'PV', 'tipo_riego': 'temporal'})
cid_b = val(f"select cycle_id from cycle where up_id={UP_B} and crop='maiz'")
http(f'/cycles/{cid_b}/crops', tm, 'POST', {'crop': 'maiz', 'variety_id': 'SB-101', 'area_sown_ha': 1, 'planting_date': '2031-07-01', 'yield_expected': 6})
st, rb = frijol_sobre_maiz(curp_b, parcela_existente=UP_B, numero=1, total=1, ha=0.5)
ok('frijol sobre una parcela EXISTENTE de maíz', st == 201 and str(rb.get('up_id')) == str(UP_B), f'{st} {(rb or {}).get("error", "")}')
ok('registrar frijol en una parcela existente NO le cambia el origen', val(f"select programa_origen from up where up_id={UP_B}") == 'simac_maiz')

ap_c = 'OrigenC' + suf
curp_c = curp_nueva('REN'); stc, cc_ = consultar(t1, curp_c)
st, rc = registrar(t1, cuerpo(curp_c, token=cc_.get('verificacion_token')))
UP_C = rc.get('up_id'); C = rc.get('producer_id')
http(f'/frijol/productores/{C}', t1, 'PATCH', {'productor': {'apellido_paterno': ap_c}})
ok('productor solo de frijol: su parcela nace con origen frijol', st == 201 and val(f"select programa_origen from up where up_id={UP_C}") == 'frijol_afb')
ok('el productor solo de frijol NO está en el programa de maíz', val(f"select count(*) from producer_programa where producer_id={C} and programa='simac_maiz'") == '0')

print('--- 11.2 · el origen no se modifica por ninguna ruta de usuario')
asignan = []
for f in sorted(SRC.rglob('*.ts')):
    for n, linea in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
        if re.search(r'programa_origen\s*=\s*[\'"$]', linea) and 'WHERE' not in linea.upper().split('programa_origen')[0]:
            asignan.append(f'{f.relative_to(BACKEND).as_posix()}:{n}')
ok('solo el registro de frijol (parcela nueva) escribe programa_origen', asignan and all(a.startswith('src/services/frijolRegistro.ts') for a in asignan), ', '.join(asignan))

print('--- 11.3 · cifras de maíz (panel de administración)')
ok('el panel de maíz muestra 2 parcelas del productor con 2 de maíz + 1 de frijol (no 3)', parcelas_en_panel(ap_a) == sorted(ups_a), str(parcelas_en_panel(ap_a)))
ok('la parcela con maíz y frijol a la vez cuenta UNA vez', parcelas_en_panel(ap_b) == [UP_B], str(parcelas_en_panel(ap_b)))
ok('la parcela del productor solo de frijol no aparece en el panel de maíz', parcelas_en_panel(ap_c) == [])
ups_fin = total_ups_maiz(); hoja_fin = filas_hoja('Parcelas (UP)')
ok('"parcelas" del tablero de maíz sube solo por las de maíz (+3, no +5)', ups_fin - ups_ini == 3, f'{ups_ini} -> {ups_fin}')
ok('la exportación de maíz (hoja Parcelas) sube solo por las de maíz (+3)', hoja_fin - hoja_ini == 3, f'{hoja_ini} -> {hoja_fin}')
st, mc = http(f'/cycles/{cid_b}/crops', tm, 'POST', {'crop': 'maiz', 'variety_id': 'SB-101', 'area_sown_ha': 1, 'planting_date': '2031-07-01', 'yield_expected': 6})
ok('las hectáreas sembradas de maíz de esa parcela salen solo del ciclo de maíz (1 ha, no 1.5)', val(f"select sum(cc.area_sown_ha) from cycle_crop cc join cycle c using(cycle_id) where c.up_id={UP_B} and c.crop='maiz'") in ('1', '1.0', '1.00'))

print('--- 11.3.4 · pantallas de maíz que listan las parcelas de un productor')
st, l = http(f'/tecnico/productor/{A}/ups', tm)
ok('técnico de maíz: ve 2 parcelas (la de frijol no se muestra)', st == 200 and sorted(u['up_id'] for u in l['ups']) == sorted(ups_a), str([u['up_id'] for u in (l or {}).get('ups', [])]))
st, rr = http('/tecnico/mis-registros', tm)
fila_a = [r for r in (rr or {}).get('registros', []) if r.get('producer_id') == A]
ok('técnico de maíz, "mis registros": cuenta 2 parcelas del productor', st == 200 and fila_a and int(fila_a[0].get('total_ups', 0)) == 2, str(fila_a[0].get('total_ups') if fila_a else None))
# el propio productor activa su cuenta (como en T08) y entra a la app de maíz
st, b_ = http('/productor/auth/buscar-curp', None, 'POST', {'curp': curp_a})
st, _ = http('/productor/auth/activar-cuenta', None, 'POST', {'producer_id': b_['producer_id'], 'pin': '4821'})
st, lg = http('/productor/auth/login-pin', None, 'POST', {'curp': curp_a, 'pin': '4821'})
tp = lg.get('token')
st, m = http('/productor/mis-ups-con-ciclos', tp)
ids_m = sorted(u['up_id'] for u in (m if isinstance(m, list) else (m or {}).get('ups', [])))
ok('productor de maíz con cuenta: ve sus 2 parcelas de maíz de siempre (no la de frijol)', st == 200 and ids_m == sorted(ups_a), str(ids_m))
st, m2 = http('/mis-ups', tp)
ids_m2 = sorted(u['up_id'] for u in (m2 or {}).get('ups', []))
ok('su lista "mis parcelas" tampoco muestra la de frijol', st == 200 and ids_m2 == sorted(ups_a), str(ids_m2))

print('--- 11.3.5 · una parcela de origen frijol a la que se le crea un ciclo de maíz pasa a contar en maíz')
st, r = http(f'/ups/{UP_F}/cycles', tm, 'POST', {'cycle_year': 2031, 'cycle_type': 'PV', 'tipo_riego': 'temporal'})
ok('el técnico de maíz le crea un ciclo de maíz a la parcela de origen frijol', st in (200, 201), f'{st} {(r or {}).get("error", "")}')
ok('su origen NO cambia (sigue frijol_afb)', val(f"select programa_origen from up where up_id={UP_F}") == 'frijol_afb')
ok('ahora el panel de maíz la cuenta (3 parcelas)', parcelas_en_panel(ap_a) == sorted(ups_a + [UP_F]), str(parcelas_en_panel(ap_a)))
st, m = http('/productor/mis-ups-con-ciclos', tp)
ids_m = sorted(u['up_id'] for u in (m if isinstance(m, list) else (m or {}).get('ups', [])))
ok('y el productor con cuenta la ve en su app de maíz', ids_m == sorted(ups_a + [UP_F]), str(ids_m))
ok('el tablero de maíz suma esa parcela (+4 en total)', total_ups_maiz() - ups_ini == 4, f'{ups_ini} -> {total_ups_maiz()}')

print('--- una parcela de maíz recién registrada SIN ciclo sigue contando')
ap_d = 'OrigenD' + suf; curp_d, D = maiz_con(ap_d, 1)
ok('parcela de maíz sin ciclo aparece en el panel (su origen es maíz)', parcelas_en_panel(ap_d) == ups_de(D), str(parcelas_en_panel(ap_d)))

resumen('T11 (A)')
