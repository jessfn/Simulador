import { api } from '../../services/api';
import { guardarCache, leerCache } from './almacen';
import type { CatalogosFrijol, Estado, Municipio } from './tipos';

// Descarga de una vez, con señal, todo lo que el formulario necesita para capturar en campo.
// Se guarda con las mismas claves que leen useCatalogos, useMunicipios y useLocalidades, así que el formulario no cambia.

const CLAVE_ESTADO_PRECARGA = 'precarga';
const VIGENCIA_MS = 24 * 60 * 60 * 1000;

type Zona = { state_id: string; municipality_id: string | null }[];

export interface EstadoPrecarga {
  /** fecha ISO de la última descarga completa */
  actualizado: string;
  /** estados de la zona del técnico cuyas localidades quedaron en el teléfono */
  estadosConLocalidades: string[];
  /** estados de la zona que no se pudieron descargar (se reintentan en la siguiente descarga) */
  estadosPendientes: string[];
}

export function leerEstadoPrecarga(): Promise<EstadoPrecarga | null> {
  return leerCache<EstadoPrecarga>(CLAVE_ESTADO_PRECARGA);
}

const estadosDeZona = (zona: Zona) => Array.from(new Set(zona.map(z => z.state_id))).sort();

/** Descarga catálogos, estados, municipios del país y localidades de la zona. Sin señal o con descarga reciente no hace nada. */
export async function precargarSinConexion(forzar = false): Promise<EstadoPrecarga | null> {
  const anterior = await leerEstadoPrecarga();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return anterior;

  let estados: { estados: Estado[]; zona: Zona };
  try {
    // La zona se pide siempre (es pequeña): si el administrador la cambió, la descarga se repite aunque sea reciente.
    estados = await api.frijol.estados() as { estados: Estado[]; zona: Zona };
    await guardarCache('estados', estados);
    const vigente = anterior && Date.now() - new Date(anterior.actualizado).getTime() < VIGENCIA_MS
      && anterior.estadosPendientes.length === 0 && estadosDeZona(estados.zona).every(estado => anterior.estadosConLocalidades.includes(estado));
    if (vigente && !forzar) return anterior;
    const [catalogos, municipiosDelPais] = await Promise.all([
      api.frijol.catalogos() as Promise<CatalogosFrijol>,
      api.frijol.municipiosDelPais() as Promise<{ municipios: [string, string][] }>,
    ]);
    await guardarCache('catalogos', catalogos);
    await guardarMunicipiosPorEstado(municipiosDelPais.municipios);
  } catch {
    return anterior;
  }

  // Las localidades van por estado; si uno falla, los demás quedan guardados y ese se reintenta después.
  const estadosConLocalidades: string[] = [];
  const estadosPendientes: string[] = [];
  for (const estado of estadosDeZona(estados.zona)) {
    try {
      const respuesta = await api.frijol.localidades(estado) as { localidades: [string, string][] };
      await guardarCache(`localidades:${estado}`, respuesta);
      estadosConLocalidades.push(estado);
    } catch {
      estadosPendientes.push(estado);
    }
  }

  // El navegador puede borrar lo guardado si el teléfono se queda sin espacio (o tras días sin uso en iPhone); se pide conservarlo.
  try { await navigator.storage?.persist?.(); } catch { /* el navegador decide */ }

  const nuevo: EstadoPrecarga = { actualizado: new Date().toISOString(), estadosConLocalidades, estadosPendientes };
  await guardarCache(CLAVE_ESTADO_PRECARGA, nuevo);
  return nuevo;
}

async function guardarMunicipiosPorEstado(municipiosDelPais: [string, string][]): Promise<void> {
  const porEstado = new Map<string, Municipio[]>();
  for (const [clave, nombre] of municipiosDelPais) {
    const estado = clave.slice(0, 2);
    if (!porEstado.has(estado)) porEstado.set(estado, []);
    porEstado.get(estado)!.push({ municipality_id: clave, name: nombre });
  }
  for (const [estado, municipios] of porEstado) await guardarCache(`municipios:${estado}`, { municipios });
}
