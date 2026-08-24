-- Fase 3 del plan de rediseño COFECE (ver
-- C:\Users\jesus.rios\.claude\plans\breezy-gathering-ullman.md)
--
-- Filtros guardados de bodega: al publicarse una propuesta_negociacion
-- nueva (Fase 2), se cruza contra los filtros activos y se notifica a
-- las bodegas que calzan — mismo mecanismo de notificación (notificar()),
-- nuevo criterio de match. El orden aleatorizado ponderado por distancia
-- de Fase 2 ya resuelve "no favorecer sistemáticamente a productores".

CREATE TABLE IF NOT EXISTS filtros_guardados_bodega (
  id SERIAL PRIMARY KEY,
  bodega_id INT NOT NULL REFERENCES bodegas(id),
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  nombre VARCHAR(80),
  tipo_maiz VARCHAR(20),
  volumen_min_ton NUMERIC(10,2),
  radio_km NUMERIC(6,1) NOT NULL DEFAULT 100,
  humedad_max_pct NUMERIC(4,1),
  impurezas_max_pct NUMERIC(4,1),
  grano_quebrado_max_pct NUMERIC(4,1),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filtros_guardados_bodega_activo ON filtros_guardados_bodega(activo);
CREATE INDEX IF NOT EXISTS idx_filtros_guardados_bodega_usuario ON filtros_guardados_bodega(usuario_id);
