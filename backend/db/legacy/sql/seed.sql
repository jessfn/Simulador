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

INSERT INTO bodegas (nombre, descripcion, latitud, longitud, direccion, capacidad_m2, estado) VALUES
('Bodega Central CDMX', 'Bodega principal en Ciudad de Mexico', 19.4326, -99.1332, 'Col. Centro, CDMX', 5000, 'disponible'),
('Bodega Monterrey Norte', 'Almacen industrial zona norte', 25.6866, -100.3161, 'Parque Industrial, Monterrey, NL', 8000, 'ocupada'),
('Bodega Guadalajara Sur', 'Centro de distribucion sur', 20.6597, -103.3496, 'Zona Industrial, Guadalajara, JAL', 3500, 'disponible'),
('Bodega Tijuana Otay', 'Bodega fronteriza para exportacion', 32.5149, -117.0382, 'Parque Ind. Otay, Tijuana, BC', 6000, 'mantenimiento'),
('Bodega Merida Centro', 'Almacen regional sureste', 20.9674, -89.5926, 'Zona Industrial, Merida, YUC', 4200, 'disponible'),
('Bodega Puebla Industrial', 'Centro logistico Puebla', 19.0414, -98.2063, 'Parque Industrial, Puebla, PUE', 7500, 'ocupada'),
('Bodega Leon Bajio', 'Almacen region Bajio', 21.1221, -101.6821, 'Zona Industrial, Leon, GTO', 5500, 'disponible'),
('Bodega Cancun Logistica', 'Centro distribucion turistica', 21.1619, -86.8515, 'Zona Industrial, Cancun, QR', 2800, 'disponible');
