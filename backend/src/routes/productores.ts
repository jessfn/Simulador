import { Router, Response } from 'express';
import pool from '../config/database';
import { soloMaiz } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/productores/buscar?q=<nombre_o_curp>&bodega_id=<id>
// C-17: Producer autocomplete for transaction form
router.get('/buscar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { q, bodega_id } = req.query;

  if (!q || String(q).trim().length < 3) {
    res.status(400).json({ error: 'Parámetro q debe tener al menos 3 caracteres' });
    return;
  }

  try {
    const termino = `%${String(q).toUpperCase().trim()}%`;
    const params: any[] = [termino];
    let extra = '';

    // Si se da bodega_id, priorizamos productores que ya tienen transacción en esa bodega
    if (bodega_id) {
      params.push(bodega_id);
      extra = `OR p.productor_id IN (
        SELECT DISTINCT productor_id FROM transacciones WHERE bodega_id = $${params.length} AND productor_id IS NOT NULL
      )`;
    }

    const result = await pool.query(
      `SELECT
         p.productor_id,
         TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS nombre_completo,
         COALESCE(gm.nombre, p.municipio_id, '') AS municipio,
         RIGHT(TRIM(COALESCE(p.curp, '')), 4) AS curp_parcial
       FROM productor p
       LEFT JOIN geo_municipio gm ON gm.municipio_id = p.municipio_id
       WHERE (
         UPPER(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) LIKE $1
         OR UPPER(TRIM(COALESCE(p.curp, ''))) LIKE $1
         ${extra}
       )
       AND ${soloMaiz('p')}
       ORDER BY p.nombres, p.apellido_paterno
       LIMIT 10`,
      params
    );

    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
