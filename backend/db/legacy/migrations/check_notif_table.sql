-- Check notificaciones table columns
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'notificaciones' ORDER BY ordinal_position;

-- Check if there are any notificaciones
SELECT COUNT(*) as total, SUM(CASE WHEN leida = FALSE THEN 1 ELSE 0 END) as no_leidas FROM notificaciones;

-- Check if titulo/mensaje columns exist
SELECT tipo, COUNT(*) FROM notificaciones GROUP BY tipo ORDER BY COUNT(*) DESC LIMIT 10;
