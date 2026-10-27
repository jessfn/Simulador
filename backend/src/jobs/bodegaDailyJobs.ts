import cron from 'node-cron';
import pool from '../config/database';

/**
 * Bodega Daily Jobs — runs at 00:01 server time via node-cron.
 * 1. Expire active purchase signals past their fecha_vencimiento.
 * 2. Mark pending transactions as 'expirada' after 48 h without producer response.
 * 3. Expire disponibilidad_productor past their fecha_vencimiento.
 */

export async function runBodegaDailyJobs(): Promise<void> {
  try {
    // 1. Vencer señales de compra cuya fecha ya pasó
    const senalesRes = await pool.query(
      `UPDATE senales_compra
         SET activa = FALSE
       WHERE activa = TRUE AND fecha_vencimiento < CURRENT_DATE
       RETURNING id`
    );
    if (senalesRes.rowCount && senalesRes.rowCount > 0) {
      console.log(`[CRON] Señales vencidas: ${senalesRes.rowCount}`);
    }

    // 2. Expirar transacciones pendientes sin respuesta después de 48 horas
    const txRes = await pool.query(
      `UPDATE transacciones
         SET confirmacion_productor = 'expirada',
             peso_precio_sistema    = 0.5,
             actualizado_en             = NOW()
       WHERE confirmacion_productor = 'pendiente'
         AND creado_en < NOW() - INTERVAL '48 hours'
       RETURNING id`
    );
    if (txRes.rowCount && txRes.rowCount > 0) {
      console.log(`[CRON] Transacciones expiradas: ${txRes.rowCount}`);
    }

    // 3. Vencer disponibilidades de productores
    try {
      await pool.query(
        `UPDATE disponibilidad_productor
           SET activa = FALSE
         WHERE activa = TRUE AND fecha_vencimiento < CURRENT_DATE`
      );
    } catch (_) { /* table may not exist yet */ }

    // 4. C-12: Alerta 30 días sin actualizar tarifario
    try {
      const tarifasViejas = await pool.query(`
        SELECT DISTINCT ts.bodega_id, bb.usuario_id
        FROM tarifario_servicios ts
        JOIN bodeguero_bodegas bb ON bb.bodega_id = ts.bodega_id
        WHERE ts.activo = TRUE
          AND CURRENT_DATE - ts.actualizado_en::date > 30
        GROUP BY ts.bodega_id, bb.usuario_id
      `);

      let alertasCreadas = 0;
      for (const tarifa of tarifasViejas.rows) {
        const alertaReciente = await pool.query(`
          SELECT id FROM notificaciones
          WHERE usuario_id = $1 AND tipo = 'alerta_tarifario'
            AND creado_en > NOW() - INTERVAL '7 days'
          LIMIT 1
        `, [tarifa.usuario_id]);

        if (alertaReciente.rows.length === 0) {
          await pool.query(`
            INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, leida)
            VALUES ($1, $2, $3, 'alerta_tarifario', FALSE)
          `, [
            tarifa.usuario_id,
            'Tu tarifario lleva más de 30 días sin actualizar',
            'Actualiza tu tarifario de servicios para seguir apareciendo en el Precio del Maíz de tu región.'
          ]);
          alertasCreadas++;
        }
      }
      if (alertasCreadas > 0) {
        console.log(`[CRON] Alertas tarifario creadas: ${alertasCreadas}`);
      }
    } catch (_) { /* tarifario_servicios table may not exist yet */ }

    console.log(`[CRON] Jobs diarios ejecutados: ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[CRON] Error en jobs diarios de bodega:', err);
  }
}

/**
 * Schedule the job to run daily at 00:01 using node-cron.
 * Call this once from src/index.ts at startup.
 */
export function scheduleBodegaDailyJobs(): void {
  // Run daily at 00:01
  cron.schedule('1 0 * * *', async () => {
    await runBodegaDailyJobs();
  }, { timezone: 'America/Mexico_City' });

  console.log('[CRON] Job diario programado para 00:01 (America/Mexico_City)');
}
