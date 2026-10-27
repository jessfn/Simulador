# -*- coding: utf-8 -*-
"""T04 · En pantalla: el administrador crea un técnico de frijol, el técnico entra, cambia su contraseña y llega a su tablero."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *
import re
from playwright.sync_api import sync_playwright, expect
(AQUI / '.tmp').mkdir(exist_ok=True)

suf = ''.join(random.choices(string.digits, k=4))
correo = f'ana.ui{suf}@ejemplo.test'
curp = 'LOAA900101MDGPNN' + '0' + str(random.randint(0, 9))
nueva = 'Nueva' + suf + 'Clave!'

with sync_playwright() as p:
    br = p.chromium.launch()
    # ---------- ADMIN ----------
    ctx = br.new_context(viewport={'width': 1366, 'height': 800}, service_workers='block')
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(WEB + '/maiz/admin/login'); pg.wait_for_timeout(1200)
    pg.fill('input[type=email]', EM('admin')); pg.fill('input[type=password]', ADM)
    pg.locator('form button[type=submit], button:has-text("Entrar"), button:has-text("Iniciar")').first.click()
    pg.wait_for_timeout(2500)
    ok('admin entra al panel', '/maiz/admin' in pg.url and 'login' not in pg.url, pg.url)
    pg.goto(WEB + '/maiz/admin/tecnicos'); pg.wait_for_timeout(2500)
    ok('lista de tecnicos con boton Nuevo tecnico', pg.get_by_role('button', name=re.compile('Nuevo técnico')).count() == 1)
    ok('la lista muestra columnas nuevas', pg.get_by_text('Programas').count() >= 1 and pg.get_by_text('Zona').count() >= 1)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_lista.png'))
    # filtros
    pg.select_option('select[aria-etiqueta="Filtrar por programa"]', 'frijol_afb'); pg.wait_for_timeout(1200)
    filas = pg.locator('tbody tr').count()
    ok('filtro por programa Frijol reduce la lista', 0 < filas < 20, f'{filas} filas')
    pg.select_option('select[aria-etiqueta="Filtrar por programa"]', ''); pg.wait_for_timeout(800)

    pg.get_by_role('button', name=re.compile('Nuevo técnico')).click(); pg.wait_for_timeout(1200)
    ok('abre el formulario de alta', pg.get_by_text('Nuevo técnico').count() >= 1 and pg.get_by_role('button', name='Crear técnico').count() == 1)
    # intento vacio -> errores
    pg.get_by_role('button', name='Crear técnico').click(); pg.wait_for_timeout(500)
    ok('formulario vacio muestra errores por campo', pg.get_by_text('Escribe el nombre completo').count() == 1 and pg.get_by_text('Elige al menos un programa').count() == 1)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_form_errores.png'))
    # llenar
    d = pg.locator('div.fixed.inset-0').last
    d.locator('input').nth(0).fill('Ana Lopez Prueba')
    d.locator('input').nth(1).fill(curp)
    d.locator('input').nth(2).fill(correo)
    d.locator('input').nth(3).fill('6181112233')
    d.locator('select').first.select_option('eca_agroecologico')
    d.get_by_role('button', name='Frijol').click()
    d.locator('select').nth(1).select_option(label='Durango'); pg.wait_for_timeout(500)
    d.get_by_text('Agregar otro estado').click(); pg.wait_for_timeout(300)
    d.locator('select').nth(2).select_option(label='Zacatecas'); pg.wait_for_timeout(800)
    d.get_by_label('Todo el estado').nth(1).uncheck(); pg.wait_for_timeout(500)
    d.get_by_placeholder('Buscar municipio').fill('Fresnillo'); pg.wait_for_timeout(300)
    d.get_by_text('Fresnillo', exact=True).click(); pg.wait_for_timeout(300)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_form_lleno.png'))
    d.get_by_role('button', name='Crear técnico').click(); pg.wait_for_timeout(3000)
    ok('aparece la contrasena temporal', pg.get_by_text('Contraseña temporal').count() >= 1 and pg.get_by_text('solo se muestra una vez').count() == 1)
    password = pg.locator('p.font-mono').first.inner_text().strip()
    ok('contrasena de 12 caracteres', len(password) == 12, password and '(oculta)')
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_password.png'))
    pg.get_by_role('button', name='Listo').click(); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder^="Buscar por nombre"]', 'Ana Lopez Prueba'); pg.wait_for_timeout(1200)
    ok('el tecnico nuevo aparece en la lista con tipo, programa y zona',
       pg.get_by_text('ECA Agroecológico').count() >= 1 and pg.get_by_text('Frijol').count() >= 1 and pg.get_by_text('Fresnillo').count() >= 1)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_lista_nuevo.png'))
    ok('admin sin errores JS', not errs, str(errs))
    ctx.close()

    # ---------- TECNICO (celular) ----------
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(WEB + '/'); pg.wait_for_timeout(1800)
    pg.click('button[aria-label="Entrar a Frijol"]'); pg.wait_for_timeout(1500)
    pg.get_by_text('Soy Técnico ECA').click(); pg.wait_for_timeout(1200)
    pg.fill('input[type=email]', correo); pg.fill('input[type=password]', password)
    pg.get_by_role('button', name='Entrar').click(); pg.wait_for_timeout(3000)
    ok('con contrasena temporal lo manda a cambiarla', pg.url.endswith('/frijol/tecnico/perfil'), pg.url)
    ok('muestra el aviso de cambio obligatorio', pg.get_by_text('Cambia tu contraseña para continuar').count() == 1)
    pg.goto(WEB + '/frijol/tecnico'); pg.wait_for_timeout(1200)
    ok('no puede saltarse el cambio de contrasena', pg.url.endswith('/frijol/tecnico/perfil'), pg.url)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_cambio_pass.png'))
    pg.fill('input[placeholder="Contraseña actual"]', password)
    pg.fill('input[placeholder^="Nueva contraseña"]', nueva)
    pg.fill('input[placeholder="Confirmar nueva contraseña"]', nueva)
    pg.get_by_role('button', name='Actualizar contraseña').click(); pg.wait_for_timeout(2500)
    ok('contrasena actualizada', pg.get_by_text('Contraseña actualizada correctamente').count() == 1 or not pg.get_by_text('Cambia tu contraseña para continuar').count())
    pg.goto(WEB + '/frijol/tecnico'); pg.wait_for_timeout(1500)
    ok('ya llega al tablero de frijol', pg.url.endswith('/frijol/tecnico') and pg.get_by_text('Hola, Ana').count() >= 1, pg.url)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_tablero.png'))
    pg.goto(WEB + '/frijol/tecnico/perfil'); pg.wait_for_timeout(1500)
    ok('su perfil muestra tipo, programa y zona', pg.get_by_text('ECA Agroecológico').count() >= 1 and pg.get_by_text('Durango (todo el estado)').count() == 1 and pg.get_by_text('Fresnillo').count() >= 1)
    pg.screenshot(path=str(AQUI / '.tmp' / 't4_perfil.png'))
    pg.goto(WEB + '/maiz/tecnico'); pg.wait_for_timeout(1200)
    ok('no entra a las pantallas de tecnico de maiz', '/frijol/tecnico' in pg.url, pg.url)
    pg.goto(WEB + '/frijol/tecnico/perfil'); pg.wait_for_timeout(1000)
    pg.get_by_text('Cerrar sesión').click(); pg.wait_for_timeout(1200)
    ok('cerrar sesion vuelve al login de frijol', pg.url.endswith('/frijol/tecnico/login'), pg.url)
    ok('tecnico sin errores JS', not errs, str(errs))
    ctx.close(); br.close()
print('\nRESUMEN FLUJO T04:', sum(res), '/', len(res))
