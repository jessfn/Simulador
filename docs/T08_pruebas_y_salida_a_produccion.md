# T08 · Pruebas integrales y salida a producción (Frijol)

Estado al **15 de octubre de 2026**, en el ambiente de pruebas (`simacqa`, rama `staging`). Producción **no se ha tocado**.

## 1. Resultado de las pruebas automáticas

| Prueba | Qué cubre | Resultado |
|---|---|---|
| T02 programas | Un técnico ve solo lo de su programa; maíz sigue igual | 16 / 16 |
| T03 ciclos por cultivo | Un ciclo por cultivo; frijol y maíz conviven en la misma parcela; borrados bloqueados | 12 / 12 |
| T04 alta de técnicos | Alta, edición y reglas de borrado; pantallas del admin | 37 / 37 y 19 / 19 en pantalla |
| T05 backend de frijol | Registro, consulta de CURP, idempotencia, verificación, correcciones, acuse | 98 / 98 y 9 / 9 |
| T06 en pantalla (celular 390 px) | Asistente de 7 pasos, mapa, borrador, sin señal, doble toque, mis registros, corrección, acuse en PDF | 39 / 39 (dos corridas seguidas) |
| T07 panel admin | Resumen, filtros, tabla, mapa, ficha, Excel, bitácora, permisos | 34 / 34 y 20 / 20 en pantalla |
| T08 casos 8, 11 y 8.1 | Traslape, activación por sí mismo, maíz sin cambios | 23 / 23 y 5 / 5 en pantalla |

Las pruebas viven en el repositorio, en `backend/tests/`, y se corren con `npm test` desde `backend/` (pantalla: `npm run test:ui`). Usan datos ficticios y variables de entorno; ver `backend/tests/README.md`. La comparación de cifras de maíz es `npm run test:maiz:capturar` / `test:maiz:comparar`.

## 2. 8.1 · "Maíz no cambió"

Se compararon las cifras del panel de administración de maíz (15 consultas y la exportación de la base) antes y después de agregar frijol.

- Al momento de la comparación se habían creado, desde la captura anterior, **40 productores de frijol** (38 de solo frijol, con 40 parcelas). **Ninguno aparece en el panel de maíz.**
- Lo único que cambió en maíz fueron **2 productores de maíz y 4 parcelas** que las propias pruebas crearon (y 1 ciclo de maíz). Las diferencias coinciden una a una con esos registros.
- Ciclos de frijol no entran en las vistas de maíz: el ciclo de maíz de un productor que llegó por frijol aparece vacío.
- Verificado además: un productor de maíz entra con CURP + NIP, ve su parcela, registra un ciclo nuevo de maíz y el mismo ciclo dos veces se rechaza (409); un técnico de maíz registra un productor nuevo de principio a fin.

Pendiente de repetir con la copia **reciente** de producción justo antes de la salida: bodeguero (precio y oferta) y OREF (su estado). Esas pantallas no se tocaron en ningún ticket; se revisan a mano en la verificación inmediata (sección 5, paso 7).

## 3. 8.2 · Casos de frijol

| # | Caso | Resultado | Evidencia |
|---|---|---|---|
| 1 | Productor nuevo de RENAPO, parcela nueva | Registro enviado, sin cuenta ni NIP | T05 y T06 |
| 2 | Productor del padrón SADER | Datos prellenados | T05 |
| 3 | Productor con cuenta de maíz, misma parcela | Frijol registrado; su maíz no cambia | T05 |
| 4 | Misma persona, segunda parcela | Queda como parcela 2 de N | T05 y T06 |
| 5 | Registrado en frijol por otro técnico | Bloqueado con mensaje | T05 |
| 6 | SADER/RENAPO apagados | Guardado como pendiente; se verifica solo al volver | T05 |
| 7 | CURP inválida en reverificación | "Requiere corrección"; el técnico corrige | T05 |
| 8 | Polígono que se traslapa más del 10 % con otro productor | Rechazado con mensaje; el mapa lo avisa y no deja usarlo. Traslape de 3 % sí se acepta | T08 (API y pantalla) |
| 9 | Cerrar la app a mitad del registro | Se recupera el borrador, con los puntos del mapa | T06 |
| 10 | Modo avión al enviar + reintento | Se envía una sola vez | T06 |
| 11 | Productor que llegó por frijol se registra después en maíz (técnico y por sí mismo) | Funciona sin bloqueo | T05 (técnico) y T08 (por sí mismo) |
| 12 | Admin intenta borrar productor o parcela con frijol | 409 con mensaje | T03 |
| 13 | Exportación Excel de frijol | Todas las columnas de la ficha | T07 (56 columnas, hoja Diccionario) |

