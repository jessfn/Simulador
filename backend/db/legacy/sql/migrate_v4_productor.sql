-- =============================================
-- Migracion v4: Modulo Productor (UP + Ciclo productivo)
-- Programa Sembrando Vida - Maiz y Frijol
-- =============================================

-- Habilitar PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================
-- Tabla de catalogos generales
-- =============================================
CREATE TABLE IF NOT EXISTS cat_catalog (
    id SERIAL PRIMARY KEY,
    catalog VARCHAR(50) NOT NULL,
    code VARCHAR(40) NOT NULL,
    label VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(catalog, code)
);

-- Catalogo: up_type
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('up_type', 'parcela', 'Parcela', 1),
('up_type', 'traspatio', 'Traspatio', 2),
('up_type', 'otro', 'Otro', 3)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: production_system
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('production_system', 'monocultivo', 'Monocultivo', 1),
('production_system', 'milpa_maiz_frijol', 'Milpa (maíz + frijol)', 2),
('production_system', 'MIAF', 'MIAF', 3),
('production_system', 'SAF', 'SAF', 4),
('production_system', 'mixto_otro', 'Mixto / otro', 5)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: water_regime
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('water_regime', 'temporal', 'Temporal', 1),
('water_regime', 'riego', 'Riego', 2),
('water_regime', 'mixto', 'Mixto', 3)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: location_correction_reason
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('location_correction_reason', 'limite_municipal', 'Límite municipal / frontera', 1),
('location_correction_reason', 'dibujo_incorrecto', 'Dibujo incorrecto', 2),
('location_correction_reason', 'otro', 'Otro', 3)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: cycle_type
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('cycle_type', 'PV', 'Primavera–Verano', 1),
('cycle_type', 'OI', 'Otoño–Invierno', 2),
('cycle_type', 'ANUAL', 'Anual', 3)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: crop
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('crop', 'maiz', 'Maíz', 1),
('crop', 'frijol', 'Frijol', 2)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: destination
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('destination', 'autoconsumo', 'Autoconsumo', 1),
('destination', 'venta_local', 'Venta local', 2),
('destination', 'venta_nacional', 'Venta nacional', 3),
('destination', 'exportacion', 'Exportación', 4),
('destination', 'mixto', 'Mixto', 5)
ON CONFLICT (catalog, code) DO NOTHING;

-- Catalogo: production_unit
INSERT INTO cat_catalog (catalog, code, label, sort_order) VALUES
('production_unit', 'kg', 'kg', 1),
('production_unit', 'ton', 'tonelada', 2)
ON CONFLICT (catalog, code) DO NOTHING;

-- =============================================
-- Tabla de variedades por cultivo
-- =============================================
CREATE TABLE IF NOT EXISTS cat_crop_variety (
    id SERIAL PRIMARY KEY,
    crop VARCHAR(10) NOT NULL,
    code VARCHAR(40) NOT NULL,
    label VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(crop, code)
);

-- Variedades de Maiz
INSERT INTO cat_crop_variety (crop, code, label, sort_order) VALUES
('maiz', 'NO_SABE', 'No sabe', 0),
('maiz', 'CRIOLLO_LOCAL', 'Criollo / local (escribir)', 1),
('maiz', 'H-40', 'H-40', 2),
('maiz', 'H-48', 'H-48', 3),
('maiz', 'H-50', 'H-50', 4),
('maiz', 'H-52', 'H-52', 5),
('maiz', 'H-66', 'H-66', 6),
('maiz', 'H-70', 'H-70', 7),
('maiz', 'H-161', 'H-161', 8),
('maiz', 'VS-22', 'VS-22', 9),
('maiz', 'VS-23', 'VS-23', 10),
('maiz', 'H-520', 'H-520', 11),
('maiz', 'H-564C', 'H-564C', 12),
('maiz', 'V-236P', 'V-236P (Pepitilla)', 13),
('maiz', 'OTRA', 'Otra (escribir)', 99)
ON CONFLICT (crop, code) DO NOTHING;

-- Variedades de Frijol
INSERT INTO cat_crop_variety (crop, code, label, sort_order) VALUES
('frijol', 'NO_SABE', 'No sabe', 0),
('frijol', 'CRIOLLO_LOCAL', 'Criollo / local (escribir)', 1),
('frijol', 'PINTO_SALTILLO', 'Pinto Saltillo', 2),
('frijol', 'FLOR_DE_MAYO_EUGENIA', 'Flor de Mayo Eugenia', 3),
('frijol', 'FLOR_DE_JUNIO_LEON', 'Flor de Junio León', 4),
('frijol', 'BAYO_AZTECA', 'Bayo Azteca', 5),
('frijol', 'NEGRO_JAMAPA', 'Negro Jamapa', 6),
('frijol', 'NEGRO_COMAPA', 'Negro Comapa', 7),
('frijol', 'AZUFRADO_HIGUERA', 'Azufrado Higuera', 8),
('frijol', 'AZUFRASIN', 'Azufrasin', 9),
('frijol', 'OTRA', 'Otra (escribir)', 99)
ON CONFLICT (crop, code) DO NOTHING;

