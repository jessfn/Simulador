import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, requiereCapturista, AuthRequest } from '../middleware/auth';
import { requierePrograma } from '../middleware/programa';
import { PROGRAMA_FRIJOL } from '../utils/programas';
import { validarSuperficieCombinada } from '../utils/superficie';
import { verificarIdentidad } from '../services/identidad';
import { inferirCiclo, cicloFinal, Regimen } from '../services/cicloSIAP';
import { ErrorRegistro, guardarRegistro, firmarVerificacion, validarCultivo, validarCatalogosCultivo, validarCatalogosProductor, errorFechaNacimiento } from '../services/frijolRegistro';
import { aplicarEdicionDirecta, ErrorEdicion, estadoDeCampos } from '../services/edicionUnica';
import { generarAcuseFrijol } from '../services/acuseFrijol';
import { consultaCurpLimiter } from '../middleware/rateLimiters';

// Módulo de registro de Frijol (técnicos ECA). Todo /api/frijol/* requiere sesión de técnico con el programa frijol_afb.
// Aquí viven solo las rutas de frijol; maíz no se toca.
const router = Router();
router.use(authMiddleware, requiereCapturista, requierePrograma(PROGRAMA_FRIJOL));

const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Listas generales que usa la pantalla de frijol (catálogo `cat_catalog`).
const CATALOGOS = [
  'documento_propiedad', 'destino_frijol', 'tipo_siembra_frijol',
  'rotacion_cultivo', 'tipo_fertilizante', 'seguro_agricola',
] as const;

// Programas SADER que se muestran en la pantalla de frijol (en este orden).
/** Largo máximo de la clave de idempotencia que manda el cliente (ver POST /registros). */
const CLAVE_IDEMPOTENCIA_MAX = 60;

const PROGRAMAS_SADER = [
  'acopio_bienestar', 'fertilizantes_bienestar', 'produccion_bienestar', 'semillas_bienestar', 'otro_sader',
];

function responderError(res: Response, error: unknown, contexto: string): void {
  if (error instanceof ErrorEdicion) {
    res.status(error.status).json({ error: error.message, codigo: error.codigo, campo: error.campo, ...(error.extra || {}) });
    return;
  }
  if (error instanceof ErrorRegistro) {
    res.status(error.status).json({ error: error.message, codigo: error.codigo, campo: error.campo, ...(error.extra || {}) });
    return;
  }
  console.error(`Error en ${contexto}:`, error);
  res.status(500).json({ error: 'Error interno del servidor' });
}

/** El técnico debe ser el responsable del productor en el programa frijol. Devuelve la fila de producer_programa o responde 403/404. */
async function productorPropio(req: AuthRequest, res: Response, producerId: string | number, db: { query: Function } = pool) {
  const r = await db.query(
    `SELECT pp.*, p.curp FROM productor_programa pp JOIN productor p ON p.productor_id = pp.productor_id
      WHERE pp.productor_id = $1 AND pp.programa = $2`,
    [producerId, PROGRAMA_FRIJOL]
  );
  if (r.rows.length === 0) { res.status(404).json({ error: 'Productor no encontrado en Frijol' }); return null; }
  if (r.rows[0].usuario_capturista_id !== req.user!.userId) { res.status(403).json({ error: 'Este productor lo registró otro técnico' }); return null; }
  return r.rows[0];
}

// ─── Datos del productor y sus parcelas (para prellenar el registro) ────────
async function datosProductor(producerId: number) {
  const p = await pool.query(
    `SELECT p.productor_id::int AS producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, p.sexo,
            to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            p.telefono AS telefono, p.correo, p.usuario_id IS NOT NULL AS tiene_cuenta
       FROM productor p WHERE p.productor_id = $1`, [producerId]);
  const fp = await pool.query('SELECT * FROM frijol_productor WHERE productor_id = $1', [producerId]);
  const parcelas = await pool.query(
    `SELECT u.up_id::int AS up_id, u.nombre_up, u.numero_up, u.superficie_ha_calculada::float AS area_ha_calc, u.superficie_ha_real::float AS area_ha_real, u.estado_id, u.nombre_estado, u.municipio_id,
            u.nombre_municipio, u.localidad, u.documento_propiedad, u.documento_propiedad_otro,
            ST_AsGeoJSON(u.geometria)::json AS geom_geojson,
            COALESCE((SELECT json_agg(CASE c.tipo_ciclo
                                        WHEN 'OI' THEN 'OI ' || c.anio_ciclo || '-' || LPAD(((c.anio_ciclo + 1) % 100)::text, 2, '0')
                                        WHEN 'PV' THEN 'PV ' || c.anio_ciclo
                                        ELSE 'Anual ' || c.anio_ciclo END ORDER BY c.anio_ciclo DESC)
                       FROM ciclo c WHERE c.up_id = u.up_id AND c.cultivo = 'frijol' AND COALESCE(c.estado_ciclo,'activo') <> 'cancelado'), '[]'::json) AS ciclos_frijol
       FROM up u WHERE u.productor_id = $1 ORDER BY u.numero_up NULLS LAST, u.creado_en`, [producerId]);
  return {
    datos: p.rows[0],
    frijol_productor: fp.rows[0] || null,
    parcelas: parcelas.rows.map((r: any) => ({ ...r, tiene_frijol: r.ciclos_frijol.length > 0 })),
    // T10: qué datos personales se pueden editar directo (una vez) y cuáles ya solo se cambian con solicitud
    campos: await estadoDeCampos(pool, producerId),
  };
}

