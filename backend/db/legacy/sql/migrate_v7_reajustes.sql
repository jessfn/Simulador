-- =============================================
-- Migración v7 — Reajustes según Reajustes.pdf
-- =============================================
-- - Punto 3: superficie declarada en UP
-- - Punto 6: seguimiento ligado a cycle_crop (cultivo)
-- - Punto 7: agregar 'helada' al catálogo de incidencias
-- =============================================

BEGIN;

-- =============================================
-- 1. UP: campos de superficie declarada (Punto 3)
-- =============================================
ALTER TABLE up ADD COLUMN IF NOT EXISTS coincide_superficie_calculada BOOLEAN;
ALTER TABLE up ADD COLUMN IF NOT EXISTS area_real_declarada_ha DOUBLE PRECISION;
ALTER TABLE up ADD COLUMN IF NOT EXISTS motivo_diferencia_superficie TEXT;

COMMENT ON COLUMN up.coincide_superficie_calculada IS 'Respuesta del productor: ¿la sup. calculada coincide con la real?';
COMMENT ON COLUMN up.area_real_declarada_ha IS 'Superficie real declarada por el productor cuando difiere de la calculada';
COMMENT ON COLUMN up.motivo_diferencia_superficie IS 'Motivo opcional de la diferencia entre superficie calculada y declarada';

-- =============================================
-- 2. Seguimiento ligado a cultivo (Punto 6)
--    Agregar cycle_crop_id (nullable inicialmente para retro-compatibilidad)
-- =============================================
ALTER TABLE seguimiento_visitas      ADD COLUMN IF NOT EXISTS cycle_crop_id BIGINT REFERENCES cycle_crop(cycle_crop_id);
ALTER TABLE seguimiento_incidencias  ADD COLUMN IF NOT EXISTS cycle_crop_id BIGINT REFERENCES cycle_crop(cycle_crop_id);
ALTER TABLE estimacion_cosecha       ADD COLUMN IF NOT EXISTS cycle_crop_id BIGINT REFERENCES cycle_crop(cycle_crop_id);
ALTER TABLE cosecha_real             ADD COLUMN IF NOT EXISTS cycle_crop_id BIGINT REFERENCES cycle_crop(cycle_crop_id);
ALTER TABLE alertas                  ADD COLUMN IF NOT EXISTS cycle_crop_id BIGINT REFERENCES cycle_crop(cycle_crop_id);

CREATE INDEX IF NOT EXISTS idx_seg_visitas_crop      ON seguimiento_visitas(cycle_crop_id);
CREATE INDEX IF NOT EXISTS idx_seg_incidencias_crop  ON seguimiento_incidencias(cycle_crop_id);
CREATE INDEX IF NOT EXISTS idx_estimacion_crop       ON estimacion_cosecha(cycle_crop_id);
CREATE INDEX IF NOT EXISTS idx_cosecha_crop          ON cosecha_real(cycle_crop_id);
CREATE INDEX IF NOT EXISTS idx_alertas_crop          ON alertas(cycle_crop_id);

-- =============================================
-- 3. Agregar 'helada' al catálogo de incidencias (Punto 7)
-- =============================================
ALTER TABLE seguimiento_incidencias DROP CONSTRAINT IF EXISTS chk_tipo_incidencia;
ALTER TABLE seguimiento_incidencias ADD CONSTRAINT chk_tipo_incidencia
  CHECK (tipo_incidencia IN ('sequia','lluvia_excesiva','plaga','enfermedad','viento','helada','granizo','otro'));

COMMIT;
