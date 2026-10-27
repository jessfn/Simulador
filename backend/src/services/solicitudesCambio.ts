// T10 · Solicitudes de cambio de datos personales: crear, resolver, cancelar y escalar por vencimiento.
// Todo lo que decide quién resuelve se calcula AQUÍ, en el servidor; el cliente nunca elige el responsable.

import pool from '../config/database';
import { PROGRAMA_FRIJOL, PROGRAMA_MAIZ } from '../utils/programas';
import {
  CAMPOS_PERSONALES, CampoPersonal, ErrorEdicion, escribirCampo, esCampoPersonal, estadoDeCampos, normalizarValor, valorActual,
} from './edicionUnica';

export const DIAS_VENCIMIENTO = 7;
export const NOMBRE_PROGRAMA: Record<string, string> = { [PROGRAMA_MAIZ]: 'Maíz', [PROGRAMA_FRIJOL]: 'Frijol' };

const comparable = (campo: string, v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return campo === 'telefono' ? s.replace(/[\s\-()]/g, '') : campo === 'correo' ? s.toLowerCase() : s;
};

export interface Asignacion { tipo: 'tecnico' | 'admin'; usuarioId: number | null; motivo: string }

/**
 * A quién le toca resolver:
 *  - Teléfono de un productor con cuenta  -> administrador.
 *  - Los demás campos -> el técnico responsable del OTRO programa (producer_programa.usuario_capturista_id del programa distinto al de quien pide).
 *    Si no hay otro programa, el técnico no existe, está inactivo o es el mismo que pide -> administrador.
 *  - Con varios programas distintos (a futuro) se toma el que se dio de alta primero.
 */
export async function calcularAsignacion(db: { query: Function }, producerId: number, solicitanteId: number, programaSolicitante: string, campo: CampoPersonal): Promise<Asignacion> {
  if (campo === 'telefono') {
    const c = await db.query('SELECT usuario_id IS NOT NULL AS con_cuenta FROM productor WHERE productor_id = $1', [producerId]);
    if (c.rows[0]?.con_cuenta) return { tipo: 'admin', usuarioId: null, motivo: 'Teléfono de un productor con cuenta: lo aprueba un administrador' };
  }
  const otros = await db.query(
    `SELECT pp.programa, pp.usuario_capturista_id AS tecnico, COALESCE(u.activo, false) AS activo, u.rol
       FROM productor_programa pp LEFT JOIN usuarios u ON u.id = pp.usuario_capturista_id
      WHERE pp.productor_id = $1 AND pp.programa <> $2 ORDER BY pp.fecha_alta, pp.programa`, [producerId, programaSolicitante]);
  if (otros.rows.length === 0) return { tipo: 'admin', usuarioId: null, motivo: 'El productor solo está en un programa: lo resuelve un administrador' };
  for (const o of otros.rows) {
    if (o.tecnico && o.activo && o.rol === 'capturista' && Number(o.tecnico) !== solicitanteId) {
      return { tipo: 'tecnico', usuarioId: Number(o.tecnico), motivo: `Lo resuelve el técnico responsable en ${NOMBRE_PROGRAMA[o.programa] || o.programa}` };
    }
  }
  return { tipo: 'admin', usuarioId: null, motivo: 'El técnico del otro programa no está disponible (sin asignar, inactivo o es la misma persona): lo resuelve un administrador' };
}

export interface DatosNueva { producerId: number; campo: unknown; valorNuevo: unknown; motivo: unknown; solicitanteId: number; programa: string }

