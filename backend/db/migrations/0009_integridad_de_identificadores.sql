-- Up Migration
-- Integridad de identificadores: en producción había tablas SIN llave primaria y con identificadores repetidos (colisiones antiguas de las cargas
-- de abril a julio de 2026, cuando las secuencias quedaron por debajo de los ids ya usados). Esta migración:
--   1) corrige los identificadores repetidos (el registro más cercano a sus datos relacionados conserva el id; el otro recibe uno nuevo de la secuencia)
--      y reasigna sus registros hijos con el mismo criterio;
--   2) deja un rastro de cada cambio en correcciones_identificadores;
--   3) agrega la LLAVE PRIMARIA a todas las tablas que no la tenían (donde el id ya es único), para que no vuelva a pasar.
-- No borra ningún registro. Los registros con id repetido que no se puedan resolver sin ambigüedad se dejan igual y se avisan con NOTICE.
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS correcciones_identificadores (
  id            BIGSERIAL PRIMARY KEY,
  tabla         VARCHAR(60) NOT NULL,
  columna       VARCHAR(60) NOT NULL,
  id_anterior   BIGINT,
  id_nuevo      BIGINT,
  detalle       TEXT,
  corregido_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Renumera los registros repetidos de una tabla. El primero (por p_orden, luego por posición física) conserva el id.
-- p_hijos: [{"tabla":..,"columna":..,"fecha":..,"filtro":".."}] -> sus filas pasan al id nuevo si su fecha está más cerca del registro movido que del que conserva el id.
CREATE FUNCTION pg_temp.renumerar_duplicados(p_tabla text, p_id text, p_orden text, p_hijos jsonb DEFAULT '[]'::jsonb) RETURNS int LANGUAGE plpgsql AS $f$
DECLARE
  v_seq text; v_max bigint; v_ult bigint; v_nuevo bigint; v_fecha_conserva timestamptz; n int := 0; r record; h jsonb; v_movidos int;
BEGIN
  v_seq := pg_get_serial_sequence(quote_ident(p_tabla), p_id);
  IF v_seq IS NULL THEN RAISE EXCEPTION 'La columna %.% no tiene secuencia', p_tabla, p_id; END IF;
  EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', p_id, p_tabla) INTO v_max;
  EXECUTE format('SELECT last_value FROM %s', v_seq) INTO v_ult;
  PERFORM setval(v_seq, GREATEST(v_max, v_ult, 1));                       -- la secuencia nunca queda por debajo del máximo
  FOR r IN EXECUTE format(
      'SELECT fila, id_viejo, fecha FROM (SELECT ctid AS fila, %1$I AS id_viejo, %3$s AS fecha, row_number() OVER (PARTITION BY %1$I ORDER BY %3$s, ctid) AS pos FROM %2$I) t WHERE pos > 1 ORDER BY id_viejo, pos',
      p_id, p_tabla, p_orden) LOOP
    v_nuevo := nextval(v_seq);
    IF jsonb_array_length(p_hijos) > 0 THEN
      EXECUTE format('SELECT %3$s FROM (SELECT %3$s, row_number() OVER (PARTITION BY %1$I ORDER BY %3$s, ctid) AS pos, %1$I AS idv FROM %2$I) t WHERE idv = $1 AND pos = 1', p_id, p_tabla, p_orden) INTO v_fecha_conserva USING r.id_viejo;
    END IF;
    FOR h IN SELECT * FROM jsonb_array_elements(p_hijos) LOOP
      EXECUTE format('UPDATE %1$I SET %2$I = $1 WHERE %2$I = $2 %5$s AND abs(extract(epoch FROM (%3$I - $3))) < abs(extract(epoch FROM (%3$I - $4)))',
                     h->>'tabla', h->>'columna', h->>'fecha', NULL, COALESCE('AND ' || (h->>'filtro'), ''))
        USING v_nuevo, r.id_viejo, r.fecha, v_fecha_conserva;
      GET DIAGNOSTICS v_movidos = ROW_COUNT;
      IF v_movidos > 0 THEN INSERT INTO correcciones_identificadores (tabla, columna, id_anterior, id_nuevo, detalle) VALUES (h->>'tabla', h->>'columna', r.id_viejo, v_nuevo, v_movidos || ' registro(s) hijo(s) reasignado(s) al id nuevo de ' || p_tabla); END IF;
    END LOOP;
    EXECUTE format('UPDATE %I SET %I = $1 WHERE ctid = $2', p_tabla, p_id) USING v_nuevo, r.fila;
    INSERT INTO correcciones_identificadores (tabla, columna, id_anterior, id_nuevo, detalle) VALUES (p_tabla, p_id, r.id_viejo, v_nuevo, 'identificador repetido: el registro más reciente recibe id nuevo');
    n := n + 1;
  END LOOP;
  RETURN n;
END $f$;

DO $integridad$
DECLARE
  d record; keeper_up bigint; otro record; nuevo bigint; mov int; n_ciclos int := 0; t record; hijo text; llave text; total_pk int := 0; sin_pk text[] := '{}';
BEGIN
  -- ── 1) CICLO: ids repetidos entre parcelas distintas (colisión del 6 de julio de 2026) ──
  PERFORM setval('ciclo_ciclo_id_seq', GREATEST((SELECT MAX(ciclo_id) FROM ciclo), (SELECT last_value FROM ciclo_ciclo_id_seq)));
  FOR d IN SELECT ciclo_id FROM ciclo GROUP BY ciclo_id HAVING COUNT(*) > 1 LOOP
    -- conserva el id el ciclo cuya fecha de creación está más cerca de la de su cultivo (cada id tiene a lo más un cultivo); sin cultivo, el más antiguo
    SELECT c.up_id INTO keeper_up
      FROM ciclo c LEFT JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
     WHERE c.ciclo_id = d.ciclo_id
     ORDER BY COALESCE(abs(extract(epoch FROM (c.creado_en - cc.creado_en))), 0), c.creado_en, c.up_id LIMIT 1;
    FOR otro IN SELECT up_id, ctid AS fila FROM ciclo WHERE ciclo_id = d.ciclo_id AND up_id IS DISTINCT FROM keeper_up LOOP
      IF otro.up_id IS NOT DISTINCT FROM keeper_up THEN RAISE EXCEPTION 'Ciclo % repetido dentro de la misma parcela %: requiere revisión manual', d.ciclo_id, keeper_up; END IF;
      nuevo := nextval('ciclo_ciclo_id_seq');
      -- los registros que cuelgan del ciclo se distinguen por su parcela
      FOREACH hijo IN ARRAY ARRAY['alertas','cosecha_real','disponibilidad_productor','estimacion_cosecha','precios','seguimiento_incidencias','seguimiento_visitas'] LOOP
        EXECUTE format('UPDATE %I SET ciclo_id = $1 WHERE ciclo_id = $2 AND up_id = $3', hijo) USING nuevo, d.ciclo_id, otro.up_id;
        GET DIAGNOSTICS mov = ROW_COUNT;
        IF mov > 0 THEN INSERT INTO correcciones_identificadores (tabla, columna, id_anterior, id_nuevo, detalle) VALUES (hijo, 'ciclo_id', d.ciclo_id, nuevo, mov || ' registro(s) de la parcela ' || otro.up_id || ' reasignado(s)'); END IF;
      END LOOP;
      UPDATE ciclo SET ciclo_id = nuevo WHERE ctid = otro.fila;
      INSERT INTO correcciones_identificadores (tabla, columna, id_anterior, id_nuevo, detalle) VALUES ('ciclo', 'ciclo_id', d.ciclo_id, nuevo, 'ciclo de la parcela ' || otro.up_id || ' (el id lo conserva la parcela ' || keeper_up || ')');
      n_ciclos := n_ciclos + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Ciclos con identificador corregido: %', n_ciclos;

  -- ── 2) Tablas con ids repetidos y registros hijos que dependen del id ──
  PERFORM pg_temp.renumerar_duplicados('senales_compra', 'id', 'creado_en', jsonb_build_array(
    jsonb_build_object('tabla', 'senal_interesados', 'columna', 'senal_id', 'fecha', 'creado_en'),
    jsonb_build_object('tabla', 'senal_variedades', 'columna', 'senal_id', 'fecha', 'creado_en'),
    jsonb_build_object('tabla', 'notificaciones', 'columna', 'referencia_id', 'fecha', 'creado_en', 'filtro', 'referencia_tipo = ''senales_compra''')));
  PERFORM pg_temp.renumerar_duplicados('transacciones', 'id', 'creado_en', jsonb_build_array(
    jsonb_build_object('tabla', 'notificaciones', 'columna', 'referencia_id', 'fecha', 'creado_en', 'filtro', 'referencia_tipo = ''transacciones''')));

  -- ── 3) Tablas con ids repetidos que nadie referencia ──
  PERFORM pg_temp.renumerar_duplicados('precios', 'id', 'creado_en');
  PERFORM pg_temp.renumerar_duplicados('precio_referencias_externas', 'id', 'creado_en');
  PERFORM pg_temp.renumerar_duplicados('notificaciones', 'id', 'creado_en');
  PERFORM pg_temp.renumerar_duplicados('bodeguero_bodegas', 'id', 'fecha_solicitud');
  PERFORM pg_temp.renumerar_duplicados('cat_catalogo', 'id', 'id');
  PERFORM pg_temp.renumerar_duplicados('cat_programas_gobierno', 'id', 'id');
  PERFORM pg_temp.renumerar_duplicados('inventarios', 'id', 'id');
  PERFORM pg_temp.renumerar_duplicados('tarifario_servicios', 'id', 'id');

  -- ── 4) Llave primaria donde falte ──
  ALTER TABLE ciclo ADD CONSTRAINT ciclo_pkey PRIMARY KEY (ciclo_id);
  total_pk := total_pk + 1;
  FOR t IN SELECT c.relname FROM pg_class c
            WHERE c.relnamespace = to_regnamespace(current_schema()) AND c.relkind = 'r' AND c.relname <> ALL(ARRAY['spatial_ref_sys', 'pgmigrations', 'correcciones_identificadores'])
              AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')
              AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped)
            ORDER BY c.relname LOOP
    EXECUTE format('SELECT COUNT(*) = COUNT(DISTINCT id) AND COUNT(*) = COUNT(id) FROM %I', t.relname) INTO STRICT llave;
    IF llave = 'true' THEN EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY (id)', t.relname, t.relname || '_pkey'); total_pk := total_pk + 1;
    ELSE sin_pk := sin_pk || t.relname::text; END IF;
  END LOOP;
  ALTER TABLE alertas_up ADD CONSTRAINT alertas_up_pkey PRIMARY KEY (alerta_id, up_id);
  ALTER TABLE productor_perfil ADD CONSTRAINT productor_perfil_pkey PRIMARY KEY (usuario_id);
  ALTER TABLE geo_estado ADD CONSTRAINT geo_estado_pkey PRIMARY KEY (estado_id);
  total_pk := total_pk + 3;
  IF array_length(sin_pk, 1) > 0 THEN RAISE EXCEPTION 'Quedaron tablas con id repetido sin resolver: %', sin_pk; END IF;
  RAISE NOTICE 'Llaves primarias agregadas: %', total_pk;
