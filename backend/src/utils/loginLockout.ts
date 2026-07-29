import pool from '../config/database';

const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

/** Retorna los minutos restantes de bloqueo si el usuario está bloqueado, o null si puede intentar. */
export async function verificarBloqueo(usuarioId: number): Promise<number | null> {
  const { rows } = await pool.query(
    'SELECT bloqueado_hasta FROM usuarios WHERE id = $1',
    [usuarioId]
  );
  const bloqueadoHasta = rows[0]?.bloqueado_hasta;
  if (!bloqueadoHasta) return null;

  const restanteMs = new Date(bloqueadoHasta).getTime() - Date.now();
  if (restanteMs <= 0) return null;

  return Math.ceil(restanteMs / 60000);
}

/** Incrementa el contador de intentos fallidos; bloquea la cuenta si llega al máximo. */
export async function registrarIntentoFallido(usuarioId: number): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1
     WHERE id = $1 RETURNING intentos_fallidos`,
    [usuarioId]
  );
  const intentos = rows[0]?.intentos_fallidos ?? 0;
  if (intentos >= MAX_INTENTOS) {
    await pool.query(
      `UPDATE usuarios SET bloqueado_hasta = NOW() + INTERVAL '${BLOQUEO_MINUTOS} minutes'
       WHERE id = $1`,
      [usuarioId]
    );
  }
}

/** Resetea el contador tras un login exitoso. */
export async function limpiarIntentosFallidos(usuarioId: number): Promise<void> {
  await pool.query(
    'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1',
    [usuarioId]
  );
}
