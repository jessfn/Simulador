-- Índices para acelerar GET /api/admin/parcelas.
-- Antes: 5,076ms (LEFT JOIN LATERAL a "cycle" sin índice -> seq scan por
-- cada una de las ~9,500 parcelas). Después: ~112ms.

CREATE INDEX IF NOT EXISTS idx_cycle_up_id_year_id ON cycle (up_id, cycle_year DESC, cycle_id DESC);
CREATE INDEX IF NOT EXISTS idx_up_producer_id ON up (producer_id);
CREATE INDEX IF NOT EXISTS idx_up_state_municipality ON up (state_name, municipality_name) WHERE geom IS NOT NULL;
