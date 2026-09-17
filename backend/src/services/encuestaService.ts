// Servicio de dominio de la encuesta de intención de compra de insumos
// (Sinaloa). Ver SIMAC_tickets/00_CONTEXTO_Y_ORDEN.md y 02_SERVICIOS_Y_VALIDACIONES.md.
// Reutilizado por el registro del productor (productor.ts), por el técnico
// capturista (tecnico.ts) y por el panel de administración.

import { PoolClient } from 'pg';
import crypto from 'crypto';
import pool from '../config/database';

export class EncuestaError extends Error {
  codigo: string;
  campo?: string;
  status: number;
  constructor(codigo: string, mensaje: string, status = 400, campo?: string) {
    super(mensaje);
    this.codigo = codigo;
    this.status = status;
    this.campo = campo;
  }
}

const SINALOA_STATE_ID = '25';

// Unidades de masa/volumen aceptadas para compra a granel o para el
// contenido de una presentación "Otra". Semillas nunca se convierten.
const UNIDADES_MASA = new Set(['g', 'kg', 'ton']);
const UNIDADES_VOLUMEN = new Set(['mL', 'L']);
const UNIDADES_VALIDAS = new Set(['g', 'kg', 'ton', 'mL', 'L', 'semillas']);

// ─── Conversión a unidad base (kg, L o semillas) ───────────────────────────
// g/1000 → kg; mL/1000 → L; toneladas ×1000 → kg. Semillas no se convierten.
// Nunca cruza masa↔volumen.
function convertirABase(cantidad: number, unidad: string): { valor: number; unidadBase: string } {
  if (!UNIDADES_VALIDAS.has(unidad)) {
    throw new EncuestaError('UNIDAD_INVALIDA', `Unidad no reconocida: ${unidad}`);
  }
  if (unidad === 'semillas') return { valor: cantidad, unidadBase: 'semillas' };
  if (unidad === 'g') return { valor: cantidad / 1000, unidadBase: 'kg' };
  if (unidad === 'kg') return { valor: cantidad, unidadBase: 'kg' };
  if (unidad === 'ton') return { valor: cantidad * 1000, unidadBase: 'kg' };
  if (unidad === 'mL') return { valor: cantidad / 1000, unidadBase: 'L' };
  return { valor: cantidad, unidadBase: 'L' }; // 'L'
}

function esNumeroValido(n: any): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

// ─── Elegibilidad territorial ──────────────────────────────────────────────
// Autoridad es SIEMPRE el servidor: determina a partir de las UP reales del
// productor en la base de datos, usando la clave de entidad (state_id del
// catálogo territorial), nunca un booleano enviado por el cliente.
export async function determinarContextoTerritorial(
  client: PoolClient | typeof pool,
  producerId: number
): Promise<{ elegible: boolean; ups: { up_id: number; municipality_id: string | null; municipality_name: string | null }[] }> {
  const r = await client.query(
    `SELECT up_id, state_id, municipality_id, municipality_name
     FROM up WHERE producer_id = $1`,
    [producerId]
  );
  const deSinaloa = r.rows.filter((row: any) => row.state_id === SINALOA_STATE_ID);
  return {
    elegible: deSinaloa.length > 0,
    ups: deSinaloa.map((row: any) => ({
      up_id: row.up_id,
      municipality_id: row.municipality_id,
      municipality_name: row.municipality_name,
    })),
  };
}

// ─── Edición vigente ────────────────────────────────────────────────────────
export async function obtenerEdicionVigente(client: PoolClient | typeof pool = pool) {
  const r = await client.query(
    `SELECT * FROM encuesta_ediciones WHERE habilitada = TRUE ORDER BY id DESC LIMIT 1`
  );
  if (r.rows.length === 0) return null;
  const ed = r.rows[0];
  const inicio = new Date();
  const fin = new Date(inicio);
  fin.setMonth(fin.getMonth() + ed.horizonte_meses);
  return { ...ed, periodo_inicio: inicio, periodo_fin: fin };
}

