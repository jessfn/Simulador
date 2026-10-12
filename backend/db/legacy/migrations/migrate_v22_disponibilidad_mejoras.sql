-- Migración v22 — Mejoras en disponibilidad_productor
-- Agrega variedad_libre para cuando se selecciona "Otra"
-- Agrega ciclo_id para vincular disponibilidad al ciclo productivo
ALTER TABLE disponibilidad_productor
  ADD COLUMN IF NOT EXISTS variedad_libre TEXT,
  ADD COLUMN IF NOT EXISTS ciclo_id BIGINT
    REFERENCES cycle(cycle_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_disp_ciclo
  ON disponibilidad_productor(ciclo_id);

COMMENT ON COLUMN disponibilidad_productor.variedad_libre IS
  'Texto libre cuando el productor selecciona variedad Otra';
COMMENT ON COLUMN disponibilidad_productor.ciclo_id IS
  'Ciclo productivo del que proviene el maíz ofertado';
