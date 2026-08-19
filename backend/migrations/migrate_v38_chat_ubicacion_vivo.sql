-- Soporte para "ubicación en tiempo real" (se actualiza mientras está activa,
-- como en WhatsApp) además de la ubicación de un solo punto ya existente.

ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS activo_hasta TIMESTAMPTZ;
