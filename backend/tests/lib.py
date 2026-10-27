# -*- coding: utf-8 -*-
"""Utilidades comunes de las pruebas: peticiones al API, consultas a la base de PRUEBAS, datos ficticios y resumen.

Todo sale de variables de entorno (ver tests/.env.example). Nada de direcciones, contraseñas ni datos reales aquí.
"""
import os, sys, json, math, random, string, subprocess, shlex, re, copy, threading, pathlib
import urllib.request, urllib.error

AQUI = pathlib.Path(__file__).resolve().parent
BACKEND = AQUI.parent
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ---------- configuración (tests/.env + variables del sistema) ----------
def _cargar_env():
    f = AQUI / '.env'
    if f.exists():
        for linea in f.read_text(encoding='utf-8-sig').splitlines():
            m = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$', linea)
            if m and not linea.strip().startswith('#') and m.group(1) not in os.environ:
                os.environ[m.group(1)] = m.group(2).strip('"\'')
_cargar_env()

# La misma protección que usa run.js: si el entorno parece producción, no se ejecuta nada.
_g = subprocess.run(['node', str(AQUI / 'guardia.js')], capture_output=True, text=True, encoding='utf-8', errors='replace')
if _g.returncode != 0:
    print(_g.stderr or _g.stdout); sys.exit(2)

B = os.environ['TEST_API_URL'].rstrip('/')
PASS = os.environ['TEST_PASSWORD']
ADM = os.environ.get('TEST_ADMIN_PASSWORD') or PASS
BACKEND_DIR = os.environ.get('TEST_BACKEND_DIR', str(BACKEND))   # ruta del backend en la máquina donde corre el servidor de pruebas
REMOTE_SHELL = os.environ.get('TEST_REMOTE_SHELL', '')           # p. ej. "ssh usuario@servidor"; vacío = el servidor está en esta misma máquina
WEB = (os.environ.get('TEST_WEB_URL') or B.rsplit('/api', 1)[0]).rstrip('/')   # dirección de la web (pruebas en pantalla)
DOMINIO = 'ejemplo.test'
res = []

def EM(quien):
    """Correo ficticio de un usuario de prueba: EM('frijol1') -> qa.frijol1@ejemplo.test"""
    return f'qa.{quien}@{DOMINIO}'

# ---------- estado compartido entre archivos de prueba (se borra al empezar run.js) ----------
_EST = AQUI / '.tmp' / 'estado.json'
def estado_get(clave, defecto=None):
    try: return json.loads(_EST.read_text(encoding='utf-8')).get(clave, defecto)
    except Exception: return defecto
def estado_set(clave, valor):
    _EST.parent.mkdir(exist_ok=True)
    d = {}
    try: d = json.loads(_EST.read_text(encoding='utf-8'))
    except Exception: pass
    d[clave] = valor
    _EST.write_text(json.dumps(d), encoding='utf-8')

# ---------- API ----------
_RUTAS_CON_LIMITE = ('/tecnico/auth/login', '/auth/login', '/auth/registro', '/productor/auth/')

def http(path, token=None, method='GET', body=None, headers=None, raw=False, timeout=120, base=None, _intento=0):
    # El sistema limita las peticiones: 20 intentos de acceso cada 5 minutos y 300 peticiones por minuto en total, por máquina.
    # Si se topa con esos límites generales, se espera y se reintenta (el límite propio de una función, como el de consultar-curp, NO se reintenta).
    st, datos = _http(path, token, method, body, headers, raw, timeout, base)
    es_limite_general = st == 429 and (path.startswith(_RUTAS_CON_LIMITE) or 'Demasiadas solicitudes' in json.dumps(datos, ensure_ascii=False))
    if es_limite_general and _intento < 12:
        print('   (límite general de peticiones alcanzado; espero 15 s y reintento)'); sys.stdout.flush()
        import time; time.sleep(15)
        return http(path, token, method, body, headers, raw, timeout, base, _intento + 1)
    return st, datos

def _http(path, token, method, body, headers, raw, timeout, base=None):
    req = urllib.request.Request((base or B) + path, method=method)
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    if body is not None:
        req.add_header('Content-Type', 'application/json'); req.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            datos = r.read()
            return r.status, (datos if raw else json.loads(datos.decode() or 'null'))
    except urllib.error.HTTPError as e:
        datos = e.read()
        if raw: return e.code, datos
        try: return e.code, json.loads(datos.decode())
        except Exception: return e.code, None
    except Exception as e:
        return 0, {'error': f'sin respuesta del servidor: {e}'}

