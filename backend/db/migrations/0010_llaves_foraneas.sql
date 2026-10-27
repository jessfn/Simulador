-- Up Migration
-- Llaves foráneas (relaciones) que faltaban. Antes solo había 49; muchas tablas apuntaban a otras sin que la base lo garantizara y quedaron
-- registros "huérfanos" (por ejemplo notificaciones de usuarios borrados). Esta migración agrega las relaciones con la acción de borrado adecuada:
--   CASCADE   = el registro no tiene sentido sin su padre (notificaciones, sesiones, seguimiento de una parcela borrada…)
--   SET NULL  = el registro se conserva y solo se pierde la referencia (quién lo capturó, el ciclo al que pertenecía…)
--   NO ACTION = el padre no se puede borrar mientras tenga hijos (el código ya borra primero a los hijos: bodegas, parcelas, ciclos…)
-- Si una relación ya tiene huérfanos (registros que apuntan a algo que ya no existe), la llave se agrega NOT VALID: protege todo lo nuevo y no toca lo viejo;
-- queda listada en llaves_foraneas_pendientes para limpiarla y validarla después. Las demás se agregan ya validadas. No se borra ningún dato.
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS llaves_foraneas_pendientes (
  id          BIGSERIAL PRIMARY KEY,
  tabla       VARCHAR(60) NOT NULL,
  columna     VARCHAR(60) NOT NULL,
  restriccion VARCHAR(80) NOT NULL,
  huerfanos   BIGINT NOT NULL,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restriccion)
);

CREATE FUNCTION pg_temp.agregar_fk(t text, c text, rt text, rc text, accion text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE nombre text := 'fk_' || t || '_' || c; huerfanos bigint; admite_nulo boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conname = nombre AND k.connamespace = to_regnamespace(current_schema())) THEN RETURN; END IF;
  IF length(nombre) > 63 THEN RAISE EXCEPTION 'Nombre demasiado largo: %', nombre; END IF;
  IF accion = 'SET NULL' THEN
    SELECT NOT a.attnotnull INTO admite_nulo FROM pg_attribute a WHERE a.attrelid = quote_ident(t)::regclass AND a.attname = c;
    IF NOT admite_nulo THEN RAISE EXCEPTION '%.% no admite nulos: no se puede usar SET NULL', t, c; END IF;
  END IF;
  EXECUTE format('SELECT COUNT(*) FROM %I x WHERE x.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I r WHERE r.%I = x.%I)', t, c, rt, rc, c) INTO huerfanos;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I (%I) ON DELETE %s%s', t, nombre, c, rt, rc, accion, CASE WHEN huerfanos > 0 THEN ' NOT VALID' ELSE '' END);
  IF huerfanos > 0 THEN
    INSERT INTO llaves_foraneas_pendientes (tabla, columna, restriccion, huerfanos) VALUES (t, c, nombre, huerfanos);
    RAISE NOTICE '% -> % NOT VALID (% huérfanos)', t || '.' || c, rt, huerfanos;
  END IF;
END $f$;

