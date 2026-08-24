import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { notificar } from '../utils/notificacion';

const router = Router();

// GET /api/transacciones
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user!;
  const { bodega_id, fecha_inicio, fecha_fin, tipo_maiz, limit } = req.query;

  try {
    const isAdmin = ['admin', 'responsable'].includes(user.rol);
    let where: string;
    const params: any[] = [];

    if (isAdmin) {
      where = 'WHERE 1=1';
    } else if (user.rol === 'productor') {
      // Productor ve sus transacciones donde él es el vendedor
      params.push(user.userId);
      where = `WHERE t.producer_id IN (
        SELECT p.producer_id FROM producer p
        JOIN usuarios u ON u.id = p.usuario_id
        WHERE u.id = $${params.length}
      )`;
    } else {
      // Bodeguero ve sus transacciones (como comprador)
      params.push(user.userId);
      where = `WHERE t.usuario_bodeguero = $${params.length}`;
    }

    if (bodega_id) { params.push(bodega_id); where += ` AND t.bodega_id = $${params.length}`; }
    if (tipo_maiz) { params.push(tipo_maiz); where += ` AND t.tipo_maiz = $${params.length}`; }
    if (fecha_inicio) { params.push(fecha_inicio); where += ` AND t.fecha >= $${params.length}`; }
    if (fecha_fin) { params.push(fecha_fin); where += ` AND t.fecha <= $${params.length}`; }

    // Paginación (corrección #6). Compatible con el atajo ?limit=N usado por
    // algunas vistas (p. ej. resumen del productor) sin página explícita.
    const { page, limit: limitQ } = req.query;
    const limitNum = parseInt(String(limitQ ?? limit ?? '20'), 10);
    const safeLimit = Number.isFinite(limitNum) && limitNum > 0 && limitNum <= 100 ? limitNum : 20;
    const pageNum = parseInt(String(page ?? '1'), 10);
    const safePage = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
    const offset = (safePage - 1) * safeLimit;

    // params para la query de datos (con LIMIT/OFFSET)
    const dataParams = [...params, safeLimit, offset];
    const result = await pool.query(
      `SELECT t.*, b.nombre AS bodega_nombre,
              t.precio_ton AS precio_por_ton,
              t.variedad_code AS variedad,
              t.confirmacion_productor AS estado_confirmacion,
              COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)), ''), t.nombre_productor_libre) AS nombre_productor
       FROM transacciones t
       JOIN bodegas b ON b.id = t.bodega_id
       LEFT JOIN producer p ON p.producer_id = t.producer_id
       ${where}
       ORDER BY t.fecha DESC, t.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM transacciones t ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    res.json({
      data: result.rows,
      pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) || 1 },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/transacciones/exportar?formato=csv
// IMPORTANTE: debe declararse ANTES de GET /:id para no colisionar con la ruta dinámica
router.get('/exportar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const isAdmin = ['admin', 'responsable'].includes(user.rol);

    let where: string;
    const params: any[] = [];

    if (isAdmin) {
      where = 'WHERE 1=1';
    } else if (user.rol === 'productor') {
      params.push(user.userId);
      where = `WHERE t.producer_id IN (
        SELECT p.producer_id FROM producer p
        JOIN usuarios u ON u.id = p.usuario_id WHERE u.id = $1
      )`;
    } else {
      params.push(user.userId);
      where = 'WHERE t.usuario_bodeguero = $1';
    }

    const result = await pool.query(
      `SELECT
          t.id,
          TO_CHAR(t.fecha, 'DD/MM/YYYY') AS fecha,
          b.nombre AS bodega,
          COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)), ''),
            t.nombre_productor_libre
          ) AS productor,
          t.tipo_maiz,
          t.variedad_code AS variedad,
          t.volumen_ton,
          t.precio_ton AS precio_por_ton,
          (t.volumen_ton * t.precio_ton) AS total_mxn,
          COALESCE(t.confirmacion_productor, 'pendiente') AS confirmacion
       FROM transacciones t
       JOIN bodegas b ON b.id = t.bodega_id
       LEFT JOIN producer p ON p.producer_id = t.producer_id
       ${where}
       ORDER BY t.fecha DESC, t.created_at DESC`,
      params
    );

    const headers = [
      'ID', 'Fecha', 'Bodega', 'Productor', 'Tipo Maíz',
      'Variedad', 'Volumen (ton)', 'Precio/ton (MXN)', 'Total (MXN)', 'Confirmación',
    ];

    const rows = result.rows.map(r => [
      r.id, r.fecha, r.bodega, r.productor,
      r.tipo_maiz || '', r.variedad || '',
      r.volumen_ton, r.precio_por_ton, r.total_mxn, r.confirmacion,
    ]);

    const escape = (cell: any) => {
      const s = cell == null ? '' : String(cell);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(escape).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transacciones_${Date.now()}.csv"`);
    res.send('﻿' + csv); // BOM para Excel en espanol
  } catch (error) {
    console.error('Error al exportar:', error);
    res.status(500).json({ error: 'Error al generar el CSV' });
  }
});

