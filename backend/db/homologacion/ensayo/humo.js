// Ensayo de la homologación: recorre la API real (instancia aislada en el esquema "ensayo") y reporta toda respuesta 5xx o error de SQL.
// Corre en el servidor contra http://127.0.0.1:3999/api. No toca el esquema público.
const rutas = require('./rutas.json').map(x => ({ ...x, r: x.r.replace('/api', '') }));
const BASE = 'http://127.0.0.1:3999/api';
const CLAVE = 'Ensayo#2026x';
const fallas = [];
let total = 0;

let ventanaIni = Date.now(), enVentana = 0;
async function llamar(metodo, ruta, token, cuerpo, extra = {}) {
  total++;
  if (++enVentana >= 260) { const espera = 61000 - (Date.now() - ventanaIni); if (espera > 0) await new Promise(r => setTimeout(r, espera)); ventanaIni = Date.now(); enVentana = 0; }
  const r = await fetch(BASE + ruta, { method: metodo.toUpperCase(), headers: { 'Content-Type': 'application/json', ...extra, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* no es JSON (xlsx, pdf…) */ }
  if (r.status >= 500) fallas.push(`${metodo.toUpperCase()} ${ruta} -> ${r.status} ${t.slice(0, 120)}`);
  return { status: r.status, json: j, texto: t };
}
async function entrar(ruta, email) {
  const r = await llamar('post', ruta, null, { email, password: CLAVE });
  if (!r.json?.token) throw new Error(`login ${email} falló: ${r.status} ${r.texto.slice(0, 120)}`);
  return r.json.token;
}

(async () => {
  const admin = await entrar('/auth/login', 'ens.admin@ejemplo.test');
  const maiz = await entrar('/tecnico/auth/login', 'ens.maiz@ejemplo.test');
  const frijol = await entrar('/tecnico/auth/login', 'ens.frijol@ejemplo.test');

  // 1) Todos los GET sin parámetros, con cada rol
  if (!process.env.SOLO_FLUJOS) for (const r of rutas.filter(x => x.m === 'get' && !x.r.includes(':'))) {
    if (/\/stream/.test(r.r)) continue;
    for (const [nombre, tk] of [['admin', admin], ['maiz', maiz], ['frijol', frijol]]) await llamar('get', r.r, tk);
  }

  // 2) Flujo de frijol: consultar CURP, registrar productor+parcela+cultivo, corregir, solicitar cambio
  const poligono = (lat0, lng0, ha) => { const lado = Math.sqrt(ha * 10000); const dlat = lado / 111320, dlng = lado / (111320 * Math.cos(lat0 * Math.PI / 180)); return [[lat0, lng0], [lat0, lng0 + dlng], [lat0 + dlat, lng0 + dlng], [lat0 + dlat, lng0]]; };
  const al = n => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const curp = 'Z' + al(3) + '900101HDGREN' + al(1) + Math.floor(Math.random() * 10);
  const consulta = await llamar('post', '/frijol/consultar-curp', frijol, { curp });
  const cuerpo = {
    productor: { producer_id: null, curp, nombres: 'Ensayo', apellido_paterno: 'De Prueba', apellido_materno: 'Uno', sexo: 'H', fecha_nacimiento: '1980-05-10', telefono: '6181234567', correo: null, verificacion_token: consulta.json?.token_verificacion || null },
    frijol_productor: { total_ups_declaradas: 1, participa_programas_sader: false, programas_sader: [], programas_sader_otro: null, organizacion: null, seguro_agricola: null, seguro_agricola_nombre: null },
    parcela: { up_id: null, nombre: 'Parcela ensayo', numero_up: 1, state_id: '10', municipality_id: '10005', localidad: 'Ejido Ensayo', documento_propiedad: 'certificado_parcelario', documento_propiedad_otro: null, water_regime: 'temporal', poligono: poligono(24.2 + Math.random() * 0.6, -104.6 + Math.random() * 0.6, 3), area_real_ha: null },
    semillas: { se_dedica_produccion_semillas: false, trabajo_con_prosebien: false, usara_prosebien_pv: true },
    cultivo: { fecha_siembra: '2026-07-10', tipo_riego: 'temporal', cycle_type: null, fecha_cosecha_estimada: '2026-10-25', variety_id: 'PINTO_SALTILLO', variety_other: null, area_sown_ha: 2.5, rendimiento_esperado_t_ha: 0.9, destino: 'acopio_axb', tipo_siembra: 'monocultivo', densidad_kg_ha: 45, usa_fertilizante: true, tipos_fertilizante: ['organico'], rotacion: 'rota', observaciones: 'Prueba', sin_observaciones: false },
    trazabilidad: { capturado_en: null, hubo_desconexion: false },
  };
  const reg = await llamar('post', '/frijol/registros', frijol, cuerpo, { 'Idempotency-Key': 'ensayo-' + Date.now() });
  const verifica = (nombre, cond, extra = '') => { total++; if (!cond) fallas.push(`CHECK ${nombre} ${extra}`); };
  verifica('registro de frijol 201', reg.status === 201, `${reg.status} ${reg.texto.slice(0, 200)}`);
  const pid = reg.json?.producer_id;
  if (pid) {
    for (const r of [`/frijol/productores/${pid}`, `/frijol/mis-registros`, `/solicitudes-cambio/campos/${pid}?programa=frijol_afb`, `/solicitudes-cambio/resumen`]) {
      const x = await llamar('get', r, frijol); verifica('GET ' + r, x.status === 200, String(x.status));
    }
    // claves históricas de la API intactas (el frontend las usa)
    const det = await llamar('get', `/frijol/productores/${pid}`, frijol);
    verifica('clave historica producer_id en detalle', det.json?.datos?.producer_id === Number(pid) || String(det.json?.datos?.producer_id) === String(pid), JSON.stringify(Object.keys(det.json?.datos || {})));
    verifica('clave historica telefono/correo en detalle', det.json?.datos && 'telefono' in det.json.datos && 'correo' in det.json.datos);
    verifica('parcelas con up_name/area_ha_calc', det.json?.parcelas?.[0] && 'up_name' in det.json.parcelas[0] && 'area_ha_calc' in det.json.parcelas[0], JSON.stringify(Object.keys(det.json?.parcelas?.[0] || {})));
    verifica('cultivos con cycle_year/variety_id/area_sown_ha', det.json?.cultivos?.[0] && 'cycle_year' in det.json.cultivos[0] && 'variety_id' in det.json.cultivos[0] && 'area_sown_ha' in det.json.cultivos[0], JSON.stringify(Object.keys(det.json?.cultivos?.[0] || {})));
    // edición única: primera vez ok, segunda 409, solicitud
    const e1 = await llamar('patch', `/frijol/productores/${pid}`, frijol, { productor: { nombres: 'Ensayo Corregido' } });
    verifica('edicion unica 1a vez 200', e1.status === 200, `${e1.status} ${e1.texto.slice(0, 160)}`);
    const e2 = await llamar('patch', `/frijol/productores/${pid}`, frijol, { productor: { nombres: 'Otra Vez' } });
    verifica('edicion unica 2a vez 409', e2.status === 409 && e2.json?.codigo === 'EDICION_USADA', `${e2.status} ${e2.texto.slice(0, 160)}`);
    const sol = await llamar('post', '/solicitudes-cambio', frijol, { producer_id: Number(pid), programa: 'frijol_afb', campo: 'nombres', valor_nuevo: 'Nombre Solicitado', motivo: 'Corrección de prueba' });
    verifica('solicitud creada 201', sol.status === 201, `${sol.status} ${sol.texto.slice(0, 160)}`);
    const lista = await llamar('get', '/admin/solicitudes-cambio?estado=pendiente', admin);
    verifica('admin ve la solicitud', lista.status === 200 && lista.json?.solicitudes?.length >= 1, `${lista.status}`);
    if (sol.json?.id) {
      const ap = await llamar('post', `/admin/solicitudes-cambio/${sol.json.id}/aprobar`, admin, {});
      verifica('admin aprueba', ap.status === 200, `${ap.status} ${ap.texto.slice(0, 160)}`);
      const ap2 = await llamar('post', `/admin/solicitudes-cambio/${sol.json.id}/aprobar`, admin, {});
      verifica('doble aprobacion 409', ap2.status === 409, String(ap2.status));
    }
    // admin: detalle del productor de frijol y de la lista general
    for (const r of [`/admin/frijol/productor/${pid}`, '/admin/frijol/registros', '/admin/frijol/resumen', '/admin/frijol/mapa']) { const x = await llamar('get', r, admin); verifica('GET ' + r, x.status < 500, String(x.status)); }
    const cult = det.json?.cultivos?.[0]?.cycle_crop_id;
    if (cult) { const pc = await llamar('patch', `/frijol/cultivos/${cult}`, frijol, { cultivo: { area_sown_ha: 2.0 } }); verifica('corregir cultivo 200', pc.status === 200, `${pc.status} ${pc.texto.slice(0, 160)}`); }
  }

  // 3) Flujo de maíz: registro alterno, UPs, ciclos, cultivos
  const curpM = 'Z' + al(3) + '850303HDGREN' + al(1) + Math.floor(Math.random() * 10);
  const alt = await llamar('post', '/tecnico/registro-alterno', maiz, { curp: curpM, nombres: 'Maicero', apellido_paterno: 'Ensayo', apellido_materno: 'Uno', telefono: '6181111111', state_id: '10', municipality_id: '10005', sexo: 'H', fecha_nac: '1985-03-03', estado_up: 'Durango', municipio_up: 'Durango', nombre_up: 'Parcela maiz ensayo' });
  verifica('registro alterno maiz 201', alt.status === 201, `${alt.status} ${alt.texto.slice(0, 200)}`);
  const pidM = alt.json?.producer_id;
  if (pidM) {
    const ups = await llamar('get', `/tecnico/productor/${pidM}/ups`, maiz);
    verifica('ups del productor', ups.status === 200 && ups.json?.ups?.length >= 1, `${ups.status}`);
    const up = ups.json?.ups?.[0]?.up_id;
    verifica('clave up_id/up_name en ups', ups.json?.ups?.[0] && 'up_id' in ups.json.ups[0] && 'up_name' in ups.json.ups[0], JSON.stringify(Object.keys(ups.json?.ups?.[0] || {})));
    if (up) {
      const ci = await llamar('post', `/ups/${up}/cycles`, maiz, { cycle_year: 2026, cycle_type: 'PV', tipo_riego: 'temporal' });
      verifica('crear ciclo 201', ci.status === 201 || ci.status === 200, `${ci.status} ${ci.texto.slice(0, 200)}`);
      const cid = ci.json?.cycle?.cycle_id ?? ci.json?.cycle_id;
      const lc = await llamar('get', `/ups/${up}/cycles`, maiz);
      verifica('listar ciclos con crops', lc.status === 200, String(lc.status));
      const cycleId = cid ?? lc.json?.cycles?.[0]?.cycle_id;
      if (cycleId) {
        const cu = await llamar('post', `/cycles/${cycleId}/crops`, maiz, { crop: 'maiz', variety_id: 'SB-101', area_sown_ha: 1.5, planting_date: '2026-07-01', yield_expected: 6 });
        verifica('crear cultivo de maiz 201', cu.status === 201, `${cu.status} ${cu.texto.slice(0, 200)}`);
        const cc = cu.json?.crop?.cycle_crop_id;
        verifica('cultivo con claves historicas', cu.json?.crop && 'cycle_crop_id' in cu.json.crop && 'area_sown_ha' in cu.json.crop && 'planting_date' in cu.json.crop, JSON.stringify(Object.keys(cu.json?.crop || {})));
        if (cc) { const pc = await llamar('patch', `/cycle-crops/${cc}`, maiz, { area_sown_ha: 1.0 }); verifica('PATCH cultivo maiz', pc.status === 200, `${pc.status} ${pc.texto.slice(0, 160)}`); }
      }
    }
    for (const r of [`/solicitudes-cambio/campos/${pidM}?programa=simac_maiz`, '/tecnico/mis-registros', '/tecnico/perfil']) { const x = await llamar('get', r, maiz); verifica('GET ' + r, x.status === 200, `${x.status} ${x.texto.slice(0, 100)}`); }
    // el panel de maíz ve al productor
    for (const r of ['/admin/productores', '/admin/parcelas', '/admin/exportar-bd', '/dashboard/admin/resumen', '/admin/tecnicos']) { const x = await llamar('get', r, admin); verifica('GET admin ' + r, x.status < 500, String(x.status)); }
  }

  // 4) Rutas con parámetros: se prueban con ids existentes y falsos (no deben dar 5xx)
  const ids = { ':producer_id': pid || 1, ':up_id': 1, ':cycle_id': 1, ':id': 1, ':crop_id': 1, ':curp': curp, ':cycle_crop_id': 1, ':bodega_id': 1, ':ciclo_id': 1 };
  if (!process.env.SOLO_FLUJOS) for (const r of rutas.filter(x => x.m === 'get' && x.r.includes(':') && !/stream/.test(x.r))) {
    let ruta = r.r; for (const [k, v] of Object.entries(ids)) ruta = ruta.split(k).join(v); ruta = ruta.replace(/:[a-z_]+/g, '1');
    for (const tk of [admin, maiz, frijol]) await llamar('get', ruta, tk);
  }

  console.log(JSON.stringify({ llamadas: total, fallas: fallas.length }));
  console.log(fallas.join('\n'));
})().catch(e => { console.error('humo falló:', e); process.exit(1); });
