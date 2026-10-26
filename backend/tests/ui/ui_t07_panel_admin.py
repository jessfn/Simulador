# -*- coding: utf-8 -*-
"""T07 · Panel de administración de frijol en pantalla (escritorio y celular): filtros, tabla, detalle, mapa y Excel."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *
from playwright.sync_api import sync_playwright
(AQUI / ".tmp").mkdir(exist_ok=True)

# Lo esperado en pantalla con los filtros Durango + Pinto Saltillo + cumple criterio de semillas: el total que dice el API (la tabla muestra hasta 50 por página)
_s, _r = http('/admin/frijol/registros?estado=10&variedad=PINTO_SALTILLO&semillas=si&limite=50', login_admin())
ESPERADO = min(50, (_r or {}).get('total', 0))

with sync_playwright() as p:
    br = p.chromium.launch(); errs = []
    for nombre, vp in (('escritorio', {'width': 1366, 'height': 800}), ('celular', {'width': 390, 'height': 844})):
        ctx = br.new_context(viewport=vp, service_workers='block', accept_downloads=True); pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(WEB + '/maiz/admin/login'); pg.wait_for_timeout(1500)
        pg.fill('input[type=email]', EM('admin')); pg.fill('input[type=password]', ADM)
        pg.locator('button[type=submit]').click(); pg.wait_for_timeout(3500)
        pg.goto(WEB + '/maiz/admin/frijol'); pg.wait_for_timeout(3000)
        ok(f'[{nombre}] abre /maiz/admin/frijol', pg.url.endswith('/maiz/admin/frijol'), pg.url)
        ok(f'[{nombre}] tarjetas con produccion estimada y pendientes > 14 dias', pg.get_by_text('Producción estimada').count() == 1 and pg.get_by_text('Pendientes más de 14 días').count() == 1)
        pg.screenshot(path=str(AQUI / '.tmp' / f'panel_{nombre}_resumen.png'))
        if nombre == 'celular':
            pg.get_by_role('button', name='Filtros').click(); pg.wait_for_timeout(400)
        pg.get_by_label('Estado', exact=True).select_option(label='Durango'); pg.wait_for_timeout(1200)
        pg.get_by_label('Variedad').select_option(label='Pinto Saltillo')
        pg.get_by_label('Cumple criterio de semillas').select_option(label='Sí cumple')
        pg.get_by_role('button', name='Filtrar').click(); pg.wait_for_timeout(2000)
        ok(f'[{nombre}] el resumen respeta los filtros', pg.get_by_text('Filtros aplicados').count() == 1)
        pg.get_by_role('tab', name='registros').click(); pg.wait_for_timeout(2500)
        filas = pg.locator('tbody tr').count(); cols = pg.locator('thead th').count()
        ok(f'[{nombre}] registros filtrados (lo que dice el API) con 18 columnas', filas == ESPERADO and ESPERADO > 0 and cols == 18, f'{filas} filas, {cols} columnas')
        pg.screenshot(path=str(AQUI / '.tmp' / f'panel_{nombre}_registros.png'))
        pg.get_by_role('button', name='Quitar filtros').click(); pg.wait_for_timeout(2000)
        pg.locator('thead button', has_text='Ha sembradas').click(); pg.wait_for_timeout(1500)
        ok(f'[{nombre}] ordenar por columna', pg.locator('th[aria-sort]').count() == 1)
        pg.locator('tbody tr').first.click(); pg.wait_for_timeout(2500)
        ok(f'[{nombre}] el detalle es una pagina propia', '/maiz/admin/frijol/productor/' in pg.url, pg.url)
        ok(f'[{nombre}] detalle: verificacion, parcelas, semillas, cultivos e historial',
           all(pg.get_by_text(t).count() >= 1 for t in ('Verificación de identidad', 'Parcelas (', 'Semillas', 'Cultivos (', 'Historial de cambios (')))
        pg.screenshot(path=str(AQUI / '.tmp' / f'panel_{nombre}_ficha.png'), full_page=True)
        pg.get_by_role('button', name='Regresar a Frijol').click(); pg.wait_for_timeout(1500)
        ok(f'[{nombre}] regresar vuelve al panel', pg.url.endswith('/maiz/admin/frijol'))
        pg.get_by_role('tab', name='mapa').click(); pg.wait_for_timeout(4000)
        ok(f'[{nombre}] mapa con poligonos y leyenda de estatus', pg.locator('.leaflet-overlay-pane path').count() > 0 and pg.get_by_text('Requiere corrección').count() >= 1, str(pg.locator('.leaflet-overlay-pane path').count()))
        pg.screenshot(path=str(AQUI / '.tmp' / f'panel_{nombre}_mapa.png'))
        if nombre == 'escritorio':
            with pg.expect_download(timeout=30000) as d: pg.get_by_role('button', name='Exportar a Excel').click()
            ok('descarga Excel desde el boton', d.value.suggested_filename.startswith('frijol_registros_') and d.value.suggested_filename.endswith('.xlsx'), d.value.suggested_filename)
        ctx.close()
    ok('sin errores JS', not errs, str(errs[:2])); br.close()
print('\nRESUMEN UI T07:', sum(res), '/', len(res))