// ─── Catálogo público (sin metadatos internos) ─────────────────────────────
export async function obtenerCatalogoPublico(client: PoolClient | typeof pool = pool) {
  const edicion = await obtenerEdicionVigente(client);
  if (!edicion) return null;
  const [categorias, productos, presentaciones] = await Promise.all([
    client.query(`SELECT id, nombre, ayuda FROM encuesta_categorias ORDER BY id`),
    client.query(
      `SELECT id, categoria_id, nombre_visible, requiere_nombre_conocido, es_otro
       FROM encuesta_productos WHERE activo = TRUE AND version_catalogo = $1 ORDER BY categoria_id, es_otro, nombre_visible`,
      [edicion.version_catalogo]
    ),
    client.query(
      `SELECT id, producto_id, envase, contenido, unidad
       FROM encuesta_presentaciones WHERE activo = TRUE ORDER BY producto_id, contenido`
    ),
  ]);
  return {
    edicion_id: edicion.id,
    version_catalogo: edicion.version_catalogo,
    periodo_inicio: edicion.periodo_inicio,
    periodo_fin: edicion.periodo_fin,
    categorias: categorias.rows,
    productos: productos.rows,
    presentaciones: presentaciones.rows,
  };
}

export async function buscarPorAlias(texto: string, client: PoolClient | typeof pool = pool) {
  const r = await client.query(
    `SELECT DISTINCT p.id, p.nombre_visible, p.categoria_id
     FROM encuesta_alias a JOIN encuesta_productos p ON p.id = a.producto_id
     WHERE p.activo = TRUE AND a.texto_busqueda ILIKE '%' || $1 || '%'
     LIMIT 15`,
    [texto]
  );
  return r.rows;
}

// ─── Validación y normalización de una línea ───────────────────────────────
export interface LineaEntrada {
  producto_id?: string | null;
  producto_nombre_otro?: string | null;
  presentacion_id?: string | null;
  presentacion_otro_envase?: string | null;
  presentacion_otro_contenido?: number | null;
  presentacion_otro_unidad?: string | null;
  a_granel?: boolean;
  cantidad: number;
  mes_compra: string; // 'YYYY-MM' o 'YYYY-MM-DD'
  nombre_conocido?: string | null;
  preferencia_marca?: string | null;
  identificacion_no_disponible?: boolean;
}

interface LineaValidada {
  producto_id: string | null;
  producto_nombre_otro: string | null;
  presentacion_id: string | null;
  presentacion_otro_envase: string | null;
  presentacion_otro_contenido: number | null;
  presentacion_otro_unidad: string | null;
  a_granel: boolean;
  cantidad: number;
  mes_compra: string;
  nombre_conocido: string | null;
  preferencia_marca: string | null;
  identificacion_pendiente: boolean;
  cantidad_base: number | null;
  unidad_base: string | null;
}

function parseMesCompra(v: string, periodoInicio: Date, periodoFin: Date): string {
  if (!v || typeof v !== 'string') throw new EncuestaError('MES_INVALIDO', 'Mes de compra inválido', 400, 'mes_compra');
  const m = /^(\d{4})-(\d{2})/.exec(v);
  if (!m) throw new EncuestaError('MES_INVALIDO', 'Mes de compra inválido', 400, 'mes_compra');
  const fecha = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  if (Number.isNaN(fecha.getTime())) {
    throw new EncuestaError('MES_INVALIDO', 'Mes de compra inválido', 400, 'mes_compra');
  }
  const inicioMes = new Date(periodoInicio.getFullYear(), periodoInicio.getMonth(), 1);
  const finMes = new Date(periodoFin.getFullYear(), periodoFin.getMonth(), 1);
  if (fecha < inicioMes || fecha > finMes) {
    throw new EncuestaError('MES_FUERA_DE_PERIODO', 'El mes elegido está fuera del periodo de la encuesta', 400, 'mes_compra');
  }
  return fecha.toISOString().slice(0, 10);
}

