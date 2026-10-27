import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

function validarCURP(curp: string): boolean {
  const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
  return curpRegex.test(curp);
}

// =============================================
// POST /api/producers - Alta de productor
// =============================================
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      nombres,
      apellido_paterno,
      apellido_materno,
      curp,
      sexo,
      telefono,
      correo_electronico,
      state_id,
      municipality_id,
      localidad,
      observaciones,
      consentimiento_recabado,
      phone,
      privacy_consent,
    } = req.body;

    if (!curp || typeof curp !== 'string' || curp.length !== 18) {
      res.status(400).json({ error: 'CURP debe tener exactamente 18 caracteres' });
      return;
    }

    const curpUpper = curp.toUpperCase().trim();
    if (!validarCURP(curpUpper)) {
      res.status(400).json({ error: 'Formato de CURP inválido' });
      return;
    }

    const hasStep1Data = nombres !== undefined || apellido_paterno !== undefined || apellido_materno !== undefined || sexo !== undefined || telefono !== undefined || correo_electronico !== undefined || state_id !== undefined || municipality_id !== undefined || localidad !== undefined || observaciones !== undefined || consentimiento_recabado !== undefined;

    if (hasStep1Data) {
      if (!nombres?.trim() || !apellido_paterno?.trim() || !apellido_materno?.trim()) {
        res.status(400).json({ error: 'Nombre completo es obligatorio' });
        return;
      }

      if (!sexo || typeof sexo !== 'string') {
        res.status(400).json({ error: 'Sexo es obligatorio' });
        return;
      }

      if (!telefono || !/^[0-9]{10}$/.test(String(telefono))) {
        res.status(400).json({ error: 'Teléfono debe tener 10 dígitos' });
        return;
      }

      if (!state_id || !municipality_id) {
        res.status(400).json({ error: 'Estado y municipio son obligatorios' });
        return;
      }

      if (!localidad?.trim()) {
        res.status(400).json({ error: 'Localidad es obligatoria' });
        return;
      }

      if (consentimiento_recabado !== true) {
        res.status(400).json({ error: 'Debe aceptar el aviso de privacidad' });
        return;
      }

      const values = [
        nombres.trim(),
        apellido_paterno.trim(),
        apellido_materno.trim(),
        sexo.trim(),
        telefono.trim(),
        correo_electronico?.trim() || null,
        state_id,
        municipality_id,
        localidad.trim(),
        observaciones?.trim() || null,
        consentimiento_recabado,
        req.user!.userId,
        curpUpper,
      ];

      const existing = await pool.query('SELECT productor_id FROM productor WHERE curp = $1', [curpUpper]);
      if (existing.rows.length > 0) {
        const result = await pool.query(
          `UPDATE productor SET
             nombres = $1,
             apellido_paterno = $2,
             apellido_materno = $3,
             sexo = $4,
             telefono = $5,
             correo_electronico = $6,
             estado_id = $7,
             municipio_id = $8,
             localidad = $9,
             observaciones = $10,
             consentimiento_privacidad = $11,
             usuario_id = $12,
             estatus_registro = 'completo',
             fecha_captura = COALESCE(fecha_captura, CURRENT_TIMESTAMP)
           WHERE curp = $13
           RETURNING productor_id, curp, nombres, apellido_paterno, apellido_materno, sexo, telefono AS telefono,
                     correo_electronico, estado_id, municipio_id, localidad, observaciones,
                     consentimiento_privacidad, usuario_id, tecnico_asignado_id, usuario_capturista_id,
                     estatus_registro, fecha_captura, creado_en`,
          values
        );

        res.json({ producer: result.rows[0], message: 'Productor actualizado' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO productor (
           curp, nombres, apellido_paterno, apellido_materno, sexo, telefono,
           correo_electronico, estado_id, municipio_id, localidad, observaciones,
           consentimiento_privacidad, usuario_id, estatus_registro
         )
         VALUES ($13, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completo')
         RETURNING productor_id, curp, nombres, apellido_paterno, apellido_materno, sexo, telefono AS telefono,
                   correo_electronico, estado_id, municipio_id, localidad, observaciones,
                   consentimiento_privacidad, usuario_id, tecnico_asignado_id, usuario_capturista_id,
                   estatus_registro, fecha_captura, creado_en`,
        values
      );

      res.status(201).json({ producer: result.rows[0], message: 'Productor registrado exitosamente' });
      return;
    }

    // Legacy minimal registration flow for old ProductorUPView / producers.crear
    if (privacy_consent !== true) {
      res.status(400).json({ error: 'Debe aceptar el aviso de privacidad' });
      return;
    }

    const existing = await pool.query('SELECT productor_id FROM productor WHERE curp = $1', [curpUpper]);
    if (existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE productor SET
           telefono = $1,
           consentimiento_privacidad = $2,
           usuario_id = $3
         WHERE curp = $4
         RETURNING productor_id, curp, nombres, apellido_paterno, apellido_materno, sexo, telefono AS telefono,
                   correo_electronico, estado_id, municipio_id, localidad, observaciones,
                   consentimiento_privacidad, usuario_id, tecnico_asignado_id, usuario_capturista_id,
                   estatus_registro, fecha_captura, creado_en`,
        [phone || null, privacy_consent, req.user!.userId, curpUpper]
      );

      res.json({ producer: result.rows[0], message: 'Productor actualizado' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO productor (curp, telefono, consentimiento_privacidad, usuario_id)
       VALUES ($1, $2, $3, $4)
       RETURNING productor_id, curp, nombres, apellido_paterno, apellido_materno, sexo, telefono AS telefono,
                 correo_electronico, estado_id, municipio_id, localidad, observaciones,
                 consentimiento_privacidad, usuario_id, tecnico_asignado_id, usuario_capturista_id,
                 estatus_registro, fecha_captura, creado_en`,
      [curpUpper, phone || null, privacy_consent, req.user!.userId]
    );

    res.status(201).json({ producer: result.rows[0], message: 'Productor registrado exitosamente' });
  } catch (error: any) {
    console.error('Error creando productor:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Ya existe un productor con ese CURP' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =============================================
// GET /api/producers/:curp - Consultar productor por CURP
// =============================================
router.get('/:curp', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const curp = req.params.curp.toUpperCase().trim();
    const result = await pool.query(
      `SELECT productor_id, curp, nombres, apellido_paterno, apellido_materno, sexo, telefono AS telefono,
              correo_electronico, estado_id, municipio_id, localidad, observaciones,
              consentimiento_privacidad, usuario_id, tecnico_asignado_id, usuario_capturista_id,
              estatus_registro, fecha_captura, creado_en
       FROM productor WHERE curp = $1`,
      [curp]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Productor no encontrado' });
      return;
    }

    res.json({ producer: result.rows[0] });
  } catch (error) {
    console.error('Error consultando productor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
