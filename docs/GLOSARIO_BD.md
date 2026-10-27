# Glosario de la base de datos — nombres en español

Desde la migración `0008_homologar_nombres_espanol` **toda la base de datos usa nombres en español**. Esta es la regla permanente:

- Tablas, columnas, restricciones, índices, secuencias, disparadores y funciones se nombran en **español**, en `snake_case`.
- Se conservan los **acrónimos oficiales** del programa: **UP** (Unidad de Producción), CURP, DDR, CADER, SADER, FIRA, INEGI (por ejemplo `up`, `up_id`, `numero_up`, `alertas_up`).
- Se conservan los objetos de sistema (`spatial_ref_sys`, `pgmigrations`, esquema `topology`) y los **valores guardados** (códigos de catálogo, `PV`/`OI`, estados, roles).
- Prefijos técnicos universales `idx_`, `uq_`, `chk_` y sufijos de PostgreSQL (`_pkey`, `_fkey`, `_key`, `_seq`) se mantienen.
- **Lo nuevo se crea ya en español.**

## Contrato de la API (claves JSON)

La base está en español, pero **las claves JSON que consume el frontend no cambian** (por ejemplo `producer_id`, `created_at`, `up_name`): la capa `backend/src/config/compatibilidadApi.ts` traduce cada columna del resultado a su clave histórica. Si una consulta pone un alias explícito (`AS algo`) manda el alias. Plan: retirar esa capa cuando el frontend migre a las claves en español.

## Tablas renombradas

| Antes | Ahora |
|---|---|
| `producer` | `productor` |
| `producer_cambios` | `productor_cambios` |
| `producer_profile` | `productor_perfil` |
| `producer_programa` | `productor_programa` |
| `cycle` | `ciclo` |
| `cycle_crop` | `ciclo_cultivo` |
| `geo_state` | `geo_estado` |
| `geo_municipality` | `geo_municipio` |
| `cat_catalog` | `cat_catalogo` |
| `cat_crop_variety` | `cat_variedad_cultivo` |
| `revoked_tokens` | `tokens_revocados` |

## Columnas renombradas (mismo nombre viejo → mismo nombre nuevo en todas las tablas)

