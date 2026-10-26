# Pruebas de SIMAC (maíz y frijol)

Aquí viven **todas** las pruebas automáticas que usamos para demostrar que Frijol funciona y que Maíz no cambió.
Cualquier persona puede repetirlas. Usan **datos ficticios** y se niegan a correr contra producción.

## Qué hay que instalar (una sola vez)

| Qué | Para qué | Cómo saber si ya lo tienes |
|---|---|---|
| Node.js 20 | correr `npm test` y sembrar los usuarios ficticios | `node -v` |
| Python 3.10 o más nuevo | las pruebas están escritas en Python | `python --version` |
| Playwright para Python (**solo** para las pruebas en pantalla) | abrir un navegador de prueba | `pip install playwright openpyxl` y luego `python -m playwright install chromium` |
| Un servidor de **pruebas** con el backend encendido y la base ya migrada | contra qué se prueba | ver `docs/AMBIENTE_DE_PRUEBAS.md` |

En `backend/` corre `npm install` una vez.

## Cómo preparar la base de pruebas

1. La base debe ser **de pruebas**: una base vacía con las migraciones aplicadas (`npm run migrate:up`) o una copia de pruebas.
   Su nombre debe contener `test`, `prueba`, `qa` o `dev` (así es imposible confundirla con la real).
2. Copia `tests/.env.example` como `tests/.env` y llena **tus** valores (`tests/.env` nunca se sube a git).
   Los más importantes: `TEST_API_URL`, `TEST_DATABASE_URL`, `TEST_PASSWORD` (invéntala, no uses una real).
3. Los usuarios y el productor ficticios los crea solo `npm test` (`tests/seed.js`). También puedes correrlo a mano: `npm run test:seed`.
   Todos son `qa.<algo>@ejemplo.test` con CURP inventadas.

> El servidor de pruebas debe tener `IDENTIDAD_SIMULADA=true` y `JOBS_ENABLED=false`: así no consulta a RENAPO/SADER de verdad ni genera avisos reales.
> Las pruebas de la tarea de verificación y de "servicios caídos" corren comandos en la máquina del servidor; si está en otra computadora,
> llena `TEST_REMOTE_SHELL` y `TEST_BACKEND_DIR` en el `.env` (ver el ejemplo).

## Cómo correr

Desde `backend/`:

```bash
npm test                      # pruebas de API (≈ 30 segundos)
npm run test:ui               # además, pruebas en pantalla con navegador (≈ 5 minutos)
npm test -- t05               # solo los archivos cuyo nombre contenga "t05"
npm test -- --sin-seed        # no vuelve a sembrar los usuarios (más rápido)
```

> Con el sistema real hay un límite de **20 intentos de acceso cada 5 minutos** por computadora. Las pruebas reutilizan las sesiones
> y, si aun así lo alcanzan, **esperan y reintentan solas** (verás el aviso "límite de intentos de acceso alcanzado").

## Cómo leer el resultado

Cada archivo imprime una línea por comprobación (`OK` o `FALLA`) y al final una tabla:

```
══════ RESULTADO ══════
✅ suites\t02_programas.py                       16 / 16
✅ suites\t05_registro_frijol.py                 98 / 98
❌ suites\t07_panel_admin_frijol.py              33 / 34   (1 fallas)

Total: 205 de 206 comprobaciones pasan.  ⛔ HAY FALLAS
```

- `✅` todo pasó en ese archivo; `❌` hubo al menos una `FALLA`. Búscala en la salida: dice qué se esperaba y qué se obtuvo.
- El comando termina con código `0` si todo pasó y `1` si algo falló (así lo puede leer un flujo automático).

## Qué cubre cada archivo

| Archivo | Ticket | Qué prueba |
|---|---|---|
| `suites/t02_programas.py` | T02 | Cada técnico ve solo lo de su programa (maíz / frijol) |
| `suites/t03_ciclo_por_cultivo.py` | T03 | Maíz y frijol conviven en la misma parcela; borrados protegidos |
| `suites/t04_alta_de_tecnicos.py` | T04 | Alta, edición y baja de técnicos; permisos del panel |
| `suites/t05_registro_frijol.py` | T05 | Registro de frijol, consulta de CURP, idempotencia, verificación, correcciones |
| `suites/t05b_frijol_luego_maiz.py` | T05 §5.7 | Quien llegó por frijol se registra después en maíz |
| `suites/t07_panel_admin_frijol.py` | T07 | Panel de administración de frijol, filtros, Excel, permisos |
| `suites/t08_traslape_y_activacion.py` | T08 | Traslape de parcelas, activación por el propio productor, maíz sin cambios |
| `ui/ui_t04_alta_tecnico.py` | T04 | En pantalla: alta de técnico y primer acceso |
| `ui/ui_t06_flujo_registro.py` | T06 | En pantalla (celular): asistente de 7 pasos, mapa, borrador, sin señal, doble toque |
| `ui/ui_t07_panel_admin.py` | T07 | En pantalla: panel de frijol en escritorio y celular |
| `ui/ui_t08_traslape.py` | T08 | En pantalla: el mapa avisa del traslape |

