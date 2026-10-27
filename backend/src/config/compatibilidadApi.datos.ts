// GENERADO por backend/db/homologacion/generar-migracion.js — no editar a mano.
// La base de datos usa nombres en español; el contrato de la API (claves JSON que consume el frontend) conserva los nombres históricos.
// Este mapa traduce, en el resultado de cada consulta, el nombre de columna nuevo a la clave histórica.
export const COLUMNAS_POR_TABLA: Record<string, Record<string, string>> = {
  "alertas": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "actualizado_en": "updated_at",
    "ciclo_cultivo_id": "cycle_crop_id"
  },
  "apoyos_ventanilla": {
    "creado_en": "created_at"
  },
  "bodegas": {
    "semaforo_actualizado_en": "semaforo_updated_at"
  },
  "cat_catalogo": {
    "catalogo": "catalog",
    "codigo": "code",
    "etiqueta": "label",
    "orden": "sort_order",
    "activo": "is_active"
  },
  "cat_variedad_cultivo": {
    "cultivo": "crop",
    "codigo": "code",
    "etiqueta": "label",
    "orden": "sort_order",
    "activo": "is_active"
  },
  "chat_conversaciones": {
    "ultimo_mensaje_en": "ultimo_mensaje_at",
    "creado_en": "created_at"
  },
  "chat_mensajes": {
    "latitud": "lat",
    "longitud": "lng",
    "creado_en": "created_at"
  },
  "cosecha_real": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "ciclo_cultivo_id": "cycle_crop_id"
  },
  "costos_fira": {
    "actualizado_en": "updated_at"
  },
  "ciclo": {
    "ciclo_id": "cycle_id",
    "anio_ciclo": "cycle_year",
    "tipo_ciclo": "cycle_type",
    "creado_en": "created_at",
    "cultivo": "crop"
  },
  "ciclo_cultivo": {
    "ciclo_cultivo_id": "cycle_crop_id",
    "ciclo_id": "cycle_id",
    "cultivo": "crop",
    "variedad_id": "variety_id",
    "variedad_otra": "variety_other",
    "superficie_sembrada_ha": "area_sown_ha",
    "superficie_cosechada_ha": "area_harvested_ha",
    "destino": "destination",
    "cantidad_producida": "production_qty",
    "unidad_medida_produccion": "production_unit",
    "creado_en": "created_at",
    "fecha_siembra": "planting_date",
    "fecha_cosecha_estimada": "estimated_harvest_date",
    "rendimiento_esperado": "yield_expected"
  },
  "discrepancias": {
    "creado_en": "creado_at",
    "resuelto_en": "resuelto_at"
  },
  "disponibilidad_productor": {
    "productor_id": "producer_id",
    "variedad_codigo": "variedad_code",
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "encuesta_contexto_territorial": {
    "municipio_id": "municipality_id",
    "nombre_municipio": "municipality_name"
  },
  "encuesta_ediciones": {
    "creado_en": "created_at"
  },
  "encuesta_lineas": {
    "creado_en": "created_at"
  },
  "encuesta_productos": {
    "creado_en": "created_at"
  },
  "encuesta_respuestas": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "estimacion_cosecha": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "actualizado_en": "updated_at",
    "ciclo_cultivo_id": "cycle_crop_id"
  },
  "filtros_guardados_bodega": {
    "creado_en": "created_at"
  },
  "frijol_cultivo": {
    "ciclo_cultivo_id": "cycle_crop_id",
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "frijol_exportaciones": {
    "creado_en": "created_at"
  },
  "frijol_productor": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "frijol_semillas": {
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "geo_municipio": {
    "municipio_id": "municipality_id",
    "estado_id": "state_id",
    "nombre": "name"
  },
  "geo_estado": {
    "estado_id": "state_id",
    "nombre": "name"
  },
  "infraestructura_contactos": {
    "creado_en": "created_at"
  },
  "inventarios": {
    "variedad_codigo": "variedad_code"
  },
  "municipios_referencia": {
    "centroide": "centroid"
  },
  "notificaciones": {
    "creado_en": "created_at"
  },
  "oferta_interes": {
    "creado_en": "created_at"
  },
  "ofertas_bodega": {
    "creado_en": "created_at"
  },
  "precio_parametros": {
    "min_transacciones": "min_txns",
    "actualizado_en": "actualizado_at"
  },
  "precio_referencias_externas": {
    "creado_en": "created_at"
  },
  "precios": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "variedad_codigo": "variedad_code"
  },
  "productor": {
    "productor_id": "producer_id",
    "telefono": "phone",
    "consentimiento_privacidad": "privacy_consent",
    "creado_en": "created_at",
    "estado_id": "state_id",
    "municipio_id": "municipality_id",
    "aviso_privacidad_latitud": "aviso_privacidad_lat",
    "aviso_privacidad_longitud": "aviso_privacidad_lng"
  },
  "productor_cambios": {
    "productor_id": "producer_id",
    "creado_en": "created_at"
  },
  "productor_perfil": {
    "usuario_id": "user_id",
    "estado_id": "state_id",
    "municipio_id": "municipality_id",
    "localidad": "locality",
    "creado_en": "created_at"
  },
  "productor_programa": {
    "productor_id": "producer_id",
    "actualizado_en": "updated_at"
  },
  "propuestas_negociacion": {
    "productor_id": "producer_id",
    "creado_en": "created_at"
  },
  "registro_idempotencia": {
    "creado_en": "created_at"
  },
  "tokens_revocados": {
    "id_jwt": "jti"
  },
  "seguimiento_incidencias": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "ciclo_cultivo_id": "cycle_crop_id"
  },
  "seguimiento_visitas": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "ciclo_cultivo_id": "cycle_crop_id"
  },
  "senal_interesados": {
    "productor_id": "producer_id",
    "creado_en": "created_at"
  },
  "senal_variedades": {
    "variedad_codigo": "variedad_code",
    "creado_en": "created_at"
  },
  "senales_compra": {
    "variedad_codigo": "variedad_code",
    "creado_en": "created_at"
  },
  "senasica_cargas": {
    "creado_en": "created_at"
  },
  "senasica_parametros": {
    "actualizado_en": "updated_at"
  },
  "sesiones": {
    "hash_token": "token_hash",
    "direccion_ip": "ip_address",
    "agente_usuario": "user_agent",
    "creado_en": "created_at",
    "expira_en": "expires_at"
  },
  "solicitud_cambio": {
    "productor_id": "producer_id",
    "escalada_en": "escalada_at",
    "resuelto_en": "resuelto_at",
    "vence_en": "vence_at",
    "creado_en": "created_at"
  },
  "solicitudes_apoyo": {
    "productor_id": "producer_id",
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "supervisor_productores": {
    "productor_id": "producer_id"
  },
  "tarifario_servicios": {
    "actualizado_en": "updated_at"
  },
  "tecnico_zona": {
    "estado_id": "state_id",
    "municipio_id": "municipality_id"
  },
  "transacciones": {
    "productor_id": "producer_id",
    "variedad_codigo": "variedad_code",
    "creado_en": "created_at",
    "actualizado_en": "updated_at"
  },
  "up": {
    "productor_id": "producer_id",
    "nombre_up": "up_name",
    "tipo_up": "up_type",
    "sistema_produccion": "production_system",
    "regimen_hidrico": "water_regime",
    "geometria": "geom",
    "centroide": "centroid",
    "superficie_ha_calculada": "area_ha_calc",
    "nombre_estado": "state_name",
    "nombre_municipio": "municipality_name",
    "estado_id": "state_id",
    "municipio_id": "municipality_id",
    "ubicacion_confirmada": "location_confirmed",
    "motivo_correccion_ubicacion": "location_correction_reason",
    "creado_en": "created_at",
    "actualizado_en": "updated_at",
    "superficie_real_declarada_ha": "area_real_declarada_ha",
    "origen_centroide": "centroid_source",
    "superficie_ha_real": "area_ha_real",
    "coincide_superficie": "coincide_area",
    "posible_traslape_productor_id": "posible_traslape_producer_id"
  },
  "usuarios": {
    "correo_electronico": "email",
    "hash_contrasena": "password_hash",
    "creado_en": "created_at",
    "actualizado_en": "updated_at",
    "estado_id": "state_id",
    "municipio_id": "municipality_id",
    "aviso_privacidad_latitud": "aviso_privacidad_lat",
    "aviso_privacidad_longitud": "aviso_privacidad_lng",
    "push_url": "push_endpoint",
    "push_llave_p256dh": "push_p256dh",
    "push_llave_auth": "push_auth",
    "token_recuperacion": "reset_token",
    "token_recuperacion_expira_en": "reset_token_expires",
    "recuperacion_nip_forzada": "reset_pin_forced",
    "debe_cambiar_contrasena": "debe_cambiar_pass",
    "sesion_activa_id_jwt": "sesion_activa_jti"
  },
  "ventanillas": {
    "creado_en": "created_at"
  }
};

