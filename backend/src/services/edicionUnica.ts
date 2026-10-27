// T10 · Edición única de datos personales del productor.
//
// Regla (decisiones cerradas de la líder):
//  - Sobre un productor que ya existía, cada campo personal lo puede editar DIRECTO un técnico UNA sola vez; después queda bloqueado
//    y el cambio va por solicitud.
//  - El teléfono de un productor CON CUENTA nunca se edita directo (ni la primera vez): va como solicitud a un administrador.
//  - El alta nueva no gasta la edición. La CURP no entra (tiene su propio flujo). El administrador y los jobs tampoco la gastan.
//
// "Edición usada" = existe un renglón de producer_cambios con consume_edicion = TRUE para ese productor y campo.
// Se calcula al vuelo con un índice parcial (idx_producer_cambios_edicion): una consulta corta, no hace falta columna aparte.

import { PoolClient } from 'pg';

export type CampoPersonal = 'nombres' | 'apellido_paterno' | 'apellido_materno' | 'sexo' | 'fecha_nacimiento' | 'correo' | 'telefono';

export const CAMPOS_PERSONALES: Record<CampoPersonal, { columna: string; etiqueta: string }> = {
  nombres: { columna: 'nombres', etiqueta: 'el nombre' },
  apellido_paterno: { columna: 'apellido_paterno', etiqueta: 'el apellido paterno' },
  apellido_materno: { columna: 'apellido_materno', etiqueta: 'el apellido materno' },
  sexo: { columna: 'sexo', etiqueta: 'el sexo' },
  fecha_nacimiento: { columna: 'fecha_nacimiento', etiqueta: 'la fecha de nacimiento' },
  correo: { columna: 'correo', etiqueta: 'el correo' },
  telefono: { columna: 'phone', etiqueta: 'el teléfono' },
};
export const LISTA_CAMPOS = Object.keys(CAMPOS_PERSONALES) as CampoPersonal[];
export const esCampoPersonal = (x: unknown): x is CampoPersonal => typeof x === 'string' && x in CAMPOS_PERSONALES;

export type CodigoBloqueo = 'EDICION_USADA' | 'TELEFONO_CON_CUENTA';

export class ErrorEdicion extends Error {
  constructor(public status: number, public codigo: string, message: string, public campo?: string, public extra?: Record<string, unknown>) { super(message); }
}

export const MENSAJE_BLOQUEO: Record<CodigoBloqueo, (campo: CampoPersonal) => string> = {
  EDICION_USADA: c => `No se pudo cambiar ${CAMPOS_PERSONALES[c].etiqueta}: ese dato ya se corrigió una vez y ahora solo se cambia con una solicitud. Toca "Pedir cambio" en la ficha del productor.`,
  TELEFONO_CON_CUENTA: () => 'No se pudo cambiar el teléfono: este productor ya tiene cuenta en SIMAC y el teléfono sirve para recuperar su NIP. El cambio lo aprueba un administrador. Toca "Pedir cambio" en la ficha del productor.',
};

// ── Validación de valores (una sola, para la edición directa y para las solicitudes) ──
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIA_MS = 86400000;

