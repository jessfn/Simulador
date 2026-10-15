import type { Borrador, CultivoBorrador, ParcelaBorrador } from './tipos';
import { cicloFinal, inferirCiclo } from '../../utils/cicloSIAP';
import { uuid } from './almacen';

// Las mismas reglas que valida el servidor, para avisar antes de enviar. Devuelven { campo: mensaje }.
export type Errores = Record<string, string>;

const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIA = 24 * 60 * 60 * 1000;

export const esCurp = (v: string) => CURP_RE.test(v.trim().toUpperCase());
const num = (v: string | number | null | undefined) => (v === '' || v == null ? NaN : Number(v));
const txt = (v: string | null | undefined) => (v ?? '').trim();

export function borradorNuevo(curp: string): Borrador {
  const ahora = new Date().toISOString();
  return {
    id: uuid(), creado: ahora, actualizado: ahora, paso: 1, estado: 'borrador', capturado_en: ahora, hubo_desconexion: false,
    curp, consulta: null,
    productor: { nombres: '', apellido_paterno: '', apellido_materno: '', sexo: '', fecha_nacimiento: '', telefono: '', correo: '' },
    complementaria: { total_ups: 1, participa: null, programas_sader: [], programas_otro: '', organizacion: '', seguro: '', seguro_nombre: '' },
    complementaria_resumen: false,
    parcela: vacioParcela(),
    semillas: { dedica: null, trabajo_prosebien: null, usara_prosebien: null },
    cultivo: vacioCultivo(),
    confirmacion: false,
  };
}

export function vacioParcela(): ParcelaBorrador {
  return {
    modo: null, up_id: null, nombre: '', numero_up: null, state_id: '', municipality_id: '', localidad: '', documento: '', documento_otro: '',
    regimen: '', vertices: [], poligono: null, area_calc_ha: null, area_real_ha: '', motivo_diferencia: '',
  };
}

export function vacioCultivo(): CultivoBorrador {
  return {
    fecha_siembra: '', cycle_type: '', fecha_cosecha: '', variety_id: '', variety_other: '', area_sembrada_ha: '', rendimiento: '', densidad: '',
    usa_fertilizante: null, tipos_fertilizante: [], rotacion: '', tipo_siembra: '', destino: '', observaciones: '', sin_observaciones: false,
  };
}

// ── Paso 2: productor ──
export function validarProductor(b: Borrador): Errores {
  const e: Errores = {}, p = b.productor;
  if (!txt(p.nombres)) e.nombres = 'Escribe el nombre';
  if (!txt(p.apellido_paterno)) e.apellido_paterno = 'Escribe el apellido paterno';
  if (p.sexo !== 'H' && p.sexo !== 'M') e.sexo = 'Elige el sexo';
  if (!p.fecha_nacimiento) e.fecha_nacimiento = 'Elige la fecha de nacimiento';
  else {
    const edad = (Date.now() - new Date(p.fecha_nacimiento + 'T12:00:00').getTime()) / (365.25 * DIA);
    if (!(edad >= 15 && edad <= 100)) e.fecha_nacimiento = 'La edad debe estar entre 15 y 100 años';
  }
  if (!/^\d{10}$/.test(p.telefono)) e.telefono = 'El teléfono debe tener 10 dígitos';
  if (txt(p.correo) && !EMAIL_RE.test(txt(p.correo))) e.correo = 'El correo no tiene un formato válido';
  return e;
}

// ── Paso 3: información complementaria ──
export function validarComplementaria(b: Borrador): Errores {
  const e: Errores = {}, c = b.complementaria;
  if (!Number.isInteger(c.total_ups) || c.total_ups < 1) e.total_ups = 'Indica cuántas parcelas tiene (mínimo 1)';
  if (c.participa === null) e.participa = 'Responde si participa en otros programas';
  if (c.participa && c.programas_sader.length === 0) e.programas_sader = 'Elige al menos un programa';
  if (c.participa && c.programas_sader.includes('otro_sader') && !txt(c.programas_otro)) e.programas_otro = 'Escribe cuál es';
  if (c.seguro === 'otro' && !txt(c.seguro_nombre)) e.seguro_nombre = 'Escribe el nombre del seguro o programa';
  return e;
}