DO $llaves$
DECLARE r record; total int := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    -- usuarios (id)
    ('notificaciones','usuario_id','usuarios','id','CASCADE'),
    ('sesiones','usuario_id','usuarios','id','CASCADE'),
    ('tokens_revocados','usuario_id','usuarios','id','CASCADE'),
    ('productor_perfil','usuario_id','usuarios','id','CASCADE'),
    ('oferta_interes','usuario_id','usuarios','id','CASCADE'),
    ('bodeguero_bodegas','usuario_id','usuarios','id','CASCADE'),
    ('supervisor_productores','supervisor_id','usuarios','id','CASCADE'),
    ('ventanillas','usuario_id','usuarios','id','NO ACTION'),
    ('inventarios','usuario_id','usuarios','id','NO ACTION'),
    ('senales_compra','usuario_id','usuarios','id','NO ACTION'),
    ('senal_interesados','usuario_id','usuarios','id','SET NULL'),
    ('senasica_cargas','usuario_id','usuarios','id','SET NULL'),
    ('productor','usuario_id','usuarios','id','SET NULL'),
    ('productor','usuario_capturista_id','usuarios','id','SET NULL'),
    ('productor','tecnico_asignado_id','usuarios','id','SET NULL'),
    ('bodegas','creado_por','usuarios','id','SET NULL'),
    ('bodegas','aprobado_por','usuarios','id','SET NULL'),
    ('bodegas','semaforo_usuario_id','usuarios','id','SET NULL'),
    ('cosecha_real','usuario_captura','usuarios','id','SET NULL'),
    ('estimacion_cosecha','usuario_captura','usuarios','id','SET NULL'),
    ('precios','usuario_captura','usuarios','id','SET NULL'),
    ('seguimiento_incidencias','usuario_captura','usuarios','id','SET NULL'),
    ('seguimiento_visitas','usuario_captura','usuarios','id','SET NULL'),
    ('alertas','usuario_registro','usuarios','id','SET NULL'),
    ('transacciones','usuario_bodeguero','usuarios','id','NO ACTION'),
    ('cat_conceptos_servicio','propuesto_por','usuarios','id','SET NULL'),
    ('precio_parametros','actualizado_por','usuarios','id','SET NULL'),
    ('discrepancias','resuelto_por','usuarios','id','SET NULL'),
    -- productor (productor_id)
    ('alertas','productor_id','productor','productor_id','CASCADE'),
    ('cosecha_real','productor_id','productor','productor_id','CASCADE'),
    ('estimacion_cosecha','productor_id','productor','productor_id','CASCADE'),
    ('seguimiento_incidencias','productor_id','productor','productor_id','CASCADE'),
    ('seguimiento_visitas','productor_id','productor','productor_id','CASCADE'),
    ('solicitudes_apoyo','productor_id','productor','productor_id','CASCADE'),
    ('senal_interesados','productor_id','productor','productor_id','CASCADE'),
    ('supervisor_productores','productor_id','productor','productor_id','CASCADE'),
    ('precios','productor_id','productor','productor_id','SET NULL'),
    ('transacciones','productor_id','productor','productor_id','SET NULL'),
    ('up','productor_id','productor','productor_id','NO ACTION'),
    ('disponibilidad_productor','productor_id','productor','productor_id','NO ACTION'),
    -- up (up_id)
    ('alertas','up_id','up','up_id','CASCADE'),
    ('alertas_up','up_id','up','up_id','CASCADE'),
    ('cosecha_real','up_id','up','up_id','CASCADE'),
    ('estimacion_cosecha','up_id','up','up_id','CASCADE'),
    ('seguimiento_incidencias','up_id','up','up_id','CASCADE'),
    ('seguimiento_visitas','up_id','up','up_id','CASCADE'),
    ('precios','up_id','up','up_id','SET NULL'),
    ('ciclo','up_id','up','up_id','NO ACTION'),
    ('disponibilidad_productor','up_id','up','up_id','NO ACTION'),
    -- ciclo (ciclo_id)
    ('ciclo_cultivo','ciclo_id','ciclo','ciclo_id','NO ACTION'),
    ('alertas','ciclo_id','ciclo','ciclo_id','CASCADE'),
    ('cosecha_real','ciclo_id','ciclo','ciclo_id','CASCADE'),
    ('disponibilidad_productor','ciclo_id','ciclo','ciclo_id','SET NULL'),
    ('estimacion_cosecha','ciclo_id','ciclo','ciclo_id','CASCADE'),
    ('precios','ciclo_id','ciclo','ciclo_id','SET NULL'),
    ('seguimiento_incidencias','ciclo_id','ciclo','ciclo_id','CASCADE'),
    ('seguimiento_visitas','ciclo_id','ciclo','ciclo_id','CASCADE'),
    -- ciclo_cultivo (ciclo_cultivo_id)
    ('alertas','ciclo_cultivo_id','ciclo_cultivo','ciclo_cultivo_id','SET NULL'),
    ('cosecha_real','ciclo_cultivo_id','ciclo_cultivo','ciclo_cultivo_id','SET NULL'),
    ('estimacion_cosecha','ciclo_cultivo_id','ciclo_cultivo','ciclo_cultivo_id','SET NULL'),
    ('seguimiento_incidencias','ciclo_cultivo_id','ciclo_cultivo','ciclo_cultivo_id','SET NULL'),
    ('seguimiento_visitas','ciclo_cultivo_id','ciclo_cultivo','ciclo_cultivo_id','SET NULL'),
    -- bodegas (id): el código ya borra a los hijos primero
    ('bodeguero_bodegas','bodega_id','bodegas','id','NO ACTION'),
    ('infraestructura_contactos','bodega_id','bodegas','id','NO ACTION'),
    ('inventarios','bodega_id','bodegas','id','NO ACTION'),
    ('oferta_interes','bodega_id','bodegas','id','NO ACTION'),
    ('precios','bodega_id','bodegas','id','NO ACTION'),
    ('senales_compra','bodega_id','bodegas','id','NO ACTION'),
    ('tarifario_servicios','bodega_id','bodegas','id','NO ACTION'),
    ('transacciones','bodega_id','bodegas','id','NO ACTION'),
    ('ventanillas','bodega_id','bodegas','id','NO ACTION'),
    ('bodegas','region_id','regiones','id','NO ACTION'),
    ('tarifario_servicios','concepto_id','cat_conceptos_servicio','id','NO ACTION'),
    -- geografía
    ('geo_municipio','estado_id','geo_estado','estado_id','NO ACTION'),
    ('productor','estado_id','geo_estado','estado_id','NO ACTION'),
    ('productor_perfil','estado_id','geo_estado','estado_id','NO ACTION'),
    ('tecnico_zona','estado_id','geo_estado','estado_id','NO ACTION'),
    ('up','estado_id','geo_estado','estado_id','NO ACTION'),
    ('usuarios','estado_id','geo_estado','estado_id','NO ACTION'),
    ('productor','municipio_id','geo_municipio','municipio_id','NO ACTION'),
    ('productor_perfil','municipio_id','geo_municipio','municipio_id','NO ACTION'),
    ('tecnico_zona','municipio_id','geo_municipio','municipio_id','NO ACTION'),
    ('up','municipio_id','geo_municipio','municipio_id','NO ACTION'),
    ('usuarios','municipio_id','geo_municipio','municipio_id','NO ACTION'),
    ('encuesta_contexto_territorial','municipio_id','geo_municipio','municipio_id','NO ACTION'),
    -- ventanillas, alertas, señales
    ('apoyos_ventanilla','ventanilla_id','ventanillas','id','CASCADE'),
    ('solicitudes_apoyo','ventanilla_id','ventanillas','id','CASCADE'),
    ('solicitudes_apoyo','apoyo_id','apoyos_ventanilla','id','NO ACTION'),
    ('alertas_up','alerta_id','alertas_externas','id','CASCADE'),
    ('notificaciones','alerta_externa_id','alertas_externas','id','SET NULL'),
    ('notificaciones','alerta_id','alertas','id','SET NULL'),
    ('senal_interesados','senal_id','senales_compra','id','CASCADE'),
    ('senal_variedades','senal_id','senales_compra','id','CASCADE'),
    ('precios','visita_id','seguimiento_visitas','id','SET NULL')
  ) AS v(t, c, rt, rc, accion) LOOP
    PERFORM pg_temp.agregar_fk(r.t, r.c, r.rt, r.rc, r.accion);
    total := total + 1;
  END LOOP;
  RAISE NOTICE 'Llaves foráneas procesadas: %', total;
END
$llaves$;

-- Down Migration
-- Quita las llaves foráneas que agregó esta migración (todas se llaman fk_<tabla>_<columna>). No se pierde ningún dato.
DO $reversa$
DECLARE k record;
BEGIN
  FOR k IN SELECT c.conname, t.relname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
            WHERE c.contype = 'f' AND c.conname LIKE 'fk\_%' AND c.connamespace = to_regnamespace(current_schema()) LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', k.relname, k.conname);
  END LOOP;
END
$reversa$;
DROP TABLE IF EXISTS llaves_foraneas_pendientes;