// =============================================
// GET /api/frijol/catalogos
// =============================================
router.get('/catalogos', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [variedades, generales, programas] = await Promise.all([
      pool.query(
        `SELECT codigo, etiqueta FROM cat_variedad_cultivo
          WHERE cultivo = 'frijol' AND activo = true
          ORDER BY (codigo IN ('CRIOLLO_LOCAL','OTRA')), orden, etiqueta`
      ),
      pool.query(
        `SELECT catalogo, codigo, etiqueta FROM cat_catalogo
          WHERE catalogo = ANY($1::text[]) AND activo = true
          ORDER BY catalogo, orden, etiqueta`,
        [CATALOGOS as unknown as string[]]
      ),
      pool.query(
        `SELECT clave, nombre FROM cat_programas_gobierno
          WHERE clave = ANY($1::text[]) AND activo = true`,
        [PROGRAMAS_SADER]
      ),
    ]);

    const respuesta: Record<string, unknown> = { variedades: variedades.rows };
    for (const c of CATALOGOS) respuesta[c] = [];
    for (const r of generales.rows) (respuesta[r.catalog] as unknown[]).push({ code: r.code, label: r.label });
    // Programas SADER en el orden definido (no el de la base)
    respuesta.programas_sader = PROGRAMAS_SADER
      .map(clave => programas.rows.find((p: { clave: string }) => p.clave === clave))
      .filter(Boolean);

    res.json(respuesta);
  } catch (error) {
    console.error('Error en GET /frijol/catalogos:', error);
    res.status(500).json({ error: 'No se pudieron cargar los catálogos' });
  }
});

// =============================================
// GET /api/frijol/estados · GET /api/frijol/municipios?state_id=
// Para los selectores del formulario. `estados` incluye la zona del técnico para preseleccionar.
// =============================================
router.get('/estados', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [estados, zona] = await Promise.all([
      pool.query('SELECT estado_id, nombre FROM geo_estado ORDER BY nombre'),
      pool.query('SELECT estado_id, municipio_id FROM tecnico_zona WHERE usuario_id = $1', [req.user!.userId]),
    ]);
    res.json({ estados: estados.rows, zona: zona.rows });
  } catch (error) { responderError(res, error, 'GET /frijol/estados'); }
});

router.get('/municipios', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stateId = String(req.query.state_id || '');
    if (!stateId) { res.status(400).json({ error: 'Falta state_id' }); return; }
    const r = await pool.query('SELECT municipio_id, nombre FROM geo_municipio WHERE estado_id = $1 ORDER BY nombre', [stateId]);
    res.json({ municipios: r.rows });
  } catch (error) { responderError(res, error, 'GET /frijol/municipios'); }
});

// =============================================
// GET /api/frijol/inferir-ciclo?fecha=AAAA-MM-DD&riego=true|false
// =============================================
router.get('/inferir-ciclo', (req: AuthRequest, res: Response): void => {
  const regimen: Regimen = req.query.riego === 'true' ? 'riego' : 'temporal';
  const inf = inferirCiclo(String(req.query.fecha || ''), regimen);
  if (!inf) { res.status(400).json({ error: 'Fecha de siembra no válida' }); return; }
  res.json(inf);
});

