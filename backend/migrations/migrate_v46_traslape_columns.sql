-- Migración: documentar columnas de detección de traslape entre parcelas (UP)
-- Estas columnas ya existen en producción; esta migración solo las formaliza
-- en el historial versionado del esquema para que ambientes nuevos las incluyan.
-- (H3, auditoría seguridad Fase 3, 2026-09-22)

ALTER TABLE up
  ADD COLUMN IF NOT EXISTS posible_traslape_producer_id INTEGER
    REFERENCES producer(producer_id) ON DELETE SET NULL;

ALTER TABLE up
  ADD COLUMN IF NOT EXISTS traslape_revisado BOOLEAN NOT NULL DEFAULT true;
-- DEFAULT true: filas existentes que ya tenían el traslape "aceptado" bajo la
-- política anterior no aparecen como "pendientes de revisión" al aplicar esto.
-- El código siempre setea explícitamente false en las nuevas detecciones.

CREATE INDEX IF NOT EXISTS idx_up_traslape_pendiente
  ON up(traslape_revisado)
  WHERE traslape_revisado = false;
-- Índice parcial para que la consulta de admin "pendientes de revisión" sea rápida.
