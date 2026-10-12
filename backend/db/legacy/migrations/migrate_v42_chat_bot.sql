-- Asistente automático del chat de ayuda (productor/bodeguero, nunca admin).
-- Usa un usuario sintético como autor de los mensajes del bot para poder
-- reusar chat_mensajes.autor_id (FK a usuarios) sin cambiar el esquema.

INSERT INTO usuarios (email, nombre_completo, password_hash, rol, activo)
SELECT 'bot@simac.interno', 'Asistente SIMAC', 'no_login_bot_usuario_sintetico', 'bot', true
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'bot@simac.interno');

-- Si el bot está activo en la conversación, cada mensaje del usuario dispara
-- una respuesta automática. Se apaga en cuanto un admin responde (para no
-- competir con una persona ya atendiendo) y se reactiva al resolver el chat.
ALTER TABLE chat_conversaciones ADD COLUMN IF NOT EXISTS bot_activo BOOLEAN NOT NULL DEFAULT TRUE;
