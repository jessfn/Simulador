import { Router, Response } from 'express';
import pool from '../config/database';
import { soloMaiz, parcelaDeMaiz } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/mis-productores — list producers linked to supervisor
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const supervisorId = req.user!.userId;

    const result = await pool.query(
      `SELECT p.*,
         u.email, u.activo,
         COUNT(DISTINCT up.up_id)::int AS total_ups,
         COUNT(DISTINCT c.cycle_id)::int AS total_ciclos
       FROM supervisor_productores sp
       JOIN producer p ON p.producer_id = sp.producer_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
       LEFT JOIN up ON up.producer_id = p.producer_id AND ${parcelaDeMaiz('up')}
       LEFT JOIN cycle c ON c.up_id = up.up_id AND c.crop = 'maiz'
       WHERE sp.supervisor_id = $1 AND ${soloMaiz('p')}
       GROUP BY p.producer_id, u.email, u.activo, p.apellido_paterno, p.nombres
       ORDER BY p.apellido_paterno, p.nombres`,
      [supervisorId]
    );

    res.json({ productores: result.rows });
  } catch (error) {
    console.error('Error al obtener mis productores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/mis-productores — link producer by CURP
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const supervisorId = req.user!.userId;
    const { curp } = req.body;

    if (!curp) {
      res.status(400).json({ error: 'Se requiere el CURP del productor' });
      return;
    }

    // Find producer by CURP
    const producerResult = await pool.query(
      'SELECT producer_id, nombres, apellido_paterno, curp FROM producer WHERE curp = $1',
      [curp.toUpperCase().trim()]
    );

    if (producerResult.rows.length === 0) {
      res.status(404).json({ error: 'No se encontró ningún productor con ese CURP' });
      return;
    }

    const producer = producerResult.rows[0];

    // Check not already linked
    const existente = await pool.query(
      'SELECT id FROM supervisor_productores WHERE supervisor_id = $1 AND producer_id = $2',
      [supervisorId, producer.producer_id]
    );

    if (existente.rows.length > 0) {
      res.status(409).json({ error: 'Este productor ya está en tu cartera' });
      return;
    }

    await pool.query(
      'INSERT INTO supervisor_productores (supervisor_id, producer_id) VALUES ($1, $2)',
      [supervisorId, producer.producer_id]
    );

    res.status(201).json({
      message: 'Productor agregado a tu cartera',
      productor: producer,
    });
  } catch (error) {
    console.error('Error al vincular productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/mis-productores/:producerId — unlink producer
router.delete('/:producerId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const supervisorId = req.user!.userId;
    const { producerId } = req.params;

    const result = await pool.query(
      'DELETE FROM supervisor_productores WHERE supervisor_id = $1 AND producer_id = $2 RETURNING id',
      [supervisorId, producerId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Vínculo no encontrado' });
      return;
    }

    res.json({ message: 'Productor eliminado de tu cartera' });
  } catch (error) {
    console.error('Error al desvincular productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/mis-productores/:producerId — detail with UPs, cycles, seguimiento
router.get('/:producerId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const supervisorId = req.user!.userId;
    const { producerId } = req.params;

    // Verify linkage
    const linkResult = await pool.query(
      'SELECT id FROM supervisor_productores WHERE supervisor_id = $1 AND producer_id = $2',
      [supervisorId, producerId]
    );
    if (linkResult.rows.length === 0) {
      res.status(403).json({ error: 'No tienes acceso a este productor' });
      return;
    }

    const [producerResult, upsResult, alertasResult] = await Promise.all([
      pool.query(
        `SELECT p.*, u.email, u.activo FROM producer p
         LEFT JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.producer_id = $1`,
        [producerId]
      ),
      pool.query(
        `SELECT u.*,
           ST_AsGeoJSON(u.geom)::json AS geom_geojson,
           ST_X(ST_PointOnSurface(u.geom)) AS centroid_lng,
           ST_Y(ST_PointOnSurface(u.geom)) AS centroid_lat,
           (SELECT COUNT(*)::int FROM cycle c WHERE c.up_id = u.up_id AND c.crop = 'maiz') AS total_ciclos
         FROM up u WHERE u.producer_id = $1 AND ${parcelaDeMaiz('u')}
         ORDER BY u.created_at DESC`,
        [producerId]
      ),
      pool.query(
        `SELECT a.*, up.up_name FROM alertas a
         LEFT JOIN up ON up.up_id = a.up_id
         WHERE a.producer_id = $1
         ORDER BY a.fecha_alerta DESC LIMIT 10`,
        [producerId]
      ),
    ]);

    if (producerResult.rows.length === 0) {
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }

    res.json({
      productor: producerResult.rows[0],
      ups: upsResult.rows,
      alertas: alertasResult.rows,
    });
  } catch (error) {
    console.error('Error al obtener detalle productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
