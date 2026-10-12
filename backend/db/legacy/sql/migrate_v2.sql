-- =============================================
-- Migracion: Modulo 1 - Visor Bodegas de Maiz
-- =============================================

-- Tabla de regiones
CREATE TABLE IF NOT EXISTS regiones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

-- Agregar columnas a bodegas
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS region_id INTEGER REFERENCES regiones(id);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS estado VARCHAR(100);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS municipio VARCHAR(150);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS clave VARCHAR(20);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS toneladas_total DOUBLE PRECISION DEFAULT 0;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS toneladas_nacional DOUBLE PRECISION DEFAULT 0;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS toneladas_importacion DOUBLE PRECISION DEFAULT 0;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS fecha_actualizacion DATE DEFAULT CURRENT_DATE;

-- Insertar regiones
INSERT INTO regiones (nombre) VALUES
('Noroeste'),
('Noreste'),
('Occidente'),
('Centro'),
('Sur-Sureste')
ON CONFLICT (nombre) DO NOTHING;

-- Limpiar datos anteriores
DELETE FROM bodegas;

-- Insertar bodegas representativas con datos de inventario
INSERT INTO bodegas (nombre, clave, descripcion, latitud, longitud, direccion, capacidad_m2, estado, municipio, region_id, toneladas_total, toneladas_nacional, toneladas_importacion, fecha_actualizacion) VALUES
-- Noroeste (region 1)
('Graneros del Noroeste', 'BDG-NOR-001', 'Bodega principal region noroeste', 24.8049, -107.3939, 'Parque Industrial, Culiacan', 12000, 'Sinaloa', 'Culiacan', 1, 45000, 38000, 7000, '2026-03-15'),
('Bodega Los Mochis', 'BDG-NOR-002', 'Almacen costero Sinaloa norte', 25.7903, -108.9860, 'Zona Industrial, Los Mochis', 8500, 'Sinaloa', 'Ahome', 1, 28000, 22000, 6000, '2026-03-10'),
('Almacen Guasave', 'BDG-NOR-003', 'Bodega regional Guasave', 25.5667, -108.4697, 'Carr. Internacional, Guasave', 7000, 'Sinaloa', 'Guasave', 1, 32000, 30000, 2000, '2026-03-12'),
('Bodega Hermosillo', 'BDG-NOR-004', 'Almacen central Sonora', 29.0729, -110.9559, 'Parque Ind. Hermosillo, Sonora', 9000, 'Sonora', 'Hermosillo', 1, 18000, 15000, 3000, '2026-03-08'),
('Bodega Navojoa', 'BDG-NOR-005', 'Almacen sur de Sonora', 27.0682, -109.4438, 'Zona Agropecuaria, Navojoa', 5500, 'Sonora', 'Navojoa', 1, 12000, 10000, 2000, '2026-03-05'),
-- Noreste (region 2)
('Bodega Monterrey Industrial', 'BDG-NRE-001', 'Centro logistico metropolitano', 25.6866, -100.3161, 'Parque Ind. Monterrey', 15000, 'Nuevo Leon', 'Monterrey', 2, 52000, 35000, 17000, '2026-03-14'),
('Almacen Reynosa', 'BDG-NRE-002', 'Bodega fronteriza Tamaulipas', 26.0922, -98.2778, 'Zona Ind. Reynosa', 8000, 'Tamaulipas', 'Reynosa', 2, 22000, 8000, 14000, '2026-03-11'),
('Bodega Saltillo', 'BDG-NRE-003', 'Almacen central Coahuila', 25.4232, -100.9925, 'Parque Logistico, Saltillo', 6500, 'Coahuila', 'Saltillo', 2, 15000, 12000, 3000, '2026-03-09'),
('Granero del Norte', 'BDG-NRE-004', 'Bodega ganadera Chihuahua', 28.6353, -106.0889, 'Zona Agropecuaria, Chihuahua', 10000, 'Chihuahua', 'Chihuahua', 2, 20000, 14000, 6000, '2026-03-07'),
-- Occidente (region 3)
('Granero del Bajio', 'BDG-OCC-001', 'Bodega principal del Bajio', 20.6769, -101.3548, 'Zona Ind. Irapuato', 11000, 'Guanajuato', 'Irapuato', 3, 38000, 36000, 2000, '2026-03-15'),
('Bodega Guadalajara Sur', 'BDG-OCC-002', 'Centro de distribucion Jalisco', 20.6597, -103.3496, 'Zona Industrial, Guadalajara', 13000, 'Jalisco', 'Guadalajara', 3, 42000, 38000, 4000, '2026-03-13'),
('Agricola Zamora', 'BDG-OCC-003', 'Almacen agricola Michoacan', 19.9816, -102.2833, 'Zona Agropecuaria, Zamora', 7500, 'Michoacan', 'Zamora', 3, 25000, 24000, 1000, '2026-03-10'),
('Bodega Leon', 'BDG-OCC-004', 'Almacen industrial Leon', 21.1221, -101.6821, 'Parque Ind. Leon', 8000, 'Guanajuato', 'Leon', 3, 19000, 18000, 1000, '2026-03-08'),
('Bodega Colima Puerto', 'BDG-OCC-005', 'Almacen portuario Manzanillo', 19.1138, -104.3373, 'Puerto Industrial, Manzanillo', 9500, 'Colima', 'Manzanillo', 3, 30000, 12000, 18000, '2026-03-06'),
-- Centro (region 4)
('Bodega Central CDMX', 'BDG-CEN-001', 'Almacen principal zona centro', 19.4326, -99.1332, 'Iztapalapa, CDMX', 14000, 'Ciudad de Mexico', 'Iztapalapa', 4, 55000, 40000, 15000, '2026-03-15'),
('Bodega Puebla Industrial', 'BDG-CEN-002', 'Centro logistico Puebla', 19.0414, -98.2063, 'Parque Ind. Puebla', 10000, 'Puebla', 'Puebla', 4, 35000, 30000, 5000, '2026-03-12'),
('Almacen Toluca', 'BDG-CEN-003', 'Bodega industrial Edomex', 19.2826, -99.6557, 'Zona Ind. Toluca', 9000, 'Estado de Mexico', 'Toluca', 4, 28000, 25000, 3000, '2026-03-11'),
('Bodega Queretaro', 'BDG-CEN-004', 'Almacen El Marques', 20.5881, -100.3899, 'Parque Ind. El Marques', 8500, 'Queretaro', 'Queretaro', 4, 22000, 20000, 2000, '2026-03-09'),
('Bodega Tlaxcala', 'BDG-CEN-005', 'Almacen regional Tlaxcala', 19.3182, -98.2375, 'Zona Agropecuaria, Tlaxcala', 5000, 'Tlaxcala', 'Tlaxcala', 4, 14000, 13500, 500, '2026-03-07'),
-- Sur-Sureste (region 5)
('Bodega Merida Centro', 'BDG-SUR-001', 'Almacen regional sureste', 20.9674, -89.5926, 'Zona Ind. Merida', 7000, 'Yucatan', 'Merida', 5, 18000, 10000, 8000, '2026-03-14'),
('Bodega Villahermosa', 'BDG-SUR-002', 'Almacen Tabasco', 17.9893, -92.9475, 'Zona Ind. Villahermosa', 6500, 'Tabasco', 'Centro', 5, 16000, 12000, 4000, '2026-03-10'),
('Bodega Tuxtla', 'BDG-SUR-003', 'Almacen central Chiapas', 16.7535, -93.1153, 'Zona Agropecuaria, Tuxtla', 5500, 'Chiapas', 'Tuxtla Gutierrez', 5, 13000, 11000, 2000, '2026-03-08'),
('Bodega Oaxaca', 'BDG-SUR-004', 'Almacen regional Oaxaca', 17.0654, -96.7236, 'Zona Ind. Oaxaca', 4500, 'Oaxaca', 'Oaxaca de Juarez', 5, 10000, 9500, 500, '2026-03-06'),
('Bodega Cancun Logistica', 'BDG-SUR-005', 'Centro distribucion turistica', 21.1619, -86.8515, 'Zona Ind. Cancun', 6000, 'Quintana Roo', 'Benito Juarez', 5, 8000, 3000, 5000, '2026-03-04');
