import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { checkPermiso } from './admin-permisos';
import { JwtPayload } from '../types';
import { notificar } from '../utils/notificacion';
import { generarRespuestaBot, obtenerBotUserId } from '../services/chatBotService';

const verChats = checkPermiso('chats_ayuda', 'ver');
const responderChats = checkPermiso('chats_ayuda', 'responder');

const router = Router();

const UPLOAD_DIR = process.env.NODE_ENV === 'production'
  ? '/var/www/Simulador/uploads/chat'
  : path.join(__dirname, '../../../uploads/chat');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME_PERMITIDOS = /^(image\/|audio\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats|application\/vnd\.ms-excel$)/;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!MIME_PERMITIDOS.test(file.mimetype)) return cb(new Error('Tipo de archivo no permitido'));
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

function tipoPorMime(mime: string): string {
  if (mime.startsWith('image/')) return 'imagen';
  if (mime.startsWith('audio/')) return 'audio';
  return 'archivo';
}

function rolLegible(rol: string): string {
  if (rol === 'productor') return 'Productor';
  if (rol === 'admin' || rol === 'responsable') return 'Administrador';
  return 'Bodega';
}

// ─── SSE ────────────────────────────────────────────────────────────────
// Un canal por usuario final (productor/bodeguero) y un canal compartido
// para todos los administradores conectados a la bandeja de chats.
const sseUsuario = new Map<number, Response[]>();
const sseAdmins: Response[] = [];

// Evita que el flujo automático y el botón manual "Responder con asistente
// IA" generen dos respuestas para el mismo mensaje si un admin lo presiona
// mientras el bot automático todavía está generando la suya.
const generandoRespuestaBot = new Set<number>();

function emitirAUsuario(usuarioId: number, payload: any) {
  const data = JSON.stringify(payload);
  (sseUsuario.get(usuarioId) ?? []).forEach(res => {
    try { res.write(`data: ${data}\n\n`); } catch { /* desconectado */ }
  });
}

function emitirAAdmins(payload: any) {
  const data = JSON.stringify(payload);
  sseAdmins.forEach(res => {
    try { res.write(`data: ${data}\n\n`); } catch { /* desconectado */ }
  });
}

function autenticarSSE(req: AuthRequest, res: Response): boolean {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) token = authHeader.split(' ')[1];
  else if (typeof req.query.token === 'string') token = req.query.token;
  if (!token) { res.status(401).json({ error: 'Token requerido' }); return false; }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    return true;
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return false;
  }
}

// Genera y publica una respuesta del asistente para una conversación —
// usada tanto en el flujo automático (POST /mensaje) como cuando un admin
// pide explícitamente "Responder con asistente IA" sobre un mensaje que
// nadie más contestó. Nunca lanza: siempre best-effort.
async function responderConBot(opts: {
  conversacionId: number; usuarioId: number; rolUsuario: string; mensaje: string;
}): Promise<any | null> {
  // Candado: si ya hay una respuesta en curso para esta conversación (el
  // flujo automático generándose cuando el admin presiona el botón manual,
  // o viceversa), no arrancar una segunda — evita el mensaje duplicado.
  if (generandoRespuestaBot.has(opts.conversacionId)) return null;
  generandoRespuestaBot.add(opts.conversacionId);
  try {
    const respuesta = await generarRespuestaBot({ usuarioId: opts.usuarioId, rol: opts.rolUsuario, mensaje: opts.mensaje });
    if (!respuesta) return null;
    const botUserId = await obtenerBotUserId();
    if (!botUserId) return null;

    const botMsg = await pool.query(
      `INSERT INTO chat_mensajes (conversacion_id, autor_id, autor_rol, tipo, contenido)
       VALUES ($1,$2,'bot','texto',$3) RETURNING *`,
      [opts.conversacionId, botUserId, respuesta.respuesta]
    );
    await pool.query(
      `UPDATE chat_conversaciones SET ultimo_mensaje_at = now(), no_leidos_usuario = no_leidos_usuario + 1 WHERE id = $1`,
      [opts.conversacionId]
    );
    emitirAUsuario(opts.usuarioId, { tipo: 'mensaje', conversacionId: opts.conversacionId, mensaje: botMsg.rows[0] });
    emitirAAdmins({ tipo: 'mensaje', conversacionId: opts.conversacionId, mensaje: botMsg.rows[0] });

    notificar({
      usuarioId: opts.usuarioId,
      tipo: 'chat_ayuda',
      titulo: '🤖 Asistente SIMAC',
      mensaje: respuesta.respuesta,
      referenciaId: opts.conversacionId,
      referenciaTipo: 'chat_ayuda',
      url: opts.rolUsuario === 'productor' ? '/productor?abrirChat=1' : '/dashboard?abrirChat=1',
    }).catch(() => {});

    if (respuesta.escalar) {
      const admins = await pool.query(`
        SELECT u.id FROM usuarios u JOIN roles_panel rp ON rp.clave = u.rol WHERE rp.permisos_totales = TRUE
        UNION
        SELECT ap.usuario_id AS id FROM admin_permisos ap
        WHERE ap.vista = 'chats_ayuda' AND ap.sub_accion = 'ver' AND ap.habilitado = TRUE
      `);
      for (const a of admins.rows) {
        notificar({
          usuarioId: a.id,
          tipo: 'chat_ayuda_escalado',
          titulo: '🚨 El asistente necesita ayuda humana',
          mensaje: `${rolLegible(opts.rolUsuario)} tiene una duda que el asistente no pudo resolver. Toca para tomar control.`,
          referenciaId: opts.conversacionId,
          referenciaTipo: 'chat_ayuda',
          url: `/admin/chats?conv=${opts.conversacionId}`,
        }).catch(() => {});
      }
    }
    return botMsg.rows[0];
  } catch (err) {
    console.error('[chat bot] Error en responderConBot:', err);
    return null;
  } finally {
    generandoRespuestaBot.delete(opts.conversacionId);
  }
}

function abrirSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);
  return heartbeat;
}

// ─── Lado usuario (productor / bodeguero) ─────────────────────────────────

async function obtenerOCrearConversacion(usuarioId: number, rolUsuario: string) {
  const existente = await pool.query('SELECT * FROM chat_conversaciones WHERE usuario_id = $1', [usuarioId]);
  if (existente.rows.length) return existente.rows[0];
  const creada = await pool.query(
    `INSERT INTO chat_conversaciones (usuario_id, rol_usuario) VALUES ($1, $2) RETURNING *`,
    [usuarioId, rolUsuario]
  );
  return creada.rows[0];
}

router.get('/mi-conversacion', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Solo lectura: NUNCA crea una conversación por el simple hecho de abrir
    // la app — eso llenaba la bandeja del admin con conversaciones vacías.
    // La conversación se crea únicamente al enviar el primer mensaje.
    const existente = await pool.query('SELECT * FROM chat_conversaciones WHERE usuario_id = $1', [req.user!.userId]);
    if (!existente.rows.length) {
      res.json({ conversacion: null, mensajes: [] });
      return;
    }
    const conv = existente.rows[0];
    const mensajes = await pool.query(
      'SELECT * FROM chat_mensajes WHERE conversacion_id = $1 ORDER BY created_at ASC LIMIT 200',
      [conv.id]
    );
    res.json({ conversacion: conv, mensajes: mensajes.rows });
  } catch (err) {
    console.error('GET /chat/mi-conversacion:', err);
    res.status(500).json({ error: 'Error al cargar la conversación' });
  }
});

