# T11 · Decisiones y confirmaciones por escrito

Reemplaza las secciones "Decisiones que tomé" y "Qué podría romper" del Pull Request de T11 (mientras el ambiente de pruebas está suspendido y los cambios entran directo a `main`).
Resuelve M5 (las parcelas de frijol inflan las cifras de maíz) y M7 (nada suma maíz + frijol en una misma parcela).

---

# Parte A — Origen de la parcela y cifras de maíz (§11.1 a §11.3 y §11.6)

**Pruebas:** `backend/tests/suites/t11a_origen_de_parcela.py` (34 comprobaciones). **Toda la batería: 328 de 328.**

## 11.1 · Migración `0006_origen_de_parcela`
- **Columna:** `up.programa_origen VARCHAR(30) NOT NULL DEFAULT 'simac_maiz'`, con referencia a `cat_programa(clave)` e índice (`idx_up_programa_origen`). Se conservó el nombre sugerido.
- **Decisión: el `DEFAULT` se queda.** Quitarlo obligaría a tocar todos los `INSERT INTO up` de maíz (hay 8, ver §11.2), y un olvido dejaría una parcela de maíz sin origen o con error. Con el DEFAULT, maíz no cambia en ningún `INSERT`, y solo frijol escribe su origen. Costo: si en el futuro entra un tercer programa, tendrá que escribir su origen explícitamente (igual que frijol).
- **Verificación al migrar:** la propia migración comprueba que el número de parcelas con `programa_origen = 'simac_maiz'` es igual al total, y aborta si no lo es. En la copia de pruebas: **22,680 de 22,680**.
- **Bajada:** quita índice y columna, pero **se niega con un mensaje claro** si hay parcelas con origen distinto de maíz (como hace 0003). Probado en una transacción que se revierte: con parcelas de frijol se niega; sin ellas, baja sin errores.

## 11.2 · Quién escribe el origen
**Frijol** fija `programa_origen = 'frijol_afb'` solo al crear una parcela **nueva** (`services/frijolRegistro.ts:324`). Registrar frijol en una parcela **existente** no la cambia de origen (probado).

**Lista completa de `INSERT INTO up` del backend** (ninguno nombra la columna: todos quedan con el DEFAULT, es decir, origen maíz; lo prueba un test automático):

| Archivo y línea | Qué crea | Origen que queda |
|---|---|---|
| `utils/ups.ts:176, 189, 214` | `insertarUP`: las tres variantes (con coordenadas, con polígono, solo estado/municipio). La usan el registro alterno del técnico de maíz (`routes/tecnico.ts`), la app del productor (`routes/productor.ts`, como `crearUP`) y el registro de frijol | Maíz; **en frijol, el servicio lo cambia a `frijol_afb` justo después de crearla** |
| `routes/productor.ts:1095` | `PATCH /productor/ubicacion`: crea "Mi parcela" cuando el productor no tiene ninguna parcela de maíz | Maíz |
| `routes/productor.ts:1650, 1662, 1686` | `POST /productor/ups`: parcela adicional del productor, tres variantes según traiga polígono o coordenadas | Maíz |
| `routes/ups.ts:62` | `POST /ups` genérico. **Está dentro de un bloque comentado (`/* … */`): no se ejecuta.** | — (código inactivo) |

**Ningún `UPDATE up` toca el origen.** Los 13 `UPDATE up` del backend se revisaron: el único que menciona la columna es el de `frijolRegistro.ts:324` (parcela nueva de frijol). El `PATCH /api/ups/:id` genérico usa una lista fija de campos permitidos (nombre, tipo, ubicación, geometría…) y el origen no está en ella. Lo comprueba un test automático.

## 11.3 · Dónde se usa la regla "cuenta en maíz"
**La regla:** `parcelaDeMaiz(alias)` (`utils/programas.ts`): `programa_origen = 'simac_maiz'` **o** existe un ciclo de maíz de esa parcela. `soloMaizDeUp(alias)` quedó como "productor en maíz **y** parcela que cuenta en maíz": **es una sola función** y todos los lugares que ya usaban `soloMaizDeUp` (dashboard, listados y exportación) la heredan sin tocar su código.

| Archivo y línea | Qué cuenta | Resultado |
|---|---|---|
| `routes/dashboard-admin.ts:86, 101, 115, 124, 136, 398, 471, 505` | parcelas, hectáreas, ciclos y mapa del tablero de maíz | **Usa la regla** (vía `soloMaizDeUp`) |
| `routes/admin.ts:1318, 1321` | filtros de estado y municipio de parcelas | **Usa la regla** (vía `soloMaizDeUp`) |
| `routes/admin.ts:1336` | listado de parcelas con polígono del panel | **Usa la regla** (`parcelaDeMaiz('u')`) |
| `routes/admin.ts:170, 193, 650, 656` | primera parcela del listado de usuarios, estados disponibles, polígonos y primera parcela de la ficha del productor | **Usa la regla** |
| `routes/exportar-bd.ts:85, 142, 186` | hojas de parcelas, ciclos y cultivos de la exportación | **Usa la regla** (vía `soloMaizDeUp`) |
| `routes/exportar-bd.ts:224, 254, 283, 314` | hojas de cosecha, estimación, visitas e incidencias | **No aplica:** son registros de seguimiento de maíz que ya filtran por productor de maíz; la parcela solo se muestra como etiqueta y quien los captura es siempre personal de maíz |
| `routes/home.ts:62` | cifra de parcelas del productor en su inicio | **Usa la regla** |
| `routes/seguimiento.ts:57` | parcelas y ciclos del productor en el seguimiento | **Usa la regla** |
| `routes/mis-productores.ts:21, 138` | parcelas del supervisor y detalle de un productor | **Usa la regla** |
| `routes/admin-tecnicos.ts:238, 275` | total de parcelas de los técnicos de maíz | **Usa la regla** |
| `routes/insumos-admin.ts:105` | productores de Sinaloa pendientes de la encuesta | **Usa la regla** |
| `routes/senasica.ts:205` | productores cercanos a una alerta fitosanitaria | **Usa la regla** (avisos de maíz) |
| `services/encuestaService.ts:61` | parcelas que cuentan para la encuesta de insumos | **Usa la regla** |
| `routes/dashboard-admin.ts:407` (visitas recientes) | últimas visitas de seguimiento | **No aplica:** igual que las hojas de seguimiento de la exportación |
| `routes/oferta.ts`, `routes/disponibilidad.ts`, `routes/alertas.ts`, `routes/propuestas.ts`, `routes/senales-compra.ts`, `routes/ventanillas.ts` | oferta y disponibilidad de producción, alertas y avisos de compra | **No aplica:** son módulos de maíz que dependen de la parcela que **el propio productor de maíz elige** (propuestas) o notifican a personas con cuenta por cercanía; no son cifras de parcelas. |
| `routes/ups.ts:141` (`GET /ups/geometrias`) | todas las geometrías, para detectar traslapes al dibujar | **No aplica, a propósito:** para no encimar parcelas deben verse **todas**, también las de frijol |
| `routes/productor.ts:1781` (revisión de traslape propio) y `utils/ups.ts:119` | traslape con las parcelas del mismo productor | **No aplica, a propósito:** el traslape físico cuenta sin importar el cultivo |

