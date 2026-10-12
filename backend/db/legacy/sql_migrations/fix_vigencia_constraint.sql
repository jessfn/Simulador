-- Fix vigencia CHECK constraint to allow 'rango'
ALTER TABLE senales_compra DROP CONSTRAINT IF EXISTS senales_compra_vigencia_check;
ALTER TABLE senales_compra ADD CONSTRAINT senales_compra_vigencia_check
  CHECK (vigencia IN ('esta_semana', '15_dias', 'rango'));
