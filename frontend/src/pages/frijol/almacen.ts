import type { Borrador } from './tipos';

// Almacenamiento en el teléfono con IndexedDB (no sessionStorage: sobrevive a cerrar la pestaña o la app).
// Dos "cajones": borradores del registro y caché de catálogos para poder llenar el formulario sin señal.
const BD = 'simac-frijol';
const VERSION = 1;
const BORRADORES = 'borradores';
const CACHE = 'cache';

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (abierta) return abierta;
  abierta = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Sin IndexedDB')); return; }
    const req = indexedDB.open(BD, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BORRADORES)) db.createObjectStore(BORRADORES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { abierta = null; reject(req.error); };
  });
  return abierta;
}

function tx<T>(almacen: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(almacen, modo);
    const r = fn(t.objectStore(almacen));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

// ── Borradores ──────────────────────────────────────────────────────────────
export async function guardarBorrador(b: Borrador): Promise<void> {
  try { await tx(BORRADORES, 'readwrite', s => s.put({ ...b, actualizado: new Date().toISOString() })); }
  catch { /* sin almacenamiento: el formulario sigue funcionando en memoria */ }
}

export async function leerBorrador(id: string): Promise<Borrador | null> {
  try { return ((await tx(BORRADORES, 'readonly', s => s.get(id))) as Borrador | undefined) ?? null; } catch { return null; }
}

export async function borrarBorrador(id: string): Promise<void> {
  try { await tx(BORRADORES, 'readwrite', s => s.delete(id)); } catch { /* nada */ }
}

export async function listarBorradores(): Promise<Borrador[]> {
  try {
    const todos = (await tx(BORRADORES, 'readonly', s => s.getAll())) as Borrador[];
    return todos.sort((a, b) => b.actualizado.localeCompare(a.actualizado));
  } catch { return []; }
}

// ── Caché (catálogos, estados, municipios) ──────────────────────────────────
export async function guardarCache<T>(clave: string, valor: T): Promise<void> {
  try { await tx(CACHE, 'readwrite', s => s.put(valor, clave)); } catch { /* nada */ }
}

export async function leerCache<T>(clave: string): Promise<T | null> {
  try { return ((await tx(CACHE, 'readonly', s => s.get(clave))) as T | undefined) ?? null; } catch { return null; }
}

/** Intenta la red y guarda copia; si no hay señal usa la copia guardada. */
export async function conCache<T>(clave: string, pedir: () => Promise<T>): Promise<T | null> {
  try {
    const v = await pedir();
    void guardarCache(clave, v);
    return v;
  } catch {
    return leerCache<T>(clave);
  }
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'b-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