router.post('/mensaje', authMiddleware, upload.single('archivo'), async (req: AuthRequest, res: Response) => {
  try {
    const usuarioId = req.user!.userId;
    const rolUsuario = req.user!.rol;
    const conv = await obtenerOCrearConversacion(usuarioId, rolUsuario);

    const { contenido, lat, lng, en_vivo } = req.body as { contenido?: string; lat?: string; lng?: string; en_vivo?: string };
    const archivo = (req as any).file as Express.Multer.File | undefined;

    let tipo = 'texto';
    let archivoUrl: string | null = null;
    let archivoMime: string | null = null;
    let archivoNombre: string | null = null;
    let activoHasta: string | null = null;

    if (archivo) {
      tipo = tipoPorMime(archivo.mimetype);
      archivoUrl = `/uploads/chat/${archivo.filename}`;
      archivoMime = archivo.mimetype;
      archivoNombre = archivo.originalname;
    } else if (lat && lng) {
      if (en_vivo === 'true') {
        tipo = 'ubicacion_vivo';
        activoHasta = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      } else {
        tipo = 'ubicacion';
      }
    }

    if (!archivo && !contenido?.trim() && !(lat && lng)) {
      res.status(400).json({ error: 'Mensaje vacío' });
      return;
    }

    const msg = await pool.query(
      `INSERT INTO chat_mensajes (conversacion_id, autor_id, autor_rol, tipo, contenido, archivo_url, archivo_mime, archivo_nombre, lat, lng, activo_hasta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [conv.id, usuarioId, rolUsuario, tipo, contenido?.trim() || null, archivoUrl, archivoMime, archivoNombre,
       lat ? Number(lat) : null, lng ? Number(lng) : null, activoHasta]
    );

    await pool.query(
      `UPDATE chat_conversaciones SET ultimo_mensaje_at = now(), no_leidos_admin = no_leidos_admin + 1, estatus = 'abierta' WHERE id = $1`,
      [conv.id]
    );

    emitirAAdmins({ tipo: 'mensaje', conversacionId: conv.id, mensaje: msg.rows[0] });

    // Best-effort: avisar a todos los usuarios del panel con acceso al chat
    // (permisos totales, o permiso granular 'chats_ayuda.ver' concedido en /admin/permisos).
    const admins = await pool.query(`
      SELECT u.id FROM usuarios u JOIN roles_panel rp ON rp.clave = u.rol WHERE rp.permisos_totales = TRUE
      UNION
      SELECT ap.usuario_id AS id FROM admin_permisos ap
      WHERE ap.vista = 'chats_ayuda' AND ap.sub_accion = 'ver' AND ap.habilitado = TRUE
    `);
    for (const a of admins.rows) {
      notificar({
        usuarioId: a.id,
        tipo: 'chat_ayuda',
        titulo: 'Mensaje nuevo',
        mensaje: contenido?.trim() || `Nuevo ${tipo === 'imagen' ? 'imagen' : tipo === 'audio' ? 'audio' : tipo === 'ubicacion' ? 'ubicación' : 'archivo'} recibido`,
        referenciaId: conv.id,
        referenciaTipo: 'chat_ayuda',
        url: '/admin/chats',
      }).catch(() => {});
    }

    res.json({ mensaje: msg.rows[0] });

    // Asistente automático (best-effort, nunca bloquea ni retrasa la respuesta
    // al usuario): solo para mensajes de texto de productor/bodeguero, y solo
    // si un admin no ha tomado ya la conversación (conv.bot_activo).
    if (tipo === 'texto' && contenido?.trim() && conv.bot_activo && ['productor', 'bodeguero'].includes(rolUsuario)) {
      responderConBot({ conversacionId: conv.id, usuarioId, rolUsuario, mensaje: contenido.trim() })
        .catch(err => console.error('[chat bot] Error en respuesta automática:', err));
    }
  } catch (err: any) {
    console.error('POST /chat/mensaje:', err);
    res.status(500).json({ error: err?.message || 'Error al enviar el mensaje' });
  }
});

router.patch('/mensaje/:id/ubicacion', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng } = req.body as { lat?: number; lng?: number };
    const { rows } = await pool.query(
      `UPDATE chat_mensajes SET lat = $1, lng = $2 WHERE id = $3 AND autor_id = $4 AND tipo = 'ubicacion_vivo' AND activo_hasta > now()
       RETURNING id, conversacion_id`,
      [lat, lng, req.params.id, req.user!.userId]
    );
    if (rows.length) {
      emitirAAdmins({ tipo: 'ubicacion', mensajeId: rows[0].id, conversacionId: rows[0].conversacion_id, lat, lng });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al actualizar la ubicación' });
  }
});

router.patch('/mensaje/:id/detener', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `UPDATE chat_mensajes SET activo_hasta = now() WHERE id = $1 AND autor_id = $2 AND tipo = 'ubicacion_vivo'
       RETURNING id, conversacion_id`,
      [req.params.id, req.user!.userId]
    );
    if (rows.length) {
      emitirAAdmins({ tipo: 'ubicacion-fin', mensajeId: rows[0].id, conversacionId: rows[0].conversacion_id });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al detener la ubicación' });
  }
});

router.post('/escribiendo', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const conv = await pool.query('SELECT id FROM chat_conversaciones WHERE usuario_id = $1', [req.user!.userId]);
    if (conv.rows.length) {
      emitirAAdmins({ tipo: 'escribiendo', conversacionId: conv.rows[0].id });
    }
    res.json({ ok: true });
  } catch {
    res.status(200).json({ ok: true }); // best-effort, nunca bloquea el input
  }
});

router.patch('/leido', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `UPDATE chat_conversaciones SET no_leidos_usuario = 0, usuario_leido_hasta = now()
       WHERE usuario_id = $1 RETURNING id, usuario_leido_hasta`,
      [req.user!.userId]
    );
    if (rows.length) {
      emitirAAdmins({ tipo: 'leido', conversacionId: rows[0].id, usuario_leido_hasta: rows[0].usuario_leido_hasta });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al marcar como leído' });
  }
});

router.get('/stream', (req: AuthRequest, res: Response) => {
  if (!autenticarSSE(req, res)) return;
  const usuarioId = req.user!.userId;
  const heartbeat = abrirSSE(res);
  if (!sseUsuario.has(usuarioId)) sseUsuario.set(usuarioId, []);
  sseUsuario.get(usuarioId)!.push(res);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseUsuario.set(usuarioId, (sseUsuario.get(usuarioId) ?? []).filter(r => r !== res));
  });
});

export default router;

// ─── Lado administrador — montado por separado en index.ts bajo /api/admin/chats ──
export const adminChatRouter = Router();

adminChatRouter.get('/', authMiddleware, verChats, async (_req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, u.nombre_completo, u.email, u.telefono, u.curp,
             (SELECT contenido FROM chat_mensajes m WHERE m.conversacion_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS ultimo_contenido,
             (SELECT tipo FROM chat_mensajes m WHERE m.conversacion_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS ultimo_tipo
      FROM chat_conversaciones c
      JOIN usuarios u ON u.id = c.usuario_id
      ORDER BY c.ultimo_mensaje_at DESC
    `);
    res.json({ conversaciones: rows.map(r => ({ ...r, rol_legible: rolLegible(r.rol_usuario) })) });
  } catch (err) {
    console.error('GET /admin/chats:', err);
    res.status(500).json({ error: 'Error al cargar las conversaciones' });
  }
});

