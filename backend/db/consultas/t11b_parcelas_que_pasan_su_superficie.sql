-- T11-B · SOLO LECTURA. Parcelas donde maiz + frijol (mismo año y tipo de ciclo, sin cancelar) suman mas que la parcela
-- y ningun frijol esta marcado como siembra asociada. Se las entrega a Mariel para decidir que hacer con cada una.
SELECT u.up_id, u.up_name, COALESCE(u.area_ha_real, u.area_ha_calc)::float AS parcela_ha,
       c.cycle_year, c.cycle_type,
       SUM(cc.area_sown_ha) FILTER (WHERE cc.crop = 'maiz')::float   AS maiz_ha,
       SUM(cc.area_sown_ha) FILTER (WHERE cc.crop = 'frijol')::float AS frijol_ha,
       SUM(cc.area_sown_ha)::float AS suma_ha
  FROM up u
  JOIN cycle c ON c.up_id = u.up_id AND COALESCE(c.estado_ciclo, 'activo') <> 'cancelado'
  JOIN cycle_crop cc ON cc.cycle_id = c.cycle_id
  LEFT JOIN frijol_cultivo fc ON fc.cycle_crop_id = cc.cycle_crop_id
 GROUP BY u.up_id, u.up_name, u.area_ha_real, u.area_ha_calc, c.cycle_year, c.cycle_type
HAVING COUNT(DISTINCT cc.crop) > 1
   AND COALESCE(u.area_ha_real, u.area_ha_calc) > 0
   AND SUM(cc.area_sown_ha) > COALESCE(u.area_ha_real, u.area_ha_calc) + 0.01
   AND NOT bool_or(COALESCE(fc.tipo_siembra = 'asociada', false))
 ORDER BY (SUM(cc.area_sown_ha) - COALESCE(u.area_ha_real, u.area_ha_calc)) DESC, u.up_id;
