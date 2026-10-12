import { Router, Response } from 'express';
import pool from '../config/database';
import { authMiddleware, requiereCapturista, AuthRequest } from '../middleware/auth';

// Módulo de registro de Frijol (técnicos ECA). Todo /api/frijol/* requiere sesión de técnico.
// Aquí viven solo las rutas de frijol; maíz no se toca.
const router = Router();
router.use(authMiddleware, requiereCapturista);

// Listas generales que usa la pantalla de frijol (catálogo `cat_catalog`).
const CATALOGOS = [
  'documento_propiedad', 'destino_frijol', 'tipo_siembra_frijol',
  'rotacion_cultivo', 'tipo_fertilizante', 'seguro_agricola',
] as const;

// Programas SADER que se muestran en la pantalla de frijol (en este orden).
const PROGRAMAS_SADER = [
  'acopio_bienestar', 'fertilizantes_bienestar', 'produccion_bienestar', 'semillas_bienestar', 'otro_sader',
];

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

export default router;
