-- migrate_v17_precio_referencias_externas.sql
-- Tabla para guardar histórico de Chicago y TC desde Yahoo Finance y Banxico

CREATE TABLE IF NOT EXISTS precio_referencias_externas (
  id                  SERIAL PRIMARY KEY,
  chicago_usd_bushel  NUMERIC(10,4),
  chicago_usd_ton     NUMERIC(10,2),
  chicago_mxn         NUMERIC(10,2),
  tc_banxico          NUMERIC(10,4),
  garantia_sader      NUMERIC(10,2),
  fuente              VARCHAR(30) DEFAULT 'cron',
  -- fuente: 'cron' | 'admin_manual' | 'primer_arranque' | 'fallback'
  error               BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para obtener siempre el más reciente rápido
CREATE INDEX IF NOT EXISTS idx_precio_refs_created_at 
  ON precio_referencias_externas(created_at DESC);

-- Insertar un valor inicial para que el sistema no arranque vacío
-- (se sobreescribe en el primer cron exitoso)
INSERT INTO precio_referencias_externas 
  (chicago_usd_bushel, chicago_usd_ton, chicago_mxn, tc_banxico, fuente)
VALUES 
  (6.28, 247.43, 4306.23, 17.42, 'primer_arranque');