-- =============================================
-- Tabla de productores
-- =============================================
CREATE TABLE IF NOT EXISTS producer (
    producer_id BIGSERIAL PRIMARY KEY,
    curp CHAR(18) NOT NULL UNIQUE,
    phone VARCHAR(20),
    privacy_consent BOOLEAN NOT NULL DEFAULT TRUE,
    usuario_id INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_producer_curp ON producer(curp);

-- =============================================
-- Tabla de Unidades de Produccion (UP)
-- =============================================
CREATE TABLE IF NOT EXISTS up (
    up_id BIGSERIAL PRIMARY KEY,
    producer_id BIGINT NOT NULL REFERENCES producer(producer_id) ON DELETE CASCADE,
    up_name VARCHAR(80) NOT NULL,
    up_type VARCHAR(20) NOT NULL,
    production_system VARCHAR(30) NOT NULL,
    water_regime VARCHAR(10) NOT NULL,
    geom geometry(MultiPolygon, 4326) NOT NULL,
    centroid geometry(Point, 4326),
    area_ha_calc NUMERIC,
    state_name VARCHAR(100),
    municipality_name VARCHAR(150),
    state_id VARCHAR(2),
    municipality_id VARCHAR(5),
    location_confirmed BOOLEAN,
    location_correction_reason VARCHAR(30),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS up_geom_gix ON up USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_up_producer ON up(producer_id);

-- =============================================
-- Tabla de ciclos productivos
-- =============================================
CREATE TABLE IF NOT EXISTS cycle (
    cycle_id BIGSERIAL PRIMARY KEY,
    up_id BIGINT NOT NULL REFERENCES up(up_id) ON DELETE CASCADE,
    cycle_year INT NOT NULL,
    cycle_type VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cycle_up ON cycle(up_id);

-- =============================================
-- Tabla de cultivos por ciclo
-- =============================================
CREATE TABLE IF NOT EXISTS cycle_crop (
    cycle_crop_id BIGSERIAL PRIMARY KEY,
    cycle_id BIGINT NOT NULL REFERENCES cycle(cycle_id) ON DELETE CASCADE,
    crop VARCHAR(10) NOT NULL,
    variety_id VARCHAR(40) NOT NULL,
    variety_other VARCHAR(80),
    area_sown_ha NUMERIC NOT NULL CHECK (area_sown_ha > 0),
    area_harvested_ha NUMERIC NOT NULL CHECK (area_harvested_ha >= 0),
    destination VARCHAR(20) NOT NULL,
    production_qty NUMERIC NOT NULL CHECK (production_qty >= 0),
    production_unit VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cycle_crop_cycle ON cycle_crop(cycle_id);

-- =============================================
-- Tabla geo_state y geo_municipality (INEGI simplificado)
-- Se poblan con datos basicos para el cruce
-- =============================================
CREATE TABLE IF NOT EXISTS geo_state (
    state_id VARCHAR(2) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS geo_municipality (
    municipality_id VARCHAR(5) PRIMARY KEY,
    state_id VARCHAR(2) NOT NULL REFERENCES geo_state(state_id),
    name VARCHAR(150) NOT NULL
);

-- Insertar los 32 estados mexicanos
INSERT INTO geo_state (state_id, name) VALUES
('01', 'Aguascalientes'), ('02', 'Baja California'), ('03', 'Baja California Sur'),
('04', 'Campeche'), ('05', 'Coahuila de Zaragoza'), ('06', 'Colima'),
('07', 'Chiapas'), ('08', 'Chihuahua'), ('09', 'Ciudad de México'),
('10', 'Durango'), ('11', 'Guanajuato'), ('12', 'Guerrero'),
('13', 'Hidalgo'), ('14', 'Jalisco'), ('15', 'México'),
('16', 'Michoacán de Ocampo'), ('17', 'Morelos'), ('18', 'Nayarit'),
('19', 'Nuevo León'), ('20', 'Oaxaca'), ('21', 'Puebla'),
('22', 'Querétaro'), ('23', 'Quintana Roo'), ('24', 'San Luis Potosí'),
('25', 'Sinaloa'), ('26', 'Sonora'), ('27', 'Tabasco'),
('28', 'Tamaulipas'), ('29', 'Tlaxcala'), ('30', 'Veracruz de Ignacio de la Llave'),
('31', 'Yucatán'), ('32', 'Zacatecas')
ON CONFLICT (state_id) DO NOTHING;

-- Trigger para updated_at en UP
CREATE OR REPLACE FUNCTION update_up_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_up_updated ON up;
CREATE TRIGGER trigger_up_updated
    BEFORE UPDATE ON up
    FOR EACH ROW
    EXECUTE FUNCTION update_up_timestamp();
