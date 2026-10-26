# T09 · Decisiones y confirmaciones por escrito

Documento que reemplaza las secciones "Decisiones que tomé" y "Qué podría romper" del Pull Request de T09 (mientras el ambiente de pruebas está suspendido y los cambios entran directo a `main`).
Resuelve los hallazgos M2, M4 y B1–B12 de la auditoría. Las pruebas están en `backend/tests/suites/t09a_ciclos_y_catalogos.py` (29 comprobaciones) y `t09b_correcciones_menores.py` (31).
**Resultado de toda la batería de pruebas: 289 de 289.** **"Maíz no cambió": 678 de 678 cifras iguales** antes y después de la parte B.

---

## Parte A — Lo urgente

### 9.1 · M4: `POST /api/cycles/:cycle_id/crops` solo acepta maíz

**Qué se hizo.** El endpoint responde 400 ("Este endpoint es solo para maíz. El frijol se registra y corrige desde el módulo de frijol.") si `crop` no es `maiz`. El 400 por incoherencia (el cultivo no coincide con el del ciclo) se conserva.

**Decisión: el `ON CONFLICT … DO UPDATE` se queda tal cual para maíz.** Las pantallas de maíz lo usan para "actualizar el cultivo del ciclo"; cambiarlo cambiaría el comportamiento de maíz. La prueba lo confirma: un segundo POST de maíz al mismo ciclo sigue actualizando el cultivo.

**Confirmación de que ningún endpoint de maíz puede tocar un ciclo con `crop <> 'maiz'`** (lista completa de los que escriben en `cycle` o `cycle_crop`):

| Endpoint | Archivo | Qué lo protege |
|---|---|---|
| `POST /api/ups/:up_id/cycles` | `routes/cycles.ts:11` | Inserta siempre `crop = 'maiz'` y el chequeo de duplicado filtra `crop = 'maiz'` (línea 63) |
| `DELETE /api/cycles/:cycle_id` | `routes/cycles.ts:168` | `c.crop = 'maiz'` en la verificación de dueño (línea 182) |
| `POST /api/cycles/:cycle_id/crops` | `routes/cycles.ts:208` | **Nuevo:** solo `maiz`; además el cultivo debe coincidir con el del ciclo |
| `PATCH /api/cycle-crops/:id` | `routes/cycles.ts:366` | `cy.crop = 'maiz'` (línea 388): sobre un cultivo de frijol responde 403 |
| `PATCH /api/cycles/:cycle_id/estado` | `routes/cycles.ts:475` | `c.crop = 'maiz'` (línea 496): sobre un ciclo de frijol responde 404 |
| `POST /api/productor/ciclo` | `routes/productor.ts:1490` | Inserta `crop = 'maiz'` y el duplicado filtra `crop = 'maiz'` (línea 1510) |
| `DELETE /api/mis-ups/:up_id` (productor) | `routes/mis-ups.ts:191` | Responde 409 si la parcela tiene un ciclo de otro cultivo (línea 218) |
| Borrados del administrador (`/admin/productores/:id`, `/admin/parcelas/:id`) | `routes/admin.ts:521, 1404` | 409 si hay frijol (T03 §3.4) |

Las pruebas verifican en vivo: PATCH de cultivo → 403, PATCH de estado → 404 y DELETE → 404 sobre un ciclo de frijol, y que el ciclo y el cultivo quedan intactos.

**Frontend.** Las dos pantallas que llaman a ese endpoint mandan `crop: 'maiz'`: `pages/productor/CicloProductivoPage.tsx:173` y `pages/tecnico/CicloTecnicoPage.tsx:116` (por `api.cycles.crearCultivo`). Ninguna manda frijol.

### 9.2 · M2: la corrección del cultivo valida los catálogos

**Qué se hizo.** Una sola función, `validarCatalogosCultivo` (`services/frijolRegistro.ts`), valida variedad, destino, tipo de siembra, rotación y fertilizantes. La usan el registro nuevo y `PATCH /api/frijol/cultivos/:id`, para que no vuelvan a diferir. Un código inventado responde 400 con `campo` (`cultivo.destino`, etc.).

