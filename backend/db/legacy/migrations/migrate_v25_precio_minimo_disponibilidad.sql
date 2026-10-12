-- Migración v25 — Precio mínimo por tonelada en propuesta de venta
-- El productor puede indicar un precio mínimo de referencia para negociar.
ALTER TABLE disponibilidad_productor
  ADD COLUMN IF NOT EXISTS precio_minimo_ton NUMERIC(10,2);

COMMENT ON COLUMN disponibilidad_productor.precio_minimo_ton IS
  'Precio mínimo por tonelada que el productor pide como punto de partida (opcional)';
