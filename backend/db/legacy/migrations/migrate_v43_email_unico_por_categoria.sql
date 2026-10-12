-- v43: el correo debe ser único dentro de cada categoría de cuenta, no
-- globalmente. Antes, UNIQUE(email) impedía que una cuenta de panel/admin
-- y una de bodega (o productor) compartieran correo, aunque cada una inicia
-- sesión por un mecanismo distinto y no hay ambigüedad real:
--   - productor: CURP + NIP (POST /productor/auth/login-pin), nunca por correo.
--   - bodega y panel/admin: correo + contraseña (POST /api/auth/login), mismo
--     endpoint — el frontend ahora manda `contexto` ('admin' | 'bodega') para
--     desambiguar cuál de las dos usar cuando ambas existen y comparten correo.
--
-- Se reemplaza la restricción única global por dos índices únicos parciales,
-- uno por categoría (es_panel_usuario = TRUE para panel/admin, FALSE/NULL
-- para el resto: bodega y productor). Esto permite que un mismo correo
-- exista una vez en cada categoría, pero nunca dos veces dentro de la misma.

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_email_unique;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unique_panel
  ON usuarios (email)
  WHERE es_panel_usuario = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unique_app
  ON usuarios (email)
  WHERE es_panel_usuario IS NOT TRUE;
