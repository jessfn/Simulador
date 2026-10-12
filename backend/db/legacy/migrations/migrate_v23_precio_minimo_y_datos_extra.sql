-- Migración v23 — Correcciones de observaciones visuales
-- #4: precio mínimo por tonelada en propuestas de venta del productor
ALTER TABLE disponibilidad_productor
  ADD COLUMN IF NOT EXISTS precio_minimo_ton NUMERIC(10,2);

-- #9: datos extra (coords/municipio de bodega) en notificaciones para acciones rápidas
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS datos_extra JSONB;
