# SIMAC

Sistema de Información de Mercados Agrícolas y Consulta: módulo de maíz (bodegas, productores, técnicos y administración) y módulo de frijol (registro de productores por técnicos, con captura sin conexión).

## Estructura del repositorio

- `frontend/` — React + Vite + TypeScript + Tailwind (PWA)
- `backend/` — Node.js + Express + PostgreSQL/PostGIS
- `backend/db/migrations/` — migraciones de la base de datos (estructura y catálogos)
- `backend/tests/` — pruebas automatizadas (ver `backend/tests/README.md`)
- `icons/` — recursos gráficos del proyecto
- `nginx-bodegas.conf` — configuración de referencia de Nginx

---

# Instalación del entorno de desarrollo

Pasos para levantar SIMAC en local:

1. Requisitos generales (se instalan una sola vez).
2. Base de datos.
3. Backend.
4. Frontend.

Al terminar tendrás tres cosas corriendo:

- **Base de datos:** PostgreSQL 14 + PostGIS dentro de un contenedor **Docker**, en el puerto `5432`.
- **Backend:** API en Node.js, en http://localhost:3000/api.
- **Frontend:** aplicación web, en http://localhost:5174.

> Todos los comandos se escriben en **Git Bash**.

---

## 1. Requisitos generales

Instalar antes de empezar:

- **Git** (incluye Git Bash): https://git-scm.com/download/win
- **Node.js 20 o superior** (incluye npm): https://nodejs.org (versión LTS). Probado con Node 24 y npm 11.
- **Docker Desktop:** https://www.docker.com/products/docker-desktop

No hace falta instalar PostgreSQL ni PostGIS: corren dentro de Docker (PostgreSQL 14 + PostGIS 3.4).

### Verificar que están instalados

```bash
git --version
node -v
npm -v
docker --version
```

### Verificar que Docker está encendido

Abrir Docker Desktop y esperar a que diga "Engine running". Luego:

```bash
docker info
```

### Verificar que los puertos están libres

El proyecto usa los puertos `5432` (base de datos), `3000` (backend) y `5174` (frontend). En **PowerShell**:

```powershell
Get-NetTCPConnection -LocalPort 5432,3000,5174 -State Listen -ErrorAction SilentlyContinue
```

Si no muestra nada, están libres. Si aparece el `5432`, probablemente ya tienes un PostgreSQL instalado: detenlo antes de seguir.

### Obtener el código

```bash
git clone <url-del-repositorio> simac
cd simac
```

---

## 2. Base de datos

Todos estos comandos se ejecutan desde la **raíz del repositorio** (`simac/`).

### 2.1 Levantar el contenedor

```bash
docker compose up -d
```

La primera vez descarga la imagen `postgis/postgis:14-3.4`. Crea un contenedor llamado `simac-db` con estos datos de acceso:

- Usuario: `simac_dev`
- Contraseña: `simac_dev`
- Base: `bodegas`
- Puerto: `5432`

Son datos solo para la base local; no se usan en ningún servidor.

Verificar:

```bash
docker compose ps
```

La columna `STATUS` debe decir `Up ... (healthy)`. Si dice `starting`, esperar unos segundos y repetir.

La base `bodegas` queda vacía. Las tablas se crean en el paso 3.3, una vez configurado el backend.

---

## 3. Backend

Todos estos comandos se ejecutan dentro de la carpeta **`backend/`**:

```bash
cd backend
```

### 3.1 Crear el archivo de configuración .env

```bash
cp .env.example .env
```

`.env.example` ya trae los valores para desarrollo local. Solo hay que cambiar `JWT_SECRET`. Generar una clave secreta para las sesiones:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Abrir `backend/.env` con un editor y pegar la clave generada en `JWT_SECRET`. El resto de las variables se deja como viene.

