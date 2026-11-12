import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

export const CARPETA_FOTOS_VERIFICACION = process.env.NODE_ENV === 'production'
  ? '/var/www/Simulador/uploads/verificacion'
  : path.join(__dirname, '../../../uploads/verificacion');

fs.mkdirSync(CARPETA_FOTOS_VERIFICACION, { recursive: true });

const PREFIJO_RUTA_GUARDADA = 'verificacion/';
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024;
// Acepta el formato anterior (vrf_<milisegundos>_<aleatorio>) y el actual (vrf_<uuid>).
const NOMBRE_DE_FOTO_VALIDO = /^vrf_(\d{13}_[a-z0-9]{1,6}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jpg$/;

export const recibirFotoVerificacion = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CARPETA_FOTOS_VERIFICACION),
    filename: (_req, _file, cb) => cb(null, `vrf_${crypto.randomUUID()}.jpg`),
  }),
  limits: { fileSize: TAMANO_MAXIMO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
}).single('foto');

export function esNombreDeFotoVerificacion(nombreArchivo: string): boolean {
  return NOMBRE_DE_FOTO_VALIDO.test(nombreArchivo);
}

export function rutaGuardadaDeFoto(nombreArchivo: string): string {
  return PREFIJO_RUTA_GUARDADA + nombreArchivo;
}

/** Devuelve la ruta tal cual si apunta a una foto de verificación válida; si no, null. */
export function validarRutaGuardadaDeFoto(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO_RUTA_GUARDADA)) return null;
  return esNombreDeFotoVerificacion(valor.slice(PREFIJO_RUTA_GUARDADA.length)) ? valor : null;
}
