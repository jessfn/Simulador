import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { JwtPayload } from '../types';
import { canonicalizarEstado } from '../utils/geocode';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

function soloAdmin(req: AuthRequest, res: Response, next: Function): void {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado: se requiere rol admin' });
    return;
  }
  next();
}

function generarPassTemporal(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// Mapa de vistas disponibles y sus acciones permitidas
const VISTAS_PERMISOS: Record<string, string[]> = {
  resumen:            ['ver'],
  productores:        ['ver', 'ver_detalle', 'editar', 'eliminar', 'exportar'],
  parcelas:           ['ver', 'eliminar', 'exportar'],
  bodegas:            ['ver', 'ver_detalle', 'crear', 'editar', 'eliminar', 'exportar'],
  alertas:            ['ver', 'crear', 'eliminar'],
  precios:            ['ver', 'editar'],
  produccion:         ['ver', 'editar', 'exportar'],
  mercado:            ['ver', 'exportar'],
  senasica:           ['ver', 'crear', 'eliminar'],
  'avisos-privacidad':['ver', 'exportar'],
  chats_ayuda:        ['ver', 'responder'],
  tecnicos:           ['ver', 'ver_detalle', 'editar', 'eliminar'],
};

async function insertarPermisosDefault(usuarioId: number, vistasDefault: Record<string, string[]>) {
  for (const [vista, acciones] of Object.entries(vistasDefault)) {
    const todasLasAcciones = VISTAS_PERMISOS[vista] ?? [];
    for (const accion of todasLasAcciones) {
      const habilitado = acciones.includes(accion);
      await pool.query(
        `INSERT INTO admin_permisos (usuario_id, vista, sub_accion, habilitado)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (usuario_id, vista, sub_accion) DO UPDATE SET habilitado = $4, actualizado_en = NOW()`,
        [usuarioId, vista, accion, habilitado]
      );
    }
  }
}

async function insertarPermisosCompletos(usuarioId: number, permisosRaw: { vista: string; sub_accion: string; habilitado: boolean }[]) {
  for (const p of permisosRaw) {
    await pool.query(
      `INSERT INTO admin_permisos (usuario_id, vista, sub_accion, habilitado)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, vista, sub_accion) DO UPDATE SET habilitado = $4, actualizado_en = NOW()`,
      [usuarioId, p.vista, p.sub_accion, p.habilitado]
    );
  }
}

// ─── SSE — stream de permisos en tiempo real ───────────────────────────────

const sseClients = new Map<number, Response[]>();

function emitirPermisos(usuarioId: number, permisos: any[]) {
  const clientes = sseClients.get(usuarioId) ?? [];
  const data = JSON.stringify({ tipo: 'permisos', permisos });
  clientes.forEach(res => {
    try { res.write(`data: ${data}\n\n`); } catch { /* cliente desconectado */ }
  });
}

// GET /api/admin/permisos/stream — usuario se suscribe al iniciar sesión
// EventSource no soporta headers → acepta token como ?token= query param
router.get('/stream', (req: AuthRequest, res: Response) => {
  // Autenticar via header Bearer O ?token= query param (EventSource no soporta headers)
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }
  if (!token) { res.status(401).json({ error: 'Token requerido' }); return; }
  try {
    const secret = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' }); return;
  }

  const userId = req.user!.userId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: no buffer SSE
  res.flushHeaders();

  // Heartbeat cada 25s para mantener conexión viva
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  if (!sseClients.has(userId)) sseClients.set(userId, []);
  sseClients.get(userId)!.push(res);

  req.on('close', () => {
    clearInterval(heartbeat);
    const arr = sseClients.get(userId) ?? [];
    sseClients.set(userId, arr.filter(r => r !== res));
  });
});

// ─── Roles disponibles ─────────────────────────────────────────────────────

