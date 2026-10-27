import cron from 'node-cron';
import pool from '../config/database';
import { verificarIdentidad, DatosPersona } from '../services/identidad';
import { PROGRAMA_FRIJOL } from '../utils/programas';

// Reverificación automática de identidad (frijol). Cada 6 horas toma los registros "pendientes de verificación"
// (los que se guardaron cuando SADER/RENAPO no respondían) y los vuelve a consultar.
//  - Persona válida -> "verificada". Si los datos de RENAPO/SADER difieren de lo capturado NO se sobrescribe:
//    se anota la diferencia en producer_cambios (usuario NULL, campo "discrepancia_renapo_<campo>").
//  - CURP inexistente o fallecida -> "no_valida" + "requiere_correccion": el técnico lo ve en su tablero y la corrige.
//  - Servicio caído -> se suma el intento y sigue pendiente.
// Respeta JOBS_ENABLED (en pruebas está apagada) y se puede correr a mano: `node dist/jobs/frijolVerificacion.js`.

const LOTE = 50;
const PAUSA_MS = 1000;

const quitaAcentos = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface ResumenVerificacion { revisados: number; verificados: number; no_validos: number; siguen_pendientes: number }

async function anotarDiscrepancias(producerId: number, p: Record<string, unknown>, d: DatosPersona): Promise<void> {
  const comparar: Array<[string, unknown, unknown]> = [
    ['nombres', p.nombres, d.nombres], ['apellido_paterno', p.apellido_paterno, d.apellido_paterno],
    ['apellido_materno', p.apellido_materno, d.apellido_materno], ['sexo', p.sexo, d.sexo], ['fecha_nacimiento', p.fn, d.fecha_nacimiento],
  ];
  for (const [campo, capturado, oficial] of comparar) {
    if (!oficial) continue; // la fuente no trae ese dato
    if (quitaAcentos(capturado) !== quitaAcentos(oficial)) {
      await pool.query(
        `INSERT INTO productor_cambios (productor_id, campo, valor_anterior, valor_nuevo, usuario_id, programa) VALUES ($1,$2,$3,$4,NULL,$5)`,
        [producerId, `discrepancia_renapo_${campo}`, capturado == null ? null : String(capturado), String(oficial), PROGRAMA_FRIJOL]
      );
    }
  }
}

export async function verificarPendientes(): Promise<ResumenVerificacion> {
  const lote = await pool.query(
    `SELECT pp.productor_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, p.sexo, to_char(p.fecha_nacimiento,'YYYY-MM-DD') AS fn
       FROM productor_programa pp JOIN productor p ON p.productor_id = pp.productor_id
      WHERE pp.programa = $1 AND pp.verificacion_identidad = 'pendiente'
      ORDER BY COALESCE(pp.verificacion_ultimo_intento, 'epoch'::timestamptz), pp.fecha_alta
      LIMIT $2`,
    [PROGRAMA_FRIJOL, LOTE]
  );
  const r: ResumenVerificacion = { revisados: 0, verificados: 0, no_validos: 0, siguen_pendientes: 0 };

  for (const fila of lote.rows) {
    r.revisados++;
    try {
      const ident = await verificarIdentidad(fila.curp);
      if (ident.tipo === 'PADRON_SADER' || ident.tipo === 'RENAPO') {
        await pool.query(
          `UPDATE productor_programa SET verificacion_identidad = 'verificada', verificacion_ultimo_intento = NOW(), actualizado_en = NOW()
            WHERE productor_id = $1 AND programa = $2`, [fila.producer_id, PROGRAMA_FRIJOL]);
        await anotarDiscrepancias(fila.producer_id, fila, ident.datos);
        r.verificados++;
      } else if (ident.tipo === 'CURP_NO_VALIDA' || ident.tipo === 'CURP_FALLECIDO') {
        await pool.query(
          `UPDATE productor_programa SET verificacion_identidad = 'no_valida', estatus_registro = 'requiere_correccion',
                  verificacion_ultimo_intento = NOW(), actualizado_en = NOW()
            WHERE productor_id = $1 AND programa = $2`, [fila.producer_id, PROGRAMA_FRIJOL]);
        r.no_validos++;
      } else {
        await pool.query(
          `UPDATE productor_programa SET verificacion_intentos = verificacion_intentos + 1, verificacion_ultimo_intento = NOW()
            WHERE productor_id = $1 AND programa = $2`, [fila.producer_id, PROGRAMA_FRIJOL]);
        r.siguen_pendientes++;
      }
    } catch (error) {
      console.error('[frijolVerificacion] error con un registro:', (error as Error).message);
      r.siguen_pendientes++;
    }
    await pausa(PAUSA_MS); // no saturar RENAPO
  }
  console.log(`[frijolVerificacion] revisados=${r.revisados} verificados=${r.verificados} no_validos=${r.no_validos} pendientes=${r.siguen_pendientes}`);
  return r;
}

export function scheduleFrijolVerificacion(): void {
  cron.schedule('0 */6 * * *', () => { verificarPendientes().catch(e => console.error('[frijolVerificacion]', e)); });
}

// Ejecución manual: node dist/jobs/frijolVerificacion.js
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config();
  verificarPendientes().then(r => { console.log(JSON.stringify(r)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}
