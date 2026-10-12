-- =============================================================
-- MIGRACIÓN: Sistema de Permisos Administrativos SIMAC
-- Ejecutar una sola vez contra la BD de producción (RDS)
-- Es idempotente: IF NOT EXISTS en todas las operaciones
-- =============================================================

-- 1. Catálogo extensible de roles del panel admin
CREATE TABLE IF NOT EXISTS roles_panel (
  id                    SERIAL PRIMARY KEY,
  clave                 VARCHAR(40) NOT NULL UNIQUE,
  etiqueta              VARCHAR(80) NOT NULL,
  permisos_totales      BOOLEAN     NOT NULL DEFAULT FALSE,
  aplica_filtro_estado  BOOLEAN     NOT NULL DEFAULT FALSE,
  redirect_post_login   VARCHAR(60) NOT NULL DEFAULT '/admin',
  vistas_default        JSONB
);

-- Roles iniciales (ON CONFLICT evita duplicados si ya existen)
INSERT INTO roles_panel (clave, etiqueta, permisos_totales, aplica_filtro_estado, redirect_post_login, vistas_default) VALUES
  ('admin', 'Administrador',    true,  false, '/admin', null),
  ('user',  'Usuario Operativo',false, true,  '/admin', '{"productores":["ver"],"bodegas":["ver"]}'),
  ('oref',  'OREF',             false, true,  '/oref',  '{"productores":["ver","exportar"]}')
ON CONFLICT (clave) DO NOTHING;

-- 2. Columnas nuevas en usuarios (panel admin)
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS es_panel_usuario  BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estado_asignado   VARCHAR(60) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS debe_cambiar_pass BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ultimo_login      TIMESTAMPTZ DEFAULT NULL;

-- Marcar admins existentes como usuarios del panel
UPDATE usuarios
SET es_panel_usuario = TRUE
WHERE rol = 'admin' AND es_panel_usuario IS DISTINCT FROM TRUE;

-- 3. Tabla de permisos granulares por usuario × vista × acción
CREATE TABLE IF NOT EXISTS admin_permisos (
  id            SERIAL      PRIMARY KEY,
  usuario_id    INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  vista         VARCHAR(60) NOT NULL,
  sub_accion    VARCHAR(40) NOT NULL,
  habilitado    BOOLEAN     NOT NULL DEFAULT FALSE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice único para evitar duplicados y acelerar consultas
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_permisos_usuario_vista_accion
  ON admin_permisos (usuario_id, vista, sub_accion);

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
DO $$
BEGIN
  RAISE NOTICE 'roles_panel rows: %', (SELECT COUNT(*) FROM roles_panel);
  RAISE NOTICE 'admin_permisos table ready';
  RAISE NOTICE 'usuarios.es_panel_usuario: OK';
  RAISE NOTICE 'Migración completada exitosamente ✓';
END $$;
