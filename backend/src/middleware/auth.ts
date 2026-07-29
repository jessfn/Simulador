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
