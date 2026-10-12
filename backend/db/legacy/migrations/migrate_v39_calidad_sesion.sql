-- Fase 1 del plan de rediseño COFECE (ver
-- C:\Users\jesus.rios\.claude\plans\breezy-gathering-ullman.md)
--
-- 1a. Campos de calidad del maíz — hoy no existen en ningún lado
-- (disponibilidad_productor, senales_compra, transacciones). Se agregan
-- como columnas nullable, no rompen los flujos actuales que no las llenan.
--
-- 1b. Sesión única por cuenta — sesion_activa_jti guarda el jti del último
-- login exitoso; authMiddleware compara contra este valor en cada request.

ALTER TABLE disponibilidad_productor
  ADD COLUMN IF NOT EXISTS humedad_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS impurezas_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS grano_quebrado_pct NUMERIC(4,1);

ALTER TABLE senales_compra
  ADD COLUMN IF NOT EXISTS humedad_max_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS impurezas_max_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS grano_quebrado_max_pct NUMERIC(4,1);

ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS humedad_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS impurezas_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS grano_quebrado_pct NUMERIC(4,1);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sesion_activa_jti VARCHAR(64);
