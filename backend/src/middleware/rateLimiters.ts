import rateLimit from 'express-rate-limit';

/** Rate limit estricto para endpoints de autenticación (login, registro, PIN). */
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
});