/** Misma regla de fecha de nacimiento que el registro nuevo de frijol (T09 §9.9): formato válido y edad de 15 a 100 años. */
function errorFecha(valor: unknown): string | null {
  const s = String(valor ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'La fecha de nacimiento debe tener el formato año-mes-día';
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return 'La fecha de nacimiento no es válida';
  const edad = (Date.now() - d.getTime()) / (365.25 * DIA_MS);
  if (edad < 15 || edad > 100) return 'La edad debe estar entre 15 y 100 años';
  return null;
}

export function normalizarValor(campo: CampoPersonal, valor: unknown): { ok: true; valor: string | null } | { ok: false; error: string } {
  const t = valor === undefined || valor === null ? '' : String(valor).trim();
  switch (campo) {
    case 'nombres':
    case 'apellido_paterno':
      if (!t) return { ok: false, error: campo === 'nombres' ? 'El nombre es obligatorio' : 'El apellido paterno es obligatorio' };
      if (t.length > 100) return { ok: false, error: 'Es demasiado largo (máximo 100 letras)' };
      return { ok: true, valor: t };
    case 'apellido_materno':
      if (t.length > 100) return { ok: false, error: 'Es demasiado largo (máximo 100 letras)' };
      return { ok: true, valor: t || null };
    case 'sexo':
      return t === 'H' || t === 'M' ? { ok: true, valor: t } : { ok: false, error: 'El sexo debe ser H o M' };
    case 'fecha_nacimiento': {
      const e = errorFecha(t); return e ? { ok: false, error: e } : { ok: true, valor: t.slice(0, 10) };
    }
    case 'correo':
      if (!t) return { ok: true, valor: null };
      return EMAIL_RE.test(t) ? { ok: true, valor: t.toLowerCase() } : { ok: false, error: 'El correo no tiene un formato válido' };
    case 'telefono': {
      const dig = t.replace(/[\s\-()]/g, '');
      return /^\d{10}$/.test(dig) ? { ok: true, valor: dig } : { ok: false, error: 'El teléfono debe tener 10 dígitos' };
    }
  }
}

export interface EstadoCampo { campo: CampoPersonal; etiqueta: string; editable: boolean; bloqueo: CodigoBloqueo | null; solicitud_pendiente_id: number | null }

interface Db { query: PoolClient['query'] }

/** Estado de edición de los 7 campos de un productor (qué se puede editar directo y qué ya requiere solicitud). Una consulta por tema, con índices. */
export async function estadoDeCampos(db: Db, producerId: number): Promise<EstadoCampo[]> {
  const [p, usados, pend] = await Promise.all([
    db.query('SELECT usuario_id IS NOT NULL AS con_cuenta FROM producer WHERE producer_id = $1', [producerId]),
    db.query('SELECT DISTINCT campo FROM producer_cambios WHERE producer_id = $1 AND consume_edicion', [producerId]),
    db.query("SELECT campo, id FROM solicitud_cambio WHERE producer_id = $1 AND estado = 'pendiente'", [producerId]),
  ]);
  const conCuenta = !!p.rows[0]?.con_cuenta;
  const usado = new Set<string>(usados.rows.map((r: { campo: string }) => r.campo));
  const pendientes = new Map<string, number>(pend.rows.map((r: { campo: string; id: string }) => [r.campo, Number(r.id)]));
  return LISTA_CAMPOS.map(campo => {
    const bloqueo: CodigoBloqueo | null = campo === 'telefono' && conCuenta ? 'TELEFONO_CON_CUENTA' : usado.has(campo) ? 'EDICION_USADA' : null;
    return { campo, etiqueta: CAMPOS_PERSONALES[campo].etiqueta, editable: bloqueo === null, bloqueo, solicitud_pendiente_id: pendientes.get(campo) ?? null };
  });
}

const comparable = (campo: CampoPersonal, v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return campo === 'telefono' ? s.replace(/[\s\-()]/g, '') : campo === 'correo' ? s.toLowerCase() : s.slice(0, campo === 'fecha_nacimiento' ? 10 : undefined);
};

/** Lee los valores actuales del productor con la fecha en texto (y bloquea el renglón: dos ediciones a la vez no pueden gastar la misma "única vez"). */
async function leerActual(client: Db, producerId: number, bloquear: boolean): Promise<Record<string, unknown> | null> {
  const r = await client.query(
    `SELECT nombres, apellido_paterno, apellido_materno, sexo, to_char(fecha_nacimiento,'YYYY-MM-DD') AS fecha_nacimiento, phone, correo, usuario_id
       FROM producer WHERE producer_id = $1 ${bloquear ? 'FOR UPDATE' : ''}`, [producerId]);
  return r.rows[0] ?? null;
}

export const valorActual = (fila: Record<string, unknown>, campo: CampoPersonal): string | null => {
  const v = fila[campo === 'telefono' ? 'phone' : campo];
  return v === null || v === undefined || v === '' ? null : String(v);
};

export interface OpcionesEdicion {
  producerId: number;
  usuarioId: number;
  programa: string;
  cambios: Partial<Record<CampoPersonal, unknown>>;
  /** 'registro': el mensaje de bloqueo agrega "deja el valor actual para continuar". */
  contexto?: 'ficha' | 'registro';
}

/**
 * Edición DIRECTA por un técnico sobre un productor que ya existía. `client` debe estar dentro de una transacción (BEGIN hecho por quien llama).
 * Solo cuentan los campos que realmente cambian de valor. Si alguno está bloqueado lanza ErrorEdicion 409 SIN haber cambiado nada.
 * Devuelve los campos que cambiaron. Cada uno deja su renglón en producer_cambios con consume_edicion = TRUE.
 */
export async function aplicarEdicionDirecta(client: PoolClient, o: OpcionesEdicion): Promise<CampoPersonal[]> {
  const actual = await leerActual(client, o.producerId, true);
  if (!actual) throw new ErrorEdicion(404, 'PRODUCTOR_NO_ENCONTRADO', 'El productor no existe');
  const estados = await estadoDeCampos(client, o.producerId);
  const porCampo = new Map(estados.map(e => [e.campo, e]));

  const aplicar: Array<{ campo: CampoPersonal; antes: string | null; despues: string | null }> = [];
  for (const campo of LISTA_CAMPOS) {
    if (!(campo in o.cambios) || o.cambios[campo] === undefined) continue;
    const n = normalizarValor(campo, o.cambios[campo]);
    if (!n.ok) throw new ErrorEdicion(400, 'VALIDACION', n.error, `productor.${campo}`);
    const antes = valorActual(actual, campo);
    if (comparable(campo, antes) === comparable(campo, n.valor)) continue;          // no cambió: no gasta nada
    const st = porCampo.get(campo)!;
    if (st.bloqueo) {
      const base = MENSAJE_BLOQUEO[st.bloqueo](campo);
      throw new ErrorEdicion(409, st.bloqueo, o.contexto === 'registro' ? `${base} Para continuar con este registro deja el valor actual.` : base, `productor.${campo}`, { campo });
    }
    aplicar.push({ campo, antes, despues: n.valor });
  }

  for (const a of aplicar) {
    await escribirCampo(client, o.producerId, a.campo, a.despues);
    await client.query(
      `INSERT INTO producer_cambios (producer_id, campo, valor_anterior, valor_nuevo, usuario_id, programa, consume_edicion) VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
      [o.producerId, a.campo, a.antes, a.despues, o.usuarioId, o.programa]
    );
  }
  return aplicar.map(a => a.campo);
}

/** UPDATE de un campo. El correo se escribe en las dos columnas (producer.correo y producer.correo_electronico), como en T09 §9.5. */
export async function escribirCampo(client: Db, producerId: number, campo: CampoPersonal, valor: string | null): Promise<void> {
  const col = CAMPOS_PERSONALES[campo].columna;
  if (campo === 'correo') {
    await client.query('UPDATE producer SET correo = $1::text, correo_electronico = $1::text WHERE producer_id = $2', [valor, producerId]);
  } else {
    await client.query(`UPDATE producer SET ${col} = $1 WHERE producer_id = $2`, [valor, producerId]);
  }
}

/** Para las rutas que cambian estado o municipio del productor (no entran en la regla): solo dejan historial, sin gastar la edición. */
export async function registrarCambioSinGastar(client: Db, producerId: number, campo: string, antes: unknown, despues: unknown, usuarioId: number, programa: string): Promise<void> {
  const a = antes === null || antes === undefined ? null : String(antes);
  const d = despues === null || despues === undefined ? null : String(despues);
  if (a === d) return;
  await client.query(
    `INSERT INTO producer_cambios (producer_id, campo, valor_anterior, valor_nuevo, usuario_id, programa, consume_edicion) VALUES ($1,$2,$3,$4,$5,$6,FALSE)`,
    [producerId, campo, a, d, usuarioId, programa]
  );
}
