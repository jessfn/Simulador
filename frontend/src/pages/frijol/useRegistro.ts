import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { conCache, guardarBorrador } from './almacen';
import type { Borrador, CatalogosFrijol, Estado } from './tipos';

/** Catálogos y estados: se piden con señal y se guardan en el teléfono para poder llenar el formulario sin ella. */
export function useCatalogos() {
  const [catalogos, setCatalogos] = useState<CatalogosFrijol | null>(null);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [zona, setZona] = useState<{ state_id: string; municipality_id: string | null }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinDatos, setSinDatos] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      conCache<CatalogosFrijol>('catalogos', () => api.frijol.catalogos() as Promise<CatalogosFrijol>),
      conCache<{ estados: Estado[]; zona: { state_id: string; municipality_id: string | null }[] }>('estados', () => api.frijol.estados() as Promise<{ estados: Estado[]; zona: { state_id: string; municipality_id: string | null }[] }>),
    ]).then(([c, e]) => {
      if (!vivo) return;
      setCatalogos(c); setEstados(e?.estados || []); setZona(e?.zona || []); setSinDatos(!c || !e);
    }).finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, []);

  return { catalogos, estados, zona, cargando, sinDatos };
}

/** Municipios de un estado, con copia local por estado. */
export function useMunicipios(stateId: string) {
  const [municipios, setMunicipios] = useState<{ municipality_id: string; name: string }[]>([]);
  useEffect(() => {
    if (!stateId) { setMunicipios([]); return; }
    let vivo = true;
    conCache<{ municipios: { municipality_id: string; name: string }[] }>(`municipios:${stateId}`, () => api.frijol.municipios(stateId) as Promise<{ municipios: { municipality_id: string; name: string }[] }>)
      .then(r => { if (vivo) setMunicipios(r?.municipios || []); });
    return () => { vivo = false; };
  }, [stateId]);
  return municipios;
}

/**
 * Estado del borrador: cada cambio se guarda en el teléfono (IndexedDB) a los 250 ms, así que si se cierra la app,
 * se apaga el teléfono o se pierde la señal, al volver se puede continuar desde donde se quedó.
 * Solo se guarda cuando ya hay una consulta de CURP exitosa (hasta entonces no hay nada que conservar).
 */
export function useBorrador(inicial: Borrador) {
  const [b, setB] = useState<Borrador>(inicial);
  const ref = useRef(b);
  const temporizador = useRef<number | undefined>(undefined);
  ref.current = b;

  const guardarYa = useCallback(() => {
    if (temporizador.current) { window.clearTimeout(temporizador.current); temporizador.current = undefined; }
    if (ref.current.consulta) void guardarBorrador(ref.current);
  }, []);

  const actualizar = useCallback((fn: (prev: Borrador) => Borrador) => {
    setB(prev => {
      const n = fn(prev);
      ref.current = n;
      if (n.consulta) {
        if (temporizador.current) window.clearTimeout(temporizador.current);
        temporizador.current = window.setTimeout(() => { void guardarBorrador(ref.current); temporizador.current = undefined; }, 250);
      }
      return n;
    });
  }, []);

  // Si se sale de la pantalla con un guardado pendiente, se guarda al instante
  useEffect(() => () => { if (temporizador.current) { window.clearTimeout(temporizador.current); if (ref.current.consulta) void guardarBorrador(ref.current); } }, []);

  return { b, actualizar, guardarYa };
}