| Antes | Ahora | Tablas |
|---|---|---|
| `producer_id` | `productor_id` | `alertas`, `cosecha_real`, `disponibilidad_productor`, `encuesta_respuestas`, `estimacion_cosecha`, `frijol_productor`, `precios`, `productor`, `productor_cambios`, `productor_programa`, `propuestas_negociacion`, `seguimiento_incidencias`, `seguimiento_visitas`, `senal_interesados`, `solicitud_cambio`, `solicitudes_apoyo`, `supervisor_productores`, `transacciones`, `up` |
| `posible_traslape_producer_id` | `posible_traslape_productor_id` | `up` |
| `state_id` | `estado_id` | `geo_municipio`, `geo_estado`, `productor`, `productor_perfil`, `tecnico_zona`, `up`, `usuarios` |
| `municipality_id` | `municipio_id` | `encuesta_contexto_territorial`, `geo_municipio`, `productor`, `productor_perfil`, `tecnico_zona`, `up`, `usuarios` |
| `cycle_id` | `ciclo_id` | `ciclo`, `ciclo_cultivo` |
| `cycle_crop_id` | `ciclo_cultivo_id` | `alertas`, `cosecha_real`, `ciclo_cultivo`, `estimacion_cosecha`, `frijol_cultivo`, `seguimiento_incidencias`, `seguimiento_visitas` |
| `user_id` | `usuario_id` | `productor_perfil` |
| `created_at` | `creado_en` | `alertas`, `apoyos_ventanilla`, `chat_conversaciones`, `chat_mensajes`, `cosecha_real`, `ciclo`, `ciclo_cultivo`, `disponibilidad_productor`, `encuesta_ediciones`, `encuesta_lineas`, `encuesta_productos`, `encuesta_respuestas`, `estimacion_cosecha`, `filtros_guardados_bodega`, `frijol_cultivo`, `frijol_exportaciones`, `frijol_productor`, `frijol_semillas`, `infraestructura_contactos`, `notificaciones`, `oferta_interes`, `ofertas_bodega`, `precio_referencias_externas`, `precios`, `productor`, `productor_cambios`, `productor_perfil`, `propuestas_negociacion`, `registro_idempotencia`, `seguimiento_incidencias`, `seguimiento_visitas`, `senal_interesados`, `senal_variedades`, `senales_compra`, `senasica_cargas`, `sesiones`, `solicitud_cambio`, `solicitudes_apoyo`, `transacciones`, `up`, `usuarios`, `ventanillas` |
| `creado_at` | `creado_en` | `discrepancias` |
| `updated_at` | `actualizado_en` | `alertas`, `costos_fira`, `disponibilidad_productor`, `encuesta_respuestas`, `estimacion_cosecha`, `frijol_cultivo`, `frijol_productor`, `frijol_semillas`, `productor_programa`, `senasica_parametros`, `solicitudes_apoyo`, `tarifario_servicios`, `transacciones`, `up`, `usuarios` |
| `actualizado_at` | `actualizado_en` | `precio_parametros` |
| `resuelto_at` | `resuelto_en` | `discrepancias`, `solicitud_cambio` |
| `escalada_at` | `escalada_en` | `solicitud_cambio` |
| `vence_at` | `vence_en` | `solicitud_cambio` |
| `ultimo_mensaje_at` | `ultimo_mensaje_en` | `chat_conversaciones` |
| `semaforo_updated_at` | `semaforo_actualizado_en` | `bodegas` |
| `expires_at` | `expira_en` | `sesiones` |
| `name` | `nombre` | `geo_municipio`, `geo_estado` |
| `label` | `etiqueta` | `cat_catalogo`, `cat_variedad_cultivo` |
| `code` | `codigo` | `cat_catalogo`, `cat_variedad_cultivo` |
| `catalog` | `catalogo` | `cat_catalogo` |
| `crop` | `cultivo` | `cat_variedad_cultivo`, `ciclo`, `ciclo_cultivo` |
| `sort_order` | `orden` | `cat_catalogo`, `cat_variedad_cultivo` |
| `is_active` | `activo` | `cat_catalogo`, `cat_variedad_cultivo` |
| `phone` | `telefono` | `productor` |
| `locality` | `localidad` | `productor_perfil` |
| `lat` | `latitud` | `chat_mensajes` |
| `lng` | `longitud` | `chat_mensajes` |
| `aviso_privacidad_lat` | `aviso_privacidad_latitud` | `productor`, `usuarios` |
| `aviso_privacidad_lng` | `aviso_privacidad_longitud` | `productor`, `usuarios` |
| `email` | `correo_electronico` | `usuarios` |
| `privacy_consent` | `consentimiento_privacidad` | `productor` |
| `user_agent` | `agente_usuario` | `sesiones` |
| `ip_address` | `direccion_ip` | `sesiones` |
| `token_hash` | `hash_token` | `sesiones` |
| `password_hash` | `hash_contrasena` | `usuarios` |
| `reset_token` | `token_recuperacion` | `usuarios` |
| `reset_token_expires` | `token_recuperacion_expira_en` | `usuarios` |
| `reset_pin_forced` | `recuperacion_nip_forzada` | `usuarios` |
| `debe_cambiar_pass` | `debe_cambiar_contrasena` | `usuarios` |
| `jti` | `id_jwt` | `tokens_revocados` |
| `sesion_activa_jti` | `sesion_activa_id_jwt` | `usuarios` |
| `push_endpoint` | `push_url` | `usuarios` |
| `push_p256dh` | `push_llave_p256dh` | `usuarios` |
| `push_auth` | `push_llave_auth` | `usuarios` |
| `water_regime` | `regimen_hidrico` | `up` |
| `variety_id` | `variedad_id` | `ciclo_cultivo` |
| `variety_other` | `variedad_otra` | `ciclo_cultivo` |
| `variedad_code` | `variedad_codigo` | `disponibilidad_productor`, `inventarios`, `precios`, `senal_variedades`, `senales_compra`, `transacciones` |
| `planting_date` | `fecha_siembra` | `ciclo_cultivo` |
| `estimated_harvest_date` | `fecha_cosecha_estimada` | `ciclo_cultivo` |
| `yield_expected` | `rendimiento_esperado` | `ciclo_cultivo` |
| `destination` | `destino` | `ciclo_cultivo` |
| `production_qty` | `cantidad_producida` | `ciclo_cultivo` |
| `production_unit` | `unidad_medida_produccion` | `ciclo_cultivo` |
| `production_system` | `sistema_produccion` | `up` |
| `cycle_year` | `anio_ciclo` | `ciclo` |
| `cycle_type` | `tipo_ciclo` | `ciclo` |
| `area_sown_ha` | `superficie_sembrada_ha` | `ciclo_cultivo` |
| `area_harvested_ha` | `superficie_cosechada_ha` | `ciclo_cultivo` |
| `area_ha_real` | `superficie_ha_real` | `up` |
| `area_ha_calc` | `superficie_ha_calculada` | `up` |
| `area_real_declarada_ha` | `superficie_real_declarada_ha` | `up` |
| `coincide_area` | `coincide_superficie` | `up` |
| `state_name` | `nombre_estado` | `up` |
| `municipality_name` | `nombre_municipio` | `encuesta_contexto_territorial`, `up` |
| `up_name` | `nombre_up` | `up` |
| `up_type` | `tipo_up` | `up` |
| `location_confirmed` | `ubicacion_confirmada` | `up` |
| `location_correction_reason` | `motivo_correccion_ubicacion` | `up` |
| `centroid` | `centroide` | `municipios_referencia`, `up` |
| `centroid_source` | `origen_centroide` | `up` |
| `geom` | `geometria` | `up` |
| `min_txns` | `min_transacciones` | `precio_parametros` |