// =============================================
// POST /api/frijol/consultar-curp
// Busca a la persona y dice qué hacer. NADA bloquea por tener cuenta en SIMAC ni por padrón inactivo ni por servicios caídos.
// =============================================
router.post('/consultar-curp', consultaCurpLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const curp = String(req.body?.curp || '').toUpperCase().trim();
    if (!CURP_RE.test(curp)) { res.status(400).json({ error: 'CURP inválida. Verifica el formato (18 caracteres).', codigo: 'CURP_FORMATO' }); return; }
    const tecnicoId = req.user!.userId;

    const prod = await pool.query(
      `SELECT p.productor_id,
              (SELECT row_to_json(x) FROM (SELECT pp.usuario_capturista_id, u.nombre_completo AS tecnico
                 FROM productor_programa pp LEFT JOIN usuarios u ON u.id = pp.usuario_capturista_id
                WHERE pp.productor_id = p.productor_id AND pp.programa = $2) x) AS frijol
         FROM productor p WHERE UPPER(p.curp) = $1`,
      [curp, PROGRAMA_FRIJOL]
    );

    if (prod.rows.length > 0) {
      const { producer_id: id, frijol } = prod.rows[0];
      if (frijol) {
        if (frijol.usuario_capturista_id === tecnicoId) {
          res.json({ codigo: 'EN_FRIJOL_PROPIO', producer_id: id, ...(await datosProductor(id)) });
        } else {
          res.json({ codigo: 'EN_FRIJOL_OTRO_TECNICO', tecnico: frijol.tecnico || 'otro técnico' });
        }
        return;
      }
      // Ya está en SIMAC (con o sin cuenta): se reutiliza su ficha y sus parcelas
      res.json({ codigo: 'EN_SIMAC', producer_id: id, ...(await datosProductor(id)) });
      return;
    }

    const ident = await verificarIdentidad(curp);
    switch (ident.tipo) {
      case 'PADRON_SADER':
        res.json({ codigo: 'PADRON_SADER', datos: ident.datos, token_verificacion: firmarVerificacion(curp, 'padron_sader', tecnicoId) });
        return;
      case 'RENAPO':
        res.json({ codigo: 'RENAPO', datos: ident.datos, token_verificacion: firmarVerificacion(curp, 'renapo', tecnicoId) });
        return;
      case 'NO_VERIFICABLE':
        res.json({ codigo: 'NO_VERIFICABLE', mensaje: 'No pudimos verificar la CURP en este momento. Puedes continuar; el sistema la verificará después automáticamente.' });
        return;
      case 'CURP_NO_VALIDA':
        res.status(404).json({ codigo: 'CURP_NO_VALIDA', error: 'Esta CURP no existe en el Registro Nacional de Población. Revisa que esté bien escrita.' });
        return;
      case 'CURP_FALLECIDO':
        res.status(403).json({ codigo: 'CURP_FALLECIDO', error: 'La CURP corresponde a una persona fallecida.' });
        return;
    }
  } catch (error) { responderError(res, error, 'POST /frijol/consultar-curp'); }
});

// =============================================
// POST /api/frijol/registros   (encabezado obligatorio: Idempotency-Key)
// Un registro = un productor + una parcela + su cultivo de frijol del ciclo. Todo en una transacción.
// =============================================
router.post('/registros', async (req: AuthRequest, res: Response): Promise<void> => {
  const clave = String(req.header('Idempotency-Key') || '').trim();
  if (!clave) { res.status(400).json({ error: 'Falta el encabezado Idempotency-Key', codigo: 'SIN_IDEMPOTENCY_KEY' }); return; }
  // T09 §9.4 (auditoría B1): la clave interna es "frijol:<id del técnico>:<clave>" y la columna admite 80 caracteres. Con un id de hasta
  // 10 dígitos quedan 62 para la clave del cliente; se pone 60. Un UUID (36) cabe de sobra. Es preferible un 400 claro que un 500.
  if (clave.length > CLAVE_IDEMPOTENCIA_MAX) { res.status(400).json({ error: `La clave del envío es demasiado larga (máximo ${CLAVE_IDEMPOTENCIA_MAX} caracteres).`, codigo: 'IDEMPOTENCY_KEY_LARGA' }); return; }
  const client = await pool.connect();
  try {
    const r = await guardarRegistro(client, req.user!.userId, req.body, `frijol:${req.user!.userId}:${clave}`);
    res.status(r.status).json(r.cuerpo);
  } catch (error) {
    responderError(res, error, 'POST /frijol/registros');
  } finally {
    client.release();
  }
});

