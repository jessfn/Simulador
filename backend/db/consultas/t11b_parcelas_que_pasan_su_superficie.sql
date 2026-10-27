-- T11-B · SOLO LECTURA. Parcelas donde maiz + frijol (mismo año y tipo de ciclo, sin cancelar) suman mas que la parcela
-- y ningun frijol esta marcado como siembra asociada. Se las entrega a Mariel para decidir que hacer con cada una.
SELECT u.up_id, u.nombre_up, COALESCE(u.superficie_ha_real, u.superficie_ha_calculada)::float AS parcela_ha,
       c.anio_ciclo, c.tipo_ciclo,
       SUM(cc.superficie_sembrada_ha) FILTER (WHERE cc.cultivo = 'maiz')::float   AS maiz_ha,
       SUM(cc.superficie_sembrada_ha) FILTER (WHERE cc.cultivo = 'frijol')::float AS frijol_ha,
       SUM(cc.superficie_sembrada_ha)::float AS suma_ha
  FROM up u
  JOIN ciclo c ON c.up_id = u.up_id AND COALESCE(c.estado_ciclo, 'activo') <> 'cancelado'
  JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
  LEFT JOIN frijol_cultivo fc ON fc.ciclo_cultivo_id = cc.ciclo_cultivo_id
 GROUP BY u.up_id, u.nombre_up, u.superficie_ha_real, u.superficie_ha_calculada, c.anio_ciclo, c.tipo_ciclo
HAVING COUNT(DISTINCT cc.cultivo) > 1
   AND COALESCE(u.superficie_ha_real, u.superficie_ha_calculada) > 0
   AND SUM(cc.superficie_sembrada_ha) > COALESCE(u.superficie_ha_real, u.superficie_ha_calculada) + 0.01
   AND NOT bool_or(COALESCE(fc.tipo_siembra = 'asociada', false))
 ORDER BY (SUM(cc.superficie_sembrada_ha) - COALESCE(u.superficie_ha_real, u.superficie_ha_calculada)) DESC, u.up_id;
