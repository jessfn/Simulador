// Tipos del registro de Frijol y del borrador que vive en el teléfono del técnico.

export interface OpcionCatalogo { code: string; label: string }

export interface CatalogosFrijol {
  variedades: OpcionCatalogo[];
  documento_propiedad: OpcionCatalogo[];
  destino_frijol: OpcionCatalogo[];
  tipo_siembra_frijol: OpcionCatalogo[];
  rotacion_cultivo: OpcionCatalogo[];
  tipo_fertilizante: OpcionCatalogo[];
  seguro_agricola: OpcionCatalogo[];
  programas_sader: { clave: string; nombre: string }[];
}

export interface Estado { state_id: string; name: string }
export interface Municipio { municipality_id: string; name: string }

export type CodigoConsulta =
  | 'EN_FRIJOL_PROPIO' | 'EN_FRIJOL_OTRO_TECNICO' | 'EN_SIMAC' | 'PADRON_SADER' | 'RENAPO' | 'NO_VERIFICABLE';

export interface ParcelaExistente {
  up_id: number; up_name: string; numero_up: number | null; area_ha_calc: number | null; area_ha_real: number | null;
  state_id: string | null; state_name: string | null; municipality_id: string | null; municipality_name: string | null;
  localidad: string | null; documento_propiedad: string | null; documento_propiedad_otro: string | null;
  geom_geojson: { type: string; coordinates: unknown } | null; ciclos_frijol: string[]; tiene_frijol: boolean;
}

export interface DatosPersonales {
  nombres: string; apellido_paterno: string; apellido_materno: string; sexo: 'H' | 'M' | '';
  fecha_nacimiento: string; telefono: string; correo: string;
}

export interface Complementaria {
  total_ups: number; participa: boolean | null; programas_sader: string[]; programas_otro: string;
  organizacion: string; seguro: string; seguro_nombre: string;
}

export interface ParcelaBorrador {
  modo: 'existente' | 'nueva' | null;
  up_id: number | null;
  nombre: string; numero_up: number | null; state_id: string; municipality_id: string; localidad: string;
  documento: string; documento_otro: string; regimen: 'temporal' | 'riego' | '';
  /** vértices que se van marcando (se guardan al instante, incluso sin cerrar el polígono) */
  vertices: [number, number][];
  /** polígono cerrado [lat,lng] */
  poligono: [number, number][] | null;
  area_calc_ha: number | null; area_real_ha: string; motivo_diferencia: string;
}

export interface Semillas { dedica: boolean | null; trabajo_prosebien: boolean | null; usara_prosebien: boolean | null }

export interface CultivoBorrador {
  fecha_siembra: string; cycle_type: string; fecha_cosecha: string; variety_id: string; variety_other: string;
  area_sembrada_ha: string; rendimiento: string; densidad: string; usa_fertilizante: boolean | null; tipos_fertilizante: string[];
  rotacion: string; tipo_siembra: string; destino: string; observaciones: string; sin_observaciones: boolean;
}

export interface Borrador {
  id: string;                       // también es la Idempotency-Key del envío
  creado: string;
  actualizado: string;
  paso: number;                     // 1..7
  estado: 'borrador' | 'listo_para_enviar';
  capturado_en: string;
  hubo_desconexion: boolean;
  curp: string;
  consulta: {
    codigo: CodigoConsulta; producer_id?: number; token_verificacion?: string;
    parcelas?: ParcelaExistente[]; tiene_cuenta?: boolean; telefono_original?: string;
    /** T10: datos personales que ya no se pueden cambiar directo (edición única usada, o teléfono con cuenta) */
    bloqueados?: string[];
  } | null;
  productor: DatosPersonales;
  complementaria: Complementaria;
  complementaria_resumen: boolean;  // true cuando se muestra en modo resumen (productor ya tiene esa información)
  parcela: ParcelaBorrador;
  semillas: Semillas;
  cultivo: CultivoBorrador;
  confirmacion: boolean;
}

export interface RespuestaRegistro {
  producer_id: number; up_id: number; id_parcela: number; cycle_id: number; cycle_crop_id: number;
  verificacion_identidad: 'verificada' | 'pendiente' | 'no_valida'; estatus_registro: string; ciclo: string;
  avisos: string[]; cumple_criterio_semillas: boolean; repetido?: boolean;
}

export const NOMBRES_PASOS = [
  'Buscar productor', 'Datos del productor', 'Información complementaria', 'Parcela', 'Semillas', 'Cultivo de frijol', 'Revisar y enviar',
];
