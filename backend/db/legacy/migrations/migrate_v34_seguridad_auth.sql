-- Endurecimiento de autenticación: bloqueo por intentos fallidos y
-- revocación de tokens JWT (denylist). Requerido por el reporte de
-- evaluación de seguridad (Hallazgos 1, 2 y 4).

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS intentos_fallidos  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloqueado_hasta     TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti         TEXT PRIMARY KEY,
  usuario_id  INT,
  expira_en   TIMESTAMPTZ NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expira ON revoked_tokens (expira_en);
