-- migrate_v8_bodeguero.sql
-- Módulo Bodega — SIMAC Plan Nacional Maíz 2026
-- NUNCA recrear tablas existentes. Solo ALTER y CREATE NEW.

-- ─────────────────────────────────────────────────────────────
-- 1. RENAME rol bodeguero → bodega
-- ─────────────────────────────────────────────────────────────
UPDATE usuarios SET rol = 'bodega' WHERE rol = 'bodeguero';

-- ─────────────────────────────────────────────────────────────
-- 2. ALTER TABLE bodegas — 3 columnas nuevas de semáforo
-- ─────────────────────────────────────────────────────────────
ALTER TABLE bodegas
  ADD COLUMN IF NOT EXISTS semaforo_compra VARCHAR(10) DEFAULT 'verde'
    CHECK (semaforo_compra IN ('verde','amarillo','rojo')),
  ADD COLUMN IF NOT EXISTS semaforo_updated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS semaforo_usuario_id INTEGER REFERENCES usuarios(id);

-- ─────────────────────────────────────────────────────────────
-- 3. ALTER TABLE inventarios — 3 columnas nuevas
-- ─────────────────────────────────────────────────────────────
ALTER TABLE inventarios
  ADD COLUMN IF NOT EXISTS variedad_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS humedad_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS calidad VARCHAR(10) CHECK (calidad IN ('primera','segunda'));

-- ─────────────────────────────────────────────────────────────
-- 4. ALTER TABLE precios — 3 columnas nuevas
-- ─────────────────────────────────────────────────────────────
ALTER TABLE precios
  ADD COLUMN IF NOT EXISTS variedad_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS humedad_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS calidad VARCHAR(10) CHECK (calidad IN ('primera','segunda'));

-- ─────────────────────────────────────────────────────────────
-- 5. NUEVA TABLA: bodeguero_bodegas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bodeguero_bodegas (
  id                SERIAL PRIMARY KEY,
  usuario_id        INTEGER NOT NULL REFERENCES usuarios(id),
  bodega_id         INTEGER NOT NULL REFERENCES bodegas(id),
  estatus           VARCHAR(20) DEFAULT 'aprobada' CHECK (estatus IN ('aprobada','pendiente','rechazada')),
  fecha_solicitud   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  aprobado_por      INTEGER REFERENCES usuarios(id),
  fecha_aprobacion  TIMESTAMP,
  UNIQUE(usuario_id, bodega_id)
);

