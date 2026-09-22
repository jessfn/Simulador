import pool from '../config/database';

let cachedDisponible: boolean | null = null;

// H4 (auditoría Fase 3, 2026-09-22): antes la validación de traslapes solo se
// ejecutaba si process.env.POSTGIS_ENABLED === 'true'. Si esa variable
// faltaba, tenía un typo, o el .env estaba incompleto, TODA la validación se
// desactivaba en silencio — sin log, sin error, el INSERT/UPDATE se hacía
// igual como si todo estuviera bien. Ahora se detecta la disponibilidad real
// de PostGIS consultando la extensión y se avisa explícitamente si no está.
export async function postgisDisponible(): Promise<boolean> {
  if (cachedDisponible !== null) return cachedDisponible;
  try {
    await pool.query('SELECT postgis_version()');
    cachedDisponible = true;
    console.log('[PostGIS] Extensión detectada y operativa. Validación de traslapes ACTIVA.');
  } catch (err) {
    cachedDisponible = false;
    console.error(
      '[PostGIS] ADVERTENCIA: PostGIS no disponible. ' +
      'La validación de traslapes queda DESACTIVADA hasta resolver esto. ' +
      'Detalle:', (err as Error).message
    );
  }
  return cachedDisponible;
}
