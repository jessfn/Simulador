-- =============================================
-- Script de inicialización - Base de datos BODEGAS
-- Ejecutar en el servidor PostgreSQL
-- =============================================

-- Crear la base de datos
CREATE DATABASE bodegas
    WITH ENCODING 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE template0;

-- Conectar a la base de datos
\c bodegas

-- Extensión para UUIDs (opcional)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- Tabla de usuarios
-- =============================================
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    curp VARCHAR(18) UNIQUE NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_curp ON usuarios(curp);

-- =============================================
-- Tabla de sesiones (opcional, para tracking)
-- =============================================
CREATE TABLE IF NOT EXISTS sesiones (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_token ON sesiones(token_hash);

-- =============================================
-- Tabla de bodegas (para el simulador/visor)
-- =============================================
CREATE TABLE IF NOT EXISTS bodegas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    latitud DOUBLE PRECISION NOT NULL,
    longitud DOUBLE PRECISION NOT NULL,
    direccion TEXT,
    capacidad_m2 DOUBLE PRECISION,
    estado VARCHAR(50) DEFAULT 'disponible',
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bodegas_ubicacion ON bodegas(latitud, longitud);
CREATE INDEX idx_bodegas_estado ON bodegas(estado);

-- =============================================
-- Función para actualizar updated_at automáticamente
-- =============================================
CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_usuarios_updated
    BEFORE UPDATE ON usuarios
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

CREATE TRIGGER trigger_bodegas_updated
    BEFORE UPDATE ON bodegas
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_updated_at();

-- =============================================
-- Datos de ejemplo para bodegas
-- =============================================
INSERT INTO bodegas (nombre, descripcion, latitud, longitud, direccion, capacidad_m2, estado) VALUES
('Bodega Central CDMX', 'Bodega principal en Ciudad de México', 19.4326, -99.1332, 'Col. Centro, CDMX', 5000, 'disponible'),
('Bodega Monterrey Norte', 'Almacén industrial zona norte', 25.6866, -100.3161, 'Parque Industrial, Monterrey, NL', 8000, 'ocupada'),
('Bodega Guadalajara Sur', 'Centro de distribución sur', 20.6597, -103.3496, 'Zona Industrial, Guadalajara, JAL', 3500, 'disponible'),
('Bodega Tijuana Otay', 'Bodega fronteriza para exportación', 32.5149, -117.0382, 'Parque Ind. Otay, Tijuana, BC', 6000, 'mantenimiento'),
('Bodega Mérida Centro', 'Almacén regional sureste', 20.9674, -89.5926, 'Zona Industrial, Mérida, YUC', 4200, 'disponible'),
('Bodega Puebla Industrial', 'Centro logístico Puebla', 19.0414, -98.2063, 'Parque Industrial, Puebla, PUE', 7500, 'ocupada'),
('Bodega León Bajío', 'Almacén región Bajío', 21.1221, -101.6821, 'Zona Industrial, León, GTO', 5500, 'disponible'),
('Bodega Cancún Logística', 'Centro distribución turística', 21.1619, -86.8515, 'Zona Industrial, Cancún, QR', 2800, 'disponible');
