-- Migración v21 — Campos editables por el bodeguero (corrección #7)
-- El bodeguero puede actualizar horario, teléfono de contacto y observaciones.
-- Nombre y ubicación siguen siendo controlados por el Admin.
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS horario           VARCHAR(200);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS telefono_contacto VARCHAR(40);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS observaciones     TEXT;
