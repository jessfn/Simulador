import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PoolClient } from 'pg';
import { insertarUP } from '../utils/ups';
import { cicloFinal, Regimen } from './cicloSIAP';
import { huellaDe } from './encuestaService';
import { PROGRAMA_FRIJOL, PROGRAMA_MAIZ } from '../utils/programas';

// ─── Errores ────────────────────────────────────────────────────────────────
export class ErrorRegistro extends Error {
  constructor(
    public status: number,
    public codigo: string,
    message: string,
    public campo?: string,
    public extra?: Record<string, unknown>
  ) { super(message); }
}

const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADOS_SEMILLAS = ['10', '18', '32'];          // Durango, Nayarit, Zacatecas
export const PROGRAMAS_SADER = ['acopio_bienestar', 'fertilizantes_bienestar', 'produccion_bienestar', 'semillas_bienestar', 'otro_sader'];
const DIA_MS = 24 * 60 * 60 * 1000;

const falla = (campo: string, mensaje: string, status = 400): never => { throw new ErrorRegistro(status, 'VALIDACION', mensaje, campo); };

// ─── Token de verificación de identidad ─────────────────────────────────────
// /consultar-curp firma el resultado; al guardar solo se acepta como "verificada" una identidad con token válido.
// Así el cliente no puede declararse verificado por su cuenta y el servidor no repite la consulta a RENAPO/SADER.
export function firmarVerificacion(curp: string, fuente: 'padron_sader' | 'renapo', tecnicoId: number): string {
  return jwt.sign({ curp, fuente, tecnicoId, v: 1 }, process.env.JWT_SECRET!, { expiresIn: '3d' });
}
export function leerVerificacion(token: unknown, curp: string, tecnicoId: number): boolean {
  if (typeof token !== 'string' || !token) return false;
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET!) as { curp?: string; tecnicoId?: number; v?: number };
    return p.v === 1 && p.curp === curp && p.tecnicoId === tecnicoId;
  } catch { return false; }
}

// ─── Validación (sin base de datos) ─────────────────────────────────────────
const esTexto = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const esNum = (v: unknown) => typeof v === 'number' ? Number.isFinite(v) : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const num = (v: unknown) => Number(v);

