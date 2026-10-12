-- Migración V33: Trazabilidad de edición de estado/municipio en UP
ALTER TABLE up
  ADD COLUMN IF NOT EXISTS domicilio_actualizado_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS domicilio_actualizado_por VARCHAR(20) DEFAULT 'productor';
