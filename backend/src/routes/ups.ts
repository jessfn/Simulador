import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
 
const router = Router();

// DESACTIVADO 2026-09-21 — CRIT-01 (auditoría seguridad). Los handlers de
// abajo (POST /, GET /, GET /:up_id, PATCH /:up_id) solo verificaban
// authMiddleware (JWT válido) pero nunca si el recurso pertenece a quien
// hace la petición — cualquier técnico autenticado podía leer o modificar
// parcelas y datos de CUALQUIER productor del sistema (IDOR). Confirmado
// que ningún cliente activo los usa; el flujo real de alta/edición de UP
// vive en backend/src/routes/tecnico.ts y backend/src/routes/productor.ts,
// con ownership verificado contra producer.usuario_id / usuario_capturista_id.
// GET /geometrias (abajo) sí sigue activo: es público, sin PII, y lo usa
// el mapa de dibujo de parcelas.
// H1 (auditoría Fase 3, 2026-09-22): este desmontaje ya resuelve el hallazgo
// H1 (POST /:up_id y PATCH /:up_id sin validación de traslape) — quedan
// desactivados, no solo sin ownership check.
/*
// =============================================
// POST /api/ups - Crear UP (incluye geom_geojson)
// =============================================
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      curp, up_name, up_type, production_system, water_regime,
      geom_geojson, state_name, municipality_name,
      coincide_superficie_calculada, area_real_declarada_ha, motivo_diferencia_superficie,
    } = req.body;

    // Validations
    if (!curp || !up_name || !up_type || !production_system || !water_regime || !geom_geojson) {
      res.status(400).json({ error: 'Faltan campos obligatorios (curp, up_name, up_type, production_system, water_regime, geom_geojson)' });
      return;
    }

    if (up_name.length < 3 || up_name.length > 80) {
      res.status(400).json({ error: 'El nombre de la UP debe tener entre 3 y 80 caracteres' });
      return;
    }

    // Validate geojson has type and coordinates
    if (!geom_geojson.type || !geom_geojson.coordinates) {
      res.status(400).json({ error: 'GeoJSON inválido: debe tener type y coordinates' });
      return;
    }

    // Get producer by CURP
    const producerResult = await pool.query('SELECT producer_id FROM producer WHERE curp = $1', [curp.toUpperCase().trim()]);
    if (producerResult.rows.length === 0) {
      res.status(404).json({ error: 'Productor no encontrado. Regístrelo primero.' });
      return;
    }
    const producerId = producerResult.rows[0].producer_id;

    const geojsonStr = JSON.stringify(geom_geojson);

    // Insert UP with PostGIS: convert to geometry, calculate area, centroid
    // ST_Multi ensures MultiPolygon, ST_MakeValid handles invalid geometries
    const insertQuery = `
      INSERT INTO up (
        producer_id, up_name, up_type, production_system, water_regime,
        geom, centroid, area_ha_calc, state_name, municipality_name,
        state_id, municipality_id,
        coincide_superficie_calculada, area_real_declarada_ha, motivo_diferencia_superficie
      )
      VALUES (
        $1, $2, $3, $4, $5,
        ST_Multi(
          CASE
            WHEN ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))
            THEN ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326)
            ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))
          END
        ),
        ST_PointOnSurface(
          CASE
            WHEN ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))
            THEN ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326)
            ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))
          END
        ),
        ROUND((ST_Area(
          CASE
            WHEN ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))
            THEN ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326)
            ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($6::text), 4326))
          END
        ::geography) / 10000.0)::numeric, 4),
        $7, $8, $9, $10,
        $11, $12, $13
      )
      RETURNING
        up_id, producer_id, up_name, up_type, production_system, water_regime,
        area_ha_calc, state_name, municipality_name, state_id, municipality_id,
        location_confirmed, coincide_superficie_calculada, area_real_declarada_ha,
        motivo_diferencia_superficie,
        ST_AsGeoJSON(geom)::json as geom_geojson,
        ST_X(centroid) as centroid_lng, ST_Y(centroid) as centroid_lat,
        created_at
    `;

    const result = await pool.query(insertQuery, [
      producerId, up_name.trim(), up_type, production_system, water_regime,
      geojsonStr,
      state_name || null, municipality_name || null,
      null, null, // state_id, municipality_id - set during confirmation step
      coincide_superficie_calculada ?? null,
      area_real_declarada_ha ?? null,
      motivo_diferencia_superficie || null,
    ]);

    // Marcar productor como 'completo' si estaba pendiente
    await pool.query(
      `UPDATE producer SET estatus_registro = 'completo' WHERE producer_id = $1 AND estatus_registro = 'pendiente'`,
      [producerId]
    );

    res.status(201).json({
      up: result.rows[0],
      message: 'Unidad de Producción registrada exitosamente'
    });
  } catch (error: any) {
    console.error('Error creando UP:', error);
    res.status(500).json({ error: 'Error al guardar la Unidad de Producción: ' + (error.message || '') });
  }
});

*/

