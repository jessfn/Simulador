-- v45: Encuesta de intención de compra de insumos (Sinaloa) — Ticket 01.
-- Ver SIMAC_tickets/01_DATOS_Y_CATALOGOS.md. Migración aditiva: no borra ni
-- toca tablas existentes. Repetible: todo INSERT usa ON CONFLICT.

CREATE TABLE IF NOT EXISTS encuesta_ediciones (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(100) NOT NULL,
  horizonte_meses   INT NOT NULL DEFAULT 6,
  version_catalogo  VARCHAR(10) NOT NULL,
  habilitada        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS encuesta_categorias (
  id      VARCHAR(10) PRIMARY KEY,
  nombre  VARCHAR(120) NOT NULL,
  ayuda   TEXT
);

-- clasificacion_interna existe solo para catálogo/admin; el frontend del
-- productor nunca debe leer ni mostrar esa columna (ver ticket 03).
CREATE TABLE IF NOT EXISTS encuesta_productos (
  id                        VARCHAR(15) PRIMARY KEY,
  categoria_id              VARCHAR(10) NOT NULL REFERENCES encuesta_categorias(id),
  nombre_visible            VARCHAR(160) NOT NULL,
  requiere_nombre_conocido  BOOLEAN NOT NULL DEFAULT FALSE,
  activo                    BOOLEAN NOT NULL DEFAULT TRUE,
  version_catalogo          VARCHAR(10) NOT NULL,
  formula_referencia        VARCHAR(40),
  es_otro                   BOOLEAN NOT NULL DEFAULT FALSE,
  clasificacion_interna     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_encuesta_productos_categoria ON encuesta_productos(categoria_id);

CREATE TABLE IF NOT EXISTS encuesta_presentaciones (
  id            VARCHAR(15) PRIMARY KEY,
  producto_id   VARCHAR(15) NOT NULL REFERENCES encuesta_productos(id),
  envase        VARCHAR(60) NOT NULL,
  contenido     NUMERIC(12,4) NOT NULL CHECK (contenido > 0),
  unidad        VARCHAR(10) NOT NULL, -- kg | L | semillas
  nombre_origen VARCHAR(160),
  activo        BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_encuesta_presentaciones_producto ON encuesta_presentaciones(producto_id);

CREATE TABLE IF NOT EXISTS encuesta_alias (
  id              SERIAL PRIMARY KEY,
  texto_busqueda  VARCHAR(160) NOT NULL,
  producto_id     VARCHAR(15) NOT NULL REFERENCES encuesta_productos(id)
);
CREATE INDEX IF NOT EXISTS idx_encuesta_alias_texto ON encuesta_alias(texto_busqueda);

-- Una respuesta por productor y edición (regla 4 y 6 de 00_CONTEXTO).
CREATE TABLE IF NOT EXISTS encuesta_respuestas (
  id                SERIAL PRIMARY KEY,
  producer_id       INT NOT NULL REFERENCES producer(producer_id),
  edicion_id        INT NOT NULL REFERENCES encuesta_ediciones(id),
  respuesta         VARCHAR(3) NOT NULL CHECK (respuesta IN ('si','no')),
  periodo_inicio    DATE NOT NULL,
  periodo_fin       DATE NOT NULL,
  version_catalogo  VARCHAR(10) NOT NULL,
  canal             VARCHAR(20) NOT NULL DEFAULT 'productor' CHECK (canal IN ('productor','tecnico')),
  capturista_id     INT REFERENCES usuarios(id),
  version           INT NOT NULL DEFAULT 1, -- control de concurrencia optimista
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (producer_id, edicion_id)
);

-- Municipios de las parcelas de Sinaloa vinculadas a la respuesta, para no
-- distribuir/duplicar cantidades por municipio (regla 4 de 00_CONTEXTO).
CREATE TABLE IF NOT EXISTS encuesta_contexto_territorial (
  id                 SERIAL PRIMARY KEY,
  respuesta_id       INT NOT NULL REFERENCES encuesta_respuestas(id) ON DELETE CASCADE,
  up_id              INT NOT NULL REFERENCES up(up_id),
  municipality_id    VARCHAR(5),
  municipality_name  VARCHAR(120),
  UNIQUE (respuesta_id, up_id)
);
CREATE INDEX IF NOT EXISTS idx_encuesta_contexto_municipio ON encuesta_contexto_territorial(municipality_id);

CREATE TABLE IF NOT EXISTS encuesta_lineas (
  id                            SERIAL PRIMARY KEY,
  respuesta_id                  INT NOT NULL REFERENCES encuesta_respuestas(id) ON DELETE CASCADE,
  producto_id                   VARCHAR(15) REFERENCES encuesta_productos(id),
  producto_nombre_otro          VARCHAR(160),
  presentacion_id               VARCHAR(15) REFERENCES encuesta_presentaciones(id),
  presentacion_otro_envase      VARCHAR(60),
  presentacion_otro_contenido   NUMERIC(12,4),
  presentacion_otro_unidad      VARCHAR(10),
  a_granel                      BOOLEAN NOT NULL DEFAULT FALSE,
  cantidad                      NUMERIC(12,4) NOT NULL CHECK (cantidad > 0),
  mes_compra                    DATE NOT NULL,
  nombre_conocido                VARCHAR(160),
  preferencia_marca             VARCHAR(120),
  identificacion_pendiente      BOOLEAN NOT NULL DEFAULT FALSE,
  cantidad_base                 NUMERIC(14,4),
  unidad_base                   VARCHAR(10),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_encuesta_lineas_respuesta ON encuesta_lineas(respuesta_id);
CREATE INDEX IF NOT EXISTS idx_encuesta_lineas_producto ON encuesta_lineas(producto_id);

-- Idempotencia del alta (ticket 02): misma clave + mismo contenido devuelve
-- el mismo resultado; misma clave + contenido distinto es conflicto.
CREATE TABLE IF NOT EXISTS registro_idempotencia (
  clave       VARCHAR(80) PRIMARY KEY,
  huella      VARCHAR(64) NOT NULL,
  resultado   JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Catálogo (SIMAC_tickets/catalogos/Catalogo_SIMAC_v2.json) ─────────────

-- Catálogo SIMAC v2.0 — revisado 2026-09-15. Generado desde Catalogo_SIMAC_v2.json.

INSERT INTO encuesta_categorias (id, nombre, ayuda) VALUES
  ('FER', 'Fertilizantes y nutrición', 'Productos para nutrir el cultivo'),
  ('SEM', 'Semillas', 'Semillas para siembra'),
  ('HER', 'Herbicidas', 'Productos para malezas'),
  ('INS', 'Insecticidas', 'Productos para insectos y otras plagas'),
  ('FUN', 'Fungicidas', 'Productos para enfermedades causadas por hongos'),
  ('BIO', 'Bioinsumos', 'Inoculantes y productos biológicos'),
  ('OTR', 'Otros insumos', 'Adherentes, mejoradores y otros productos')
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, ayuda = EXCLUDED.ayuda;

INSERT INTO encuesta_productos (id, categoria_id, nombre_visible, requiere_nombre_conocido, activo, version_catalogo, formula_referencia, es_otro, clasificacion_interna) VALUES
  ('FER-001', 'FER', 'Urea granular (46-0-0)', FALSE, TRUE, '2.0', '46-0-0', FALSE, 'Producto o grupo para encuesta'),
  ('FER-002', 'FER', 'DAP (18-46-0)', FALSE, TRUE, '2.0', '18-46-0', FALSE, 'Producto o grupo para encuesta'),
  ('FER-003', 'FER', 'Cloruro de potasio', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-004', 'FER', 'Sulfato de amonio granular', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-005', 'FER', 'Sulfato de amonio estándar', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-006', 'FER', 'Fertilizante 20-30-10', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-007', 'FER', 'Fertilizante nitrogenado N 44%', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-008', 'FER', 'Fertilizante foliar 8-24-4', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-009', 'FER', 'MAP (11-52-0)', FALSE, TRUE, '2.0', '11-52-0', FALSE, 'Producto o grupo para encuesta'),
  ('FER-010', 'FER', 'Sulfato de potasio', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-011', 'FER', 'Amoniaco para uso agrícola', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-012', 'FER', 'Mezcla de fertilizantes', TRUE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FER-999', 'FER', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación'),
  ('SEM-001', 'SEM', 'Semilla de maíz blanco híbrido', TRUE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('SEM-999', 'SEM', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación'),
  ('HER-001', 'HER', 'Glifosato', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('HER-002', 'HER', 'Glufosinato de amonio', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('HER-003', 'HER', 'Atrazina', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('HER-004', 'HER', 'Acetoclor', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('HER-005', 'HER', 'Nicosulfurón', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('HER-999', 'HER', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación'),
  ('INS-001', 'INS', 'Cipermetrina', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-002', 'INS', 'Bifentrina', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-003', 'INS', 'Clorantraniliprol', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-004', 'INS', 'Benzoato de emamectina', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-005', 'INS', 'Lufenurón', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-006', 'INS', 'Metoxifenocida', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-007', 'INS', 'Spinetoram', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('INS-999', 'INS', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación'),
  ('FUN-001', 'FUN', 'Tebuconazol', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FUN-002', 'FUN', 'Azoxistrobin + propiconazol', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('FUN-999', 'FUN', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación'),
  ('BIO-001', 'BIO', 'Inoculante o biofertilizante', TRUE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('BIO-002', 'BIO', 'Bioestimulante biológico optimizador de nitrógeno', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('BIO-999', 'BIO', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación'),
  ('OTR-001', 'OTR', 'Adherente o dispersante', FALSE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('OTR-002', 'OTR', 'Mejorador de suelo', TRUE, TRUE, '2.0', NULL, FALSE, 'Producto o grupo para encuesta'),
  ('OTR-999', 'OTR', 'Otro producto / No encuentro el mío', TRUE, TRUE, '2.0', NULL, TRUE, 'Solicitud de identificación')
ON CONFLICT (id) DO UPDATE SET
  categoria_id = EXCLUDED.categoria_id, nombre_visible = EXCLUDED.nombre_visible,
  requiere_nombre_conocido = EXCLUDED.requiere_nombre_conocido, activo = EXCLUDED.activo,
  version_catalogo = EXCLUDED.version_catalogo, formula_referencia = EXCLUDED.formula_referencia,
  es_otro = EXCLUDED.es_otro, clasificacion_interna = EXCLUDED.clasificacion_interna;

INSERT INTO encuesta_presentaciones (id, producto_id, envase, contenido, unidad, nombre_origen, activo) VALUES
  ('PRE-001', 'FER-001', 'Bulto', 50, 'kg', 'UREA GRANULAR', TRUE),
  ('PRE-002', 'FER-002', 'Bulto', 50, 'kg', 'FORMULA D.A.P', TRUE),
  ('PRE-003', 'FER-003', 'Bulto', 50, 'kg', 'CLORURO DE POTASIO', TRUE),
  ('PRE-004', 'FER-004', 'Bulto', 50, 'kg', 'SULFATO DE AMONIO GRAN', TRUE),
  ('PRE-005', 'FER-005', 'Bulto', 50, 'kg', 'SULFATO DE AMONIO STD', TRUE),
  ('PRE-006', 'FER-006', 'Envase', 1, 'kg', 'SUPER GREEN 20-30-10 PS', TRUE),
  ('PRE-007', 'FER-006', 'Envase', 1, 'kg', 'VIGORE 20-30-10 PS', TRUE),
  ('PRE-008', 'FER-007', 'Envase', 1, 'kg', 'SUPER GREEN UREA PS', TRUE),
  ('PRE-009', 'FER-008', 'Envase', 1, 'L', 'ACTIVADOR 8-24-4 1LT', TRUE),
  ('PRE-010', 'SEM-001', 'Bulto', 60000, 'semillas', 'P3011W', TRUE),
  ('PRE-011', 'SEM-001', 'Bulto', 60000, 'semillas', 'P3051W', TRUE),
  ('PRE-012', 'SEM-001', 'Bulto', 60000, 'semillas', 'MW-01', TRUE),
  ('PRE-013', 'SEM-001', 'Bulto', 18, 'kg', 'C-05', TRUE),
  ('PRE-014', 'SEM-001', 'Bulto', 60000, 'semillas', 'BRAGADO', TRUE),
  ('PRE-015', 'SEM-001', 'Bulto', 60000, 'semillas', 'CANELO', TRUE),
  ('PRE-016', 'HER-001', 'Envase', 950, 'mL', 'GLIFOSATO', TRUE),
  ('PRE-017', 'HER-002', 'Envase', 950, 'mL', 'GLUFOSINATO DE AMONIO', TRUE),
  ('PRE-018', 'HER-002', 'Envase', 1, 'L', 'AGROFOSINATO (GLUFOSINATO DE AMONIO)', TRUE),
  ('PRE-019', 'HER-003', 'Envase', 1, 'L', 'ATRAZINA', TRUE),
  ('PRE-020', 'HER-003', 'Bolsa', 1, 'kg', 'ATRAZINA', TRUE),
  ('PRE-021', 'HER-004', 'Envase', 1, 'L', 'ACETOCLOR', TRUE),
  ('PRE-022', 'HER-005', 'Envase', 1, 'L', 'BULLTERRIER 4% OD', TRUE),
  ('PRE-023', 'INS-001', 'Envase', 1, 'L', 'CIMETRIN 200 (CIPERMETRINA)', TRUE),
  ('PRE-024', 'INS-002', 'Envase', 1, 'L', 'INTERBIPHEN (BIFENTRINA)', TRUE),
  ('PRE-025', 'INS-003', 'Envase', 1, 'L', 'CLORANTRANILIPROL', TRUE),
  ('PRE-026', 'INS-004', 'Envase', 200, 'mL', 'BENZOATO DE EMAMECTINA', TRUE),
  ('PRE-027', 'INS-006', 'Envase', 1, 'L', 'METOXIFENOCIDA', TRUE),
  ('PRE-028', 'FUN-001', 'Envase', 1, 'L', 'INTERTEBUC (TEBUCONAZOL)', TRUE),
  ('PRE-029', 'FUN-002', 'Envase', 800, 'mL', 'AZOXYSTROBIN + PROPICONAZOL', TRUE),
  ('PRE-030', 'FUN-002', 'Envase', 1, 'L', 'INTERAZOXI PRO (AZOXISTROBIN + PROPICONAZOL)', TRUE),
  ('PRE-031', 'BIO-001', 'Bolsa', 100, 'g', 'AZ SEED', TRUE),
  ('PRE-032', 'BIO-001', 'Bolsa', 100, 'g', 'BIOSSER TS', TRUE),
  ('PRE-033', 'BIO-001', 'Bolsa', 1, 'kg', 'GLUMIX', TRUE),
  ('PRE-034', 'BIO-001', 'Bulto', 20, 'kg', 'GLUMIX GRANULADO', TRUE),
  ('PRE-035', 'BIO-002', 'Bolsa', 0.333, 'kg', 'UTRISHA N', TRUE),
  ('PRE-036', 'OTR-002', 'Envase', 5, 'L', 'FERTIMOR', TRUE),
  ('PRE-037', 'OTR-002', 'Envase', 20, 'L', 'FERTIMOR', TRUE),
  ('PRE-038', 'OTR-002', 'Envase', 0.5, 'L', 'VITASOIL BEST', TRUE),
  ('PRE-039', 'INS-007', 'Envase', 100, 'mL', 'Palgus', TRUE),
  ('PRE-040', 'INS-007', 'Envase', 1, 'L', 'Palgus', TRUE)
ON CONFLICT (id) DO UPDATE SET
  producto_id = EXCLUDED.producto_id, envase = EXCLUDED.envase, contenido = EXCLUDED.contenido,
  unidad = EXCLUDED.unidad, nombre_origen = EXCLUDED.nombre_origen, activo = TRUE;

DELETE FROM encuesta_alias;
INSERT INTO encuesta_alias (texto_busqueda, producto_id) VALUES
  ('UREA GRANULAR', 'FER-001'),
  ('FORMULA D.A.P', 'FER-002'),
  ('CLORURO DE POTASIO', 'FER-003'),
  ('SULFATO DE AMONIO GRAN', 'FER-004'),
  ('SULFATO DE AMONIO STD', 'FER-005'),
  ('SUPER GREEN 20-30-10 PS', 'FER-006'),
  ('VIGORE 20-30-10 PS', 'FER-006'),
  ('SUPER GREEN UREA PS', 'FER-007'),
  ('ACTIVADOR 8-24-4 1LT', 'FER-008'),
  ('P3011W', 'SEM-001'),
  ('P3051W', 'SEM-001'),
  ('BRAGADO', 'SEM-001'),
  ('MW-01', 'SEM-001'),
  ('C-05', 'SEM-001'),
  ('CANELO', 'SEM-001'),
  ('GLIFOSATO', 'HER-001'),
  ('GLUFOSINATO DE AMONIO', 'HER-002'),
  ('AGROFOSINATO (GLUFOSINATO DE AMONIO)', 'HER-002'),
  ('ATRAZINA', 'HER-003'),
  ('ACETOCLOR', 'HER-004'),
  ('BULLTERRIER 4% OD', 'HER-005'),
  ('CIMETRIN 200 (CIPERMETRINA)', 'INS-001'),
  ('INTERBIPHEN (BIFENTRINA)', 'INS-002'),
  ('CLORANTRANILIPROL', 'INS-003'),
  ('BENZOATO DE EMAMECTINA', 'INS-004'),
  ('LUFENURON', 'INS-005'),
  ('METOXIFENOCIDA', 'INS-006'),
  ('INTERTEBUC (TEBUCONAZOL)', 'FUN-001'),
  ('AZOXYSTROBIN + PROPICONAZOL', 'FUN-002'),
  ('INTERAZOXI PRO (AZOXISTROBIN + PROPICONAZOL)', 'FUN-002'),
  ('AZ SEED', 'BIO-001'),
  ('BIOSSER TS', 'BIO-001'),
  ('GLUMIX', 'BIO-001'),
  ('GLUMIX GRANULADO', 'BIO-001'),
  ('UTRISHA N', 'BIO-002'),
  ('SUPER CORAL ADH', 'OTR-001'),
  ('FERTIMOR', 'OTR-002'),
  ('VITASOIL BEST', 'OTR-002'),
  ('Urea 46-0-0', 'FER-001'),
  ('Fosfato diamónico', 'FER-002'),
  ('Fosfato monoamónico 11-52-0', 'FER-009'),
  ('Gas amoniaco', 'FER-011'),
  ('Mezcla física', 'FER-012'),
  ('PALGUS', 'INS-007'),
  ('DENIM 19 CE', 'INS-004');

-- Edición vigente: horizonte de 6 meses desde HOY. Repetible: solo crea la
-- edición si no existe ya una habilitada con este catálogo.
INSERT INTO encuesta_ediciones (nombre, horizonte_meses, version_catalogo, habilitada)
SELECT 'Encuesta de insumos 2026 — Sinaloa', 6, '2.0', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM encuesta_ediciones WHERE version_catalogo = '2.0' AND habilitada = TRUE
);
