-- Up Migration
-- T01: catalogos de frijol (variedades, listas generales y programas SADER). No toca las variedades de maiz.

-- Los catalogos de produccion no tenian ninguna restriccion de unicidad; hace falta para ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_crop_variety_crop_code ON cat_crop_variety (crop, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_catalog_catalog_code   ON cat_catalog (catalog, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cat_programas_gobierno_clave ON cat_programas_gobierno (clave);

-- a) Variedades de frijol (catalogo del 14-sep-2026: 25 variedades + Criollo/local + Otra). tipo_maiz siempre NULL.
UPDATE cat_crop_variety SET is_active = false
 WHERE crop = 'frijol' AND code NOT IN (
   'ALUBIA_CHICA','ALUBIA_GRANDE','AZUFRADO','AZUFRADO_HIGUERA','BAYO_BLANCO','BAYO_QUERETARO','CANARIO','CANARIO_YORIMUNI',
   'CLARO_AYOCATE','CLARO_MARCELA','CLARO_SANGRE_DE_TORO','FLOR_DE_JUNIO','FLOR_DE_MAYO','MAYOCOBA','MEDIA_OREJA','NEGRO_BOLA',
   'NEGRO_JAMAPA','NEGRO_MICHIGAN','NEGRO_QUERETARO','NEGRO_SAN_LUIS','OJO_DE_CABRA','PERUANO_BOLA','PINTO_CENTAURO',
   'PINTO_SALTILLO','PINTO_VILLA','CRIOLLO_LOCAL','OTRA');

INSERT INTO cat_crop_variety (crop, code, label, sort_order, is_active, tipo_maiz) VALUES
  ('frijol', 'ALUBIA_CHICA',         'Alubia Chica',          10, true, NULL),
  ('frijol', 'ALUBIA_GRANDE',        'Alubia Grande',         20, true, NULL),
  ('frijol', 'AZUFRADO',             'Azufrado',              30, true, NULL),
  ('frijol', 'AZUFRADO_HIGUERA',     'Azufrado Higuera',      40, true, NULL),
  ('frijol', 'BAYO_BLANCO',          'Bayo Blanco',           50, true, NULL),
  ('frijol', 'BAYO_QUERETARO',       'Bayo Querétaro',        60, true, NULL),
  ('frijol', 'CANARIO',              'Canario',               70, true, NULL),
  ('frijol', 'CANARIO_YORIMUNI',     'Canario Yorimuni',      80, true, NULL),
  ('frijol', 'CLARO_AYOCATE',        'Claro Ayocate',         90, true, NULL),
  ('frijol', 'CLARO_MARCELA',        'Claro Marcela',        100, true, NULL),
  ('frijol', 'CLARO_SANGRE_DE_TORO', 'Claro Sangre de Toro', 110, true, NULL),
  ('frijol', 'FLOR_DE_JUNIO',        'Flor de Junio',        120, true, NULL),
  ('frijol', 'FLOR_DE_MAYO',         'Flor de Mayo',         130, true, NULL),
  ('frijol', 'MAYOCOBA',             'Mayocoba',             140, true, NULL),
  ('frijol', 'MEDIA_OREJA',          'Media Oreja',          150, true, NULL),
  ('frijol', 'NEGRO_BOLA',           'Negro Bola',           160, true, NULL),
  ('frijol', 'NEGRO_JAMAPA',         'Negro Jamapa',         170, true, NULL),
  ('frijol', 'NEGRO_MICHIGAN',       'Negro Michigan',       180, true, NULL),
  ('frijol', 'NEGRO_QUERETARO',      'Negro Querétaro',      190, true, NULL),
  ('frijol', 'NEGRO_SAN_LUIS',       'Negro San Luis',       200, true, NULL),
  ('frijol', 'OJO_DE_CABRA',         'Ojo de Cabra',         210, true, NULL),
  ('frijol', 'PERUANO_BOLA',         'Peruano Bola',         220, true, NULL),
  ('frijol', 'PINTO_CENTAURO',       'Pinto Centauro',       230, true, NULL),
  ('frijol', 'PINTO_SALTILLO',       'Pinto Saltillo',       240, true, NULL),
  ('frijol', 'PINTO_VILLA',          'Pinto Villa',          250, true, NULL),
  ('frijol', 'CRIOLLO_LOCAL',        'Criollo / local',      900, true, NULL),
  ('frijol', 'OTRA',                 'Otra (especificar)',   999, true, NULL)
ON CONFLICT (crop, code) DO UPDATE
  SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = true, tipo_maiz = NULL;

-- b) Catalogos generales
INSERT INTO cat_catalog (catalog, code, label, sort_order, is_active) VALUES
  ('documento_propiedad', 'certificado_parcelario',   'Certificado parcelario',        1, true),
  ('documento_propiedad', 'contrato_arrendamiento',   'Contrato de arrendamiento',     2, true),
  ('documento_propiedad', 'contrato_comodato',        'Contrato de comodato',          3, true),
  ('documento_propiedad', 'otro',                     'Otro (especificar)',           99, true),
  ('destino_frijol',      'autoconsumo',              'Autoconsumo',                   1, true),
  ('destino_frijol',      'mercado_libre',            'Venta en mercado libre',        2, true),
  ('destino_frijol',      'acopio_axb',               'Acopio en bodega de Alimentación para el Bienestar', 3, true),
  ('tipo_siembra_frijol', 'monocultivo',              'Monocultivo',                   1, true),
  ('tipo_siembra_frijol', 'asociada',                 'Asociada (milpa u otro arreglo)', 2, true),
  ('rotacion_cultivo',    'rota',                     'Rota distintos cultivos',       1, true),
  ('rotacion_cultivo',    'un_cultivo',               'Destinada a un solo cultivo',   2, true),
  ('tipo_fertilizante',   'organico',                 'Orgánico',                      1, true),
  ('tipo_fertilizante',   'sintetico',                'Sintético',                     2, true),
  ('tipo_fertilizante',   'biofertilizante',          'Biofertilizante',               3, true),
  ('seguro_agricola',     'no',                       'No cuenta con seguro',          1, true),
  ('seguro_agricola',     'cadena',                   'Sí, CADENA',                    2, true),
  ('seguro_agricola',     'otro',                     'Sí, otro (especificar)',        3, true),
  ('tipo_tecnico',        'eca_productivo',           'ECA Productivo',                1, true),
  ('tipo_tecnico',        'eca_agroecologico',        'ECA Agroecológico',             2, true),
  ('estatus_registro_frijol', 'enviado',              'Enviado',                       1, true),
  ('estatus_registro_frijol', 'requiere_correccion',  'Requiere corrección',           2, true),
  ('estatus_registro_frijol', 'validado',             'Validado',                      3, true),
  ('verificacion_identidad', 'verificada',            'Verificada',                    1, true),
  ('verificacion_identidad', 'pendiente',             'Pendiente de verificación',     2, true),
  ('verificacion_identidad', 'no_valida',             'No válida',                     3, true)