> Para probar el registro de frijol sin acceso a los servicios de SADER y RENAPO, poner `IDENTIDAD_SIMULADA=true` (ver [Variables de configuración](#variables-de-configuración)).

El propósito de cada variable está en la sección [Variables de configuración](#variables-de-configuración), al final de esta guía.

### 3.2 Instalar dependencias

```bash
npm install
```

Puede mostrar avisos `npm warn deprecated` y `allow-scripts ... bcrypt`; son normales y no impiden continuar.

### 3.3 Crear las tablas

```bash
npm run migrate:up
```

Aplica en orden las migraciones de `backend/db/migrations/`: la estructura de la base, las extensiones de PostGIS y los catálogos (estados con sus contornos, municipios, localidades del INEGI, variedades y demás listas de la aplicación). Muestra el SQL de cada migración, tarda uno o dos minutos por el catálogo de localidades y debe terminar con:

```
Migrations complete!
```

Verificar que no quedan migraciones pendientes:

```bash
npm run migrate:status
```

Debe responder `No migrations to run!`.

### 3.4 Crear los usuarios de prueba

```bash
node scripts/crear-usuarios-desarrollo.js
```

Crea usuarios de prueba para cada rol. Solo corre contra la base local (`DB_HOST=localhost`, `DB_NAME=bodegas`).

**Panel, bodega y técnicos** (inician sesión con correo y contraseña):

- Administrador: `admin@simac.local`
- Bodeguero: `bodeguero@simac.local`
- Técnico de maíz (capturista): `capturista@simac.local`
- Técnico de frijol: `tecnico.frijol@simac.local`

**Productores** (inician sesión con CURP y NIP de 4 dígitos):

- Productor nuevo: `PRUE800101MJCRRS02`. Sin parcela ni ciclo: al entrar, la app le pide registrar su parcela y su ciclo. Sirve para probar esos flujos.
- Productor completo: `PRUE800101HJCRRS01`. Con una parcela en Tepatitlán, Jalisco, y un ciclo de maíz: entra directo a su panel.

La contraseña y el NIP salen de `backend/.env`:

- **`DEV_USUARIOS_PASSWORD`:** contraseña de los usuarios de panel, bodega y técnicos (mínimo 8 caracteres).
- **`DEV_PRODUCTOR_NIP`:** NIP de los dos productores (4 dígitos).

Si los dejas vacíos, el script genera unos al azar y los muestra al terminar. **Anótalos**: cambian cada vez que corres el script.

```
  Contraseña (generada al azar, anótala): <contraseña generada>
  NIP (generado al azar, anótalo): <NIP generado>
```

Si no quieres que sean aleatorios, escríbelos en `.env` y vuelve a correr el script:

```ini
DEV_USUARIOS_PASSWORD=<contraseña de mínimo 8 caracteres>
DEV_PRODUCTOR_NIP=<4 dígitos>
```

> Cambiar estas variables en `.env` **no cambia** la contraseña ni el NIP por sí solo: se guardan en la base de datos y solo se actualizan al correr el script. Cada vez que los cambies, vuelve a correr `node scripts/crear-usuarios-desarrollo.js`.

Si los olvidas, vuelve a correr el script: restablece la contraseña y el NIP de todos los usuarios de prueba y desbloquea las cuentas. No duplica usuarios, parcelas ni ciclos.

Rutas de inicio de sesión (con el frontend corriendo):

- Administrador: http://localhost:5174/maiz/admin/login
- Bodeguero: http://localhost:5174/maiz/bodega/login
- Técnico de maíz: http://localhost:5174/maiz/tecnico/login
- Técnico de frijol: http://localhost:5174/frijol/tecnico/login
- Productor: http://localhost:5174/maiz/productor/login

### 3.5 Arrancar el backend

```bash
npm run dev
```

Debe mostrar:

```
Servidor corriendo en http://localhost:3000
API disponible en http://localhost:3000/api
[PostGIS] Extensión detectada y operativa. Validación de traslapes ACTIVA.
```

Esta terminal se mantiene abierta. El servidor se reinicia solo cada vez que guardas un archivo.

### Otros comandos del backend

```bash
npx tsc --noEmit     # revisar errores de tipos (npm run dev no los revisa)
npm run build        # compilar a la carpeta dist/
npm start            # correr la versión compilada
npm test             # pruebas automatizadas (configuración en backend/tests/README.md)
```

Migraciones de la base de datos:

```bash
npm run migrate:status              # muestra las migraciones pendientes, sin aplicarlas
npm run migrate:up                  # aplica las migraciones pendientes
npm run migrate:down                # revierte la última migración aplicada
npm run migrate:create <nombre>     # crea una migración nueva en backend/db/migrations/
```

---

## 4. Frontend

Abrir una **nueva terminal** (el backend sigue corriendo en la otra) y entrar a la carpeta **`frontend/`**:

```bash
cd frontend
```

### 4.1 Instalar dependencias

```bash
npm install --legacy-peer-deps
```

> La opción `--legacy-peer-deps` es **obligatoria**. Sin ella npm falla con el error `ERESOLVE`, porque algunas librerías de mapas no declaran compatibilidad con React 19.

Puede mostrar el aviso `allow-scripts ... esbuild`; es normal.

### 4.2 Configuración

No hace falta crear nada: `frontend/.env.development` ya apunta al backend local (`http://localhost:3000/api`).

> No edites `.env.development`. Si necesitas apuntar a otro backend, crea `frontend/.env.development.local` con la variable `VITE_API_URL`.

### 4.3 Arrancar el frontend

```bash
npm run dev
```

Debe mostrar algo como:

```
VITE v6.x  ready in ... ms
  Local:   http://localhost:5174/
```

Esta terminal se mantiene abierta. La página se actualiza sola al guardar cambios.

### Otros comandos del frontend

```bash
npx tsc -b           # revisar errores de tipos
npm run lint         # revisar estilo de código
npm run build        # generar la versión de producción en dist/
npm run preview      # servir localmente la versión generada por build
```

---

## Uso diario

Con todo ya instalado, para trabajar cada día:

**Terminal 1 — base de datos** (raíz del repositorio):

```bash
docker compose up -d
```

**Terminal 2 — backend:**

```bash
cd backend
npm run migrate:up
npm run dev
```

`npm run migrate:up` aplica las migraciones nuevas que haya traído la última actualización del repositorio (`git pull`). Si no hay pendientes, solo responde `No migrations to run!`.

**Terminal 3 — frontend:**

```bash
cd frontend
npm run dev
```

Para apagar todo: `Ctrl+C` en las terminales del backend y del frontend, y luego en la raíz del repositorio:

```bash
docker compose stop
```

---

## Comandos útiles de la base de datos

Desde la raíz del repositorio.

Abrir una consola SQL:

```bash
docker exec -it simac-db psql -U simac_dev -d bodegas
```

Ver los logs de la base:

```bash
docker compose logs -f db
```

Volver a una base limpia (**borra todos los datos locales**): elimina el contenedor y su volumen, lo crea de nuevo, crea las tablas y los usuarios de prueba.

```bash
docker compose down -v
docker compose up -d
cd backend
npm run migrate:up
node scripts/crear-usuarios-desarrollo.js
```

Antes de `npm run migrate:up`, esperar a que `docker compose ps` muestre `(healthy)`.

Para conectarse con un cliente gráfico (DBeaver, pgAdmin): host `localhost`, puerto `5432`, usuario `simac_dev`, contraseña `simac_dev`, base `bodegas`.

---

## Si algo falla

**`docker compose up` muestra "error during connect"**
Docker Desktop no está abierto. Abrirlo, esperar a "Engine running" y repetir.

**"port is already allocated" al levantar la base**
Otro programa usa el puerto 5432 (normalmente un PostgreSQL instalado). Detenerlo y repetir.

**El backend se cierra con "Error inesperado en el pool de PostgreSQL"**
El contenedor está apagado o el `.env` tiene datos incorrectos. Revisar con `docker compose ps` y comparar `backend/.env` con el paso 3.1.

**Error `relation "..." does not exist`**
Faltan tablas o migraciones. Desde `backend/`, correr `npm run migrate:up` (paso 3.3).

**`npm run migrate:up` responde "Faltan DB_USER / DB_NAME en backend/.env"**
No existe `backend/.env`. Crearlo como indica el paso 3.1.

**`npm run migrate:up` falla con `schema "topology" already exists`**
El contenedor se creó con una versión anterior de `docker-compose.yml`. Volver a una base limpia (ver "Comandos útiles de la base de datos").

**`npm run migrate:up` falla con `Not run migration ... is preceding already run migration ...`**
La base tiene aplicada una migración con un número que después cambió. Lo más simple en local es volver a una base limpia (ver "Comandos útiles de la base de datos").

**El login responde "Credenciales incorrectas" o "CURP o NIP incorrectos"**
Los usuarios no existen (por ejemplo, tras recrear la base), o la contraseña o el NIP cambiaron porque el script generó unos nuevos. Repetir el paso 3.4 y usar los que muestre.

**El login responde "Demasiados intentos fallidos"**
Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. Para no esperar, desde `backend/` vuelve a correr el script de usuarios, que aplica la contraseña y el NIP de `.env` y desbloquea las cuentas:

```bash
node scripts/crear-usuarios-desarrollo.js
```

**La CURP no se puede verificar al registrar un productor**
Sin VPN ni llaves de SADER y RENAPO la consulta real falla. En maíz no hay alternativa local (usar los productores de prueba del paso 3.4). En frijol, poner `IDENTIDAD_SIMULADA=true` en `backend/.env` y reiniciar el backend.

**El frontend muestra "Sin conexión"**
El backend no está corriendo. Revisar la terminal del backend.

**`npm install` del frontend falla con `ERESOLVE`**
Faltó la opción: `npm install --legacy-peer-deps`.

---

## Variables de configuración

Variables de `backend/.env`, su propósito y qué pasa si quedan vacías:

- **`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`:** conexión a la base de datos. Ya traen los datos del contenedor del paso 2.1. Obligatorias: sin ellas el backend no arranca y no se pueden crear las tablas.
- **`JWT_SECRET`:** firma los tokens de sesión (duran 8 horas). Obligatoria: sin ella el inicio de sesión responde con error.
- **`PORT`:** puerto del backend. Si queda vacía usa 3000.
- **`NODE_ENV`:** con `production`, los archivos subidos se guardan en `/var/www/Simulador/uploads`; con cualquier otro valor, en `uploads/` en la raíz del repositorio.
- **`APP_URL`:** dirección que va en las ligas de los correos de recuperación. Si queda vacía usa el dominio de producción.
- **`SADER_API_URL`, `SADER_API_KEY`:** consulta de personas en el padrón de SADER (SURI). Si quedan vacías, la consulta no responde.
- **`RENAPO_API_URL`, `RENAPO_API_KEY`, `RENAPO_SESSION`:** verificación de CURP. Sin llave, y sin VPN, la consulta falla, y el registro de productores de maíz (por la app y por el técnico) queda bloqueado. Los productores de prueba del paso 3.4 no dependen de este servicio.
- **`BANXICO_TOKEN`:** tipo de cambio oficial para el cálculo de precios (proceso diario de las 14:00). Si queda vacía usa Yahoo Finance.
- **`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`:** envío de correos. Si quedan vacías no se envían correos. `SMTP_PORT` usa 587 por defecto y `SMTP_FROM_NAME`, el nombre "Maíz".
- **`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`:** notificaciones push. Si quedan vacías no se envían notificaciones push. Las llaves se generan con `npx web-push generate-vapid-keys`.
- **`GROQ_API_KEY`, `CHAT_BOT_ENABLED`:** bot del chat de ayuda. Sin llave, o con `CHAT_BOT_ENABLED=false`, el bot queda apagado.
- **`ADMIN_REGISTRO_CODIGO`:** código para dar de alta administradores desde la app. Si queda vacía ese registro responde con error; en local se usan los usuarios del paso 3.4.
- **`JOBS_ENABLED`:** tareas programadas (proceso diario y precios). Con `false` no corre ninguna. Si queda vacía, quedan activas.
- **`IDENTIDAD_SIMULADA`:** con `true`, el registro de frijol simula la verificación de CURP sin consultar SADER ni RENAPO (se ignora con `NODE_ENV=production`). Si queda vacía o en `false`, se consultan los servicios reales.
- **`CONSULTA_CURP_MAX`, `CONSULTA_CURP_VENTANA_MIN`:** límite de consultas de CURP por técnico. Si quedan vacías: 40 consultas cada 15 minutos.
- **`DEV_USUARIOS_PASSWORD`:** contraseña de los usuarios de prueba de panel, bodega y técnicos del paso 3.4 (mínimo 8 caracteres). Si queda vacía, se genera una al azar cada vez que se crean los usuarios.
- **`DEV_PRODUCTOR_NIP`:** NIP de los productores de prueba del paso 3.4 (4 dígitos). Si queda vacía, se genera uno al azar cada vez que se crean los usuarios.
