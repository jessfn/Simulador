import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, requiereCapturista, AuthRequest } from '../middleware/auth';
import { requierePrograma } from '../middleware/programa';
import { PROGRAMA_FRIJOL } from '../utils/programas';
import { verificarIdentidad } from '../services/identidad';
import { inferirCiclo, cicloFinal, Regimen } from '../services/cicloSIAP';
import { ErrorRegistro, guardarRegistro, firmarVerificacion, validarCultivo } from '../services/frijolRegistro';

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
const PROGRAMAS_SADER = [
  'acopio_bienestar', 'fertilizantes_bienestar', 'produccion_bienestar', 'semillas_bienestar', 'otro_sader',
];

function responderError(res: Response, error: unknown, contexto: string): void {
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
    `SELECT pp.*, p.curp FROM producer_programa pp JOIN producer p ON p.producer_id = pp.producer_id
      WHERE pp.producer_id = $1 AND pp.programa = $2`,
    [producerId, PROGRAMA_FRIJOL]
  );
  if (r.rows.length === 0) { res.status(404).json({ error: 'Productor no encontrado en Frijol' }); return null; }
  if (r.rows[0].usuario_capturista_id !== req.user!.userId) { res.status(403).json({ error: 'Este productor lo registró otro técnico' }); return null; }
  return r.rows[0];
}

// ─── Datos del productor y sus parcelas (para prellenar el registro) ────────
async function datosProductor(producerId: number) {
  const p = await pool.query(
    `SELECT p.producer_id::int AS producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, p.sexo,
            to_char(p.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
            p.phone AS telefono, p.correo, p.usuario_id IS NOT NULL AS tiene_cuenta
       FROM producer p WHERE p.producer_id = $1`, [producerId]);
  const fp = await pool.query('SELECT * FROM frijol_productor WHERE producer_id = $1', [producerId]);
  const parcelas = await pool.query(
    `SELECT u.up_id::int AS up_id, u.up_name, u.numero_up, u.area_ha_calc::float AS area_ha_calc, u.area_ha_real::float AS area_ha_real, u.state_id, u.state_name, u.municipality_id,
            u.municipality_name, u.localidad, u.documento_propiedad, u.documento_propiedad_otro,
            ST_AsGeoJSON(u.geom)::json AS geom_geojson,
            COALESCE((SELECT json_agg(CASE c.cycle_type
                                        WHEN 'OI' THEN 'OI ' || c.cycle_year || '-' || LPAD(((c.cycle_year + 1) % 100)::text, 2, '0')
                                        WHEN 'PV' THEN 'PV ' || c.cycle_year
                                        ELSE 'Anual ' || c.cycle_year END ORDER BY c.cycle_year DESC)
                       FROM cycle c WHERE c.up_id = u.up_id AND c.crop = 'frijol' AND COALESCE(c.estado_ciclo,'activo') <> 'cancelado'), '[]'::json) AS ciclos_frijol
       FROM up u WHERE u.producer_id = $1 ORDER BY u.numero_up NULLS LAST, u.created_at`, [producerId]);
  return {
    datos: p.rows[0],
    frijol_productor: fp.rows[0] || null,
    parcelas: parcelas.rows.map((r: any) => ({ ...r, tiene_frijol: r.ciclos_frijol.length > 0 })),
  };
}

// =============================================
// GET /api/frijol/catalogos
// =============================================
router.get('/catalogos', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [variedades, generales, programas] = await Promise.all([
      pool.query(
        `SELECT code, label FROM cat_crop_variety
          WHERE crop = 'frijol' AND is_active = true
          ORDER BY (code IN ('CRIOLLO_LOCAL','OTRA')), sort_order, label`
      ),
      pool.query(
        `SELECT catalog, code, label FROM cat_catalog
          WHERE catalog = ANY($1::text[]) AND is_active = true
          ORDER BY catalog, sort_order, label`,
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
      pool.query('SELECT state_id, name FROM geo_state ORDER BY name'),
      pool.query('SELECT state_id, municipality_id FROM tecnico_zona WHERE usuario_id = $1', [req.user!.userId]),
    ]);
    res.json({ estados: estados.rows, zona: zona.rows });
  } catch (error) { responderError(res, error, 'GET /frijol/estados'); }
});