async function validarLinea(
  client: PoolClient | typeof pool,
  entrada: LineaEntrada,
  productosCat: Map<string, any>,
  presentacionesCat: Map<string, any>,
  periodoInicio: Date,
  periodoFin: Date
): Promise<LineaValidada> {
  if (!esNumeroValido(entrada.cantidad)) {
    throw new EncuestaError('CANTIDAD_INVALIDA', 'La cantidad debe ser un número mayor a 0', 400, 'cantidad');
  }
  const mesCompra = parseMesCompra(entrada.mes_compra, periodoInicio, periodoFin);

  let producto: any = null;
  let productoNombreOtro: string | null = null;
  let identificacionPendiente = false;
  let nombreConocido = entrada.nombre_conocido?.trim() || null;

  if (entrada.producto_id) {
    producto = productosCat.get(entrada.producto_id);
    if (!producto || !producto.activo) {
      throw new EncuestaError('PRODUCTO_INVALIDO', 'El producto seleccionado no existe en el catálogo', 400, 'producto_id');
    }
    if (producto.es_otro) {
      if (!nombreConocido) {
        throw new EncuestaError('NOMBRE_REQUERIDO', 'Escribe el nombre que conoces del producto', 400, 'nombre_conocido');
      }
      productoNombreOtro = nombreConocido;
      identificacionPendiente = true;
    } else if (producto.requiere_nombre_conocido) {
      // p.ej. semilla: exige variedad conocida o declaración explícita de que no se identifica
      if (!nombreConocido) {
        if (!entrada.identificacion_no_disponible) {
          throw new EncuestaError(
            'NOMBRE_REQUERIDO',
            'Indica la variedad/fórmula que conoces o marca "No identifico la variedad"',
            400,
            'nombre_conocido'
          );
        }
        identificacionPendiente = true;
      }
    }
  } else {
    throw new EncuestaError('PRODUCTO_REQUERIDO', 'Selecciona una categoría y producto', 400, 'producto_id');
  }

  // Amoniaco: solo kg o toneladas de producto, sin presentación tipo bulto.
  const esAmoniaco = entrada.producto_id === 'FER-011';

  let presentacionId: string | null = null;
  let presOtroEnvase: string | null = null;
  let presOtroContenido: number | null = null;
  let presOtroUnidad: string | null = null;
  let cantidadBase: number | null = null;
  let unidadBase: string | null = null;
  const aGranel = !!entrada.a_granel;

  if (aGranel) {
    const unidad = entrada.presentacion_otro_unidad;
    if (!unidad || !UNIDADES_VALIDAS.has(unidad) || unidad === 'semillas') {
      throw new EncuestaError('UNIDAD_INVALIDA', 'La compra a granel exige una unidad de masa o volumen válida', 400, 'presentacion_otro_unidad');
    }
    if (esAmoniaco && !UNIDADES_MASA.has(unidad)) {
      throw new EncuestaError('UNIDAD_INVALIDA', 'El amoniaco se captura en kg o toneladas de producto', 400, 'presentacion_otro_unidad');
    }
    const conv = convertirABase(entrada.cantidad, unidad);
    cantidadBase = conv.valor;
    unidadBase = conv.unidadBase;
    presOtroUnidad = unidad;
  } else if (entrada.presentacion_id) {
    if (esAmoniaco) {
      throw new EncuestaError('PRESENTACION_INVALIDA', 'El amoniaco no admite presentación tipo bulto; captúralo a granel en kg o toneladas', 400, 'presentacion_id');
    }
    const presentacion = presentacionesCat.get(entrada.presentacion_id);
    if (!presentacion || !presentacion.activo || presentacion.producto_id !== entrada.producto_id) {
      throw new EncuestaError('PRESENTACION_INVALIDA', 'La presentación no corresponde al producto seleccionado', 400, 'presentacion_id');
    }
    if (!Number.isInteger(entrada.cantidad)) {
      throw new EncuestaError('CANTIDAD_INVALIDA', 'La cantidad de envases debe ser un número entero', 400, 'cantidad');
    }
    presentacionId = presentacion.id;
    const conv = convertirABase(Number(presentacion.contenido) * entrada.cantidad, presentacion.unidad);
    cantidadBase = conv.valor;
    unidadBase = conv.unidadBase;
  } else if (entrada.presentacion_otro_envase || entrada.presentacion_otro_contenido) {
    if (esAmoniaco) {
      throw new EncuestaError('PRESENTACION_INVALIDA', 'El amoniaco no admite presentación tipo bulto; captúralo a granel en kg o toneladas', 400, 'presentacion_id');
    }
    if (!entrada.presentacion_otro_envase?.trim() || !esNumeroValido(entrada.presentacion_otro_contenido) || !entrada.presentacion_otro_unidad) {
      throw new EncuestaError('PRESENTACION_INCOMPLETA', 'Especifica envase, contenido y unidad de la presentación', 400, 'presentacion_otro_envase');
    }
    if (!UNIDADES_VALIDAS.has(entrada.presentacion_otro_unidad)) {
      throw new EncuestaError('UNIDAD_INVALIDA', `Unidad no reconocida: ${entrada.presentacion_otro_unidad}`, 400, 'presentacion_otro_unidad');
    }
    if (!Number.isInteger(entrada.cantidad)) {
      throw new EncuestaError('CANTIDAD_INVALIDA', 'La cantidad de envases debe ser un número entero', 400, 'cantidad');
    }
    presOtroEnvase = entrada.presentacion_otro_envase.trim();
    presOtroContenido = entrada.presentacion_otro_contenido!;
    presOtroUnidad = entrada.presentacion_otro_unidad;
    const conv = convertirABase(presOtroContenido * entrada.cantidad, presOtroUnidad);
    cantidadBase = conv.valor;
    unidadBase = conv.unidadBase;
  } else {
    throw new EncuestaError('PRESENTACION_REQUERIDA', 'Selecciona una presentación o indica compra a granel', 400, 'presentacion_id');
  }

  return {
    producto_id: entrada.producto_id!,
    producto_nombre_otro: productoNombreOtro,
    presentacion_id: presentacionId,
    presentacion_otro_envase: presOtroEnvase,
    presentacion_otro_contenido: presOtroContenido,
    presentacion_otro_unidad: presOtroUnidad,
    a_granel: aGranel,
    cantidad: entrada.cantidad,
    mes_compra: mesCompra,
    nombre_conocido: nombreConocido,
    preferencia_marca: entrada.preferencia_marca?.trim() || null,
    identificacion_pendiente: identificacionPendiente,
    cantidad_base: cantidadBase,
    unidad_base: unidadBase,
  };
}

