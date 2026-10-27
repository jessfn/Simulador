import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/ventanillas
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT v.*, b.nombre AS bodega_nombre,
              (SELECT COUNT(*) FROM solicitudes_apoyo sa
               JOIN apoyos_ventanilla av ON av.id = sa.apoyo_id
               WHERE av.ventanilla_id = v.id AND sa.estado = 'recibida') AS solicitudes_pendientes
       FROM ventanillas v
       JOIN bodegas b ON b.id = v.bodega_id
       WHERE v.usuario_id = $1
       ORDER BY v.creado_en DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/ventanillas
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { bodega_id, nombre_enlace_agricultura, nombre_ventanilla, telefono_responsable, correo_responsable, tipo } = req.body;

  if (!bodega_id || !nombre_enlace_agricultura || !telefono_responsable || !correo_responsable || !tipo) {
    res.status(400).json({ error: 'Campos requeridos: bodega_id, nombre_enlace_agricultura, telefono_responsable, correo_responsable, tipo' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO ventanillas (bodega_id, usuario_id, nombre_enlace_agricultura, nombre_ventanilla, telefono_responsable, correo_responsable, tipo, estatus)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'activa') RETURNING *`,
      [bodega_id, userId, nombre_enlace_agricultura, nombre_ventanilla || null, telefono_responsable, correo_responsable, tipo]
    );
    await pool.query('UPDATE bodegas SET es_ventanilla = TRUE WHERE id = $1', [bodega_id]);

    // C-20 + P-04: Notificar productores CERCANOS (no masivo)
    try {
      const ventanilla = result.rows[0];
      const bodegaR = await pool.query(
        'SELECT nombre, municipio, estado, localidad, latitud, longitud FROM bodegas WHERE id = $1',
        [bodega_id]
      );
      const b = bodegaR.rows[0];
      if (b) {
        const tipoLabel: Record<string, string> = {
          coberturas: 'Coberturas',
          incentivos: 'Incentivos',
          ambos: 'Coberturas e Incentivos',
        };
        const msg = `Nueva ventanilla de apoyos disponible en ${b.nombre} (${b.municipio}, ${b.estado}): ${tipoLabel[tipo] || tipo}. Contacto: ${nombre_enlace_agricultura} — Tel: ${telefono_responsable}.`;

        // Filtrar productores por proximidad geográfica (Haversine, sin PostGIS)
        let productorIds: { id: number }[] = [];

        if (b.latitud && b.longitud) {
          try {
            const geoR = await pool.query(`
              SELECT DISTINCT u.id
              FROM usuarios u
              JOIN productor p ON p.curp = u.curp
              JOIN up ON up.productor_id = p.productor_id
              WHERE u.rol = 'productor' AND u.activo = TRUE
                AND up.centroide IS NOT NULL
                AND (6371 * acos(LEAST(1.0,
                    cos(radians($1)) * cos(radians(ST_Y(up.centroide::geometry)))
                    * cos(radians(ST_X(up.centroide::geometry)) - radians($2))
                    + sin(radians($1)) * sin(radians(ST_Y(up.centroide::geometry)))
                  ))) <= 50
              LIMIT 500
            `, [b.latitud, b.longitud]);
            productorIds = geoR.rows;
          } catch (_) { /* Haversine failed, try fallback */ }
        }

        // Fallback: productores del mismo estado si menos de 5 en radio
        if (productorIds.length < 5 && b.estado) {
          try {
            const fallR = await pool.query(`
              SELECT DISTINCT u.id
              FROM usuarios u
              JOIN productor p ON p.curp = u.curp
              JOIN up ON up.productor_id = p.productor_id
              WHERE u.rol = 'productor' AND u.activo = TRUE
                AND up.nombre_estado ILIKE $1
              LIMIT 500
            `, [b.estado]);
            productorIds = fallR.rows;
          } catch (_) { /* fallback also failed */ }
        }

        // Insertar notificación solo para productores filtrados
        for (const prod of productorIds) {
          try {
            await pool.query(
              `INSERT INTO notificaciones (usuario_id, tipo, mensaje, referencia_id, referencia_tipo)
               VALUES ($1, 'nueva_ventanilla', $2, $3, 'ventanillas')`,
              [prod.id, msg, ventanilla.id]
            );
          } catch (_) { /* best-effort per user */ }
        }
      }
    } catch (_) { /* best-effort */ }

    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/ventanillas/:id/apoyos
router.get('/:id/apoyos', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT * FROM apoyos_ventanilla WHERE ventanilla_id = $1 ORDER BY creado_en DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/ventanillas/:id/apoyos
router.post('/:id/apoyos', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { nombre_apoyo, descripcion, requisitos, cupo_disponible, vigencia_fin } = req.body;
  if (!nombre_apoyo) { res.status(400).json({ error: 'nombre_apoyo requerido' }); return; }

  try {
    const result = await pool.query(
      `INSERT INTO apoyos_ventanilla (ventanilla_id, nombre_apoyo, descripcion, requisitos, cupo_disponible, vigencia_fin)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, nombre_apoyo, descripcion || null, requisitos || null, cupo_disponible || null, vigencia_fin || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/ventanillas/:id/apoyos/:aid
router.patch('/:id/apoyos/:aid', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { disponible, cupo_disponible } = req.body;
  try {
    const result = await pool.query(
      `UPDATE apoyos_ventanilla
       SET disponible = COALESCE($1, disponible),
           cupo_disponible = COALESCE($2, cupo_disponible)
       WHERE id = $3 AND ventanilla_id = $4 RETURNING *`,
      [disponible ?? null, cupo_disponible ?? null, req.params.aid, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Apoyo no encontrado' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/ventanillas/:id/solicitudes
router.get('/:id/solicitudes', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { estado } = req.query;
  try {
    let where = 'WHERE av.ventanilla_id = $1';
    const params: any[] = [req.params.id];
    if (estado) { params.push(estado); where += ` AND sa.estado = $${params.length}`; }

    const result = await pool.query(
      `SELECT sa.*, av.nombre_apoyo,
              CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno) AS productor_nombre,
              gm.nombre AS municipio
       FROM solicitudes_apoyo sa
       JOIN apoyos_ventanilla av ON av.id = sa.apoyo_id
       LEFT JOIN productor p ON p.productor_id = sa.productor_id
       LEFT JOIN geo_municipio gm ON gm.municipio_id = p.municipio_id
       ${where}
       ORDER BY sa.creado_en DESC`,
      params
    );
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/ventanillas/:id/solicitudes/:sid
router.patch('/:id/solicitudes/:sid', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { estado, notas } = req.body;
  const validEstados = ['contactado', 'agendada', 'canalizada', 'cerrada'];
  if (!estado || !validEstados.includes(estado)) {
    res.status(400).json({ error: `estado debe ser uno de: ${validEstados.join(', ')}` });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE solicitudes_apoyo SET estado = $1, notas = COALESCE($2, notas), actualizado_en = NOW()
       WHERE id = $3 RETURNING *`,
      [estado, notas || null, req.params.sid]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Solicitud no encontrada' }); return; }

    // Notificar al productor (best-effort)
    try {
      const sol = result.rows[0];
      if (sol.producer_id) {
        const prod = await pool.query(
          'SELECT u.id FROM usuarios u JOIN productor p ON p.usuario_id = u.id WHERE p.productor_id = $1 LIMIT 1',
          [sol.producer_id]
        );
        if (prod.rows.length > 0) {
          await pool.query(
            `INSERT INTO notificaciones (usuario_id, tipo, mensaje, referencia_id, referencia_tipo)
             VALUES ($1, 'cambio_estado_solicitud', $2, $3, 'solicitudes_apoyo')`,
            [prod.rows[0].id, `Tu solicitud cambió a: ${estado}`, sol.id]
          );
        }
      }
    } catch (_) { /* best-effort */ }

    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
