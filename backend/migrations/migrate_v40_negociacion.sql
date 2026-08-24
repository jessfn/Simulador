-- Fase 2 del plan de rediseño COFECE (ver
-- C:\Users\jesus.rios\.claude\plans\breezy-gathering-ullman.md)
--
-- Mecanismo de negociación con oferta sellada: el productor publica una
-- propuesta a partir de una disponibilidad_productor existente; las
-- bodegas mandan contraofertas que no pueden verse entre sí; el productor
-- compara y acepta una, lo que crea el registro en transacciones (reusando
-- el flujo de confirmación que ya existe).
--
-- No reemplaza disponibilidad_productor ni senales_compra — ambas tablas
-- siguen funcionando exactamente igual. Este es un tercer objeto nuevo.

CREATE TABLE IF NOT EXISTS propuestas_negociacion (
  id SERIAL PRIMARY KEY,
  disponibilidad_id INT NOT NULL REFERENCES disponibilidad_productor(id),
  producer_id INT NOT NULL REFERENCES producer(producer_id),
  precio_solicitado_ton NUMERIC(10,2) NOT NULL,
  precio_referencia_ton NUMERIC(10,2),
  volumen_ton NUMERIC(10,2) NOT NULL,
  volumen_minimo_comprador NUMERIC(10,2),
  lugar_entrega TEXT,
  estatus VARCHAR(20) NOT NULL DEFAULT 'abierta'
    CHECK (estatus IN ('abierta','cerrada','vencida','cancelada')),
  ganadora_oferta_id INT,
  vigencia_hasta DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ofertas_bodega (
  id SERIAL PRIMARY KEY,
  propuesta_id INT NOT NULL REFERENCES propuestas_negociacion(id),
  bodega_id INT NOT NULL REFERENCES bodegas(id),
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  precio_ofrecido_ton NUMERIC(10,2) NOT NULL CHECK (precio_ofrecido_ton >= 0),
  costo_acondicionamiento_ton NUMERIC(10,2) DEFAULT 0,
  modalidad_transporte VARCHAR(20) CHECK (modalidad_transporte IN ('bodega_recoge','productor_entrega')),
  costo_transporte_ton NUMERIC(10,2) DEFAULT 0,
  pago_final_estimado_ton NUMERIC(10,2) NOT NULL,
  momento_pago VARCHAR(20),
  estatus VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estatus IN ('pendiente','aceptada','rechazada','retirada')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (propuesta_id, bodega_id)
);

CREATE INDEX IF NOT EXISTS idx_propuestas_negociacion_estatus ON propuestas_negociacion(estatus);
CREATE INDEX IF NOT EXISTS idx_propuestas_negociacion_producer ON propuestas_negociacion(producer_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_bodega_propuesta ON ofertas_bodega(propuesta_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_bodega_bodega ON ofertas_bodega(bodega_id);

ALTER TABLE transacciones ADD COLUMN IF NOT EXISTS propuesta_id INT REFERENCES propuestas_negociacion(id);

-- Umbral (%) por debajo del precio de referencia a partir del cual se marca
-- alerta:true al publicar una propuesta (no bloquea la publicación).
ALTER TABLE precio_parametros ADD COLUMN IF NOT EXISTS alerta_umbral_pct NUMERIC(5,2) DEFAULT 5;
