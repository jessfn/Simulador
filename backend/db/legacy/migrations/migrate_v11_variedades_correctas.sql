-- migrate_v11_variedades_correctas.sql
-- P-01: Corregir variedades de maíz — Amarillo completamente incorrecto + 6 faltantes de Blanco
-- Table has columns: id, crop (NOT NULL varchar(10)), code (NOT NULL), label (NOT NULL), sort_order, is_active, tipo_maiz
-- UNIQUE constraint on (crop, code)

BEGIN;

-- 1. Limpiar variedades con tipo_maiz asignado (las que se insertaron con el sistema nuevo)
DELETE FROM cat_crop_variety 
WHERE tipo_maiz IN ('blanco', 'amarillo', 'criollo');

-- 2. Insertar variedades correctas de MAÍZ BLANCO (crop = 'maiz')
INSERT INTO cat_crop_variety (crop, code, label, tipo_maiz, sort_order) VALUES
  ('maiz', 'MB_H40',    'H-40',    'blanco', 1),
  ('maiz', 'MB_H48',    'H-48',    'blanco', 2),
  ('maiz', 'MB_H50',    'H-50',    'blanco', 3),
  ('maiz', 'MB_H52',    'H-52',    'blanco', 4),
  ('maiz', 'MB_H59',    'H-59',    'blanco', 5),
  ('maiz', 'MB_H66',    'H-66',    'blanco', 6),
  ('maiz', 'MB_H70',    'H-70',    'blanco', 7),
  ('maiz', 'MB_H77',    'H-77',    'blanco', 8),
  ('maiz', 'MB_H383',   'H-383',   'blanco', 9),
  ('maiz', 'MB_VS22',   'VS-22',   'blanco', 10),
  ('maiz', 'MB_VS23',   'VS-23',   'blanco', 11),
  ('maiz', 'MB_H520',   'H-520',   'blanco', 12),
  ('maiz', 'MB_H564C',  'H-564C',  'blanco', 13),
  ('maiz', 'MB_OTRA',   'Otra',    'blanco', 14);

-- 3. Insertar variedades correctas de MAÍZ AMARILLO
INSERT INTO cat_crop_variety (crop, code, label, tipo_maiz, sort_order) VALUES
  ('maiz', 'MA_H384A',  'H-384A',          'amarillo', 1),
  ('maiz', 'MA_H385',   'H-385',           'amarillo', 2),
  ('maiz', 'MA_V53A',   'V-53A',           'amarillo', 3),
  ('maiz', 'MA_V55A',   'V-55A',           'amarillo', 4),
  ('maiz', 'MA_BUHO',   'Búho',            'amarillo', 5),
  ('maiz', 'MA_CRIOLLO','Criollo Amarillo','amarillo', 6),
  ('maiz', 'MA_OTRA',   'Otra',            'amarillo', 7);

-- 4. Insertar variedades de CRIOLLO
INSERT INTO cat_crop_variety (crop, code, label, tipo_maiz, sort_order) VALUES
  ('maiz', 'MC_CRIOLLO', 'Criollo Local (especificar)', 'criollo', 1),
  ('maiz', 'MC_NOSABE',  'No sabe',                     'criollo', 2);

COMMIT;

-- 5. Verificar resultado
SELECT tipo_maiz, COUNT(*) as total, 
       string_agg(code, ', ' ORDER BY sort_order) as variedades
FROM cat_crop_variety 
WHERE tipo_maiz IS NOT NULL
GROUP BY tipo_maiz ORDER BY tipo_maiz;
