-- 1. Crear tabla municipios_referencia si no existe
CREATE TABLE IF NOT EXISTS municipios_referencia (
  municipio_id  SERIAL PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  estado_id     INTEGER NOT NULL,
  estado_nombre VARCHAR(100) NOT NULL,
  centroid_lat  NUMERIC(10, 7),
  centroid_lng  NUMERIC(10, 7)
);

-- 2. Agregar columna tipo_maiz a cat_crop_variety si no existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='cat_crop_variety' AND column_name='tipo_maiz') THEN
        ALTER TABLE cat_crop_variety ADD COLUMN tipo_maiz VARCHAR(50);
    END IF;
END $$;

-- 3. Clasificar las variedades existentes
UPDATE cat_crop_variety 
SET tipo_maiz = 'criollo' 
WHERE LOWER(nombre_variedad) LIKE '%criollo%' OR code = 'MC_CRIOLLO' OR code = 'NO_SABE' OR LOWER(nombre_variedad) = 'no sabe';

UPDATE cat_crop_variety 
SET tipo_maiz = 'blanco' 
WHERE tipo_maiz IS NULL AND (LOWER(nombre_variedad) LIKE 'h-%' OR LOWER(nombre_variedad) LIKE 'v-5%');

-- Las que falten y no sean obvias, se ponen como amarillo por defecto o se pueden ajustar luego.
UPDATE cat_crop_variety 
SET tipo_maiz = 'amarillo' 
WHERE tipo_maiz IS NULL;
