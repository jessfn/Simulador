-- Up Migration
-- T02: programas. Un productor/tecnico puede estar en uno o varios programas sin duplicar a la persona.
-- Todos los productores y tecnicos actuales quedan en 'simac_maiz' y nada de maiz cambia.

CREATE TABLE cat_programa (
  clave    VARCHAR(30) PRIMARY KEY,
  nombre   VARCHAR(120) NOT NULL,
  cultivo  VARCHAR(10),
  activo   BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO cat_programa (clave, nombre, cultivo) VALUES
  ('simac_maiz', 'SIMAC – Plan Nacional Maíz', 'maiz'),
  ('frijol_afb', 'Frijol – Alimentación para el Bienestar', 'frijol');

-- Productor en uno o varios programas
CREATE TABLE producer_programa (
  producer_id                 BIGINT      NOT NULL REFERENCES producer(producer_id) ON DELETE CASCADE,
  programa                    VARCHAR(30) NOT NULL REFERENCES cat_programa(clave),
  usuario_capturista_id       INTEGER     REFERENCES usuarios(id),          -- tecnico responsable en ESTE programa
  verificacion_identidad      VARCHAR(20) NOT NULL DEFAULT 'verificada',    -- verificada | pendiente | no_valida
  estatus_registro            VARCHAR(30) NOT NULL DEFAULT 'enviado',       -- enviado | requiere_correccion | validado
  verificacion_intentos       INT         NOT NULL DEFAULT 0,
  verificacion_ultimo_intento TIMESTAMPTZ,
  fecha_alta                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (producer_id, programa)
);
CREATE INDEX idx_producer_programa_programa   ON producer_programa(programa);
CREATE INDEX idx_producer_programa_capturista ON producer_programa(usuario_capturista_id);

-- Tecnico: tipo, programas y zona
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_tecnico VARCHAR(40);  -- codigo de cat_catalog 'tipo_tecnico'

CREATE TABLE usuario_programa (
  usuario_id INTEGER     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  programa   VARCHAR(30) NOT NULL REFERENCES cat_programa(clave),
  PRIMARY KEY (usuario_id, programa)
);

CREATE TABLE tecnico_zona (
  id               SERIAL PRIMARY KEY,
  usuario_id       INTEGER    NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  state_id         VARCHAR(2) NOT NULL,
  municipality_id  VARCHAR(5)          -- NULL = todo el estado
);
CREATE UNIQUE INDEX uq_tecnico_zona ON tecnico_zona (usuario_id, state_id, COALESCE(municipality_id, ''));

-- Historial de cambios a datos personales (el tecnico puede corregir datos de un productor ya existente)
CREATE TABLE producer_cambios (
  id             BIGSERIAL PRIMARY KEY,
  producer_id    BIGINT      NOT NULL REFERENCES producer(producer_id) ON DELETE CASCADE,
  campo          VARCHAR(80) NOT NULL,
  valor_anterior TEXT,
  valor_nuevo    TEXT,
  usuario_id     INTEGER     REFERENCES usuarios(id),
  programa       VARCHAR(30) REFERENCES cat_programa(clave),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_producer_cambios_producer ON producer_cambios(producer_id);

-- Llenado: todos los productores actuales son de SIMAC maiz
INSERT INTO producer_programa (producer_id, programa, usuario_capturista_id, fecha_alta)
SELECT producer_id, 'simac_maiz', usuario_capturista_id, COALESCE(created_at, NOW())
  FROM producer
ON CONFLICT DO NOTHING;

-- Los tecnicos actuales (rol capturista) registran maiz
INSERT INTO usuario_programa (usuario_id, programa)
SELECT id, 'simac_maiz' FROM usuarios WHERE rol = 'capturista'
ON CONFLICT DO NOTHING;

-- Down Migration
DROP TABLE IF EXISTS producer_cambios;
DROP TABLE IF EXISTS tecnico_zona;
DROP TABLE IF EXISTS usuario_programa;
DROP TABLE IF EXISTS producer_programa;
ALTER TABLE usuarios DROP COLUMN IF EXISTS tipo_tecnico;
DROP TABLE IF EXISTS cat_programa;