router.get('/municipios', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stateId = String(req.query.state_id || '');
    if (!stateId) { res.status(400).json({ error: 'Falta state_id' }); return; }
    const r = await pool.query('SELECT municipality_id, name FROM geo_municipality WHERE state_id = $1 ORDER BY name', [stateId]);
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
router.post('/consultar-curp', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const curp = String(req.body?.curp || '').toUpperCase().trim();
    if (!CURP_RE.test(curp)) { res.status(400).json({ error: 'CURP inválida. Verifica el formato (18 caracteres).', codigo: 'CURP_FORMATO' }); return; }
    const tecnicoId = req.user!.userId;

    const prod = await pool.query(
      `SELECT p.producer_id,
              (SELECT row_to_json(x) FROM (SELECT pp.usuario_capturista_id, u.nombre_completo AS tecnico
                 FROM producer_programa pp LEFT JOIN usuarios u ON u.id = pp.usuario_capturista_id
                WHERE pp.producer_id = p.producer_id AND pp.programa = $2) x) AS frijol
         FROM producer p WHERE UPPER(p.curp) = $1`,
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
  if (!clave || clave.length > 100) { res.status(400).json({ error: 'Falta el encabezado Idempotency-Key', codigo: 'SIN_IDEMPOTENCY_KEY' }); return; }
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
      `SELECT p.producer_id::int AS producer_id, p.curp, p.nombres, p.apellido_paterno, p.apellido_materno, gm.name AS municipio,
              pp.verificacion_identidad, pp.estatus_registro, pp.fecha_alta,
              (SELECT COUNT(DISTINCT u.up_id) FROM up u JOIN cycle c ON c.up_id = u.up_id AND c.crop = 'frijol' WHERE u.producer_id = p.producer_id)::int AS parcelas_frijol,
              COALESCE((SELECT SUM(cc.area_sown_ha) FROM up u JOIN cycle c ON c.up_id = u.up_id AND c.crop = 'frijol'
                          JOIN cycle_crop cc ON cc.cycle_id = c.cycle_id WHERE u.producer_id = p.producer_id), 0)::float AS ha_frijol
         FROM producer_programa pp
         JOIN producer p ON p.producer_id = pp.producer_id
         LEFT JOIN geo_municipality gm ON gm.municipality_id = p.municipality_id
        WHERE ${cond.join(' AND ')}
        ORDER BY pp.fecha_alta DESC`,
      params
    );
    const cont = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estatus_registro = 'enviado' AND verificacion_identidad = 'verificada')::int AS enviados,
              COUNT(*) FILTER (WHERE verificacion_identidad = 'pendiente')::int AS pendientes_verificacion,
              COUNT(*) FILTER (WHERE estatus_registro = 'requiere_correccion')::int AS requieren_correccion
         FROM producer_programa WHERE programa = $1 AND usuario_capturista_id = $2`,
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
      `SELECT cc.cycle_crop_id::int AS cycle_crop_id, c.cycle_id::int AS cycle_id, c.up_id::int AS up_id, c.cycle_year, c.cycle_type, c.tipo_riego, cc.variety_id, cc.variety_other,
              cv.label AS variedad, cc.area_sown_ha::float AS area_sown_ha, to_char(cc.planting_date,'YYYY-MM-DD') AS fecha_siembra,
              to_char(cc.estimated_harvest_date,'YYYY-MM-DD') AS fecha_cosecha_estimada, cc.yield_expected::float AS rendimiento_esperado_t_ha,
              cc.destination AS destino, fc.tipo_siembra, fc.densidad_kg_ha::float AS densidad_kg_ha, fc.usa_fertilizante, fc.tipos_fertilizante, fc.rotacion,
              fc.observaciones, fc.sin_observaciones, fc.capturado_en, fc.hubo_desconexion, fc.created_at
         FROM cycle_crop cc
         JOIN cycle c ON c.cycle_id = cc.cycle_id AND c.crop = 'frijol'
         JOIN up u ON u.up_id = c.up_id
         LEFT JOIN frijol_cultivo fc ON fc.cycle_crop_id = cc.cycle_crop_id
         LEFT JOIN cat_crop_variety cv ON cv.code = cc.variety_id AND cv.crop = 'frijol'
        WHERE u.producer_id = $1 ORDER BY c.cycle_year DESC, cc.cycle_crop_id DESC`, [req.params.producer_id]);
    const semillas = await pool.query(
      `SELECT s.* FROM frijol_semillas s JOIN up u ON u.up_id = s.up_id WHERE u.producer_id = $1`, [req.params.producer_id]);
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
    if (fp) {
      const progs: string[] = Array.isArray(fp.programas_sader) ? fp.programas_sader : [];
      if (!Number.isInteger(Number(fp.total_ups_declaradas)) || Number(fp.total_ups_declaradas) < 1) { mal('frijol_productor.total_ups_declaradas', 'Indica cuántas parcelas tiene en total (mínimo 1)'); return; }
      if (typeof fp.participa_programas_sader !== 'boolean' || (fp.participa_programas_sader && progs.length === 0) || progs.some(x => !PROGRAMAS_SADER.includes(x))) { mal('frijol_productor.programas_sader', 'Revisa los programas de la Secretaría'); return; }
      if (progs.includes('otro_sader') && !String(fp.programas_sader_otro || '').trim()) { mal('frijol_productor.programas_sader_otro', 'Escribe cuál es el otro programa'); return; }
      if (fp.seguro_agricola === 'otro' && !String(fp.seguro_agricola_nombre || '').trim()) { mal('frijol_productor.seguro_agricola_nombre', 'Escribe el nombre del seguro o programa'); return; }
    }

    await client.query('BEGIN');
    const actual = (await client.query("SELECT *, to_char(fecha_nacimiento,'YYYY-MM-DD') AS fn FROM producer WHERE producer_id = $1", [id])).rows[0];
    const campos: Array<[string, string, unknown]> = [
      ['nombres', 'nombres', p.nombres !== undefined ? String(p.nombres).trim() : undefined],
      ['apellido_paterno', 'apellido_paterno', p.apellido_paterno !== undefined ? String(p.apellido_paterno).trim() : undefined],
      ['apellido_materno', 'apellido_materno', p.apellido_materno !== undefined ? (String(p.apellido_materno).trim() || null) : undefined],
      ['sexo', 'sexo', p.sexo],
      ['fecha_nacimiento', 'fecha_nacimiento', p.fecha_nacimiento !== undefined ? String(p.fecha_nacimiento).slice(0, 10) : undefined],
      ['telefono', 'phone', p.telefono !== undefined ? String(p.telefono) : undefined],
      ['correo', 'correo', p.correo !== undefined ? (String(p.correo).trim().toLowerCase() || null) : undefined],
    ];
    for (const [campo, col, nuevo] of campos) {
      if (nuevo === undefined) continue;
      const antes = col === 'fecha_nacimiento' ? actual.fn : actual[col];
      if (String(antes ?? '') === String(nuevo ?? '')) continue;
      await client.query(`UPDATE producer SET ${col} = $1 WHERE producer_id = $2`, [nuevo, id]);
      await client.query(
        'INSERT INTO producer_cambios (producer_id, campo, valor_anterior, valor_nuevo, usuario_id, programa) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, campo, antes == null ? null : String(antes), nuevo == null ? null : String(nuevo), req.user!.userId, PROGRAMA_FRIJOL]
      );
    }
    if (fp) {
      const progs: string[] = Array.isArray(fp.programas_sader) ? fp.programas_sader : [];
      await client.query(
        `UPDATE frijol_productor SET total_ups_declaradas=$1, participa_programas_sader=$2, programas_sader=$3, programas_sader_otro=$4,
                organizacion=$5, seguro_agricola=$6, seguro_agricola_nombre=$7, updated_at=NOW() WHERE producer_id=$8`,
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

    const p = (await client.query('SELECT curp, usuario_capturista_id, usuario_id FROM producer WHERE producer_id = $1', [id])).rows[0];
    const otros = await client.query('SELECT 1 FROM producer_programa WHERE producer_id = $1 AND programa <> $2 LIMIT 1', [id, PROGRAMA_FRIJOL]);
    if (p.usuario_capturista_id !== req.user!.userId || p.usuario_id || otros.rows.length > 0) {
      res.status(409).json({ error: 'No se puede corregir la CURP de este productor porque también está en SIMAC', codigo: 'CURP_NO_EDITABLE' }); return;
    }
    const dup = await client.query('SELECT 1 FROM producer WHERE UPPER(curp) = $1 AND producer_id <> $2', [curp, id]);
    if (dup.rows.length > 0) { res.status(409).json({ error: 'Esa CURP ya está registrada con otro productor', codigo: 'CURP_DUPLICADA' }); return; }

    const ident = await verificarIdentidad(curp);
    if (ident.tipo === 'CURP_NO_VALIDA') { res.status(422).json({ error: 'Esta CURP tampoco existe en RENAPO. Revisa que esté bien escrita.', codigo: 'CURP_NO_VALIDA' }); return; }
    if (ident.tipo === 'CURP_FALLECIDO') { res.status(422).json({ error: 'La CURP corresponde a una persona fallecida.', codigo: 'CURP_FALLECIDO' }); return; }

    const verificada = ident.tipo === 'PADRON_SADER' || ident.tipo === 'RENAPO';
    await client.query('BEGIN');
    await client.query('UPDATE producer SET curp = $1 WHERE producer_id = $2', [curp, id]);
    await client.query(
      `UPDATE producer_programa SET verificacion_identidad = $1, estatus_registro = 'enviado', updated_at = NOW() WHERE producer_id = $2 AND programa = $3`,
      [verificada ? 'verificada' : 'pendiente', id, PROGRAMA_FRIJOL]
    );
    await client.query(
      'INSERT INTO producer_cambios (producer_id, campo, valor_anterior, valor_nuevo, usuario_id, programa) VALUES ($1,$2,$3,$4,$5,$6)',
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
      `SELECT u.producer_id, u.up_id, u.area_ha_calc, u.area_ha_real, c.cycle_id, c.cycle_year, c.cycle_type, c.tipo_riego
         FROM cycle_crop cc JOIN cycle c ON c.cycle_id = cc.cycle_id AND c.crop = 'frijol' JOIN up u ON u.up_id = c.up_id
        WHERE cc.cycle_crop_id = $1`, [req.params.cycle_crop_id]);
    if (dueno.rows.length === 0) { res.status(404).json({ error: 'Cultivo de frijol no encontrado' }); return; }
    const d = dueno.rows[0];
    const pp = await productorPropio(req, res, d.producer_id, client);
    if (!pp) return;
    if (pp.estatus_registro === 'validado') { res.status(409).json({ error: 'Este registro ya fue validado y no se puede corregir', codigo: 'REGISTRO_VALIDADO' }); return; }

    const act = (await client.query(
      `SELECT cc.variety_id, cc.variety_other, cc.area_sown_ha, to_char(cc.planting_date,'YYYY-MM-DD') AS fecha_siembra,
              to_char(cc.estimated_harvest_date,'YYYY-MM-DD') AS fecha_cosecha_estimada, cc.yield_expected AS rendimiento_esperado_t_ha,
              cc.destination AS destino, fc.tipo_siembra, fc.densidad_kg_ha, fc.usa_fertilizante, fc.tipos_fertilizante, fc.rotacion,
              fc.observaciones, fc.sin_observaciones
         FROM cycle_crop cc LEFT JOIN frijol_cultivo fc ON fc.cycle_crop_id = cc.cycle_crop_id WHERE cc.cycle_crop_id = $1`, [req.params.cycle_crop_id])).rows[0];
    const cu = { ...act, ...(req.body?.cultivo || {}) };
    validarCultivo(cu);

    const v = await client.query(`SELECT 1 FROM cat_crop_variety WHERE crop = 'frijol' AND code = $1 AND is_active = true`, [cu.variety_id]);
    if (v.rows.length === 0) { res.status(400).json({ error: 'La variedad seleccionada no es válida', campo: 'cultivo.variety_id' }); return; }
    const areaFinal = Number(d.area_ha_real || d.area_ha_calc || 0);
    if (areaFinal > 0 && Number(cu.area_sown_ha) > areaFinal + 1e-9) {
      res.status(400).json({ error: `La superficie sembrada no puede ser mayor a la de la parcela (${areaFinal.toFixed(2)} ha)`, campo: 'cultivo.area_sown_ha' }); return;
    }

    // Si cambia la fecha de siembra puede cambiar el ciclo: se recalcula y se mueve solo si no choca con otro ciclo de frijol
    const regimen: Regimen = d.tipo_riego === 'riego' ? 'riego' : 'temporal';
    const nuevoCiclo = cicloFinal(cu.fecha_siembra, regimen, req.body?.cultivo?.cycle_type || d.cycle_type);
    if (!nuevoCiclo.ok) { res.status(400).json({ error: nuevoCiclo.error, campo: 'cultivo.cycle_type' }); return; }
    const c = nuevoCiclo.ciclo;

    await client.query('BEGIN');
    if (c.cycle_year !== d.cycle_year || c.cycle_type !== d.cycle_type) {
      const choque = await client.query(
        `SELECT 1 FROM cycle WHERE up_id = $1 AND crop = 'frijol' AND cycle_year = $2 AND cycle_type = $3 AND cycle_id <> $4 AND COALESCE(estado_ciclo,'activo') = 'activo'`,
        [d.up_id, c.cycle_year, c.cycle_type, d.cycle_id]);
      if (choque.rows.length > 0) { await client.query('ROLLBACK'); res.status(409).json({ error: `Ya hay frijol registrado en esta parcela para ${c.etiqueta}`, codigo: 'FRIJOL_YA_REGISTRADO' }); return; }
      await client.query('UPDATE cycle SET cycle_year = $1, cycle_type = $2 WHERE cycle_id = $3', [c.cycle_year, c.cycle_type, d.cycle_id]);
    }
    await client.query(
      `UPDATE cycle_crop SET variety_id=$1, variety_other=$2, area_sown_ha=$3, planting_date=$4, estimated_harvest_date=$5, yield_expected=$6, destination=$7
        WHERE cycle_crop_id = $8`,
      [cu.variety_id, cu.variety_other ? String(cu.variety_other).trim() : null, Number(cu.area_sown_ha), cu.fecha_siembra, cu.fecha_cosecha_estimada,
       Number(cu.rendimiento_esperado_t_ha), cu.destino || null, req.params.cycle_crop_id]);
    await client.query('UPDATE cycle SET hectareas_sembradas = $1, fecha_siembra = $2, variedad_nombre = $3 WHERE cycle_id = $4',
      [Number(cu.area_sown_ha), cu.fecha_siembra, cu.variety_other || cu.variety_id, d.cycle_id]);
    await client.query(
      `UPDATE frijol_cultivo SET tipo_siembra=$1, densidad_kg_ha=$2, usa_fertilizante=$3, tipos_fertilizante=$4, rotacion=$5, observaciones=$6,
              sin_observaciones=$7, updated_at=NOW() WHERE cycle_crop_id = $8`,
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