-- ─────────────────────────────────────────────────────────────
-- 6. NUEVA TABLA: senales_compra
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS senales_compra (
  id                SERIAL PRIMARY KEY,
  bodega_id         INTEGER NOT NULL REFERENCES bodegas(id),
  usuario_id        INTEGER NOT NULL REFERENCES usuarios(id),
  tipo_maiz         VARCHAR(20) NOT NULL,
  variedad_code     VARCHAR(40),
  volumen_ton       NUMERIC(10,2),
  precio_ofrecido   NUMERIC(10,2) NOT NULL,
  radio_km          INTEGER DEFAULT 50,
  vigencia          VARCHAR(20) NOT NULL CHECK (vigencia IN ('esta_semana','15_dias')),
  fecha_vencimiento DATE NOT NULL,
  activa            BOOLEAN DEFAULT TRUE,
  interesados_count INTEGER DEFAULT 0,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 7. NUEVA TABLA: transacciones
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transacciones (
  id                        SERIAL PRIMARY KEY,
  bodega_id                 INTEGER NOT NULL REFERENCES bodegas(id),
  usuario_bodeguero         INTEGER NOT NULL REFERENCES usuarios(id),
  producer_id               BIGINT REFERENCES producer(producer_id),
  nombre_productor_libre    VARCHAR(200),
  tipo_maiz                 VARCHAR(20) NOT NULL,
  variedad_code             VARCHAR(40),
  volumen_ton               NUMERIC(10,2) NOT NULL,
  precio_ton                NUMERIC(10,2) NOT NULL,
  fecha                     DATE NOT NULL CHECK (fecha <= CURRENT_DATE),
  confirmacion_productor    VARCHAR(20) DEFAULT 'pendiente'
    CHECK (confirmacion_productor IN ('pendiente','confirmada','discrepancia','expirada')),
  peso_precio_sistema       NUMERIC(3,2) DEFAULT 0.5,
  notas                     TEXT,
  created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 8. NUEVA TABLA: cat_conceptos_servicio
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cat_conceptos_servicio (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  icono          VARCHAR(50),
  unidad_default VARCHAR(20) DEFAULT 'MXN/ton'
    CHECK (unidad_default IN ('MXN/ton','MXN/ton/mes','MXN/viaje')),
  estatus        VARCHAR(20) DEFAULT 'aprobado' CHECK (estatus IN ('aprobado','pendiente')),
  propuesto_por  INTEGER REFERENCES usuarios(id)
);

-- Insertar 7 conceptos base
INSERT INTO cat_conceptos_servicio (nombre, icono, unidad_default, estatus, propuesto_por)
SELECT nombre, icono, unidad_default, 'aprobado', NULL
FROM (VALUES
  ('Recepción y descarga',   'truck',   'MXN/ton'),
  ('Pesaje',                 'scale',   'MXN/ton'),
  ('Limpieza',               'wind',    'MXN/ton'),
  ('Secado',                 'sun',     'MXN/ton'),
  ('Almacenamiento',         'box',     'MXN/ton/mes'),
  ('Fumigación',             'shield',  'MXN/ton'),
  ('Maniobras de carga',     'package', 'MXN/ton')
) AS t(nombre, icono, unidad_default)
WHERE NOT EXISTS (SELECT 1 FROM cat_conceptos_servicio WHERE nombre = t.nombre);

-- ─────────────────────────────────────────────────────────────
-- 9. NUEVA TABLA: tarifario_servicios
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarifario_servicios (
  id              SERIAL PRIMARY KEY,
  bodega_id       INTEGER NOT NULL REFERENCES bodegas(id),
  concepto_id     INTEGER NOT NULL REFERENCES cat_conceptos_servicio(id),
  precio          NUMERIC(10,2) NOT NULL,
  vigencia_inicio DATE DEFAULT CURRENT_DATE,
  vigencia_fin    DATE,
  activo          BOOLEAN DEFAULT TRUE,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 10. NUEVA TABLA: ventanillas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventanillas (
  id                       SERIAL PRIMARY KEY,
  bodega_id                INTEGER NOT NULL REFERENCES bodegas(id),
  usuario_id               INTEGER NOT NULL REFERENCES usuarios(id),
  nombre_enlace_agricultura VARCHAR(200) NOT NULL,
  nombre_ventanilla        VARCHAR(200),
  telefono_responsable     VARCHAR(20) NOT NULL,
  correo_responsable       VARCHAR(200) NOT NULL,
  tipo                     VARCHAR(20) CHECK (tipo IN ('coberturas','incentivos','ambos')),
  estatus                  VARCHAR(20) DEFAULT 'activa' CHECK (estatus IN ('activa','inactiva')),
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 11. NUEVA TABLA: apoyos_ventanilla
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apoyos_ventanilla (
  id              SERIAL PRIMARY KEY,
  ventanilla_id   INTEGER NOT NULL REFERENCES ventanillas(id),
  nombre_apoyo    VARCHAR(50) CHECK (nombre_apoyo IN ('coberturas','incentivos')),
  descripcion     TEXT,
  requisitos      TEXT,
  disponible      BOOLEAN DEFAULT TRUE,
  cupo_disponible INTEGER,
  vigencia_fin    DATE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 12. NUEVA TABLA: solicitudes_apoyo
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes_apoyo (
  id            SERIAL PRIMARY KEY,
  ventanilla_id INTEGER NOT NULL REFERENCES ventanillas(id),
  apoyo_id      INTEGER NOT NULL REFERENCES apoyos_ventanilla(id),
  producer_id   BIGINT REFERENCES producer(producer_id),
  estado        VARCHAR(20) DEFAULT 'recibida'
    CHECK (estado IN ('recibida','contactado','agendada','canalizada','cerrada')),
  notas         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────
-- 13. ALTER TABLE notificaciones — agregar campos para nuevos tipos
-- ─────────────────────────────────────────────────────────────
ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS mensaje TEXT,
  ADD COLUMN IF NOT EXISTS referencia_id INTEGER,
  ADD COLUMN IF NOT EXISTS referencia_tipo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ─────────────────────────────────────────────────────────────
-- 14. Índices útiles
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_senales_compra_bodega_activa ON senales_compra(bodega_id, activa);
CREATE INDEX IF NOT EXISTS idx_transacciones_bodega ON transacciones(bodega_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_confirmacion ON transacciones(confirmacion_productor);
CREATE INDEX IF NOT EXISTS idx_bodeguero_bodegas_usuario ON bodeguero_bodegas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tarifario_bodega ON tarifario_servicios(bodega_id, activo);
