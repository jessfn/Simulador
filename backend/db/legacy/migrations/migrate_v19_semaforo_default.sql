-- Migración v19 — Semáforo de bodegas: estado inicial 'sin_actividad'
-- Plan Nacional Maíz 2026 · Correcciones Finales — Lanzamiento
--
-- Contexto:
--   La columna bodegas.semaforo_compra fue creada en migrate_v8 con
--   DEFAULT 'verde' y CHECK (semaforo_compra IN ('verde','amarillo','rojo')).
--   Eso provocaba que TODA bodega nueva apareciera ante el productor como
--   "comprando" (verde) aunque jamás hubiera indicado su estado.
--
--   Esta migración:
--     1. Amplía el CHECK para admitir el nuevo valor neutro 'sin_actividad'.
--     2. Cambia el DEFAULT a 'sin_actividad'.
--     3. Marca como 'sin_actividad' SOLO las bodegas que nunca configuraron
--        su semáforo (semaforo_updated_at IS NULL). Las bodegas que sí lo
--        configuraron conservan su color real.
--
-- IMPORTANTE: esta migración es REQUISITO del despliegue. El backend nuevo
-- deriva estado_compra a partir de semaforo_compra; sin esta migración las
-- bodegas no configuradas seguirían en 'verde'/'comprando'.

BEGIN;

-- 1. Ampliar la columna: 'sin_actividad' (13 chars) no cabe en VARCHAR(10)
ALTER TABLE bodegas DROP CONSTRAINT IF EXISTS bodegas_semaforo_compra_check;
ALTER TABLE bodegas
  ALTER COLUMN semaforo_compra TYPE VARCHAR(20);

-- 2. Reemplazar el CHECK para incluir 'sin_actividad'
ALTER TABLE bodegas
  ADD CONSTRAINT bodegas_semaforo_compra_check
  CHECK (semaforo_compra IN ('sin_actividad','verde','amarillo','rojo'));

-- 3. Cambiar el DEFAULT a 'sin_actividad'
ALTER TABLE bodegas
  ALTER COLUMN semaforo_compra SET DEFAULT 'sin_actividad';

-- 4. Normalizar bodegas que nunca configuraron su semáforo
UPDATE bodegas
   SET semaforo_compra = 'sin_actividad'
 WHERE semaforo_updated_at IS NULL
   AND (semaforo_compra IS NULL OR semaforo_compra = 'verde');

COMMIT;

-- Verificación:
--   SELECT semaforo_compra, COUNT(*) FROM bodegas GROUP BY semaforo_compra;
--   -- Las bodegas sin configurar deben quedar en 'sin_actividad'.
