import { type ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Warehouse, Users, Receipt, MoreHorizontal, ChevronLeft, X, LogOut, User, Bell, Settings, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { api } from '../services/api';
import AppHeader from './AppHeader';
import PushPrompt from './PushPrompt';
import ChatBubble from './ChatBubble';

const NAV = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Tablero' },
  { path: '/mis-bodegas', icon: Warehouse, label: 'Bodegas' },
  { path: '/oferta', icon: Users, label: 'Oferta' },
  { path: '/transacciones', icon: Receipt, label: 'Transacciones' },
  { path: '/mas', icon: MoreHorizontal, label: 'Más' },
];

const SYSTEM_NAME = 'Sistema de Ordenamiento de la Producción y Comercialización del Maíz en México';

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);

  useEffect(() => {
    const fetchNotifs = () => {
      api.notificaciones.mis()
        .then((r: any) => setNoLeidas(r.total_no_leidas || 0))
        .catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
    setDrawerOpen(false);
  }

  const initials = user?.nombre_completo
    ? user.nombre_completo.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : 'U';

  return (
    <div className="fixed inset-0 flex flex-col bg-[#eef8f2] overflow-hidden w-full">

      {/* ── Header premium "liquid glass" (compartido) ── */}
      <AppHeader
        subtitle={SYSTEM_NAME}
        initials={initials}
        notifCount={noLeidas}
        onBrand={() => navigate('/dashboard')}
        onBell={() => navigate('/notificaciones')}
        onMenu={() => setDrawerOpen(true)}
        mostrarAyuda
      />

      {/* ── Main content ───────────────────────────────── */}
      {/* En desktop el contenido se centra en una columna para verse profesional
          (como en "seleccionar bodegas") en vez de estirarse a todo lo ancho. */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full pb-[calc(72px+env(safe-area-inset-bottom,0px))] bg-[#eef8f2]" style={{ overscrollBehaviorY: 'contain' }}>
        <div className="w-full max-w-5xl mx-auto">{children}</div>
      </main>

      {/* ── Bottom nav ─────────────────────────────────── */}
      {/* padding-bottom en el CONTENEDOR extiende el fondo blanco hasta el borde físico (home indicator iOS) */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-xl border-t border-black/[0.06] shadow-[0_-1px_0_rgba(0,0,0,0.04)]"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
        {NAV.map(({ path, icon: Icon, label }) => {
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path + '/'));
          return (
            <Link
              key={path}
              to={path}
              className={`flex-1 flex flex-col items-center justify-center pt-2 pb-2 gap-[3px] transition-colors
                ${active ? 'text-[#1A5C38]' : 'text-gray-400'}`}
            >
              <Icon size={23} strokeWidth={active ? 2.4 : 1.7} />
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
              {active && <div className="absolute bottom-0 w-5 h-[2px] bg-[#1A5C38] rounded-full" style={{ position: 'relative' }} />}
            </Link>
          );
        })}
        </div>
      </nav>

      {/* ── Push prompt global (bodeguero) ── */}
      <PushPrompt rol="bodeguero" />

      {/* ── Chat de ayuda ── */}
      <ChatBubble />

      {/* ── Profile Drawer ─────────────────────────────── */}
      {/* Backdrop con transición suave */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-300 ${drawerOpen ? 'bg-black/40 backdrop-blur-[3px] pointer-events-auto' : 'bg-transparent backdrop-blur-none pointer-events-none'}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Panel lateral moderno */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-[82%] max-w-[320px] bg-white flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ boxShadow: '-4px 0 40px rgba(0,0,0,0.18)' }}
      >
        {/* Safe-area spacer — ocupa el status bar sin duplicar el padding global */}
        <div className="bg-[#14482c] flex-shrink-0" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

        {/* Header con info del usuario */}
        <div className="bg-gradient-to-br from-[#14482c] via-[#1A5C38] to-[#1e6b42] px-5 pt-4 pb-5 relative flex-shrink-0">
          <button
            onClick={() => setDrawerOpen(false)}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
          >
            <X size={18} className="text-white/80" />
          </button>

          {/* Avatar circular */}
          <div className="w-[60px] h-[60px] rounded-full bg-white/15 border-2 border-white/30 flex items-center justify-center mb-3 shadow-lg">
            <span className="text-white text-[22px] font-bold tracking-tight">{initials}</span>
          </div>

          <p className="text-white font-semibold text-[16px] leading-tight pr-8" style={{ fontFamily: 'Inter, sans-serif' }}>
            {user?.nombre_completo || 'Usuario'}
          </p>
          {user?.email && (
            <p className="text-white/55 text-[12px] mt-0.5 truncate">{user.email}</p>
          )}
          <div className="mt-2.5 inline-flex items-center gap-1.5 bg-white/12 border border-white/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
            <span className="text-white/90 text-[11px] font-semibold capitalize">{user?.rol || 'Bodega'}</span>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-shrink-0" />

        {/* Opciones de menú — solo rutas reales */}
        <div className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {[
            { icon: User,     label: 'Mi perfil',      desc: 'Ver y editar cuenta',                            route: '/perfil' },
            { icon: Bell,     label: 'Notificaciones', desc: noLeidas > 0 ? `${noLeidas} sin leer` : 'Al día', route: '/notificaciones' },
            { icon: Settings, label: 'Configuración',  desc: 'Ajustes de la app',                              route: '/configuracion' },
          ].map(({ icon: Icon, label, desc, route }) => (
            <button key={route} onClick={() => { setDrawerOpen(false); navigate(route); }}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl text-left active:bg-[#eef8f2] transition-colors group">
              <div className="w-10 h-10 rounded-2xl bg-[#eef8f2] group-active:bg-[#dcf3e7] flex items-center justify-center flex-shrink-0 transition-colors">
                <Icon size={19} className="text-[#1A5C38]" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-800 leading-tight">{label}</p>
                <p className="text-[11.5px] text-gray-400 mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>

        {/* Footer: versión + cerrar sesión */}
        <div className="flex-shrink-0 border-t border-gray-100 px-4 pt-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
          <p className="text-[10px] text-gray-300 text-center mb-3">Plan Nacional Maíz 2026 · v1.0</p>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-50 active:bg-red-100 text-red-600 rounded-2xl py-3.5 text-[14px] font-semibold transition-colors"
          >
            <LogOut size={17} strokeWidth={2} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string | number;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="w-full bg-white/90 backdrop-blur-sm border-b border-black/[0.06] px-4 sm:px-6 pt-3.5 pb-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {back !== undefined && (
              <button
                onClick={() => typeof back === 'number' ? navigate(back) : navigate(back)}
                className="flex items-center gap-0.5 text-[#1A5C38] text-[14px] font-medium mb-1.5 active:opacity-60 transition-opacity"
              >
                <ChevronLeft size={18} strokeWidth={2.5} className="-ml-1" />
                Volver
              </button>
            )}
            <h1 className="text-[20px] font-bold text-gray-900 leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-[13px] text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          {action && <div className="flex-shrink-0 pt-1">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function PageBanner({
  title,
  subtitle,
  back,
  badge,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string | number;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] relative overflow-hidden group/banner">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none transition-opacity duration-700 opacity-50 group-hover/banner:opacity-100" />
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-4 pb-5 relative z-10 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/banner:translate-x-1">
        {back !== undefined && (
          <button
            onClick={() => typeof back === 'number' ? navigate(back) : navigate(back)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-2 active:opacity-60 transition-opacity hover:text-green-100"
          >
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1 transition-transform group-hover/banner:-translate-x-0.5" />
            Volver
          </button>
        )}
        <div className="flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            {badge && <div className="mb-1.5">{badge}</div>}
            <h1 className="text-[20px] sm:text-[24px] font-bold text-white leading-tight drop-shadow-sm">{title}</h1>
            {subtitle && <p className="text-green-100/80 text-[13px] mt-0.5 leading-snug font-medium">{subtitle}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      </div>
    </div>
  );
}
