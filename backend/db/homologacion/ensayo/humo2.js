// Ensayo de la homologación, parte 2: roles productor, bodeguero y supervisor (tokens firmados con el secreto de la instancia aislada).
require('dotenv').config({ path: '/var/www/Simulador/backend/.env' });
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const rutas = require('./rutas.json').map(x => ({ ...x, r: x.r.replace('/api', '') }));
const SECRETO = 'ensayo_local_secreto_no_produccion_0123456789';
const BASE = 'http://127.0.0.1:3999/api';
const fallas = []; let total = 0, enVentana = 0, ventanaIni = Date.now();

async function llamar(metodo, ruta, token, cuerpo) {
  total++;
  if (++enVentana >= 260) { const espera = 61000 - (Date.now() - ventanaIni); if (espera > 0) await new Promise(r => setTimeout(r, espera)); ventanaIni = Date.now(); enVentana = 0; }
  const r = await fetch(BASE + ruta, { method: metodo.toUpperCase(), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
  if (r.status >= 500) fallas.push(`${metodo.toUpperCase()} ${ruta} -> ${r.status} ${t.slice(0, 140)}`);
  return { status: r.status, json: j, texto: t };
}
const verifica = (n, c, x = '') => { total++; if (!c) fallas.push(`CHECK ${n} ${x}`); };

(async () => {
  const c = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, options: '-c search_path=ensayo,public' });
  await c.connect();
  if ((await c.query('select current_schema() s')).rows[0].s !== 'ensayo') throw new Error('esquema inesperado');
  const mk = async (email, rol, curp, extra = {}) => {
    const jti = 'jti-' + Math.random().toString(36).slice(2);
    const id = (await c.query(`INSERT INTO usuarios (correo_electronico, curp, nombre_completo, hash_contrasena, telefono, activo, rol, debe_cambiar_contrasena, sesion_activa_id_jwt, estado_asignado)
       VALUES ($1,$2,$3,'x','6180000001',true,$4,false,$5,$6) RETURNING id`, [email, curp, 'Usuario ' + rol, rol, jti, extra.estado || null])).rows[0].id;
    return { id, token: jwt.sign({ userId: id, email, rol, jti }, SECRETO, { expiresIn: '30m' }) };
  };
  const sufijo = Math.random().toString(36).slice(2, 7);
  // productor con cuenta: se enlaza al último productor de maíz creado en el ensayo
  const prod = (await c.query(`SELECT productor_id, curp FROM productor WHERE usuario_id IS NULL AND fuente_registro IS DISTINCT FROM 'tecnico_frijol' ORDER BY productor_id DESC LIMIT 1`)).rows[0];
  const uProd = await mk(`ens.prod.${sufijo}@ejemplo.test`, 'productor', prod.curp.slice(0, 17) + 'X');
  await c.query('UPDATE productor SET usuario_id = $1, estado_validacion = $$activo$$, tipo_registro = $$A$$ WHERE productor_id = $2', [uProd.id, prod.productor_id]);
  const uBod = await mk(`ens.bod.${sufijo}@ejemplo.test`, 'bodeguero', 'ZBOD900101HDGRRB' + sufijo.slice(0, 2));
  const bodega = (await c.query(`INSERT INTO bodegas (clave, nombre, estado, municipio, latitud, longitud, estatus, activo) VALUES ($1,$$Bodega Ensayo$$,$$Durango$$,$$Durango$$,24.02,-104.65,$$aprobada$$,true) RETURNING id`, ['ENS' + sufijo])).rows[0].id;
  await c.query(`INSERT INTO bodeguero_bodegas (usuario_id, bodega_id, estatus) VALUES ($1,$2,$$aprobado$$)`, [uBod.id, bodega]).catch(() => c.query(`INSERT INTO bodeguero_bodegas (usuario_id, bodega_id, estatus) VALUES ($1,$2,$$aprobada$$)`, [uBod.id, bodega]));
  const uSup = await mk(`ens.sup.${sufijo}@ejemplo.test`, 'supervisor', 'ZSUP900101HDGRRS' + sufijo.slice(0, 2));
  await c.query('INSERT INTO supervisor_productores (supervisor_id, productor_id) VALUES ($1,$2)', [uSup.id, prod.productor_id]).catch(() => {});
  const uResp = await mk(`ens.resp.${sufijo}@ejemplo.test`, 'responsable', 'ZRES900101HDGRRS' + sufijo.slice(0, 2));
  await c.end();

  const ids = { ':producer_id': prod.productor_id, ':up_id': 1, ':cycle_id': 1, ':id': 1, ':bodega_id': bodega, ':ciclo_id': 1, ':crop_id': 1, ':cycle_crop_id': 1 };
  for (const [nombre, tk] of [['productor', uProd.token], ['bodeguero', uBod.token], ['supervisor', uSup.token], ['responsable', uResp.token]]) {
    for (const r of rutas.filter(x => x.m === 'get')) {
      let ruta = r.r; for (const [k, v] of Object.entries(ids)) ruta = ruta.split(k).join(v); ruta = ruta.replace(/:[a-z_]+/g, '1');
      if (/\/stream$/.test(ruta)) continue;
      await llamar('get', ruta, tk);
    }
  }
  // flujos del productor (cuenta propia): perfil, ubicación y ciclo declarado
  const t = uProd.token;
  for (const r of ['/productor/perfil', '/productor/mis-ups', '/productor/mi-ciclo', '/home', '/mis-ups']) { const x = await llamar('get', r, t); verifica('GET ' + r + ' no 5xx', x.status < 500, String(x.status)); }
  const pf = await llamar('patch', '/productor/perfil', t, { telefono: '6189999999' });
  verifica('PATCH perfil productor', pf.status === 200 || pf.status === 400, `${pf.status} ${pf.texto.slice(0, 120)}`);
  const cd = await llamar('post', '/productor/ciclo', t, { cycle_year: 2026, cycle_type: 'OI', hectareas_sembradas: 1, fecha_siembra: '2026-11-01', variedad_nombre: 'X' });
  verifica('POST ciclo declarado', cd.status < 500, `${cd.status} ${cd.texto.slice(0, 160)}`);
  console.log(JSON.stringify({ llamadas: total, fallas: fallas.length })); console.log(fallas.join('\n'));
})().catch(e => { console.error('humo2 falló:', e); process.exit(1); });
