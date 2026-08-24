import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { usePermisosStore } from './store/permisos';
import { Layout } from './components/Layout';
import { LayoutProductor } from './components/LayoutProductor';
import { useAuthStore } from './store/auth';

import WelcomePage from './pages/WelcomePage';
import B01Login from './pages/B01Login';
import B02Register from './pages/B02Register';

// Productor — onboarding
import RegistroNuevoPage from './pages/auth/RegistroNuevoPage';
import LoginPinPage from './pages/auth/LoginPinPage';
import RecuperarNipPage from './pages/auth/RecuperarNipPage';
import RecuperarPasswordPage from './pages/auth/RecuperarPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
// Productor — páginas
import DashboardProductorPage from './pages/productor/DashboardProductorPage';
import DisponibilidadTipoPage from './pages/productor/DisponibilidadTipoPage';
import DisponibilidadVariedadPage from './pages/productor/DisponibilidadVariedadPage';
import DisponibilidadVolumenPage from './pages/productor/DisponibilidadVolumenPage';
import DisponibilidadConfirmPage from './pages/productor/DisponibilidadConfirmPage';
import MapaBodegasPage from './pages/productor/MapaBodegasPage';
import DetalleBodegaPage from './pages/productor/DetalleBodegaPage';
import CompletarUbicacionPage from './pages/productor/CompletarUbicacionPage';
import CicloProductivoPage from './pages/productor/CicloProductivoPage';
import PreciosProductorPage from './pages/productor/PreciosProductorPage';
import PropuestaVentaPage from './pages/productor/PropuestaVentaPage';
import AgregarUPPage from './pages/productor/AgregarUPPage';
import ConfirmarTransaccionPage from './pages/productor/ConfirmarTransaccionPage';
import AlertasPage from './pages/productor/AlertasPage';
import IncentivosPage from './pages/productor/IncentivosPage';
import VentanillasPage from './pages/productor/VentanillasPage';
import EstadoSolicitudPage from './pages/productor/EstadoSolicitudPage';
import MiPerfilPage from './pages/productor/MiPerfilPage';
import B03SelectBodegas from './pages/B03SelectBodegas';
import B04Dashboard from './pages/B04Dashboard';
import B05MisBodegas from './pages/B05MisBodegas';
import B06BodegaDetalle from './pages/B06BodegaDetalle';
import B07Inventario from './pages/B07Inventario';
import B08Semaforo from './pages/B08Semaforo';
import B09PrecioCompra from './pages/B09PrecioCompra';
import B10Requerimiento from './pages/B10Requerimiento';
import B11OfertaTabla from './pages/B11OfertaTabla';
import B13Transaccion from './pages/B13Transaccion';
import B14HistorialTransacciones from './pages/B14HistorialTransacciones';
import B15Tarifario from './pages/B15Tarifario';
import B16ProponerConcepto from './pages/B16ProponerConcepto';
import B17MisVentanillas from './pages/B17MisVentanillas';
import B18AltaVentanilla from './pages/B18AltaVentanilla';
import B20Solicitudes from './pages/B20Solicitudes';
import B21DetalleSolicitud from './pages/B21DetalleSolicitud';
import MasPage from './pages/MasPage';
import B23Notificaciones from './pages/B23Notificaciones';
import B22PreciosMercado from './pages/B22PreciosMercado';
import B24PerfilBodega from './pages/B24PerfilBodega';
import B25ConfiguracionPage from './pages/B25ConfiguracionPage';
import B26DetalleTransaccion from './pages/B26DetalleTransaccion';
import B27InteresadosSenal from './pages/B27InteresadosSenal';
import B28EditarBodega from './pages/B28EditarBodega';
import B29OnboardingBodeguero from './pages/B29OnboardingBodeguero';
import B30MisInteresesOferta from './pages/B30MisInteresesOferta';

