// Datos de contacto del productor: la fuente es la tabla productor; usuarios guarda una copia para su cuenta.

type ConexionBd = { query: (texto: string, valores?: unknown[]) => Promise<{ rows: any[] }> };

/** Copia teléfono, correo y nombre completo de productor a su cuenta en usuarios (si tiene cuenta). */
export async function sincronizarCuentaProductor(conexion: ConexionBd, productorId: number | string): Promise<void> {
  await conexion.query(
    `UPDATE usuarios cuenta SET
        telefono = COALESCE(ficha.telefono, cuenta.telefono),
        nombre_completo = COALESCE(NULLIF(concat_ws(' ', ficha.nombres, ficha.apellido_paterno, ficha.apellido_materno), ''), cuenta.nombre_completo),
        -- el correo es único entre cuentas de la app: si ya lo usa otra cuenta, se conserva el anterior
        correo_electronico = CASE
          WHEN COALESCE(ficha.correo, ficha.correo_electronico) IS NULL THEN cuenta.correo_electronico
          WHEN EXISTS (SELECT 1 FROM usuarios otra_cuenta
                        WHERE otra_cuenta.id <> cuenta.id AND otra_cuenta.es_panel_usuario IS NOT TRUE
                          AND otra_cuenta.correo_electronico = COALESCE(ficha.correo, ficha.correo_electronico)) THEN cuenta.correo_electronico
          ELSE COALESCE(ficha.correo, ficha.correo_electronico) END,
        actualizado_en = NOW()
       FROM productor ficha
      WHERE ficha.productor_id = $1 AND cuenta.id = ficha.usuario_id`,
    [productorId]
  );
}
