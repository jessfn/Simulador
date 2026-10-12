-- ⚠️ DEPRECATED — NO APLICAR EN PRODUCCIÓN
-- Este archivo fue reemplazado por:
-- backend/migrations/migrate_v11_variedades_correctas.sql
--
-- Si se aplica después de v11, revertirá las variedades
-- de Maíz Amarillo a valores INCORRECTOS (H-40 Amarillo,
-- H-59C, DK 2020) y los codes de Criollo a los viejos.
--
-- Conservado solo como referencia histórica.
-- Fecha de deprecación: Mayo 2026
-- ─────────────────────────────────────────────────────

-- C-12: Add tipo_maiz column to cat_crop_variety and seed correct varieties
ALTER TABLE cat_crop_variety ADD COLUMN IF NOT EXISTS tipo_maiz VARCHAR(20);

-- Seed blanco varieties
INSERT INTO cat_crop_variety (crop, code, label, sort_order, tipo_maiz)
VALUES
  ('maiz', 'MB_H40',  'H-40',       1, 'blanco'),
  ('maiz', 'MB_H48',  'H-48',       2, 'blanco'),
  ('maiz', 'MB_H50',  'H-50',       3, 'blanco'),
  ('maiz', 'MB_H52',  'H-52',       4, 'blanco'),
  ('maiz', 'MB_H66',  'H-66',       5, 'blanco'),
  ('maiz', 'MB_H70',  'H-70',       6, 'blanco'),
  ('maiz', 'MB_VS22', 'VS-22',      7, 'blanco'),
  ('maiz', 'MB_VS23', 'VS-23',      8, 'blanco'),
  ('maiz', 'MA_H40',  'H-40 Amarillo', 10, 'amarillo'),
  ('maiz', 'MA_H59',  'H-59C',      11, 'amarillo'),
  ('maiz', 'MA_DK',   'DK 2020',    12, 'amarillo'),
  ('maiz', 'CRIOLLO_LOCAL', 'Criollo / Local', 20, 'criollo'),
  ('maiz', 'NO_SABE', 'No sabe / Sin especificar', 99, NULL)
ON CONFLICT (crop, code) DO UPDATE
  SET label      = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      tipo_maiz  = EXCLUDED.tipo_maiz;

-- Also add vigencia_inicio to senales_compra (idempotent)
ALTER TABLE senales_compra ADD COLUMN IF NOT EXISTS vigencia_inicio DATE;
