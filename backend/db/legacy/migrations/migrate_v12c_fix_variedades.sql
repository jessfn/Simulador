-- C-04 CAPA 1B: Clean up duplicate NULL row and verify
DELETE FROM cat_crop_variety WHERE tipo_maiz IS NULL AND code = 'NO_SABE';

-- Verify final state
SELECT tipo_maiz, COUNT(*) as total,
       string_agg(code, ', ' ORDER BY sort_order) as variedades
FROM cat_crop_variety
GROUP BY tipo_maiz ORDER BY tipo_maiz;
