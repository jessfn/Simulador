# T10 · Edición única de datos personales y solicitudes de cambio — decisiones y confirmaciones

Reemplaza las secciones "Decisiones que tomé" y "Qué podría romper" del Pull Request de T10 (mientras el ambiente de pruebas está suspendido y los cambios entran directo a `main`).
Resuelve M1: un técnico ya no puede cambiar a ciegas los datos personales de un productor que existía en SIMAC.

**Migración:** `0007_solicitudes_cambio` (sube y baja; la baja se niega si ya hay solicitudes, como 0003 y 0006).
**Código nuevo:** `services/edicionUnica.ts` (la regla), `services/solicitudesCambio.ts` (crear, resolver, cancelar, vencer), `routes/solicitudes-cambio.ts` (técnicos), `routes/admin-solicitudes.ts` (panel), `jobs/solicitudesVencimiento.ts`.

---

## 10.1 · Inventario de lugares que editan datos personales

Se buscó `UPDATE producer` en todo `backend/src` (13 sitios). Resultado:

| # | Archivo → ruta | Qué modifica | Quién la llama | ¿Historial antes? | Qué hace T10 |
|---|---|---|---|---|---|
| 1 | `routes/frijol.ts` → `PATCH /frijol/productores/:id` | nombres, apellidos, sexo, fecha de nacimiento, teléfono, correo | técnico de frijol responsable | Sí | **Cubierta.** Pasa por `aplicarEdicionDirecta` (una vez por dato; 409 después) |
| 2 | `services/frijolRegistro.ts` → `POST /frijol/registros` (productor ya existente) | los mismos 7 campos | técnico de frijol | Sí | **Cubierta.** Misma función. Lo que viene igual no cuesta; lo que cambia gasta la edición. Con mensaje "deja el valor actual para continuar" |
| 3 | `routes/tecnico.ts` → `PATCH /tecnico/productor/:id` | nombres, apellidos, teléfono, estado, municipio | técnico de maíz responsable | **No** | **Cubierta.** Nombres, apellidos, teléfono (y ahora sexo, fecha de nacimiento y correo, para que la ficha sea igual en los dos programas) pasan por la regla y dejan historial. Estado y municipio dejan historial sin gastar edición |
| 4 | `routes/tecnico.ts` → `POST /tecnico/registro-alterno` (productor existente) | teléfono, estado, municipio, sexo, fecha de nacimiento (con `COALESCE`) | técnico de maíz | **No** | **Cubierta.** Teléfono, sexo y fecha pasan por la regla (solo si el valor cambia); estado y municipio dejan historial. Esta ruta ya rechazaba a productores con cuenta (409), así que el teléfono con cuenta no se alcanza por aquí |
| 5 | `routes/productor.ts` → `PATCH /productor/perfil` | teléfono, programas, correo | **el propio productor** | No | **Exenta:** el productor es dueño de su dato (decisión por defecto del ticket) |
| 6 | `routes/productor.ts` → `PATCH /productor/ubicacion` | estado y municipio | el propio productor | No | **Exenta** (mismo motivo) |
| 7 | `routes/productor.ts` → aviso de privacidad | campos del aviso de privacidad | el propio productor | No | No es un dato personal de la regla |
| 8 | `routes/productor.ts:189` y `routes/admin.ts:256` | `usuario_id`, `estado_validacion`, `nota_admin` (activar cuenta, aprobar/rechazar) | admin / flujo de cuenta | No | No son datos personales editables |
| 9 | `routes/admin-tecnicos.ts:433` | `usuario_capturista_id = NULL` al borrar un técnico | admin | No | No es un dato personal |
| 10 | `routes/producers.ts` (`POST /producers`, actualiza datos de un productor existente por CURP) | nombres, apellidos, sexo, teléfono, correo, estado… | **nadie**: la ruta está desactivada en `index.ts` desde la auditoría de seguridad (CRIT-01) | — | **Fuera de servicio.** Si algún día se reactiva debe pasar por `edicionUnica` (anotado) |
| 11 | `jobs/frijolVerificacion.ts` | solo escribe `discrepancia_renapo_*` con `usuario_id = NULL` | job | Sí | **Exenta** y no cuenta como edición de técnico |
| 12 | `PATCH /frijol/productores/:id/curp` | CURP | técnico de frijol | Sí | **Fuera de la regla** (la CURP tiene su propio flujo; el ticket no la toca). No se marca `consume_edicion` |
| 13 | Pantallas de administración (`routes/admin.ts`, `admin-permisos.ts`, …) | — | admin | — | **No existe hoy ninguna pantalla de administración que edite directo los datos personales de un productor.** Lo único que el administrador hace con ellos es **resolver solicitudes**, y eso deja historial con su `usuario_id` (`aprobado_por`). Si más adelante se agrega edición directa del administrador, debe escribir en `producer_cambios` con `consume_edicion = FALSE` (§10.9) |

