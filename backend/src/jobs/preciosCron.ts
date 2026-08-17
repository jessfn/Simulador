import cron from 'node-cron';
import pool from '../config/database';
import { actualizarReferenciasExternas } from '../services/preciosExternos';

/**
 * Job de Precios Externos - se ejecuta diariamente a las 14:00 hrs hora de la
 * Ciudad de México. El Dólar FIX de Banxico (SF43718) se publica entre 12:00
 * y 13:00 hrs, así que antes de esa hora el cron traería el valor del día
 * hábil anterior. Consulta Yahoo Finance (Chicago ZC=F) y Banxico API
 * (TC USD/MXN, FIX oficial).
 */
export async function runPreciosCron(): Promise<void> {
  try {
    console.log('[CRON] Iniciando actualización diaria de precios a las 14:00 hrs...');
    const result = await actualizarReferenciasExternas('cron');
    console.log('[CRON] Actualización de precios finalizada con éxito. ID insertado:', result?.id);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[CRON] Error al actualizar precios en cron diario:', msg);
    // Notificar a los administradores (best-effort) — sin guardar valores ficticios en BD
    try {
      await pool.query(
        `INSERT INTO notificaciones (usuario_id, tipo, mensaje)
         SELECT id, 'sistema', $1 FROM usuarios WHERE rol IN ('admin','responsable')`,
        [`Error en actualización de precios: ${msg}`]
      );
    } catch (_) { /* ignore si notificaciones falla */ }
  }
}

/**
 * Agenda el job para ejecutarse todos los días a las 14:00 hrs (America/Mexico_City),
 * una vez que Banxico ya publicó el Dólar FIX del día.
 */
export function schedulePreciosCron(): void {
  cron.schedule('0 14 * * *', async () => {
    await runPreciosCron();
  }, { timezone: 'America/Mexico_City' });

  console.log('[CRON] Job de actualización de precios programado para las 14:00 hrs (America/Mexico_City)');
}
