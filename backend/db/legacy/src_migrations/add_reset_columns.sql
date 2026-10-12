-- Migración: columnas de recuperación de credenciales
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_pin_forced BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_usuarios_reset_token ON usuarios(reset_token) WHERE reset_token IS NOT NULL;