**Decisión sobre seguro agrícola y programas de la Secretaría (§9.2.3): se leen del catálogo.** La función `validarCatalogosProductor` valida el seguro contra `cat_catalog` y los programas contra `cat_programas_gobierno` (activos). Razón: si alguien desactiva un programa en el catálogo, debe dejar de aceptarse sin tocar código. Se conserva una lista corta en el código (`PROGRAMAS_SADER`) **solo para decidir cuáles de todos los programas del catálogo se ofrecen en frijol**, porque ese catálogo trae también programas de maíz. Antes, la corrección del productor ni siquiera validaba el seguro agrícola: se podía guardar cualquier texto. Alternativa descartada: eliminar la lista del código; obligaría a agregar una columna "se ofrece en frijol" al catálogo (migración y mantenimiento) sin ganancia hoy.

---

## Parte B — El resto

### 9.3 · B8: límite de consultas de CURP de frijol
**Propuesta aplicada: 40 consultas cada 15 minutos por técnico** (no por computadora). Un técnico atiende una persona cada varios minutos (una consulta, a veces una segunda por una CURP mal escrita), así que 40 en 15 minutos no se alcanza en uso normal; recorrer CURP una tras otra se corta de inmediato. Respuesta: 429 con "Hiciste muchas consultas en poco tiempo. Espera unos minutos." Se puede ajustar sin tocar el código con `CONSULTA_CURP_MAX` y `CONSULTA_CURP_VENTANA_MIN` en el `.env`.
La prueba levanta un backend aparte con la configuración por defecto: las primeras 40 pasan, la 41 recibe 429 y otro técnico no se ve afectado.
**Recomendación para maíz (no se cambió):** `POST /api/tecnico/consultar-curp` conviene que tenga el mismo límite por técnico, por el mismo motivo (gasta cuota de RENAPO/SADER). Hoy solo tiene el límite general por IP. Es un cambio de comportamiento de maíz: requiere acuerdo.

### 9.4 · B1: clave de idempotencia
**Se limitó la clave del cliente a 60 caracteres** (400 claro `IDEMPOTENCY_KEY_LARGA`) en lugar de ampliar la columna. La clave interna es `frijol:<id del técnico>:<clave>` y la columna admite 80: con un id de hasta 10 dígitos quedan 62, y se dejan 60. Un UUID (36) cabe de sobra. Ampliar la columna habría requerido una migración sin necesidad. Antes, una clave larga daba error 500; además el mensaje de "falta el encabezado" se usaba también para "demasiado larga".

### 9.5 · B2: correo y teléfono en `producer`
Se investigó qué columna lee cada parte del sistema.

| Dato | Columna | Quién la lee / escribe |
|---|---|---|
| Teléfono | `producer.phone` | Todos: maíz (`productor.ts`, `tecnico.ts`, `admin.ts`, exportación) y frijol. **No hay duplicado.** |
| Correo | `producer.correo` | Lee: `admin.ts:155, 616, 1364`, `productor.ts:474, 535, 612, 1440`, `tecnico.ts:243`, frijol. Escribe: `productor.ts`, `tecnico.ts` y frijol |
| Correo | `producer.correo_electronico` | **Lee: `routes/exportar-bd.ts:42` (la hoja "Productores" de la exportación de maíz)** y la pantalla `ProductorDetalleAdminPage.tsx:136` (como respaldo). Escribe: `routes/producers.ts` (flujo antiguo de productores) |

**Hallazgo y decisión:** la exportación de maíz lee `correo_electronico`, pero frijol escribía solo `correo`; un correo capturado desde frijol no habría salido en esa exportación. Por la regla del ticket, **frijol ahora escribe ambas columnas iguales** (registro nuevo, corrección en el registro y `PATCH /productores/:id`). No se cambió nada más. T10 cambiará cómo se edita el correo; esto no es trabajo que T10 vaya a rehacer, solo mantiene las dos columnas iguales. La prueba lo verifica.
Nota: no se unificaron las dos columnas en maíz (cambiaría maíz); queda como observación: maíz mismo escribe en una o en otra según el flujo.

