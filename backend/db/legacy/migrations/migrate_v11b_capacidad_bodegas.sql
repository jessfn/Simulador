-- migrate_v11b_capacidad_bodegas.sql
-- P-02: Assign estimated capacidad_ton to bodegas that have 0
-- Uses name patterns to approximate capacity based on business type

BEGIN;

-- Large companies / industrial: ~15000-25000 ton
UPDATE bodegas SET capacidad_ton = 
  CASE 
    WHEN nombre ILIKE '%BACHOCO%' OR nombre ILIKE '%MOLINERA%' OR nombre ILIKE '%MASECA%' 
      OR nombre ILIKE '%MINSA%' OR nombre ILIKE '%CARGILL%' OR nombre ILIKE '%DICONSA%' THEN 25000
    WHEN nombre ILIKE '%S.A. DE C.V%' OR nombre ILIKE '%SA DE CV%' THEN 15000
    WHEN nombre ILIKE '%SPR DE RL%' OR nombre ILIKE '%SPR%' THEN 8000
    WHEN nombre ILIKE '%ALMACEN%' OR nombre ILIKE '%ALMACÉN%' OR nombre ILIKE '%GRANERO%' THEN 12000
    WHEN nombre ILIKE '%CENTRO DE ACOPIO%' THEN 10000
    WHEN nombre ILIKE '%BODEGA%' THEN 8000
    WHEN nombre ILIKE '%GRANJA%' THEN 5000
    ELSE 7500
  END
WHERE capacidad_ton = 0 OR capacidad_ton IS NULL;

-- Add a small random variance (+/- 20%) to avoid all looking identical
UPDATE bodegas SET capacidad_ton = ROUND(capacidad_ton * (0.8 + random() * 0.4))
WHERE id IN (
  SELECT id FROM bodegas 
  WHERE capacidad_ton IN (25000, 15000, 8000, 12000, 10000, 5000, 7500)
);

COMMIT;

-- Verify
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN capacidad_ton > 0 THEN 1 END) as con_capacidad,
  COUNT(CASE WHEN capacidad_ton = 0 OR capacidad_ton IS NULL THEN 1 END) as sin_capacidad,
  MIN(capacidad_ton) as min_cap,
  AVG(capacidad_ton)::int as avg_cap,
  MAX(capacidad_ton) as max_cap
FROM bodegas;