def login_full(email, clave=None):
    """Inicia sesión de técnico. Reutiliza la sesión si ya se abrió en esta corrida (para no gastar el límite de intentos)."""
    guardadas = estado_get('sesiones', {})
    if clave is None and email in guardadas:
        return guardadas[email]['t'], guardadas[email]['u']
    st, d = http('/tecnico/auth/login', method='POST', body={'email': email, 'password': clave or PASS})
    d = d or {}
    if clave is None and d.get('token'):
        guardadas[email] = {'t': d['token'], 'u': d.get('usuario', {})}; estado_set('sesiones', guardadas)
    return d.get('token'), d.get('usuario', {})

def login(email, clave=None):
    return login_full(email, clave)[0]

def login_admin(email=None, clave=None):
    """Inicia sesión por la entrada general (/auth/login). Sin correo, entra el administrador ficticio."""
    guardadas = estado_get('sesiones_generales', {})
    llave = email or EM('admin')
    if clave is None and llave in guardadas: return guardadas[llave]
    st, d = http('/auth/login', method='POST', body={'email': llave, 'password': clave or (ADM if not email or email == EM('admin') else PASS)})
    tok = (d or {}).get('token')
    if clave is None and tok:
        guardadas[llave] = tok; estado_set('sesiones_generales', guardadas)
    return tok

# ---------- base de datos de PRUEBAS ----------
def sql(q):
    r = subprocess.run(['node', str(AQUI / 'sql.js'), q], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0: print('   (SQL con error)', (r.stderr or '').strip()[:160])
    return r.stdout

def val(q):
    lineas = [l.strip() for l in sql(q).split('\n') if l.strip()]
    return lineas[2] if len(lineas) > 2 else ''

def primera_fila(q):
    """Primer renglón de una consulta, como lista de textos (una por columna)."""
    lineas = [l for l in sql(q).splitlines() if l.strip()]
    return [c.strip() for c in lineas[2].split(' | ')] if len(lineas) > 2 else []

# ---------- comandos en la máquina del servidor (jobs, bandera de "servicios caídos") ----------
def remoto(cmd):
    if REMOTE_SHELL:
        args = shlex.split(REMOTE_SHELL) + [cmd]
        r = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    else:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout

def identidad_caida(activa):
    """Simula que RENAPO y SADER no responden (solo funciona con IDENTIDAD_SIMULADA=true en el servidor de pruebas)."""
    remoto('touch /tmp/identidad_caida' if activa else 'rm -f /tmp/identidad_caida')

def correr_job_verificacion():
    return remoto(f'cd {BACKEND_DIR} && node dist/jobs/frijolVerificacion.js 2>&1 | tail -1')

# ---------- resultados ----------
def ok(nombre, cond, extra=''):
    res.append(bool(cond)); print(('OK    ' if cond else 'FALLA ') + nombre, extra)

def resumen(nombre):
    print(f'\nRESUMEN {nombre}:', sum(res), '/', len(res))

# ---------- datos ficticios ----------
KEY = lambda: 'k-' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))

def curp_nueva(consonantes, sexo='H'):
    """CURP inventada con formato válido. Las 3 letras del medio activan el simulador de identidad (REN, SAD, FAL, INV, CAI, CAD)."""
    pref = 'Z' + ''.join(random.choices(string.ascii_uppercase, k=3))
    fecha = f"{random.randint(65, 99)}{random.randint(1, 12):02d}{random.randint(1, 28):02d}"
    return f"{pref}{fecha}{sexo}DG{consonantes}{random.choice(string.ascii_uppercase)}{random.randint(0, 9)}"

_REG = {}
def regiones():
    if not _REG:
        _REG.update({'10': (24.2, -104.6, '10005'), '32': (22.7, -102.6, '32010'), '18': (21.8, -104.8, None), '25': (24.9, -107.3, None)})
        for sid in ('18', '25'):
            _REG[sid] = (_REG[sid][0], _REG[sid][1], val(f"select municipio_id from geo_municipio where estado_id='{sid}' limit 1"))
    return _REG

def poligono(lat0, lng0, area_ha):
    lado = math.sqrt(area_ha * 10000)
    dlat = lado / 111320.0; dlng = lado / (111320.0 * math.cos(math.radians(lat0)))
    return [[lat0, lng0], [lat0, lng0 + dlng], [lat0 + dlat, lng0 + dlng], [lat0 + dlat, lng0]]

def shift_poligono(poli, frac):
    lngs = [p[1] for p in poli]; ancho = max(lngs) - min(lngs)
    return [[p[0], p[1] + ancho * frac] for p in poli]

