import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';

const router = Router();

const verTecnicos = checkPermiso('tecnicos', 'ver');
const verDetalleTecnicos = checkPermiso('tecnicos', 'ver_detalle');
const editarTecnicos = checkPermiso('tecnicos', 'editar');
const eliminarTecnicos = checkPermiso('tecnicos', 'eliminar');

// Misma generación de contraseña temporal que admin-permisos.ts (POST /usuarios)
function generarPassTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// =============================================
// GET /api/admin/tecnicos
// Lista todos los técnicos ECA (rol = 'capturista') con estadísticas agregadas.
// Soporta ?q= para buscar por nombre o email (ILIKE), igual que los demás
// listados admin (ver GET /api/admin/usuarios).
// =============================================
router.get('/', authMiddleware, verTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    const conditions: string[] = [`u.rol = 'capturista'`];
    const params: any[] = [];
    let idx = 1;

    if (q) {
      conditions.push(`(u.nombre_completo ILIKE $${idx} OR u.email ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT u.id, u.email, u.nombre_completo, u.activo, u.debe_cambiar_pass, u.ultimo_login, u.created_at,
              COUNT(DISTINCT p.producer_id) AS total_registros,
              COUNT(DISTINCT up.up_id) AS total_ups
       FROM usuarios u
       LEFT JOIN producer p ON p.usuario_capturista_id = u.id
       LEFT JOIN up up ON up.producer_id = p.producer_id
       ${where}
       GROUP BY u.id
       ORDER BY u.nombre_completo`,
      params
    );
    res.json({ tecnicos: result.rows });
  } catch (error) {
    console.error('Error al listar técnicos (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/admin/tecnicos/:id
// Detalle de un técnico + su lista de registros (productores capturados).
// =============================================
router.get('/:id', authMiddleware, verDetalleTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const tecnico = await pool.query(
      `SELECT id, email, nombre_completo, telefono, activo, debe_cambiar_pass, ultimo_login, created_at
       FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
      [id]
    );
    if (tecnico.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    const registros = await pool.query(
      `SELECT p.producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno,
              p.phone AS telefono, p.state_id, p.municipality_id, p.estatus_registro, p.fecha_captura,
              COUNT(DISTINCT u.up_id) AS total_ups, COUNT(DISTINCT c.cycle_id) AS total_ciclos
       FROM producer p
       LEFT JOIN up u ON u.producer_id = p.producer_id
       LEFT JOIN cycle c ON c.up_id = u.up_id
       WHERE p.usuario_capturista_id = $1
       GROUP BY p.producer_id
       ORDER BY p.fecha_captura DESC`,
      [id]
    );

    res.json({ tecnico: tecnico.rows[0], registros: registros.rows });
  } catch (error) {
    console.error('Error al obtener detalle de técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/admin/tecnicos/:id
// Edita nombre_completo, email, activo. No permite editar contraseña aquí.
// =============================================
router.patch('/:id', authMiddleware, editarTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, activo } = req.body;

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (nombre_completo !== undefined) { sets.push(`nombre_completo = $${idx++}`); vals.push(String(nombre_completo).trim()); }
    if (email !== undefined) {
      const emailLower = String(email).toLowerCase().trim();
      const colision = await pool.query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [emailLower, id]);
      if (colision.rows.length > 0) {
        res.status(409).json({ error: 'Ese correo ya está en uso por otro usuario' });
        return;
      }
      sets.push(`email = $${idx++}`); vals.push(emailLower);
    }
    if (activo !== undefined) { sets.push(`activo = $${idx++}`); vals.push(!!activo); }

    if (sets.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    vals.push(id);
    const result = await pool.query(
      `UPDATE usuarios SET ${sets.join(', ')}
       WHERE id = $${idx} AND rol = 'capturista'
       RETURNING id, email, nombre_completo, activo, debe_cambiar_pass, ultimo_login, created_at`,
      vals
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    res.json({ tecnico: result.rows[0] });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ese correo ya está en uso' });
      return;
    }
    console.error('Error al editar técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/admin/tecnicos/:id/reset-password
// Genera una contraseña temporal, la devuelve en texto plano UNA sola vez.
// =============================================
router.post('/:id/reset-password', authMiddleware, editarTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const passTemporal = generarPassTemporal();
    const hash = await bcrypt.hash(passTemporal, 12);

    const result = await pool.query(
      `UPDATE usuarios SET password_hash = $1, debe_cambiar_pass = true
       WHERE id = $2 AND rol = 'capturista'
       RETURNING id, nombre_completo, email`,
      [hash, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    res.json({
      tecnico: result.rows[0],
      password_temporal: passTemporal, // solo se devuelve UNA vez
    });
  } catch (error) {
    console.error('Error al resetear contraseña de técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// DELETE /api/admin/tecnicos/:id
// Elimina la cuenta del técnico. Sus productores capturados NO se borran ni
// se dan de baja: solo se libera usuario_capturista_id para que sigan
// siendo válidos aunque el técnico se dé de baja.
// =============================================
router.delete('/:id', authMiddleware, eliminarTecnicos, async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const tecnico = await client.query(
      `SELECT id, nombre_completo FROM usuarios WHERE id = $1 AND rol = 'capturista'`,
      [id]
    );
    if (tecnico.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Técnico no encontrado' });
      return;
    }

    await client.query('UPDATE producer SET usuario_capturista_id = NULL WHERE usuario_capturista_id = $1', [id]);
    await client.query('DELETE FROM usuarios WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ mensaje: `Técnico '${tecnico.rows[0].nombre_completo}' eliminado. Sus registros capturados se conservan.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar técnico (admin):', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

export default router;