### Pantallas de maíz que listan las parcelas de un productor (§11.3.4)
Por defecto (como pide el ticket), una parcela de origen frijol **sin ciclo de maíz no se muestra** en las pantallas de maíz:

| Pantalla | Archivo |
|---|---|
| App del productor: sus parcelas con ciclos | `routes/productor.ts:1748` y `routes/mis-ups.ts:47` |
| App del productor: ubicación, inicio, perfil, "mi parcela", "mi ciclo", declarar ciclo, domicilio | `routes/productor.ts:807, 818, 960, 1080, 1223, 1239, 1411, 1448, 1467, 1503` |
| Estado del registro del productor (paso "ubicación") | `services/estadoRegistroService.ts:17` |
| Técnico de maíz: parcelas del productor, "mis registros" y su perfil | `routes/tecnico.ts:504, 603, 727` |
| Consulta de parcelas por CURP | `routes/ups.ts:176` |

La consulta de **una parcela concreta por su identificador** (`GET /mis-ups/:up_id`, `GET /ups/:up_id`) no filtra: es acceso directo a un dato ya conocido.

### Hallazgo durante la implementación (corregido)
`PATCH /api/productor/ubicacion` elegía "la parcela principal" como **la más antigua** del productor. Con una parcela de frijol como primera, **la app de maíz habría sobrescrito la ubicación y el polígono de la parcela de frijol**. Ahora solo considera parcelas que cuentan en maíz y, si no hay ninguna, crea la suya ("Mi parcela"). Lo verifica la prueba del caso 11 de T08 (la parcela de frijol queda intacta).

## Un caso que Mariel debe confirmar (consecuencia de ocultar la parcela de frijol)
Un productor registrado primero por frijol que luego usa la app de maíz **no ve su parcela de frijol** (es lo pedido) y la app le pide su ubicación de maíz; se le crea una parcela nueva. **Si la dibuja sobre la misma tierra que su parcela de frijol, el sistema lo rechaza por traslape con su propia parcela** (las dos están a su nombre). Opciones, a decidir:
1. **Dejarlo así** (lo pedido): el técnico de maíz resuelve el caso agregándole un ciclo de maíz a la parcela de frijol (la parcela pasa a contar en maíz, probado) en lugar de dibujar otra.
2. **Mostrar la parcela de frijol en la app de maíz** marcada como "de frijol", para que el productor agregue su ciclo de maíz sobre ella.
3. **Permitir el traslape propio** con una parcela de origen frijol (riesgo: contar dos veces la misma tierra).
No lo cambié: es una decisión de producto de maíz.

## 11.6 · Comparación de cifras (herramienta de T12, copia de pruebas)
1. **La migración sola no cambia nada:** capturadas las cifras de maíz antes y después de aplicar 0006 → **678 de 678 cifras iguales** (todas las parcelas existentes quedan con origen maíz).
2. **Con datos de prueba creados a propósito** (un productor de maíz con 2 parcelas de maíz y 1 de frijol creada por un técnico de frijol; otro con una parcela con maíz y frijol a la vez; otro solo de frijol; y uno más de maíz sin ciclo), el resultado coincide uno a uno:

| Qué | Esperado | Resultado |
|---|---|---|
| Parcelas del tablero de maíz y de la hoja "Parcelas" de la exportación | +3 (2 + 1 de maíz), no +5 | +3 y +3 |
| Productor con 2 de maíz + 1 de frijol | cuenta 2 | 2 |
| Parcela con maíz y frijol a la vez | cuenta una vez; sus hectáreas de maíz salen solo del ciclo de maíz | una vez; 1 ha (no 1.5) |
| Parcela de un productor solo de frijol | no aparece en nada de maíz | no aparece |
| Parcela de origen frijol a la que se le crea un ciclo de maíz | pasa a contar | cuenta (+1) y el productor con cuenta la ve |
| Parcela de maíz recién registrada sin ciclo | sigue contando (su origen es maíz) | cuenta |
| Productor de maíz con cuenta | ve las mismas pantallas y parcelas de maíz de siempre | 2 de 2 |

---

*La parte B (superficie combinada, §11.4 y §11.5) se documenta al final de este archivo cuando se entregue.*
