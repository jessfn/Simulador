-- =============================================
-- Migracion v3: Reestructuracion modulo bodegas
-- Inventario, alta de bodegas, aprobacion, roles
-- =============================================

-- Rol de usuario (admin puede aprobar bodegas)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) DEFAULT 'usuario';

-- Columnas de control en bodegas
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS estatus VARCHAR(20) DEFAULT 'aprobada';
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS creado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS aprobado_por INTEGER REFERENCES usuarios(id);
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMP WITH TIME ZONE;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Indices para estatus
CREATE INDEX IF NOT EXISTS idx_bodegas_estatus ON bodegas(estatus);
CREATE INDEX IF NOT EXISTS idx_bodegas_creado_por ON bodegas(creado_por);

-- Tabla de inventarios
CREATE TABLE IF NOT EXISTS inventarios (
    id SERIAL PRIMARY KEY,
    bodega_id INTEGER NOT NULL REFERENCES bodegas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    ciclo VARCHAR(30) NOT NULL,
    volumen_almacenamiento DOUBLE PRECISION NOT NULL,
    volumen_problemas DOUBLE PRECISION DEFAULT 0,
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventarios_bodega ON inventarios(bodega_id);
CREATE INDEX IF NOT EXISTS idx_inventarios_usuario ON inventarios(usuario_id);

-- Tabla de precios de maiz (informativa)
CREATE TABLE IF NOT EXISTS precios_maiz (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(50) NOT NULL,
    precio DOUBLE PRECISION NOT NULL,
    unidad VARCHAR(20) DEFAULT 'MXN/ton',
    tendencia VARCHAR(20) DEFAULT 'estable',
    fecha_actualizacion DATE DEFAULT CURRENT_DATE
);

-- Datos iniciales de precios
INSERT INTO precios_maiz (tipo, precio, unidad, tendencia, fecha_actualizacion) VALUES
('Maiz blanco', 5800, 'MXN/ton', 'estable', '2026-03-28'),
('Maiz amarillo', 5200, 'MXN/ton', 'alza', '2026-03-28'),
('Maiz forrajero', 4600, 'MXN/ton', 'baja', '2026-03-28')
ON CONFLICT DO NOTHING;
