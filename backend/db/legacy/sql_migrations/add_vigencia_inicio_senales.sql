-- C-11: Add vigencia_inicio to senales_compra if not exists
ALTER TABLE senales_compra ADD COLUMN IF NOT EXISTS vigencia_inicio DATE;

-- NOTA: Las variedades de maíz son responsabilidad exclusiva de
-- migrate_v11_variedades_correctas.sql. NO tocar cat_crop_variety aquí.
