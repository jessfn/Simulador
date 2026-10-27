// Ensayo de la homologación (corre en el servidor, SOLO dentro del esquema desechable "ensayo"): siembra usuarios y datos ficticios.
require('dotenv').config({ path: '/var/www/Simulador/backend/.env' });
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const CLAVE = 'Ensayo#2026x';

(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '-c search_path=ensayo,public' });
  await c.connect();
  const [{ s }] = (await c.query('select current_schema() s')).rows;
  if (s !== 'ensayo') throw new Error('Esquema inesperado: ' + s);
  const hash = await bcrypt.hash(CLAVE, 10);
  const U = [
    ['ens.admin@ejemplo.test', 'ENAD900101HDGRRS01', 'Administrador Ensayo', 'admin', null, [], false],
    ['ens.maiz@ejemplo.test', 'ENM1900101HDGRRS02', 'Tecnico Ensayo Maiz', 'capturista', 'eca_productivo', ['simac_maiz'], false],
    ['ens.maiz2@ejemplo.test', 'ENM2900101HDGRRS03', 'Tecnico Ensayo Maiz Dos', 'capturista', null, ['simac_maiz'], false],
    ['ens.frijol@ejemplo.test', 'ENF1900101HDGRRS04', 'Tecnico Ensayo Frijol', 'capturista', 'eca_productivo', ['frijol_afb'], false],
    ['ens.panel@ejemplo.test', 'ENSP900101HDGRRS08', 'Panel Ensayo Sin Permisos', 'user', null, [], true],
  ];
  for (const [email, curp, nombre, rol, tipo, progs, panel] of U) {
    const id = (await c.query(`INSERT INTO usuarios (correo_electronico, curp, nombre_completo, hash_contrasena, telefono, activo, rol, tipo_tecnico, debe_cambiar_contrasena, es_panel_usuario)
        VALUES ($1,$2,$3,$4,'6180000000',true,$5,$6,false,$7) RETURNING id`, [email, curp, nombre, hash, rol, tipo, panel])).rows[0].id;
    for (const p of progs) await c.query('INSERT INTO usuario_programa (usuario_id, programa) VALUES ($1,$2)', [id, p]);
  }
  console.log('usuarios', (await c.query('select count(*) from usuarios')).rows[0].count, 'catalogo', (await c.query('select count(*) from cat_catalogo')).rows[0].count);
  await c.end();
})().catch(e => { console.error('sembrar falló:', e.message); process.exit(1); });
