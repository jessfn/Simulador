-- Migración v23 — Múltiples variedades por señal de compra
-- Permite que un requerimiento de bodega especifique
-- una o más variedades de maíz
CREATE TABLE IF NOT EXISTS senal_variedades (
  id              BIGSERIAL PRIMARY KEY,
  senal_id        BIGINT NOT NULL
    REFERENCES senales_compra(id) ON DELETE CASCADE,
  variedad_code   VARCHAR(40) NOT NULL,
  variedad_libre  TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(senal_id, variedad_code)
);

CREATE INDEX IF NOT EXISTS idx_senal_variedades_senal
  ON senal_variedades(senal_id);

COMMENT ON TABLE senal_variedades IS
  'Variedades de maíz solicitadas en cada requerimiento de bodega';