/** Crea una solicitud. Reglas: el campo debe estar bloqueado para edición directa, el valor debe ser válido y distinto, y no puede haber otra pendiente. */
export async function crearSolicitud(d: DatosNueva): Promise<{ id: number; asignado_tipo: string; mensaje: string }> {
  if (!esCampoPersonal(d.campo)) throw new ErrorEdicion(400, 'VALIDACION', 'Elige qué dato quieres cambiar', 'campo');
  const campo = d.campo;
  const motivo = String(d.motivo ?? '').trim();
  if (motivo.length < 5) throw new ErrorEdicion(400, 'VALIDACION', 'Escribe el motivo del cambio (al menos 5 letras)', 'motivo');
  if (motivo.length > 500) throw new ErrorEdicion(400, 'VALIDACION', 'El motivo es muy largo (máximo 500 letras)', 'motivo');
  const n = normalizarValor(campo, d.valorNuevo);
  if (!n.ok) throw new ErrorEdicion(400, 'VALIDACION', n.error, 'valor_nuevo');
  if (n.valor === null && campo !== 'apellido_materno' && campo !== 'correo') throw new ErrorEdicion(400, 'VALIDACION', 'Escribe el valor nuevo', 'valor_nuevo');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = (await client.query(
      `SELECT nombres, apellido_paterno, apellido_materno, sexo, to_char(fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento, telefono, correo FROM productor WHERE productor_id = $1 FOR UPDATE`,
      [d.producerId])).rows[0];
    if (!p) throw new ErrorEdicion(404, 'PRODUCTOR_NO_ENCONTRADO', 'El productor no existe');
    const resp = await client.query('SELECT usuario_capturista_id FROM productor_programa WHERE productor_id = $1 AND programa = $2', [d.producerId, d.programa]);
    if (resp.rows.length === 0 || Number(resp.rows[0].usuario_capturista_id) !== d.solicitanteId) {
      throw new ErrorEdicion(403, 'SIN_ACCESO', 'Solo puedes pedir cambios de los productores que registraste tú');
    }
    const actual = valorActual(p, campo);
    if (comparable(campo, actual) === comparable(campo, n.valor)) throw new ErrorEdicion(400, 'SIN_CAMBIO', 'El valor nuevo es igual al que ya tiene el productor', 'valor_nuevo');
    const st = (await estadoDeCampos(client, d.producerId)).find(e => e.campo === campo)!;
    if (st.solicitud_pendiente_id) {
      throw new ErrorEdicion(409, 'SOLICITUD_PENDIENTE', `Ya hay una solicitud pendiente para ${CAMPOS_PERSONALES[campo].etiqueta} de este productor. Espera la respuesta o cancélala para crear otra.`, 'campo', { solicitud_id: st.solicitud_pendiente_id });
    }
    if (st.editable) {
      throw new ErrorEdicion(409, 'PUEDE_EDITAR_DIRECTO', `Todavía puedes cambiar ${CAMPOS_PERSONALES[campo].etiqueta} directo, una sola vez. Edítalo desde la ficha del productor.`, 'campo');
    }
    const asig = await calcularAsignacion(client, d.producerId, d.solicitanteId, d.programa, campo);
    const r = await client.query(
      `INSERT INTO solicitud_cambio (productor_id, campo, valor_actual, valor_propuesto, motivo, solicitante_id, programa_solicitante,
                                     asignado_tipo, asignado_a, motivo_asignacion, vence_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() + ($11 || ' days')::interval) RETURNING id`,
      [d.producerId, campo, actual, n.valor, motivo, d.solicitanteId, d.programa, asig.tipo, asig.usuarioId, asig.motivo, String(DIAS_VENCIMIENTO)]);
    await client.query('COMMIT');
    return {
      id: Number(r.rows[0].id), asignado_tipo: asig.tipo,
      mensaje: asig.tipo === 'admin' ? 'Solicitud enviada. La resolverá un administrador.' : 'Solicitud enviada al técnico responsable del otro programa. Si no responde en 7 días la resuelve un administrador.',
    };
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    // Barrera ante condiciones de carrera: el índice único de pendientes.
    if (e?.code === '23505') throw new ErrorEdicion(409, 'SOLICITUD_PENDIENTE', 'Ya hay una solicitud pendiente para ese dato de este productor.', 'campo');
    throw e;
  } finally { client.release(); }
}

export interface Resolutor { id: number; esAdmin: boolean }