END
$integridad$;

-- Down Migration
-- Quita las llaves primarias que agregó esta migración. Los identificadores corregidos NO se revierten (es una corrección de datos; ver correcciones_identificadores).
ALTER TABLE IF EXISTS ciclo DROP CONSTRAINT IF EXISTS ciclo_pkey;
DO $reversa$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname, k.conname FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
            WHERE k.contype = 'p' AND k.conname = c.relname || '_pkey' AND c.relnamespace = to_regnamespace(current_schema())
              AND c.relname = ANY(ARRAY['alertas','alertas_up','apoyos_ventanilla','bodeguero_bodegas','cat_catalogo','cat_conceptos_servicio','cat_programas_gobierno','cat_variedad_cultivo','cosecha_real','costos_fira','discrepancias','estimacion_cosecha','geo_estado','infraestructura_contactos','inventarios','notificaciones','oferta_interes','precio_parametros','precio_referencias_externas','precios','precios_maiz','productor_perfil','regiones','seguimiento_incidencias','seguimiento_visitas','senal_interesados','senal_variedades','senales_compra','senasica_cargas','senasica_parametros','sesiones','solicitudes_apoyo','supervisor_productores','tarifario_servicios','transacciones','ventanillas']) LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t.relname, t.conname);
  END LOOP;
END
$reversa$;
DROP TABLE IF EXISTS correcciones_identificadores;
