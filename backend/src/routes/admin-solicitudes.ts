import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';
import { resolverSolicitud, SELECT_LISTA } from '../services/solicitudesCambio';
import { responderErrorEdicion } from './solicitudes-cambio';

// T10 · Panel de administración: bandeja de solicitudes de cambio. Permiso propio: vista "solicitudes_cambio" (ver / resolver).
const router = Router();
router.use(authMiddleware);
const ver = checkPermiso('solicitudes_cambio', 'ver');
const resolver = checkPermiso('solicitudes_cambio', 'resolver');
const idNum = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const ESTADOS = ['pendiente', 'aprobada', 'rechazada', 'cancelada'];
const PROGRAMAS = ['simac_maiz', 'frijol_afb'];

router.get('/', ver, async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const w: string[] = [];
    const v: unknown[] = [];
    const param = (valor: unknown) => { v.push(valor); return `$${v.length}`; };
    if (q.estado && ESTADOS.includes(q.estado)) w.push(`s.estado = ${param(q.estado)}`);
    if (q.programa && PROGRAMAS.includes(q.programa)) w.push(`s.programa_solicitante = ${param(q.programa)}`);
    const tec = idNum(q.tecnico);
    if (tec) { const p = param(tec); w.push(`(s.solicitante_id = ${p} OR s.asignado_a = ${p} OR s.asignado_original_id = ${p})`); }
    if (q.escaladas === 'true') w.push('s.escalada');
    if (q.campo === 'telefono') w.push("s.campo = 'telefono'");
    if (q.bandeja === 'admin') w.push("s.asignado_tipo = 'admin'");
    if (q.q && q.q.trim()) { const p = param(`%${q.q.trim()}%`); w.push(`(p.curp ILIKE ${p} OR CONCAT_WS(' ', p.nombres, p.apellido_paterno, p.apellido_materno) ILIKE ${p})`); }
    const limite = Math.min(Math.max(Number(q.limite) || 50, 1), 200);
    const pagina = Math.max(Number(q.pagina) || 1, 1);
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
    const total = (await pool.query(`SELECT COUNT(*)::int AS n FROM solicitud_cambio s JOIN productor p ON p.productor_id = s.productor_id ${where}`, v)).rows[0].n;
    const filas = (await pool.query(`${SELECT_LISTA} ${where} ORDER BY (s.estado = 'pendiente') DESC, s.creado_en DESC LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, v)).rows;
    const contadores = (await pool.query(
      `SELECT COUNT(*) FILTER (WHERE estado = 'pendiente' AND asignado_tipo = 'admin')::int AS por_resolver_admin,
              COUNT(*) FILTER (WHERE estado = 'pendiente' AND escalada)::int AS escaladas,
              COUNT(*) FILTER (WHERE estado = 'pendiente' AND asignado_tipo = 'tecnico')::int AS con_tecnico
         FROM solicitud_cambio`)).rows[0];
    res.json({ solicitudes: filas, total, pagina, limite, contadores });
  } catch (e) { responderErrorEdicion(res, e, 'GET admin solicitudes'); }
});

router.get('/tecnicos', ver, async (_req: AuthRequest, res: Response) => {
  try {
    res.json({
      tecnicos: (await pool.query(
        `SELECT u.id::int AS id, u.nombre_completo FROM usuarios u
          WHERE u.id IN (SELECT solicitante_id FROM solicitud_cambio
                         UNION SELECT asignado_a FROM solicitud_cambio WHERE asignado_a IS NOT NULL
                         UNION SELECT asignado_original_id FROM solicitud_cambio WHERE asignado_original_id IS NOT NULL)
          ORDER BY u.nombre_completo`)).rows,
    });
  } catch (e) { responderErrorEdicion(res, e, 'GET admin solicitudes/tecnicos'); }
});

/** Detalle con historial completo: quién pidió, a quién le tocaba, quién resolvió, cuándo y el renglón que se escribió en producer_cambios. */
router.get('/:id', ver, async (req: AuthRequest, res: Response) => {
  try {
    const id = idNum(req.params.id);
    if (!id) { res.status(400).json({ error: 'Solicitud no válida' }); return; }
    const s = (await pool.query(`${SELECT_LISTA} WHERE s.id = $1`, [id])).rows[0];
    if (!s) { res.status(404).json({ error: 'La solicitud no existe' }); return; }
    const cambio = (await pool.query(
      `SELECT pc.valor_anterior, pc.valor_nuevo, pc.creado_en, ua.nombre_completo AS aprobado_por_nombre
         FROM productor_cambios pc LEFT JOIN usuarios ua ON ua.id = pc.aprobado_por WHERE pc.solicitud_id = $1`, [id])).rows[0] || null;
    const actual = (await pool.query(
      `SELECT CASE $2 WHEN 'nombres' THEN nombres WHEN 'apellido_paterno' THEN apellido_paterno WHEN 'apellido_materno' THEN apellido_materno
                      WHEN 'sexo' THEN sexo WHEN 'fecha_nacimiento' THEN to_char(fecha_nacimiento, 'YYYY-MM-DD') WHEN 'correo' THEN correo WHEN 'telefono' THEN telefono END AS valor
         FROM productor WHERE productor_id = $1`, [s.producer_id, s.campo])).rows[0];
    res.json({ solicitud: s, cambio_aplicado: cambio, valor_ahora: actual?.valor ?? null });
  } catch (e) { responderErrorEdicion(res, e, 'GET admin solicitud'); }
});

router.post('/:id/aprobar', resolver, async (req: AuthRequest, res: Response) => {
  try {
    const id = idNum(req.params.id);
    if (!id) { res.status(400).json({ error: 'Solicitud no válida' }); return; }
    res.json({ ok: true, ...(await resolverSolicitud(id, { id: req.user!.userId, esAdmin: true }, { aprobar: true, confirmar: req.body?.confirmar === true })) });
  } catch (e) { responderErrorEdicion(res, e, 'POST admin aprobar'); }
});

router.post('/:id/rechazar', resolver, async (req: AuthRequest, res: Response) => {
  try {
    const id = idNum(req.params.id);
    if (!id) { res.status(400).json({ error: 'Solicitud no válida' }); return; }
    res.json({ ok: true, ...(await resolverSolicitud(id, { id: req.user!.userId, esAdmin: true }, { aprobar: false, motivoRechazo: req.body?.motivo })) });
  } catch (e) { responderErrorEdicion(res, e, 'POST admin rechazar'); }
});

export default router;
