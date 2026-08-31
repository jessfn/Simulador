import axios from 'axios';

const SADER_API_URL = process.env.SADER_API_URL;
const SADER_API_KEY = process.env.SADER_API_KEY;

export interface DatosSADER {
  curp: string;
  rfc: string | null;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  fecha_nacimiento: string | null;
  genero: string | null;
  correo: string | null;
  telefono: string | null;
  estado: string | null;
  municipio: string | null;
  localidad: string | null;
  activo_padron: boolean;
}

// El response real de SADER trae la persona como objeto plano (ln_nombre en raíz),
// pero por robustez desenvolvemos posibles envoltorios (array o key contenedora).
function desenvolverPersona(raw: any): any | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  if (raw.ln_nombre || raw.sn_curp) return raw;
  return raw.data || raw.persona || raw.resultado || raw.respuesta || raw;
}

export async function consultarPersonaPorCURP(
  curp: string
): Promise<DatosSADER | null> {

  if (!SADER_API_URL) {
    throw new Error('SADER_API_URL no configurada en .env');
  }

  try {
    const response = await axios.post(
      SADER_API_URL,
      {
        parametros: {
          id_sn_tipo_persona: 'F',
          curprfc: curp.toUpperCase().trim()
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(SADER_API_KEY ? { 'X-API-KEY': SADER_API_KEY } : {}),
        },
        timeout: 20000
      }
    );

    const d = desenvolverPersona(response.data);
    if (!d || (!d.ln_nombre && !d.sn_curp)) return null;

    // ── Mapeo basado en el response real verificado ──────────────────
    const nombres   = (d.ln_nombre || '').trim();
    const apPaterno = (d.sn_primer_apellido || '').trim();
    const apMaterno = (d.sn_segundo_apellido || '').trim();
    const fechaNac  = d.dt_fecha_nac_const || null; // "15/10/1976"
    const genero    = d.id_sn_genero || null;        // "H" o "M"
    const correo    = d.sn_correo_electronico || null;
    const rfc       = d.sn_rfc || null;

    // Teléfono — data.telefono[0].nu_telefono
    const telefonoArr = Array.isArray(d.telefono) ? d.telefono : [];
    const telefono    = telefonoArr[0]?.nu_telefono || null;

    // Domicilio — domicilio[0].localidad.municipio.estado.ln_nombre_corto
    const domArr     = Array.isArray(d.domicilio) ? d.domicilio : [];
    const dom0       = domArr[0] || null;
    const localidad0 = dom0?.localidad || null;
    const municipio0 = localidad0?.municipio || null;
    const estado0    = municipio0?.estado || null;

    const estado    = estado0?.ln_nombre_corto || null;  // "SONORA"
    const municipio = municipio0?.ln_nombre || null;      // "GUAYMAS"
    const localidad = localidad0?.ln_nombre || null;      // "PÓTAM"

    // Estatus del padrón — si SADER ya tiene el registro (sn_curp/ln_nombre
    // presentes), esa es la fuente de verdad para el registro de cuenta. El
    // cruce con RENAPO es un chequeo interno de SADER que corre después y no
    // se usa para decidir si alguien puede registrarse: el padrón manda.
    const estatusPersona = d.cat_estatus_persona?.sn_estatus_persona || null;
    const tieneData       = !!(d.sn_curp || d.ln_nombre);

    const activo_padron =
      estatusPersona === 'ACTIVO' ||
      (estatusPersona === null && tieneData);

    return {
      curp: d.sn_curp || curp,
      rfc,
      nombres,
      apellido_paterno: apPaterno,
      apellido_materno: apMaterno,
      fecha_nacimiento: fechaNac,
      genero,
      correo,
      telefono,
      estado,
      municipio,
      localidad,
      activo_padron
    };

  } catch (error: any) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}
