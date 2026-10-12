-- Migración v20 — Tabla de productores interesados en señales de compra
-- Permite al bodeguero ver QUIÉN respondió "Me interesa" a su señal y contactarlo.
CREATE TABLE IF NOT EXISTS senal_interesados (
  id               BIGSERIAL PRIMARY KEY,
  senal_id         INTEGER NOT NULL REFERENCES senales_compra(id) ON DELETE CASCADE,
  producer_id      BIGINT NOT NULL REFERENCES producer(producer_id) ON DELETE CASCADE,
  usuario_id       INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  municipio        VARCHAR(150),
  estado           VARCHAR(100),
  telefono         VARCHAR(20),
  nombre_productor VARCHAR(200),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(senal_id, producer_id)  -- un productor solo responde una vez por señal
);

-- Índice para búsqueda rápida por señal
CREATE INDEX IF NOT EXISTS idx_senal_interesados_senal
  ON senal_interesados(senal_id);