/** Aprueba o rechaza UNA vez: la fila se bloquea (FOR UPDATE) y un segundo intento recibe 409 YA_RESUELTA sin cambiar nada. */
export async function resolverSolicitud(
  id: number, quien: Resolutor, decision: { aprobar: true; confirmar?: boolean } | { aprobar: false; motivoRechazo: unknown }
): Promise<{ estado: 'aprobada' | 'rechazada'; mensaje: string }> {
  if (!decision.aprobar) {
    const m = String(decision.motivoRechazo ?? '').trim();
    if (m.length < 5) throw new ErrorEdicion(400, 'VALIDACION', 'Escribe el motivo del rechazo (al menos 5 letras)', 'motivo_rechazo');
    if (m.length > 500) throw new ErrorEdicion(400, 'VALIDACION', 'El motivo es muy largo (máximo 500 letras)', 'motivo_rechazo');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const s = (await client.query('SELECT * FROM solicitud_cambio WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!s) throw new ErrorEdicion(404, 'NO_ENCONTRADA', 'La solicitud no existe');
    const leToca = quien.esAdmin || (s.asignado_tipo === 'tecnico' && Number(s.asignado_a) === quien.id);
    if (!leToca) throw new ErrorEdicion(403, 'NO_ES_TUYA', 'Esta solicitud no te toca resolver');
    if (s.estado !== 'pendiente') throw new ErrorEdicion(409, 'YA_RESUELTA', 'Esta solicitud ya fue resuelta; no se hizo ningún cambio.');
    if (Number(s.solicitante_id) === quien.id) throw new ErrorEdicion(403, 'PROPIA', 'No puedes resolver una solicitud que tú mismo hiciste');
    const campo = s.campo as CampoPersonal;

    if (!decision.aprobar) {
      await client.query(
        `UPDATE solicitud_cambio SET estado='rechazada', resuelto_por=$2, resuelto_en=NOW(), motivo_rechazo=$3, visto_por_solicitante=FALSE WHERE id=$1`,
        [id, quien.id, String(decision.motivoRechazo).trim()]);
      await client.query('COMMIT');
      return { estado: 'rechazada', mensaje: 'Solicitud rechazada. El solicitante verá tu motivo.' };
    }

    const n = normalizarValor(campo, s.valor_propuesto);
    if (!n.ok) throw new ErrorEdicion(400, 'VALIDACION', `El valor propuesto ya no es válido: ${n.error}. Recházala indicando el motivo.`);
    const p = (await client.query(
      `SELECT nombres, apellido_paterno, apellido_materno, sexo, to_char(fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento, telefono, correo, usuario_id
         FROM productor WHERE productor_id = $1 FOR UPDATE`, [s.producer_id])).rows[0];
    const ahora = valorActual(p, campo);
    // Si el dato cambió desde que se pidió, se avisa y se pide confirmar (no se aplica a ciegas).
    if (comparable(campo, ahora) !== comparable(campo, s.valor_actual) && !(decision as { confirmar?: boolean }).confirmar) {
      throw new ErrorEdicion(409, 'VALOR_CAMBIO',
        'El dato del productor cambió desde que se pidió esta solicitud. Revisa el valor actual y vuelve a aprobar si quieres aplicar el cambio de todos modos.',
        undefined, { valor_al_pedir: s.valor_actual, valor_ahora: ahora, valor_propuesto: s.valor_propuesto });
    }
    if (comparable(campo, ahora) !== comparable(campo, n.valor)) {
      await escribirCampo(client, Number(s.producer_id), campo, n.valor);
      // El teléfono del productor con cuenta también es el de su cuenta (con él recupera su NIP): se mantienen iguales.
      if (campo === 'telefono' && p.usuario_id) await client.query('UPDATE usuarios SET telefono = $1 WHERE id = $2', [n.valor, p.usuario_id]);
    }
    await client.query(
      `INSERT INTO productor_cambios (productor_id, campo, valor_anterior, valor_nuevo, usuario_id, programa, consume_edicion, solicitud_id, aprobado_por)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8)`,
      [s.producer_id, campo, ahora, n.valor, s.solicitante_id, s.programa_solicitante, id, quien.id]);
    await client.query(`UPDATE solicitud_cambio SET estado='aprobada', resuelto_por=$2, resuelto_en=NOW(), visto_por_solicitante=FALSE WHERE id=$1`, [id, quien.id]);
    await client.query('COMMIT');
    return { estado: 'aprobada', mensaje: 'Solicitud aprobada. El cambio ya se aplicó.' };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

/** El solicitante cancela su solicitud mientras siga pendiente. */
export async function cancelarSolicitud(id: number, usuarioId: number): Promise<void> {
  const r = await pool.query(
    `UPDATE solicitud_cambio SET estado='cancelada', resuelto_por=$2, resuelto_en=NOW(), visto_por_solicitante=TRUE
      WHERE id=$1 AND solicitante_id=$2 AND estado='pendiente' RETURNING id`, [id, usuarioId]);
  if (r.rows.length > 0) return;
  const s = await pool.query('SELECT solicitante_id, estado FROM solicitud_cambio WHERE id = $1', [id]);
  if (s.rows.length === 0) throw new ErrorEdicion(404, 'NO_ENCONTRADA', 'La solicitud no existe');
  if (Number(s.rows[0].solicitante_id) !== usuarioId) throw new ErrorEdicion(403, 'NO_ES_TUYA', 'Solo quien pidió el cambio puede cancelarlo');
  throw new ErrorEdicion(409, 'YA_RESUELTA', 'Esta solicitud ya fue resuelta; no se puede cancelar.');
}

const LOCK_ESCALADO = 7410;   // advisory lock: dos instancias del servidor no procesan el vencimiento a la vez

/**
 * Pasa al administrador las solicitudes pendientes de un técnico que llevan DIAS_VENCIMIENTO días sin respuesta.
 * Conserva quién debía responder (asignado_original_id). Es un solo UPDATE atómico, así que repetirlo no duplica nada.
 * `ahora` permite simular fechas en pruebas.
 */
export async function escalarVencidas(ahora: Date = new Date()): Promise<number> {
  const client = await pool.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ESCALADO]);
    if (!lock.rows[0].ok) return 0;
    try {
      const r = await client.query(
        `UPDATE solicitud_cambio
            SET asignado_original_id = asignado_a, asignado_tipo = 'admin', asignado_a = NULL, escalada = TRUE, escalada_en = $1,
                motivo_asignacion = motivo_asignacion || ' · Sin respuesta en ${DIAS_VENCIMIENTO} días: pasó a un administrador'
          WHERE estado = 'pendiente' AND asignado_tipo = 'tecnico' AND vence_en <= $1 RETURNING id`, [ahora]);
      return r.rowCount ?? 0;
    } finally { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ESCALADO]); }
  } finally { client.release(); }
}

