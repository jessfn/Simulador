-- Migración V27: Aviso de privacidad del productor
-- Agrega campos de aceptación legal a la tabla producer

ALTER TABLE producer
  ADD COLUMN IF NOT EXISTS aviso_privacidad_aceptado   BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aviso_privacidad_fecha       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aviso_privacidad_lat         DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS aviso_privacidad_lng         DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS aviso_privacidad_version     VARCHAR(20) DEFAULT '1.0';

COMMENT ON COLUMN producer.aviso_privacidad_aceptado IS 'TRUE cuando el productor aceptó el aviso de privacidad';
COMMENT ON COLUMN producer.aviso_privacidad_fecha     IS 'Timestamp exacto de la aceptación (con zona horaria)';
COMMENT ON COLUMN producer.aviso_privacidad_lat       IS 'Latitud del dispositivo al momento de aceptar';
COMMENT ON COLUMN producer.aviso_privacidad_lng       IS 'Longitud del dispositivo al momento de aceptar';
COMMENT ON COLUMN producer.aviso_privacidad_version   IS 'Versión del texto del aviso aceptado';
