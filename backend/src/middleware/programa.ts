import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import pool from '../config/database';
import { PROGRAMA_MAIZ } from '../utils/programas';

/**
 * Deja pasar solo a quien tiene el programa en `usuario_programa`. Usar DESPUÉS de authMiddleware.
 * Compatibilidad: una cuenta de técnico que aún no tiene ningún programa asignado se trata como de maíz
 * (así las cuentas creadas por el camino anterior siguen funcionando); para cualquier otro programa se exige el renglón.
 */
export function requierePrograma(programa: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) { res.status(401).json({ error: 'No autenticado' }); return; }
      const { rows } = await pool.query('SELECT programa FROM usuario_programa WHERE usuario_id = $1', [userId]);
      const tiene = rows.some((r: { programa: string }) => r.programa === programa);
      if (tiene || (rows.length === 0 && programa === PROGRAMA_MAIZ)) { next(); return; }
      res.status(403).json({ error: 'Tu cuenta no tiene acceso a este programa', codigo: 'SIN_PROGRAMA', programa });
    } catch (error) {
      console.error('Error en requierePrograma:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  };
}
