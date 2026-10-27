import cron from 'node-cron';
import { escalarVencidas } from '../services/solicitudesCambio';

// T10 §10.6: una vez al día (02:30, hora de México, cuando casi nadie usa el sistema) pasa al administrador las solicitudes de cambio
// que un técnico no respondió en 7 días. Respeta JOBS_ENABLED (se registra desde index.ts solo si las tareas están activas).
// Con dos instancias del servidor solo una procesa a la vez (advisory lock en escalarVencidas) y el UPDATE es atómico: repetirlo no duplica nada.
export function scheduleSolicitudesVencimiento(): void {
  cron.schedule('30 2 * * *', () => {
    escalarVencidas()
      .then(n => { if (n > 0) console.log(`[solicitudesVencimiento] ${n} solicitud(es) pasaron al administrador`); })
      .catch(e => console.error('[solicitudesVencimiento]', (e as Error)?.message));
  }, { timezone: 'America/Mexico_City' });
  console.log('[CRON] Vencimiento de solicitudes de cambio programado para las 02:30 (America/Mexico_City)');
}