## Funciones y disparadores

| Antes | Ahora |
|---|---|
| `actualizar_updated_at()` | `actualizar_actualizado_en()` |
| `update_up_timestamp()` | `actualizar_marca_tiempo_up()` |
| `update_updated_at_column()` | `actualizar_columna_actualizado_en()` |
| `trigger_up_updated` (disparador) | `disparador_up_actualizado` |

Se renombraron además 31 restricciones, 21 índices y 7 secuencias (lista exacta en la migración).

## Cómo se hizo y cómo se revierte

- Migración **generada** por `backend/db/homologacion/generar-migracion.js` desde `mapa.js` (única fuente). Solo cambia nombres; no toca datos. Se ensayó en una copia desechable del esquema de producción (subida, bajada y subida otra vez, idéntica).
- El código SQL del backend se convirtió con `convertir-consultas.js` (solo texto SQL; no variables ni claves JSON) y se validó consulta por consulta con `PREPARE` y comparando, para cada consulta, los nombres de columna que devuelve el código viejo contra el nuevo (0 diferencias).
- **Reversa:** `npm run migrate:down` (restaura todos los nombres) y volver al commit anterior.

## Integridad de identificadores (migración 0009)

Antes de esta migración, 36 tablas no tenían llave primaria y 11 tenían identificadores repetidos (colisiones antiguas de las cargas de abril a julio de 2026). La migración `0009_integridad_de_identificadores`:
- corrigió los ids repetidos (21 ciclos y 8 tablas más; el registro más cercano a sus datos relacionados conserva el id y el otro recibe uno nuevo de la secuencia) y reasignó sus registros hijos con el mismo criterio;
- dejó el rastro de cada cambio en la tabla `correcciones_identificadores` (219 renglones);
- agregó la llave primaria a todas las tablas que no la tenían.
No se borró ningún registro. Respaldo previo: `~/respaldos/simac-pre-integridad-2026-10-27-1335.dump`; etiqueta `prod-2026-10-27-antes-integridad`. La bajada solo quita las llaves; los ids corregidos no se revierten (es una corrección de datos).
