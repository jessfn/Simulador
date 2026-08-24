import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/filtros-guardados — filtros del bodeguero autenticado
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT fg.*, b.nombre AS bodega_nombre
       FROM filtros_guardados_bodega fg
       JOIN bodegas b ON b.id = fg.bodega_id
       WHERE fg.usuario_id = $1
       ORDER BY fg.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/filtros-guardados — guardar una búsqueda como alerta
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {
    bodega_id, nombre, tipo_maiz, volumen_min_ton, radio_km,
    humedad_max_pct, impurezas_max_pct, grano_quebrado_max_pct,
  } = req.body;

  if (!bodega_id) { res.status(400).json({ error: 'Campo requerido: bodega_id' }); return; }

  try {
    // Verificar que la bodega pertenece al bodeguero autenticado
    const bb = await pool.query(
      `SELECT 1 FROM bodeguero_bodegas WHERE usuario_id = $1 AND bodega_id = $2 AND estatus = 'aprobada'`,
      [userId, bodega_id]
    );
    if (bb.rows.length === 0) {
      res.status(403).json({ error: 'Esa bodega no te pertenece' });
      return;
    }

    const count = await pool.query(
      'SELECT COUNT(*) FROM filtros_guardados_bodega WHERE usuario_id = $1 AND activo = TRUE',
      [userId]
    );
    if (parseInt(count.rows[0].count) >= 10) {
      res.status(400).json({ error: 'Ya tienes 10 filtros guardados activos. Elimina uno antes de crear otro.' });
      return;
    }

    const numOrNull = (v: any) => (v != null && v !== '' ? Number(v) : null);

    const result = await pool.query(
      `INSERT INTO filtros_guardados_bodega
         (bodega_id, usuario_id, nombre, tipo_maiz, volumen_min_ton, radio_km,
          humedad_max_pct, impurezas_max_pct, grano_quebrado_max_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [bodega_id, userId, nombre || null, tipo_maiz || null,
       numOrNull(volumen_min_ton), radio_km ? Number(radio_km) : 100,
       numOrNull(humedad_max_pct), numOrNull(impurezas_max_pct), numOrNull(grano_quebrado_max_pct)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/filtros-guardados/:id — activar/desactivar
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { activo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE filtros_guardados_bodega SET activo = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *`,
      [!!activo, req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrado o sin permiso' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/filtros-guardados/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `DELETE FROM filtros_guardados_bodega WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [req.params.id, userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'No encontrado o sin permiso' }); return; }
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