Los archivos corren **en orden** y algunos usan datos que dejó el anterior (`tests/.tmp/estado.json`, que se borra al empezar).

## La protección contra producción

`tests/guardia.js` revisa el entorno antes de hacer nada. **Se niega a correr** (y no toca ninguna base) si:

- la base está en Amazon RDS o en un dominio de la Secretaría,
- el nombre de la base no contiene `test`, `prueba`, `qa` o `dev`, o
- la dirección del API es la del sitio público.

Ejemplo (se puede comprobar así):

```
$ TEST_DATABASE_URL=postgres://u:p@algo.us-east-1.rds.amazonaws.com:5432/bodegas_qa npm test
⛔ Las pruebas no se ejecutaron:
  - La base apunta a "algo.us-east-1.rds.amazonaws.com", que parece un servidor de PRODUCCIÓN. Las pruebas se niegan a correr.
No se hizo ningún cambio en ninguna base de datos.
```

## "Maíz no cambió"

Herramienta para demostrar que un cambio no movió las cifras de maíz. Mide 16 pantallas y listados del panel de administración
(tarjetas del tablero, renglones de cada listado y de cada hoja de la exportación): unas 680 cifras.

```bash
npm run test:maiz:capturar -- antes      # 1) guarda las cifras de HOY en tests/.tmp/maiz/antes.json
# ... se aplica el cambio que se quiere revisar ...
npm run test:maiz:comparar -- antes      # 2) captura de nuevo y compara contra "antes"
npm run test:maiz:comparar -- antes despues   # (o compara dos capturas ya guardadas)
```

Ejemplo de salida, **sin cambios**:

```
  ✅ igual      Tablero · resumen  (7 cifras)
  ✅ igual      Exportación de la base · renglones por hoja  (31 cifras)
  ...
Resultado: 678 de 678 cifras iguales, 0 cambiaron.  ✅ Maíz no cambió.
```

Ejemplo **después de crear un productor de maíz de prueba** (los cambios son justo los esperados: +1 productor, +1 parcela):

```
  ⚠️ CAMBIÓ     Tablero · resumen  (1 de 7 cifras)
        /productores_activos:  10148  →  10149  (+1)
  ⚠️ CAMBIÓ     Exportación de la base · renglones por hoja  (2 de 31 cifras)
        hoja "Parcelas (UP)":  22489  →  22490  (+1)
        hoja "Productores":  10148  →  10149  (+1)
Resultado: 665 de 678 cifras iguales, 13 cambiaron.  ⚠️ Revisa que cada cambio sea esperado.
```

Termina con código `0` si no hay diferencias y `1` si las hay.

## Cómo agregar una prueba nueva

1. Abre el archivo del ticket que cambió (por ejemplo `suites/t05_registro_frijol.py`) o crea uno nuevo en `suites/` con nombre `tNN_tema.py`.
2. Empieza con las dos líneas de siempre (cópialas de cualquier archivo): agregan la carpeta `tests` a la ruta y hacen `from lib import *`.
3. Escribe comprobaciones con `ok('qué debe pasar', condicion, 'dato para ayudar a entender')`. Ayudantes que ya existen:
   `http(ruta, token, método, cuerpo)`, `login(EM('frijol1'))`, `login_admin()`, `sql('...')`, `val('select ...')`, `curp_nueva('REN')`, `cuerpo(...)`, `registrar(...)`.
4. Termina con `resumen('TNN')`, o imprime una línea `RESUMEN TNN: <pasan> / <total>` como las demás (es lo que lee la tabla final).
5. **Datos ficticios siempre**: CURP inventadas con `curp_nueva(...)`, nombres inventados. Nunca datos reales, URLs reales ni credenciales.
6. Deja la base como la encontraste si borras algo; si creas datos, que sean identificables como de prueba.

## Qué cambió respecto a las pruebas originales (T02–T08)

Las pruebas salieron de una carpeta de trabajo personal. Al moverlas se **quitó** todo lo que dependía de esa computadora: archivos de contraseñas, la dirección del
servidor de pruebas y los comandos por SSH. Ahora todo sale de variables de entorno. **No se perdió ninguna comprobación**: 229 de API (T02 16, T03 12, T04 37,
T05 98, T05 §5.7 9, T07 34, T08 23) y 83 en pantalla (T04 19, T06 39, T07 20, T08 5), igual que antes de moverlas.
