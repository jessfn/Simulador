-- migrate_v28_aviso_foto.sql
-- Agrega columna para la foto de verificación biométrica del titular
-- Ejecutar como superusuario (postgres) o dueño de la tabla

ALTER TABLE producer
  ADD COLUMN IF NOT EXISTS aviso_privacidad_foto_url TEXT;
