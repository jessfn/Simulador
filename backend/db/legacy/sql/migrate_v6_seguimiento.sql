-- =============================================
-- Migración v6: Módulo Seguimiento de Maíz,
--               Infraestructura PRO (Bodegas/Ventanillas),
--               Integración de Precios
-- =============================================

-- =============================================
-- 1. UPGRADES A TABLA BODEGAS (Infraestructura PRO)
-- =============================================

-- Localidad (campo faltante del spec)
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS localidad VARCHAR(200);

-- Capacidad en toneladas (spec usa capacidad_ton en lugar de capacidad_m2)
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS capacidad_ton DOUBLE PRECISION DEFAULT 0;

-- Funciones operativas (spec sec. 5)
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS es_ventanilla BOOLEAN DEFAULT FALSE;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS realiza_acopio BOOLEAN DEFAULT FALSE;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS opera_incentivos BOOLEAN DEFAULT FALSE;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS opera_coberturas BOOLEAN DEFAULT FALSE;
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS registra_inventario BOOLEAN DEFAULT TRUE;

-- Estatus operativo (activa/inactiva) — el campo "estatus" existente era para aprobación
-- Renombramos semánticamente usando estatus_operativo
ALTER TABLE bodegas ADD COLUMN IF NOT EXISTS estatus_operativo VARCHAR(20) DEFAULT 'activa';

-- =============================================
-- 2. TABLA DE CONTACTOS DE INFRAESTRUCTURA (1:N)
-- =============================================

