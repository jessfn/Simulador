-- Tablas para Módulo A4 — Precios Sistema
-- Ejecutar una sola vez en producción

-- Parámetros del modelo de Precio Sistema
CREATE TABLE IF NOT EXISTS precio_parametros (
  id               SERIAL PRIMARY KEY,
  margen_pct       NUMERIC(5,2)  DEFAULT 10.0,
  ventana_dias     INT           DEFAULT 7,
  min_txns         INT           DEFAULT 10,
  harineras_n      INT           DEFAULT 3,
  servicios_default NUMERIC(10,2) DEFAULT 980.0,
  flete_default    NUMERIC(10,2) DEFAULT 1058.0,
  costo_fira       NUMERIC(10,2) DEFAULT 5466.0,
  precio_garantia_sader NUMERIC(10,2) DEFAULT 6200.0,
  actualizado_por  INT           REFERENCES usuarios(id),
  actualizado_at   TIMESTAMP     DEFAULT NOW()
);

-- Insertar fila inicial si no existe
INSERT INTO precio_parametros (margen_pct, ventana_dias, min_txns, harineras_n)
SELECT 10.0, 7, 10, 3
WHERE NOT EXISTS (SELECT 1 FROM precio_parametros);

-- Discrepancias pendientes de revisión
CREATE TABLE IF NOT EXISTS discrepancias (
  id            SERIAL PRIMARY KEY,
  tipo          VARCHAR(80)  NOT NULL,
  prioridad     VARCHAR(10)  NOT NULL CHECK (prioridad IN ('ALTA','MEDIA','BAJA')),
  descripcion   TEXT,
  accion        VARCHAR(40),
  estado        VARCHAR(20)  DEFAULT 'pendiente',
  datos         JSONB,
  creado_at     TIMESTAMP    DEFAULT NOW(),
  resuelto_at   TIMESTAMP,
  resuelto_por  INT          REFERENCES usuarios(id)
);

-- Datos de ejemplo para discrepancias
INSERT INTO discrepancias (tipo, prioridad, descripcion, accion, datos) VALUES
  ('precio_diferencia',   'ALTA',  'Bodeguero reportó $5,200/ton, productor confirmó $4,800/ton en municipio Salvatierra', 'Revisar', '{"bodega_precio":5200,"productor_precio":4800,"municipio":"Salvatierra","estado":"Guanajuato"}'),
  ('precio_fuera_rango',  'ALTA',  'Precio publicado 28% sobre promedio regional últimos 7 días en Celaya', 'Revisar', '{"precio":6100,"promedio_regional":4758,"municipio":"Celaya","estado":"Guanajuato"}'),
  ('sin_tecnico_activo',  'ALTA',  'Municipio La Piedad sin validación técnica en 7 días (12 transacciones sin triangular)', 'Asignar', '{"municipio":"La Piedad","estado":"Michoacán","txns_sin_triangular":12}'),
  ('datos_insuficientes', 'MEDIA', 'Municipio Degollado con solo 6 transacciones en últimos 7 días', 'Ver', '{"municipio":"Degollado","estado":"Jalisco","txns":6,"minimo":10}'),
  ('tarifario_desactualizado','MEDIA','Bodega El Mezquite sin actualizar tarifario hace 72 días', 'Notificar', '{"bodega":"El Mezquite","dias_sin_actualizar":72}'),
  ('ventanilla_pendiente', 'BAJA', 'Nueva ventanilla en Apatzingán pendiente de aprobación desde hace 2 días', 'Aprobar', '{"ventanilla":"Apatzingán Centro","estado":"Michoacán","dias_pendiente":2}'),
  ('variedad_sin_homologar','BAJA','Técnico capturó variedad "Maíz elotero" — no existe en catálogo oficial', 'Homologar', '{"variedad_capturada":"Maíz elotero","tecnico_id":14}')
ON CONFLICT DO NOTHING;
