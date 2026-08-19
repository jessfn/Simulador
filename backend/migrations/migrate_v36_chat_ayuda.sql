-- Chat de Ayuda: soporte en vivo entre productores/bodegueros y administradores.

CREATE TABLE IF NOT EXISTS chat_conversaciones (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_usuario        VARCHAR(20) NOT NULL,
  estatus            VARCHAR(20) NOT NULL DEFAULT 'abierta',
  no_leidos_admin    INT NOT NULL DEFAULT 0,
  no_leidos_usuario  INT NOT NULL DEFAULT 0,
  ultimo_mensaje_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_id)
);

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id              SERIAL PRIMARY KEY,
  conversacion_id INT NOT NULL REFERENCES chat_conversaciones(id) ON DELETE CASCADE,
  autor_id        INT NOT NULL REFERENCES usuarios(id),
  autor_rol       VARCHAR(20) NOT NULL,
  tipo            VARCHAR(20) NOT NULL DEFAULT 'texto',
  contenido       TEXT,
  archivo_url     TEXT,
  archivo_mime    VARCHAR(100),
  archivo_nombre  VARCHAR(255),
  lat             NUMERIC(10,7),
  lng             NUMERIC(10,7),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_conv ON chat_mensajes(conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conv_ultimo ON chat_conversaciones(ultimo_mensaje_at DESC);
