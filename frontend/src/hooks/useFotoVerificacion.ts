import { useEffect, useState } from 'react';
import { descargarFotoVerificacion } from '../services/fotosVerificacion';

/** URL local de la foto de verificación, descargada con la sesión del panel. */
export function useFotoVerificacion(rutaGuardada: string | null): string | null {
  const [fotoCargada, setFotoCargada] = useState<{ ruta: string; url: string } | null>(null);

  useEffect(() => {
    if (!rutaGuardada) return;
    let cancelado = false;
    let urlCreada: string | null = null;
    descargarFotoVerificacion(rutaGuardada)
      .then(foto => {
        if (cancelado || !foto) return;
        urlCreada = URL.createObjectURL(foto);
        setFotoCargada({ ruta: rutaGuardada, url: urlCreada });
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
  }, [rutaGuardada]);

  return fotoCargada?.ruta === rutaGuardada ? fotoCargada.url : null;
}
