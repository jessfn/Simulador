import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/tarifario/:bodegaId
router.get('/:bodegaId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT ts.*, c.nombre AS concepto_nombre, c.icono, c.unidad_default
       FROM tarifario_servicios ts
       JOIN cat_conceptos_servicio c ON c.id = ts.concepto_id
       WHERE ts.bodega_id = $1 AND ts.activo = TRUE
       ORDER BY c.nombre`,
      [req.params.bodegaId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/tarifario/:bodegaId
router.post('/:bodegaId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { concepto_id, precio, vigencia_inicio, vigencia_fin } = req.body;
  if (!concepto_id || !precio) { res.status(400).json({ error: 'concepto_id y precio requeridos' }); return; }

  try {
    await pool.query(
      'UPDATE tarifario_servicios SET activo = FALSE WHERE bodega_id = $1 AND concepto_id = $2',
      [req.params.bodegaId, concepto_id]
    );

    const result = await pool.query(
      `INSERT INTO tarifario_servicios (bodega_id, concepto_id, precio, vigencia_inicio, vigencia_fin)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.bodegaId, concepto_id, precio, vigencia_inicio || null, vigencia_fin || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tarifario/:bodegaId/:tarifaId
router.put('/:bodegaId/:tarifaId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { precio, vigencia_inicio, vigencia_fin } = req.body;
  try {
    const result = await pool.query(
      `UPDATE tarifario_servicios
       SET precio = COALESCE($1, precio),
           vigencia_inicio = COALESCE($2, vigencia_inicio),
           vigencia_fin = $3,
           actualizado_en = NOW()
       WHERE id = $4 AND bodega_id = $5 RETURNING *`,
      [precio, vigencia_inicio, vigencia_fin || null, req.params.tarifaId, req.params.bodegaId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Tarifa no encontrada' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
