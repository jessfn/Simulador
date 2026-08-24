import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import pool from '../config/database';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) { res.status(500).json({ error: 'Error de configuración del servidor' }); return; }
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Revocación server-side: si el token fue invalidado (logout), rechazarlo
    // aunque su firma y expiración sigan siendo válidas.
    if (decoded.jti) {
      const revocado = await pool.query('SELECT 1 FROM revoked_tokens WHERE jti = $1', [decoded.jti]);
      if (revocado.rows.length > 0) {
        res.status(401).json({ error: 'Token inválido o expirado' });
        return;
      }
    }

    // Sesión única por cuenta (Fase 1b, propuesta COFECE): un login nuevo
    // invalida cualquier sesión previa. Excluye admin/responsable (panel de
    // soporte con varias pestañas es un caso de uso legítimo).
    if (decoded.jti && !['admin', 'responsable'].includes(decoded.rol)) {
      const sesion = await pool.query('SELECT sesion_activa_jti FROM usuarios WHERE id = $1', [decoded.userId]);
      const jtiActivo = sesion.rows[0]?.sesion_activa_jti;
      if (jtiActivo && jtiActivo !== decoded.jti) {
        res.status(401).json({ error: 'Tu sesión se cerró porque iniciaste sesión en otro dispositivo' });
        return;
      }
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Solo permite continuar si el usuario autenticado tiene rol admin. */
export function soloAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
    return;
  }
  next();
}

/**
 * Igual que soloAdmin, pero consultando roles_panel.permisos_totales en vez
 * de comparar el rol contra el literal 'admin'. Refleja exactamente lo que
 * el frontend usa para mostrar la pestaña "Por aprobar" (permisosTotal):
 * cualquier rol que el sistema de /admin/permisos marque con permisos
 * totales (admin, responsable, o uno creado a futuro) queda autorizado,
 * en vez de solo el rol admin literal.
 */
export async function requierePermisosTotales(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT permisos_totales FROM roles_panel WHERE clave = $1',
      [req.user?.rol]
    );
    if (rows[0]?.permisos_totales) {
      next();
      return;
    }
    res.status(403).json({ error: 'Acceso denegado: se requieren permisos totales' });
  } catch {
    res.status(500).json({ error: 'Error verificando permisos' });
  }
}
