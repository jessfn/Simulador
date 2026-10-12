-- Migración v15 — SIMAC Admin Correcciones V2
-- Agrega columna nota_admin a tabla producer para guardar notas de aprobación/rechazo
-- Ejecutar en: psql -d bodegas -U jesus

ALTER TABLE producer ADD COLUMN IF NOT EXISTS nota_admin TEXT;

-- Índice parcial para búsqueda rápida de productores con nota
CREATE INDEX IF NOT EXISTS idx_producer_nota_admin ON producer(producer_id) WHERE nota_admin IS NOT NULL;

-- Comentario en la columna
COMMENT ON COLUMN producer.nota_admin IS 'Nota del administrador al aprobar, rechazar o suspender al productor';