adminChatRouter.get('/:id/mensajes', authMiddleware, verChats, async (req: AuthRequest, res: Response) => {
  try {
    const [mensajes, conv] = await Promise.all([
      pool.query('SELECT * FROM chat_mensajes WHERE conversacion_id = $1 ORDER BY created_at ASC LIMIT 300', [req.params.id]),
      pool.query('SELECT id, usuario_leido_hasta, admin_leido_hasta FROM chat_conversaciones WHERE id = $1', [req.params.id]),
    ]);
    res.json({ mensajes: mensajes.rows, conversacion: conv.rows[0] || null });
  } catch {
    res.status(500).json({ error: 'Error al cargar los mensajes' });
  }
});

adminChatRouter.post('/:id/mensaje', authMiddleware, responderChats, upload.single('archivo'), async (req: AuthRequest, res: Response) => {
  try {
    const convId = Number(req.params.id);
    const conv = await pool.query('SELECT * FROM chat_conversaciones WHERE id = $1', [convId]);
    if (!conv.rows.length) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    const { contenido, lat, lng } = req.body as { contenido?: string; lat?: string; lng?: string };
    const archivo = (req as any).file as Express.Multer.File | undefined;

    let tipo = 'texto';
    let archivoUrl: string | null = null;
    let archivoMime: string | null = null;
    let archivoNombre: string | null = null;

    if (archivo) {
      tipo = tipoPorMime(archivo.mimetype);
      archivoUrl = `/uploads/chat/${archivo.filename}`;
      archivoMime = archivo.mimetype;
      archivoNombre = archivo.originalname;
    } else if (lat && lng) {
      tipo = 'ubicacion';
    }

    if (!archivo && !contenido?.trim() && !(lat && lng)) {
      res.status(400).json({ error: 'Mensaje vacío' });
      return;
    }

    const msg = await pool.query(
      `INSERT INTO chat_mensajes (conversacion_id, autor_id, autor_rol, tipo, contenido, archivo_url, archivo_mime, archivo_nombre, lat, lng)
       VALUES ($1,$2,'admin',$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [convId, req.user!.userId, tipo, contenido?.trim() || null, archivoUrl, archivoMime, archivoNombre,
       lat ? Number(lat) : null, lng ? Number(lng) : null]
    );

    await pool.query(
      `UPDATE chat_conversaciones SET ultimo_mensaje_at = now(), no_leidos_usuario = no_leidos_usuario + 1, bot_activo = FALSE WHERE id = $1`,
      [convId]
    );

    emitirAUsuario(conv.rows[0].usuario_id, { tipo: 'mensaje', conversacionId: convId, mensaje: msg.rows[0] });
    emitirAAdmins({ tipo: 'mensaje', conversacionId: convId, mensaje: msg.rows[0] });

    notificar({
      usuarioId: conv.rows[0].usuario_id,
      tipo: 'chat_ayuda',
      titulo: 'Mensaje nuevo',
      mensaje: contenido?.trim() || 'Tienes una nueva respuesta del equipo de soporte',
      referenciaId: convId,
      referenciaTipo: 'chat_ayuda',
      url: conv.rows[0].rol_usuario === 'productor' ? '/productor?abrirChat=1' : '/dashboard?abrirChat=1',
    }).catch(() => {});

    res.json({ mensaje: msg.rows[0] });
  } catch (err: any) {
    console.error('POST /admin/chats/:id/mensaje:', err);
    res.status(500).json({ error: err?.message || 'Error al enviar el mensaje' });
  }
});

adminChatRouter.post('/:id/escribiendo', authMiddleware, responderChats, async (req: AuthRequest, res: Response) => {
  try {
    const conv = await pool.query('SELECT usuario_id FROM chat_conversaciones WHERE id = $1', [req.params.id]);
    if (conv.rows.length) {
      emitirAUsuario(conv.rows[0].usuario_id, { tipo: 'escribiendo' });
    }
    res.json({ ok: true });
  } catch {
    res.status(200).json({ ok: true });
  }
});

adminChatRouter.patch('/:id/leido', authMiddleware, verChats, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `UPDATE chat_conversaciones SET no_leidos_admin = 0, admin_leido_hasta = now()
       WHERE id = $1 RETURNING usuario_id, admin_leido_hasta`,
      [req.params.id]
    );
    if (rows.length) {
      emitirAUsuario(rows[0].usuario_id, {
        tipo: 'leido', conversacionId: Number(req.params.id), admin_leido_hasta: rows[0].admin_leido_hasta,
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al marcar como leído' });
  }
});

// El admin puede apagar el asistente automático sin necesidad de mandar un
// mensaje primero — útil cuando ve que el bot está atendiendo y quiere
// intervenir de inmediato.
adminChatRouter.patch('/:id/tomar-control', authMiddleware, responderChats, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `UPDATE chat_conversaciones SET bot_activo = FALSE WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }
    emitirAAdmins({ tipo: 'control-tomado', conversacionId: Number(req.params.id) });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al tomar control de la conversación' });
  }
});

