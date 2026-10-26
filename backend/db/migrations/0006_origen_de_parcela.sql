-- Up Migration
-- T11 §11.1: origen de la parcela. Una parcela cuenta en maiz si su origen es maiz O si tiene un ciclo de maiz;
-- asi una parcela que solo registro frijol (de una persona que tambien es productora de maiz) no infla las cifras de maiz.
-- El DEFAULT se queda a proposito: todo INSERT de maiz (que no menciona la columna) sigue dejando origen 'simac_maiz' sin tocar su codigo.
ALTER TABLE up
  ADD COLUMN IF NOT EXISTS programa_origen VARCHAR(30) NOT NULL DEFAULT 'simac_maiz' REFERENCES cat_programa(clave);

CREATE INDEX IF NOT EXISTS idx_up_programa_origen ON up (programa_origen);

-- Comprobacion: despues de migrar, TODAS las parcelas actuales deben quedar con origen maiz.
DO $$
DECLARE total bigint; maiz bigint;
BEGIN
  SELECT COUNT(*) INTO total FROM up;
  SELECT COUNT(*) INTO maiz FROM up WHERE programa_origen = 'simac_maiz';
  IF total <> maiz THEN
    RAISE EXCEPTION 'Migracion 0006: % parcelas en total pero solo % quedaron con origen simac_maiz', total, maiz;
  END IF;
END $$;

-- Down Migration
-- No se puede bajar si ya hay parcelas con origen distinto de maiz: se perderia esa informacion (como hace 0003).
DO $$
DECLARE otras bigint;
BEGIN
  SELECT COUNT(*) INTO otras FROM up WHERE programa_origen <> 'simac_maiz';
  IF otras > 0 THEN
    RAISE EXCEPTION 'No se puede revertir 0006: hay % parcela(s) con origen distinto de maiz (frijol). Se perderia el origen; atiendalas primero.', otras;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_up_programa_origen;
ALTER TABLE up DROP COLUMN IF EXISTS programa_origen;