### Mis decisiones
- **(a) Estado y municipio del productor NO entran en la regla de una vez.** Los fija la parcela (se sincronizan con ella), no identifican a la persona y no sirven para recuperar el NIP. Sí dejan historial (antes maíz no dejaba nada).
- **(b) `PATCH /perfil` del propio productor:** no se toca.
- **(c) `registro-alterno` sobre un productor existente:** cuenta como edición **solo cuando un dato realmente cambia de valor**. Si el técnico manda lo mismo que ya está, no gasta nada.

## 10.2 · Cómo se sabe que la edición ya se usó
- **Fuente de verdad: `producer_cambios`**, con una marca nueva `consume_edicion` (boolean). Un campo está bloqueado si existe un renglón con `consume_edicion = TRUE` para ese productor y campo. Se calcula **al vuelo** con un índice parcial (`idx_producer_cambios_edicion`): una consulta corta por ficha, sin columna aparte que se pueda desincronizar.
- **Por qué una marca y no "usuario no nulo y rol técnico":** es explícita, no depende de adivinar roles, y deja a **todos los renglones anteriores con la edición disponible** (la migración verifica que ninguno quede gastado).
- **Productores existentes:** todos los campos de todos los productores actuales empiezan con la edición **disponible**, como pide el ticket. Maíz nunca dejó historial, así que no hay otra opción honesta.
- **Alta vs. edición:** el alta (crear al productor en esa misma operación) **no escribe nada en `producer_cambios`**, por lo tanto no gasta. Cualquier cambio posterior sobre un productor ya guardado —incluso del mismo técnico que lo registró— sí cuenta. El técnico que lo registró **conserva todo su acceso**; solo queda sujeto a la regla.
- **Quién gasta y quién no:** gastan los cambios hechos por un técnico (directos) y los aplicados por una solicitud aprobada. No gastan: el job de verificación, estado/municipio, ni (a futuro) la edición directa de un administrador.
- **Carrera:** la edición directa bloquea el renglón del productor (`FOR UPDATE`): dos ediciones simultáneas no pueden gastar la misma "única vez".

## 10.3 · Modelo de datos (migración 0007)
- `producer_cambios`: columnas nuevas `consume_edicion`, `solicitud_id`, `aprobado_por`.
- Tabla `solicitud_cambio` — **una solicitud por campo** (más simple de aprobar/rechazar y de bloquear; un productor puede tener varias a la vez en campos distintos). Guarda: productor, campo, valor actual (cuando se pidió), valor propuesto, motivo (mínimo 5 letras), solicitante y programa desde el que pide, a quién le toca (`asignado_tipo` técnico/administrador + `asignado_a` + el motivo de esa asignación), estado (`pendiente`, `aprobada`, `rechazada`, `cancelada`), `escalada` + `escalada_at` + `asignado_original_id` (a quién le tocaba antes), quién resolvió y cuándo, motivo del rechazo (obligatorio por restricción), `visto_por_solicitante` (para el aviso de respuestas nuevas), `created_at` y `vence_at`.
- **Una sola pendiente por productor y campo:** índice único parcial `uq_solicitud_pendiente`. Mensaje: "Ya hay una solicitud pendiente para {dato} de este productor. Espera la respuesta o cancélala para crear otra."
- El renglón definitivo es `producer_cambios` (enlazado por `solicitud_id`, con `aprobado_por`).

## 10.4 · Edición directa
- Campo disponible → se aplica, se escribe el renglón (con `consume_edicion`) y queda bloqueado.
- Campo usado, o teléfono de un productor con cuenta → **409** con `codigo` `EDICION_USADA` o `TELEFONO_CON_CUENTA` y texto sencillo que dice qué pasó, por qué y que puede **pedir el cambio**.
- La ficha (maíz y frijol) muestra cada dato como "Editable una vez" / "Bloqueado" / "Cambio pendiente" y el botón "Pedir cambio". En el registro de frijol, los datos bloqueados aparecen deshabilitados con una explicación.