// =============================================
// GET /api/frijol/registros/:cycle_crop_id/acuse   — PDF del acuse (solo el técnico responsable)
// =============================================
router.get('/registros/:cycle_crop_id/acuse', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT cc.ciclo_cultivo_id::int AS id, cc.superficie_sembrada_ha::float AS sembrada, cc.rendimiento_esperado::float AS rendimiento, cc.variedad_otra,
              cv.etiqueta AS variedad, c.anio_ciclo, c.tipo_ciclo, u.up_id::int AS up_id, u.nombre_up, u.nombre_estado, u.nombre_municipio, u.localidad,
              COALESCE(u.superficie_ha_real, u.superficie_ha_calculada)::float AS area_parcela,
              p.productor_id, p.curp, TRIM(CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno)) AS nombre, p.telefono,
              pp.verificacion_identidad, pp.usuario_capturista_id, t.nombre_completo AS tecnico, fc.creado_en
         FROM ciclo_cultivo cc
         JOIN ciclo c ON c.ciclo_id = cc.ciclo_id AND c.cultivo = 'frijol'
         JOIN up u ON u.up_id = c.up_id
         JOIN productor p ON p.productor_id = u.productor_id
         JOIN productor_programa pp ON pp.productor_id = p.productor_id AND pp.programa = $2
         LEFT JOIN usuarios t ON t.id = pp.usuario_capturista_id
         LEFT JOIN frijol_cultivo fc ON fc.ciclo_cultivo_id = cc.ciclo_cultivo_id
         LEFT JOIN cat_variedad_cultivo cv ON cv.codigo = cc.variedad_id AND cv.cultivo = 'frijol'
        WHERE cc.ciclo_cultivo_id = $1`,
      [req.params.cycle_crop_id, PROGRAMA_FRIJOL]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Registro no encontrado' }); return; }
    const d = r.rows[0];
    if (d.usuario_capturista_id !== req.user!.userId) { res.status(403).json({ error: 'Este registro lo hizo otro técnico' }); return; }
    const etiqueta = d.cycle_type === 'OI' ? `OI ${d.cycle_year}-${String((d.cycle_year + 1) % 100).padStart(2, '0')}` : d.cycle_type === 'PV' ? `PV ${d.cycle_year}` : `Anual ${d.cycle_year}`;
    const doc = generarAcuseFrijol({
      cycleCropId: d.id, fechaRegistro: d.created_at || new Date(),
      productor: { nombre: d.nombre, curp: d.curp, telefono: d.phone },
      idParcela: d.up_id, parcela: d.up_name, ubicacion: [d.localidad, d.municipality_name, d.state_name].filter(Boolean).join(', '),
      superficieParcelaHa: d.area_parcela, ciclo: etiqueta, variedad: d.variety_other || d.variedad || '—',
      superficieSembradaHa: d.sembrada, produccionEstimadaTon: d.rendimiento ? d.sembrada * d.rendimiento : null,
      tecnico: d.tecnico || '—', verificacionIdentidad: d.verificacion_identidad,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="acuse-frijol-${d.id}.pdf"`);
    doc.pipe(res);
    doc.end();
  } catch (error) { responderError(res, error, 'GET /frijol/registros/:id/acuse'); }
});