// GET /api/admin/permisos/roles
router.get('/roles', authMiddleware, soloAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await pool.query('SELECT * FROM roles_panel ORDER BY id');
    res.json({ roles: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

// ─── Definición de permisos por vista ─────────────────────────────────────

// GET /api/admin/permisos/vistas
router.get('/vistas', authMiddleware, soloAdmin, (_req: AuthRequest, res: Response) => {
  res.json({ vistas: VISTAS_PERMISOS });
});

// ─── CRUD Usuarios del panel ───────────────────────────────────────────────

// GET /api/admin/permisos/usuarios
router.get('/usuarios', authMiddleware, soloAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.nombre_completo, u.email, u.rol, u.activo,
              u.estado_asignado, u.debe_cambiar_pass, u.ultimo_login, u.created_at,
              rp.etiqueta AS rol_etiqueta, rp.permisos_totales, rp.aplica_filtro_estado
       FROM usuarios u
       LEFT JOIN roles_panel rp ON rp.clave = u.rol
       WHERE u.es_panel_usuario = TRUE
       ORDER BY u.created_at DESC`
    );
    res.json({ usuarios: r.rows });
  } catch (e) {
    console.error('Error al listar usuarios panel:', e);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/admin/permisos/usuarios — crear usuario con pass temporal
router.post('/usuarios', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nombre_completo, email, rol, estado_asignado, permisos, password } = req.body;

    if (!nombre_completo?.trim() || !email?.trim() || !rol?.trim()) {
      res.status(400).json({ error: 'Nombre, email y rol son obligatorios' });
      return;
    }

    const emailLower = email.toLowerCase().trim();

    // Verificar que el rol existe
    const rolRow = await pool.query('SELECT * FROM roles_panel WHERE clave = $1', [rol]);
    if (rolRow.rows.length === 0) {
      res.status(400).json({ error: `Rol '${rol}' no existe en el catálogo` });
      return;
    }
    const rolData = rolRow.rows[0];

    // Las cuentas de "app" (productor y bodega) son una categoría aparte de
    // las de panel/admin — el correo solo debe ser único DENTRO de cada
    // categoría (ver migración v43, índices únicos parciales por
    // `es_panel_usuario`), nunca entre ellas. Un productor inicia sesión con
    // CURP + NIP (nunca por correo) y una bodega con correo + contraseña,
    // pero por el mismo endpoint que el panel (`POST /api/auth/login`), que
    // ahora desambigua con el `contexto` que manda el frontend. Por eso
    // aquí solo importa si YA existe otra cuenta de PANEL con ese correo.
    const existente = await pool.query(
      'SELECT id, nombre_completo, rol, activo FROM usuarios WHERE email = $1 AND es_panel_usuario = TRUE',
      [emailLower]
    );
    const conflictoActivo = existente.rows.find(r => r.activo);
    if (conflictoActivo) {
      res.status(409).json({
        error: `Ese correo ya pertenece a una cuenta de panel administrativo activa: ` +
               `${conflictoActivo.nombre_completo || 'sin nombre'}. No se puede crear otra cuenta activa con el mismo correo.`,
        cuenta_existente: { id: conflictoActivo.id, nombre_completo: conflictoActivo.nombre_completo, rol: conflictoActivo.rol, activo: true },
      });
      return;
    }
    if (existente.rows.length > 0) {
      // Cuentas de panel INACTIVAS con el mismo correo: no bloquean, pero
      // el índice único parcial de la categoría panel sí exige que el
      // correo no se repita dentro de ella, así que se liberan
      // renombrándolas antes de insertar la cuenta nueva. Nunca se borran
      // ni se pierde su historial.
      for (const otraCuenta of existente.rows) {
        await pool.query(
          `UPDATE usuarios SET email = $1 WHERE id = $2`,
          [`${emailLower}.liberado-${otraCuenta.id}`, otraCuenta.id]
        );
      }
    }

    // Usar contraseña proporcionada o generar temporal
    const passUsada = password?.trim() ? password.trim() : generarPassTemporal();
    const hash      = await bcrypt.hash(passUsada, 12);

    // debe_cambiar_pass = true solo si se generó automáticamente (no si el admin puso una)
    const debecambiar = !password?.trim();
    // Canonicalizar estado_asignado contra geo_state para evitar variantes con mayúsculas o sin acentos
    let estadoCanon: string | null = rolData.aplica_filtro_estado ? (estado_asignado ?? null) : null;
    if (estadoCanon) {
      const c = await canonicalizarEstado(estadoCanon);
      estadoCanon = c.state_name;
    }

    const result = await pool.query(
      `INSERT INTO usuarios
         (email, nombre_completo, password_hash, rol, activo,
          es_panel_usuario, estado_asignado, debe_cambiar_pass)
       VALUES ($1, $2, $3, $4, true, true, $5, $6)
       RETURNING id, email, nombre_completo, rol, estado_asignado, created_at`,
      [emailLower, nombre_completo.trim(), hash, rol, estadoCanon, debecambiar]
    );

    const usuarioId = result.rows[0].id;

    // Insertar permisos: si se pasaron explícitamente úsalos; si no, usar vistas_default del rol
    if (Array.isArray(permisos) && permisos.length > 0) {
      await insertarPermisosCompletos(usuarioId, permisos);
    } else if (rolData.vistas_default) {
      await insertarPermisosDefault(usuarioId, rolData.vistas_default);
    }

    res.status(201).json({
      usuario:           result.rows[0],
      password_temporal: passUsada,   // solo se devuelve UNA vez
      fue_generada:      debecambiar, // true = auto-generada, false = la puso el admin
    });
  } catch (e: any) {
    console.error('Error al crear usuario panel:', e);
    if (e.code === '23505') {
      res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
      return;
    }
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PATCH /api/admin/permisos/usuarios/:id — editar datos básicos
router.patch('/usuarios/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, rol, estado_asignado, nueva_password } = req.body;

    const sets: string[] = [];
    const vals: any[]   = [];
    let n = 1;

    if (nombre_completo) { sets.push(`nombre_completo=$${n++}`); vals.push(nombre_completo.trim()); }
    if (email)           { sets.push(`email=$${n++}`);           vals.push(email.toLowerCase().trim()); }
    if (rol)             { sets.push(`rol=$${n++}`);             vals.push(rol); }
    if (estado_asignado !== undefined) {
      let estadoVal: string | null = estado_asignado || null;
      if (estadoVal) {
        const c = await canonicalizarEstado(estadoVal);
        estadoVal = c.state_name;
      }
      sets.push(`estado_asignado=$${n++}`);
      vals.push(estadoVal);
    }
    if (nueva_password?.trim()) {
      const nuevoHash = await bcrypt.hash(nueva_password.trim(), 12);
      sets.push(`password_hash=$${n++}`);
      vals.push(nuevoHash);
      sets.push(`debe_cambiar_pass=$${n++}`);
      vals.push(false);
    }

    if (sets.length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

    vals.push(id);
    const r = await pool.query(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id=$${n} AND es_panel_usuario=TRUE RETURNING id, nombre_completo, email, rol, estado_asignado`,
      vals
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json({ usuario: r.rows[0] });
  } catch (e: any) {
    if (e.code === '23505') { res.status(409).json({ error: 'Ese correo ya está en uso' }); return; }
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/admin/permisos/usuarios/:id
router.delete('/usuarios/:id', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // No permitir auto-eliminación
    if (Number(id) === req.user!.userId) {
      res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
      return;
    }
    const r = await pool.query(
      'DELETE FROM usuarios WHERE id=$1 AND es_panel_usuario=TRUE RETURNING id, nombre_completo',
      [id]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Usuario no encontrado' }); return; }
    res.json({ mensaje: `Usuario '${r.rows[0].nombre_completo}' eliminado` });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// ─── CRUD Permisos ─────────────────────────────────────────────────────────

// GET /api/admin/permisos/:userId — obtener permisos de un usuario
router.get('/:userId', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    // Solo admins o el propio usuario pueden ver sus permisos
    if (req.user?.rol !== 'admin' && req.user?.userId !== Number(userId)) {
      res.status(403).json({ error: 'Sin acceso' }); return;
    }

    // Si el usuario tiene permisos totales → devolver todo habilitado
    const usuRow = await pool.query(
      `SELECT u.rol, rp.permisos_totales FROM usuarios u
       LEFT JOIN roles_panel rp ON rp.clave = u.rol
       WHERE u.id = $1`, [userId]
    );
    if (usuRow.rows[0]?.permisos_totales) {
      const todos = Object.entries(VISTAS_PERMISOS).flatMap(([vista, acciones]) =>
        acciones.map(sub_accion => ({ vista, sub_accion, habilitado: true }))
      );
      res.json({ permisos: todos, permisos_totales: true }); return;
    }

    const r = await pool.query(
      'SELECT vista, sub_accion, habilitado FROM admin_permisos WHERE usuario_id=$1 ORDER BY vista, sub_accion',
      [userId]
    );
    res.json({ permisos: r.rows, permisos_totales: false });
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener permisos' });
  }
});

// PATCH /api/admin/permisos/:userId — upsert batch de permisos + SSE
router.patch('/:userId', authMiddleware, soloAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { permisos } = req.body; // [{ vista, sub_accion, habilitado }]

    if (!Array.isArray(permisos)) {
      res.status(400).json({ error: 'permisos debe ser un array' }); return;
    }

    await insertarPermisosCompletos(Number(userId), permisos);

    // Leer permisos actualizados
    const updated = await pool.query(
      'SELECT vista, sub_accion, habilitado FROM admin_permisos WHERE usuario_id=$1',
      [userId]
    );

    // Emitir al usuario afectado via SSE
    emitirPermisos(Number(userId), updated.rows);

    res.json({ ok: true, permisos: updated.rows });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar permisos' });
  }
});

// ─── Middleware exportable para otras rutas ────────────────────────────────

export function checkPermiso(vista: string, accion: string) {
  return async (req: AuthRequest, res: Response, next: Function): Promise<void> => {
    try {
      const rolRow = await pool.query(
        'SELECT permisos_totales FROM roles_panel WHERE clave=$1', [req.user?.rol]
      );
      if (rolRow.rows[0]?.permisos_totales) { next(); return; }

      const r = await pool.query(
        'SELECT habilitado FROM admin_permisos WHERE usuario_id=$1 AND vista=$2 AND sub_accion=$3',
        [req.user?.userId, vista, accion]
      );
      if (!r.rows[0]?.habilitado) {
        res.status(403).json({ error: 'No tienes permiso para esta acción' }); return;
      }
      next();
    } catch {
      res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

export async function estadoClause(req: AuthRequest): Promise<{ sql: string; val: string | null }> {
  try {
    const rolRow = await pool.query(
      'SELECT aplica_filtro_estado FROM roles_panel WHERE clave=$1', [req.user?.rol]
    );
    if (!rolRow.rows[0]?.aplica_filtro_estado || !req.user) return { sql: '', val: null };
    const u = await pool.query('SELECT estado_asignado FROM usuarios WHERE id=$1', [req.user.userId]);
    const estado = u.rows[0]?.estado_asignado;
    if (!estado) return { sql: '', val: null };
    return { sql: `AND UPPER(estado) = UPPER($`, val: estado };
  } catch {
    return { sql: '', val: null };
  }
}

export default router;