// =============================================
// GET /api/ups/geometrias — todas las geometrías (sin PII, público)
// Usado por el mapa de dibujo para mostrar parcelas existentes en gris
// SIGUE ACTIVO — no forma parte de CRIT-01 (sin PII, público por diseño).
// =============================================
router.get('/geometrias', async (_req, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT up_id, ST_AsGeoJSON(geom)::json AS geom_geojson
       FROM up
       WHERE geom IS NOT NULL
       ORDER BY up_id`
    );
    res.json({ ups: rows });
  } catch (error) {
    console.error('Error listando geometrías de UPs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DESACTIVADO 2026-09-21 — CRIT-01 (ver nota completa arriba de POST /).
/*
// =============================================
// GET /api/ups?curp=... - Listar UPs del productor
// =============================================
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { curp } = req.query;

    if (!curp) {
      res.status(400).json({ error: 'Se requiere el parámetro curp' });
      return;
    }

    const result = await pool.query(
      `SELECT u.up_id, u.up_name, u.up_type, u.production_system, u.water_regime,
              u.area_ha_calc, u.state_name, u.municipality_name,
              u.state_id, u.municipality_id, u.location_confirmed,
              ST_AsGeoJSON(u.geom)::json as geom_geojson,
              ST_X(u.centroid) as centroid_lng, ST_Y(u.centroid) as centroid_lat,
              u.created_at
       FROM up u
       JOIN producer p ON u.producer_id = p.producer_id
       WHERE p.curp = $1
       ORDER BY u.created_at DESC`,
      [String(curp).toUpperCase().trim()]
    );

    res.json({ ups: result.rows });
  } catch (error) {
    console.error('Error listando UPs:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/ups/:up_id - Detalle de UP
// =============================================
router.get('/:up_id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id } = req.params;

    const result = await pool.query(
      `SELECT u.up_id, u.up_name, u.up_type, u.production_system, u.water_regime,
              u.area_ha_calc, u.state_name, u.municipality_name,
              u.state_id, u.municipality_id, u.location_confirmed,
              u.location_correction_reason,
              ST_AsGeoJSON(u.geom)::json as geom_geojson,
              ST_X(u.centroid) as centroid_lng, ST_Y(u.centroid) as centroid_lat,
              p.curp, u.created_at, u.updated_at
       FROM up u
       JOIN producer p ON u.producer_id = p.producer_id
       WHERE u.up_id = $1`,
      [up_id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'UP no encontrada' });
      return;
    }

    res.json({ up: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo UP:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/ups/:up_id - Editar UP (confirmación ubicación o actualización)
// =============================================
router.patch('/:up_id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id } = req.params;
    const {
      state_name, municipality_name, state_id, municipality_id,
      location_confirmed, location_correction_reason,
      up_name, up_type, production_system, water_regime,
      geom_geojson
    } = req.body;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (state_name !== undefined) { sets.push(`state_name = $${idx++}`); params.push(state_name); }
    if (municipality_name !== undefined) { sets.push(`municipality_name = $${idx++}`); params.push(municipality_name); }
    if (state_id !== undefined) { sets.push(`state_id = $${idx++}`); params.push(state_id); }
    if (municipality_id !== undefined) { sets.push(`municipality_id = $${idx++}`); params.push(municipality_id); }
    if (location_confirmed !== undefined) { sets.push(`location_confirmed = $${idx++}`); params.push(location_confirmed); }
    if (location_correction_reason !== undefined) { sets.push(`location_correction_reason = $${idx++}`); params.push(location_correction_reason); }
    if (up_name !== undefined) { sets.push(`up_name = $${idx++}`); params.push(up_name.trim()); }
    if (up_type !== undefined) { sets.push(`up_type = $${idx++}`); params.push(up_type); }
    if (production_system !== undefined) { sets.push(`production_system = $${idx++}`); params.push(production_system); }
    if (water_regime !== undefined) { sets.push(`water_regime = $${idx++}`); params.push(water_regime); }

    // If updating geometry
    if (geom_geojson) {
      const geojsonStr = JSON.stringify(geom_geojson);
      sets.push(`geom = ST_Multi(CASE WHEN ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326)) THEN ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326) ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326)) END)`);
      sets.push(`centroid = ST_PointOnSurface(CASE WHEN ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326)) THEN ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326) ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326)) END)`);
      sets.push(`area_ha_calc = ROUND((ST_Area(CASE WHEN ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326)) THEN ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326) ELSE ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($${idx}::text), 4326)) END::geography) / 10000.0)::numeric, 4)`);
      params.push(geojsonStr);
      idx++;
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    params.push(up_id);
    const result = await pool.query(
      `UPDATE up SET ${sets.join(', ')} WHERE up_id = $${idx}
       RETURNING up_id, up_name, up_type, production_system, water_regime,
                 area_ha_calc, state_name, municipality_name,
                 state_id, municipality_id, location_confirmed, location_correction_reason,
                 ST_AsGeoJSON(geom)::json as geom_geojson`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'UP no encontrada' });
      return;
    }

    res.json({ up: result.rows[0], message: 'UP actualizada exitosamente' });
  } catch (error: any) {
    console.error('Error actualizando UP:', error);
    res.status(500).json({ error: 'Error al actualizar la UP: ' + (error.message || '') });
  }
});
*/

export default router;
