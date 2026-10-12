-- Fix columns owned by postgres
ALTER TABLE producer ADD COLUMN IF NOT EXISTS programas_beneficiario TEXT[] DEFAULT '{}';
ALTER TABLE producer ADD COLUMN IF NOT EXISTS estado_validacion VARCHAR(20) DEFAULT 'activo';
ALTER TABLE producer ADD COLUMN IF NOT EXISTS tipo_registro CHAR(1) DEFAULT 'A';
ALTER TABLE up ADD COLUMN IF NOT EXISTS location_confirmed BOOLEAN DEFAULT false;
ALTER TABLE up ADD COLUMN IF NOT EXISTS centroid_source VARCHAR(20) DEFAULT 'municipio';
