// Datos de contacto del productor: la fuente es la tabla productor; usuarios guarda una copia para su cuenta.

type Db = { query: (texto: string, valores?: unknown[]) => Promise<{ rows: any[] }> };

/** Copia teléfono, correo y nombre completo de productor a su cuenta en usuarios (si tiene cuenta). */
export async function sincronizarCuentaProductor(db: Db, productorId: number | string): Promise<void> {
  await db.query(
    `UPDATE usuarios u SET
        telefono = COALESCE(p.telefono, u.telefono),
        nombre_completo = COALESCE(NULLIF(concat_ws(' ', p.nombres, p.apellido_paterno, p.apellido_materno), ''), u.nombre_completo),
        -- el correo es único entre cuentas de la app: si ya lo usa otra cuenta, se conserva el anterior
        correo_electronico = CASE
          WHEN COALESCE(p.correo, p.correo_electronico) IS NULL THEN u.correo_electronico
          WHEN EXISTS (SELECT 1 FROM usuarios o WHERE o.id <> u.id AND o.es_panel_usuario IS NOT TRUE
                         AND o.correo_electronico = COALESCE(p.correo, p.correo_electronico)) THEN u.correo_electronico
          ELSE COALESCE(p.correo, p.correo_electronico) END,
        actualizado_en = NOW()
       FROM productor p
      WHERE p.productor_id = $1 AND u.id = p.usuario_id`,
    [productorId]
  );
}