## 10.5 a 10.7 · Solicitudes, vencimiento y avisos
- **A quién llega** (siempre lo calcula el servidor): teléfono de productor con cuenta → administrador. Otros campos → técnico responsable del **otro** programa (`producer_programa.usuario_capturista_id`). Si no hay otro programa, no tiene técnico, está **inactivo** o **es la misma persona que pide** → administrador. Con varios programas distintos (a futuro) se toma el que se dio de alta primero. Nadie resuelve su propia solicitud.
- **Solo se puede pedir cambio de un dato que ya está bloqueado.** Si todavía se puede editar directo, el servidor lo dice y no crea la solicitud (evita rodear la regla).
- **Aprobar** es una transacción: bloquea la solicitud, aplica el cambio, escribe el renglón con quién pidió y quién aprobó, y deja el campo bloqueado. Un segundo toque o dos aprobaciones a la vez: la segunda recibe `YA_RESUELTA` y no hace nada.
- **Si el dato del productor cambió desde que se pidió:** el servidor responde `VALOR_CAMBIO` con el valor de entonces, el de ahora y el propuesto; la pantalla lo muestra y el botón pasa a "Aprobar de todos modos" (el aprobador confirma).
- **Rechazar** exige motivo; **cancelar** solo lo hace quien pidió, mientras esté pendiente.
- **Teléfono aprobado de un productor con cuenta** también actualiza el teléfono de su cuenta (`usuarios.telefono`), para que recupere su NIP con el número correcto.
- **Vencimiento a los 7 días:** tarea diaria a las **02:30 (hora de México)**, solo si `JOBS_ENABLED` no es `false`. Un solo `UPDATE` atómico más un candado de aplicación (`pg_try_advisory_lock`) evitan que dos instancias la procesen a la vez o duplique algo. Conserva a quién le tocaba (`asignado_original_id`). Las de teléfono nunca pasan por aquí (nacen con el administrador). La función `escalarVencidas(ahora)` acepta una fecha para simularla.
- **Avisos:** `utils/notificacion.ts` y las notificaciones push están hechas para cuentas de productores y bodegas; las cuentas de técnico no tienen suscripción push. **Elegí el aviso visible en el tablero** (maíz y frijol): una tarjeta que dice "N por resolver · M respuestas nuevas" y lleva a la bandeja. Al abrir "Mis solicitudes" las respuestas se dan por vistas. **Nunca se notifica al productor.**

## 10.8 · Pantallas
- **Técnico (maíz y frijol, mismo componente, cada programa con su encabezado):** ficha con el estado de cada dato; formulario "Pedir cambio" (campo, valor nuevo, motivo); "Solicitudes por resolver" (Aprobar / Rechazar con motivo) y "Mis solicitudes" (estado y motivo del rechazo). Botones grandes, textos que se ajustan sin cortarse.
- **Panel de administración:** nueva vista "Solicitudes de cambio" con permiso propio `solicitudes_cambio` (`ver`, `resolver`), filtros (estado, programa, técnico, escaladas, solo teléfono, "las que me tocan"), búsqueda por productor o CURP, y detalle con historial completo. Los administradores con permisos totales la ven siempre; el resto necesita que se les habilite en Permisos.

## 10.9 · Administradores
Como hoy **no existe** edición directa de datos personales por el administrador, no hay nada que conservar ni que cambiar. Lo que sí hace —resolver solicitudes— deja historial con su usuario. **Pregunta para Mariel si quiere agregar edición directa del administrador** (por defecto, el ticket dice que debería existir "como hoy", pero hoy no existe).

---

## Lo que podría romper / cuidados
- **Maíz:** `PATCH /tecnico/productor/:id` no tenía interfaz en el frontend, así que ningún flujo visible cambia; la ficha del productor del técnico ahora muestra la sección "Datos personales". El registro normal de maíz (alta nueva) no se toca.
- **Registrar frijol a un productor que ya existe** ya no sobrescribe sus datos a ciegas. Si el técnico escribe un valor distinto en un dato ya bloqueado, recibe un mensaje claro y debe dejar el valor actual.
- **Los datos personales no se escriben en logs** ni en los mensajes de error de las rutas nuevas (solo el texto del error, sin valores).
- **Autorización:** un técnico solo ve y resuelve las solicitudes que le tocan; para pedir cambios debe ser el técnico responsable del productor **en ese programa**; el panel y sus endpoints responden 403 sin el permiso.
