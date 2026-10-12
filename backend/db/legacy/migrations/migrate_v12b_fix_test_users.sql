-- C-03: Fix test user names with "BODEGUERO" or "PRUEBA"
UPDATE usuarios SET nombre_completo = 'Supervisor Sistema' WHERE id = 23 AND nombre_completo = 'PRUEBA SUPERVISOR';
UPDATE usuarios SET nombre_completo = 'Responsable Bodega' WHERE id = 4 AND nombre_completo = 'JESS BODEGUERO';
UPDATE usuarios SET nombre_completo = 'Operador Bodega' WHERE id = 24 AND nombre_completo = 'BODEGUERO PRUEBA';
UPDATE usuarios SET nombre_completo = 'Responsable Bodega' WHERE id = 15 AND nombre_completo = 'JESS BODEGUERO';

-- Verify
SELECT id, nombre_completo, rol FROM usuarios WHERE id IN (4, 15, 23, 24);
