import { reverseGeocode, canonicalizarEstado } from './geocode';
import { postgisDisponible } from './postgis';

// Cap de área a NUMERIC(10,4) → máx 999999.9999 ha (evita overflow 22003)
function capAreaHa(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 999999.9999);
}

export interface ResultadoTraslape {
  bloqueado: boolean;
  advertencia: boolean;
  traslapeProducerId?: number;
  upNombre?: string;
  pct?: number;
}

// H5 (auditoría Fase 3, 2026-09-22): función compartida para calcular el
// traslape entre un polígono nuevo y las UPs de OTROS productores. Antes
// esta lógica estaba duplicada en 3 lugares (ups.ts, y dos veces en
// productor.ts) y el porcentaje se calculaba SOLO dividiendo entre el área
// del polígono nuevo — una parcela nueva enorme que sepulta completamente
// una parcela chica ya registrada daba un pct casi 0% y no se detectaba.
// Ahora se calcula el porcentaje en ambas direcciones (respecto al área
// nueva y respecto al área existente) y se usa el máximo (GREATEST), así
// una parcela chica devorada por una grande sí se detecta sin importar
// cuál de las dos sea "la nueva".
export async function validarTraslape(
  db: any,
  producerIdPropietario: number,
  nuevaGeomGeoJSON: string,
  excluirUpId?: number
): Promise<ResultadoTraslape> {
  const result = await db.query(
    `SELECT traslape_producer_id, up_name, pct FROM (
       SELECT u.producer_id AS traslape_producer_id, u.up_name,
         GREATEST(
           ST_Area(ST_Intersection(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))::geography)
             / NULLIF(ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326)::geography), 0),
           ST_Area(ST_Intersection(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))::geography)
             / NULLIF(ST_Area(u.geom::geography), 0)
         ) AS pct
       FROM up u
       WHERE u.producer_id != $1 AND u.geom IS NOT NULL
         AND ST_Overlaps(u.geom, ST_SetSRID(ST_GeomFromGeoJSON($2::text), 4326))
         AND ($3::bigint IS NULL OR u.up_id != $3)
     ) t WHERE t.pct > 0.02 ORDER BY t.pct DESC LIMIT 1`,
    [producerIdPropietario, nuevaGeomGeoJSON, excluirUpId ?? null]
  );

  if (result.rows.length === 0) {
    return { bloqueado: false, advertencia: false };
  }

  const fila = result.rows[0];
  const pct = Number(fila.pct);
  return {
    bloqueado: pct > 0.10,
    advertencia: pct <= 0.10,
    traslapeProducerId: fila.traslape_producer_id,
    upNombre: fila.up_name,
    pct,
  };
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
  const postgisActivo = await postgisDisponible();

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
    const traslape = await validarTraslape(client, producerId, geojson!);
    if (traslape.bloqueado) {
      const e: any = new Error('overlap_cross');
      e.code = 'UP_OVERLAP_CROSS';
      throw e;
    }
    if (traslape.advertencia) {
      traslapeProducerId = traslape.traslapeProducerId ?? null;
    }
  }

  let upId: number;
  if (hasCoords) {
    const useGeom = hasPoligono && postgisActivo;
    const params: any[] = [producerId, estadoFinal, municipioFinal, lng, lat];
    let geomSql = 'NULL';
    // MED-09 (auditoría Fase 4, 2026-09-22): area_ha_calc SIEMPRE se calcula
    // server-side a partir del polígono cuando hay geometría — antes se
    // aceptaba tal cual la mandaba el cliente, solo con un tope numérico.
    // area_ha_calc se usa como techo de area_sown_ha en los ciclos
    // productivos, así que un área inflada por el cliente permitía declarar
    // más superficie sembrada de la que realmente existe. area_ha_real (lo
    // que el usuario declaró conscientemente si difiere) se sigue tomando
    // del cliente sin cambio.
    let areaCalcSql: string;
    if (useGeom) {
      const geomIdx = params.push(geojson);
      geomSql = `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${geomIdx}::text), 4326))`;
      areaCalcSql = `ROUND((ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($${geomIdx}::text), 4326)::geography) / 10000.0)::numeric, 4)`;
    } else {
      areaCalcSql = `$${params.push(areaCalc)}`;
    }
    const areaRealIdx = params.push(areaReal);
    const coincideIdx = params.push(coincide_area ?? null);
    const upNameIdx = params.push(upName);
    const r = await client.query(
      `INSERT INTO up
         (producer_id, up_name, up_type, production_system, water_regime,
          state_name, municipality_name, centroid, geom,
          area_ha_calc, area_ha_real, coincide_area, location_confirmed, centroid_source)
       VALUES ($1, $${upNameIdx}, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), ${geomSql},
               ${areaCalcSql}, $${areaRealIdx}, $${coincideIdx}, TRUE, 'productor')
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
       VALUES ($1, $7, 'temporal', 'tradicional', 'temporal' /* DEPRECADO: régimen hídrico real vive en cycle.tipo_riego */,
               $2, $3,
               ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
               ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)),
               ROUND((ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($4::text), 4326)::geography) / 10000.0)::numeric, 4),
               $5, $6, TRUE, 'poligono_calculado')
       RETURNING up_id`,
      [producerId, estadoFinal, municipioFinal, geojson, areaReal, coincide_area ?? null, upName]
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
