/**
 * Importar alertas SENASICA desde CSV
 * Ejecutar: npx ts-node scripts/importar-alertas-senasica.ts <ruta-al-csv>
 *
 * Formato CSV esperado (§14 del doc técnico):
 * id_alerta,tipo_alerta,subtipo,nivel_riesgo,descripcion,recomendacion,
 * cultivo_afectado,latitud,longitud,radio_afectacion_km,estado,municipio,
 * fecha_deteccion,fecha_vigencia,fuente
 */

import fs from 'fs';
import path from 'path';
import pool from '../src/config/database';

interface AlertaCSV {
  id_alerta: string;
  tipo_alerta: string;
  subtipo: string;
  nivel_riesgo: string;
  descripcion: string;
  recomendacion: string;
  cultivo_afectado: string;
  latitud: string;
  longitud: string;
  radio_afectacion_km: string;
  estado: string;
  municipio: string;
  fecha_deteccion: string;
  fecha_vigencia: string;
  fuente: string;
}

function parsearCSV(filePath: string): AlertaCSV[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj as unknown as AlertaCSV;
  });
}

async function importarAlertas(filePath: string) {
  const alertas = parsearCSV(filePath);
  console.log(`Procesando ${alertas.length} alertas desde ${filePath}...`);

  let insertadas = 0;
  let omitidas = 0;

  for (const a of alertas) {
    // 1. Insertar alerta
    const { rows } = await pool.query(`
      INSERT INTO alertas_externas (
        tipo_alerta, subtipo, nivel_riesgo, descripcion, recomendacion,
        cultivo_afectado, coordenada, radio_km, estado, municipio,
        fecha_deteccion, fecha_vigencia, fuente, id_alerta_origen)
      VALUES ($1,$2,$3,$4,$5,$6,
              ST_SetSRID(ST_MakePoint($7,$8), 4326),
              $9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id_alerta_origen) DO NOTHING
      RETURNING id`,
      [a.tipo_alerta, a.subtipo, a.nivel_riesgo, a.descripcion, a.recomendacion,
       a.cultivo_afectado, parseFloat(a.longitud), parseFloat(a.latitud),
       parseInt(a.radio_afectacion_km),
       a.estado, a.municipio, a.fecha_deteccion,
       a.fecha_vigencia || null, a.fuente, a.id_alerta]
    );

    if (!rows.length) { omitidas++; continue; }
    const alertaId = rows[0].id;
    insertadas++;

    // 2. Calcular qué UPs están dentro del radio
    const upsAfectadas = await pool.query(`
      SELECT u.id AS up_id, p.usuario_id,
             ST_Distance(u.centroide::geography, ae.coordenada::geography) / 1000 AS distancia_km
      FROM up u
      JOIN productor p ON p.id = u.productor_id
      JOIN alertas_externas ae ON ae.id = $1
      WHERE u.centroide IS NOT NULL
        AND ST_DWithin(
              u.centroide::geography,
              ae.coordenada::geography,
              ae.radio_km * 1000
            )
        AND ($2 = 'todos' OR EXISTS (
              SELECT 1 FROM ciclo_cultivo cc
              WHERE cc.up_id = u.id AND cc.cultivo ILIKE '%' || $2 || '%'
            ))`,
      [alertaId, a.cultivo_afectado]
    );

    // 3. Insertar intersecciones y notificaciones
    for (const up of upsAfectadas.rows) {
      await pool.query(`
        INSERT INTO alertas_up (alerta_id, up_id, distancia_km)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [alertaId, up.up_id, up.distancia_km]
      );

      if (up.usuario_id) {
        await pool.query(`
          INSERT INTO notificaciones (usuario_id, tipo, mensaje, alerta_id)
          VALUES ($1, $2, $3, $4)`,
          [up.usuario_id,
           a.tipo_alerta === 'fitosanitaria' ? 'alerta_sanitaria' : 'alerta_climatica',
           `⚠ ${a.subtipo} detectado en tu zona. ${a.recomendacion}`,
           alertaId]
        );
      }
    }

    console.log(`  ✓ ${a.id_alerta}: ${upsAfectadas.rows.length} UPs afectadas`);
  }

  console.log(`\nResumen: ${insertadas} insertadas, ${omitidas} duplicadas/omitidas`);
}

// Ejecutar
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Uso: npx ts-node scripts/importar-alertas-senasica.ts <ruta-al-csv>');
  process.exit(1);
}

importarAlertas(path.resolve(csvPath))
  .then(() => { console.log('Importación completada'); process.exit(0); })
  .catch(err => { console.error('Error:', err); process.exit(1); });
