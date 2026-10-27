import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// =============================================
// GET /api/catalogos-productor - Todos los catálogos del módulo Productor
// =============================================
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tipo_maiz } = req.query;
    const catalogs = await pool.query(
      `SELECT catalogo, codigo, etiqueta FROM cat_catalogo WHERE activo = true ORDER BY catalogo, orden, etiqueta`
    );

    let varQuery = `SELECT cultivo, codigo, etiqueta FROM cat_variedad_cultivo WHERE activo = true`;
    const varParams: any[] = [];
    if (tipo_maiz) {
      varQuery += ` AND (cultivo != 'maiz' OR tipo_maiz = $1)`;
      varParams.push(tipo_maiz);
    }
    varQuery += ` ORDER BY cultivo, CASE WHEN LOWER(etiqueta) = 'no sabe' THEN 1 ELSE 0 END, orden, etiqueta`;
    
    const varieties = await pool.query(varQuery, varParams);

    const states = await pool.query(
      `SELECT estado_id, nombre FROM geo_estado ORDER BY nombre`
    );

    // Group catalogs by type
    const grouped: Record<string, { code: string; label: string }[]> = {};
    for (const row of catalogs.rows) {
      if (!grouped[row.catalog]) grouped[row.catalog] = [];
      grouped[row.catalog].push({ code: row.code, label: row.label });
    }

    // Group varieties by crop
    const varietiesByCrop: Record<string, { code: string; label: string }[]> = {};
    for (const row of varieties.rows) {
      if (!varietiesByCrop[row.crop]) varietiesByCrop[row.crop] = [];
      varietiesByCrop[row.crop].push({ code: row.code, label: row.label });
    }

    res.json({
      catalogs: grouped,
      varieties: varietiesByCrop,
      states: states.rows,
    });
  } catch (error) {
    console.error('Error obteniendo catálogos productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/catalogos-productor/municipalities?state_id=XX
// =============================================
router.get('/municipalities', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { state_id } = req.query;

    if (!state_id) {
      res.status(400).json({ error: 'Se requiere state_id' });
      return;
    }

    const result = await pool.query(
      `SELECT municipio_id, nombre FROM geo_municipio WHERE estado_id = $1 ORDER BY nombre`,
      [state_id]
    );

    res.json({ municipalities: result.rows });
  } catch (error) {
    console.error('Error obteniendo municipios:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