function fechaValida(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * T09 §9.9 (auditoría B6): UNA sola regla para la fecha de nacimiento (formato AAAA-MM-DD y edad de 15 a 100 años).
 * La usan el registro nuevo y la corrección del productor; T10 la reutiliza. Devuelve el mensaje de error o null si es válida.
 */
export function errorFechaNacimiento(valor: unknown): string | null {
  const fn = fechaValida(valor);
  if (!fn) return 'La fecha de nacimiento es obligatoria';
  const edad = (Date.now() - fn.getTime()) / (365.25 * DIA_MS);
  if (edad < 15 || edad > 100) return 'La edad debe estar entre 15 y 100 años';
  return null;
}

export function validarEstructura(b: any, esProductorNuevo: boolean): void {
  const p = b?.productor || {}, fp = b?.frijol_productor || {}, pa = b?.parcela || {}, se = b?.semillas || {}, cu = b?.cultivo || {};

  // Productor
  const curp = String(p.curp || '').toUpperCase().trim();
  if (!CURP_RE.test(curp)) falla('productor.curp', 'CURP inválida');
  if (esProductorNuevo || p.nombres !== undefined) if (!esTexto(p.nombres)) falla('productor.nombres', 'El nombre es obligatorio');
  if (esProductorNuevo || p.apellido_paterno !== undefined) if (!esTexto(p.apellido_paterno)) falla('productor.apellido_paterno', 'El apellido paterno es obligatorio');
  if (!/^\d{10}$/.test(String(p.telefono ?? '').trim())) falla('productor.telefono', 'El teléfono debe tener 10 dígitos');
  if (p.correo && !EMAIL_RE.test(String(p.correo).trim())) falla('productor.correo', 'El correo no tiene un formato válido');
  if (esProductorNuevo) {
    if (p.sexo !== 'H' && p.sexo !== 'M') falla('productor.sexo', 'Indica el sexo (H o M)');
    const errFecha = errorFechaNacimiento(p.fecha_nacimiento);
    if (errFecha) falla('productor.fecha_nacimiento', errFecha);
  }

  // Información complementaria
  if (!Number.isInteger(num(fp.total_ups_declaradas)) || num(fp.total_ups_declaradas) < 1) falla('frijol_productor.total_ups_declaradas', 'Indica cuántas parcelas tiene en total (mínimo 1)');
  if (typeof fp.participa_programas_sader !== 'boolean') falla('frijol_productor.participa_programas_sader', 'Indica si participa en otros programas de la Secretaría');
  const progs: string[] = Array.isArray(fp.programas_sader) ? fp.programas_sader : [];
  if (progs.some(x => !PROGRAMAS_SADER.includes(x))) falla('frijol_productor.programas_sader', 'Alguno de los programas no es válido');
  if (fp.participa_programas_sader && progs.length === 0) falla('frijol_productor.programas_sader', 'Elige al menos un programa');
  if (progs.includes('otro_sader') && !esTexto(fp.programas_sader_otro)) falla('frijol_productor.programas_sader_otro', 'Escribe cuál es el otro programa');
  if (fp.seguro_agricola === 'otro' && !esTexto(fp.seguro_agricola_nombre)) falla('frijol_productor.seguro_agricola_nombre', 'Escribe el nombre del seguro o programa');

  // Parcela
  if (!pa.up_id && !esTexto(pa.nombre)) falla('parcela.nombre', 'El nombre de la parcela es obligatorio');
  if (!Number.isInteger(num(pa.numero_up)) || num(pa.numero_up) < 1) falla('parcela.numero_up', 'Indica el número de parcela');
  if (num(pa.numero_up) > num(fp.total_ups_declaradas)) falla('parcela.numero_up', 'El número de parcela no puede ser mayor al total');
  if (!esTexto(pa.state_id)) falla('parcela.state_id', 'Elige el estado');
  if (!esTexto(pa.municipality_id)) falla('parcela.municipality_id', 'Elige el municipio');
  if (!esTexto(pa.localidad)) falla('parcela.localidad', 'La localidad o ejido es obligatoria');
  if (!esTexto(pa.documento_propiedad)) falla('parcela.documento_propiedad', 'Elige el documento de propiedad');
  if (pa.documento_propiedad === 'otro' && !esTexto(pa.documento_propiedad_otro)) falla('parcela.documento_propiedad_otro', 'Escribe cuál es el documento');
  if (!pa.up_id) {
    if (pa.water_regime !== 'temporal' && pa.water_regime !== 'riego') falla('parcela.water_regime', 'Elige el régimen hídrico (temporal o riego)');
    const pol = pa.poligono;
    if (!Array.isArray(pol) || pol.length < 3 || pol.some((v: any) => !Array.isArray(v) || v.length < 2 || !esNum(v[0]) || !esNum(v[1]))) {
      falla('parcela.poligono', 'Falta el polígono de la parcela (mínimo 3 puntos)');
    }
  }

  // Semillas: las tres respuestas son obligatorias
  for (const k of ['se_dedica_produccion_semillas', 'trabajo_con_prosebien', 'usara_prosebien_pv']) {
    if (typeof se[k] !== 'boolean') falla(`semillas.${k}`, 'Responde las tres preguntas de semillas');
  }

  validarCultivo(cu);
}

/** Reglas del cultivo de frijol (se usan al registrar y al corregir). */
export function validarCultivo(cu: any): void {
  const siembra = fechaValida(cu.fecha_siembra);
  if (!siembra) falla('cultivo.fecha_siembra', 'La fecha de siembra es obligatoria');
  const hoy = Date.now();
  if (siembra!.getTime() < hoy - 18 * 30.44 * DIA_MS) falla('cultivo.fecha_siembra', 'La fecha de siembra no puede ser de hace más de 18 meses');
  if (siembra!.getTime() > hoy + 6 * 30.44 * DIA_MS) falla('cultivo.fecha_siembra', 'La fecha de siembra no puede ser de más de 6 meses adelante');
  const cosecha = fechaValida(cu.fecha_cosecha_estimada);
  if (!cosecha) falla('cultivo.fecha_cosecha_estimada', 'La fecha estimada de cosecha es obligatoria');
  const dias = Math.round((cosecha!.getTime() - siembra!.getTime()) / DIA_MS);
  if (dias <= 0) falla('cultivo.fecha_cosecha_estimada', 'La cosecha debe ser posterior a la siembra');
  if (dias < 45 || dias > 240) falla('cultivo.fecha_cosecha_estimada', 'La cosecha debe ser entre 45 y 240 días después de la siembra');
  if (!esTexto(cu.variety_id)) falla('cultivo.variety_id', 'Elige la variedad');
  if (cu.variety_id === 'OTRA' && !esTexto(cu.variety_other)) falla('cultivo.variety_other', '¿Cuál variedad?');
  if (!esNum(cu.area_sown_ha) || num(cu.area_sown_ha) <= 0) falla('cultivo.area_sown_ha', 'La superficie sembrada debe ser mayor a 0');
  if (!esNum(cu.rendimiento_esperado_t_ha) || num(cu.rendimiento_esperado_t_ha) <= 0 || num(cu.rendimiento_esperado_t_ha) > 5) falla('cultivo.rendimiento_esperado_t_ha', 'El rendimiento esperado debe ser mayor a 0 y máximo 5 t/ha');
  if (!esNum(cu.densidad_kg_ha) || num(cu.densidad_kg_ha) <= 0 || num(cu.densidad_kg_ha) > 300) falla('cultivo.densidad_kg_ha', 'La densidad debe ser mayor a 0 y máximo 300 kg/ha');
  if (typeof cu.usa_fertilizante !== 'boolean') falla('cultivo.usa_fertilizante', 'Indica si usa fertilizante');
  if (cu.usa_fertilizante && (!Array.isArray(cu.tipos_fertilizante) || cu.tipos_fertilizante.length === 0)) falla('cultivo.tipos_fertilizante', 'Elige al menos un tipo de fertilizante');
  if (!esTexto(cu.rotacion)) falla('cultivo.rotacion', 'Indica la rotación');
  if (cu.sin_observaciones !== true && String(cu.observaciones ?? '').trim().length < 3) falla('cultivo.observaciones', 'Escribe las observaciones o marca "Sin observaciones"');
}

// ─── Utilidades de base de datos ────────────────────────────────────────────
async function codigoValido(client: PoolClient, catalogo: string, code: unknown): Promise<boolean> {
  const r = await client.query(`SELECT 1 FROM cat_catalog WHERE catalog = $1 AND code = $2 AND is_active = true`, [catalogo, code]);
  return r.rows.length > 0;
}

/**
 * T09 §9.2 (auditoría M2): UNA sola validación de los catálogos del cultivo, para el registro nuevo y para la corrección,
 * de modo que no vuelvan a diferir. Lanza ErrorRegistro (400) con el campo que falló.
 */
export async function validarCatalogosCultivo(client: PoolClient, cu: any): Promise<void> {
  const vr = await client.query(`SELECT 1 FROM cat_crop_variety WHERE crop = 'frijol' AND code = $1 AND is_active = true`, [cu.variety_id]);
  if (vr.rows.length === 0) falla('cultivo.variety_id', 'La variedad seleccionada no es válida');
  if (cu.destino && !(await codigoValido(client, 'destino_frijol', cu.destino))) falla('cultivo.destino', 'El destino de la producción no es válido');
  if (cu.tipo_siembra && !(await codigoValido(client, 'tipo_siembra_frijol', cu.tipo_siembra))) falla('cultivo.tipo_siembra', 'El tipo de siembra no es válido');
  if (!(await codigoValido(client, 'rotacion_cultivo', cu.rotacion))) falla('cultivo.rotacion', 'La rotación no es válida');
  for (const t of cu.tipos_fertilizante || []) if (!(await codigoValido(client, 'tipo_fertilizante', t))) falla('cultivo.tipos_fertilizante', 'Algún tipo de fertilizante no es válido');
}

/**
 * T09 §9.2.3: seguro agrícola y programas de la Secretaría se validan contra el catálogo de la base (que un programa se desactive allá basta
 * para que deje de aceptarse), y no solo contra una lista fija. La lista PROGRAMAS_SADER sigue definiendo cuáles de todos los programas del
 * catálogo se ofrecen en frijol (el catálogo trae también los de maíz). Usada por el registro nuevo y por la corrección del productor.
 */
export async function validarCatalogosProductor(client: PoolClient, fp: any): Promise<void> {
  if (fp.seguro_agricola && !(await codigoValido(client, 'seguro_agricola', fp.seguro_agricola))) falla('frijol_productor.seguro_agricola', 'El seguro agrícola no es válido');
  const progs: string[] = Array.isArray(fp.programas_sader) ? fp.programas_sader : [];
  if (progs.length > 0) {
    const r = await client.query('SELECT clave FROM cat_programas_gobierno WHERE clave = ANY($1::text[]) AND activo = true', [progs]);
    const activos = new Set(r.rows.map((x: { clave: string }) => x.clave));
    if (progs.some(x => !PROGRAMAS_SADER.includes(x) || !activos.has(x))) falla('frijol_productor.programas_sader', 'Alguno de los programas no es válido');
  }
}

const CAMPOS_PERSONALES: Array<[string, string]> = [
  ['nombres', 'nombres'], ['apellido_paterno', 'apellido_paterno'], ['apellido_materno', 'apellido_materno'],
  ['sexo', 'sexo'], ['fecha_nacimiento', 'fecha_nacimiento'], ['telefono', 'phone'], ['correo', 'correo'],
];

export interface ResultadoRegistro { status: number; cuerpo: Record<string, unknown> }

/**
 * Guarda un registro completo de frijol (productor + parcela + ciclo + cultivo) en UNA transacción.
 * `client` debe venir sin BEGIN: aquí se abre y se cierra la transacción.
 */
export async function guardarRegistro(client: PoolClient, tecnicoId: number, body: any, claveIdempotencia: string): Promise<ResultadoRegistro> {
  const huella = huellaDe(body);
  await client.query('BEGIN');
  try {
    // Serializa envíos con la misma clave (doble toque, reintentos simultáneos)
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`frijol:${claveIdempotencia}`]);
    const previo = await client.query('SELECT huella, resultado FROM registro_idempotencia WHERE clave = $1', [claveIdempotencia]);
    if (previo.rows.length > 0) {
      await client.query('ROLLBACK');
      if (previo.rows[0].huella !== huella) throw new ErrorRegistro(409, 'IDEMPOTENCIA_CONFLICTO', 'Ya existe un envío distinto con esta misma clave');
      return { status: 200, cuerpo: { ...previo.rows[0].resultado, repetido: true } };
    }

    const p = body?.productor || {}, fp = body?.frijol_productor || {}, pa = body?.parcela || {}, se = body?.semillas || {}, cu = body?.cultivo || {}, tr = body?.trazabilidad || {};
    const curp = String(p.curp || '').toUpperCase().trim();

    // ¿Ya existe el productor? (la CURP manda; el cliente no puede ocultarlo)
    const existente = await client.query("SELECT *, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fn FROM producer WHERE UPPER(curp) = $1", [curp]);
    const prod = existente.rows[0] || null;
    if (p.producer_id && (!prod || String(prod.producer_id) !== String(p.producer_id))) falla('productor.producer_id', 'La CURP no coincide con el productor indicado');

    validarEstructura(body, !prod);

    // Catálogos
    await validarCatalogosCultivo(client, cu);
    if (!(await codigoValido(client, 'documento_propiedad', pa.documento_propiedad))) falla('parcela.documento_propiedad', 'El documento de propiedad no es válido');
    await validarCatalogosProductor(client, fp);

    // Geografía
    const est = await client.query('SELECT name FROM geo_state WHERE state_id = $1', [pa.state_id]);
    if (est.rows.length === 0) falla('parcela.state_id', 'El estado no existe');
    const mun = await client.query('SELECT name FROM geo_municipality WHERE municipality_id = $1 AND state_id = $2', [pa.municipality_id, pa.state_id]);
    if (mun.rows.length === 0) falla('parcela.municipality_id', 'El municipio no pertenece al estado elegido');

    // Ciclo (siempre se recalcula en el servidor)
    const regimen: Regimen = (cu.tipo_riego === 'riego' || cu.tipo_riego === 'temporal') ? cu.tipo_riego : (pa.water_regime === 'riego' ? 'riego' : 'temporal');
    const ciclo = cicloFinal(cu.fecha_siembra, regimen, cu.cycle_type);
    if (!ciclo.ok) falla('cultivo.cycle_type', ciclo.error);

    // ── 1. Productor ──
    let producerId: number;
    let verificacion: 'verificada' | 'pendiente' = 'verificada';
    const avisos: string[] = [];
    const telefono = String(p.telefono).trim();
    const correo = p.correo ? String(p.correo).trim().toLowerCase() : null;

    if (prod) {
      producerId = Number(prod.producer_id);
      // Corregir datos personales con historial: un renglón por campo cambiado
      const nuevos: Record<string, unknown> = {
        nombres: p.nombres !== undefined ? String(p.nombres).trim() : prod.nombres,
        apellido_paterno: p.apellido_paterno !== undefined ? String(p.apellido_paterno).trim() : prod.apellido_paterno,
        apellido_materno: p.apellido_materno !== undefined ? (String(p.apellido_materno).trim() || null) : prod.apellido_materno,
        sexo: p.sexo === 'H' || p.sexo === 'M' ? p.sexo : prod.sexo,
        fecha_nacimiento: fechaValida(p.fecha_nacimiento) ? String(p.fecha_nacimiento).slice(0, 10) : prod.fn,
        telefono, correo: correo ?? prod.correo,
      };
      const sets: string[] = []; const vals: unknown[] = [];
      for (const [campo, columna] of CAMPOS_PERSONALES) {
        const antes = columna === 'fecha_nacimiento' ? prod.fn : prod[columna];
        const despues = nuevos[campo];
        if ((antes ?? null) !== (despues ?? null) && String(antes ?? '') !== String(despues ?? '')) {
          vals.push(despues ?? null); sets.push(`${columna} = $${vals.length}`);
          // T09 §9.5: la exportación de maíz lee producer.correo_electronico y las demás pantallas producer.correo; se escriben iguales.
          if (columna === 'correo') sets.push(`correo_electronico = $${vals.length}`);
          await client.query(
            `INSERT INTO producer_cambios (producer_id, campo, valor_anterior, valor_nuevo, usuario_id, programa) VALUES ($1,$2,$3,$4,$5,$6)`,
            [producerId, campo, antes == null ? null : String(antes), despues == null ? null : String(despues), tecnicoId, PROGRAMA_FRIJOL]
          );
        }
      }
      if (sets.length > 0) { vals.push(producerId); await client.query(`UPDATE producer SET ${sets.join(', ')} WHERE producer_id = $${vals.length}`, vals); }
      // NO se toca producer.usuario_id ni producer.usuario_capturista_id: maíz sigue igual.
    } else {
      verificacion = leerVerificacion(p.verificacion_token, curp, tecnicoId) ? 'verificada' : 'pendiente';
      const r = await client.query(
        `INSERT INTO producer
           (curp, nombres, apellido_paterno, apellido_materno, phone, correo, correo_electronico, sexo, fecha_nacimiento,
            state_id, municipality_id, localidad, usuario_capturista_id, estatus_registro, fecha_captura, fuente_registro)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,'alterno',CURRENT_TIMESTAMP,'tecnico_frijol')
         RETURNING producer_id`,
        [curp, String(p.nombres).trim(), String(p.apellido_paterno).trim(), p.apellido_materno ? String(p.apellido_materno).trim() : null,
         telefono, correo, p.sexo, String(p.fecha_nacimiento).slice(0, 10), pa.state_id, pa.municipality_id, String(pa.localidad).trim(), tecnicoId]
      );
      producerId = Number(r.rows[0].producer_id);
    }

    // ── 2. Programa frijol ──
    const prog = await client.query('SELECT usuario_capturista_id, verificacion_identidad FROM producer_programa WHERE producer_id = $1 AND programa = $2', [producerId, PROGRAMA_FRIJOL]);
    if (prog.rows.length > 0) {
      if (prog.rows[0].usuario_capturista_id !== tecnicoId) {
        throw new ErrorRegistro(409, 'EN_FRIJOL_OTRO_TECNICO', 'Este productor ya fue registrado en Frijol por otro técnico. No es posible registrarlo de nuevo.');
      }
      verificacion = prog.rows[0].verificacion_identidad;
    } else {
      await client.query(
        `INSERT INTO producer_programa (producer_id, programa, usuario_capturista_id, verificacion_identidad, estatus_registro)
         VALUES ($1, $2, $3, $4, 'enviado')`,
        [producerId, PROGRAMA_FRIJOL, tecnicoId, verificacion]
      );
    }

    // ── 3. Información complementaria del productor ──
    await client.query(
      `INSERT INTO frijol_productor
         (producer_id, total_ups_declaradas, participa_programas_sader, programas_sader, programas_sader_otro, organizacion,
          seguro_agricola, seguro_agricola_nombre, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (producer_id) DO UPDATE SET
         total_ups_declaradas = EXCLUDED.total_ups_declaradas, participa_programas_sader = EXCLUDED.participa_programas_sader,
         programas_sader = EXCLUDED.programas_sader, programas_sader_otro = EXCLUDED.programas_sader_otro,
         organizacion = EXCLUDED.organizacion, seguro_agricola = EXCLUDED.seguro_agricola,
         seguro_agricola_nombre = EXCLUDED.seguro_agricola_nombre, updated_at = NOW()`,
      [producerId, num(fp.total_ups_declaradas), fp.participa_programas_sader, fp.participa_programas_sader ? fp.programas_sader : [],
       fp.programas_sader?.includes('otro_sader') ? String(fp.programas_sader_otro).trim() : null,
       fp.organizacion ? String(fp.organizacion).trim() : null, fp.seguro_agricola || null,
       fp.seguro_agricola === 'otro' ? String(fp.seguro_agricola_nombre).trim() : null, tecnicoId]
    );

    // ── 4. Parcela ──
    let upId: number;
    if (pa.up_id) {
      const own = await client.query('SELECT up_id FROM up WHERE up_id = $1 AND producer_id = $2', [pa.up_id, producerId]);
      if (own.rows.length === 0) falla('parcela.up_id', 'La parcela no pertenece a este productor', 403);
      upId = Number(own.rows[0].up_id);
      await client.query(
        `UPDATE up SET numero_up = $1, localidad = $2, documento_propiedad = $3, documento_propiedad_otro = $4, updated_at = NOW() WHERE up_id = $5`,
        [num(pa.numero_up), String(pa.localidad).trim(), pa.documento_propiedad, pa.documento_propiedad === 'otro' ? String(pa.documento_propiedad_otro).trim() : null, upId]
      );
    } else {
      try {
        upId = await insertarUP(client, producerId, {
          nombre_up: pa.nombre, estado_up: est.rows[0].name, municipio_up: mun.rows[0].name, poligono: pa.poligono,
          area_real_ha: pa.area_real_ha ?? null, coincide_area: pa.area_real_ha ? false : null,
        }, { traslapeEstricto: true });
      } catch (e: any) {
        if (e.code === 'UP_OVERLAP') throw new ErrorRegistro(409, 'UP_OVERLAP', `El polígono se encima con otra parcela de este productor ("${e.up_conflicto}"). Usa esa parcela en lugar de crear una nueva.`, 'parcela.poligono');
        if (e.code === 'UP_OVERLAP_CROSS') throw new ErrorRegistro(409, 'UP_OVERLAP_CROSS', 'El polígono se encima más del 10 % con la parcela de otro productor. Revisa el dibujo.', 'parcela.poligono');
        throw e;
      }
      await client.query(
        `UPDATE up SET numero_up = $1, localidad = $2, documento_propiedad = $3, documento_propiedad_otro = $4,
                       state_id = COALESCE(state_id, $5), municipality_id = COALESCE(municipality_id, $6),
                       motivo_diferencia_superficie = $7
         WHERE up_id = $8`,
        [num(pa.numero_up), String(pa.localidad).trim(), pa.documento_propiedad, pa.documento_propiedad === 'otro' ? String(pa.documento_propiedad_otro).trim() : null,
         pa.state_id, pa.municipality_id, pa.motivo_diferencia_superficie ? String(pa.motivo_diferencia_superficie).trim() : null, upId]
      );
    }
    const up = (await client.query('SELECT area_ha_calc, area_ha_real, state_id FROM up WHERE up_id = $1', [upId])).rows[0];
    const areaCalc = Number(up.area_ha_calc || 0);
    const areaFinal = Number(up.area_ha_real || up.area_ha_calc || 0);
    if (!pa.up_id && up.area_ha_real != null && areaCalc > 0 && Math.abs(Number(up.area_ha_real) - areaCalc) / areaCalc > 0.10 && !esTexto(pa.motivo_diferencia_superficie)) {
      falla('parcela.motivo_diferencia_superficie', 'La superficie ajustada difiere más de 10 % de la calculada: escribe el motivo de la diferencia');
    }
    if (areaFinal > 0 && num(cu.area_sown_ha) > areaFinal + 1e-9) {
      falla('cultivo.area_sown_ha', `La superficie sembrada (${cu.area_sown_ha} ha) no puede ser mayor a la de la parcela (${areaFinal.toFixed(2)} ha)`);
    }

    // ── 5. Semillas ──
    const cumple = areaFinal >= 1 && areaFinal <= 5 && ESTADOS_SEMILLAS.includes(String(up.state_id || pa.state_id));
    await client.query(
      `INSERT INTO frijol_semillas
         (up_id, se_dedica_produccion_semillas, trabajo_con_prosebien, usara_prosebien_pv, cumple_criterio_original, superficie_evaluada_ha, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (up_id) DO UPDATE SET
         se_dedica_produccion_semillas = EXCLUDED.se_dedica_produccion_semillas, trabajo_con_prosebien = EXCLUDED.trabajo_con_prosebien,
         usara_prosebien_pv = EXCLUDED.usara_prosebien_pv, cumple_criterio_original = EXCLUDED.cumple_criterio_original,
         superficie_evaluada_ha = EXCLUDED.superficie_evaluada_ha, updated_at = NOW()`,
      [upId, se.se_dedica_produccion_semillas, se.trabajo_con_prosebien, se.usara_prosebien_pv, cumple, areaFinal || null, tecnicoId]
    );

    // ── 6. Ciclo de frijol (uno por parcela, año y tipo) ──
    const c = ciclo.ok ? ciclo.ciclo : null;
    if (!c) falla('cultivo.cycle_type', 'No se pudo determinar el ciclo');
    let cicloRow = (await client.query(
      `SELECT cycle_id FROM cycle WHERE up_id = $1 AND crop = 'frijol' AND cycle_year = $2 AND cycle_type = $3 AND COALESCE(estado_ciclo,'activo') = 'activo' LIMIT 1`,
      [upId, c!.cycle_year, c!.cycle_type]
    )).rows[0];
    if (!cicloRow) {
      cicloRow = (await client.query(
        `INSERT INTO cycle (up_id, cycle_year, cycle_type, tipo_riego, crop, estado_ciclo, declarado_por_productor, hectareas_sembradas, fecha_siembra, variedad_nombre)
         VALUES ($1,$2,$3,$4,'frijol','activo',false,$5,$6,$7) RETURNING cycle_id`,
        [upId, c!.cycle_year, c!.cycle_type, regimen, num(cu.area_sown_ha), cu.fecha_siembra, cu.variety_other || cu.variety_id]
      )).rows[0];
    }
    const cycleId = Number(cicloRow.cycle_id);

    // ── 7. Cultivo (sin ON CONFLICT DO UPDATE: nunca se pisa un cultivo existente) ──
    const ya = await client.query('SELECT cycle_crop_id FROM cycle_crop WHERE cycle_id = $1', [cycleId]);
    if (ya.rows.length > 0) {
      throw new ErrorRegistro(409, 'FRIJOL_YA_REGISTRADO', `Ya hay frijol registrado en esta parcela para ${c!.etiqueta}`);
    }
    const cc = await client.query(
      `INSERT INTO cycle_crop (cycle_id, crop, variety_id, variety_other, area_sown_ha, planting_date, estimated_harvest_date, yield_expected, destination)
       VALUES ($1,'frijol',$2,$3,$4,$5,$6,$7,$8) RETURNING cycle_crop_id`,
      [cycleId, cu.variety_id, cu.variety_other ? String(cu.variety_other).trim() : null, num(cu.area_sown_ha), cu.fecha_siembra,
       cu.fecha_cosecha_estimada, num(cu.rendimiento_esperado_t_ha), cu.destino || null]
    );
    const cycleCropId = Number(cc.rows[0].cycle_crop_id);

    // ── 8. Datos de frijol del cultivo + trazabilidad ──
    let capturadoEn: Date | null = null;
    if (tr.capturado_en) {
      const d = new Date(tr.capturado_en);
      if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 5 * 60 * 1000 && d.getTime() >= Date.now() - 30 * DIA_MS) capturadoEn = d;
    }
    await client.query(
      `INSERT INTO frijol_cultivo
         (cycle_crop_id, tipo_siembra, densidad_kg_ha, usa_fertilizante, tipos_fertilizante, rotacion, observaciones, sin_observaciones,
          capturado_en, hubo_desconexion, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [cycleCropId, cu.tipo_siembra || null, num(cu.densidad_kg_ha), cu.usa_fertilizante, cu.usa_fertilizante ? cu.tipos_fertilizante : [], cu.rotacion,
       cu.sin_observaciones === true ? null : String(cu.observaciones).trim(), cu.sin_observaciones === true,
       capturadoEn, tr.hubo_desconexion === true, tecnicoId]
    );

    // Aviso (no bloquea) si la parcela queda fuera de la zona del técnico
    const zona = await client.query('SELECT state_id, municipality_id FROM tecnico_zona WHERE usuario_id = $1', [tecnicoId]);
    if (zona.rows.length > 0) {
      const dentro = zona.rows.some((z: { state_id: string; municipality_id: string | null }) => z.state_id === pa.state_id && (!z.municipality_id || z.municipality_id === pa.municipality_id));
      if (!dentro) avisos.push('La parcela está fuera de tu zona de operación.');
    }

    const cuerpo: Record<string, unknown> = {
      producer_id: producerId, up_id: upId, id_parcela: upId, cycle_id: cycleId, cycle_crop_id: cycleCropId,
      verificacion_identidad: verificacion, estatus_registro: 'enviado', ciclo: c!.etiqueta, avisos,
      cumple_criterio_semillas: cumple,
    };
    await client.query('INSERT INTO registro_idempotencia (clave, huella, resultado) VALUES ($1,$2,$3) ON CONFLICT (clave) DO NOTHING', [claveIdempotencia, huella, JSON.stringify(cuerpo)]);
    await client.query('COMMIT');
    return { status: 201, cuerpo };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { /* ya cerrada */ });
    throw e;
  }
}

/** Genera la clave de un envío cuando el cliente no manda `Idempotency-Key` (se rechaza antes; útil en pruebas). */
export function claveAleatoria(): string { return crypto.randomUUID(); }
export { PROGRAMA_FRIJOL, PROGRAMA_MAIZ };