def cuerpo(curp, estado='10', area=3.0, siembra='2026-07-10', cosecha='2026-10-25', token=None, numero=1, total=1, **extra):
    lat, lng, muni = regiones()[estado]
    lat += random.uniform(0, 0.8); lng += random.uniform(0, 0.8)
    b = {
        'productor': {'producer_id': None, 'curp': curp, 'nombres': 'Frijolero', 'apellido_paterno': 'De Prueba', 'apellido_materno': 'Uno',
                      'sexo': 'H', 'fecha_nacimiento': '1980-05-10', 'telefono': '6181234567', 'correo': None, 'verificacion_token': token},
        'frijol_productor': {'total_ups_declaradas': total, 'participa_programas_sader': True, 'programas_sader': ['fertilizantes_bienestar', 'otro_sader'],
                             'programas_sader_otro': 'Programa estatal', 'organizacion': 'SPR Los Llanos', 'seguro_agricola': 'cadena', 'seguro_agricola_nombre': None},
        'parcela': {'up_id': None, 'nombre': 'El Bajio', 'numero_up': numero, 'state_id': estado, 'municipality_id': muni, 'localidad': 'Ejido San Jose',
                    'documento_propiedad': 'certificado_parcelario', 'documento_propiedad_otro': None, 'water_regime': 'temporal',
                    'poligono': poligono(lat, lng, area), 'area_real_ha': None},
        'semillas': {'se_dedica_produccion_semillas': False, 'trabajo_con_prosebien': False, 'usara_prosebien_pv': True},
        'cultivo': {'fecha_siembra': siembra, 'tipo_riego': 'temporal', 'cycle_type': None, 'fecha_cosecha_estimada': cosecha, 'variety_id': 'PINTO_SALTILLO',
                    'variety_other': None, 'area_sown_ha': round(min(2.5, area), 2), 'rendimiento_esperado_t_ha': 0.9, 'destino': 'acopio_axb', 'tipo_siembra': 'monocultivo',
                    'densidad_kg_ha': 45, 'usa_fertilizante': True, 'tipos_fertilizante': ['organico'], 'rotacion': 'rota', 'observaciones': 'Colinda con area de pastoreo',
                    'sin_observaciones': False},
        'trazabilidad': {'capturado_en': None, 'hubo_desconexion': True},
    }
    for k, v in extra.items():
        sec, campo = k.split('__')
        b[sec][campo] = v
    return b

def registrar(token, b, key=None):
    return http('/frijol/registros', token, 'POST', b, {'Idempotency-Key': key or KEY()})

def consultar(token, curp):
    return http('/frijol/consultar-curp', token, 'POST', {'curp': curp})

def sql_revertido(instrucciones):
    """Ejecuta una lista de instrucciones SQL en una transacción que SIEMPRE se revierte; devuelve lo que imprime la última (formato como sql())."""
    r = subprocess.run(['node', str(AQUI / 'sql-rollback.js'), json.dumps(instrucciones)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.stdout

def compilar_backend():
    """Compila el backend (npx tsc) para las pruebas que usan código ya compilado. Se hace una sola vez por corrida."""
    if estado_get('compilado'): return
    subprocess.run('npx tsc', cwd=str(BACKEND), shell=True, capture_output=True)
    estado_set('compilado', True)

def backend_aparte(env_extra=None, puerto=3999):
    """Levanta un backend NUEVO (otro proceso, otro puerto) contra la base de pruebas, con su propia memoria de límites.
    Sirve para probar límites de uso sin gastar los del servidor de pruebas. Devuelve (proceso, dirección base del API)."""
    import time, urllib.parse
    compilar_backend()
    u = urllib.parse.urlparse(os.environ['TEST_DATABASE_URL'])
    env = {**os.environ, 'PORT': str(puerto), 'DB_HOST': u.hostname, 'DB_PORT': str(u.port or 5432), 'DB_USER': urllib.parse.unquote(u.username or ''),
           'DB_PASSWORD': urllib.parse.unquote(u.password or ''), 'DB_NAME': u.path.lstrip('/'), 'JWT_SECRET': 'secreto-solo-para-pruebas-' + str(puerto),
           'JOBS_ENABLED': 'false', 'IDENTIDAD_SIMULADA': 'true', 'NODE_ENV': 'test', **(env_extra or {})}
    proc = subprocess.Popen(['node', 'dist/index.js'], cwd=str(BACKEND), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f'http://127.0.0.1:{puerto}/api'
    for _ in range(60):
        time.sleep(0.5)
        if proc.poll() is not None: break
        if _http('/health', None, 'GET', None, None, False, 5, base)[0] == 200: return proc, base
    proc.terminate(); raise RuntimeError('No pude levantar un backend aparte para la prueba (¿está compilado y libre el puerto %s?)' % puerto)
