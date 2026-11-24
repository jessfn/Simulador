/**
 * Crea usuarios de prueba en la base LOCAL de desarrollo (contenedor simac-db).
 * Si el usuario ya existe, solo restablece su contraseña o NIP
 * y desbloquea la cuenta.
 *
 * Usuarios de panel, bodega y técnicos (correo + contraseña):
 *   admin, bodeguero, capturista (técnico de maíz) y técnico de frijol.
 *   Contraseña: DEV_USUARIOS_PASSWORD de backend/.env, o una al azar si no
 *   está definida.
 *
 * Productores (CURP + NIP de 4 dígitos). Se crean directo en la base porque
 * sin RENAPO/SADER el registro desde la app se bloquea. CURPs inventadas con
 * formato válido; no corresponden a ninguna persona. NIP: DEV_PRODUCTOR_NIP de
 * backend/.env, o uno al azar si no está definido.
 *
 */
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

if (!['localhost', '127.0.0.1'].includes(process.env.DB_HOST) || process.env.DB_NAME !== 'bodegas') {
  console.error('Abortado: este script solo corre contra la base local (DB_HOST=localhost, DB_NAME=bodegas).');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const passwordFija = (process.env.DEV_USUARIOS_PASSWORD || '').trim();
if (passwordFija && passwordFija.length < 8) {
  console.error('Abortado: DEV_USUARIOS_PASSWORD debe tener al menos 8 caracteres.');
  process.exit(1);
}
const PASSWORD = passwordFija || crypto.randomBytes(9).toString('base64url');

const nipFijo = (process.env.DEV_PRODUCTOR_NIP || '').trim();
if (nipFijo && !/^\d{4}$/.test(nipFijo)) {
  console.error('Abortado: DEV_PRODUCTOR_NIP debe ser de 4 dígitos.');
  process.exit(1);
}
const NIP = nipFijo || String(crypto.randomInt(0, 10000)).padStart(4, '0');

// Un técnico sin programa asignado cuenta como de maíz (middleware/programa.ts).
// El de frijol se crea como en el alta desde el panel: programa, tipo de técnico y zona de operación.
const USUARIOS = [
  { email: 'admin@simac.local',          nombre: 'Admin Desarrollo',          rol: 'admin',      panel: true  },
  { email: 'bodeguero@simac.local',      nombre: 'Bodeguero Desarrollo',      rol: 'bodeguero',  panel: false },
  { email: 'capturista@simac.local',     nombre: 'Tecnico Desarrollo',        rol: 'capturista', panel: false },
  { email: 'tecnico.frijol@simac.local', nombre: 'Tecnico Frijol Desarrollo', rol: 'capturista', panel: false,
    programa: 'frijol_afb', tipoTecnico: 'eca_productivo', zonaEstadoIds: ['10', '32'] }, // Durango y Zacatecas
];

// Parcela de prueba: cuadro de ~2.7 ha en Tepatitlán de Morelos, Jalisco.
// Fuera de Sinaloa a propósito (ahí el registro exige la encuesta de insumos).
const PARCELA = {
  nombre: 'Parcela de prueba',
  estado: 'Jalisco', estado_id: '14',
  municipio: 'Tepatitlán de Morelos', municipio_id: '14093',
  lat: 20.8100, lng: -102.7600, lado: 0.0015,
};

const PRODUCTORES = [
  { curp: 'PRUE800101MJCRRS02', nombres: 'PRODUCTORA', paterno: 'NUEVA', materno: 'DESARROLLO',
    telefono: '5500000002', sexo: 'M', completo: false },
  { curp: 'PRUE800101HJCRRS01', nombres: 'PRODUCTOR', paterno: 'COMPLETO', materno: 'DESARROLLO',
    telefono: '5500000001', sexo: 'H', completo: true },
];

async function crearParcelaYCiclo(client, productorId) {
  const { lat, lng, lado: d } = PARCELA;
  const geojson = JSON.stringify({
    type: 'Polygon',
    coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]],
  });
  const up = await client.query(
    `INSERT INTO up
       (productor_id, nombre_up, tipo_up, sistema_produccion, regimen_hidrico,
        nombre_estado, nombre_municipio, estado_id, municipio_id, centroide, geometria,
        superficie_ha_calculada, ubicacion_confirmada, origen_centroide)
     VALUES ($1, $2, 'temporal', 'tradicional', 'temporal',
             $3, $4, $5, $6,
             ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326)),
             ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326)),
             ROUND((ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326)::geography) / 10000.0)::numeric, 4),
             TRUE, 'productor')
     RETURNING up_id, superficie_ha_calculada`,
    [productorId, PARCELA.nombre, PARCELA.estado, PARCELA.municipio,
     PARCELA.estado_id, PARCELA.municipio_id, geojson]
  );
  const { up_id: upId, superficie_ha_calculada: areaHa } = up.rows[0];

  const variedad = await client.query(
    `SELECT codigo FROM cat_variedad_cultivo
     WHERE cultivo = 'maiz' AND codigo NOT IN ('OTRA', 'CRIOLLO_LOCAL') AND COALESCE(activo, true)
     ORDER BY orden LIMIT 1`
  );
  if (!variedad.rows.length) throw new Error('No hay variedades de maíz en cat_variedad_cultivo.');

  const anio = new Date().getFullYear();
  const ciclo = await client.query(
    `INSERT INTO ciclo (up_id, anio_ciclo, tipo_ciclo, tipo_riego, estado_ciclo)
     VALUES ($1, $2, 'PV', 'temporal', 'activo') RETURNING ciclo_id`,
    [upId, anio]
  );
  await client.query(
    `INSERT INTO ciclo_cultivo
       (ciclo_id, cultivo, variedad_id, superficie_sembrada_ha, fecha_siembra,
        superficie_cosechada_ha, destino, cantidad_producida, unidad_medida_produccion)
     VALUES ($1, 'maiz', $2, $3, $4, 0, 'venta_local', 0, 'ton')`,
    [ciclo.rows[0].ciclo_id, variedad.rows[0].codigo, Math.min(2, Number(areaHa)), `${anio}-06-15`]
  );
}

