import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, requiereCapturista, AuthRequest } from '../middleware/auth';
import { perfilProgramasDeTecnico, PROGRAMA_MAIZ, PROGRAMA_FRIJOL } from '../utils/programas';
import { ErrorEdicion, estadoDeCampos } from '../services/edicionUnica';
import {
  crearSolicitud, resolverSolicitud, cancelarSolicitud, porResolver, misSolicitudes, resumenTecnico, marcarVistas,
} from '../services/solicitudesCambio';

// T10 · Solicitudes de cambio de datos personales (lado del técnico, maíz y frijol). El lado del administrador está en admin-solicitudes.ts.
// Los datos personales no se escriben en logs ni en los mensajes de error.
const router = Router();
router.use(authMiddleware, requiereCapturista);

export function responderErrorEdicion(res: Response, error: unknown, contexto: string): void {
  if (error instanceof ErrorEdicion) {
    res.status(error.status).json({ error: error.message, codigo: error.codigo, campo: error.campo, ...(error.extra || {}) });
    return;
  }
  console.error(`Error en ${contexto}:`, (error as Error)?.message);
  res.status(500).json({ error: 'Error interno del servidor' });
}

/** Programas del técnico. Una cuenta de técnico sin ningún programa asignado cuenta como de maíz (igual que requierePrograma). */
async function programasDe(userId: number): Promise<string[]> {
  const p = (await perfilProgramasDeTecnico(userId)).programas;
  return p.length === 0 ? [PROGRAMA_MAIZ] : p;
}
const idNum = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

router.get('/resumen', async (req: AuthRequest, res: Response) => {
  try { res.json(await resumenTecnico(req.user!.userId)); } catch (e) { responderErrorEdicion(res, e, 'GET resumen'); }
});

router.get('/por-resolver', async (req: AuthRequest, res: Response) => {
  try { res.json({ solicitudes: await porResolver(req.user!.userId) }); } catch (e) { responderErrorEdicion(res, e, 'GET por-resolver'); }
});

router.get('/mias', async (req: AuthRequest, res: Response) => {
  try {
    const programa = [PROGRAMA_MAIZ, PROGRAMA_FRIJOL].includes(String(req.query.programa)) ? String(req.query.programa) : undefined;
    res.json({ solicitudes: await misSolicitudes(req.user!.userId, programa) });
  } catch (e) { responderErrorEdicion(res, e, 'GET mias'); }
});

router.post('/marcar-vistas', async (req: AuthRequest, res: Response) => {
  try { await marcarVistas(req.user!.userId); res.json({ ok: true }); } catch (e) { responderErrorEdicion(res, e, 'POST marcar-vistas'); }
});

/** Estado de edición de cada dato del productor (editable una vez / bloqueado) + solicitudes pendientes. Solo para su técnico responsable en ese programa. */
router.get('/campos/:producer_id', async (req: AuthRequest, res: Response) => {
  try {
    const producerId = idNum(req.params.producer_id);
    const programa = String(req.query.programa || '');
    if (!producerId || ![PROGRAMA_MAIZ, PROGRAMA_FRIJOL].includes(programa)) { res.status(400).json({ error: 'Faltan datos: productor y programa' }); return; }
    if (!(await programasDe(req.user!.userId)).includes(programa)) { res.status(403).json({ error: 'Tu cuenta no tiene acceso a este programa', codigo: 'SIN_PROGRAMA' }); return; }
    const resp = await pool.query('SELECT 1 FROM producer_programa WHERE producer_id = $1 AND programa = $2 AND usuario_capturista_id = $3', [producerId, programa, req.user!.userId]);
    if (resp.rows.length === 0) { res.status(403).json({ error: 'Este productor no lo registraste tú' }); return; }
    const campos = await estadoDeCampos(pool, producerId);
    const pend = await pool.query(
      `SELECT id::int AS id, campo, valor_propuesto, created_at, asignado_tipo FROM solicitud_cambio WHERE producer_id = $1 AND estado = 'pendiente' ORDER BY created_at`, [producerId]);
    const v = (await pool.query(
      `SELECT nombres, apellido_paterno, apellido_materno, sexo, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento, phone AS telefono, correo,
              usuario_id IS NOT NULL AS tiene_cuenta
         FROM producer WHERE producer_id = $1`, [producerId])).rows[0];
    res.json({ campos, pendientes: pend.rows, valores: v, tiene_cuenta: !!v?.tiene_cuenta });
  } catch (e) { responderErrorEdicion(res, e, 'GET campos'); }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const producerId = idNum(req.body?.producer_id);
    const programa = String(req.body?.programa || '');
    if (!producerId) { res.status(400).json({ error: 'Falta el productor', campo: 'producer_id' }); return; }
    if (![PROGRAMA_MAIZ, PROGRAMA_FRIJOL].includes(programa)) { res.status(400).json({ error: 'Falta el programa desde el que pides el cambio', campo: 'programa' }); return; }
    if (!(await programasDe(req.user!.userId)).includes(programa)) { res.status(403).json({ error: 'Tu cuenta no tiene acceso a este programa', codigo: 'SIN_PROGRAMA' }); return; }
    const r = await crearSolicitud({ producerId, campo: req.body?.campo, valorNuevo: req.body?.valor_nuevo, motivo: req.body?.motivo, solicitanteId: req.user!.userId, programa });
    res.status(201).json({ ok: true, ...r });
  } catch (e) { responderErrorEdicion(res, e, 'POST solicitud'); }
});

router.post('/:id/aprobar', async (req: AuthRequest, res: Response) => {
  try {
    const id = idNum(req.params.id); if (!id) { res.status(400).json({ error: 'Solicitud no válida' }); return; }
    res.json({ ok: true, ...(await resolverSolicitud(id, { id: req.user!.userId, esAdmin: false }, { aprobar: true, confirmar: req.body?.confirmar === true })) });
  } catch (e) { responderErrorEdicion(res, e, 'POST aprobar'); }
});

router.post('/:id/rechazar', async (req: AuthRequest, res: Response) => {
  try {
    const id = idNum(req.params.id); if (!id) { res.status(400).json({ error: 'Solicitud no válida' }); return; }
    res.json({ ok: true, ...(await resolverSolicitud(id, { id: req.user!.userId, esAdmin: false }, { aprobar: false, motivoRechazo: req.body?.motivo })) });
  } catch (e) { responderErrorEdicion(res, e, 'POST rechazar'); }
});

router.post('/:id/cancelar', async (req: AuthRequest, res: Response) => {
  try {
    const id = idNum(req.params.id); if (!id) { res.status(400).json({ error: 'Solicitud no válida' }); return; }
    await cancelarSolicitud(id, req.user!.userId);
    res.json({ ok: true, mensaje: 'Solicitud cancelada.' });
  } catch (e) { responderErrorEdicion(res, e, 'POST cancelar'); }
});

export default router;
