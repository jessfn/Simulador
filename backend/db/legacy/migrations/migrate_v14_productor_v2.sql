-- Migración v14: Producer V2 — correo, área polígono, ciclo completitud
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Campo correo en productor
ALTER TABLE producer
  ADD COLUMN IF NOT EXISTS correo TEXT;

-- 2. Columnas de polígono/área en UP
ALTER TABLE up
  ADD COLUMN IF NOT EXISTS area_ha_calc  NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS area_ha_real  NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS coincide_area BOOLEAN;

-- 3. Tabla ciclos productivos del productor (si no existe ya la usada por admin)
--    Reutilizamos la tabla `cycle` existente (up_id → producer_id via UP)
--    Solo agregamos columna para flujo de declaración del productor
ALTER TABLE cycle
  ADD COLUMN IF NOT EXISTS declarado_por_productor BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hectareas_sembradas      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fecha_siembra            DATE,
  ADD COLUMN IF NOT EXISTS variedad_nombre          TEXT;

-- 4. Índice en correo para búsqueda
CREATE INDEX IF NOT EXISTS idx_producer_correo ON producer(correo);

-- Confirmar
SELECT 'migrate_v14_productor_v2 OK' AS status;
