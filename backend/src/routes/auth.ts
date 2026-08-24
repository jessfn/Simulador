import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database';
import { RegistroPayload, LoginPayload } from '../types';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { enviarEmailRecuperacion, smtpConfigurado } from '../utils/mailer';
import { verificarBloqueo, registrarIntentoFallido, limpiarIntentosFallidos } from '../utils/loginLockout';
import { authLimiter } from '../middleware/rateLimiters';

const router = Router();

// Validar CURP mexicano
function validarCURP(curp: string): boolean {
  const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
  return curpRegex.test(curp);
}

// Validar email
function validarEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validar teléfono (10 dígitos México)
function validarTelefono(telefono: string): boolean {
  const telRegex = /^\d{10}$/;
  return telRegex.test(telefono.replace(/[\s\-\(\)]/g, ''));
}

// Normalizar nombre: mayúsculas sin tildes
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

// =============================================
// POST /api/auth/registro
// =============================================
router.post('/registro', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, curp, nombre_completo, password, telefono, rol, state_id, municipality_id }: RegistroPayload = req.body;

    // Validaciones
    if (!email || !nombre_completo || !password || !telefono || !rol) {
      res.status(400).json({ error: 'Todos los campos son obligatorios' });
      return;
    }

    if (!validarEmail(email)) {
      res.status(400).json({ error: 'Formato de email inválido' });
      return;
    }

    const rolesConCURP = ['productor', 'supervisor'];
    let curpUpper: string | null = null;
    if (curp) {
      curpUpper = curp.toUpperCase();
      if (!validarCURP(curpUpper)) {
        res.status(400).json({ error: 'Formato de CURP inválido. Debe ser 18 caracteres alfanuméricos' });
        return;
      }
    } else if (rolesConCURP.includes(rol)) {
      res.status(400).json({ error: 'CURP obligatorio para productores y supervisores' });
      return;
    }

    const minLength = rol === 'productor' ? 4 : 6;
    if (password.length < minLength) {
      res.status(400).json({ error: `La credencial debe tener al menos ${minLength} caracteres` });
      return;
    }

    const telefonoLimpio = telefono.replace(/[\s\-\(\)]/g, '');
    if (!validarTelefono(telefonoLimpio)) {
      res.status(400).json({ error: 'El teléfono debe tener 10 dígitos' });
      return;
    }

    const rolesValidos = ['productor', 'supervisor', 'bodeguero', 'bodega', 'industria', 'responsable', 'admin'];
    if (!rolesValidos.includes(rol)) {
      res.status(400).json({ error: 'Rol no válido' });
      return;
    }

    // Verificar si ya existe
    const existente = curpUpper
      ? await pool.query(
          'SELECT id FROM usuarios WHERE email = $1 OR curp = $2',
          [email.toLowerCase().trim(), curpUpper]
        )
      : await pool.query(
          'SELECT id FROM usuarios WHERE email = $1',
          [email.toLowerCase().trim()]
        );

    if (existente.rows.length > 0) {
      res.status(409).json({ error: 'Ya existe un usuario con ese email o CURP' });
      return;
    }

    // Hash de contraseña
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Normalizar nombre
    const nombreNormalizado = normalizarNombre(nombre_completo);

    // Campos de aviso de privacidad (opcionales en registro)
    const {
      aviso_privacidad_aceptado = false,
      aviso_privacidad_fecha    = null,
      aviso_privacidad_lat      = null,
      aviso_privacidad_lng      = null,
      aviso_privacidad_version  = null,
      aviso_privacidad_foto_url = null,
    } = req.body;

    // Insertar usuario
    const result = await pool.query(
      `INSERT INTO usuarios (
         email, curp, nombre_completo, password_hash, telefono, rol, state_id, municipality_id,
         aviso_privacidad_aceptado, aviso_privacidad_fecha, aviso_privacidad_lat,
         aviso_privacidad_lng, aviso_privacidad_version, aviso_privacidad_foto_url
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, email, curp, nombre_completo, telefono, rol, state_id, municipality_id, created_at`,
      [
        email.toLowerCase().trim(), curpUpper || null, nombreNormalizado, passwordHash,
        telefonoLimpio, rol, state_id || null, municipality_id || null,
        aviso_privacidad_aceptado || false,
        aviso_privacidad_fecha    || null,
        aviso_privacidad_lat      || null,
        aviso_privacidad_lng      || null,
        aviso_privacidad_version  || null,
        aviso_privacidad_foto_url || null,
      ]
    );

    const usuario = result.rows[0];

    // Generar JWT — P-01: expira en 8h, P-02: sin fallback inseguro
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET no está definida en las variables de entorno.');
    const token = jwt.sign(
      { userId: usuario.id, email: usuario.email, rol: usuario.rol, jti: crypto.randomUUID() },
      secret,
      { expiresIn: '8h' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        curp: usuario.curp,
        nombre_completo: usuario.nombre_completo,
        telefono: usuario.telefono,
        rol: usuario.rol,
        state_id: usuario.state_id,
        municipality_id: usuario.municipality_id,
      },
    });
  } catch (error: any) {
    console.error('Error en registro:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ya existe un usuario con ese email o CURP' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/auth/login
// =============================================
router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: LoginPayload = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email y contraseña son obligatorios' });
      return;
    }

    // Buscar usuario
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND activo = true',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const usuario = result.rows[0];

    // Bloqueo por intentos fallidos
    const minutosBloqueo = await verificarBloqueo(usuario.id);
    if (minutosBloqueo !== null) {
      res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutosBloqueo} minuto(s).` });
      return;
    }

    // Verificar contraseña
    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      await registrarIntentoFallido(usuario.id);
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }
    await limpiarIntentosFallidos(usuario.id);

    // Generar JWT — P-01: expira en 8h, P-02: sin fallback inseguro
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('FATAL: JWT_SECRET no está definida en las variables de entorno.');
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        userId:            usuario.id,
        email:             usuario.email,
        rol:               usuario.rol,
        estado_asignado:   usuario.estado_asignado  ?? null,
        debe_cambiar_pass: !!usuario.debe_cambiar_pass,
        es_panel_usuario:  !!usuario.es_panel_usuario,
        jti,
      },
      secret,
      { expiresIn: '8h' }
    );

    // Actualizar último login para usuarios del panel
    if (usuario.es_panel_usuario) {
      pool.query('UPDATE usuarios SET ultimo_login=NOW() WHERE id=$1', [usuario.id]).catch(() => {});
    }

    // Sesión única por cuenta (Fase 1b, propuesta COFECE): el login más
    // reciente invalida cualquier sesión previa del mismo usuario. Se
    // excluye admin/responsable porque el panel de soporte legítimamente
    // usa varias pestañas/dispositivos a la vez.
    if (!['admin', 'responsable'].includes(usuario.rol)) {
      pool.query('UPDATE usuarios SET sesion_activa_jti=$1 WHERE id=$2', [jti, usuario.id]).catch(() => {});
    }

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id:                usuario.id,
        email:             usuario.email,
        curp:              usuario.curp,
        nombre_completo:   usuario.nombre_completo,
        telefono:          usuario.telefono,
        rol:               usuario.rol,
        state_id:          usuario.state_id,
        municipality_id:   usuario.municipality_id,
        estado_asignado:   usuario.estado_asignado  ?? null,
        debe_cambiar_pass: !!usuario.debe_cambiar_pass,
        es_panel_usuario:  !!usuario.es_panel_usuario,
      },
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/auth/logout
// Revoca el token actual server-side (denylist por jti) para que deje de
// ser aceptado de inmediato, en vez de esperar a su expiración natural.
// =============================================
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.decode(token) as { jti?: string; exp?: number } | null;

    if (decoded?.jti) {
      const expiraEn = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 8 * 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO revoked_tokens (jti, usuario_id, expira_en) VALUES ($1, $2, $3) ON CONFLICT (jti) DO NOTHING',
        [decoded.jti, req.user!.userId, expiraEn]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/auth/perfil
// =============================================
router.get('/perfil', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT id, email, curp, nombre_completo, telefono, rol, estado_asignado, ultimo_login, state_id, municipality_id, created_at FROM usuarios WHERE id = $1',
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json({ usuario: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// PATCH /api/auth/perfil — Actualizar datos del usuario
// Campos aceptados: nombre_completo, telefono, curp, state_id, municipality_id
// =============================================
const CAMPOS_PRIVILEGIADOS = ['rol', 'isAdmin', 'es_admin', 'estado_validacion', 'activo', 'es_panel_usuario', 'password_hash', 'debe_cambiar_pass', 'id'];

router.patch('/perfil', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campoNoPermitido = CAMPOS_PRIVILEGIADOS.find(c => req.body[c] !== undefined);
    if (campoNoPermitido) {
      res.status(400).json({ error: `El campo "${campoNoPermitido}" no puede modificarse desde este endpoint.` });
      return;
    }

    const { nombre_completo, email, telefono, curp, state_id, municipality_id } = req.body;
    const updates: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (email !== undefined) {
      const emailLimpio = email.toLowerCase().trim();
      if (!validarEmail(emailLimpio)) {
        res.status(400).json({ error: 'Formato de email inválido' });
        return;
      }
      const emailExistente = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id != $2',
        [emailLimpio, req.user!.userId]
      );
      if (emailExistente.rows.length > 0) {
        res.status(409).json({ error: 'Este email ya está registrado por otro usuario' });
        return;
      }
      updates.push(`email = $${idx++}`);
      vals.push(emailLimpio);
    }

    if (nombre_completo !== undefined) {
      if (typeof nombre_completo !== 'string' || nombre_completo.trim().length < 3) {
        res.status(400).json({ error: 'Nombre inválido' });
        return;
      }
      // Normalizar: mayúsculas, sin tildes
      const normalizado = nombre_completo.trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      updates.push(`nombre_completo = $${idx++}`);
      vals.push(normalizado);
    }

    if (telefono !== undefined) {
      const tel = String(telefono).replace(/[\s\-\(\)]/g, '');
      if (!/^\d{10}$/.test(tel)) {
        res.status(400).json({ error: 'El teléfono debe tener exactamente 10 dígitos' });
        return;
      }
      updates.push(`telefono = $${idx++}`);
      vals.push(tel);
    }

    if (curp !== undefined) {
      const curpLimpio = String(curp).trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
      if (!CURP_RE.test(curpLimpio)) {
        res.status(400).json({ error: 'CURP inválida. Verifica el formato (18 caracteres)' });
        return;
      }
      // Verificar que la CURP no esté en uso por otro usuario
      const curpExistente = await pool.query(
        'SELECT id FROM usuarios WHERE curp = $1 AND id != $2',
        [curpLimpio, req.user!.userId]
      );
      if (curpExistente.rows.length > 0) {
        res.status(409).json({ error: 'Esta CURP ya está registrada por otro usuario' });
        return;
      }
      updates.push(`curp = $${idx++}`);
      vals.push(curpLimpio);
    }

    if (state_id !== undefined) {
      const sid = String(state_id).trim();
      if (!sid) {
        res.status(400).json({ error: 'state_id inválido' });
        return;
      }
      // Verificar que el estado existe
      const stateCheck = await pool.query('SELECT state_id FROM geo_state WHERE state_id = $1', [sid]);
      if (stateCheck.rows.length === 0) {
        res.status(400).json({ error: 'El estado seleccionado no existe' });
        return;
      }
      updates.push(`state_id = $${idx++}`);
      vals.push(sid);
    }

    if (municipality_id !== undefined) {
      const mid = String(municipality_id).trim();
      if (!mid) {
        res.status(400).json({ error: 'municipality_id inválido' });
        return;
      }
      // Verificar que el municipio existe y pertenece al estado enviado (o al actual)
      const targetStateId = state_id ? String(state_id).trim() : null;
      const muniCheck = targetStateId
        ? await pool.query('SELECT municipality_id FROM geo_municipality WHERE municipality_id = $1 AND state_id = $2', [mid, targetStateId])
        : await pool.query('SELECT municipality_id FROM geo_municipality WHERE municipality_id = $1', [mid]);
      if (muniCheck.rows.length === 0) {
        res.status(400).json({ error: 'El municipio no existe o no corresponde al estado seleccionado' });
        return;
      }
      updates.push(`municipality_id = $${idx++}`);
      vals.push(mid);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No hay campos para actualizar' });
      return;
    }

    vals.push(req.user!.userId);
    const result = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, email, curp, nombre_completo, telefono, rol, estado_asignado, state_id, municipality_id`,
      vals
    );

    res.json({ usuario: result.rows[0], mensaje: 'Perfil actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// POST /api/auth/cambiar-password — Cambiar contraseña con verificación de actual
// =============================================
router.post('/cambiar-password', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password_actual, password_nuevo } = req.body;

    if (!password_actual || !password_nuevo) {
      res.status(400).json({ error: 'Se requiere la contraseña actual y la nueva' });
      return;
    }
    if (typeof password_nuevo !== 'string' || password_nuevo.length < 6) {
      res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
      return;
    }

    // Obtener hash actual
    const userRes = await pool.query(
      'SELECT password_hash FROM usuarios WHERE id = $1',
      [req.user!.userId]
    );
    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const ok = await bcrypt.compare(password_actual, userRes.rows[0].password_hash);
    if (!ok) {
      res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      return;
    }

    const newHash = await bcrypt.hash(password_nuevo, 12);
    await pool.query(
      'UPDATE usuarios SET password_hash=$1, debe_cambiar_pass=FALSE WHERE id=$2',
      [newHash, req.user!.userId]
    );

    res.json({ mensaje: 'Contraseña actualizada correctamente', debe_cambiar_pass: false });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/auth/states
// =============================================
router.get('/states', async (req: Request, res: Response): Promise<void> => {
  try {
    const states = await pool.query('SELECT state_id, name FROM geo_state ORDER BY name');
    res.json({ states: states.rows });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estados' });
  }
});

// =============================================
// GET /api/auth/municipalities
// =============================================
router.get('/municipalities', async (req: Request, res: Response): Promise<void> => {
  try {
    const { state_id } = req.query;
    if (!state_id) {
      res.status(400).json({ error: 'Se requiere state_id' });
      return;
    }
    const result = await pool.query(
      'SELECT municipality_id, name FROM geo_municipality WHERE state_id = $1 ORDER BY name',
      [state_id]
    );
    res.json({ municipalities: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener municipios' });
  }
});

// ─────────────────────────────────────────────────────────────────
// RECUPERACIÓN DE CONTRASEÑA (usuarios bodega/admin)
// ─────────────────────────────────────────────────────────────────

// POST /api/auth/recuperar-password
// Paso 1: ingresa email → genera token seguro, envía correo si SMTP configurado
router.post('/recuperar-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email requerido' });
      return;
    }
    const emailLimpio = email.toLowerCase().trim();

    const { rows } = await pool.query(
      `SELECT id, nombre_completo, email, rol FROM usuarios WHERE LOWER(email) = $1 AND activo = TRUE`,
      [emailLimpio]
    );

    // Respuesta genérica: no revelar si el email existe
    if (!rows.length) {
      res.json({ ok: true, smtp: smtpConfigurado() });
      return;
    }

    const user = rows[0];
    // Solo aplica para usuarios no-productores
    if (user.rol === 'productor') {
      res.json({ ok: true, smtp: smtpConfigurado() });
      return;
    }

    // Generar token seguro
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await pool.query(
      `UPDATE usuarios SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
      [tokenHash, expires, user.id]
    );

    const appUrl = process.env.APP_URL || 'https://maiz.agricultura.gob.mx';
    const resetUrl = `${appUrl}/reset-password/${token}`;

    const emailEnviado = await enviarEmailRecuperacion(user.email, user.nombre_completo || 'Usuario', resetUrl);

    res.json({
      ok: true,
      smtp: smtpConfigurado(),
      // Si no hay SMTP, devolver la URL para que el admin la comparta manualmente
      reset_url: !emailEnviado ? resetUrl : undefined,
    });
  } catch (error) {
    console.error('Error en recuperar-password:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/verificar-token-reset/:token
// Verifica que el token sea válido y no haya expirado
router.get('/verificar-token-reset/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ valido: false, error: 'Token requerido' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `SELECT id, nombre_completo, email FROM usuarios
       WHERE reset_token = $1 AND reset_token_expires > NOW() AND activo = TRUE`,
      [tokenHash]
    );

    if (!rows.length) {
      res.status(410).json({ valido: false, error: 'El enlace es inválido o ya expiró.' });
      return;
    }

    res.json({ valido: true, nombre: rows[0].nombre_completo, email: rows[0].email });
  } catch (error) {
    console.error('Error en verificar-token-reset:', error);
    res.status(500).json({ valido: false, error: 'Error interno' });
  }
});

// POST /api/auth/nuevo-password
// Paso final: guarda nueva contraseña con el token verificado
router.post('/nuevo-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ error: 'Datos incompletos' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      res.status(400).json({ error: 'La contraseña debe tener al menos 1 mayúscula y 1 número' });
      return;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `SELECT id FROM usuarios WHERE reset_token = $1 AND reset_token_expires > NOW() AND activo = TRUE`,
      [tokenHash]
    );

    if (!rows.length) {
      res.status(410).json({ error: 'El enlace es inválido o ya expiró. Solicita uno nuevo.' });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `UPDATE usuarios SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [hash, rows[0].id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Error en nuevo-password:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