// ── Paso 4: parcela ──
export function validarParcela(b: Borrador): Errores {
  const e: Errores = {}, p = b.parcela;
  if (!p.modo) { e.modo = 'Elige una parcela o agrega una nueva'; return e; }
  if (!p.numero_up || p.numero_up < 1) e.numero_up = 'Indica el número de parcela';
  else if (p.numero_up > b.complementaria.total_ups) e.numero_up = 'El número de parcela no puede ser mayor al total';
  if (!p.state_id) e.state_id = 'Elige el estado';
  if (!p.municipality_id) e.municipality_id = 'Elige el municipio';
  if (!txt(p.localidad)) e.localidad = 'Escribe la localidad o ejido';
  if (!p.documento) e.documento = 'Elige el documento de propiedad';
  if (p.documento === 'otro' && !txt(p.documento_otro)) e.documento_otro = 'Escribe cuál es el documento';
  if (p.modo === 'nueva') {
    if (!txt(p.nombre)) e.nombre = 'Escribe el nombre de la parcela';
    if (!p.regimen) e.regimen = 'Elige el régimen hídrico';
    if (!p.poligono || p.poligono.length < 3) e.poligono = 'Falta dibujar el polígono de la parcela';
    const real = num(p.area_real_ha);
    if (p.area_real_ha !== '' && !(real > 0)) e.area_real_ha = 'La superficie ajustada debe ser mayor a 0';
    if (p.area_calc_ha && real > 0 && Math.abs(real - p.area_calc_ha) / p.area_calc_ha > 0.10 && !txt(p.motivo_diferencia)) {
      e.motivo_diferencia = 'Explica por qué difiere más de 10 % de la superficie calculada';
    }
  }
  return e;
}

export const superficieParcela = (p: ParcelaBorrador, existente?: { area_ha_calc: number | null; area_ha_real: number | null } | null): number => {
  if (p.modo === 'existente') return Number(existente?.area_ha_real || existente?.area_ha_calc || 0);
  const real = num(p.area_real_ha);
  return real > 0 ? real : (p.area_calc_ha || 0);
};

// ── Paso 5: semillas ──
export function validarSemillas(b: Borrador): Errores {
  const e: Errores = {}, s = b.semillas;
  if (s.dedica === null) e.dedica = 'Responde esta pregunta';
  if (s.trabajo_prosebien === null) e.trabajo_prosebien = 'Responde esta pregunta';
  if (s.usara_prosebien === null) e.usara_prosebien = 'Responde esta pregunta';
  return e;
}

// ── Paso 6: cultivo ──
export interface AvisosCultivo { cosecha?: string; rendimiento?: string; densidad?: string }

export function validarCultivo(b: Borrador, superficie: number): { errores: Errores; avisos: AvisosCultivo } {
  const e: Errores = {}, a: AvisosCultivo = {}, c = b.cultivo;
  const hoy = Date.now();
  if (!c.fecha_siembra) e.fecha_siembra = 'Elige la fecha de siembra';
  else {
    const t = new Date(c.fecha_siembra + 'T12:00:00').getTime();
    if (t < hoy - 18 * 30.44 * DIA) e.fecha_siembra = 'No puede ser de hace más de 18 meses';
    else if (t > hoy + 6 * 30.44 * DIA) e.fecha_siembra = 'No puede ser de más de 6 meses adelante';
    else {
      const inf = inferirCiclo(c.fecha_siembra, regimenDe(b));
      if (inf?.necesitaElegir && !c.cycle_type) e.cycle_type = 'Elige el ciclo agrícola';
      else if (inf?.necesitaElegir && !inf.opciones.includes(c.cycle_type as 'PV' | 'OI' | 'ANUAL')) e.cycle_type = 'Elige el ciclo agrícola';
    }
  }
  if (!c.fecha_cosecha) e.fecha_cosecha = 'Elige la fecha estimada de cosecha';
  else if (c.fecha_siembra) {
    const dias = Math.round((new Date(c.fecha_cosecha + 'T12:00:00').getTime() - new Date(c.fecha_siembra + 'T12:00:00').getTime()) / DIA);
    if (dias <= 0) e.fecha_cosecha = 'La cosecha debe ser posterior a la siembra';
    else if (dias < 45 || dias > 240) e.fecha_cosecha = 'La cosecha debe ser entre 45 y 240 días después de la siembra';
    else if (dias < 70 || dias > 150) a.cosecha = '¿Seguro? Es poco común para frijol.';
  }
  if (!c.variety_id) e.variety_id = 'Elige la variedad';
  if (c.variety_id === 'OTRA' && !txt(c.variety_other)) e.variety_other = '¿Cuál variedad?';
  const sembrada = num(c.area_sembrada_ha);
  if (!(sembrada > 0)) e.area_sembrada_ha = 'Debe ser mayor a 0';
  else if (superficie > 0 && sembrada > superficie + 1e-9) e.area_sembrada_ha = `No puede ser mayor a la parcela (${superficie.toFixed(2)} ha)`;
  const rend = num(c.rendimiento);
  if (!(rend > 0)) e.rendimiento = 'Debe ser mayor a 0';
  else if (rend > 5) e.rendimiento = 'Máximo 5 t/ha';
  else if (rend > 3) a.rendimiento = 'Es un rendimiento alto. ¿Seguro?';
  const dens = num(c.densidad);
  if (!(dens > 0)) e.densidad = 'Debe ser mayor a 0';
  else if (dens > 300) e.densidad = 'Máximo 300 kg/ha';
  else if (dens < 30 || dens > 120) a.densidad = 'Está fuera de lo habitual (30–120 kg/ha). ¿Seguro?';
  if (c.usa_fertilizante === null) e.usa_fertilizante = 'Responde si usa fertilizante';
  if (c.usa_fertilizante && c.tipos_fertilizante.length === 0) e.tipos_fertilizante = 'Elige al menos un tipo';
  if (!c.rotacion) e.rotacion = 'Elige la rotación';
  if (!c.sin_observaciones && txt(c.observaciones).length < 3) e.observaciones = 'Escribe las observaciones o marca "Sin observaciones"';
  return { errores: e, avisos: a };
}

