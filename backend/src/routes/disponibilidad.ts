import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/disponibilidad — productor declara maíz disponible
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {
    up_id: bodyUpId,
    tipo_maiz,
    variedad_code, variedad_id, variedad_libre,
    ciclo_id,
    volumen_estimado_ton, volumen_ton,
    ventana_venta,
    fecha_disponible_desde, fecha_disponible_hasta,
    precio_minimo_ton,
    humedad_pct, impurezas_pct, grano_quebrado_pct,
  } = req.body;

  if (!tipo_maiz) {
    res.status(400).json({ error: 'Campo requerido: tipo_maiz' });
    return;
  }

  try {
    // Obtener producer_id del usuario
    const prodR = await pool.query(
      'SELECT producer_id FROM producer WHERE usuario_id = $1 LIMIT 1',
      [userId]
    );
    if (prodR.rows.length === 0) {
      res.status(403).json({ error: 'No se encontró productor vinculado a tu cuenta' });
      return;
    }
    const producer_id = prodR.rows[0].producer_id;

    // Resolver up_id: si viene en body usarlo, si no obtener del token/producer
    let up_id = bodyUpId;
    if (!up_id) {
      const upR = await pool.query(
        'SELECT up_id FROM up WHERE producer_id = $1 LIMIT 1',
        [producer_id]
      );
      if (upR.rows.length === 0) {
        res.status(404).json({ error: 'No se encontró UP vinculada al productor' });
        return;
      }
      up_id = upR.rows[0].up_id;
    } else {
      // Verificar que la UP pertenece al productor
      const upCheck = await pool.query(
        'SELECT up_id FROM up WHERE up_id = $1 AND producer_id = $2',
        [up_id, producer_id]
      );
      if (upCheck.rows.length === 0) {
        res.status(403).json({ error: 'La UP no pertenece al productor' });
        return;
      }
    }

    // Resolver variedad: aceptar variedad_code o variedad_id
    const variedadFinal = variedad_code || (variedad_id ? String(variedad_id) : null);

    // Resolver volumen: aceptar volumen_estimado_ton o volumen_ton
    const volumenFinal = volumen_estimado_ton || volumen_ton || null;

    // Resolver ventana: si hay fechas calcular, si hay ventana_venta usar esa
    let ventanaFinal = ventana_venta || 'mes';
    let fechaVenc: string;

    if (fecha_disponible_hasta) {
      fechaVenc = fecha_disponible_hasta;
      // Calcular ventana_venta desde las fechas
      const diffDays = Math.ceil(
        (new Date(fecha_disponible_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 7) ventanaFinal = 'esta_semana';
      else if (diffDays <= 15) ventanaFinal = 'quincena';
      else ventanaFinal = 'mes';
    } else if (ventana_venta === 'esta_semana') {
      const d = new Date();
      d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7);
      fechaVenc = d.toISOString().slice(0, 10);
    } else if (ventana_venta === 'quincena') {
      const d = new Date();
      d.setDate(d.getDate() + 15);
      fechaVenc = d.toISOString().slice(0, 10);
    } else {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      fechaVenc = d.toISOString().slice(0, 10);
    }

    // Desactivar SOLO la propuesta anterior con la MISMA variedad en la MISMA UP.
    // Así un productor puede tener varias propuestas activas de distinta variedad.
    await pool.query(
      `UPDATE disponibilidad_productor SET activa = FALSE, updated_at = NOW()
       WHERE producer_id = $1 AND up_id = $2 AND activa = TRUE
         AND variedad_code IS NOT DISTINCT FROM $3`,
      [producer_id, up_id, variedadFinal]
    );

    const precioMin = precio_minimo_ton != null && precio_minimo_ton !== ''
      ? Number(precio_minimo_ton) : null;
    const numOrNull = (v: any) => (v != null && v !== '' ? Number(v) : null);

    const result = await pool.query(
      `INSERT INTO disponibilidad_productor
         (producer_id, up_id, tipo_maiz, variedad_code, variedad_libre, ciclo_id,
          volumen_estimado_ton, ventana_venta, fecha_vencimiento, precio_minimo_ton,
          humedad_pct, impurezas_pct, grano_quebrado_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [producer_id, up_id, tipo_maiz, variedadFinal, variedad_libre || null, ciclo_id || null,
       volumenFinal, ventanaFinal, fechaVenc, precioMin,
       numOrNull(humedad_pct), numOrNull(impurezas_pct), numOrNull(grano_quebrado_pct)]
    );

    // Notificar bodegas cercanas usando el centroide de la UP (radio 200 km, Haversine)
    try {
      const upResult = await pool.query(
        `SELECT ST_Y(centroid::geometry) AS lat,
                ST_X(centroid::geometry) AS lng,
                municipality_name AS municipio,
                state_name AS estado
         FROM up
         WHERE up_id = $1 AND centroid IS NOT NULL`,
        [up_id]
      );

      if (upResult.rows.length > 0) {
        const { lat, lng, municipio, estado } = upResult.rows[0];

        const bodegasResult = await pool.query(
          `SELECT DISTINCT bb.usuario_id, b.nombre AS bodega_nombre, b.municipio AS bodega_municipio
           FROM bodegas b
           JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id AND bb.estatus = 'aprobada'
           WHERE b.latitud IS NOT NULL AND b.longitud IS NOT NULL
             AND (6371 * acos(
               LEAST(1.0, cos(radians($1)) * cos(radians(b.latitud)) *
               cos(radians(b.longitud) - radians($2)) +
               sin(radians($1)) * sin(radians(b.latitud)))
             )) <= 200
           LIMIT 100`,
          [lat, lng]
        );

        const prodResult = await pool.query(
          `SELECT TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno)) AS nombre
           FROM producer p WHERE p.usuario_id = $1`,
          [userId]
        );
        const nombreProductor = prodResult.rows[0]?.nombre || 'Un productor';
        const variedadLabel = variedadFinal || tipo_maiz || 'maíz';

        const msg = `${nombreProductor} tiene maíz disponible en ${municipio}, ${estado}.\n` +
                    `Variedad: ${variedadLabel}\n` +
                    `Volumen: ${volumenFinal || 'No especificado'} toneladas.\n` +
                    `Ingresa a la sección de Oferta para ver más detalles.`;

        for (const bodega of bodegasResult.rows) {
          await pool.query(
            `INSERT INTO notificaciones
               (usuario_id, tipo, mensaje, referencia_id, referencia_tipo)
             VALUES ($1, 'nueva_disponibilidad', $2, $3, 'disponibilidad_productor')`,
            [bodega.usuario_id, msg, result.rows[0].id]
          );
        }
      }
    } catch (notifError) {
      // Error silencioso — no bloquear la respuesta al productor
      console.error('[DISPONIBILIDAD] Error al notificar bodegas:', notifError);
    }

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error('Error en POST disponibilidad:', err);
    res.status(500).json({ error: err.message });
  }
});


// GET /api/disponibilidad — lista disponibilidades activas del productor autenticado
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT dp.*,
              u.municipality_name AS municipio,
              u.state_name AS estado,
              COALESCE(cv.label, dp.variedad_code) AS variedad_nombre
       FROM disponibilidad_productor dp
       JOIN up u ON u.up_id = dp.up_id
       JOIN producer p ON p.producer_id = dp.producer_id
       LEFT JOIN cat_crop_variety cv
         ON cv.code = dp.variedad_code AND cv.is_active = TRUE
       WHERE p.usuario_id = $1 AND dp.activa = TRUE
       ORDER BY dp.created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/disponibilidad/:id — desactivar (soft delete)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `UPDATE disponibilidad_productor dp
       SET activa = FALSE, updated_at = NOW()
       FROM producer p
       WHERE dp.id = $1 AND dp.producer_id = p.producer_id AND p.usuario_id = $2
       RETURNING dp.id`,
      [req.params.id, userId]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No encontrada o sin permiso' });
      return;
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
