-- =============================================================
-- Migración v44: Módulo "Técnicos ECA" — Registro Alterno
-- =============================================================
-- NOTA: roles_panel(id, clave, etiqueta, permisos_totales, aplica_filtro_estado,
-- redirect_post_login, vistas_default) ya existe (backend/scripts/migrate_v_permisos.sql).
-- usuarios.debe_cambiar_pass y usuarios.nombre_completo también ya existen
-- (migrate_v_permisos.sql y sql/init.sql respectivamente) — no se tocan aquí.
-- producer.usuario_capturista_id y producer.tecnico_asignado_id ya existen
-- (sql/migrate_v5_productor_paso1.sql:23-24) — solo falta el índice.

INSERT INTO roles_panel
  (clave, etiqueta, permisos_totales, aplica_filtro_estado, redirect_post_login, vistas_default)
VALUES
  ('capturista', 'Técnico ECA', false, false, '/tecnico', null)
ON CONFLICT (clave) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_producer_capturista ON producer(usuario_capturista_id);
