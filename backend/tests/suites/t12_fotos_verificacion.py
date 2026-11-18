# -*- coding: utf-8 -*-
"""Fotos de verificación del aviso de privacidad: se suben sin sesión y solo las ve el panel con el permiso de avisos."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from lib import *

JPEG_MINIMO = bytes.fromhex('ffd8ffe000104a46494600010100000100010000ffd9')
SERVIDOR = B.rsplit('/api', 1)[0]

def subir_foto(contenido, tipo='image/jpeg'):
    limite = 'qa' + KEY()
    cuerpo = (f'--{limite}\r\nContent-Disposition: form-data; name="foto"; filename="foto.jpg"\r\nContent-Type: {tipo}\r\n\r\n').encode() \
        + contenido + f'\r\n--{limite}--\r\n'.encode()
    req = urllib.request.Request(B + '/productor/auth/upload-verificacion', data=cuerpo, method='POST',
                                 headers={'Content-Type': f'multipart/form-data; boundary={limite}'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'null')

def codigo_fuera_del_api(ruta):
    try:
        with urllib.request.urlopen(SERVIDOR + ruta, timeout=30) as r: return r.status
    except urllib.error.HTTPError as e: return e.code

def registrar_bodeguero_con_foto(ruta_foto):
    correo = f'qa.foto.{KEY()}@{DOMINIO}'
    http('/auth/registro', method='POST', body={'email': correo, 'nombre_completo': 'QA Foto Verificacion', 'password': 'Qa-foto-123',
        'telefono': '6187654321', 'rol': 'bodeguero', 'aviso_privacidad_aceptado': True, 'aviso_privacidad_foto_url': ruta_foto})
    return val(f"select coalesce(aviso_privacidad_foto_url, 'SIN_FOTO') from usuarios where correo_electronico = '{correo}'")

adm = login_admin(); sin_permisos = login_admin(EM('sinpermisos'))

print('--- subida sin sesión')
st, d = subir_foto(JPEG_MINIMO)
ruta = (d or {}).get('path', '')
archivo = ruta.split('/')[-1]
ok('subir la foto sin sesión -> 200 con nombre aleatorio', st == 200 and bool(re.fullmatch(r'verificacion/vrf_[0-9a-f-]{36}\.jpg', ruta)), ruta)
ok('un archivo que no es imagen -> 400', subir_foto(b'no soy imagen', 'text/plain')[0] == 400)

print('--- acceso a la foto')
ok('ya no se sirve en /uploads', codigo_fuera_del_api('/uploads/' + ruta) == 404)
ok('tampoco con la ruta codificada', codigo_fuera_del_api('/uploads/%76erificacion/' + archivo) == 404)
ok('sin sesión -> 401', http('/fotos-verificacion/' + archivo)[0] == 401)
ok('panel sin el permiso de avisos -> 403', http('/fotos-verificacion/' + archivo, sin_permisos)[0] == 403)
st, foto = http('/fotos-verificacion/' + archivo, adm, raw=True)
ok('el panel con permiso la descarga igual a la subida', st == 200 and foto == JPEG_MINIMO, st)
ok('un nombre fuera del formato no sale de la carpeta -> 404', http('/fotos-verificacion/..%2F..%2F.env', adm)[0] == 404)

print('--- ruta guardada en el registro')
ok('el registro guarda la ruta de una foto válida', registrar_bodeguero_con_foto(ruta) == ruta)
ok('el registro descarta una ruta inventada', registrar_bodeguero_con_foto('../../.env') == 'SIN_FOTO')

resumen('FOTOS')
