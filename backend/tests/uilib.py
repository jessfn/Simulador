# -*- coding: utf-8 -*-
"""Pasos reutilizables de las pruebas en pantalla (asistente de registro de frijol, en celular)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *
from playwright.sync_api import sync_playwright

def entrar(pg):
    pg.goto(WEB + '/frijol/tecnico/login'); pg.wait_for_timeout(1500)
    pg.fill('input[type=email]', EM('frijol1')); pg.fill('input[type=password]', PASS)
    pg.get_by_role('button', name='Entrar').click(); pg.wait_for_timeout(2500)

def shot(pg, nombre):
    (AQUI / '.tmp' / 'capturas').mkdir(parents=True, exist_ok=True); pg.screenshot(path=str(AQUI / '.tmp' / 'capturas' / f'{nombre}.png'))

def paso1(pg, curp, cons_texto='Persona válida en RENAPO'):
    pg.get_by_placeholder('XXXX000000XXXXXX00').fill(curp)
    pg.get_by_role('button', name='Buscar').click(); pg.wait_for_timeout(1800)
    return pg.get_by_text(cons_texto).count() >= 1

def paso2(pg, vacio_primero=True):
    if vacio_primero:
        pg.get_by_role('button', name='Siguiente').click(); pg.wait_for_timeout(1200)
        ok('paso 2: campos vacios muestran errores', pg.get_by_text('El teléfono debe tener 10 dígitos').count() == 1)
    ins = pg.locator('input')
    ins.nth(0).fill('Ramon'); ins.nth(1).fill('Garcia'); ins.nth(2).fill('Soto')
    pg.get_by_role('button', name='Hombre').click()
    pg.locator('input[type=date]').fill('1978-04-12')
    pg.locator('input[inputmode=numeric]').fill('6181112233')
    pg.get_by_role('button', name='Siguiente').click(); pg.wait_for_timeout(700)

def paso3(pg):
    pg.get_by_role('button', name='Más').click()                      # 2 parcelas en total
    pg.get_by_role('button', name='Sí').first.click()
    pg.get_by_role('checkbox', name='Fertilizantes para el Bienestar').click()
    pg.get_by_role('checkbox', name='Otro', exact=True).click()
    pg.locator('input').nth(0).fill('Programa estatal')               # cual otro programa
    pg.get_by_role('button', name='No cuenta con seguro').click()
    pg.get_by_role('button', name='Siguiente').click(); pg.wait_for_timeout(700)

def abrir_mapa_y_dibujar(pg, lat, lng, modo='clics'):
    pg.get_by_role('button', name=re.compile('Dibujar la parcela|Continuar el dibujo')).click(); pg.wait_for_timeout(1200)
    pg.get_by_placeholder('Buscar localidad o dirección…').fill(f'{lat:.5f}, {lng:.5f}'); pg.wait_for_timeout(500)
    pg.get_by_text('Coordenadas:').click(); pg.wait_for_timeout(2500)
    if modo == 'clics':
        box = pg.locator('.leaflet-container').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2 - 40
        for dx, dy in [(-55, -55), (55, -55), (55, 55), (-55, 55)]:
            pg.mouse.click(cx + dx, cy + dy); pg.wait_for_timeout(350)
    pg.wait_for_timeout(300)

def terminar_poligono(pg):
    pg.get_by_role('button', name='Cerrar polígono').click(); pg.wait_for_timeout(1200)
    if pg.get_by_text('Parcela dibujada').count() == 0: return False
    pg.get_by_role('button', name='Usar esta parcela').click(); pg.wait_for_timeout(900)
    return True

def paso4_nueva(pg, nombre='El Bajio', reintentos=5):
    pg.get_by_role('button', name=re.compile('Agregar la parcela|Es otra parcela')).first.click(); pg.wait_for_timeout(500)
    pg.locator('input').nth(0).fill(nombre)
    pg.locator('select').nth(0).select_option(label='Durango'); pg.wait_for_timeout(1200)
    pg.locator('select').nth(1).select_option(label='Durango')
    pg.locator('input').nth(1).fill('Ejido San Jose')                  # localidad (la 0 es nombre)
    pg.get_by_role('button', name='Certificado parcelario').click()
    pg.get_by_role('button', name='Temporal (lluvia)').click()
    for i in range(reintentos):
        lat, lng = 24.30 + random.uniform(0, 0.9), -105.60 + random.uniform(0, 0.9)
        abrir_mapa_y_dibujar(pg, lat, lng)
        if terminar_poligono(pg):
            return True
        # traslape con otra parcela: se vuelve a dibujar en otro lugar
        pg.get_by_role('button', name='Borrar todo').click(); pg.wait_for_timeout(400)
    return False

def paso5(pg):
    for etiqueta in (0, 1, 2):
        pg.get_by_role('button', name='No', exact=True).nth(etiqueta).click() if etiqueta < 2 else pg.get_by_role('button', name='Sí', exact=True).nth(2).click()
    pg.get_by_role('button', name='Siguiente').click(); pg.wait_for_timeout(700)

def paso6(pg, siembra='2026-07-10', cosecha='2026-10-25'):
    pg.get_by_role('button', name='Siguiente').click(); pg.wait_for_timeout(500)
    ok('paso 6: vacio muestra errores por campo', pg.get_by_text('Elige la fecha de siembra').count() == 1 and pg.get_by_text('Elige la variedad').count() >= 1)
    fechas = pg.locator('input[type=date]')
    fechas.nth(0).fill(siembra); pg.wait_for_timeout(400)
    ciclo_visible = pg.get_by_text('PV 2026').count() >= 1
    fechas.nth(1).fill(cosecha)
    pg.get_by_role('button', name=re.compile('Elige la variedad')).click(); pg.wait_for_timeout(400)
    pg.get_by_placeholder('Buscar…').fill('Saltillo'); pg.get_by_role('button', name='Pinto Saltillo').click(); pg.wait_for_timeout(300)
    campos = pg.locator('input[inputmode=decimal]')
    campos.nth(0).fill('1.5'); campos.nth(1).fill('0.9'); campos.nth(2).fill('45')
    pg.get_by_role('button', name='Sí').first.click()
    pg.get_by_role('checkbox', name='Orgánico').click()
    pg.get_by_role('button', name='Rota distintos cultivos').click()
    pg.locator('textarea').fill('Colinda con area de pastoreo')
    pg.get_by_role('button', name='Siguiente').click(); pg.wait_for_timeout(800)
    return ciclo_visible

