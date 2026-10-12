-- migrate_v10_correcciones.sql
-- B-01: Columnas faltantes en cycle_crop
-- B-02: Tabla disponibilidad_productor
-- B-05: Fix CHECK constraint vigencia en senales_compra

BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- B-01: Agregar columnas faltantes a cycle_crop
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE cycle_crop
  ADD COLUMN IF NOT EXISTS planting_date DATE,
  ADD COLUMN IF NOT EXISTS estimated_harvest_date DATE,
  ADD COLUMN IF NOT EXISTS yield_expected NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS tipo_maiz VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ventana_venta VARCHAR(20) DEFAULT 'esta_semana',
  ADD COLUMN IF NOT EXISTS disponible_para_venta BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_disponibilidad DATE;

-- ═══════════════════════════════════════════════════════════════
-- B-02: Tabla disponibilidad_productor
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS disponibilidad_productor (
  id                    SERIAL PRIMARY KEY,
  producer_id           BIGINT NOT NULL,
  up_id                 BIGINT NOT NULL,
  tipo_maiz             VARCHAR(20) NOT NULL,
  variedad_code         VARCHAR(40),
  volumen_estimado_ton  NUMERIC(10,2),
  ventana_venta         VARCHAR(20) NOT NULL DEFAULT 'esta_semana',
  fecha_disponible      DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento     DATE NOT NULL,
  activa                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS disp_prod_idx ON disponibilidad_productor(producer_id);
CREATE INDEX IF NOT EXISTS disp_up_idx   ON disponibilidad_productor(up_id);
CREATE INDEX IF NOT EXISTS disp_activa_idx ON disponibilidad_productor(activa, fecha_vencimiento);

-- ═══════════════════════════════════════════════════════════════
-- B-05: Fix CHECK constraint en senales_compra.vigencia
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE senales_compra DROP CONSTRAINT IF EXISTS senales_compra_vigencia_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'senales_compra_vigencia_check2'
  ) THEN
    ALTER TABLE senales_compra ADD CONSTRAINT senales_compra_vigencia_check2
      CHECK (vigencia IN ('esta_semana', '15_dias', 'rango'));
  END IF;
END$$;

COMMIT;
