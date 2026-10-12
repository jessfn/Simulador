-- migrate_v12: Add titulo column to notificaciones if missing
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS titulo VARCHAR(255);

-- Backfill existing rows
UPDATE notificaciones SET titulo = 'Notificación del sistema' WHERE titulo IS NULL;
