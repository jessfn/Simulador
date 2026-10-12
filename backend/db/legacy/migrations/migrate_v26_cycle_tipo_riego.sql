-- Migración v26 — Tipo de riego en el ciclo productivo
-- 'temporal' (depende de la lluvia) o 'riego' (agua controlada).
ALTER TABLE cycle
  ADD COLUMN IF NOT EXISTS tipo_riego VARCHAR(20)
  CHECK (tipo_riego IN ('temporal', 'riego'))
  DEFAULT 'temporal';

COMMENT ON COLUMN cycle.tipo_riego IS
  'Régimen de riego del ciclo: temporal (lluvia) o riego (agua controlada)';
