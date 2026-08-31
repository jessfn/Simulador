import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================
// POST /api/ups/:up_id/cycles - Crear ciclo
// =============================================
router.post('/ups/:up_id/cycles', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id } = req.params;
    const { cycle_year, cycle_type, tipo_riego } = req.body;

    if (!cycle_year || !cycle_type) {
      res.status(400).json({ error: 'Se requiere cycle_year y cycle_type' });
      return;
    }

    // Tipo de riego: solo 'temporal' o 'riego' (default temporal)
    const tipoRiegoValido = ['temporal', 'riego'].includes(tipo_riego) ? tipo_riego : 'temporal';

    const validTypes = ['PV', 'OI', 'ANUAL'];
    if (!validTypes.includes(cycle_type)) {
      res.status(400).json({ error: 'cycle_type debe ser PV, OI o ANUAL' });
      return;
    }

    // Verify UP exists AND belongs to the authenticated user (productor dueño, o
    // técnico ECA que capturó el productor). Antes solo se verificaba que la UP
    // existiera, sin validar ownership — explotable iterando up_id con cualquier
    // token válido.
    let ownershipQuery: string;
    let ownershipParams: any[];

    if (req.user!.rol === 'capturista') {
      ownershipQuery = `
        SELECT u.up_id FROM up u
        JOIN producer p ON p.producer_id = u.producer_id
        WHERE u.up_id = $1 AND p.usuario_capturista_id = $2`;
      ownershipParams = [up_id, req.user!.userId];
    } else {
      ownershipQuery = `
        SELECT u.up_id FROM up u
        JOIN producer p ON p.producer_id = u.producer_id
        WHERE u.up_id = $1 AND p.usuario_id = $2`;
      ownershipParams = [up_id, req.user!.userId];
    }

    const upCheck = await pool.query(ownershipQuery, ownershipParams);
    if (upCheck.rows.length === 0) {
      res.status(404).json({ error: 'UP no encontrada' });
      return;
    }

    // Verificar si ya existe un ciclo activo del mismo tipo y año en esta UP
    const duplicado = await pool.query(`
      SELECT cycle_id FROM cycle 
      WHERE up_id = $1 
        AND cycle_year = $2 
        AND cycle_type = $3 
        AND COALESCE(estado_ciclo, 'activo') = 'activo'
    `, [up_id, cycle_year, cycle_type]);

    if (duplicado.rows.length > 0) {
      res.status(409).json({ 
        error: `Ya tienes un ciclo ${cycle_type} ${cycle_year} activo en esta UP` 
      });
      return;
    }

    const result = await pool.query(
      `INSERT INTO cycle (up_id, cycle_year, cycle_type, tipo_riego)
       VALUES ($1, $2, $3, $4)
       RETURNING cycle_id, up_id, cycle_year, cycle_type, tipo_riego, created_at`,
      [up_id, cycle_year, cycle_type, tipoRiegoValido]
    );

    res.status(201).json({ cycle: result.rows[0], message: 'Ciclo creado exitosamente' });
  } catch (error) {
    console.error('Error creando ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/ups/:up_id/cycles - Listar ciclos de UP
// =============================================
router.get('/ups/:up_id/cycles', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id } = req.params;

    // Ownership: mismo criterio que POST /ups/:up_id/cycles — productor
    // dueño, o técnico ECA que capturó al productor.
    let ownershipQuery: string;
    let ownershipParams: any[];
    if (req.user!.rol === 'capturista') {
      ownershipQuery = `
        SELECT u.up_id FROM up u
        JOIN producer p ON p.producer_id = u.producer_id
        WHERE u.up_id = $1 AND p.usuario_capturista_id = $2`;
      ownershipParams = [up_id, req.user!.userId];
    } else {
      ownershipQuery = `
        SELECT u.up_id FROM up u
        JOIN producer p ON p.producer_id = u.producer_id
        WHERE u.up_id = $1 AND p.usuario_id = $2`;
      ownershipParams = [up_id, req.user!.userId];
    }
    const upCheck = await pool.query(ownershipQuery, ownershipParams);
    if (upCheck.rows.length === 0) {
      res.status(404).json({ error: 'UP no encontrada' });
      return;
    }

    const result = await pool.query(
      `SELECT c.cycle_id, c.up_id, c.cycle_year, c.cycle_type, c.created_at,
              COALESCE(c.tipo_riego, 'temporal') AS tipo_riego,
              COALESCE(c.estado_ciclo, 'activo') AS estado_ciclo,
              COALESCE(json_agg(
                json_build_object(
                  'cycle_crop_id', cc.cycle_crop_id,
                  'crop', cc.crop,
                  'variety_id', cc.variety_id,
                  'variety_other', cc.variety_other,
                  'area_sown_ha', cc.area_sown_ha,
                  'planting_date', cc.planting_date,
                  'estimated_harvest_date', cc.estimated_harvest_date,
                  'yield_expected', cc.yield_expected,
                  'area_harvested_ha', cc.area_harvested_ha,
                  'destination', cc.destination,
                  'production_qty', cc.production_qty,
                  'production_unit', cc.production_unit
                )
              ) FILTER (WHERE cc.cycle_crop_id IS NOT NULL), '[]') as crops
       FROM cycle c
       LEFT JOIN cycle_crop cc ON c.cycle_id = cc.cycle_id
       WHERE c.up_id = $1
         AND COALESCE(c.estado_ciclo, 'activo') != 'cancelado'
       GROUP BY c.cycle_id, c.up_id, c.cycle_year, c.cycle_type, c.created_at, c.tipo_riego, c.estado_ciclo
       ORDER BY c.cycle_year DESC, c.cycle_type`,
      [up_id]
    );

    res.json({ cycles: result.rows });
  } catch (error) {
    console.error('Error listando ciclos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// DELETE /api/cycles/:cycle_id - Eliminar ciclo (usado para limpiar ciclos huérfanos)
// =============================================
router.delete('/cycles/:cycle_id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { cycle_id } = req.params;
    const userId = req.user!.userId;

    // Verificar que el ciclo pertenece al usuario
    const own = await client.query(
      `SELECT c.cycle_id FROM cycle c
       JOIN up u ON u.up_id = c.up_id
       JOIN producer p ON p.producer_id = u.producer_id
       WHERE c.cycle_id = $1 AND p.usuario_id = $2
         AND COALESCE(c.estado_ciclo, 'activo') = 'activo'`,
      [cycle_id, userId]
    );
    if (own.rows.length === 0) {
      res.status(404).json({ error: 'Ciclo no encontrado o no autorizado' });
      return;
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM cycle_crop WHERE cycle_id = $1', [cycle_id]);
    await client.query('DELETE FROM cycle WHERE cycle_id = $1', [cycle_id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error eliminando ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// =============================================
// POST /api/cycles/:cycle_id/crops - Agregar cultivo al ciclo
// =============================================
router.post('/cycles/:cycle_id/crops', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cycle_id } = req.params;
    const {
      crop, variety_id, variety_other,
      area_sown_ha, planting_date, estimated_harvest_date, yield_expected,
      area_harvested_ha, destination, production_qty, production_unit
    } = req.body;

    // Validations
    if (!crop || !variety_id || !area_sown_ha || !planting_date) {
      res.status(400).json({ error: 'Faltan campos obligatorios' });
      return;
    }

    const validCrops = ['maiz', 'frijol'];
    if (!validCrops.includes(crop)) {
      res.status(400).json({ error: 'crop debe ser maiz o frijol' });
      return;
    }

    if (Number(area_sown_ha) <= 0) {
      res.status(400).json({ error: 'area_sown_ha debe ser > 0' });
      return;
    }

    const harvestedNum = area_harvested_ha === undefined || area_harvested_ha === null || area_harvested_ha === '' ? null : Number(area_harvested_ha);
    if (harvestedNum !== null && !Number.isNaN(harvestedNum) && (harvestedNum < 0 || harvestedNum > Number(area_sown_ha))) {
      res.status(400).json({ error: 'area_harvested_ha debe ser >= 0 y <= area_sown_ha' });
      return;
    }

    const productionNum = production_qty === undefined || production_qty === null || production_qty === '' ? null : Number(production_qty);
    if (productionNum !== null && !Number.isNaN(productionNum) && productionNum < 0) {
      res.status(400).json({ error: 'production_qty debe ser >= 0' });
      return;
    }

    // Rendimiento esperado válido para maíz en México: 1–15 ton/ha
    const yieldNum = yield_expected === undefined || yield_expected === null || yield_expected === '' ? null : Number(yield_expected);
    if (yieldNum !== null && !Number.isNaN(yieldNum) && (yieldNum < 1 || yieldNum > 15)) {
      res.status(400).json({ error: 'El rendimiento debe estar entre 1 y 15 ton/ha.' });
      return;
    }

    // Require variety_other when variety_id is CRIOLLO_LOCAL or OTRA
    if ((variety_id === 'CRIOLLO_LOCAL' || variety_id === 'OTRA') && !variety_other) {
      res.status(400).json({ error: 'Debe especificar la variedad cuando selecciona Criollo/local u Otra' });
      return;
    }

    // Verify cycle exists AND its UP belongs to the authenticated user
    // (cycle → up → producer), obteniendo también la superficie de la UP.
    // Mismo criterio de ownership que arriba: productor dueño, o técnico ECA
    // que capturó al productor.
    let cycleOwnershipQuery: string;
    let cycleOwnershipParams: any[];
    if (req.user!.rol === 'capturista') {
      cycleOwnershipQuery = `
        SELECT c.cycle_id, c.up_id, u.up_name, u.area_ha_calc, u.area_ha_real
        FROM cycle c
        JOIN up u ON u.up_id = c.up_id
        JOIN producer p ON p.producer_id = u.producer_id
        WHERE c.cycle_id = $1 AND p.usuario_capturista_id = $2`;
      cycleOwnershipParams = [cycle_id, req.user!.userId];
    } else {
      cycleOwnershipQuery = `
        SELECT c.cycle_id, c.up_id, u.up_name, u.area_ha_calc, u.area_ha_real
        FROM cycle c
        JOIN up u ON u.up_id = c.up_id
        JOIN producer p ON p.producer_id = u.producer_id
        WHERE c.cycle_id = $1 AND p.usuario_id = $2`;
      cycleOwnershipParams = [cycle_id, req.user!.userId];
    }
    const cycleCheck = await pool.query(cycleOwnershipQuery, cycleOwnershipParams);
    if (cycleCheck.rows.length === 0) {
      res.status(404).json({ error: 'Ciclo no encontrado' });
      return;
    }

    // La superficie sembrada no puede superar el área registrada de la parcela
    const upRow = cycleCheck.rows[0];
    const superficieUP = parseFloat(upRow.area_ha_real || upRow.area_ha_calc || '0');
    if (superficieUP > 0 && Number(area_sown_ha) > superficieUP) {
      res.status(400).json({
        error: `La superficie sembrada (${area_sown_ha} ha) no puede ser mayor al área registrada de la parcela "${upRow.up_name}" (${superficieUP} ha).`,
        superficie_up: superficieUP,
        superficie_ingresada: Number(area_sown_ha),
      });
      return;
    }

    // Upsert: si ya existe un cultivo para este ciclo, actualizar en lugar de insertar
    const result = await pool.query(
      `INSERT INTO cycle_crop (
        cycle_id, crop, variety_id, variety_other, area_sown_ha,
        planting_date, estimated_harvest_date, yield_expected,
        area_harvested_ha, destination, production_qty, production_unit
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (cycle_id) DO UPDATE SET
         crop = EXCLUDED.crop,
         variety_id = EXCLUDED.variety_id,
         variety_other = EXCLUDED.variety_other,
         area_sown_ha = EXCLUDED.area_sown_ha,
         planting_date = EXCLUDED.planting_date,
         estimated_harvest_date = EXCLUDED.estimated_harvest_date,
         yield_expected = EXCLUDED.yield_expected,
         area_harvested_ha = EXCLUDED.area_harvested_ha,
         destination = EXCLUDED.destination,
         production_qty = EXCLUDED.production_qty,
         production_unit = EXCLUDED.production_unit
       RETURNING *`,
      [
        cycle_id, crop, variety_id, variety_other || null, area_sown_ha,
        planting_date, estimated_harvest_date || null, yieldNum,
        harvestedNum, destination || null, productionNum, production_unit || null
      ]
    );

    res.status(201).json({ crop: result.rows[0], message: 'Cultivo guardado exitosamente' });
  } catch (error) {
    console.error('Error agregando cultivo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/cycle-crops/:id - Editar cultivo del ciclo
// =============================================
router.patch('/cycle-crops/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      variety_id, variety_other, area_sown_ha,
      planting_date, estimated_harvest_date, yield_expected,
      area_harvested_ha, destination, production_qty, production_unit
    } = req.body;

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (variety_id !== undefined) { sets.push(`variety_id = $${idx++}`); params.push(variety_id); }
    if (variety_other !== undefined) { sets.push(`variety_other = $${idx++}`); params.push(variety_other); }
    if (area_sown_ha !== undefined) { sets.push(`area_sown_ha = $${idx++}`); params.push(area_sown_ha); }
    if (planting_date !== undefined) { sets.push(`planting_date = $${idx++}`); params.push(planting_date); }
    if (estimated_harvest_date !== undefined) { sets.push(`estimated_harvest_date = $${idx++}`); params.push(estimated_harvest_date); }
    if (yield_expected !== undefined) { sets.push(`yield_expected = $${idx++}`); params.push(yield_expected); }
    if (area_harvested_ha !== undefined) { sets.push(`area_harvested_ha = $${idx++}`); params.push(area_harvested_ha); }
    if (destination !== undefined) { sets.push(`destination = $${idx++}`); params.push(destination); }
    if (production_qty !== undefined) { sets.push(`production_qty = $${idx++}`); params.push(production_qty); }
    if (production_unit !== undefined) { sets.push(`production_unit = $${idx++}`); params.push(production_unit); }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE cycle_crop SET ${sets.join(', ')} WHERE cycle_crop_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Cultivo de ciclo no encontrado' });
      return;
    }

    res.json({ crop: result.rows[0], message: 'Cultivo actualizado exitosamente' });
  } catch (error) {
    console.error('Error actualizando cultivo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/cycles/:cycle_id/estado - Cambiar estado del ciclo
// Valores: activo | cosechado | cancelado (no elimina el registro)
// =============================================
router.patch('/cycles/:cycle_id/estado', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cycle_id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['activo', 'cosechado', 'cancelado'];
    if (!estadosValidos.includes(estado)) {
      res.status(400).json({ error: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` });
      return;
    }

    // Verificar que el ciclo pertenece a una UP del productor autenticado
    const check = await pool.query(
      `SELECT c.cycle_id
       FROM cycle c
       JOIN up u ON u.up_id = c.up_id
       JOIN producer p ON p.producer_id = u.producer_id
       WHERE c.cycle_id = $1 AND p.usuario_id = $2`,
      [cycle_id, req.user?.userId]
    );

    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Ciclo no encontrado o sin permiso' });
      return;
    }

    const result = await pool.query(
      `UPDATE cycle SET estado_ciclo = $1 WHERE cycle_id = $2
       RETURNING cycle_id, estado_ciclo`,
      [estado, cycle_id]
    );

    res.json({
      ok: true,
      cycle_id: result.rows[0].cycle_id,
      estado_ciclo: result.rows[0].estado_ciclo,
    });
  } catch (error) {
    console.error('Error al actualizar estado del ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
