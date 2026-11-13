// Reglas de ubicación y superficie de una parcela, calculadas en el servidor con PostGIS y los contornos de geo_estado.

type ConexionBd = { query: (texto: string, valores?: unknown[]) => Promise<{ rows: any[] }> };

export const SUPERFICIE_MAXIMA_HA = 50;
// Los contornos están simplificados a 100 m: una parcela en la costa o en la frontera puede salir un poco.
const FRACCION_MINIMA_DENTRO_DE_MEXICO = 0.9;

export type ErrorUbicacion = { ok: false; status: 400 | 409; codigo: string; mensaje: string };
export type UbicacionValidada = {
  ok: true;
  geojson: string;
  superficieHa: number;
  estadoId: string;
  estadoNombre: string;
  puntoInterior: { lat: number; lng: number };
};

const formatoHa = (valor: number) => valor.toLocaleString('es-MX', { maximumFractionDigits: 2 });

function esCoordenadaValida(punto: unknown): punto is [number, number] {
  if (!Array.isArray(punto) || punto.length < 2) return false;
  const [latitud, longitud] = punto;
  return Number.isFinite(latitud) && Number.isFinite(longitud) && Math.abs(latitud) <= 90 && Math.abs(longitud) <= 180;
}

/** Convierte la lista de puntos [lat, lng] que manda la app en un polígono GeoJSON cerrado, o null si no es válida. */
export function poligonoAGeoJSON(poligono: unknown): string | null {
  if (!Array.isArray(poligono) || poligono.length < 3 || !poligono.every(esCoordenadaValida)) return null;
  const anillo = poligono.map(([latitud, longitud]) => [longitud, latitud]);
  anillo.push(anillo[0]);
  return JSON.stringify({ type: 'Polygon', coordinates: [anillo] });
}

/** Rechaza superficies declaradas que no son positivas o pasan del tope; null significa que no se declaró. */
export function validarSuperficieDeclarada(valor: unknown): { ok: true; superficieHa: number | null } | ErrorUbicacion {
  if (valor === undefined || valor === null || valor === '') return { ok: true, superficieHa: null };
  const superficieHa = Number(valor);
  if (!Number.isFinite(superficieHa) || superficieHa <= 0) {
    return { ok: false, status: 400, codigo: 'SUPERFICIE_INVALIDA', mensaje: 'La superficie de la parcela debe ser un número mayor a 0.' };
  }
  if (superficieHa > SUPERFICIE_MAXIMA_HA) {
    return { ok: false, status: 409, codigo: 'SUPERFICIE_EXCEDIDA', mensaje: `La superficie de una parcela no puede pasar de ${SUPERFICIE_MAXIMA_HA} ha. Revisa el dato o registra el terreno en varias parcelas.` };
  }
  return { ok: true, superficieHa };
}

/** Calcula superficie, estado y un punto interior del polígono, y rechaza trazos inválidos, fuera de México o demasiado grandes. */
export async function validarUbicacionParcela(conexion: ConexionBd, poligono: unknown): Promise<UbicacionValidada | ErrorUbicacion> {
  const geojson = poligonoAGeoJSON(poligono);
  if (!geojson) {
    return { ok: false, status: 400, codigo: 'POLIGONO_INVALIDO', mensaje: 'El trazo de la parcela no es válido. Marca al menos 3 puntos en el mapa.' };
  }

  const resultado = await conexion.query(
    `WITH trazo AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1::text), 4326) AS geometria),
          estados AS (
            -- Si la parcela cabe completa en el estado se evita recortar el contorno, que es lo más costoso.
            SELECT estado.estado_id, estado.nombre,
                   CASE WHEN ST_CoveredBy(trazo.geometria, estado.geometria) THEN ST_Area(trazo.geometria::geography)
                        ELSE ST_Area(ST_Intersection(estado.geometria, trazo.geometria)::geography) END AS area_comun_m2
              FROM geo_estado estado, trazo
             WHERE ST_IsValid(trazo.geometria) AND ST_Intersects(estado.geometria, trazo.geometria))
     SELECT ST_IsValid(trazo.geometria) AS es_valido,
            ST_Area(trazo.geometria::geography) / 10000.0 AS superficie_ha,
            ST_Y(ST_PointOnSurface(trazo.geometria)) AS latitud_interior,
            ST_X(ST_PointOnSurface(trazo.geometria)) AS longitud_interior,
            (SELECT COALESCE(SUM(area_comun_m2), 0) FROM estados) AS area_en_mexico_m2,
            (SELECT estado_id FROM estados ORDER BY area_comun_m2 DESC LIMIT 1) AS estado_id,
            (SELECT nombre FROM estados ORDER BY area_comun_m2 DESC LIMIT 1) AS estado_nombre
       FROM trazo`,
    [geojson]
  );
  const calculo = resultado.rows[0];

  if (!calculo.es_valido) {
    return { ok: false, status: 400, codigo: 'POLIGONO_INVALIDO', mensaje: 'El trazo de la parcela se cruza consigo mismo. Vuelve a dibujarlo siguiendo el borde en orden.' };
  }
  const superficieHa = Number(calculo.superficie_ha);
  if (!(superficieHa > 0)) {
    return { ok: false, status: 400, codigo: 'POLIGONO_INVALIDO', mensaje: 'El trazo de la parcela no tiene superficie. Marca al menos 3 puntos distintos.' };
  }
  if (superficieHa > SUPERFICIE_MAXIMA_HA) {
    return { ok: false, status: 409, codigo: 'SUPERFICIE_EXCEDIDA', mensaje: `La parcela dibujada mide ${formatoHa(superficieHa)} ha y el máximo por parcela es ${SUPERFICIE_MAXIMA_HA} ha. Revisa el trazo o registra el terreno en varias parcelas.` };
  }
  const fraccionEnMexico = Number(calculo.area_en_mexico_m2) / (superficieHa * 10000);
  if (!calculo.estado_id || fraccionEnMexico < FRACCION_MINIMA_DENTRO_DE_MEXICO) {
    return { ok: false, status: 409, codigo: 'PARCELA_FUERA_DE_MEXICO', mensaje: 'La parcela dibujada queda fuera del territorio nacional. Revisa el trazo en el mapa.' };
  }

  return {
    ok: true,
    geojson,
    superficieHa,
    estadoId: calculo.estado_id,
    estadoNombre: calculo.estado_nombre,
    puntoInterior: { lat: Number(calculo.latitud_interior), lng: Number(calculo.longitud_interior) },
  };
}