// ── Consultas ──
const SELECT_LISTA = `
  SELECT s.id::int AS id, s.productor_id::int AS producer_id, s.campo, s.valor_actual, s.valor_propuesto, s.motivo, s.estado, s.escalada,
         s.programa_solicitante, s.asignado_tipo, s.asignado_a, s.motivo_asignacion, s.motivo_rechazo, s.visto_por_solicitante,
         s.creado_en, s.vence_en, s.resuelto_en, s.escalada_en,
         p.curp, TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS productor,
         us.nombre_completo AS solicitante, ua.nombre_completo AS asignado_nombre, uo.nombre_completo AS asignado_original_nombre,
         ur.nombre_completo AS resuelto_por_nombre, ur.rol AS resuelto_por_rol
    FROM solicitud_cambio s
    JOIN productor p ON p.productor_id = s.productor_id
    JOIN usuarios us ON us.id = s.solicitante_id
    LEFT JOIN usuarios ua ON ua.id = s.asignado_a
    LEFT JOIN usuarios uo ON uo.id = s.asignado_original_id
    LEFT JOIN usuarios ur ON ur.id = s.resuelto_por`;

export async function porResolver(usuarioId: number) {
  return (await pool.query(`${SELECT_LISTA} WHERE s.estado = 'pendiente' AND s.asignado_tipo = 'tecnico' AND s.asignado_a = $1 ORDER BY s.creado_en`, [usuarioId])).rows;
}
export async function misSolicitudes(usuarioId: number, programa?: string) {
  return (await pool.query(
    `${SELECT_LISTA} WHERE s.solicitante_id = $1 AND ($2::text IS NULL OR s.programa_solicitante = $2) ORDER BY (s.estado = 'pendiente') DESC, s.creado_en DESC LIMIT 200`,
    [usuarioId, programa ?? null])).rows;
}
export async function resumenTecnico(usuarioId: number): Promise<{ por_resolver: number; respuestas_nuevas: number }> {
  const r = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE estado = 'pendiente' AND asignado_tipo = 'tecnico' AND asignado_a = $1)::int AS por_resolver,
            COUNT(*) FILTER (WHERE solicitante_id = $1 AND NOT visto_por_solicitante)::int AS respuestas_nuevas
       FROM solicitud_cambio WHERE asignado_a = $1 OR solicitante_id = $1`, [usuarioId]);
  return r.rows[0];
}
export async function marcarVistas(usuarioId: number): Promise<void> {
  await pool.query('UPDATE solicitud_cambio SET visto_por_solicitante = TRUE WHERE solicitante_id = $1 AND NOT visto_por_solicitante', [usuarioId]);
}
export { SELECT_LISTA };