// =============================================
// GET /api/frijol/mis-registros?estatus=&verificacion=&q=
// =============================================
router.get('/mis-registros', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { estatus, verificacion, q } = req.query;
    const params: unknown[] = [req.user!.userId, PROGRAMA_FRIJOL];
    const cond: string[] = ['pp.programa = $2', 'pp.usuario_capturista_id = $1'];
    if (estatus) { params.push(estatus); cond.push(`pp.estatus_registro = $${params.length}`); }
    if (verificacion) { params.push(verificacion); cond.push(`pp.verificacion_identidad = $${params.length}`); }
    if (q) { params.push(`%${q}%`); cond.push(`(p.nombres ILIKE $${params.length} OR p.apellido_paterno ILIKE $${params.length} OR p.apellido_materno ILIKE $${params.length} OR p.curp ILIKE $${params.length})`); }

    const lista = await pool.query(
      `SELECT p.productor_id::int AS producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, gm.nombre AS municipio,
              pp.verificacion_identidad, pp.estatus_registro, pp.fecha_alta,
              (SELECT COUNT(DISTINCT u.up_id) FROM up u JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'frijol' WHERE u.productor_id = p.productor_id)::int AS parcelas_frijol,
              COALESCE((SELECT SUM(cc.superficie_sembrada_ha) FROM up u JOIN ciclo c ON c.up_id = u.up_id AND c.cultivo = 'frijol'
                          JOIN ciclo_cultivo cc ON cc.ciclo_id = c.ciclo_id WHERE u.productor_id = p.productor_id), 0)::float AS ha_frijol
         FROM productor_programa pp
         JOIN productor p ON p.productor_id = pp.productor_id
         LEFT JOIN geo_municipio gm ON gm.municipio_id = p.municipio_id
        WHERE ${cond.join(' AND ')}
        ORDER BY pp.fecha_alta DESC`,
      params
    );
    const cont = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estatus_registro = 'enviado' AND verificacion_identidad = 'verificada')::int AS enviados,
              COUNT(*) FILTER (WHERE verificacion_identidad = 'pendiente')::int AS pendientes_verificacion,
              COUNT(*) FILTER (WHERE estatus_registro = 'requiere_correccion')::int AS requieren_correccion
         FROM productor_programa WHERE programa = $1 AND usuario_capturista_id = $2`,
      [PROGRAMA_FRIJOL, req.user!.userId]
    );
    res.json({ registros: lista.rows, contadores: cont.rows[0] });
  } catch (error) { responderError(res, error, 'GET /frijol/mis-registros'); }
});

// =============================================
// GET /api/frijol/productores/:producer_id   — detalle completo
// =============================================
router.get('/productores/:producer_id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pp = await productorPropio(req, res, req.params.producer_id);
    if (!pp) return;
    const base = await datosProductor(Number(req.params.producer_id));
    const cultivos = await pool.query(
      `SELECT cc.ciclo_cultivo_id::int AS cycle_crop_id, c.ciclo_id::int AS cycle_id, c.up_id::int AS up_id, c.anio_ciclo, c.tipo_ciclo, c.tipo_riego, cc.variedad_id, cc.variedad_otra,
              cv.etiqueta AS variedad, cc.superficie_sembrada_ha::float AS area_sown_ha, to_char(cc.fecha_siembra,'YYYY-MM-DD') AS fecha_siembra,
              to_char(cc.fecha_cosecha_estimada,'YYYY-MM-DD') AS fecha_cosecha_estimada, cc.rendimiento_esperado::float AS rendimiento_esperado_t_ha,
              cc.destino AS destino, fc.tipo_siembra, fc.densidad_kg_ha::float AS densidad_kg_ha, fc.usa_fertilizante, fc.tipos_fertilizante, fc.rotacion,
              fc.observaciones, fc.sin_observaciones, fc.capturado_en, fc.hubo_desconexion, fc.creado_en
         FROM ciclo_cultivo cc
         JOIN ciclo c ON c.ciclo_id = cc.ciclo_id AND c.cultivo = 'frijol'
         JOIN up u ON u.up_id = c.up_id
         LEFT JOIN frijol_cultivo fc ON fc.ciclo_cultivo_id = cc.ciclo_cultivo_id
         LEFT JOIN cat_variedad_cultivo cv ON cv.codigo = cc.variedad_id AND cv.cultivo = 'frijol'
        WHERE u.productor_id = $1 ORDER BY c.anio_ciclo DESC, cc.ciclo_cultivo_id DESC`, [req.params.producer_id]);
    const semillas = await pool.query(
      `SELECT s.* FROM frijol_semillas s JOIN up u ON u.up_id = s.up_id WHERE u.productor_id = $1`, [req.params.producer_id]);
    res.json({
      ...base,
      verificacion_identidad: pp.verificacion_identidad, estatus_registro: pp.estatus_registro, fecha_alta: pp.fecha_alta,
      cultivos: cultivos.rows, semillas: semillas.rows,
    });
  } catch (error) { responderError(res, error, 'GET /frijol/productores/:id'); }
});

// =============================================
// PATCH /api/frijol/productores/:producer_id   — corregir datos personales y de frijol_productor (con historial)
// =============================================
router.patch('/productores/:producer_id', async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const pp = await productorPropio(req, res, req.params.producer_id, client);
    if (!pp) return;
    const id = Number(req.params.producer_id);
    const p = req.body?.productor || {}, fp = req.body?.frijol_productor;
    const mal = (campo: string, error: string) => { res.status(400).json({ error, campo }); };

    if (p.telefono !== undefined && !/^\d{10}$/.test(String(p.telefono))) { mal('productor.telefono', 'El teléfono debe tener 10 dígitos'); return; }
    if (p.correo && !EMAIL_RE.test(String(p.correo))) { mal('productor.correo', 'El correo no tiene un formato válido'); return; }
    if (p.nombres !== undefined && !String(p.nombres).trim()) { mal('productor.nombres', 'El nombre es obligatorio'); return; }
    if (p.apellido_paterno !== undefined && !String(p.apellido_paterno).trim()) { mal('productor.apellido_paterno', 'El apellido paterno es obligatorio'); return; }
    if (p.sexo !== undefined && p.sexo !== 'H' && p.sexo !== 'M') { mal('productor.sexo', 'El sexo debe ser H o M'); return; }
    // T09 §9.9: misma regla de fecha de nacimiento que el registro nuevo (formato y edad de 15 a 100 años)
    if (p.fecha_nacimiento !== undefined) { const errFecha = errorFechaNacimiento(p.fecha_nacimiento); if (errFecha) { mal('productor.fecha_nacimiento', errFecha); return; } }
    if (fp) {
      const progs: string[] = Array.isArray(fp.programas_sader) ? fp.programas_sader : [];
      if (!Number.isInteger(Number(fp.total_ups_declaradas)) || Number(fp.total_ups_declaradas) < 1) { mal('frijol_productor.total_ups_declaradas', 'Indica cuántas parcelas tiene en total (mínimo 1)'); return; }
      if (typeof fp.participa_programas_sader !== 'boolean' || (fp.participa_programas_sader && progs.length === 0) || progs.some(x => !PROGRAMAS_SADER.includes(x))) { mal('frijol_productor.programas_sader', 'Revisa los programas de la Secretaría'); return; }
      if (progs.includes('otro_sader') && !String(fp.programas_sader_otro || '').trim()) { mal('frijol_productor.programas_sader_otro', 'Escribe cuál es el otro programa'); return; }
      if (fp.seguro_agricola === 'otro' && !String(fp.seguro_agricola_nombre || '').trim()) { mal('frijol_productor.seguro_agricola_nombre', 'Escribe el nombre del seguro o programa'); return; }
    }

    // T09 §9.2.3: seguro agrícola y programas se validan contra el catálogo (igual que en el registro nuevo)
    if (fp) await validarCatalogosProductor(client, { ...fp, programas_sader: fp.participa_programas_sader ? fp.programas_sader : [] });

    await client.query('BEGIN');
    // T10: la corrección de datos personales es la "edición única": cada dato se corrige directo una sola vez (con historial); después, por solicitud.
    await aplicarEdicionDirecta(client, {
      producerId: id, usuarioId: req.user!.userId, programa: PROGRAMA_FRIJOL,
      cambios: {
        nombres: p.nombres, apellido_paterno: p.apellido_paterno, apellido_materno: p.apellido_materno, sexo: p.sexo,
        fecha_nacimiento: p.fecha_nacimiento, telefono: p.telefono, correo: p.correo,
      },
    });
    if (fp) {
      const progs: string[] = Array.isArray(fp.programas_sader) ? fp.programas_sader : [];
      await client.query(
        `UPDATE frijol_productor SET total_ups_declaradas=$1, participa_programas_sader=$2, programas_sader=$3, programas_sader_otro=$4,
                organizacion=$5, seguro_agricola=$6, seguro_agricola_nombre=$7, actualizado_en=NOW() WHERE productor_id=$8`,
        [Number(fp.total_ups_declaradas), fp.participa_programas_sader, fp.participa_programas_sader ? progs : [],
         progs.includes('otro_sader') ? String(fp.programas_sader_otro).trim() : null, fp.organizacion ? String(fp.organizacion).trim() : null,
         fp.seguro_agricola || null, fp.seguro_agricola === 'otro' ? String(fp.seguro_agricola_nombre).trim() : null, id]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, ...(await datosProductor(id)) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    responderError(res, error, 'PATCH /frijol/productores/:id');
  } finally { client.release(); }
});

// =============================================
// PATCH /api/frijol/productores/:producer_id/curp
// Solo si la identidad quedó "no válida" (requiere corrección), el productor lo creó este técnico y no está en otro programa.
// =============================================
router.patch('/productores/:producer_id/curp', async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const pp = await productorPropio(req, res, req.params.producer_id, client);
    if (!pp) return;
    const id = Number(req.params.producer_id);
    if (pp.verificacion_identidad !== 'no_valida') { res.status(409).json({ error: 'Solo se puede corregir la CURP cuando no es válida en RENAPO', codigo: 'CURP_NO_EDITABLE' }); return; }
    const curp = String(req.body?.curp || '').toUpperCase().trim();
    if (!CURP_RE.test(curp)) { res.status(400).json({ error: 'CURP inválida. Verifica el formato (18 caracteres).', campo: 'curp' }); return; }

    const p = (await client.query('SELECT curp, usuario_capturista_id, usuario_id FROM productor WHERE productor_id = $1', [id])).rows[0];
    const otros = await client.query('SELECT 1 FROM productor_programa WHERE productor_id = $1 AND programa <> $2 LIMIT 1', [id, PROGRAMA_FRIJOL]);
    if (p.usuario_capturista_id !== req.user!.userId || p.usuario_id || otros.rows.length > 0) {
      res.status(409).json({ error: 'No se puede corregir la CURP de este productor porque también está en SIMAC', codigo: 'CURP_NO_EDITABLE' }); return;
    }
    const dup = await client.query('SELECT 1 FROM productor WHERE UPPER(curp) = $1 AND productor_id <> $2', [curp, id]);
    if (dup.rows.length > 0) { res.status(409).json({ error: 'Esa CURP ya está registrada con otro productor', codigo: 'CURP_DUPLICADA' }); return; }

    const ident = await verificarIdentidad(curp);
    if (ident.tipo === 'CURP_NO_VALIDA') { res.status(422).json({ error: 'Esta CURP tampoco existe en RENAPO. Revisa que esté bien escrita.', codigo: 'CURP_NO_VALIDA' }); return; }
    if (ident.tipo === 'CURP_FALLECIDO') { res.status(422).json({ error: 'La CURP corresponde a una persona fallecida.', codigo: 'CURP_FALLECIDO' }); return; }

    const verificada = ident.tipo === 'PADRON_SADER' || ident.tipo === 'RENAPO';
    await client.query('BEGIN');
    await client.query('UPDATE productor SET curp = $1 WHERE productor_id = $2', [curp, id]);
    await client.query(
      `UPDATE productor_programa SET verificacion_identidad = $1, estatus_registro = 'enviado', actualizado_en = NOW() WHERE productor_id = $2 AND programa = $3`,
      [verificada ? 'verificada' : 'pendiente', id, PROGRAMA_FRIJOL]
    );
    await client.query(
      'INSERT INTO productor_cambios (productor_id, campo, valor_anterior, valor_nuevo, usuario_id, programa) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, 'curp', p.curp, curp, req.user!.userId, PROGRAMA_FRIJOL]
    );
    await client.query('COMMIT');
    res.json({ ok: true, verificacion_identidad: verificada ? 'verificada' : 'pendiente', estatus_registro: 'enviado' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    responderError(res, error, 'PATCH /frijol/productores/:id/curp');
  } finally { client.release(); }
});

// =============================================
// PATCH /api/frijol/cultivos/:cycle_crop_id   — corregir el cultivo mientras el registro no esté validado
// =============================================
router.patch('/cultivos/:cycle_crop_id', async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const dueno = await client.query(
      `SELECT u.productor_id, u.up_id, u.superficie_ha_calculada, u.superficie_ha_real, c.ciclo_id, c.anio_ciclo, c.tipo_ciclo, c.tipo_riego
         FROM ciclo_cultivo cc JOIN ciclo c ON c.ciclo_id = cc.ciclo_id AND c.cultivo = 'frijol' JOIN up u ON u.up_id = c.up_id
        WHERE cc.ciclo_cultivo_id = $1`, [req.params.cycle_crop_id]);
    if (dueno.rows.length === 0) { res.status(404).json({ error: 'Cultivo de frijol no encontrado' }); return; }
    const d = dueno.rows[0];
    const pp = await productorPropio(req, res, d.producer_id, client);
    if (!pp) return;
    if (pp.estatus_registro === 'validado') { res.status(409).json({ error: 'Este registro ya fue validado y no se puede corregir', codigo: 'REGISTRO_VALIDADO' }); return; }

    const act = (await client.query(
      `SELECT cc.variedad_id, cc.variedad_otra, cc.superficie_sembrada_ha, to_char(cc.fecha_siembra,'YYYY-MM-DD') AS fecha_siembra,
              to_char(cc.fecha_cosecha_estimada,'YYYY-MM-DD') AS fecha_cosecha_estimada, cc.rendimiento_esperado AS rendimiento_esperado_t_ha,
              cc.destino AS destino, fc.tipo_siembra, fc.densidad_kg_ha, fc.usa_fertilizante, fc.tipos_fertilizante, fc.rotacion,
              fc.observaciones, fc.sin_observaciones
         FROM ciclo_cultivo cc LEFT JOIN frijol_cultivo fc ON fc.ciclo_cultivo_id = cc.ciclo_cultivo_id WHERE cc.ciclo_cultivo_id = $1`, [req.params.cycle_crop_id])).rows[0];
    const cu = { ...act, ...(req.body?.cultivo || {}) };
    validarCultivo(cu);

    // T09 §9.2: las mismas validaciones de catálogo que el registro nuevo (variedad, destino, tipo de siembra, rotación y fertilizantes)
    await validarCatalogosCultivo(client, cu);
    const areaFinal = Number(d.area_ha_real || d.area_ha_calc || 0);
    if (areaFinal > 0 && Number(cu.area_sown_ha) > areaFinal + 1e-9) {
      res.status(400).json({ error: `La superficie sembrada no puede ser mayor a la de la parcela (${areaFinal.toFixed(2)} ha)`, campo: 'cultivo.area_sown_ha' }); return;
    }

    // Si cambia la fecha de siembra puede cambiar el ciclo: se recalcula y se mueve solo si no choca con otro ciclo de frijol
    const regimen: Regimen = d.tipo_riego === 'riego' ? 'riego' : 'temporal';
    const nuevoCiclo = cicloFinal(cu.fecha_siembra, regimen, req.body?.cultivo?.cycle_type || d.cycle_type);
    if (!nuevoCiclo.ok) { res.status(400).json({ error: nuevoCiclo.error, campo: 'cultivo.cycle_type' }); return; }
    const c = nuevoCiclo.ciclo;

    // T11-B: suma con el maíz de la misma parcela (sin contar este mismo ciclo dos veces)
    const comb = await validarSuperficieCombinada(client, {
      upId: d.up_id, cycleYear: c.cycle_year, cycleType: c.cycle_type,
      cultivo: 'frijol', haNueva: Number(cu.area_sown_ha), asociadoNuevo: cu.tipo_siembra === 'asociada',
      excluirCycleId: d.cycle_id, accion: 'corrigiendo',
    });
    if (!comb.ok) { res.status(409).json({ error: comb.mensaje, campo: 'cultivo.area_sown_ha', ...comb.detalle }); return; }

    await client.query('BEGIN');
    if (c.cycle_year !== d.cycle_year || c.cycle_type !== d.cycle_type) {
      const choque = await client.query(
        `SELECT 1 FROM ciclo WHERE up_id = $1 AND cultivo = 'frijol' AND anio_ciclo = $2 AND tipo_ciclo = $3 AND ciclo_id <> $4 AND COALESCE(estado_ciclo,'activo') = 'activo'`,
        [d.up_id, c.cycle_year, c.cycle_type, d.cycle_id]);
      if (choque.rows.length > 0) { await client.query('ROLLBACK'); res.status(409).json({ error: `Ya hay frijol registrado en esta parcela para ${c.etiqueta}`, codigo: 'FRIJOL_YA_REGISTRADO' }); return; }
      await client.query('UPDATE ciclo SET anio_ciclo = $1, tipo_ciclo = $2 WHERE ciclo_id = $3', [c.cycle_year, c.cycle_type, d.cycle_id]);
    }
    await client.query(
      `UPDATE ciclo_cultivo SET variedad_id=$1, variedad_otra=$2, superficie_sembrada_ha=$3, fecha_siembra=$4, fecha_cosecha_estimada=$5, rendimiento_esperado=$6, destino=$7
        WHERE ciclo_cultivo_id = $8`,
      [cu.variety_id, cu.variety_other ? String(cu.variety_other).trim() : null, Number(cu.area_sown_ha), cu.fecha_siembra, cu.fecha_cosecha_estimada,
       Number(cu.rendimiento_esperado_t_ha), cu.destino || null, req.params.cycle_crop_id]);
    await client.query('UPDATE ciclo SET hectareas_sembradas = $1, fecha_siembra = $2, variedad_nombre = $3 WHERE ciclo_id = $4',
      [Number(cu.area_sown_ha), cu.fecha_siembra, cu.variety_other || cu.variety_id, d.cycle_id]);
    await client.query(
      `UPDATE frijol_cultivo SET tipo_siembra=$1, densidad_kg_ha=$2, usa_fertilizante=$3, tipos_fertilizante=$4, rotacion=$5, observaciones=$6,
              sin_observaciones=$7, actualizado_en=NOW() WHERE ciclo_cultivo_id = $8`,
      [cu.tipo_siembra || null, Number(cu.densidad_kg_ha), cu.usa_fertilizante, cu.usa_fertilizante ? cu.tipos_fertilizante : [], cu.rotacion,
       cu.sin_observaciones === true ? null : String(cu.observaciones).trim(), cu.sin_observaciones === true, req.params.cycle_crop_id]);
    await client.query('COMMIT');
    res.json({ ok: true, ciclo: c.etiqueta });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    responderError(res, error, 'PATCH /frijol/cultivos/:id');
  } finally { client.release(); }
});

export default router;
