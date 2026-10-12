-- Migración v21 — Permitir notificaciones sin alerta_id
-- Las notificaciones de señales, ofertas y disponibilidad no nacen
-- de una alerta, por lo que alerta_id debe ser nullable.
ALTER TABLE notificaciones ALTER COLUMN alerta_id DROP NOT NULL;
