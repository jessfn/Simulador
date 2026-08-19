import pool from '../config/database';
import { enviarPushNativa } from './webpush';

interface OptsNotif {
  usuarioId: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  referenciaId?: number;
  referenciaTipo?: string;
  datosExtra?: string;
  alertaExternaId?: number;
  /** Ruta a la que abre la push nativa al tocarla; si se omite usa el mapeo por tipo. */
  url?: string;
}

/**
 * Inserta una notificación en DB y, si el usuario tiene push activo,
 * le envía también una notificación nativa al celular (aunque la app esté cerrada).
 * Siempre best-effort — nunca lanza excepción hacia el caller.
 */
export async function notificar(opts: OptsNotif): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notificaciones
         (usuario_id, tipo, titulo, mensaje, referencia_id, referencia_tipo, datos_extra, alerta_externa_id, leida)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE)`,
      [
        opts.usuarioId, opts.tipo, opts.titulo, opts.mensaje,
        opts.referenciaId ?? null, opts.referenciaTipo ?? null,
        opts.datosExtra ?? null, opts.alertaExternaId ?? null,
      ]
    );
  } catch (err) {
    console.error('notificar — error insertando notificación:', err);
    return;
  }

  // Push nativa: buscar credenciales del usuario
  try {
    const { rows } = await pool.query(
      `SELECT push_endpoint, push_p256dh, push_auth
       FROM usuarios
       WHERE id = $1 AND push_activo = TRUE
         AND push_endpoint IS NOT NULL`,
      [opts.usuarioId]
    );
    if (!rows.length) return;

    const { push_endpoint, push_p256dh, push_auth } = rows[0];
    await enviarPushNativa(
      { endpoint: push_endpoint, p256dh: push_p256dh, auth: push_auth },
      {
        titulo: opts.titulo,
        mensaje: opts.mensaje,
        tipo: opts.tipo,
        nivel: 'info',
        url: opts.url,
      }
    );
  } catch (err) {
    // Push falló (suscripción expirada, usuario desinstalé app, etc.) — ignorar
    console.warn(`notificar — push fallida usuario ${opts.usuarioId}:`, (err as any)?.message ?? err);
  }
}