ON CONFLICT (catalog, code) DO NOTHING;

-- c) Programas SADER que se muestran en la pantalla de frijol (Acopio, Fertilizantes, Produccion, Semillas y Otro)
INSERT INTO cat_programas_gobierno (clave, nombre, activo) VALUES
  ('acopio_bienestar',   'Acopio para el Bienestar',            true),
  ('semillas_bienestar', 'Semillas para el Bienestar',          true),
  ('otro_sader',         'Otro programa de SADER (especificar)', true)
ON CONFLICT (clave) DO NOTHING;

-- Down Migration
DELETE FROM cat_catalog WHERE catalog IN (
  'documento_propiedad','destino_frijol','tipo_siembra_frijol','rotacion_cultivo','tipo_fertilizante',
  'seguro_agricola','tipo_tecnico','estatus_registro_frijol','verificacion_identidad');
-- T09 §9.10: los programas de la Secretaría solo se borran si NINGÚN productor los usa (maíz: producer.programas_beneficiario; frijol:
-- frijol_productor.programas_sader, si esa tabla aún existe). Los que estén en uso se conservan.
DO $$
DECLARE
  en_uso text[];
  en_uso_frijol text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT c), '{}') INTO en_uso FROM (SELECT unnest(programas_beneficiario) AS c FROM producer) x;
  IF to_regclass('public.frijol_productor') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(array_agg(DISTINCT c), ''{}'') FROM (SELECT unnest(programas_sader) AS c FROM frijol_productor) x' INTO en_uso_frijol;
    en_uso := en_uso || en_uso_frijol;
  END IF;
  DELETE FROM cat_programas_gobierno
   WHERE clave IN ('acopio_bienestar','semillas_bienestar','otro_sader') AND NOT (clave = ANY(en_uso));
END $$;
-- Las variedades de frijol no se borran (algun ciclo podria apuntar a ellas): solo se desactivan.
UPDATE cat_crop_variety SET is_active = false WHERE crop = 'frijol';
-- Los indices unicos se conservan: son una mejora y no estorban a maiz.
