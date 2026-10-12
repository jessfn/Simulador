-- Up Migration
-- T03: un ciclo por cultivo. Maiz y frijol pueden tener cada uno su ciclo PV/OI en la misma parcela sin pisarse.
-- Se conserva "un cultivo por ciclo" (cycle_crop_cycle_unique), asi las pantallas de maiz no cambian de comportamiento.

-- 1. El ciclo sabe de que cultivo es. DEFAULT 'maiz' para que el codigo actual de maiz siga funcionando sin cambios.
ALTER TABLE cycle ADD COLUMN crop VARCHAR(10) NOT NULL DEFAULT 'maiz';

-- 2. Llenar con el cultivo real de cada ciclo existente (si alguno tuviera uno distinto de maiz)
UPDATE cycle c SET crop = cc.crop
  FROM cycle_crop cc
 WHERE cc.cycle_id = c.cycle_id AND cc.crop <> c.crop;

-- 3. El candado de ciclo activo ahora es por cultivo
DROP INDEX IF EXISTS idx_unique_ciclo_activo;
CREATE UNIQUE INDEX idx_unique_ciclo_activo_cultivo
  ON cycle (up_id, cycle_year, cycle_type, crop)
  WHERE (estado_ciclo)::text = 'activo'::text;

CREATE INDEX idx_cycle_crop_col ON cycle (crop);

-- Down Migration
-- Solo es posible si no hay dos ciclos activos de distinto cultivo en la misma parcela y temporada.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cycle WHERE (estado_ciclo)::text = 'activo'
     GROUP BY up_id, cycle_year, cycle_type HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede revertir 0003: hay parcelas con ciclos activos de distinto cultivo en la misma temporada (maiz y frijol). Eliminalos o cancelalos primero.';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_unique_ciclo_activo_cultivo;
DROP INDEX IF EXISTS idx_cycle_crop_col;
CREATE UNIQUE INDEX idx_unique_ciclo_activo ON cycle USING btree (up_id, cycle_year, cycle_type) WHERE ((estado_ciclo)::text = 'activo'::text);
ALTER TABLE cycle DROP COLUMN crop;