CREATE TABLE IF NOT EXISTS infraestructura_contactos (
    id SERIAL PRIMARY KEY,
    bodega_id INTEGER NOT NULL REFERENCES bodegas(id) ON DELETE CASCADE,
    nombre VARCHAR(200) NOT NULL,
    cargo VARCHAR(150),
    telefono VARCHAR(20),
    correo VARCHAR(255),
    es_principal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contactos_bodega ON infraestructura_contactos(bodega_id);

-- =============================================
-- 3. UPGRADE INVENTARIOS (añadir tipo_maiz, fecha, observaciones)
-- =============================================

ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS tipo_maiz VARCHAR(50);
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS fecha DATE;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS volumen_problema DOUBLE PRECISION DEFAULT 0;

-- Actualizar fechas existentes si son NULL
UPDATE inventarios SET fecha = CURRENT_DATE WHERE fecha IS NULL;

-- =============================================
-- 4. TABLA PRECIOS UNIFICADA
-- =============================================

CREATE TABLE IF NOT EXISTS precios (
    id SERIAL PRIMARY KEY,
    tipo_precio VARCHAR(30) NOT NULL,          -- 'observado' | 'bodega'
    fuente VARCHAR(30) NOT NULL,               -- 'tecnico' | 'bodeguero' | 'automatico'
    precio DOUBLE PRECISION NOT NULL,
    tipo_maiz VARCHAR(50) NOT NULL,
    fecha DATE NOT NULL,
    observaciones TEXT,
    bodega_id INTEGER REFERENCES bodegas(id),  -- FK cuando tipo='bodega'
    visita_id INTEGER,                          -- FK cuando tipo='observado' (seguimiento_visitas)
    producer_id BIGINT,                         -- FK productor (seguimiento)
    up_id BIGINT,
    ciclo_id BIGINT,
    usuario_captura INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_precio_positivo CHECK (precio > 0)
);

CREATE INDEX IF NOT EXISTS idx_precios_bodega ON precios(bodega_id);
CREATE INDEX IF NOT EXISTS idx_precios_tipo ON precios(tipo_precio);
CREATE INDEX IF NOT EXISTS idx_precios_fecha ON precios(fecha);

-- =============================================
-- 5. TABLA SEGUIMIENTO_VISITAS
-- =============================================

CREATE TABLE IF NOT EXISTS seguimiento_visitas (
    id SERIAL PRIMARY KEY,
    producer_id BIGINT NOT NULL REFERENCES producer(producer_id),
    up_id BIGINT NOT NULL REFERENCES up(up_id),
    ciclo_id BIGINT NOT NULL REFERENCES cycle(cycle_id),
    fecha_visita DATE NOT NULL,
    etapa_cultivo VARCHAR(30) NOT NULL,        -- siembra|crecimiento|floracion|llenado|madurez
    estado_cultivo VARCHAR(20) NOT NULL,       -- bueno|regular|malo
    observaciones TEXT,
    precio_observado DOUBLE PRECISION,
    tipo_maiz VARCHAR(50),                     -- obligatorio si hay precio
    usuario_captura INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_etapa_cultivo CHECK (etapa_cultivo IN ('siembra','crecimiento','floracion','llenado','madurez')),
    CONSTRAINT chk_estado_cultivo CHECK (estado_cultivo IN ('bueno','regular','malo')),
    CONSTRAINT chk_fecha_no_futura CHECK (fecha_visita <= CURRENT_DATE),
    CONSTRAINT chk_precio_maiz CHECK (
        (precio_observado IS NULL) OR (precio_observado > 0 AND tipo_maiz IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_visitas_producer ON seguimiento_visitas(producer_id);
CREATE INDEX IF NOT EXISTS idx_visitas_up ON seguimiento_visitas(up_id);
CREATE INDEX IF NOT EXISTS idx_visitas_ciclo ON seguimiento_visitas(ciclo_id);

-- =============================================
-- 6. TABLA SEGUIMIENTO_INCIDENCIAS
-- =============================================

CREATE TABLE IF NOT EXISTS seguimiento_incidencias (
    id SERIAL PRIMARY KEY,
    producer_id BIGINT NOT NULL REFERENCES producer(producer_id),
    up_id BIGINT NOT NULL REFERENCES up(up_id),
    ciclo_id BIGINT NOT NULL REFERENCES cycle(cycle_id),
    tipo_incidencia VARCHAR(30) NOT NULL,      -- sequia|lluvia_excesiva|plaga|enfermedad|viento|otro
    severidad VARCHAR(10) NOT NULL,            -- baja|media|alta
    fecha DATE NOT NULL,
    observaciones TEXT,
    usuario_captura INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_tipo_incidencia CHECK (tipo_incidencia IN ('sequia','lluvia_excesiva','plaga','enfermedad','viento','otro')),
    CONSTRAINT chk_severidad CHECK (severidad IN ('baja','media','alta')),
    CONSTRAINT chk_fecha_incidencia_no_futura CHECK (fecha <= CURRENT_DATE)
);

CREATE INDEX IF NOT EXISTS idx_incidencias_up ON seguimiento_incidencias(up_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_ciclo ON seguimiento_incidencias(ciclo_id);

-- =============================================
-- 7. TABLA ESTIMACION_COSECHA
-- =============================================

CREATE TABLE IF NOT EXISTS estimacion_cosecha (
    id SERIAL PRIMARY KEY,
    producer_id BIGINT NOT NULL REFERENCES producer(producer_id),
    up_id BIGINT NOT NULL REFERENCES up(up_id),
    ciclo_id BIGINT NOT NULL REFERENCES cycle(cycle_id),
    fecha_estimacion DATE NOT NULL,
    rendimiento_estimado_ton_ha DOUBLE PRECISION NOT NULL,
    produccion_estimada_ton DOUBLE PRECISION,   -- calculado en backend
    observaciones TEXT,
    usuario_captura INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_rendimiento_estimado CHECK (rendimiento_estimado_ton_ha > 0)
);

CREATE INDEX IF NOT EXISTS idx_estimacion_up ON estimacion_cosecha(up_id);
CREATE INDEX IF NOT EXISTS idx_estimacion_ciclo ON estimacion_cosecha(ciclo_id);

-- =============================================
-- 8. TABLA COSECHA_REAL
-- =============================================

CREATE TABLE IF NOT EXISTS cosecha_real (
    id SERIAL PRIMARY KEY,
    producer_id BIGINT NOT NULL REFERENCES producer(producer_id),
    up_id BIGINT NOT NULL REFERENCES up(up_id),
    ciclo_id BIGINT NOT NULL REFERENCES cycle(cycle_id),
    fecha_cosecha DATE NOT NULL,
    superficie_cosechada_ha DOUBLE PRECISION NOT NULL,
    produccion_total_ton DOUBLE PRECISION NOT NULL,
    rendimiento_real_ton_ha DOUBLE PRECISION,   -- calculado
    observaciones TEXT,
    usuario_captura INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cosecha_positivos CHECK (
        superficie_cosechada_ha > 0 AND produccion_total_ton > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_cosecha_up ON cosecha_real(up_id);
CREATE INDEX IF NOT EXISTS idx_cosecha_ciclo ON cosecha_real(ciclo_id);

-- =============================================
-- 9. TABLA ALERTAS (híbridas: automáticas y manuales)
-- =============================================

CREATE TABLE IF NOT EXISTS alertas (
    id SERIAL PRIMARY KEY,
    producer_id BIGINT REFERENCES producer(producer_id),
    up_id BIGINT NOT NULL REFERENCES up(up_id),
    ciclo_id BIGINT NOT NULL REFERENCES cycle(cycle_id),
    tipo_alerta VARCHAR(30) NOT NULL,          -- helada|sequia|lluvia_fuerte|viento_fuerte|otro
    origen_alerta VARCHAR(20) NOT NULL,        -- automatica|manual
    fecha_alerta DATE NOT NULL,
    nivel_alerta VARCHAR(10) NOT NULL,         -- bajo|medio|alto
    estado_alerta VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente|confirmada|descartada|atendida
    observaciones TEXT,
    usuario_registro INTEGER REFERENCES usuarios(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_tipo_alerta CHECK (tipo_alerta IN ('helada','sequia','lluvia_fuerte','viento_fuerte','otro')),
    CONSTRAINT chk_origen_alerta CHECK (origen_alerta IN ('automatica','manual')),
    CONSTRAINT chk_nivel_alerta CHECK (nivel_alerta IN ('bajo','medio','alto')),
    CONSTRAINT chk_estado_alerta CHECK (estado_alerta IN ('pendiente','confirmada','descartada','atendida'))
);

CREATE INDEX IF NOT EXISTS idx_alertas_up ON alertas(up_id);
CREATE INDEX IF NOT EXISTS idx_alertas_estado ON alertas(estado_alerta);
CREATE INDEX IF NOT EXISTS idx_alertas_usuario ON alertas(usuario_registro);

-- Unique constraint para no duplicar alertas automáticas (UP + tipo + fecha)
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_no_dup
    ON alertas(up_id, tipo_alerta, fecha_alerta)
    WHERE origen_alerta = 'automatica';

-- =============================================
-- 10. TABLA NOTIFICACIONES (internas en app del técnico)
-- =============================================

CREATE TABLE IF NOT EXISTS notificaciones (
    id SERIAL PRIMARY KEY,
    alerta_id INTEGER NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    leida BOOLEAN DEFAULT FALSE,
    fecha_leida TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones(leida);

-- =============================================
-- 11. TRIGGER updated_at para alertas y estimacion
-- =============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_alertas_updated
    BEFORE UPDATE ON alertas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_estimacion_updated
    BEFORE UPDATE ON estimacion_cosecha
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 12. CATÁLOGOS adicionales para tipo_maiz
-- =============================================

INSERT INTO cat_catalog (catalog, code, label, display_order) VALUES
('tipo_maiz', 'blanco', 'Maíz Blanco', 1),
('tipo_maiz', 'amarillo', 'Maíz Amarillo', 2),
('tipo_maiz', 'forrajero', 'Maíz Forrajero', 3),
('tipo_maiz', 'palomero', 'Maíz Palomero', 4),
('tipo_maiz', 'morado', 'Maíz Morado', 5),
('tipo_maiz', 'criollo', 'Maíz Criollo', 6)
ON CONFLICT DO NOTHING;
