-- Up Migration
-- T07: bitacora de exportaciones del panel de frijol (quien exporto, cuando y con que filtros).
CREATE TABLE frijol_exportaciones (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id),
  filtros     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  filas       INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_frijol_exportaciones_usuario ON frijol_exportaciones (usuario_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS frijol_exportaciones;
