-- v29: Aviso de privacidad para usuarios bodegueros/industria
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS aviso_privacidad_aceptado  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aviso_privacidad_fecha     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aviso_privacidad_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS aviso_privacidad_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS aviso_privacidad_version   VARCHAR(20),
  ADD COLUMN IF NOT EXISTS aviso_privacidad_foto_url  TEXT;
