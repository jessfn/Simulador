-- =============================================
-- SIMAC v13 — Módulo Productor: nuevas columnas y tablas
-- =============================================

-- 2.2 Columnas nuevas en tablas existentes
ALTER TABLE producer
  ADD COLUMN IF NOT EXISTS programas_beneficiario TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estado_validacion      VARCHAR(20) DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS tipo_registro          VARCHAR(10) DEFAULT 'A';

ALTER TABLE up
  ADD COLUMN IF NOT EXISTS location_confirmed BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS centroid_source    VARCHAR(20) DEFAULT 'municipio';

-- 2.3 Tablas nuevas

-- Catálogo de programas de gobierno
CREATE TABLE IF NOT EXISTS cat_programas_gobierno (
  id      SERIAL PRIMARY KEY,
  clave   VARCHAR(50)  UNIQUE NOT NULL,
  nombre  VARCHAR(200) NOT NULL,
  activo  BOOLEAN DEFAULT TRUE
);

INSERT INTO cat_programas_gobierno (clave, nombre) VALUES
  ('fertilizantes_bienestar',  'Fertilizantes para el Bienestar'),
  ('produccion_bienestar',     'Producción para el Bienestar'),
  ('precios_garantia',         'Precios de Garantía'),
  ('maiz_blanco_precio_justo', 'Programa de Maíz Blanco / Sistema Precio Justo'),
  ('maiz_es_raiz',             'Plan El Maíz es la Raíz'),
  ('cosechando_soberania',     'Cosechando Soberanía'),
  ('sembrando_vida',           'Sembrando Vida')
ON CONFLICT (clave) DO NOTHING;

-- Costos FIRA
CREATE TABLE IF NOT EXISTS costos_fira (
  id            SERIAL PRIMARY KEY,
  estado        VARCHAR(100) NOT NULL,
  modalidad     VARCHAR(10)  NOT NULL,
  ciclo         VARCHAR(10)  NOT NULL,
  costo_por_ha  NUMERIC(10,2) NOT NULL,
  precio_fira   NUMERIC(10,2) NOT NULL,
  pct_ganancia  NUMERIC(6,4)  NOT NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  activo        BOOLEAN DEFAULT TRUE,
  updated_at    TIMESTAMP DEFAULT NOW()
);

INSERT INTO costos_fira (estado, modalidad, ciclo, costo_por_ha, precio_fira, pct_ganancia, vigente_desde) VALUES
  ('Jalisco',    'TMF', 'PV', 42200.00, 5619.00, 0.3490, '2026-01-01'),
  ('Jalisco',    'GMF', 'PV', 49985.00, 5619.00, 0.3490, '2026-01-01'),
  ('Sinaloa',    'GMF', 'OI', 48324.00, 5582.00, 0.3861, '2026-01-01'),
  ('Guanajuato', 'GMF', 'PV', 52727.00, 5619.00, 0.2788, '2026-01-01'),
  ('Guanajuato', 'BMF', 'PV', 48324.00, 5619.00, 0.2680, '2026-01-01')
ON CONFLICT DO NOTHING;

-- Municipios de referencia (centroides)
CREATE TABLE IF NOT EXISTS municipios_referencia (
  cve_geo  VARCHAR(10)  PRIMARY KEY,
  nombre   VARCHAR(200) NOT NULL,
  estado   VARCHAR(100) NOT NULL,
  centroid GEOGRAPHY(Point, 4326)
);

CREATE INDEX IF NOT EXISTS idx_municipios_referencia_nombre
  ON municipios_referencia (LOWER(nombre), LOWER(estado));

-- Alertas externas SENASICA/INIFAP
CREATE TABLE IF NOT EXISTS alertas_externas (
  id               SERIAL PRIMARY KEY,
  tipo_alerta      VARCHAR(20) NOT NULL,
  subtipo          VARCHAR(100) NOT NULL,
  nivel_riesgo     VARCHAR(10) NOT NULL,
  descripcion      TEXT NOT NULL,
  recomendacion    TEXT,
  cultivo_afectado VARCHAR(50) DEFAULT 'todos',
  coordenada       GEOGRAPHY(Point, 4326),
  radio_km         INTEGER NOT NULL DEFAULT 30,
  estado           VARCHAR(100),
  municipio        VARCHAR(100),
  fecha_deteccion  DATE NOT NULL,
  fecha_vigencia   DATE,
  fuente           VARCHAR(50) NOT NULL,
  id_alerta_origen VARCHAR(100) UNIQUE,
  activa           BOOLEAN DEFAULT TRUE,
  importado_en     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_externas_geo
  ON alertas_externas USING GIST(coordenada);

-- Intersecciones alerta <-> UP
CREATE TABLE IF NOT EXISTS alertas_up (
  alerta_id    INTEGER REFERENCES alertas_externas(id) ON DELETE CASCADE,
  up_id        INTEGER,
  distancia_km NUMERIC(8,2),
  notificado   BOOLEAN DEFAULT FALSE,
  calculado_en TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (alerta_id, up_id)
);

-- Solicitudes de apoyo del productor
CREATE TABLE IF NOT EXISTS solicitudes_apoyo (
  id                 SERIAL PRIMARY KEY,
  producer_id        INTEGER,
  infraestructura_id INTEGER,
  tipo_apoyo         VARCHAR(20) NOT NULL,
  estado             VARCHAR(20) DEFAULT 'enviada',
  notas_productor    TEXT,
  notas_ventanilla   TEXT,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- Verificar
SELECT 'Migración v13 módulo productor completada' AS status;