### 9.6 · B3: orden estable en las listas agregadas
Búsqueda de todas las agregaciones (`json_agg`, `jsonb_agg`, `array_agg`, `string_agg`) en `backend/src`. Las que no tenían `ORDER BY` y ahora lo tienen:

| Archivo | Qué agrega | Orden |
|---|---|---|
| `routes/cycles.ts` (listado de ciclos de una parcela) | cultivos del ciclo | `cc.cycle_crop_id` |
| `routes/seguimiento.ts` | parcelas del productor, ciclos de cada parcela y cultivos de cada ciclo | `u.up_id`, `c.cycle_id`, `cc.cycle_crop_id` |
| `routes/admin-frijol.ts` | variedades y tipos de fertilizante concatenados | alfabético / `sort_order` |

Las demás ya lo tenían (`admin-tecnicos.ts`, `admin.ts` bodegas, `mis-ups.ts`, `frijol.ts`). Se eligió el identificador porque es el orden en que ya salían en la práctica, así maíz muestra lo mismo. **Una prueba automática recorre todo `backend/src` y falla si aparece una agregación sin `ORDER BY`** (evita que vuelva). Comprobado con la herramienta "maíz no cambió": 678 de 678 cifras iguales.

### 9.7 · B4: contraseña temporal del reinicio
El reinicio usaba `Math.random()`. Ahora usa el mismo generador seguro (`crypto`) que el alta (`passTemporalTecnico`, 12 caracteres con mayúscula, minúscula y número) y se quitó la función vieja. La contraseña de los usuarios del panel (`admin-permisos.ts`) usa otro generador y no estaba en el alcance del ticket; **queda como observación**: conviene que use el mismo.

### 9.8 · B5: código muerto
Se quitó el `if` vacío de `routes/tecnico.ts` (registro alterno de un productor existente); quedó un comentario con la regla. El comportamiento no cambia: las pruebas de registro alterno de T02, T05 §5.7 y T08 siguen pasando.

### 9.9 · B6: fecha de nacimiento al corregir
Una función compartida, `errorFechaNacimiento` (`services/frijolRegistro.ts`), aplica la misma regla (formato AAAA-MM-DD, edad de 15 a 100 años) al registro nuevo y a `PATCH /productores/:id`. T10 la reutilizará.

### 9.10 · B7: bajada de la migración 0001
Solo se cambió la sección `Down`: los programas `acopio_bienestar`, `semillas_bienestar` y `otro_sader` se borran **solo si ningún productor los usa** (maíz: `producer.programas_beneficiario`; frijol: `frijol_productor.programas_sader`, si esa tabla existe). **Cómo se verificó que la subida no cambió:** se compararon, byte a byte, las dos versiones del archivo (la de `git` antes y la nueva) fuera de la sección `Down`: idénticas; el diff de git muestra un único bloque, en la línea 88 (dentro de `Down`). La prueba ejecuta la bajada en una transacción que se revierte: el programa en uso se conserva, el que nadie usa se borra y la base queda intacta.

### 9.11 · B9: rutas del técnico de frijol
El ticket T06 decía `/tecnico/frijol/*`; la implementación usa `/frijol/tecnico/*`. **Por qué:** por simetría con maíz, que ya vivía en `/maiz/tecnico/*`; así la primera parte de la ruta es el programa (`/maiz/...`, `/frijol/...`) y la segunda el rol (`/tecnico`, `/admin`). No se cambiaron. Rutas reales:

| Pantalla | Ruta |
|---|---|
| Entrada del técnico de frijol | `/frijol/tecnico/login` |
| Tablero | `/frijol/tecnico` |
| Nuevo registro (asistente de 7 pasos) | `/frijol/tecnico/nuevo` (y `/frijol/tecnico/nuevo/:borradorId`) |
| Mis registros | `/frijol/tecnico/registros` |
| Detalle de un productor | `/frijol/tecnico/productor/:id` |
| Perfil | `/frijol/tecnico/perfil` |
| Panel de administración de frijol | `/maiz/admin/frijol` y `/maiz/admin/frijol/productor/:id` |
| API del técnico | `/api/frijol/*` · API del panel: `/api/admin/frijol/*` |

