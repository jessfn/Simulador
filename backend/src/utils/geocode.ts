import pool from '../config/database';

export interface GeoResult {
  state_id: string | null;
  state_name: string | null;
  municipality_id: string | null;
  municipality_name: string | null;
  source: 'catalogo' | 'osm' | 'none';
}

/** Normaliza para comparar: sin acentos, minúsculas, sin prefijos ni signos. */
function norm(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')              // descompone acentos: é -> e + ́
    .replace(/[̀-ͯ]/g, '') // elimina las marcas combinantes (acentos)
    .toLowerCase()
    .replace(/^municipio de /, '')
    .replace(/^delegaci[o] /, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

/**
 * Extrae estado y municipio de la respuesta `address` de Nominatim,
 * con la prioridad correcta para México (municipio = admin level 6):
 * county → borough → municipality → city_district → town → village → city.
 */
function extraerEstadoMunicipio(address: Record<string, string> = {}): { estado: string; municipio: string } {
  const estado = address.state || address.region || address.state_district || '';
  const municipio =
    address.county ||
    address.borough ||
    address.municipality ||
    address.city_district ||
    address.town ||
    address.village ||
    address.city ||
    address.suburb ||
    '';
  return { estado, municipio };
}

/**
 * Canonicaliza solo un nombre de estado contra geo_state.
 * Útil cuando el nombre viene del padrón (ej. "MICHOACAN" → "Michoacán de Ocampo").
 * Devuelve { state_id, state_name } con el nombre oficial, o los originales si no hay match.
 */
export async function canonicalizarEstado(
  estadoRaw: string, municipioRaw?: string
): Promise<{ state_id: string | null; state_name: string; municipality_id: string | null; municipality_name: string }> {
  if (!estadoRaw) return { state_id: null, state_name: estadoRaw, municipality_id: null, municipality_name: municipioRaw || '' };
  const result = await canonicalizar(estadoRaw, municipioRaw || '');
  return {
    state_id: result.state_id,
    state_name: result.state_name || estadoRaw,
    municipality_id: result.municipality_id,
    municipality_name: result.municipality_name || municipioRaw || '',
  };
}

/** Canonicaliza nombres OSM contra el catálogo geo_state / geo_municipality. */
async function canonicalizar(estadoRaw: string, municipioRaw: string): Promise<GeoResult> {
  const result: GeoResult = {
    state_id: null, state_name: estadoRaw || null,
    municipality_id: null, municipality_name: municipioRaw || null,
    source: estadoRaw || municipioRaw ? 'osm' : 'none',
  };
  if (!estadoRaw) return result;

  const eN = norm(estadoRaw);
  const states = (await pool.query('SELECT estado_id, nombre FROM geo_estado')).rows as { state_id: string; name: string }[];
  let state =
    states.find(s => norm(s.name) === eN) ||
    states.find(s => eN && (norm(s.name).includes(eN) || eN.includes(norm(s.name))));
  if (!state) return result;

  result.state_id = state.state_id;
  result.state_name = state.name; // nombre canónico del catálogo
  result.source = 'catalogo';

  if (!municipioRaw) return result;
  const mN = norm(municipioRaw);
  // IMPORTANTE: filtrar municipios por el estado correcto (hay homónimos como Cuauhtémoc)
  const munis = (await pool.query(
    'SELECT municipio_id, nombre FROM geo_municipio WHERE estado_id = $1',
    [state.state_id]
  )).rows as { municipality_id: string; name: string }[];

  let muni =
    munis.find(m => norm(m.name) === mN) ||
    munis.find(m => mN && (norm(m.name).includes(mN) || mN.includes(norm(m.name))));
  if (muni) {
    result.municipality_id = muni.municipality_id;
    result.municipality_name = muni.name; // nombre canónico
  }
  return result;
}

/**
 * Reverse-geocoding: dadas coordenadas, devuelve el estado y municipio exactos.
 * Usa Nominatim (OSM) y canonicaliza contra el catálogo del sistema.
 * Nunca lanza: ante cualquier fallo devuelve un GeoResult vacío.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult> {
  let estadoRaw = '';
  let municipioRaw = '';
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
      `&zoom=10&accept-language=es&addressdetails=1`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SIMAC-PlanMaiz2026/1.0 (contacto@agricultura.gob.mx)' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.ok) {
      const j: any = await r.json();
      const ext = extraerEstadoMunicipio(j.address || {});
      estadoRaw = ext.estado;
      municipioRaw = ext.municipio;
    }
  } catch (err) {
    console.warn('[geocode] reverse falló:', (err as Error).message);
  }

  try {
    return await canonicalizar(estadoRaw, municipioRaw);
  } catch (err) {
    console.warn('[geocode] canonicalizar falló:', (err as Error).message);
    return {
      state_id: null, state_name: estadoRaw || null,
      municipality_id: null, municipality_name: municipioRaw || null,
      source: estadoRaw ? 'osm' : 'none',
    };
  }
}
