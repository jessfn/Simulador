import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/** Rate limit estricto para endpoints de autenticación (login, registro, PIN). */
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});

/**
 * T09 §9.3 (auditoría B8): límite de consultas de CURP de frijol, POR TÉCNICO (no por computadora).
 * Cada consulta gasta cuota de RENAPO/SADER y, sin límite, alguien podría recorrer CURP una tras otra.
 * Propuesta: 40 consultas cada 15 minutos por técnico. Un técnico en campo atiende una persona cada varios minutos
 * (consulta, a veces una segunda por una CURP mal escrita), así que 40 en 15 minutos no se alcanza en un uso normal,
 * mientras que recorrer CURP a mano o con un programa se corta de inmediato. Se puede ajustar sin tocar el código con
 * CONSULTA_CURP_MAX y CONSULTA_CURP_VENTANA_MIN en el .env (el ambiente de pruebas lo sube para correr sus pruebas).
 */
const CONSULTA_CURP_MAX = Number(process.env.CONSULTA_CURP_MAX) > 0 ? Number(process.env.CONSULTA_CURP_MAX) : 40;
const CONSULTA_CURP_VENTANA_MIN = Number(process.env.CONSULTA_CURP_VENTANA_MIN) > 0 ? Number(process.env.CONSULTA_CURP_VENTANA_MIN) : 15;
export const consultaCurpLimiter = rateLimit({
  windowMs: CONSULTA_CURP_VENTANA_MIN * 60 * 1000,
  max: CONSULTA_CURP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => (req.user?.userId ? `tecnico:${req.user.userId}` : ipKeyGenerator(req.ip || '')),
  message: { error: 'Hiciste muchas consultas en poco tiempo. Espera unos minutos.', codigo: 'DEMASIADAS_CONSULTAS' },
});