// El admin pide explícitamente que el asistente conteste un mensaje que
// nadie más respondió — para cuando nadie alcanzó a contestar y no hace
// falta escribir a mano. Funciona sin importar si bot_activo está apagado
// (es una acción manual, no reactiva el flujo automático).
adminChatRouter.post('/:id/responder-con-ia', authMiddleware, responderChats, async (req: AuthRequest, res: Response) => {
  try {
    const convId = Number(req.params.id);
    const conv = await pool.query('SELECT * FROM chat_conversaciones WHERE id = $1', [convId]);
    if (!conv.rows.length) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }
    if (!['productor', 'bodeguero'].includes(conv.rows[0].rol_usuario)) {
      res.status(400).json({ error: 'El asistente solo puede responder a productores o bodegas' });
      return;
    }

    const ultimo = await pool.query(
      `SELECT * FROM chat_mensajes WHERE conversacion_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [convId]
    );
    const ultimoMsg = ultimo.rows[0];
    if (!ultimoMsg || ultimoMsg.autor_id !== conv.rows[0].usuario_id) {
      res.status(400).json({ error: 'No hay ningún mensaje pendiente de responder en esta conversación' });
      return;
    }
    if (ultimoMsg.tipo !== 'texto' || !ultimoMsg.contenido?.trim()) {
      res.status(400).json({ error: 'El asistente solo puede responder mensajes de texto' });
      return;
    }

    const botMsg = await responderConBot({
      conversacionId: convId,
      usuarioId: conv.rows[0].usuario_id,
      rolUsuario: conv.rows[0].rol_usuario,
      mensaje: ultimoMsg.contenido.trim(),
    });
    if (!botMsg) {
      res.status(502).json({ error: 'El asistente no pudo generar una respuesta. Intenta de nuevo o responde manualmente.' });
      return;
    }
    res.json({ mensaje: botMsg });
  } catch (err: any) {
    console.error('POST /admin/chats/:id/responder-con-ia:', err);
    res.status(500).json({ error: err?.message || 'Error al pedir la respuesta del asistente' });
  }
});

adminChatRouter.patch('/:id/resolver', authMiddleware, responderChats, async (req: AuthRequest, res: Response) => {
  try {
    const { estatus } = req.body as { estatus?: string };
    const nuevoEstatus = estatus === 'abierta' ? 'abierta' : 'resuelta';
    // Al resolver, se reactiva el asistente automático para el próximo mensaje
    // del usuario — es un ciclo nuevo, no una conversación en curso con un admin.
    await pool.query(
      `UPDATE chat_conversaciones SET estatus = $2, bot_activo = $3 WHERE id = $1`,
      [req.params.id, nuevoEstatus, nuevoEstatus === 'resuelta']
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error al actualizar el estatus' });
  }
});

// El admin borra un mensaje suyo o del bot cuando hubo un error (respuesta
// equivocada, mensaje mal enviado, etc.) — se elimina de verdad de la
// conversación, no solo de su vista: se avisa al usuario y a los demás
// admins conectados por SSE para que también desaparezca de sus pantallas.
// Nunca deja borrar mensajes del propio usuario (dueño de la conversación).
adminChatRouter.delete('/:id/mensaje/:mensajeId', authMiddleware, responderChats, async (req: AuthRequest, res: Response) => {
  try {
    const convId = Number(req.params.id);
    const mensajeId = Number(req.params.mensajeId);

    const conv = await pool.query('SELECT usuario_id FROM chat_conversaciones WHERE id = $1', [convId]);
    if (!conv.rows.length) { res.status(404).json({ error: 'Conversación no encontrada' }); return; }

    const result = await pool.query(
      `DELETE FROM chat_mensajes
       WHERE id = $1 AND conversacion_id = $2 AND autor_rol IN ('admin', 'bot')
       RETURNING id`,
      [mensajeId, convId]
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Mensaje no encontrado o no se puede eliminar (solo se pueden borrar mensajes del admin o del asistente)' });
      return;
    }

    const payload = { tipo: 'mensaje-eliminado', conversacionId: convId, mensajeId };
    emitirAUsuario(conv.rows[0].usuario_id, payload);
    emitirAAdmins(payload);

    res.json({ ok: true });
  } catch (err: any) {
    console.error('DELETE /admin/chats/:id/mensaje/:mensajeId:', err);
    res.status(500).json({ error: err?.message || 'Error al eliminar el mensaje' });
  }
});

adminChatRouter.get('/stream', async (req: AuthRequest, res: Response) => {
  if (!autenticarSSE(req, res)) return;
  try {
    const rolRow = await pool.query('SELECT permisos_totales FROM roles_panel WHERE clave = $1', [req.user!.rol]);
    if (!rolRow.rows[0]?.permisos_totales) {
      const permRow = await pool.query(
        `SELECT habilitado FROM admin_permisos WHERE usuario_id = $1 AND vista = 'chats_ayuda' AND sub_accion = 'ver'`,
        [req.user!.userId]
      );
      if (!permRow.rows[0]?.habilitado) { res.status(403).json({ error: 'Acceso denegado' }); return; }
    }
  } catch {
    res.status(500).json({ error: 'Error verificando permisos' }); return;
  }
  const heartbeat = abrirSSE(res);
  sseAdmins.push(res);
  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseAdmins.indexOf(res);
    if (idx >= 0) sseAdmins.splice(idx, 1);
  });
});
