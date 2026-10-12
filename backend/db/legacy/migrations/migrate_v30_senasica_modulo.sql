-- Migración V30: Módulo Fitosanitario SENASICA
-- Agrega tabla de parámetros de radio y campos de push a usuarios

-- 1. Tabla de parámetros de radio por nivel de riesgo (configurable sin tocar código)
CREATE TABLE IF NOT EXISTS senasica_parametros (
  id            SERIAL PRIMARY KEY,
  nivel_riesgo  VARCHAR(10) NOT NULL UNIQUE,
  radio_km      INTEGER NOT NULL,
  activo        BOOLEAN DEFAULT TRUE,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO senasica_parametros (nivel_riesgo, radio_km) VALUES
  ('alto',  50),
  ('medio', 25),
  ('bajo',  10)
ON CONFLICT (nivel_riesgo) DO NOTHING;

COMMENT ON TABLE senasica_parametros IS
  'Parámetros configurables del módulo fitosanitario SENASICA. Modificar radio_km aquí sin tocar código.';

-- 2. Tabla de historial de cargas CSV
CREATE TABLE IF NOT EXISTS senasica_cargas (
  id                    SERIAL PRIMARY KEY,
  nombre_archivo        VARCHAR(255) NOT NULL,
  usuario_id            INTEGER REFERENCES usuarios(id),
  total_puntos          INTEGER DEFAULT 0,
  total_ups_afectadas   INTEGER DEFAULT 0,
  total_notificaciones  INTEGER DEFAULT 0,
  estado                VARCHAR(20) DEFAULT 'procesando',
  error_detalle         TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  completado_en         TIMESTAMPTZ
);

COMMENT ON TABLE senasica_cargas IS
  'Historial de archivos CSV cargados desde SENASICA. Permite auditar quién cargó qué y cuándo.';

-- 3. Columnas de push nativas en usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS push_endpoint  TEXT,
  ADD COLUMN IF NOT EXISTS push_p256dh   TEXT,
  ADD COLUMN IF NOT EXISTS push_auth     TEXT,
  ADD COLUMN IF NOT EXISTS push_activo   BOOLEAN DEFAULT FALSE;

-- 4. Índice para usuarios con push activo
CREATE INDEX IF NOT EXISTS idx_usuarios_push_activo
  ON usuarios(push_activo) WHERE push_activo = TRUE;

-- 5. Tabla alertas_externas (fitosanitarias y otras fuentes externas)
CREATE TABLE IF NOT EXISTS alertas_externas (
  id                SERIAL PRIMARY KEY,
  tipo_alerta       VARCHAR(50)  NOT NULL DEFAULT 'fitosanitaria',
  subtipo           VARCHAR(100),
  nivel_riesgo      VARCHAR(20)  NOT NULL DEFAULT 'medio',
  descripcion       TEXT,
  recomendacion     TEXT,
  cultivo_afectado  VARCHAR(50)  DEFAULT 'maiz',
  coordenada        GEOGRAPHY(Point, 4326),
  radio_km          INTEGER      DEFAULT 25,
  estado            VARCHAR(10),
  municipio         VARCHAR(10),
  fecha_deteccion   DATE,
  fuente            VARCHAR(50)  DEFAULT 'SENASICA',
  id_alerta_origen  VARCHAR(200) UNIQUE,
  activa            BOOLEAN      DEFAULT TRUE,
  created_at        TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_externas_geom
  ON alertas_externas USING GIST(coordenada);

CREATE INDEX IF NOT EXISTS idx_alertas_externas_activa
  ON alertas_externas(activa) WHERE activa = TRUE;

-- 6. Tabla alertas_up (intersección alerta ↔ parcela)
CREATE TABLE IF NOT EXISTS alertas_up (
  id            SERIAL PRIMARY KEY,
  alerta_id     INTEGER NOT NULL REFERENCES alertas_externas(id) ON DELETE CASCADE,
  up_id         INTEGER NOT NULL REFERENCES up(up_id) ON DELETE CASCADE,
  distancia_km  NUMERIC(8,2),
  notificado    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alerta_id, up_id)
);

CREATE INDEX IF NOT EXISTS idx_alertas_up_alerta ON alertas_up(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alertas_up_up     ON alertas_up(up_id);

-- 7. Columnas extra en notificaciones para alertas fitosanitarias
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS titulo  TEXT,
  ADD COLUMN IF NOT EXISTS mensaje TEXT,
  ADD COLUMN IF NOT EXISTS tipo    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS alerta_externa_id INTEGER REFERENCES alertas_externas(id);
