// Homologación de nombres de la base de datos al español (migración 0008).
// Fuente única: la usan el generador de la migración, el convertidor de consultas del código y la capa de compatibilidad de la API.
// Criterio: se traduce toda palabra en inglés; se conservan los acrónimos oficiales del programa (UP = Unidad de Producción, CURP, DDR, CADER, SADER, FIRA…)
// y los objetos de sistema (spatial_ref_sys, pgmigrations, topology). Los VALORES guardados (códigos de catálogo, 'PV'/'OI', estados) no cambian.

const TABLAS = {
  producer: 'productor',
  producer_cambios: 'productor_cambios',
  producer_profile: 'productor_perfil',
  producer_programa: 'productor_programa',
  cycle: 'ciclo',
  cycle_crop: 'ciclo_cultivo',
  geo_state: 'geo_estado',
  geo_municipality: 'geo_municipio',
  cat_catalog: 'cat_catalogo',
  cat_crop_variety: 'cat_variedad_cultivo',
  revoked_tokens: 'tokens_revocados',
};

// Columnas: mismo nombre viejo => mismo nombre nuevo en todas las tablas (salvo excepciones por tabla más abajo).
const COLUMNAS = {
  producer_id: 'productor_id',
  posible_traslape_producer_id: 'posible_traslape_productor_id',
  state_id: 'estado_id',
  municipality_id: 'municipio_id',
  cycle_id: 'ciclo_id',
  cycle_crop_id: 'ciclo_cultivo_id',
  user_id: 'usuario_id',
  created_at: 'creado_en',
  creado_at: 'creado_en',
  updated_at: 'actualizado_en',
  actualizado_at: 'actualizado_en',
  resuelto_at: 'resuelto_en',
  escalada_at: 'escalada_en',
  vence_at: 'vence_en',
  ultimo_mensaje_at: 'ultimo_mensaje_en',
  semaforo_updated_at: 'semaforo_actualizado_en',
  expires_at: 'expira_en',
  name: 'nombre',
  label: 'etiqueta',
  code: 'codigo',
  catalog: 'catalogo',
  crop: 'cultivo',
  sort_order: 'orden',
  is_active: 'activo',
  phone: 'telefono',
  locality: 'localidad',
  lat: 'latitud',
  lng: 'longitud',
  aviso_privacidad_lat: 'aviso_privacidad_latitud',
  aviso_privacidad_lng: 'aviso_privacidad_longitud',
  email: 'correo_electronico',
  privacy_consent: 'consentimiento_privacidad',
  user_agent: 'agente_usuario',
  ip_address: 'direccion_ip',
  token_hash: 'hash_token',
  password_hash: 'hash_contrasena',
  reset_token: 'token_recuperacion',
  reset_token_expires: 'token_recuperacion_expira_en',
  reset_pin_forced: 'recuperacion_nip_forzada',
  debe_cambiar_pass: 'debe_cambiar_contrasena',
  jti: 'id_jwt',
  sesion_activa_jti: 'sesion_activa_id_jwt',
  push_endpoint: 'push_url',
  push_p256dh: 'push_llave_p256dh',
  push_auth: 'push_llave_auth',
  water_regime: 'regimen_hidrico',
  variety_id: 'variedad_id',
  variety_other: 'variedad_otra',
  variedad_code: 'variedad_codigo',
  planting_date: 'fecha_siembra',
  estimated_harvest_date: 'fecha_cosecha_estimada',
  yield_expected: 'rendimiento_esperado',
  destination: 'destino',
  production_qty: 'cantidad_producida',
  production_unit: 'unidad_medida_produccion',
  production_system: 'sistema_produccion',
  cycle_year: 'anio_ciclo',
  cycle_type: 'tipo_ciclo',
  area_sown_ha: 'superficie_sembrada_ha',
  area_harvested_ha: 'superficie_cosechada_ha',
  area_ha_real: 'superficie_ha_real',
  area_ha_calc: 'superficie_ha_calculada',
  area_real_declarada_ha: 'superficie_real_declarada_ha',
  coincide_area: 'coincide_superficie',
  state_name: 'nombre_estado',
  municipality_name: 'nombre_municipio',
  up_name: 'nombre_up',
  up_type: 'tipo_up',
  location_confirmed: 'ubicacion_confirmada',
  location_correction_reason: 'motivo_correccion_ubicacion',
  centroid: 'centroide',
  centroid_source: 'origen_centroide',
  geom: 'geometria',
  min_txns: 'min_transacciones',
};

// Excepciones por tabla NUEVA (si algún día un mismo nombre viejo debe traducirse distinto según la tabla).
const COLUMNAS_POR_TABLA = {};

// Tablas que no se tocan (sistema / extensiones)
const EXENTAS = ['spatial_ref_sys', 'pgmigrations', 'geometry_columns', 'geography_columns'];

// Funciones de disparador que usan columnas renombradas
const FUNCIONES = {
  actualizar_updated_at: 'actualizar_actualizado_en',
  update_up_timestamp: 'actualizar_marca_tiempo_up',
  update_updated_at_column: 'actualizar_columna_actualizado_en',
};

// Palabras en inglés que aparecen SOLO dentro de nombres de índices/restricciones/secuencias (no son columnas)
const PALABRAS_EN_NOMBRES = { unique: 'unico', state: 'estado', municipality: 'municipio', year: 'anio' };

// Disparadores: [nombre viejo, nombre nuevo, tabla vieja]
const DISPARADORES = { trigger_up_updated: ['disparador_up_actualizado', 'up'] };

module.exports = { TABLAS, COLUMNAS, COLUMNAS_POR_TABLA, EXENTAS, FUNCIONES, PALABRAS_EN_NOMBRES, DISPARADORES };
