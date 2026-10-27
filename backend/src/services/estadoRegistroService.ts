// Servicio único de completitud de registro del productor (Ticket 05).
// Ver SIMAC_tickets/05_CICLO_OBLIGATORIO.md. Reutilizado por
// GET /api/productor/estado-registro y por el middleware que protege las
// APIs operativas del rol productor.

import pool from '../config/database';
import { parcelaDeMaiz } from '../utils/programas';

export interface EstadoRegistro {
  requiere_ubicacion: boolean;
  requiere_ciclo: boolean;
  siguiente_paso: 'ubicacion' | 'ciclo' | 'ninguno';
}

export async function evaluarEstadoRegistro(producerId: number): Promise<EstadoRegistro> {
  // Solo cuentan las parcelas que son de maíz (T11): una parcela que únicamente registró frijol no cumple el paso "ubicación" de maíz
  const upRes = await pool.query(`SELECT COUNT(*)::int AS n FROM up WHERE productor_id = $1 AND ${parcelaDeMaiz('up')}`, [producerId]);
  const requiereUbicacion = (upRes.rows[0]?.n || 0) === 0;

  // Al menos un ciclo no cancelado, en cualquier UP propia, con cultivo de
  // maíz y datos mínimos persistidos (regla del ticket 05: no basta una
  // cabecera `cycle` vacía; variedad "Otra"/"Criollo" exige texto).
  const cicloRes = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM ciclo c
       JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
       JOIN up u ON u.up_id = c.up_id
       WHERE u.productor_id = $1
         AND COALESCE(c.estado_ciclo, 'activo') != 'cancelado'
         AND c.anio_ciclo IS NOT NULL AND c.tipo_ciclo IS NOT NULL
         AND COALESCE(c.tipo_riego, 'temporal') IN ('temporal', 'riego')
         AND cc.cultivo = 'maiz'
         AND cc.variedad_id IS NOT NULL
         AND (cc.variedad_id NOT IN ('OTRA', 'CRIOLLO_LOCAL') OR cc.variedad_otra IS NOT NULL)
         AND cc.superficie_sembrada_ha IS NOT NULL AND cc.superficie_sembrada_ha > 0
         AND cc.fecha_siembra IS NOT NULL
     ) AS completo`,
    [producerId]
  );
  const requiereCiclo = !cicloRes.rows[0]?.completo;

  const siguienteS = requiereUbicacion ? 'ubicacion' : requiereCiclo ? 'ciclo' : 'ninguno';
  return { requiere_ubicacion: requiereUbicacion, requiere_ciclo: requiereCiclo, siguiente_paso: siguienteS };
}