export type DatosDeParcelaValidados = {
  ok: true;
  geojson: string | null;
  superficieCalculadaHa: number | null;
  superficieDeclaradaHa: number | null;
  estadoId: string | null;
  estadoNombre: string | null;
  latitudCentro: number | null;
  longitudCentro: number | null;
};

/**
 * Valida lo que manda la app al guardar una parcela. Con polígono, la superficie, el estado y el centro los calcula el servidor;
 * sin polígono, solo se revisa que el punto esté en México y que la superficie de la app no pase del tope.
 */
export async function validarDatosDeParcela(
  conexion: ConexionBd,
  datos: { poligono: unknown; latitud: unknown; longitud: unknown; superficieApp: unknown; superficieDeclarada: unknown; conPostgis: boolean }
): Promise<DatosDeParcelaValidados | ErrorUbicacion> {
  // Primero el trazo y la ubicación: si la parcela está mal dibujada o fuera de México, lo declarado no importa.
  if (datos.poligono && datos.conPostgis) {
    const ubicacion = await validarUbicacionParcela(conexion, datos.poligono);
    if (!ubicacion.ok) return ubicacion;
    const superficieDeclarada = validarSuperficieDeclarada(datos.superficieDeclarada);
    if (!superficieDeclarada.ok) return superficieDeclarada;
    return {
      ok: true, geojson: ubicacion.geojson, superficieCalculadaHa: ubicacion.superficieHa, superficieDeclaradaHa: superficieDeclarada.superficieHa,
      estadoId: ubicacion.estadoId, estadoNombre: ubicacion.estadoNombre,
      latitudCentro: ubicacion.puntoInterior.lat, longitudCentro: ubicacion.puntoInterior.lng,
    };
  }

  const latitud = Number(datos.latitud);
  const longitud = Number(datos.longitud);
  // La app manda 0,0 cuando no tiene ubicación; se trata igual que si no hubiera punto.
  const tienePunto = datos.latitud != null && datos.longitud != null && latitud !== 0 && longitud !== 0;
  if (tienePunto && datos.conPostgis && !(await puntoDentroDeMexico(conexion, latitud, longitud))) {
    return { ok: false, status: 409, codigo: 'PARCELA_FUERA_DE_MEXICO', mensaje: 'La ubicación marcada queda fuera del territorio nacional. Revisa el punto en el mapa.' };
  }
  const superficieApp = validarSuperficieDeclarada(datos.superficieApp);
  if (!superficieApp.ok) return superficieApp;
  const superficieDeclarada = validarSuperficieDeclarada(datos.superficieDeclarada);
  if (!superficieDeclarada.ok) return superficieDeclarada;
  return {
    ok: true, geojson: null, superficieCalculadaHa: superficieApp.superficieHa, superficieDeclaradaHa: superficieDeclarada.superficieHa,
    estadoId: null, estadoNombre: null,
    latitudCentro: tienePunto ? latitud : null, longitudCentro: tienePunto ? longitud : null,
  };
}

/** Indica si un punto suelto (sin polígono) cae dentro de México. */
export async function puntoDentroDeMexico(conexion: ConexionBd, latitud: number, longitud: number): Promise<boolean> {
  if (!esCoordenadaValida([latitud, longitud])) return false;
  const resultado = await conexion.query(
    `SELECT EXISTS (SELECT 1 FROM geo_estado
                     WHERE ST_Intersects(geometria, ST_Buffer(ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 1000)::geometry)) AS dentro`,
    [longitud, latitud]
  );
  return resultado.rows[0].dentro === true;
}
