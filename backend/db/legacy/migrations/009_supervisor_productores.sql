-- Tabla de vinculación supervisor-productor
CREATE TABLE IF NOT EXISTS supervisor_productores (
  id SERIAL PRIMARY KEY,
  supervisor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  producer_id INTEGER NOT NULL REFERENCES producer(producer_id) ON DELETE CASCADE,
  fecha_vinculacion TIMESTAMP DEFAULT NOW(),
  UNIQUE(supervisor_id, producer_id)
);

CREATE INDEX IF NOT EXISTS idx_sup_prod_supervisor ON supervisor_productores(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_sup_prod_producer ON supervisor_productores(producer_id);