// Panel Administrativo - Importaciones (Apple 2026)
import AdminShell from './components/admin/AdminShell';
import LoginAdminPage from './pages/admin/LoginAdminPage';
import DashboardAdminPage from './pages/admin/DashboardAdminPage';
import ProductoresAdminPage from './pages/admin/ProductoresAdminPage';
import ProductorDetalleAdminPage from './pages/admin/ProductorDetalleAdminPage';
import BodegasAdminPage from './pages/admin/BodegasAdminPage';
import BodegaDetalleAdminPage from './pages/admin/BodegaDetalleAdminPage';
import AlertasAdminPage from './pages/admin/AlertasAdminPage';
import ChatsAdminPage from './pages/admin/ChatsAdminPage';
import PreciosAdminPage from './pages/admin/PreciosAdminPage';
import RegistroAdminPage from './pages/admin/RegistroAdminPage';
import ProduccionAdminPage from './pages/admin/ProduccionAdminPage';
import MercadoAdminPage from './pages/admin/MercadoAdminPage';
import ConfiguracionAdminPage from './pages/admin/ConfiguracionAdminPage';
import AvisosPrivacidadAdminPage from './pages/admin/AvisosPrivacidadAdminPage';
import SenasicaAdminPage from './pages/admin/SenasicaAdminPage';
import PermisosAdminPage from './pages/admin/PermisosAdminPage';
import CambiarPasswordPage from './pages/admin/CambiarPasswordPage';
import MiPerfilAdminPage from './pages/admin/MiPerfilPage';
import ParcelasAdminPage from './pages/admin/ParcelasAdminPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function isAdminPanelUser(user: any) {
  return user?.rol === 'admin' || user?.rol === 'responsable' ||
    (user?.rol === 'user' && user?.es_panel_usuario === true);
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (isAuthenticated) {
    if (user?.rol === 'productor') return <Navigate to="/productor" replace />;
    if (isAdminPanelUser(user)) return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function RequireProductor({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login-productor" replace />;
  if (user?.rol !== 'productor') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireBodeguero({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.rol === 'productor') return <Navigate to="/productor" replace />;
  return <>{children}</>;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <RequireBodeguero><Layout>{children}</Layout></RequireBodeguero>;
}

// Bloquea "Precios de mercado" para bodegas incluso por URL directa (no basta
// con quitar el enlace del menú "Más"): mostraba el precio promedio entre
// bodegas competidoras, lo cual facilita que se alineen o anticipen precios
// entre sí — señalado por COFECE. Redirige a /dashboard en vez de a
// /admin/login (el usuario ya está autenticado como bodeguero, no tiene
// sentido mandarlo al login de admin). Ver plan de rediseño (Fase 0, punto 2).
function BloquearPreciosMercadoParaBodega({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!isAdminPanelUser(user)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (!isAdminPanelUser(user)) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

/** Orden de vistas del panel admin — usado para hallar la primera disponible para un OREF. */
const ORDEN_VISTAS = ['resumen', 'productores', 'parcelas', 'bodegas', 'alertas', 'precios', 'produccion', 'mercado', 'senasica', 'avisos-privacidad'];

function rutaDeVista(vista: string): string {
  return vista === 'resumen' ? '/admin' : `/admin/${vista}`;
}

/** Bloquea acceso a rutas admin si el usuario OREF no tiene permiso de ver esa vista. */
function RequireVista({ vista, soloAdmin, children }: { vista?: string; soloAdmin?: boolean; children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { puedeVerVista, permisosTotal } = usePermisosStore();
  const esAdminOResponsable = user?.rol === 'admin' || user?.rol === 'responsable';

  if (soloAdmin && !esAdminOResponsable) {
    const primera = permisosTotal ? 'resumen' : ORDEN_VISTAS.find(v => puedeVerVista(v));
    return <Navigate to={primera ? rutaDeVista(primera) : '/admin/perfil'} replace />;
  }
  if (vista && !permisosTotal && !puedeVerVista(vista)) {
    const primera = ORDEN_VISTAS.find(v => v !== vista && puedeVerVista(v));
    return <Navigate to={primera ? rutaDeVista(primera) : '/admin/perfil'} replace />;
  }
  return <>{children}</>;
}

function SmartRedirect() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/bienvenida" replace />;
  if (user?.rol === 'productor') return <Navigate to="/productor" replace />;
  if (isAdminPanelUser(user)) return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
}

export const router = createBrowserRouter([
  { path: '/bienvenida', element: <GuestOnly><WelcomePage /></GuestOnly> },
  { path: '/login', element: <GuestOnly><B01Login /></GuestOnly> },
  { path: '/registro', element: <GuestOnly><B02Register /></GuestOnly> },
  { path: '/bodegas/seleccionar', element: <RequireAuth><B03SelectBodegas /></RequireAuth> },
  {
    path: '/dashboard',
    element: <ProtectedLayout><B04Dashboard /></ProtectedLayout>,
  },
  {
    path: '/mis-bodegas',
    element: <ProtectedLayout><B05MisBodegas /></ProtectedLayout>,
  },
  {
    path: '/bodegas/:id',
    element: <ProtectedLayout><B06BodegaDetalle /></ProtectedLayout>,
  },
  {
    path: '/bodegas/:id/semaforo',
    element: <ProtectedLayout><B08Semaforo /></ProtectedLayout>,
  },
  {
    path: '/bodegas/:id/editar',
    element: <ProtectedLayout><B28EditarBodega /></ProtectedLayout>,
  },
  {
    path: '/onboarding',
    element: <ProtectedLayout><B29OnboardingBodeguero /></ProtectedLayout>,
  },
  {
    path: '/inventario',
    element: <ProtectedLayout><B07Inventario /></ProtectedLayout>,
  },
  {
    path: '/precio-diario',
    element: <ProtectedLayout><B09PrecioCompra /></ProtectedLayout>,
  },
  {
    path: '/senales/nueva',
    element: <ProtectedLayout><B10Requerimiento /></ProtectedLayout>,
  },
  {
    path: '/requerimientos',
    element: <ProtectedLayout><B10Requerimiento /></ProtectedLayout>,
  },
  {
    path: '/oferta',
    element: <ProtectedLayout><B11OfertaTabla /></ProtectedLayout>,
  },
  {
    path: '/oferta/mis-intereses',
    element: <ProtectedLayout><B30MisInteresesOferta /></ProtectedLayout>,
  },
  {
    path: '/transacciones',
    element: <ProtectedLayout><B14HistorialTransacciones /></ProtectedLayout>,
  },
  {
    path: '/transacciones/nueva',
    element: <ProtectedLayout><B13Transaccion /></ProtectedLayout>,
  },
  {
    path: '/transacciones/:id',
    element: <ProtectedLayout><B26DetalleTransaccion /></ProtectedLayout>,
  },
  {
    path: '/senales/:id/interesados',
    element: <ProtectedLayout><B27InteresadosSenal /></ProtectedLayout>,
  },
  {
    path: '/tarifario',
    element: <ProtectedLayout><B15Tarifario /></ProtectedLayout>,
  },
  {
    path: '/tarifario/proponer',
    element: <ProtectedLayout><B16ProponerConcepto /></ProtectedLayout>,
  },
  {
    path: '/ventanillas',
    element: <ProtectedLayout><B17MisVentanillas /></ProtectedLayout>,
  },
  {
    path: '/ventanillas/nueva',
    element: <ProtectedLayout><B18AltaVentanilla /></ProtectedLayout>,
  },
  {
    path: '/ventanillas/:id/solicitudes',
    element: <ProtectedLayout><B20Solicitudes /></ProtectedLayout>,
  },
  {
    path: '/ventanillas/:id/solicitudes/:sid',
    element: <ProtectedLayout><B21DetalleSolicitud /></ProtectedLayout>,
  },
  {
    path: '/mas',
    element: <ProtectedLayout><MasPage /></ProtectedLayout>,
  },
  {
    path: '/precios-mercado',
    element: <RequireAuth><BloquearPreciosMercadoParaBodega><B22PreciosMercado /></BloquearPreciosMercadoParaBodega></RequireAuth>,
  },
  {
    path: '/notificaciones',
    element: <ProtectedLayout><B23Notificaciones /></ProtectedLayout>,
  },
  {
    path: '/perfil',
    element: <ProtectedLayout><B24PerfilBodega /></ProtectedLayout>,
  },
  {
    path: '/configuracion',
    element: <ProtectedLayout><B25ConfiguracionPage /></ProtectedLayout>,
  },
  // Onboarding productor (sin auth)
  { path: '/registro-nuevo', element: <RegistroNuevoPage /> },
  { path: '/login-productor', element: <LoginPinPage /> },
  { path: '/recuperar-nip', element: <RecuperarNipPage /> },
  { path: '/recuperar-password', element: <RecuperarPasswordPage /> },
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },

  // Rutas del productor (requieren auth + rol productor)
  {
    path: '/productor',
    element: <RequireProductor><LayoutProductor><Outlet /></LayoutProductor></RequireProductor>,
    children: [
      { index: true, element: <DashboardProductorPage /> },
      { path: 'disponibilidad/tipo', element: <DisponibilidadTipoPage /> },
      { path: 'disponibilidad/variedad', element: <DisponibilidadVariedadPage /> },
      { path: 'disponibilidad/volumen', element: <DisponibilidadVolumenPage /> },
      { path: 'disponibilidad/confirmar', element: <DisponibilidadConfirmPage /> },
      { path: 'mapa', element: <MapaBodegasPage /> },
      { path: 'mapa/bodega/:id', element: <DetalleBodegaPage /> },
      { path: 'ubicacion', element: <CompletarUbicacionPage /> },
      { path: 'ciclo', element: <CicloProductivoPage /> },
      { path: 'precios', element: <PreciosProductorPage /> },
      { path: 'propuesta-venta', element: <PropuestaVentaPage /> },
      { path: 'ups/nueva', element: <AgregarUPPage /> },
      { path: 'transaccion/:id/confirmar', element: <ConfirmarTransaccionPage /> },
      { path: 'alertas', element: <AlertasPage /> },
      { path: 'incentivos', element: <IncentivosPage /> },
      { path: 'ventanillas', element: <VentanillasPage /> },
      { path: 'solicitud/:id', element: <EstadoSolicitudPage /> },
      { path: 'mis-solicitudes', element: <EstadoSolicitudPage /> },
      { path: 'perfil', element: <MiPerfilPage /> },
    ],
  },

  // Rutas administrativas (guardián Apple 2026)
  { path: '/admin/login', element: <LoginAdminPage /> },
  { path: '/admin/registro', element: <RegistroAdminPage /> },
  {
    path: '/admin',
    element: <RequireAdmin><AdminShell><Outlet /></AdminShell></RequireAdmin>,
    children: [
      { index: true, element: <RequireVista vista="resumen"><DashboardAdminPage /></RequireVista> },
      { path: 'productores',    element: <RequireVista vista="productores"><ProductoresAdminPage /></RequireVista> },
      { path: 'productores/:id',element: <RequireVista vista="productores"><ProductorDetalleAdminPage /></RequireVista> },
      { path: 'parcelas',       element: <RequireVista vista="parcelas"><ParcelasAdminPage /></RequireVista> },
      { path: 'bodegas',        element: <RequireVista vista="bodegas"><BodegasAdminPage /></RequireVista> },
      { path: 'bodegas/:id',    element: <RequireVista vista="bodegas"><BodegaDetalleAdminPage /></RequireVista> },
      { path: 'alertas',        element: <RequireVista vista="alertas"><AlertasAdminPage /></RequireVista> },
      { path: 'chats',          element: <RequireVista vista="chats_ayuda"><ChatsAdminPage /></RequireVista> },
      { path: 'precios',        element: <RequireVista vista="precios"><PreciosAdminPage /></RequireVista> },
      { path: 'produccion',     element: <RequireVista vista="produccion"><ProduccionAdminPage /></RequireVista> },
      { path: 'mercado',        element: <RequireVista vista="mercado"><MercadoAdminPage /></RequireVista> },
      { path: 'configuracion',  element: <RequireVista soloAdmin><ConfiguracionAdminPage /></RequireVista> },
      { path: 'avisos-privacidad', element: <RequireVista vista="avisos-privacidad"><AvisosPrivacidadAdminPage /></RequireVista> },
      { path: 'senasica',       element: <RequireVista vista="senasica"><SenasicaAdminPage /></RequireVista> },
      { path: 'permisos',       element: <RequireVista soloAdmin><PermisosAdminPage /></RequireVista> },
      { path: 'cambiar-password', element: <CambiarPasswordPage /> },
      { path: 'perfil',         element: <MiPerfilAdminPage /> },
    ],
  },

  { path: '/', element: <SmartRedirect /> },
  { path: '*', element: <SmartRedirect /> },
]);