### Defecto encontrado y corregido durante T08

La validación de traslape (`backend/src/utils/ups.ts`) usa `ST_Overlaps`, que da falso cuando el polígono nuevo es **idéntico** a uno existente o lo **contiene por completo**. Un segundo productor podía registrar exactamente la parcela de otro. Frijol ahora usa un modo estricto (`ST_Intersects`).
**Maíz conserva el comportamiento anterior** porque este ticket exige que maíz no cambie; el mismo hueco sigue existiendo en maíz. Se recomienda decidir aparte si se endurece también (es una sola línea: pasar `traslapeEstricto: true` desde `tecnico.ts` y `productor.ts`).

## 4. 8.3 y 8.4 · Aceptación y piloto (pendientes, los hace una persona)

**Aceptación de Mariel (8.3).** Recorrido en teléfono con la ficha de Alimentación para el Bienestar al lado. Para cada campo de la ficha, marcar: existe · opciones correctas · regla correcta. Los campos están en los pasos 1 a 7 del asistente y en las 56 columnas del Excel (hoja "Diccionario" explica cada una). Firma en el PR.

**Piloto (8.4).** 2 o 3 técnicos reales, en el ambiente de pruebas, 2 a 3 días, en zonas con señal mala. Anotar por registro: minutos que tardó, errores, dudas, problemas de GPS y si hubo desconexión (el sistema ya guarda `hubo_desconexion` y `capturado_en`). Reporte breve con los ajustes aplicados antes de producción.

Recomendación para el piloto: dar a cada técnico un correo y contraseña de prueba propios y pedir que registren productores **ficticios** (la base de pruebas es una copia de producción con datos personales reales).

## 5. 8.5 · Salida a producción

Solo después de la aprobación explícita de Mariel y de los resultados del piloto. Seguir `DEPLOY.md`.

1. Avisar a Mariel con fecha y hora, fuera del horario de mayor uso.
2. **Snapshot manual de RDS:** `simac-pre-frijol-deploy-AAAA-MM-DD`. Confirmar que los respaldos automáticos están activos (según el informe del 8 de octubre, el respaldo nativo de RDS estaba en 0 días y los diarios los hace AWS Backup con retención de 3 a 5 días; volver a confirmarlo).
3. Etiqueta de la versión actual: `git tag prod-AAAA-MM-DD-antes-frijol && git push --tags`.
4. Integrar a `main` desde `staging` (ya contiene T00 a T07).
5. En el servidor, `npm run migrate:fake-base` **una sola vez** (producción ya tiene la estructura base) y después `npm run migrate:up`. Deben aplicarse **0001 a 0005** sin errores. `npm run migrate:status` antes, para ver qué se aplicará.
6. Variables de entorno en producción: `IDENTIDAD_SIMULADA` **ausente** (el simulador de identidad se ignora en producción por código, pero no debe estar), `JOBS_ENABLED` activo (la tarea que reverifica identidades pendientes), llaves reales de SADER y RENAPO, `NODE_ENV=production`.
7. Desplegar: `bash deploy/deploy.sh produccion`.
8. **Verificación inmediata (15 min):** cifras del tablero de administración iguales a las de antes; un acceso de productor; un acceso de técnico de maíz; un registro de frijol de prueba (después se elimina con un script documentado). Revisar el panel "Frijol" del admin.
9. Etiqueta `prod-AAAA-MM-DD-frijol`.

### Plan de regreso

- Falla de código sin daño a datos: desplegar la etiqueta anterior.
- Falla en migración o datos: `npm run migrate:down` hasta 0000; si no basta, restaurar el snapshot del paso 2 **como base nueva** y apuntar el backend a ella. Documentar lo ocurrido.

## 6. Hallazgos de datos para atender aparte (no bloquean la salida)

- La tabla `cycle` no tiene llave primaria y hay 21 `cycle_id` repetidos.
- El `cycle_id` 11 es un ciclo de frijol cancelado que sale de las vistas de maíz.
- Varias tablas de catálogo no tenían unicidad (T01 la agregó donde hizo falta).
- `usuarios` no tiene unicidad en correo ni CURP.
- Del lado del equipo: el snapshot de RDS, la protección de ramas en GitHub y el `fake-base` en producción siguen pendientes.
- La base del ambiente de pruebas es una copia con datos personales reales: avisar a Blanca.
- Los servicios SADER y RENAPO no están configurados en pruebas (identidad simulada, solo pruebas).
