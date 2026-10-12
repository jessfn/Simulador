-- Up Migration
-- T05: tablas del registro de frijol. Los datos de frijol viven en tablas propias (frijol_*), sin tocar las de maiz.

-- Datos de la parcela que sirven a cualquier programa
ALTER TABLE up
  ADD COLUMN IF NOT EXISTS numero_up                 INT,
  ADD COLUMN IF NOT EXISTS localidad                 VARCHAR(150),
  ADD COLUMN IF NOT EXISTS documento_propiedad       VARCHAR(40),    -- cat_catalog 'documento_propiedad'
  ADD COLUMN IF NOT EXISTS documento_propiedad_otro  VARCHAR(120);

-- Datos de frijol a nivel productor
CREATE TABLE frijol_productor (
  producer_id                BIGINT PRIMARY KEY REFERENCES producer(producer_id) ON DELETE CASCADE,
  total_ups_declaradas       INT NOT NULL CHECK (total_ups_declaradas >= 1),
  participa_programas_sader  BOOLEAN NOT NULL,
  programas_sader            TEXT[] NOT NULL DEFAULT '{}',   -- claves de cat_programas_gobierno
  programas_sader_otro       VARCHAR(150),
  organizacion               VARCHAR(200),
  seguro_agricola            VARCHAR(20),                    -- cat_catalog 'seguro_agricola'
  seguro_agricola_nombre     VARCHAR(150),
  creado_por                 INTEGER REFERENCES usuarios(id),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Formulario de semillas (por parcela). Se captura para todas; el sistema calcula si cumple el criterio original.
CREATE TABLE frijol_semillas (
  up_id                         BIGINT PRIMARY KEY REFERENCES up(up_id) ON DELETE CASCADE,
  se_dedica_produccion_semillas BOOLEAN NOT NULL,
  trabajo_con_prosebien         BOOLEAN NOT NULL,
  usara_prosebien_pv            BOOLEAN NOT NULL,
  cumple_criterio_original      BOOLEAN NOT NULL,   -- 1-5 ha y Durango, Nayarit o Zacatecas
  superficie_evaluada_ha        NUMERIC(10,4),
  creado_por                    INTEGER REFERENCES usuarios(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Datos de frijol a nivel cultivo del ciclo
CREATE TABLE frijol_cultivo (
  cycle_crop_id       BIGINT PRIMARY KEY REFERENCES cycle_crop(cycle_crop_id) ON DELETE CASCADE,
  tipo_siembra        VARCHAR(20),                    -- cat_catalog 'tipo_siembra_frijol' (opcional)
  densidad_kg_ha      NUMERIC(8,2) NOT NULL CHECK (densidad_kg_ha > 0),
  usa_fertilizante    BOOLEAN NOT NULL,
  tipos_fertilizante  TEXT[] NOT NULL DEFAULT '{}',
  rotacion            VARCHAR(20) NOT NULL,           -- cat_catalog 'rotacion_cultivo'
  observaciones       TEXT,
  sin_observaciones   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Trazabilidad que pide la ficha (modalidad y sincronizacion)
  capturado_en        TIMESTAMPTZ,                    -- cuando se inicio el borrador en el telefono
  hubo_desconexion    BOOLEAN NOT NULL DEFAULT FALSE, -- si el borrador estuvo sin senal en algun momento
  creado_por          INTEGER REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sin_observaciones OR length(trim(coalesce(observaciones, ''))) >= 3)
);

CREATE INDEX idx_frijol_semillas_creado_por ON frijol_semillas (creado_por);

-- Down Migration
DROP TABLE IF EXISTS frijol_cultivo;
DROP TABLE IF EXISTS frijol_semillas;
DROP TABLE IF EXISTS frijol_productor;
ALTER TABLE up
  DROP COLUMN IF EXISTS documento_propiedad_otro,
  DROP COLUMN IF EXISTS documento_propiedad,
  DROP COLUMN IF EXISTS localidad,
  DROP COLUMN IF EXISTS numero_up;
