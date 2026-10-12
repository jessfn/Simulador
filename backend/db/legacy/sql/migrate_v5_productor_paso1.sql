-- =============================================
-- Migración v5: Completar campos de registro de productor paso 1
-- =============================================

ALTER TABLE producer
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);

UPDATE producer
SET telefono = phone
WHERE telefono IS NULL AND phone IS NOT NULL;

ALTER TABLE producer
    ADD COLUMN IF NOT EXISTS nombres VARCHAR(80),
    ADD COLUMN IF NOT EXISTS apellido_paterno VARCHAR(80),
    ADD COLUMN IF NOT EXISTS apellido_materno VARCHAR(80),
    ADD COLUMN IF NOT EXISTS sexo VARCHAR(10),
    ADD COLUMN IF NOT EXISTS correo_electronico VARCHAR(100),
    ADD COLUMN IF NOT EXISTS state_id VARCHAR(2) REFERENCES geo_state(state_id),
    ADD COLUMN IF NOT EXISTS municipality_id VARCHAR(5) REFERENCES geo_municipality(municipality_id),
    ADD COLUMN IF NOT EXISTS localidad VARCHAR(150),
    ADD COLUMN IF NOT EXISTS observaciones TEXT,
    ADD COLUMN IF NOT EXISTS estatus_registro VARCHAR(20) DEFAULT 'INCOMPLETO',
    ADD COLUMN IF NOT EXISTS tecnico_asignado_id INTEGER REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS usuario_capturista_id INTEGER REFERENCES usuarios(id),
    ADD COLUMN IF NOT EXISTS fecha_captura TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION update_producer_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_producer_updated ON producer;
CREATE TRIGGER trigger_producer_updated
    BEFORE UPDATE ON producer
    FOR EACH ROW
    EXECUTE FUNCTION update_producer_timestamp();
