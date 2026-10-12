-- Migración v24 — Índice de ciclo_id en disponibilidad
-- Optimiza consultas de disponibilidad por ciclo productivo
-- (el campo ciclo_id ya fue creado en v22)
CREATE INDEX IF NOT EXISTS idx_disp_productor_ciclo
  ON disponibilidad_productor(ciclo_id)
  WHERE ciclo_id IS NOT NULL;
