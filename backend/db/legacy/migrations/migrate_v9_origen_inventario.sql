-- migrate_v9_origen_inventario.sql
-- Agrega columna origen a inventarios (local | importado)
-- Requerida por B-07 del módulo bodega

ALTER TABLE inventarios
  ADD COLUMN IF NOT EXISTS origen VARCHAR(20) CHECK (origen IN ('local', 'importado'));
