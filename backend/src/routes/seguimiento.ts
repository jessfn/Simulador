import { Router, Response } from 'express';
import pool from '../config/database';
import { soloMaiz, parcelaDeMaiz } from '../utils/programas';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================
// GET /api/seguimiento/productores
// Lista productores con sus UPs y ciclos activos
// =============================================
router.get('/productores', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    let whereClause = `WHERE ${soloMaiz('p')}`;
    const params: any[] = [];

    if (q) {
      whereClause = `WHERE (p.nombres ILIKE $1 OR p.apellido_paterno ILIKE $1 OR p.curp ILIKE $1) AND ${soloMaiz('p')}`;
      params.push(`%${q}%`);
    }

    const result = await pool.query(`
      SELECT
        p.producer_id,
        p.curp,
        p.nombres,
        p.apellido_paterno,
        p.apellido_materno,
        p.estatus_registro,
        json_agg(
          json_build_object(
            'up_id', u.up_id,
            'up_name', u.up_name,
            'area_ha_calc', u.area_ha_calc,
            'state_name', u.state_name,
            'municipality_name', u.municipality_name,
            'ciclos', (
              SELECT json_agg(json_build_object(
                'cycle_id', c.cycle_id,
                'cycle_year', c.cycle_year,
                'cycle_type', c.cycle_type,
                'crops', (
                  SELECT COALESCE(json_agg(json_build_object(
                    'cycle_crop_id', cc.cycle_crop_id,
                    'crop', cc.crop,
                    'variety_id', cc.variety_id
                  ) ORDER BY cc.cycle_crop_id), '[]'::json)
                  FROM cycle_crop cc WHERE cc.cycle_id = c.cycle_id
                )
              ) ORDER BY c.cycle_id)
              FROM cycle c WHERE c.up_id = u.up_id AND c.crop = 'maiz'
            )
          ) ORDER BY u.up_id
        ) FILTER (WHERE u.up_id IS NOT NULL) as ups
      FROM producer p
      LEFT JOIN up u ON u.producer_id = p.producer_id AND ${parcelaDeMaiz('u')}
      ${whereClause}
      GROUP BY p.producer_id
      ORDER BY p.apellido_paterno, p.nombres
      LIMIT 100
    `, params);

    res.json({ productores: result.rows });
  } catch (error) {
    console.error('Error al obtener productores para seguimiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/seguimiento/visitas?up_id=&ciclo_id=
// =============================================
router.get('/visitas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id, ciclo_id, producer_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (up_id) { conditions.push(`v.up_id = $${idx++}`); params.push(Number(up_id)); }
    if (ciclo_id) { conditions.push(`v.ciclo_id = $${idx++}`); params.push(Number(ciclo_id)); }
    if (producer_id) { conditions.push(`v.producer_id = $${idx++}`); params.push(Number(producer_id)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT v.*, u.nombre_completo as tecnico_nombre
      FROM seguimiento_visitas v
      LEFT JOIN usuarios u ON v.usuario_captura = u.id
      ${where}
      ORDER BY v.fecha_visita DESC
    `, params);

    res.json({ visitas: result.rows });
  } catch (error) {
    console.error('Error al obtener visitas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/seguimiento/visitas
// =============================================
router.post('/visitas', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      producer_id, up_id, ciclo_id, cycle_crop_id,
      fecha_visita, etapa_cultivo, estado_cultivo,
      observaciones, precio_observado, tipo_maiz,
    } = req.body;

    if (!producer_id || !up_id || !ciclo_id || !fecha_visita || !etapa_cultivo || !estado_cultivo) {
      res.status(400).json({ error: 'Campos obligatorios faltantes' });
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    if (fecha_visita > hoy) {
      res.status(400).json({ error: 'No se permiten fechas futuras' });
      return;
    }

    if (precio_observado !== undefined && precio_observado !== null) {
      if (precio_observado <= 0) {
        res.status(400).json({ error: 'El precio observado debe ser mayor a 0' });
        return;
      }
      if (!tipo_maiz) {
        res.status(400).json({ error: 'El tipo de maíz es obligatorio cuando se captura precio' });
        return;
      }
    }

    const result = await pool.query(`
      INSERT INTO seguimiento_visitas
        (producer_id, up_id, ciclo_id, cycle_crop_id, fecha_visita, etapa_cultivo, estado_cultivo,
         observaciones, precio_observado, tipo_maiz, usuario_captura)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      producer_id, up_id, ciclo_id, cycle_crop_id || null, fecha_visita, etapa_cultivo, estado_cultivo,
      observaciones || null, precio_observado || null, tipo_maiz || null, req.user?.userId,
    ]);

    const visita = result.rows[0];

    // Si hay precio observado, guardarlo en tabla precios
    if (precio_observado && tipo_maiz) {
      await pool.query(`
        INSERT INTO precios (tipo_precio, fuente, precio, tipo_maiz, fecha, observaciones,
                             visita_id, producer_id, up_id, ciclo_id, usuario_captura)
        VALUES ('observado','campo',$1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        precio_observado, tipo_maiz, fecha_visita, observaciones || null,
        visita.id, producer_id, up_id, ciclo_id, req.user?.userId,
      ]);
    }

    res.status(201).json({ visita });
  } catch (error) {
    console.error('Error al registrar visita:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/seguimiento/incidencias?up_id=&ciclo_id=
// =============================================
router.get('/incidencias', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id, ciclo_id, producer_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (up_id) { conditions.push(`i.up_id = $${idx++}`); params.push(Number(up_id)); }
    if (ciclo_id) { conditions.push(`i.ciclo_id = $${idx++}`); params.push(Number(ciclo_id)); }
    if (producer_id) { conditions.push(`i.producer_id = $${idx++}`); params.push(Number(producer_id)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT i.*, u.nombre_completo as tecnico_nombre
      FROM seguimiento_incidencias i
      LEFT JOIN usuarios u ON i.usuario_captura = u.id
      ${where}
      ORDER BY i.fecha DESC
    `, params);

    res.json({ incidencias: result.rows });
  } catch (error) {
    console.error('Error al obtener incidencias:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/seguimiento/incidencias
// =============================================
router.post('/incidencias', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { producer_id, up_id, ciclo_id, cycle_crop_id, tipo_incidencia, severidad, fecha, observaciones } = req.body;

    if (!producer_id || !up_id || !ciclo_id || !tipo_incidencia || !severidad || !fecha) {
      res.status(400).json({ error: 'Campos obligatorios faltantes' });
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];
    if (fecha > hoy) {
      res.status(400).json({ error: 'No se permiten fechas futuras' });
      return;
    }

    const result = await pool.query(`
      INSERT INTO seguimiento_incidencias
        (producer_id, up_id, ciclo_id, cycle_crop_id, tipo_incidencia, severidad, fecha, observaciones, usuario_captura)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [producer_id, up_id, ciclo_id, cycle_crop_id || null, tipo_incidencia, severidad, fecha, observaciones || null, req.user?.userId]);

    res.status(201).json({ incidencia: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar incidencia:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/seguimiento/estimacion?up_id=&ciclo_id=
// =============================================
router.get('/estimacion', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id, ciclo_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (up_id) { conditions.push(`e.up_id = $${idx++}`); params.push(Number(up_id)); }
    if (ciclo_id) { conditions.push(`e.ciclo_id = $${idx++}`); params.push(Number(ciclo_id)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT e.* FROM estimacion_cosecha e ${where} ORDER BY e.fecha_estimacion DESC
    `, params);

    res.json({ estimaciones: result.rows });
  } catch (error) {
    console.error('Error al obtener estimaciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/seguimiento/estimacion
// =============================================
router.post('/estimacion', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { producer_id, up_id, ciclo_id, cycle_crop_id, fecha_estimacion, rendimiento_estimado_ton_ha, observaciones } = req.body;

    if (!producer_id || !up_id || !ciclo_id || !fecha_estimacion || !rendimiento_estimado_ton_ha) {
      res.status(400).json({ error: 'Campos obligatorios faltantes' });
      return;
    }

    if (rendimiento_estimado_ton_ha <= 0) {
      res.status(400).json({ error: 'El rendimiento estimado debe ser mayor a 0' });
      return;
    }

    // Obtener área sembrada de la UP para calcular producción estimada
    const upResult = await pool.query('SELECT area_ha_calc FROM up WHERE up_id = $1', [up_id]);
    const area = upResult.rows[0]?.area_ha_calc || 0;
    const produccion_estimada_ton = area > 0 ? rendimiento_estimado_ton_ha * area : null;

    const result = await pool.query(`
      INSERT INTO estimacion_cosecha
        (producer_id, up_id, ciclo_id, cycle_crop_id, fecha_estimacion, rendimiento_estimado_ton_ha,
         produccion_estimada_ton, observaciones, usuario_captura)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      producer_id, up_id, ciclo_id, cycle_crop_id || null, fecha_estimacion, rendimiento_estimado_ton_ha,
      produccion_estimada_ton, observaciones || null, req.user?.userId,
    ]);

    res.status(201).json({ estimacion: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar estimación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/seguimiento/cosecha?up_id=&ciclo_id=
// =============================================
router.get('/cosecha', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { up_id, ciclo_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (up_id) { conditions.push(`c.up_id = $${idx++}`); params.push(Number(up_id)); }
    if (ciclo_id) { conditions.push(`c.ciclo_id = $${idx++}`); params.push(Number(ciclo_id)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT c.* FROM cosecha_real c ${where} ORDER BY c.fecha_cosecha DESC`,
      params
    );

    res.json({ cosechas: result.rows });
  } catch (error) {
    console.error('Error al obtener cosechas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/seguimiento/cosecha
// =============================================
router.post('/cosecha', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      producer_id, up_id, ciclo_id, cycle_crop_id,
      fecha_cosecha, superficie_cosechada_ha, produccion_total_ton, observaciones,
    } = req.body;

    if (!producer_id || !up_id || !ciclo_id || !fecha_cosecha || !superficie_cosechada_ha || !produccion_total_ton) {
      res.status(400).json({ error: 'Campos obligatorios faltantes' });
      return;
    }

    if (superficie_cosechada_ha <= 0 || produccion_total_ton <= 0) {
      res.status(400).json({ error: 'Los valores numéricos deben ser mayores a 0' });
      return;
    }

    // Validar que superficie cosechada <= superficie sembrada
    const upResult = await pool.query('SELECT area_ha_calc FROM up WHERE up_id = $1', [up_id]);
    const area_sembrada = upResult.rows[0]?.area_ha_calc || 0;
    if (area_sembrada > 0 && superficie_cosechada_ha > area_sembrada) {
      res.status(400).json({ error: `La superficie cosechada (${superficie_cosechada_ha} ha) no puede superar la sembrada (${area_sembrada} ha)` });
      return;
    }

    const rendimiento_real_ton_ha = produccion_total_ton / superficie_cosechada_ha;

    const result = await pool.query(`
      INSERT INTO cosecha_real
        (producer_id, up_id, ciclo_id, cycle_crop_id, fecha_cosecha, superficie_cosechada_ha,
         produccion_total_ton, rendimiento_real_ton_ha, observaciones, usuario_captura)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [
      producer_id, up_id, ciclo_id, cycle_crop_id || null, fecha_cosecha, superficie_cosechada_ha,
      produccion_total_ton, rendimiento_real_ton_ha, observaciones || null, req.user?.userId,
    ]);

    res.status(201).json({ cosecha: result.rows[0] });
  } catch (error) {
    console.error('Error al registrar cosecha:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/seguimiento/resumen/:producer_id/:up_id/:ciclo_id
// Vista consolidada de un ciclo
// =============================================
router.get('/resumen/:producer_id/:up_id/:ciclo_id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { producer_id, up_id, ciclo_id } = req.params;

    const [visitas, incidencias, estimaciones, cosechas] = await Promise.all([
      pool.query(
        'SELECT * FROM seguimiento_visitas WHERE producer_id=$1 AND up_id=$2 AND ciclo_id=$3 ORDER BY fecha_visita DESC',
        [producer_id, up_id, ciclo_id]
      ),
      pool.query(
        'SELECT * FROM seguimiento_incidencias WHERE producer_id=$1 AND up_id=$2 AND ciclo_id=$3 ORDER BY fecha DESC',
        [producer_id, up_id, ciclo_id]
      ),
      pool.query(
        'SELECT * FROM estimacion_cosecha WHERE producer_id=$1 AND up_id=$2 AND ciclo_id=$3 ORDER BY fecha_estimacion DESC',
        [producer_id, up_id, ciclo_id]
      ),
      pool.query(
        'SELECT * FROM cosecha_real WHERE producer_id=$1 AND up_id=$2 AND ciclo_id=$3 ORDER BY fecha_cosecha DESC',
        [producer_id, up_id, ciclo_id]
      ),
    ]);

    res.json({
      visitas: visitas.rows,
      incidencias: incidencias.rows,
      estimaciones: estimaciones.rows,
      cosechas: cosechas.rows,
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
