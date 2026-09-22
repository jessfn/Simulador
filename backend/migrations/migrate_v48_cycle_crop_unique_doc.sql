-- MED-11 (auditoría seguridad Fase 4, 2026-09-22): el INSERT de cultivos usa
-- ON CONFLICT (cycle_id), que asume un índice UNIQUE en cycle_crop.cycle_id.
-- Ese índice ya existe en producción (cycle_crop_cycle_unique) pero no
-- aparecía en ninguna migración versionada — esta migración solo lo
-- formaliza en el historial para que ambientes nuevos lo incluyan.

CREATE UNIQUE INDEX IF NOT EXISTS cycle_crop_cycle_unique ON cycle_crop(cycle_id);