export function regimenDe(b: Borrador): 'temporal' | 'riego' {
  return b.parcela.regimen === 'riego' ? 'riego' : 'temporal';
}

export function cicloDe(b: Borrador) {
  if (!b.cultivo.fecha_siembra) return null;
  const r = cicloFinal(b.cultivo.fecha_siembra, regimenDe(b), b.cultivo.cycle_type);
  return r.ok ? r.ciclo : null;
}

export const produccionEstimada = (c: CultivoBorrador): number | null => {
  const s = num(c.area_sembrada_ha), r = num(c.rendimiento);
  return s > 0 && r > 0 ? Math.round(s * r * 100) / 100 : null;
};

// ── Cuerpo del envío (POST /api/frijol/registros) ──
export function construirCuerpo(b: Borrador) {
  const p = b.productor, c = b.complementaria, pa = b.parcela, cu = b.cultivo;
  return {
    productor: {
      producer_id: b.consulta?.producer_id ?? null, curp: b.curp,
      nombres: txt(p.nombres), apellido_paterno: txt(p.apellido_paterno), apellido_materno: txt(p.apellido_materno) || null,
      sexo: p.sexo, fecha_nacimiento: p.fecha_nacimiento, telefono: p.telefono, correo: txt(p.correo) || null,
      verificacion_token: b.consulta?.token_verificacion ?? null,
    },
    frijol_productor: {
      total_ups_declaradas: c.total_ups, participa_programas_sader: c.participa === true,
      programas_sader: c.participa ? c.programas_sader : [], programas_sader_otro: c.participa && c.programas_sader.includes('otro_sader') ? txt(c.programas_otro) : null,
      organizacion: txt(c.organizacion) || null, seguro_agricola: c.seguro || null, seguro_agricola_nombre: c.seguro === 'otro' ? txt(c.seguro_nombre) : null,
    },
    parcela: {
      up_id: pa.modo === 'existente' ? pa.up_id : null, nombre: txt(pa.nombre), numero_up: pa.numero_up,
      state_id: pa.state_id, municipality_id: pa.municipality_id, localidad: txt(pa.localidad),
      documento_propiedad: pa.documento, documento_propiedad_otro: pa.documento === 'otro' ? txt(pa.documento_otro) : null,
      water_regime: pa.regimen || null,
      poligono: pa.modo === 'nueva' ? pa.poligono : null,
      area_calc_ha: pa.area_calc_ha, area_real_ha: pa.modo === 'nueva' && pa.area_real_ha !== '' ? Number(pa.area_real_ha) : null,
      motivo_diferencia_superficie: txt(pa.motivo_diferencia) || null,
    },
    semillas: { se_dedica_produccion_semillas: b.semillas.dedica, trabajo_con_prosebien: b.semillas.trabajo_prosebien, usara_prosebien_pv: b.semillas.usara_prosebien },
    cultivo: {
      fecha_siembra: cu.fecha_siembra, tipo_riego: regimenDe(b), cycle_type: cu.cycle_type || null, fecha_cosecha_estimada: cu.fecha_cosecha,
      variety_id: cu.variety_id, variety_other: txt(cu.variety_other) || null, area_sown_ha: Number(cu.area_sembrada_ha),
      rendimiento_esperado_t_ha: Number(cu.rendimiento), destino: cu.destino || null, tipo_siembra: cu.tipo_siembra || null,
      densidad_kg_ha: Number(cu.densidad), usa_fertilizante: cu.usa_fertilizante === true, tipos_fertilizante: cu.usa_fertilizante ? cu.tipos_fertilizante : [],
      rotacion: cu.rotacion, observaciones: cu.sin_observaciones ? null : txt(cu.observaciones), sin_observaciones: cu.sin_observaciones,
    },
    trazabilidad: { capturado_en: b.capturado_en, hubo_desconexion: b.hubo_desconexion },
  };
}
