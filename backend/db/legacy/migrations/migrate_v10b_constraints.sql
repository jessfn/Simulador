-- migrate_v10b_constraints.sql
-- Agregar CHECK constraints faltantes en cycle_crop (B-01 complemento)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cycle_crop_tipo_maiz_check'
  ) THEN
    ALTER TABLE cycle_crop ADD CONSTRAINT cycle_crop_tipo_maiz_check
      CHECK (tipo_maiz IS NULL OR tipo_maiz IN ('blanco','amarillo','criollo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cycle_crop_ventana_venta_check'
  ) THEN
    ALTER TABLE cycle_crop ADD CONSTRAINT cycle_crop_ventana_venta_check
      CHECK (ventana_venta IS NULL OR ventana_venta IN ('esta_semana','quincena','mes'));
  END IF;
END$$;
