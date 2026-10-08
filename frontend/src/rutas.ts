// Rutas de la app. Todo el módulo de Maíz vive bajo /maiz; la portada de SIMAC es "/".
// `aRutaNueva` traduce las rutas anteriores (enlaces ya enviados a productores, correos,
// notificaciones, favoritos) a las actuales para que sigan funcionando.

const BODEGA = 'dashboard|mis-bodegas|onboarding|inventario|precio-diario|senales|requerimientos|oferta|' +
  'propuestas-disponibles|transacciones|tarifario|ventanillas|mas|precios-mercado|notificaciones|perfil|configuracion';
const FIN = '(?=[/?#]|$)';

const REGLAS: Array<[RegExp, (m: RegExpMatchArray, resto: string) => string]> = [
  [new RegExp('^/inicio' + FIN), (_m, r) => '/' + r],
  [new RegExp('^/bienvenida' + FIN), (_m, r) => '/maiz' + r],
  [new RegExp('^/login-productor' + FIN), (_m, r) => '/maiz/productor/login' + r],
  [new RegExp('^/registro-nuevo' + FIN), (_m, r) => '/maiz/productor/registro' + r],
  [new RegExp('^/recuperar-nip' + FIN), (_m, r) => '/maiz/productor/recuperar-nip' + r],
  [new RegExp('^/recuperar-password' + FIN), (_m, r) => '/maiz/recuperar-password' + r],
  [new RegExp('^/reset-password' + FIN), (_m, r) => '/maiz/reset-password' + r],
  [new RegExp('^/login' + FIN), (_m, r) => '/maiz/bodega/login' + r],
  [new RegExp('^/registro' + FIN), (_m, r) => '/maiz/bodega/registro' + r],
  [new RegExp('^/(productor|tecnico|admin)' + FIN), (m, r) => '/maiz/' + m[1] + r],
  [new RegExp('^/bodegas/seleccionar' + FIN), (_m, r) => '/maiz/bodega/seleccionar' + r],
  [new RegExp('^/bodegas' + FIN), (_m, r) => '/maiz/bodega/mis-bodegas' + r],
  [new RegExp('^/(' + BODEGA + ')' + FIN), (m, r) => '/maiz/bodega/' + m[1] + r],
];

/** Devuelve la ruta actual equivalente a una ruta anterior, o null si no es una ruta anterior. */
export function aRutaNueva(rutaCompleta: string): string | null {
  const i = rutaCompleta.search(/[?#]/);
  const ruta = i === -1 ? rutaCompleta : rutaCompleta.slice(0, i);
  const cola = i === -1 ? '' : rutaCompleta.slice(i);
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta;
  for (const [rx, fn] of REGLAS) {
    const m = limpia.match(rx);
    if (m) return fn(m, limpia.slice(m[0].length)) + cola;
  }
  return null;
}
