-- Marca de tiempo de última lectura por lado, para poder mostrar el doble
-- check "leído" (azul) vs "entregado" (gris) como WhatsApp/Telegram.

ALTER TABLE chat_conversaciones ADD COLUMN IF NOT EXISTS usuario_leido_hasta TIMESTAMPTZ;
ALTER TABLE chat_conversaciones ADD COLUMN IF NOT EXISTS admin_leido_hasta TIMESTAMPTZ;
