-- MED-10 (auditoría seguridad Fase 4, 2026-09-22): la validación de "ya
-- existe un ciclo activo para este año y tipo en esta UP" se hacía con
-- SELECT + INSERT en dos pasos separados — una condición de carrera (doble
-- tap del botón, dos requests casi simultáneos) podía crear dos ciclos
-- idénticos en la misma UP. Este índice único parcial lo impide a nivel BD.

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_ciclo_activo
  ON cycle (up_id, cycle_year, cycle_type)
  WHERE estado_ciclo = 'activo';
-- El índice parcial solo aplica a ciclos activos, permitiendo histórico
-- de ciclos del mismo año/tipo si se archivan correctamente.