async function crearProductor(client, p, nipHash) {
  const nombreCompleto = `${p.nombres} ${p.paterno} ${p.materno}`;

  // NIP solo cifrado: pin_texto se deja vacío a propósito.
  const u = await client.query(
    `INSERT INTO usuarios (curp, nombre_completo, hash_contrasena, rol, telefono, activo)
     VALUES ($1, $2, $3, 'productor', $4, true)
     ON CONFLICT (curp) WHERE curp IS NOT NULL AND curp::text <> ''
     DO UPDATE SET hash_contrasena = EXCLUDED.hash_contrasena, activo = true,
       intentos_fallidos = 0, bloqueado_hasta = NULL
     RETURNING id`,
    [p.curp, nombreCompleto, nipHash, p.telefono]
  );
  const usuarioId = u.rows[0].id;

  const existe = await client.query('SELECT productor_id FROM productor WHERE curp = $1', [p.curp]);
  let productorId;
  if (existe.rows.length) {
    productorId = existe.rows[0].productor_id;
  } else {
    const prod = await client.query(
      `INSERT INTO productor
         (usuario_id, curp, nombres, apellido_paterno, apellido_materno, telefono, sexo,
          tipo_registro, estado_validacion, aviso_privacidad_aceptado, aviso_privacidad_fecha,
          aviso_privacidad_version, estado_id, municipio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'B', 'activo', true, NOW(), '1.0', $8, $9)
       RETURNING productor_id`,
      [usuarioId, p.curp, p.nombres, p.paterno, p.materno, p.telefono, p.sexo,
       PARCELA.estado_id, PARCELA.municipio_id]
    );
    productorId = prod.rows[0].productor_id;
  }
  // Igual que el registro desde la app: el productor queda inscrito en el programa de maíz.
  await client.query(
    `INSERT INTO productor_programa (productor_id, programa) VALUES ($1, 'simac_maiz') ON CONFLICT DO NOTHING`,
    [productorId]
  );

  if (p.completo) {
    const tieneUP = await client.query('SELECT 1 FROM up WHERE productor_id = $1 LIMIT 1', [productorId]);
    if (!tieneUP.rows.length) await crearParcelaYCiclo(client, productorId);
  }
}

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 12);
  console.log('Usuarios de panel y bodega (correo + contraseña):');
  for (const u of USUARIOS) {
    // El correo es único por separado entre usuarios de panel y el resto (índices parciales).
    const categoria = u.panel ? 'es_panel_usuario = true' : 'es_panel_usuario IS NOT TRUE';
    const r = await pool.query(
      `INSERT INTO usuarios (correo_electronico, nombre_completo, hash_contrasena, rol, activo, es_panel_usuario, tipo_tecnico)
       VALUES ($1, $2, $3, $4, true, $5, $6)
       ON CONFLICT (correo_electronico) WHERE ${categoria}
       DO UPDATE SET hash_contrasena = EXCLUDED.hash_contrasena, activo = true,
         intentos_fallidos = 0, bloqueado_hasta = NULL
       RETURNING id`,
      [u.email, u.nombre, hash, u.rol, u.panel, u.tipoTecnico || null]
    );
    if (u.programa) {
      const usuarioId = r.rows[0].id;
      await pool.query(
        'INSERT INTO usuario_programa (usuario_id, programa) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [usuarioId, u.programa]
      );
      for (const estadoId of u.zonaEstadoIds) {
        await pool.query(
          'INSERT INTO tecnico_zona (usuario_id, estado_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [usuarioId, estadoId]
        );
      }
    }
    console.log(`  ${(u.programa ? 'frijol' : u.rol).padEnd(11)} ${u.email}`);
  }
  if (passwordFija) {
    console.log('  Contraseña: la definida en DEV_USUARIOS_PASSWORD (backend/.env)');
  } else {
    console.log(`  Contraseña (generada al azar, anótala): ${PASSWORD}`);
  }

  const nipHash = await bcrypt.hash(NIP, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of PRODUCTORES) await crearProductor(client, p, nipHash);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log('Productores (CURP + NIP):');
  for (const p of PRODUCTORES) {
    console.log(`  ${p.curp}  ${p.completo ? 'completo (con parcela y ciclo)' : 'nuevo (sin parcela ni ciclo)'}`);
  }
  if (nipFijo) {
    console.log('  NIP: el definido en DEV_PRODUCTOR_NIP (backend/.env)');
  } else {
    console.log(`  NIP (generado al azar, anótalo): ${NIP}`);
  }

  if (!passwordFija || !nipFijo) {
    console.log('Para que no cambien en cada ejecución, defínelos en DEV_USUARIOS_PASSWORD y DEV_PRODUCTOR_NIP de backend/.env');
  }
  await pool.end();
})().catch(err => { console.error(err.message); process.exit(1); });
