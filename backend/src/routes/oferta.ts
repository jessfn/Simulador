import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { notificar } from '../utils/notificacion';

const router = Router();

// ─── Helper: obtener coordenadas de la primera bodega del usuario ───
async function getBodegaRef(userId: number): Promise<{ id: number; longitud: number; latitud: number; estado: string } | null> {
  const r = await pool.query(
    `SELECT b.id, b.latitud, b.longitud, b.estado
     FROM bodegas b
     JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id
     WHERE bb.usuario_id = $1 AND bb.estatus = 'aprobada'
       AND b.latitud IS NOT NULL AND b.longitud IS NOT NULL
     LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

// ─── Helper: check if PostGIS is available ───
let _hasPostGIS: boolean | null = null;
async function hasPostGIS(): Promise<boolean> {
  if (_hasPostGIS !== null) return _hasPostGIS;
  try {
    await pool.query("SELECT PostGIS_Version()");
    _hasPostGIS = true;
  } catch { _hasPostGIS = false; }
  return _hasPostGIS;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/oferta/municipios — B-03: datos AGREGADOS por municipio
// Intenta usar disponibilidad_productor + PostGIS; fallback a cycle_crop
// ═══════════════════════════════════════════════════════════════
router.get('/municipios', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { tipo_maiz, radio_km } = req.query;
  const userId = req.user!.userId;

  try {
    const bodegaRef = await getBodegaRef(userId);
    const postgis = await hasPostGIS();
    const radio = Number(radio_km) || 60;

    // ── Strategy A: disponibilidad_productor (oferta real declarada por productores) ──
    const hasDispTable = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'disponibilidad_productor') AS e"
    );
    if (hasDispTable.rows[0].e) {
      try {
        // SELECT base reutilizable. $1=lng ref, $2=lat ref (para distancia; 0,0 si no hay bodega)
        const refLng = bodegaRef?.longitud ?? 0;
        const refLat = bodegaRef?.latitud ?? 0;

        const buildQuery = (extraWhere: string, extraParams: any[], orderBy: string) => {
          const params: any[] = [refLng, refLat, ...extraParams];
          let tipoFilter = '';
          if (tipo_maiz && tipo_maiz !== 'all') {
            params.push(tipo_maiz);
            tipoFilter = `AND dp.tipo_maiz ILIKE $${params.length}`;
          }
          const distExpr = (bodegaRef && postgis)
            ? `ROUND((MIN(ST_Distance(
                 ST_SetSRID(ST_Point(ST_X(u.centroide::geometry), ST_Y(u.centroide::geometry)), 4326)::geography,
                 ST_SetSRID(ST_Point($1, $2), 4326)::geography
               )) / 1000)::numeric, 1)`
            : '0';
          return {
            text: `SELECT
                 COALESCE(u.nombre_municipio, 'Sin municipio') AS municipio,
                 COALESCE(u.nombre_estado, 'Sin estado') AS estado,
                 COUNT(DISTINCT dp.productor_id) AS productores_disponibles,
                 COALESCE(SUM(dp.volumen_estimado_ton), 0)::numeric(12,2) AS toneladas_estimadas,
                 MODE() WITHIN GROUP (ORDER BY dp.ventana_venta) AS ventana_predominante,
                 ${distExpr} AS distancia_km,
                 ROUND(AVG(dp.precio_minimo_ton) FILTER (WHERE dp.precio_minimo_ton IS NOT NULL), 0) AS precio_minimo_promedio,
                 ARRAY_AGG(DISTINCT COALESCE(cv.etiqueta, dp.variedad_libre, dp.variedad_codigo))
                   FILTER (WHERE COALESCE(dp.variedad_codigo, dp.variedad_libre) IS NOT NULL) AS variedades,
                 ARRAY_AGG(DISTINCT dp.tipo_maiz)
                   FILTER (WHERE dp.tipo_maiz IS NOT NULL) AS tipos_maiz
               FROM disponibilidad_productor dp
               JOIN up u ON u.up_id = dp.up_id
               LEFT JOIN cat_variedad_cultivo cv ON cv.codigo = dp.variedad_codigo AND cv.activo = TRUE
               WHERE dp.activa = TRUE
                 AND dp.fecha_vencimiento >= CURRENT_DATE
                 ${extraWhere}
                 ${tipoFilter}
               GROUP BY u.nombre_municipio, u.nombre_estado
               HAVING COUNT(DISTINCT dp.productor_id) > 0
               ORDER BY ${orderBy}
               LIMIT 50`,
            params,
          };
        };

        // Nivel 1 — dentro del radio de la bodega (si hay bodega con coords + PostGIS)
        if (bodegaRef && postgis) {
          const q = buildQuery(
            `AND u.centroide IS NOT NULL
             AND ST_DWithin(
               ST_SetSRID(ST_Point(ST_X(u.centroide::geometry), ST_Y(u.centroide::geometry)), 4326)::geography,
               ST_SetSRID(ST_Point($1, $2), 4326)::geography, $3)`,
            [radio * 1000],
            'distancia_km ASC'
          );
          const r1 = await pool.query(q.text, q.params);
          if (r1.rows.length > 0) {
            res.json({ data: r1.rows, fallback: false });
            return;
          }
        }

        // Nivel 2 — todo el estado de la bodega
        if (bodegaRef?.estado) {
          const q = buildQuery(`AND u.nombre_estado ILIKE $3`, [bodegaRef.estado], 'productores_disponibles DESC');
          const r2 = await pool.query(q.text, q.params);
          if (r2.rows.length > 0) {
            res.json({
              data: r2.rows, fallback: true,
              mensaje: `No hay oferta dentro de ${radio} km. Mostrando productores en todo ${bodegaRef.estado}.`,
            });
            return;
          }
        }

        // Nivel 3 — oferta nacional (para que el bodeguero siempre vea la oferta existente)
        const q3 = buildQuery('', [], 'productores_disponibles DESC');
        const r3 = await pool.query(q3.text, q3.params);
        if (r3.rows.length > 0) {
          res.json({
            data: r3.rows, fallback: true,
            mensaje: bodegaRef
              ? 'No hay oferta cercana. Mostrando toda la oferta disponible a nivel nacional.'
              : 'Mostrando toda la oferta disponible. Asocia una bodega para ver la oferta cercana a ti.',
          });
          return;
        }
        // Si no hay ninguna disponibilidad activa, caer a Strategy B (histórico)
      } catch (e) {
        console.error('[oferta] Strategy A falló, usando fallback histórico:', (e as Error).message);
        // Fall through to Strategy B
      }
    }

    // ── Strategy B: cycle_crop fallback (original approach) ──
    let where = `WHERE cy.anio_ciclo >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1`;
    const params: any[] = [];

    if (tipo_maiz && tipo_maiz !== 'all') {
      params.push(`%${tipo_maiz}%`);
      where += ` AND (cc.variedad_id::text ILIKE $${params.length} OR cc.variedad_otra::text ILIKE $${params.length})`;
    }

    // If we have bodega coords, filter by state at minimum
    if (bodegaRef) {
      params.push(bodegaRef.estado);
      where += ` AND u.nombre_estado ILIKE $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         COALESCE(u.nombre_municipio, u.municipio_id, 'Sin municipio') AS municipio,
         COALESCE(u.nombre_estado, u.estado_id, 'Sin estado') AS estado,
         COUNT(DISTINCT p.productor_id) AS productores_disponibles,
         COALESCE(SUM(cc.rendimiento_esperado), 0)::numeric(12,2) AS toneladas_estimadas,
         'esta_semana' AS ventana_predominante,
         0 AS distancia_km
       FROM up u
       JOIN productor p ON p.productor_id = u.productor_id
       JOIN ciclo cy ON cy.up_id = u.up_id
       LEFT JOIN ciclo_cultivo cc ON cc.ciclo_id = cy.ciclo_id AND cc.cultivo = 'maiz'
       ${where}
       GROUP BY u.nombre_municipio, u.municipio_id, u.nombre_estado, u.estado_id
       HAVING COUNT(DISTINCT p.productor_id) > 0
       ORDER BY productores_disponibles DESC
       LIMIT 50`,
      params
    );

    res.json({ data: result.rows, fallback: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/oferta/municipios/:municipio/interes — B-04
// Bodega marca interés en oferta de un municipio → notifica productores
// ═══════════════════════════════════════════════════════════════
router.post('/municipios/:municipio/interes', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { municipio } = req.params;
  const { bodega_id, tipo_maiz, precio_ofrecido, estado } = req.body;
  const userId = req.user!.userId;

  if (!bodega_id) {
    res.status(400).json({ error: 'bodega_id requerido' });
    return;
  }

  try {
    // 1. Verificar que la bodega pertenece al usuario
    const bodegaCheck = await pool.query(
      `SELECT b.id, b.nombre, b.municipio, b.estado, b.latitud, b.longitud,
              ic.telefono, ic.nombre AS contacto_nombre
       FROM bodegas b
       JOIN bodeguero_bodegas bb ON bb.bodega_id = b.id
       LEFT JOIN infraestructura_contactos ic ON ic.bodega_id = b.id AND ic.es_principal = TRUE
       WHERE b.id = $1 AND bb.usuario_id = $2 AND bb.estatus = 'aprobada'`,
      [bodega_id, userId]
    );
    if (bodegaCheck.rows.length === 0) {
      res.status(403).json({ error: 'Bodega no encontrada o no autorizada' });
      return;
    }
    const bodega = bodegaCheck.rows[0];

    // 2. Buscar productores con UP en ese municipio que tengan usuario en sistema
    const productores = await pool.query(
      `SELECT DISTINCT u2.id AS usuario_id
       FROM up u
       JOIN productor p ON p.productor_id = u.productor_id
       JOIN usuarios u2 ON (u2.id = p.usuario_id OR u2.curp = p.curp OR u2.correo_electronico = p.correo)
       WHERE u.nombre_municipio ILIKE $1
         AND u2.activo = TRUE AND u2.rol = 'productor'`,
      [municipio]
    );

    // 3. Crear notificación con info completa de la bodega
    const precioTxt = precio_ofrecido ? `$${Number(precio_ofrecido).toLocaleString()}/ton` : 'precio a convenir';
    const tipoTxt = tipo_maiz || 'maíz';
    const contactoTxt = bodega.contacto_nombre && bodega.telefono
      ? `\nContacto: ${bodega.contacto_nombre} — ${bodega.telefono}`
      : '';
    const msg =
      `La bodega "${bodega.nombre}" está interesada en comprar ${tipoTxt} en ${municipio}.\n\n` +
      `Ubicación: ${bodega.municipio}, ${bodega.estado}\n` +
      `Precio ofrecido: ${precioTxt}` +
      contactoTxt +
      `\n\nAcércate a la bodega si quieres vender tu maíz.`;

    let notificados = 0;
    for (const prod of productores.rows) {
      try {
        notificar({
          usuarioId: prod.usuario_id,
          tipo: 'interes_bodega_oferta',
          titulo: '🏪 Una bodega quiere comprarte',
          mensaje: msg,
          referenciaId: bodega_id,
          referenciaTipo: 'bodegas',
        }).catch(() => {});
        notificados++;
      } catch (_) { /* best-effort */ }
    }

    // 4. Guardar el interés del bodeguero para que pueda revisarlo en su apartado
    try {
      await pool.query(
        `INSERT INTO oferta_interes (usuario_id, bodega_id, municipio, estado, tipo_maiz)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (usuario_id, LOWER(municipio), COALESCE(tipo_maiz, ''))
         DO UPDATE SET bodega_id = EXCLUDED.bodega_id,
                       estado = COALESCE(EXCLUDED.estado, oferta_interes.estado),
                       creado_en = NOW()`,
        [userId, bodega_id, municipio, estado || bodega.estado || null, tipo_maiz || null]
      );
    } catch (_) { /* best-effort: la tabla puede no existir aún */ }

    res.json({ ok: true, productores_notificados: notificados });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/oferta/mis-intereses — ofertas que el bodeguero marcó
// Devuelve cada interés con la oferta ACTUAL (re-agregada) de ese municipio
// ═══════════════════════════════════════════════════════════════
router.get('/mis-intereses', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const result = await pool.query(
      `SELECT
         oi.id,
         oi.municipio,
         oi.estado,
         oi.tipo_maiz,
         oi.creado_en,
         COALESCE((
           SELECT COUNT(DISTINCT dp.productor_id)
           FROM disponibilidad_productor dp
           JOIN up u ON u.up_id = dp.up_id
           WHERE dp.activa = TRUE
             AND dp.fecha_vencimiento >= CURRENT_DATE
             AND u.nombre_municipio ILIKE oi.municipio
             AND (oi.tipo_maiz IS NULL OR dp.tipo_maiz ILIKE oi.tipo_maiz)
         ), 0) AS productores_disponibles,
         COALESCE((
           SELECT SUM(dp.volumen_estimado_ton)
           FROM disponibilidad_productor dp
           JOIN up u ON u.up_id = dp.up_id
           WHERE dp.activa = TRUE
             AND dp.fecha_vencimiento >= CURRENT_DATE
             AND u.nombre_municipio ILIKE oi.municipio
             AND (oi.tipo_maiz IS NULL OR dp.tipo_maiz ILIKE oi.tipo_maiz)
         ), 0)::numeric(12,2) AS toneladas_estimadas
       FROM oferta_interes oi
       WHERE oi.usuario_id = $1
       ORDER BY oi.creado_en DESC`,
      [userId]
    );
    res.json({ data: result.rows, total: result.rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/oferta/intereses/:id — quitar un interés guardado
router.delete('/intereses/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  try {
    const r = await pool.query(
      `DELETE FROM oferta_interes WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [req.params.id, userId]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Interés no encontrado' }); return; }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
