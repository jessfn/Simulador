import { reverseGeocode, canonicalizarEstado } from './geocode';

// Cap de área a NUMERIC(10,4) → máx 999999.9999 ha (evita overflow 22003)
function capAreaHa(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 999999.9999);
}

// Crea una UP para un productor dentro de una transacción.
// Extraído de backend/src/routes/productor.ts (función `crearUP`) para
// reutilizarse también desde backend/src/routes/tecnico.ts (registro alterno
// hecho por un técnico ECA). Comportamiento sin cambios respecto al original.
// Lanza Error con .code='UP_OVERLAP' si el polígono se intersecta con otra
// UP del mismo productor, o .code='UP_OVERLAP_CROSS' si se traslapa más de
// 10% con la UP de otro productor.
export async function insertarUP(client: any, producerId: number, up: any): Promise<number> {
  const { lat, lng, poligono, area_calc_ha, area_real_ha, coincide_area } = up;
  const upName = (up.nombre_up && String(up.nombre_up).trim()) || 'Mi Parcela';
  let estadoFinal = up.estado_up;
  let municipioFinal = up.municipio_up;
  let stateIdFinal: string | null = null;
  let municipalityIdFinal: string | null = null;

  const hasCoords = lat != null && lng != null && lat !== 0 && lng !== 0;
  const hasPoligono = poligono && Array.isArray(poligono) && poligono.length >= 3;
  const postgisActivo = process.env.POSTGIS_ENABLED === 'true';

  if (hasCoords) {
    const g = await reverseGeocode(Number(lat), Number(lng));
    if (g.state_name) estadoFinal = g.state_name;
    if (g.municipality_name) municipioFinal = g.municipality_name;
    stateIdFinal = g.state_id;
    municipalityIdFinal = g.municipality_id;
  } else if (estadoFinal) {
    // Sin coordenadas: canonicalizar contra geo_state para evitar guardar nombres en mayúsculas del padrón
    const c = await canonicalizarEstado(estadoFinal, municipioFinal);
    estadoFinal = c.state_name;
    if (c.municipality_name) municipioFinal = c.municipality_name;
    stateIdFinal = c.state_id;
    municipalityIdFinal = c.municipality_id;
  }

  const areaCalc = capAreaHa(area_calc_ha);
  const areaReal = capAreaHa(area_real_ha);
  const geojson = hasPoligono ? JSON.stringify({
    type: 'Polygon',
    coordinates: [[
      ...poligono.map(([plat, plng]: [number, number]) => [plng, plat]),
      [poligono[0][1], poligono[0][0]],
    ]],
  }) : null;

  // Overlap con UPs existentes del mismo productor
  if (hasPoligono && postgisActivo) {
    const ov = await client.query(
      `SELECT up_id, up_name FROM up
       WHERE producer_id = $1 AND geom IS NOT NULL
         AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
       LIMIT 1`,
      [producerId, geojson]
    );
    if (ov.rows.length > 0) {
      const e: any = new Error('overlap');
      e.code = 'UP_OVERLAP';
      e.up_conflicto = ov.rows[0].up_name;
      throw e;
    }
  }

  // Overlap con UPs de OTROS productores. Si el traslape supera el 10% del
  // área del polígono nuevo, se bloquea el registro (antes solo se marcaba
  // para revisión del admin y la parcela se guardaba encimada de todos
  // modos). Un contacto menor (linderos compartidos, <10%) se sigue
  // registrando pero queda marcado para revisión.
  let traslapeProducerId: number | null = null;
  if (hasPoligono && postgisActivo) {
    const ovCruz = await client.query(
      `SELECT traslape_producer_id, pct, up_name FROM (
         SELECT u.producer_id AS traslape_producer_id, u.up_name,
           ST_Area(ST_Intersection(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))::geography)
           / NULLIF(ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326)::geography), 0) AS pct
         FROM up u
         WHERE u.producer_id != $1 AND u.geom IS NOT NULL
           AND ST_Overlaps(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
       ) t WHERE t.pct > 0.02 ORDER BY t.pct DESC LIMIT 1`,
      [producerId, geojson]
    );
    if (ovCruz.rows.length > 0) {
      const fila = ovCruz.rows[0];
      if (Number(fila.pct) > 0.10) {
        const e: any = new Error('overlap_cross');
        e.code = 'UP_OVERLAP_CROSS';
        throw e;
      }
      traslapeProducerId = fila.traslape_producer_id;
    }
  }

  let upId: number;
  if (hasCoords) {
    const useGeom = hasPoligono && postgisActivo;
    const geomSql = useGeom ? `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))` : 'NULL';
    const aIdx = useGeom ? 7 : 6;
    const params = [
      producerId, estadoFinal, municipioFinal, lng, lat,
      ...(useGeom ? [geojson] : []),
      areaCalc, areaReal, coincide_area ?? null, upName,
    ];
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid, geom,
          area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
       VALUES ($1, $${aIdx + 3}, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), ${geomSql},
               $${aIdx}, $${aIdx + 1}, $${aIdx + 2}, TRUE, 'productor')
       RETURNING up_id`,
      params
    );
    upId = r.rows[0].up_id;
  } else if (hasPoligono && postgisActivo) {
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid, geom,
          area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
       VALUES ($1, $8, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3,
               ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
               ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
               $5, $6, $7, TRUE, 'poligono_calculado')
       RETURNING up_id`,
      [producerId, estadoFinal, municipioFinal, geojson, areaCalc, areaReal, coincide_area ?? null, upName]
    );
    upId = r.rows[0].up_id;
  } else {
    let centroidVal = null;
    try {
      const muni = await client.query(
        `SELECT centroid::geometry AS centroid FROM municipios_referencia
         WHERE LOWER(nombre) = LOWER($1) AND LOWER(estado) = LOWER($2) LIMIT 1`,
        [municipioFinal, estadoFinal]
      );
      centroidVal = muni.rows[0]?.centroid || null;
    } catch { /* tabla opcional */ }
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid,
          location_confirmed, centroid_source)
       VALUES ($1, $5, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3, $4::geometry, FALSE, 'municipio')
       RETURNING up_id`,
      [producerId, estadoFinal, municipioFinal, centroidVal, upName]
    );
    upId = r.rows[0].up_id;
  }

  if (stateIdFinal || municipalityIdFinal) {
    await client.query(
      `UPDATE up SET state_id = COALESCE($1, state_id), municipality_id = COALESCE($2, municipality_id)
       WHERE up_id = $3`,
      [stateIdFinal, municipalityIdFinal, upId]
    );
  }

  if (traslapeProducerId !== null) {
    await client.query(
      `UPDATE up SET posible_traslape_producer_id = $1, traslape_revisado = false WHERE up_id = $2`,
      [traslapeProducerId, upId]
    );
  }

  return upId;
}
