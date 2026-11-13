import { apiFetch } from './api';

const nombreDeArchivo = (rutaGuardada: string) => rutaGuardada.split('/').pop() ?? '';

export async function descargarFotoVerificacion(rutaGuardada: string): Promise<Blob | null> {
  const res = await apiFetch(`/fotos-verificacion/${encodeURIComponent(nombreDeArchivo(rutaGuardada))}`);
  return res.ok ? res.blob() : null;
}

/** Para documentos que se abren en otra ventana, donde no llega la sesión. */
export async function fotoVerificacionComoDataUrl(rutaGuardada: string | null): Promise<string | null> {
  if (!rutaGuardada) return null;
  try {
    const foto = await descargarFotoVerificacion(rutaGuardada);
    if (!foto) return null;
    return await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as string);
      lector.onerror = () => reject(lector.error);
      lector.readAsDataURL(foto);
    });
  } catch {
    return null;
  }
}
