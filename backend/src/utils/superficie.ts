// T11 §11.4 · Superficie combinada: maíz + frijol sembrados en la misma parcela, el mismo año y el mismo tipo de ciclo
// no pueden superar la superficie de la parcela, salvo que la siembra sea asociada (milpa).
// UNA sola función para los cinco lugares donde se guarda un cultivo (maíz: crear, corregir y ciclo declarado por el productor; frijol: crear y corregir).

export type Cultivo = 'maiz' | 'frijol';

export interface EntradaSuperficie {
  upId: number | string;
  cycleYear: number | string;
  cycleType: string;
  /** Cultivo que se está guardando y las hectáreas que se quieren guardar. */
  cultivo: Cultivo;
  haNueva: number;
  /** True si el cultivo que se guarda está marcado como siembra asociada (milpa). Hoy solo frijol tiene ese campo. */
  asociadoNuevo?: boolean;
  /** Ciclo cuyo cultivo se está creando/reemplazando/corrigiendo: su valor anterior NO se suma (no se cuenta dos veces). */
  excluirCycleId?: number | string | null;
  /** Para el texto del mensaje. */
  accion?: 'registrando' | 'corrigiendo' | 'declarando';
}

export interface ResultadoSuperficie {
  ok: boolean;
  mensaje?: string;
  /** Cuerpo estructurado del 409 (la pantalla lo muestra). */
  detalle?: { codigo: 'SUPERFICIE_COMBINADA'; superficie_parcela: number; por_cultivo: { maiz: number; frijol: number }; suma: number };
}

const TOLERANCIA_HA = 0.01;
const NOMBRE: Record<Cultivo, string> = { maiz: 'maíz', frijol: 'frijol' };
// Punto decimal (como se escribe en México), sin depender de los datos de idioma del servidor.
const fmt = (n: number) => { const t = (Math.round(n * 100) / 100).toFixed(2); return t.endsWith('0') ? t.slice(0, -1) : t; };

/**
 * Calcula, con los cultivos de ciclos NO cancelados de esa parcela, ese año y ese tipo de ciclo (PV con PV, OI con OI), la suma de lo sembrado
 * incluyendo lo que se guarda. Bloquea si suma > superficie de la parcela + 0.01 ha. La superficie de la parcela es la ajustada (area_ha_real)
 * si existe y, si no, la calculada (area_ha_calc).
 *
 * Decisiones:
 *  - Un ciclo "cosechado" sigue ocupando la parcela de ese año: cuenta. Uno "cancelado" no.
 *  - Si en la parcela, ese año y tipo, NO hay otro cultivo, no se agrega ninguna restricción (la regla de "no más que la parcela" de un solo cultivo ya
 *    existe en cada flujo): así maíz solo no cambia de comportamiento.
 *  - Si alguno de los cultivos de la suma es siembra asociada (milpa), no se bloquea: la excepción aplica a toda la suma de ese ciclo.
 *  - Parcelas sin superficie (0 o vacía) no se pueden comparar: no se bloquea.
 */
export async function validarSuperficieCombinada(db: { query: (texto: string, valores?: unknown[]) => Promise<{ rows: any[] }> }, e: EntradaSuperficie): Promise<ResultadoSuperficie> {
  const up = await db.query('SELECT COALESCE(superficie_ha_real, superficie_ha_calculada)::float AS superficie FROM up WHERE up_id = $1', [e.upId]);
  const superficie = Number(up.rows[0]?.superficie || 0);
  if (!(superficie > 0)) return { ok: true };

  const otros = await db.query(
    `SELECT cc.cultivo, cc.superficie_sembrada_ha::float AS ha, COALESCE(fc.tipo_siembra = 'asociada', false) AS asociada
       FROM ciclo c
       JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id
       LEFT JOIN frijol_cultivo fc ON fc.ciclo_cultivo_id = cc.ciclo_cultivo_id
      WHERE c.up_id = $1 AND c.anio_ciclo = $2 AND c.tipo_ciclo = $3
        AND COALESCE(c.estado_ciclo, 'activo') <> 'cancelado'
        AND ($4::bigint IS NULL OR c.ciclo_id <> $4)
        AND cc.cultivo <> $5`,   // solo cuenta el OTRO cultivo: un duplicado del mismo cultivo lo atiende cada flujo con su propio mensaje
    [e.upId, e.cycleYear, e.cycleType, e.excluirCycleId ?? null, e.cultivo]
  );
  if (otros.rows.length === 0) return { ok: true };                        // un solo cultivo: no hay suma que revisar
  if (e.asociadoNuevo || otros.rows.some(r => r.asociada)) return { ok: true };   // milpa

  const porCultivo = { maiz: 0, frijol: 0 };
  for (const r of otros.rows) if (r.crop === 'maiz' || r.crop === 'frijol') porCultivo[r.crop as Cultivo] += Number(r.ha) || 0;
  const yaTiene = { ...porCultivo };
  porCultivo[e.cultivo] += Number(e.haNueva) || 0;
  const suma = porCultivo.maiz + porCultivo.frijol;
  if (suma <= superficie + TOLERANCIA_HA) return { ok: true };

  const otro: Cultivo = e.cultivo === 'maiz' ? 'frijol' : 'maiz';
  const ya = (yaTiene[otro] > 0 ? [`${fmt(yaTiene[otro])} ha de ${NOMBRE[otro]}`] : []);
  if (yaTiene[e.cultivo] > 0) ya.push(`${fmt(yaTiene[e.cultivo])} ha de ${NOMBRE[e.cultivo]}`);
  const accion = e.accion || 'registrando';
  const consejo = e.cultivo === 'frijol'
    ? 'Reduce la superficie, o si los dos cultivos van juntos en el mismo terreno, marca la siembra como asociada (milpa).'
    : 'Reduce la superficie, o si los dos cultivos van juntos en el mismo terreno, pide que se marque la siembra de frijol como asociada (milpa).';
  const mensaje = `No se pudo guardar. Esta parcela mide ${fmt(superficie)} ha. Ya tiene ${ya.join(' y ') || 'otro cultivo'} en el mismo ciclo y estás ${accion} ${fmt(e.haNueva)} ha de ${NOMBRE[e.cultivo]}, en total ${fmt(suma)} ha. ${consejo}`;
  return { ok: false, mensaje, detalle: { codigo: 'SUPERFICIE_COMBINADA', superficie_parcela: superficie, por_cultivo: porCultivo, suma } };
}
