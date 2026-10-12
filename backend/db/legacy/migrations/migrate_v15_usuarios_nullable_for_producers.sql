-- V15: Permitir que productores no requieran email, curp, nombre_completo en tabla usuarios
-- Los productores usan CURP+PIN y sus datos personales viven en tabla producer

ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN curp DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN nombre_completo DROP NOT NULL;
ALTER TABLE usuarios ALTER COLUMN telefono DROP NOT NULL;

-- Eliminar constraint UNIQUE de email y curp para permitir NULLs múltiples
-- (PostgreSQL permite múltiples NULLs en UNIQUE, pero por seguridad lo dejamos)
-- Solo eliminamos los índices duplicados si causan conflicto
-- DROP INDEX IF EXISTS idx_usuarios_curp;
-- DROP INDEX IF EXISTS idx_usuarios_email;
