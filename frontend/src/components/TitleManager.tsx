import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SISTEMA = 'Maíz';
const TITULO_BASE = 'SIMAC — Sistema de Información de Mercados Agrícolas y Consulta';

// [ruta, página, área]. Formato final: "Página · Área · SIMAC". Sin área: "Página · SIMAC".
// El orden importa: gana la primera coincidencia.
const RUTAS: Array<[RegExp, string, string?]> = [
  // Entrada
  [/^\/$/, '', ''],
  [/^\/maiz$/, 'Maíz'],
  [/^\/maiz\/bodega\/login$/, 'Acceso para bodega o industria'],
  [/^\/maiz\/bodega\/registro$/, 'Registro de bodega o industria'],
  [/^\/maiz\/productor\/login$/, 'Acceso de productor'],
  [/^\/maiz\/productor\/registro$/, 'Registro de productor'],
  [/^\/maiz\/productor\/recuperar-nip$/, 'Recuperar NIP'],
  [/^\/maiz\/recuperar-password$/, 'Recuperar contraseña'],
  [/^\/maiz\/reset-password\//, 'Nueva contraseña'],
  [/^\/maiz\/tecnico\/login$/, 'Acceso de técnico'],
  [/^\/maiz\/admin\/login$/, 'Acceso de administración'],
  [/^\/maiz\/admin\/registro$/, 'Registro de administración'],

  // Productor
  [/^\/maiz\/productor$/, 'Mi panel', 'Productor'],
  [/^\/maiz\/productor\/disponibilidad/, 'Declarar disponibilidad', 'Productor'],
  [/^\/maiz\/productor\/mapa\/bodega\//, 'Detalle de bodega', 'Productor'],
  [/^\/maiz\/productor\/mapa/, 'Mapa de bodegas', 'Productor'],
  [/^\/maiz\/productor\/ubicacion/, 'Ubicación de mi parcela', 'Productor'],
  [/^\/maiz\/productor\/ciclo/, 'Ciclo productivo', 'Productor'],
  [/^\/maiz\/productor\/precios/, 'Precios', 'Productor'],
  [/^\/maiz\/productor\/propuesta-venta/, 'Propuesta de venta', 'Productor'],
  [/^\/maiz\/productor\/mis-propuestas/, 'Mis propuestas', 'Productor'],
  [/^\/maiz\/productor\/ups\/nueva/, 'Nueva parcela', 'Productor'],
  [/^\/maiz\/productor\/transaccion\//, 'Confirmar transacción', 'Productor'],
  [/^\/maiz\/productor\/alertas/, 'Alertas', 'Productor'],
  [/^\/maiz\/productor\/incentivos/, 'Incentivos', 'Productor'],
  [/^\/maiz\/productor\/ventanillas/, 'Ventanillas de apoyo', 'Productor'],
  [/^\/maiz\/productor\/(solicitud|mis-solicitudes)/, 'Mis solicitudes', 'Productor'],
  [/^\/maiz\/productor\/perfil/, 'Mi perfil', 'Productor'],
  [/^\/maiz\/productor/, 'Productor'],

  // Técnico
  [/^\/maiz\/tecnico$/, 'Mis registros', 'Técnico'],
  [/^\/maiz\/tecnico\/registrar$/, 'Registrar productor', 'Técnico'],
  [/^\/maiz\/tecnico\/registrar\/[^/]+\/datos$/, 'Datos del productor', 'Técnico'],
  [/^\/maiz\/tecnico\/registrar\/[^/]+\/up$/, 'Registrar parcela', 'Técnico'],
  [/^\/maiz\/tecnico\/productor\/[^/]+$/, 'Detalle del productor', 'Técnico'],
  [/^\/maiz\/tecnico\/productor\/[^/]+\/up\/nueva$/, 'Agregar parcela', 'Técnico'],
  [/^\/maiz\/tecnico\/productor\/[^/]+\/ciclo$/, 'Registrar ciclo', 'Técnico'],
  [/^\/maiz\/tecnico\/productor\/[^/]+\/encuesta$/, 'Encuesta de insumos', 'Técnico'],
  [/^\/maiz\/tecnico\/perfil$/, 'Mi perfil', 'Técnico'],
  [/^\/maiz\/tecnico/, 'Técnico'],

  // Administración
  [/^\/maiz\/admin$/, 'Resumen', 'Administración'],
  [/^\/maiz\/admin\/productores\/[^/]+$/, 'Detalle de productor', 'Administración'],
  [/^\/maiz\/admin\/productores/, 'Productores', 'Administración'],
  [/^\/maiz\/admin\/parcelas/, 'Parcelas', 'Administración'],
  [/^\/maiz\/admin\/bodegas\/[^/]+$/, 'Detalle de bodega', 'Administración'],
  [/^\/maiz\/admin\/bodegas/, 'Bodegas', 'Administración'],
  [/^\/maiz\/admin\/tecnicos/, 'Técnicos', 'Administración'],
  [/^\/maiz\/admin\/insumos/, 'Insumos', 'Administración'],
  [/^\/maiz\/admin\/alertas/, 'Alertas', 'Administración'],
  [/^\/maiz\/admin\/chats/, 'Chats de ayuda', 'Administración'],
  [/^\/maiz\/admin\/precios/, 'Precios', 'Administración'],
  [/^\/maiz\/admin\/produccion/, 'Producción', 'Administración'],
  [/^\/maiz\/admin\/mercado/, 'Mercado', 'Administración'],
  [/^\/maiz\/admin\/configuracion/, 'Configuración', 'Administración'],
  [/^\/maiz\/admin\/avisos-privacidad/, 'Avisos de privacidad', 'Administración'],
  [/^\/maiz\/admin\/senasica/, 'SENASICA', 'Administración'],
  [/^\/maiz\/admin\/permisos/, 'Permisos', 'Administración'],
  [/^\/maiz\/admin\/cambiar-password/, 'Cambiar contraseña', 'Administración'],
  [/^\/maiz\/admin\/perfil/, 'Mi perfil', 'Administración'],
  [/^\/maiz\/admin/, 'Administración'],

  // Bodega o industria
  [/^\/maiz\/bodega\/seleccionar/, 'Seleccionar bodegas', 'Bodega'],
  [/^\/maiz\/bodega\/dashboard/, 'Mi panel', 'Bodega'],
  [/^\/maiz\/bodega\/mis-bodegas$/, 'Mis bodegas', 'Bodega'],
  [/^\/maiz\/bodega\/mis-bodegas\/[^/]+\/semaforo/, 'Semáforo', 'Bodega'],
  [/^\/maiz\/bodega\/mis-bodegas\/[^/]+\/editar/, 'Editar bodega', 'Bodega'],
  [/^\/maiz\/bodega\/mis-bodegas\/[^/]+/, 'Detalle de bodega', 'Bodega'],
  [/^\/maiz\/bodega\/onboarding/, 'Configuración inicial', 'Bodega'],
  [/^\/maiz\/bodega\/inventario/, 'Inventario', 'Bodega'],
  [/^\/maiz\/bodega\/precio-diario/, 'Precio diario', 'Bodega'],
  [/^\/maiz\/bodega\/senales\/nueva/, 'Nueva señal de compra', 'Bodega'],
  [/^\/maiz\/bodega\/senales\/[^/]+\/interesados/, 'Interesados', 'Bodega'],
  [/^\/maiz\/bodega\/requerimientos/, 'Requerimientos', 'Bodega'],
  [/^\/maiz\/bodega\/oferta\/mis-intereses/, 'Mis intereses', 'Bodega'],
  [/^\/maiz\/bodega\/oferta/, 'Oferta', 'Bodega'],
  [/^\/maiz\/bodega\/propuestas-disponibles/, 'Propuestas disponibles', 'Bodega'],
  [/^\/maiz\/bodega\/transacciones\/nueva/, 'Nueva transacción', 'Bodega'],
  [/^\/maiz\/bodega\/transacciones\/[^/]+/, 'Detalle de transacción', 'Bodega'],
  [/^\/maiz\/bodega\/transacciones/, 'Transacciones', 'Bodega'],
  [/^\/maiz\/bodega\/tarifario\/proponer/, 'Proponer tarifa', 'Bodega'],
  [/^\/maiz\/bodega\/tarifario/, 'Tarifario', 'Bodega'],
  [/^\/maiz\/bodega\/ventanillas\/nueva/, 'Nueva ventanilla', 'Bodega'],
  [/^\/maiz\/bodega\/ventanillas\/[^/]+\/solicitudes\/[^/]+/, 'Detalle de solicitud', 'Bodega'],
  [/^\/maiz\/bodega\/ventanillas\/[^/]+\/solicitudes/, 'Solicitudes', 'Bodega'],
  [/^\/maiz\/bodega\/ventanillas/, 'Ventanillas', 'Bodega'],
  [/^\/maiz\/bodega\/precios-mercado/, 'Precios de mercado', 'Bodega'],
  [/^\/maiz\/bodega\/notificaciones/, 'Notificaciones', 'Bodega'],
  [/^\/maiz\/bodega\/mas/, 'Más opciones', 'Bodega'],
  [/^\/maiz\/bodega\/perfil/, 'Mi perfil', 'Bodega'],
  [/^\/maiz\/bodega\/configuracion/, 'Configuración', 'Bodega'],
];

export function tituloDePagina(pathname: string): string {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const [patron, pagina, area] of RUTAS) {
    if (!patron.test(ruta)) continue;
    if (pagina === '') return TITULO_BASE;
    if (pagina === 'Maíz') return 'Maíz';
    return area ? `${pagina} · ${area} · ${SISTEMA}` : `${pagina} · ${SISTEMA}`;
  }
  return ruta.startsWith('/maiz') ? 'Maíz' : TITULO_BASE;
}

// Color de la barra de estado del celular y del fondo de la página por pantalla.
// Evita que asome blanco arriba. SIMAC y Maíz usan el verde oscuro de su fondo.
const COLOR_BARRA_NORMAL = '#1A5C38';
// [ruta, fondo de la página, color de la barra de estado]
const TEMAS: Array<[RegExp, string, string]> = [
  [/^\/$/, '#092213', '#092213'],
  [/^\/maiz$/, '#092213', '#092213'],
];

function fondoPorDefecto(): string {
  try { return localStorage.getItem('simac_token') ? '' : '#092213'; } catch { return ''; }
}

function aplicarColorDeMarco(pathname: string) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const html = document.documentElement;
  const body = document.body;
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const tema = TEMAS.find(([patron]) => patron.test(ruta));
  if (tema) {
    meta?.setAttribute('content', tema[2]);
    html.style.background = tema[1];
    body.style.background = tema[1];
  } else {
    meta?.setAttribute('content', COLOR_BARRA_NORMAL);
    html.style.background = fondoPorDefecto();
    body.style.background = '';
  }
}

export default function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = tituloDePagina(pathname);
    aplicarColorDeMarco(pathname);
  }, [pathname]);
  return null;
}
