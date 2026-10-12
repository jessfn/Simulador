-- P-06: Fix users with incorrect 'bodeguero' role
UPDATE usuarios SET rol = 'bodega' WHERE rol = 'bodeguero';

-- Verify
SELECT rol, COUNT(*) FROM usuarios GROUP BY rol ORDER BY rol;
