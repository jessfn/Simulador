-- Migración V32: Catálogo ampliado de variedades de maíz blanco
-- Fuente: SNICS/CNVV 2024, INIFAP, variedades comerciales México
-- Solo incluye variedades de maíz blanco comerciales relevantes para el Plan Nacional Maíz 2026
-- Se mantiene "Otra" como opción de salida para variedades no listadas
-- NOTA: Se usan códigos OTRA_AMARILLO / OTRA_CRIOLLO para evitar conflicto de UNIQUE en code

-- Verificar constraint antes de correr (informativo):
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'cat_crop_variety';

-- Limpiar variedades de maíz existentes y reemplazar con catálogo curado
DELETE FROM cat_crop_variety WHERE crop = 'maiz';

INSERT INTO cat_crop_variety (code, label, crop, tipo_maiz, sort_order, is_active) VALUES

-- ── HÍBRIDOS BLANCOS — EMPRESAS NACIONALES ──────────────────────────────
('SB-101',    'SB-101 (Berentsen)',          'maiz', 'blanco', 10, true),
('SB-104',    'SB-104 (Berentsen)',          'maiz', 'blanco', 11, true),
('SB-308',    'SB-308 (Berentsen)',          'maiz', 'blanco', 12, true),
('SB-308M',   'SB-308 M (Berentsen)',        'maiz', 'blanco', 13, true),
('SB-309',    'SB-309 (Berentsen)',          'maiz', 'blanco', 14, true),
('SB-325',    'SB-325 (Berentsen)',          'maiz', 'blanco', 15, true),
('SBA-470',   'SBA-470 (Berentsen)',         'maiz', 'blanco', 16, true),

-- ── HÍBRIDOS BLANCOS — INIFAP ────────────────────────────────────────────
('H-40',      'H-40 (INIFAP)',               'maiz', 'blanco', 20, true),
('H-50',      'H-50 (INIFAP)',               'maiz', 'blanco', 21, true),
('H-59',      'H-59 (INIFAP)',               'maiz', 'blanco', 22, true),
('H-70',      'H-70 (INIFAP)',               'maiz', 'blanco', 23, true),
('H-28',      'H-28 (INIFAP)',               'maiz', 'blanco', 24, true),
('VS-536',    'VS-536 (INIFAP)',             'maiz', 'blanco', 25, true),
('VS-22',     'VS-22 (INIFAP)',              'maiz', 'blanco', 26, true),

-- ── HÍBRIDOS BLANCOS — EMPRESAS INTERNACIONALES ──────────────────────────
('ANTILOPE',  'Antílope (Bayer/Monsanto)',   'maiz', 'blanco', 30, true),
('P3992W',    'P3992W (Pioneer/Corteva)',    'maiz', 'blanco', 31, true),
('DK-2038W',  'DK-2038W (Bayer)',            'maiz', 'blanco', 32, true),

-- ── VARIEDADES DE POLINIZACIÓN LIBRE (TEMPORAL) ──────────────────────────
('VS-201',    'VS-201 (INIFAP-temporal)',    'maiz', 'blanco', 40, true),
('V-537C',    'V-537C (INIFAP)',             'maiz', 'blanco', 41, true),

-- ── MAÍZ AMARILLO ────────────────────────────────────────────────────────
('DK-390',    'DK-390 (Bayer)',              'maiz', 'amarillo', 50, true),
('DK-2037',   'DK-2037 (Bayer)',            'maiz', 'amarillo', 51, true),
('A7573',     'A7573 (Bayer)',              'maiz', 'amarillo', 52, true),
('P3992Y',    'P3992Y (Pioneer/Corteva)',    'maiz', 'amarillo', 53, true),

-- ── CRIOLLO / NATIVO ─────────────────────────────────────────────────────
('CRIOLLO_LOCAL', 'Criollo / Nativo local', 'maiz', 'criollo', 60, true),

-- ── OPCIONES ABIERTAS — códigos distintos para evitar conflicto de UNIQUE ─
('OTRA',         'Otra variedad',           'maiz', 'blanco',   99, true),
('OTRA_AMARILLO','Otra variedad',           'maiz', 'amarillo', 99, true),
('OTRA_CRIOLLO', 'Otra variedad',           'maiz', 'criollo',  99, true)
;

-- Verificar resultado
SELECT tipo_maiz, COUNT(*) as variedades
FROM cat_crop_variety
WHERE crop = 'maiz' AND is_active = true
GROUP BY tipo_maiz
ORDER BY tipo_maiz;
