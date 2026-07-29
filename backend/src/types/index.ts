export interface Usuario {
  id: number;
  email: string;
  curp: string;
  nombre_completo: string;
  password_hash: string;
  telefono: string;
  activo: boolean;
  rol: string;
  state_id?: string;
  municipality_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RegistroPayload {
  email: string;
  curp: string;
  nombre_completo: string;
  password: string;
  telefono: string;
  rol: string;
  state_id: string;
  municipality_id: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface JwtPayload {
  userId:             number;
  email:              string;
  rol:                string;
  estado_asignado?:   string | null;
  debe_cambiar_pass?: boolean;
  es_panel_usuario?:  boolean;
  jti?:               string;
}

export interface Bodega {
  id: number;
  nombre: string;
  clave: string | null;
  descripcion: string | null;
  latitud: number;
  longitud: number;
  direccion: string | null;
  capacidad_m2: number | null;
  estado: string | null;
  municipio: string | null;
  region_id: number | null;
  region_nombre?: string;
  toneladas_total: number;
  toneladas_nacional: number;
  toneladas_importacion: number;
  fecha_actualizacion: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Region {
  id: number;
  nombre: string;
}

export interface KpiAgregado {
  total_bodegas: number;
  total_toneladas: number;
  total_nacional: number;
  total_importacion: number;
}
