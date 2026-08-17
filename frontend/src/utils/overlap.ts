import { polygon, featureCollection } from '@turf/helpers';
import area from '@turf/area';
import intersect from '@turf/intersect';

export interface ParcelaExistente {
  id: number;
  /** Vértices en formato [lat, lng], igual que usa Leaflet. */
  pos: [number, number][];
}

export interface ResultadoTraslape {
  /** true si el polígono nuevo se superpone más allá del umbral permitido. */
  bloqueado: boolean;
  /** Porcentaje de área del polígono nuevo cubierta por la parcela en conflicto (0-1). */
  pct: number;
  /** id de la parcela existente con la que se traslapa (si aplica). */
  idConflicto?: number;
  /** true si la parcela en conflicto es una parcela PROPIA (no de otro productor). */
  esPropia?: boolean;
}

/** Traslape con parcela de OTRO productor: se permite hasta 10% (linderos
 *  compartidos); más que eso bloquea — igual que el backend. */
const UMBRAL_BLOQUEO_AJENA = 0.10;

function aFeature(verticesLatLng: [number, number][]) {
  const ring = [...verticesLatLng.map(([lat, lng]) => [lng, lat]), [verticesLatLng[0][1], verticesLatLng[0][0]]];
  return polygon([ring]);
}

/**
 * Calcula si el polígono que el usuario está dibujando se traslapa
 * significativamente con alguna parcela ya existente. Replica en el
 * cliente la misma regla que aplica el backend, para dar feedback
 * inmediato en vez de que el usuario descubra el rechazo hasta guardar.
 *
 * Regla asimétrica (igual que el backend): contra una parcela PROPIA
 * (misUpIds) se bloquea con CUALQUIER traslape, por mínimo que sea —
 * un productor nunca debería tener dos parcelas suyas encimadas. Contra
 * una parcela de OTRO productor se tolera hasta 10% (linderos
 * compartidos) antes de bloquear.
 */
export function calcularTraslape(
  nuevoPoligono: [number, number][],
  existentes: ParcelaExistente[],
  excluirIds: number[] = [],
  misUpIds: number[] = []
): ResultadoTraslape {
  if (nuevoPoligono.length < 3) return { bloqueado: false, pct: 0 };

  let featNuevo;
  try {
    featNuevo = aFeature(nuevoPoligono);
  } catch {
    return { bloqueado: false, pct: 0 };
  }
  const areaNuevo = area(featNuevo);
  if (!areaNuevo) return { bloqueado: false, pct: 0 };

  const excluir = new Set(excluirIds);
  const propias = new Set(misUpIds);
  let peor: ResultadoTraslape = { bloqueado: false, pct: 0 };

  for (const existente of existentes) {
    if (excluir.has(existente.id) || existente.pos.length < 3) continue;
    let featExistente;
    try {
      featExistente = aFeature(existente.pos);
    } catch {
      continue;
    }
    let interseccion;
    try {
      interseccion = intersect(featureCollection([featNuevo, featExistente]));
    } catch {
      continue;
    }
    if (!interseccion) continue;

    const areaInterseccion = area(interseccion);
    const pct = areaInterseccion / areaNuevo;
    if (pct <= 0) continue;

    const esPropia = propias.has(existente.id);
    const bloqueado = esPropia ? true : pct > UMBRAL_BLOQUEO_AJENA;

    // Prioriza mostrar el conflicto que efectivamente bloquea; si ninguno
    // bloquea, se queda con el de mayor porcentaje.
    if (bloqueado && !peor.bloqueado) {
      peor = { bloqueado, pct, idConflicto: existente.id, esPropia };
    } else if (bloqueado === peor.bloqueado && pct > peor.pct) {
      peor = { bloqueado, pct, idConflicto: existente.id, esPropia };
    }
  }

  return peor;
}