// POST /api/transacciones
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const {
    bodega_id, producer_id, nombre_productor_libre, tipo_maiz, variedad_code, volumen_ton, precio_ton, fecha, notas,
    humedad_pct, impurezas_pct, grano_quebrado_pct,
  } = req.body;

  if (!bodega_id || !tipo_maiz || !volumen_ton || !precio_ton || !fecha) {
    res.status(400).json({ error: 'Campos requeridos: bodega_id, tipo_maiz, volumen_ton, precio_ton, fecha' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO transacciones
         (bodega_id, usuario_bodeguero, producer_id, nombre_productor_libre,
          tipo_maiz, variedad_code, volumen_ton, precio_ton, fecha, notas,
          humedad_pct, impurezas_pct, grano_quebrado_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [bodega_id, userId, producer_id || null, nombre_productor_libre || null,
       tipo_maiz, variedad_code || null, volumen_ton, precio_ton, fecha, notas || null,
       humedad_pct != null && humedad_pct !== '' ? Number(humedad_pct) : null,
       impurezas_pct != null && impurezas_pct !== '' ? Number(impurezas_pct) : null,
       grano_quebrado_pct != null && grano_quebrado_pct !== '' ? Number(grano_quebrado_pct) : null]
    );

    const tx = result.rows[0];

    // Notificar al productor si tiene usuario (best-effort)
    if (producer_id) {
      try {
        const [bodegaR, prodR] = await Promise.all([
          pool.query('SELECT nombre FROM bodegas WHERE id = $1', [bodega_id]),
          pool.query('SELECT u.id FROM usuarios u JOIN producer p ON p.usuario_id = u.id WHERE p.producer_id = $1 LIMIT 1', [producer_id]),
        ]);
        if (prodR.rows.length > 0) {
          const msg = `La Bodega ${bodegaR.rows[0]?.nombre} registró una compra tuya: ${volumen_ton} ton a $${precio_ton}/ton. ¿Es correcto?`;
          notificar({
            usuarioId: prodR.rows[0].id,
            tipo: 'confirmacion_transaccion',
            titulo: '🧾 Nueva transacción registrada',
            mensaje: msg,
            referenciaId: tx.id,
            referenciaTipo: 'transacciones',
          }).catch(() => {});
        }
      } catch (_) { /* best-effort */ }
    }

    res.status(201).json(tx);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/transacciones/:id — detalle individual de una transacción
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const usuarioId = req.user!.userId;
    const isAdmin = ['admin', 'responsable'].includes(req.user!.rol);

    let query = `
      SELECT 
        t.id,
        t.bodega_id,
        t.producer_id,
        t.volumen_ton,
        t.precio_ton,
        t.precio_ton AS precio_por_ton,
        t.tipo_maiz,
        t.variedad_code,
        t.variedad_code AS variedad,
        t.fecha,
        t.notas,
        t.notas AS observaciones,
        t.confirmacion_productor,
        t.peso_precio_sistema,
        t.created_at,
        b.nombre AS bodega_nombre,
        b.municipio AS bodega_municipio,
        b.estado AS bodega_estado,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)), ''), t.nombre_productor_libre) AS nombre_productor
      FROM transacciones t
      LEFT JOIN bodegas b ON b.id = t.bodega_id
      LEFT JOIN producer p ON p.producer_id = t.producer_id
      WHERE t.id = $1
    `;
    const params: any[] = [id];

    // Si no es admin, verificar que la transacción pertenece al usuario
    if (!isAdmin) {
      query += ` AND (t.usuario_bodeguero = $2 OR t.producer_id IN (
        SELECT p.producer_id FROM producer p JOIN usuarios u ON u.id = p.usuario_id WHERE u.id = $2
      ))`;
      params.push(usuarioId);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Transacción no encontrada' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener transacción:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/transacciones/:id/confirmar
router.patch('/:id/confirmar', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { confirmacion } = req.body;
  if (!['confirmada', 'discrepancia'].includes(confirmacion)) {
    res.status(400).json({ error: "confirmacion debe ser 'confirmada' o 'discrepancia'" });
    return;
  }

  const peso = confirmacion === 'confirmada' ? 0.75 : 0;

  try {
    const result = await pool.query(
      `UPDATE transacciones SET confirmacion_productor = $1, peso_precio_sistema = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [confirmacion, peso, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Transacción no encontrada' }); return; }
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
