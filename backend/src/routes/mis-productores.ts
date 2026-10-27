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
         u.correo_electronico, u.activo,
         COUNT(DISTINCT up.up_id)::int AS total_ups,
         COUNT(DISTINCT c.ciclo_id)::int AS total_ciclos
       FROM supervisor_productores sp
       JOIN productor p ON p.productor_id = sp.productor_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
       LEFT JOIN up ON up.productor_id = p.productor_id AND ${parcelaDeMaiz('up')}
       LEFT JOIN ciclo c ON c.up_id = up.up_id AND c.cultivo = 'maiz'
       WHERE sp.supervisor_id = $1 AND ${soloMaiz('p')}
       GROUP BY p.productor_id, u.correo_electronico, u.activo, p.apellido_paterno, p.nombres
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
      'SELECT productor_id, nombres, apellido_paterno, curp FROM productor WHERE curp = $1',
      [curp.toUpperCase().trim()]
    );

    if (producerResult.rows.length === 0) {
      res.status(404).json({ error: 'No se encontró ningún productor con ese CURP' });
      return;
    }

    const producer = producerResult.rows[0];

    // Check not already linked
    const existente = await pool.query(
      'SELECT id FROM supervisor_productores WHERE supervisor_id = $1 AND productor_id = $2',
      [supervisorId, producer.producer_id]
    );

    if (existente.rows.length > 0) {
      res.status(409).json({ error: 'Este productor ya está en tu cartera' });
      return;
    }

    await pool.query(
      'INSERT INTO supervisor_productores (supervisor_id, productor_id) VALUES ($1, $2)',
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
      'DELETE FROM supervisor_productores WHERE supervisor_id = $1 AND productor_id = $2 RETURNING id',
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
      'SELECT id FROM supervisor_productores WHERE supervisor_id = $1 AND productor_id = $2',
      [supervisorId, producerId]
    );
    if (linkResult.rows.length === 0) {
      res.status(403).json({ error: 'No tienes acceso a este productor' });
      return;
    }

    const [producerResult, upsResult, alertasResult] = await Promise.all([
      pool.query(
        `SELECT p.*, u.correo_electronico, u.activo FROM productor p
         LEFT JOIN usuarios u ON u.id = p.usuario_id
         WHERE p.productor_id = $1`,
        [producerId]
      ),
      pool.query(
        `SELECT u.*,
           ST_AsGeoJSON(u.geometria)::json AS geom_geojson,
           ST_X(ST_PointOnSurface(u.geometria)) AS centroid_lng,
           ST_Y(ST_PointOnSurface(u.geometria)) AS centroid_lat,
           (SELECT COUNT(*)::int FROM ciclo c WHERE c.up_id = u.up_id AND c.cultivo = 'maiz') AS total_ciclos
         FROM up u WHERE u.productor_id = $1 AND ${parcelaDeMaiz('u')}
         ORDER BY u.creado_en DESC`,
        [producerId]
      ),
      pool.query(
        `SELECT a.*, up.nombre_up FROM alertas a
         LEFT JOIN up ON up.up_id = a.up_id
         WHERE a.productor_id = $1
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
