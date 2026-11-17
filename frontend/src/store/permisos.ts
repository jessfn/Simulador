import { create } from 'zustand';

export interface Permiso {
  vista:      string;
  sub_accion: string;
  habilitado: boolean;
}

interface PermisosStore {
  permisos:        Permiso[];
  permisosTotal:   boolean;          // rol con acceso absoluto (admin)
  cargados:        boolean;          // ya llegó la respuesta del servidor
  setPermisos:     (p: Permiso[], total?: boolean) => void;
  puedo:           (vista: string, accion: string) => boolean;
  puedeVerVista:   (vista: string) => boolean;
  limpiar:         () => void;
}

export const usePermisosStore = create<PermisosStore>((set, get) => ({
  permisos:      [],
  permisosTotal: false,
  cargados:      false,

  setPermisos: (permisos, total = false) => set({ permisos, permisosTotal: total, cargados: true }),

  puedo: (vista, accion) => {
    if (get().permisosTotal) return true;
    return get().permisos.some(p => p.vista === vista && p.sub_accion === accion && p.habilitado);
  },

  puedeVerVista: (vista) => {
    if (get().permisosTotal) return true;
    return get().permisos.some(p => p.vista === vista && p.sub_accion === 'ver' && p.habilitado);
  },

  limpiar: () => set({ permisos: [], permisosTotal: false, cargados: false }),
}));
