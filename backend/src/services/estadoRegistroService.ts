// Servicio único de completitud de registro del productor (Ticket 05).
// Ver SIMAC_tickets/05_CICLO_OBLIGATORIO.md. Reutilizado por
// GET /api/productor/estado-registro y por el middleware que protege las
// APIs operativas del rol productor.

import pool from '../config/database';

export interface EstadoRegistro {
  requiere_ubicacion: boolean;
  requiere_ciclo: boolean;
  siguiente_paso: 'ubicacion' | 'ciclo' | 'ninguno';
}

export async function evaluarEstadoRegistro(producerId: number): Promise<EstadoRegistro> {
  const upRes = await pool.query('SELECT COUNT(*)::int AS n FROM up WHERE producer_id = $1', [producerId]);
  const requiereUbicacion = (upRes.rows[0]?.n || 0) === 0;

  // Al menos un ciclo no cancelado, en cualquier UP propia, con cultivo de
  // maíz y datos mínimos persistidos (regla del ticket 05: no basta una
  // cabecera `cycle` vacía; variedad "Otra"/"Criollo" exige texto).
  const cicloRes = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM cycle c
       JOIN cycle_crop cc ON cc.cycle_id = c.cycle_id
       JOIN up u ON u.up_id = c.up_id
       WHERE u.producer_id = $1
         AND COALESCE(c.estado_ciclo, 'activo') != 'cancelado'
         AND c.cycle_year IS NOT NULL AND c.cycle_type IS NOT NULL
         AND COALESCE(c.tipo_riego, 'temporal') IN ('temporal', 'riego')
         AND cc.crop = 'maiz'
         AND cc.variety_id IS NOT NULL
         AND (cc.variety_id NOT IN ('OTRA', 'CRIOLLO_LOCAL') OR cc.variety_other IS NOT NULL)
         AND cc.area_sown_ha IS NOT NULL AND cc.area_sown_ha > 0
         AND cc.planting_date IS NOT NULL
     ) AS completo`,
    [producerId]
  );
  const requiereCiclo = !cicloRes.rows[0]?.completo;

  const siguienteS = requiereUbicacion ? 'ubicacion' : requiereCiclo ? 'ciclo' : 'ninguno';
  return { requiere_ubicacion: requiereUbicacion, requiere_ciclo: requiereCiclo, siguiente_paso: siguienteS };
}
