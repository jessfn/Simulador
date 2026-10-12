-- Migración v22 — Intereses del bodeguero sobre la oferta de productores
-- Permite al bodeguero guardar los municipios cuya oferta le interesa y
-- revisarlos después en un apartado propio.
CREATE TABLE IF NOT EXISTS oferta_interes (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  bodega_id   INTEGER REFERENCES bodegas(id) ON DELETE SET NULL,
  municipio   VARCHAR(150) NOT NULL,
  estado      VARCHAR(100),
  tipo_maiz   VARCHAR(30),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Un interés único por (usuario, municipio, tipo de maíz). COALESCE para tratar
-- el tipo NULL ("todos") como un valor concreto y evitar duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oferta_interes
  ON oferta_interes (usuario_id, LOWER(municipio), COALESCE(tipo_maiz, ''));

CREATE INDEX IF NOT EXISTS idx_oferta_interes_usuario
  ON oferta_interes (usuario_id);