export interface EncuestaEntrada {
  respuesta: 'si' | 'no';
  lineas?: LineaEntrada[];
}

// ─── Guardar (o reemplazar) la respuesta dentro de una transacción dada ────
// El llamador controla BEGIN/COMMIT (se reutiliza la transacción de alta en
// el registro, o una propia en actualizaciones/captura asistida).
export async function guardarEncuestaEnTransaccion(
  client: PoolClient,
  producerId: number,
  entrada: EncuestaEntrada,
  opts: { canal: 'productor' | 'tecnico'; capturistaId?: number | null }
): Promise<{ respuesta_id: number; elegible: boolean }> {
  const edicion = await obtenerEdicionVigente(client as any);
  if (!edicion) throw new EncuestaError('SIN_EDICION', 'No hay una edición de encuesta vigente', 500);

  const contexto = await determinarContextoTerritorial(client as any, producerId);
  if (!contexto.elegible) {
    // No exigir ni convertir ausencia en "no": simplemente no se guarda nada.
    return { respuesta_id: 0, elegible: false };
  }

  if (entrada.respuesta !== 'si' && entrada.respuesta !== 'no') {
    throw new EncuestaError('RESPUESTA_INVALIDA', 'Responde si tiene o no compras previstas', 400, 'respuesta');
  }
  if (entrada.respuesta === 'si' && (!Array.isArray(entrada.lineas) || entrada.lineas.length === 0)) {
    throw new EncuestaError('LINEAS_REQUERIDAS', 'Agrega al menos un producto para continuar', 400, 'lineas');
  }
  if (entrada.respuesta === 'no' && Array.isArray(entrada.lineas) && entrada.lineas.length > 0) {
    throw new EncuestaError('LINEAS_NO_PERMITIDAS', 'Una respuesta "No" no admite productos', 400, 'lineas');
  }

  let lineasValidadas: LineaValidada[] = [];
  if (entrada.respuesta === 'si') {
    const productosCat = new Map(
      (await client.query(`SELECT * FROM encuesta_productos WHERE version_catalogo = $1`, [edicion.version_catalogo])).rows
        .map((p: any) => [p.id, p])
    );
    const presentacionesCat = new Map(
      (await client.query(`SELECT * FROM encuesta_presentaciones`)).rows.map((p: any) => [p.id, p])
    );
    for (const l of entrada.lineas!) {
      lineasValidadas.push(await validarLinea(client, l, productosCat, presentacionesCat, edicion.periodo_inicio, edicion.periodo_fin));
    }
  }

  // Upsert de la respuesta (una por productor/edición). Si ya existía, se
  // reemplazan sus líneas dentro de la misma transacción.
  const existente = await client.query(
    `SELECT id, version FROM encuesta_respuestas WHERE producer_id = $1 AND edicion_id = $2`,
    [producerId, edicion.id]
  );

  let respuestaId: number;
  if (existente.rows.length > 0) {
    respuestaId = existente.rows[0].id;
    await client.query(
      `UPDATE encuesta_respuestas SET respuesta = $1, updated_at = NOW(), version = version + 1,
              canal = $2, capturista_id = $3
       WHERE id = $4`,
      [entrada.respuesta, opts.canal, opts.capturistaId || null, respuestaId]
    );
    await client.query(`DELETE FROM encuesta_lineas WHERE respuesta_id = $1`, [respuestaId]);
    await client.query(`DELETE FROM encuesta_contexto_territorial WHERE respuesta_id = $1`, [respuestaId]);
  } else {
    const r = await client.query(
      `INSERT INTO encuesta_respuestas
         (producer_id, edicion_id, respuesta, periodo_inicio, periodo_fin, version_catalogo, canal, capturista_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [producerId, edicion.id, entrada.respuesta, edicion.periodo_inicio, edicion.periodo_fin,
       edicion.version_catalogo, opts.canal, opts.capturistaId || null]
    );
    respuestaId = r.rows[0].id;
  }

  for (const up of contexto.ups) {
    await client.query(
      `INSERT INTO encuesta_contexto_territorial (respuesta_id, up_id, municipality_id, municipality_name)
       VALUES ($1,$2,$3,$4) ON CONFLICT (respuesta_id, up_id) DO NOTHING`,
      [respuestaId, up.up_id, up.municipality_id, up.municipality_name]
    );
  }

  for (const l of lineasValidadas) {
    await client.query(
      `INSERT INTO encuesta_lineas
         (respuesta_id, producto_id, producto_nombre_otro, presentacion_id,
          presentacion_otro_envase, presentacion_otro_contenido, presentacion_otro_unidad,
          a_granel, cantidad, mes_compra, nombre_conocido, preferencia_marca,
          identificacion_pendiente, cantidad_base, unidad_base)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [respuestaId, l.producto_id, l.producto_nombre_otro, l.presentacion_id,
       l.presentacion_otro_envase, l.presentacion_otro_contenido, l.presentacion_otro_unidad,
       l.a_granel, l.cantidad, l.mes_compra, l.nombre_conocido, l.preferencia_marca,
       l.identificacion_pendiente, l.cantidad_base, l.unidad_base]
    );
  }

  return { respuesta_id: respuestaId, elegible: true };
}

