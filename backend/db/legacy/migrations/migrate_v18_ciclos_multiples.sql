-- migrate_v18_ciclos_multiples.sql
-- Soporte para múltiples ciclos productivos por UP con historial

-- Estado del ciclo
ALTER TABLE cycle 
  ADD COLUMN IF NOT EXISTS estado_ciclo VARCHAR(20) DEFAULT 'activo';
  -- valores: 'activo' | 'cosechado' | 'cancelado'

-- Datos de cosecha real (declarada por el productor)
ALTER TABLE cycle
  ADD COLUMN IF NOT EXISTS fecha_cosecha_real DATE,
  ADD COLUMN IF NOT EXISTS produccion_real_ton NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS observaciones_cosecha TEXT;

-- Índice para queries frecuentes del Admin y del productor
CREATE INDEX IF NOT EXISTS idx_cycle_up_estado 
  ON cycle(up_id, cycle_type, cycle_year, estado_ciclo);

-- Actualizar ciclos existentes — todos pasan a 'activo'
UPDATE cycle SET estado_ciclo = 'activo' WHERE estado_ciclo IS NULL;
