// Siembra en la base de PRUEBAS los usuarios y el productor ficticios que usan las pruebas.
// Es idempotente: se puede correr todas las veces que se quiera. Todo es ficticio (correos @ejemplo.test, CURP inventadas).
// Uso: node tests/seed.js
require('./cargar-env');
const { exigirEntornoDePruebas } = require('./guardia');
exigirEntornoDePruebas();
const bcrypt = require('../node_modules/bcrypt');
const { Client } = require('../node_modules/pg');

const CLAVE = process.env.TEST_PASSWORD;
const CLAVE_ADMIN = process.env.TEST_ADMIN_PASSWORD || process.env.TEST_PASSWORD;
if (!CLAVE) { console.error('Falta TEST_PASSWORD (la contraseña de los usuarios de prueba; invéntala, no uses una real).'); process.exit(1); }

const D = 'ejemplo.test';
const USUARIOS = [
  { email: `qa.admin@${D}`,         nombre: 'Administrador de Prueba',   curp: 'QAAD900101HDGRRS01', rol: 'admin',      clave: CLAVE_ADMIN },
  { email: `qa.maiz1@${D}`,         nombre: 'Tecnico Prueba Maiz Uno',   curp: 'QAM1900101HDGRRS02', rol: 'capturista', tipo: 'eca_productivo', programas: ['simac_maiz'] },
  { email: `qa.maiz2@${D}`,         nombre: 'Tecnico Prueba Maiz Dos',   curp: 'QAM2900101HDGRRS03', rol: 'capturista', programas: ['simac_maiz'] },
  { email: `qa.frijol1@${D}`,       nombre: 'Tecnico Prueba Frijol Uno', curp: 'QAF1900101HDGRRS04', rol: 'capturista', tipo: 'eca_productivo', programas: ['frijol_afb'] },
  { email: `qa.frijol2@${D}`,       nombre: 'Tecnico Prueba Frijol Dos', curp: 'QAF2900101HDGRRS05', rol: 'capturista', programas: ['frijol_afb'] },
  { email: `qa.ambos@${D}`,         nombre: 'Tecnico Prueba Ambos',      curp: 'QAAM900101HDGRRS06', rol: 'capturista', tipo: 'eca_productivo', programas: ['frijol_afb', 'simac_maiz'] },
  { email: `qa.limite@${D}`,          nombre: 'Tecnico Prueba Limite',       curp: 'QALM900101HDGRRS09', rol: 'capturista', programas: ['frijol_afb'] },   // solo para la prueba del límite de consultas de CURP
  { email: `qa.legacy@${D}`,        nombre: 'Tecnico Prueba Sin Programa', curp: 'QALG900101HDGRRS07', rol: 'capturista', tipo: 'eca_productivo', programas: [] },
  { email: `qa.sinpermisos@${D}`,   nombre: 'Panel Sin Permisos',        curp: 'QASP900101HDGRRS08', rol: 'user',       panel: true },
];

(async () => {
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  try {
    const ids = {};
    for (const u of USUARIOS) {
      const hash = await bcrypt.hash(u.clave || CLAVE, 10);
      const panel = !!u.panel;
      const ex = await c.query('SELECT id FROM usuarios WHERE email = $1 AND (es_panel_usuario IS TRUE) = $2', [u.email, panel]);
      let id;
      if (ex.rows.length) {
        id = ex.rows[0].id;
        await c.query(`UPDATE usuarios SET password_hash=$2, activo=true, rol=$3, tipo_tecnico=$4, nombre_completo=$5, debe_cambiar_pass=false,
                        intentos_fallidos=0, bloqueado_hasta=NULL, es_panel_usuario=$6 WHERE id=$1`, [id, hash, u.rol, u.tipo || null, u.nombre, panel]);
      } else {
        id = (await c.query(`INSERT INTO usuarios (email, curp, nombre_completo, password_hash, telefono, activo, rol, tipo_tecnico, debe_cambiar_pass, es_panel_usuario)
                             VALUES ($1,$2,$3,$4,'6180000000',true,$5,$6,false,$7) RETURNING id`, [u.email, u.curp, u.nombre, hash, u.rol, u.tipo || null, panel])).rows[0].id;
      }
      ids[u.email] = id;
      if (u.programas) {
        await c.query('DELETE FROM usuario_programa WHERE usuario_id = $1', [id]);
        for (const p of u.programas) await c.query('INSERT INTO usuario_programa (usuario_id, programa) VALUES ($1,$2)', [id, p]);
      }
    }
    // Productor ficticio que solo está en frijol (lo usan las pruebas de técnicos y de borrado)
    const curp = 'FRTS900101HDGXXX01';
    let pid = (await c.query('SELECT producer_id FROM producer WHERE curp = $1', [curp])).rows[0]?.producer_id;
    const f1 = ids[`qa.frijol1@${D}`];
    if (!pid) pid = (await c.query(`INSERT INTO producer (curp, nombres, apellido_paterno, tipo_registro, usuario_capturista_id) VALUES ($1,'Frijolero','Sintetico','B',$2) RETURNING producer_id`, [curp, f1])).rows[0].producer_id;
    await c.query(`INSERT INTO producer_programa (producer_id, programa, usuario_capturista_id) VALUES ($1,'frijol_afb',$2)
                   ON CONFLICT (producer_id, programa) DO UPDATE SET usuario_capturista_id = EXCLUDED.usuario_capturista_id`, [pid, f1]);
    await c.query('UPDATE producer SET usuario_capturista_id = $2 WHERE producer_id = $1', [pid, f1]);
    console.log(`Sembrados ${USUARIOS.length} usuarios ficticios y el productor ${curp}.`);
  } finally { await c.end(); }
})().catch(e => { console.error('seed falló:', e.message); process.exit(1); });