// ─── Consulta de la respuesta propia (GET) ─────────────────────────────────
export async function obtenerRespuestaProductor(producerId: number) {
  const edicion = await obtenerEdicionVigente();
  if (!edicion) return null;
  const contexto = await determinarContextoTerritorial(pool, producerId);
  if (!contexto.elegible) return { elegible: false };

  const r = await pool.query(
    `SELECT * FROM encuesta_respuestas WHERE producer_id = $1 AND edicion_id = $2`,
    [producerId, edicion.id]
  );
  if (r.rows.length === 0) {
    return { elegible: true, respuesta: null, periodo_inicio: edicion.periodo_inicio, periodo_fin: edicion.periodo_fin };
  }
  const respuesta = r.rows[0];
  const lineas = await pool.query(
    `SELECT l.*, p.nombre_visible AS producto_nombre, pr.envase, pr.contenido, pr.unidad AS presentacion_unidad
     FROM encuesta_lineas l
     LEFT JOIN encuesta_productos p ON p.id = l.producto_id
     LEFT JOIN encuesta_presentaciones pr ON pr.id = l.presentacion_id
     WHERE l.respuesta_id = $1 ORDER BY l.id`,
    [respuesta.id]
  );
  return { elegible: true, respuesta, lineas: lineas.rows };
}

// ─── Idempotencia del alta ──────────────────────────────────────────────────

export function huellaDe(payload: any): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function resolverIdempotencia(
  client: PoolClient,
  clave: string | undefined,
  huella: string
): Promise<{ clave: string; resultadoPrevio: any | null }> {
  const claveFinal = clave?.trim() || crypto.randomUUID();
  const existente = await client.query(
    `SELECT huella, resultado FROM registro_idempotencia WHERE clave = $1`,
    [claveFinal]
  );
  if (existente.rows.length > 0) {
    if (existente.rows[0].huella !== huella) {
      throw new EncuestaError('IDEMPOTENCIA_CONFLICTO', 'Ya existe un envío distinto con esta misma clave', 409);
    }
    return { clave: claveFinal, resultadoPrevio: existente.rows[0].resultado };
  }
  return { clave: claveFinal, resultadoPrevio: null };
}

export async function guardarResultadoIdempotencia(client: PoolClient, clave: string, huella: string, resultado: any) {
  await client.query(
    `INSERT INTO registro_idempotencia (clave, huella, resultado) VALUES ($1,$2,$3)
     ON CONFLICT (clave) DO NOTHING`,
    [clave, huella, JSON.stringify(resultado)]
  );
}
