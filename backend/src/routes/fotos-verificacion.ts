import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';
import {
  CARPETA_FOTOS_VERIFICACION,
  esNombreDeFotoVerificacion,
  recibirFotoVerificacion,
  rutaGuardadaDeFoto,
} from '../services/fotosVerificacion';

const router = Router();

router.get('/:archivo', authMiddleware, checkPermiso('avisos-privacidad', 'ver'), (req: Request, res: Response): void => {
  const { archivo } = req.params;
  if (!esNombreDeFotoVerificacion(archivo)) {
    res.status(404).json({ error: 'Foto no encontrada' });
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path.join(CARPETA_FOTOS_VERIFICACION, archivo), (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: 'Foto no encontrada' });
  });
});

/** Se usa antes de que exista la cuenta, por eso no pide sesión. */
export function subirFotoVerificacion(req: Request, res: Response): void {
  recibirFotoVerificacion(req, res, (error: unknown) => {
    if (error) {
      const excedeTamano = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      res.status(400).json({ error: excedeTamano ? 'La imagen pesa más de 8 MB' : 'Solo se permiten imágenes' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No se recibió ninguna imagen' });
      return;
    }
    res.json({ path: rutaGuardadaDeFoto(req.file.filename) });
  });
}

export default router;
