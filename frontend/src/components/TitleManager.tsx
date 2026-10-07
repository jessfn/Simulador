import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SISTEMA = 'SIMAC';
const TITULO_BASE = 'SIMAC — Sistema de Información de Mercados Agrícolas y Consulta';

// [ruta, página, área]. Formato final: "Página · Área · SIMAC". Sin área: "Página · SIMAC".
// El orden importa: gana la primera coincidencia.
const RUTAS: Array<[RegExp, string, string?]> = [
  // Entrada
  [/^\/inicio$/, '', ''],
  [/^\/bienvenida$/, 'Maíz'],
  [/^\/login$/, 'Acceso para bodega o industria'],
  [/^\/registro$/, 'Registro de bodega o industria'],
  [/^\/login-productor$/, 'Acceso de productor'],
  [/^\/registro-nuevo$/, 'Registro de productor'],
  [/^\/recuperar-nip$/, 'Recuperar NIP'],
  [/^\/recuperar-password$/, 'Recuperar contraseña'],
  [/^\/reset-password\//, 'Nueva contraseña'],
  [/^\/tecnico\/login$/, 'Acceso de técnico'],
  [/^\/admin\/login$/, 'Acceso de administración'],
  [/^\/admin\/registro$/, 'Registro de administración'],

  // Productor
  [/^\/productor$/, 'Mi panel', 'Productor'],
  [/^\/productor\/disponibilidad/, 'Declarar disponibilidad', 'Productor'],
  [/^\/productor\/mapa\/bodega\//, 'Detalle de bodega', 'Productor'],
  [/^\/productor\/mapa/, 'Mapa de bodegas', 'Productor'],
  [/^\/productor\/ubicacion/, 'Ubicación de mi parcela', 'Productor'],
  [/^\/productor\/ciclo/, 'Ciclo productivo', 'Productor'],
  [/^\/productor\/precios/, 'Precios', 'Productor'],
  [/^\/productor\/propuesta-venta/, 'Propuesta de venta', 'Productor'],
  [/^\/productor\/mis-propuestas/, 'Mis propuestas', 'Productor'],
  [/^\/productor\/ups\/nueva/, 'Nueva parcela', 'Productor'],
  [/^\/productor\/transaccion\//, 'Confirmar transacción', 'Productor'],
  [/^\/productor\/alertas/, 'Alertas', 'Productor'],
  [/^\/productor\/incentivos/, 'Incentivos', 'Productor'],
  [/^\/productor\/ventanillas/, 'Ventanillas de apoyo', 'Productor'],
  [/^\/productor\/(solicitud|mis-solicitudes)/, 'Mis solicitudes', 'Productor'],
  [/^\/productor\/perfil/, 'Mi perfil', 'Productor'],
  [/^\/productor/, 'Productor'],

  // Técnico
  [/^\/tecnico$/, 'Mis registros', 'Técnico'],
  [/^\/tecnico\/registrar$/, 'Registrar productor', 'Técnico'],
  [/^\/tecnico\/registrar\/[^/]+\/datos$/, 'Datos del productor', 'Técnico'],
  [/^\/tecnico\/registrar\/[^/]+\/up$/, 'Registrar parcela', 'Técnico'],
  [/^\/tecnico\/productor\/[^/]+$/, 'Detalle del productor', 'Técnico'],
  [/^\/tecnico\/productor\/[^/]+\/up\/nueva$/, 'Agregar parcela', 'Técnico'],
  [/^\/tecnico\/productor\/[^/]+\/ciclo$/, 'Registrar ciclo', 'Técnico'],
  [/^\/tecnico\/productor\/[^/]+\/encuesta$/, 'Encuesta de insumos', 'Técnico'],
  [/^\/tecnico\/perfil$/, 'Mi perfil', 'Técnico'],
  [/^\/tecnico/, 'Técnico'],

  // Administración
  [/^\/admin$/, 'Resumen', 'Administración'],
  [/^\/admin\/productores\/[^/]+$/, 'Detalle de productor', 'Administración'],
  [/^\/admin\/productores/, 'Productores', 'Administración'],
  [/^\/admin\/parcelas/, 'Parcelas', 'Administración'],
  [/^\/admin\/bodegas\/[^/]+$/, 'Detalle de bodega', 'Administración'],
  [/^\/admin\/bodegas/, 'Bodegas', 'Administración'],
  [/^\/admin\/tecnicos/, 'Técnicos', 'Administración'],
  [/^\/admin\/insumos/, 'Insumos', 'Administración'],
  [/^\/admin\/alertas/, 'Alertas', 'Administración'],
  [/^\/admin\/chats/, 'Chats de ayuda', 'Administración'],
  [/^\/admin\/precios/, 'Precios', 'Administración'],
  [/^\/admin\/produccion/, 'Producción', 'Administración'],
  [/^\/admin\/mercado/, 'Mercado', 'Administración'],
  [/^\/admin\/configuracion/, 'Configuración', 'Administración'],
  [/^\/admin\/avisos-privacidad/, 'Avisos de privacidad', 'Administración'],
  [/^\/admin\/senasica/, 'SENASICA', 'Administración'],
  [/^\/admin\/permisos/, 'Permisos', 'Administración'],
  [/^\/admin\/cambiar-password/, 'Cambiar contraseña', 'Administración'],
  [/^\/admin\/perfil/, 'Mi perfil', 'Administración'],
  [/^\/admin/, 'Administración'],

  // Bodega o industria
  [/^\/bodegas\/seleccionar/, 'Seleccionar bodegas', 'Bodega'],
  [/^\/dashboard/, 'Mi panel', 'Bodega'],
  [/^\/mis-bodegas/, 'Mis bodegas', 'Bodega'],
  [/^\/bodegas\/[^/]+\/semaforo/, 'Semáforo', 'Bodega'],
  [/^\/bodegas\/[^/]+\/editar/, 'Editar bodega', 'Bodega'],
  [/^\/bodegas\/[^/]+/, 'Detalle de bodega', 'Bodega'],
  [/^\/onboarding/, 'Configuración inicial', 'Bodega'],
  [/^\/inventario/, 'Inventario', 'Bodega'],
  [/^\/precio-diario/, 'Precio diario', 'Bodega'],
  [/^\/senales\/nueva/, 'Nueva señal de compra', 'Bodega'],
  [/^\/senales\/[^/]+\/interesados/, 'Interesados', 'Bodega'],
  [/^\/requerimientos/, 'Requerimientos', 'Bodega'],
  [/^\/oferta\/mis-intereses/, 'Mis intereses', 'Bodega'],
  [/^\/oferta/, 'Oferta', 'Bodega'],
  [/^\/propuestas-disponibles/, 'Propuestas disponibles', 'Bodega'],
  [/^\/transacciones\/nueva/, 'Nueva transacción', 'Bodega'],
  [/^\/transacciones\/[^/]+/, 'Detalle de transacción', 'Bodega'],
  [/^\/transacciones/, 'Transacciones', 'Bodega'],
  [/^\/tarifario\/proponer/, 'Proponer tarifa', 'Bodega'],
  [/^\/tarifario/, 'Tarifario', 'Bodega'],
  [/^\/ventanillas\/nueva/, 'Nueva ventanilla', 'Bodega'],
  [/^\/ventanillas\/[^/]+\/solicitudes\/[^/]+/, 'Detalle de solicitud', 'Bodega'],
  [/^\/ventanillas\/[^/]+\/solicitudes/, 'Solicitudes', 'Bodega'],
  [/^\/ventanillas/, 'Ventanillas', 'Bodega'],
  [/^\/precios-mercado/, 'Precios de mercado', 'Bodega'],
  [/^\/notificaciones/, 'Notificaciones', 'Bodega'],
  [/^\/mas/, 'Más opciones', 'Bodega'],
  [/^\/perfil/, 'Mi perfil', 'Bodega'],
  [/^\/configuracion/, 'Configuración', 'Bodega'],
];

export function tituloDePagina(pathname: string): string {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const [patron, pagina, area] of RUTAS) {
    if (!patron.test(ruta)) continue;
    if (pagina === '') return TITULO_BASE;
    return area ? `${pagina} · ${area} · ${SISTEMA}` : `${pagina} · ${SISTEMA}`;
  }
  return TITULO_BASE;
}

export default function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = tituloDePagina(pathname);
  }, [pathname]);
  return null;
}