### 9.12 · B10: correo de credenciales de técnicos
**Hecho:** el nombre, el correo, la contraseña y la dirección dentro del HTML de `enviarCredencialesTecnico` se escapan (`escaparHtml`). El correo de recuperación de contraseña de maíz no se tocó.
**Propuesta (no construida): enlace de un solo uso para definir la contraseña, en lugar de mandarla en el correo.**

| | Contraseña temporal por correo (hoy, apagado por defecto) | Enlace de un solo uso |
|---|---|---|
| Seguridad | La contraseña queda en la bandeja de entrada y en servidores de correo | Nunca viaja una contraseña; el enlace caduca (por ejemplo, 24 horas) y se invalida al usarse |
| Experiencia | Simple | Un paso más para el técnico (definir su contraseña), pero es lo habitual |
| Esfuerzo | Ya existe | Medio día a un día: tabla de tokens, pantalla "Definir contraseña", caducidad y pruebas (ya existe un flujo parecido de recuperación para otros roles que se puede reutilizar) |
Recomendación: hacerlo antes de encender el envío de correos en producción.

### 9.13 · B11: datos del servidor en `deploy/deploy.sh`
**Hecho:** host, usuarios, puerto y llaves se movieron a `deploy/deploy.env` (en `.gitignore`), con `deploy/deploy.env.example` sin valores reales. `clonar-bd-a-pruebas.sh` también lo usa. `StrictHostKeyChecking=no` pasó a `accept-new` (con `HostKeyAlias` para el túnel de producción). **Se probó un despliegue a pruebas con el archivo local y funcionó.** Los comentarios que mencionaban direcciones internas en `nginx-pruebas.conf` y `setup-servidor-pruebas.sh` se quitaron.
**Comprobación y aviso: el repositorio de GitHub es PÚBLICO** (`jessfn/Simulador`, se ve sin iniciar sesión).
**Recomendación sobre el historial (no se reescribió):** los valores que ya están en el historial son direcciones internas (10.x), nombres de usuario de los servidores, la ruta de la llave (no la llave) y la **dirección pública del bastión**. **No hay contraseñas ni llaves.** Reescribir el historial no es suficiente por sí solo (copias, bifurcaciones y cachés lo conservan) y exige autorización de Mariel. Recomiendo, en este orden: (1) **hacer el repositorio privado** (la medida más efectiva y sin riesgo); (2) restringir el bastión por reglas de red a las direcciones de la oficina y la VPN, con acceso solo por llave; (3) dejar el historial como está.

### 9.14 · B12: borrado de productor por el supervisor
**Confirmado:** ninguna ruta de supervisor borra productores ni parcelas. Rutas del supervisor revisadas (`routes/mis-productores.ts`): `GET /` (línea 9), `POST /` (37, vincula), `DELETE /:producerId` (87) y `GET /:producerId` (110). El único borrado, `DELETE /:producerId`, ejecuta `DELETE FROM supervisor_productores WHERE supervisor_id = … AND producer_id = …`: **solo quita el vínculo**. Además se revisaron **todos** los `DELETE FROM producer / up / cycle / cycle_crop` del backend: están únicamente en `admin.ts` (solo administrador, con el 409 de T03), `cycles.ts` (maíz, `crop = 'maiz'`) y `mis-ups.ts` (el propio productor, con 409 si hay otro cultivo). Por eso no hizo falta aplicar el 409 en rutas de supervisor.

---

## Qué podría romper y cómo se verificó
- **Maíz.** Solo §9.1 cambia comportamiento de maíz (rechaza `crop <> 'maiz'`, que ninguna pantalla manda). §9.6 solo agrega orden a listas y §9.8 quita un `if` vacío. Verificación: 289/289 pruebas, incluidas las de maíz (T02, T03, T05 §5.7, T08), y "maíz no cambió": **678 de 678 cifras iguales** antes y después.
- **Frijol.** El registro nuevo y la corrección comparten ahora las validaciones; las 98 comprobaciones de T05 y las 39 en pantalla siguen pasando.
