import { useEffect, type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Map, TrendingUp, Award, User, Bell, X, LogOut, ChevronRight, ChevronLeft, CalendarCheck } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import AppHeader from './AppHeader';
import PushPrompt from './PushPrompt';
import ChatBubble from './ChatBubble';

const NAV = [
  { path: '/productor', icon: Home, label: 'Inicio' },
  { path: '/productor/mapa', icon: Map, label: 'Mapa' },
  { path: '/productor/precios', icon: TrendingUp, label: 'Precios' },
  { path: '/productor/incentivos', icon: Award, label: 'Apoyos' },
  { path: '/productor/perfil', icon: User, label: 'Perfil' },
];

const SYSTEM_NAME = 'Sistema de Ordenamiento de la Producción y Comercialización del Maíz Blanco en México';

export function LayoutProductor({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const cicloPendiente = typeof window !== 'undefined' && localStorage.getItem('ciclo_pendiente') === '1';

  const [notifNoLeidas, setNotifNoLeidas] = useState(0);
  const token = localStorage.getItem('simac_token');
  const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const r = await fetch(`${BASE}/alertas/notificaciones/mis`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (r.ok) {
          const d = await r.json();
          setNotifNoLeidas(d.total_no_leidas ?? 0);
        }
      } catch { /* silencioso */ }
    };

    if (token) {
      fetchNotifs();
      const interval = setInterval(fetchNotifs, 60_000);
      return () => clearInterval(interval);
    }
  }, [token, BASE]);

  function handleLogout() {
    logout();
    setDrawerOpen(false);
    window.location.href = '/login-productor';
  }

  const nombres = user?.nombres || user?.nombre_completo || '';
  const initials = nombres
    ? nombres.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : 'P';

  return (
    <div className="fixed inset-0 bg-[#eef8f2] flex flex-col w-full overflow-hidden">

      {/* ── Header premium "liquid glass" (compartido) ── */}
      <AppHeader
        subtitle={SYSTEM_NAME}
        initials={initials}
        notifCount={notifNoLeidas}
        onBrand={() => navigate('/productor')}
        onBell={() => navigate('/productor/alertas')}
        onMenu={() => setDrawerOpen(true)}
      />

      {/* ── Main content ───────────────────────────────── */}
      {/* En desktop el contenido se centra en una columna (como en "seleccionar
          bodegas"); las vistas de mapa a pantalla completa van a todo lo ancho. */}
      <main className="flex-1 overflow-y-auto w-full relative scroll-smooth bg-[#eef8f2]" style={{ overscrollBehaviorY: 'contain' }}>
        {(pathname === '/productor/mapa' || pathname.startsWith('/productor/mapa/') || pathname.startsWith('/productor/ubicacion') || pathname.startsWith('/productor/ciclo'))
          ? children
          : <div className="w-full max-w-2xl mx-auto">{children}</div>}
      </main>

      {/* ── Bottom nav ─────────────────────────────────── */}
      <nav className="flex-none z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_20px_rgb(0,0,0,0.02)]"
           style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
        {NAV.map(({ path, icon: Icon, label }) => {
          const active = pathname === path || (path !== '/productor' && pathname.startsWith(path + '/'))
            || (path === '/productor' && pathname === '/productor');
          const isPerfil = path === '/productor/perfil';
          return (
            <Link
              key={path}
              to={path}
              className={`flex-1 flex flex-col items-center justify-center pt-2.5 pb-3 gap-1 transition-colors
                ${active ? 'text-[#1A5C38]' : 'text-slate-400 hover:text-slate-500'}`}
            >
              <div className="relative">
                <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                {isPerfil && cicloPendiente && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white" />
                )}
              </div>
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
            </Link>
          );
        })}
        </div>
      </nav>

      {/* ── Push prompt global (productor) ── */}
      <PushPrompt rol="productor" />

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
            {nombres || 'Productor'}
          </p>
          {user?.email && (
            <p className="text-white/55 text-[12px] mt-0.5 truncate">{user.email}</p>
          )}
          <div className="mt-2.5 inline-flex items-center gap-1.5 bg-white/12 border border-white/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
            <span className="text-white/90 text-[11px] font-semibold">Productor</span>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent flex-shrink-0" />

        {/* Opciones de menú — solo rutas reales */}
        <div className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {[
            { icon: User,          label: 'Mi perfil',        desc: 'Ver y editar cuenta',         route: '/productor/perfil' },
            { icon: CalendarCheck, label: 'Ciclo productivo', desc: 'Registro y seguimiento',       route: '/productor/ciclo' },
            { icon: Bell,          label: 'Alertas',          desc: notifNoLeidas > 0 ? `${notifNoLeidas} sin leer` : 'Al día', route: '/productor/alertas' },
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

export function PageHeaderProductor({
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
    <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/60 px-4 sm:px-6 pt-3.5 pb-4 shadow-sm">
      <div className="max-w-[700px] mx-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {back !== undefined && (
              <button
                onClick={() => typeof back === 'number' ? navigate(back) : navigate(back)}
                className="flex items-center gap-0.5 text-[#1A5C38] text-[14px] font-bold mb-2 hover:opacity-70 transition-opacity"
              >
                <ChevronLeft size={18} strokeWidth={2.5} className="-ml-1" />
                Volver
              </button>
            )}
            <h1 className="text-[20px] font-bold text-slate-900 leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-[12px] text-slate-500 font-medium mt-0.5 truncate">{subtitle}</p>}
          </div>
          {action && <div className="flex-shrink-0 pt-1">{action}</div>}
        </div>
      </div>
    </div>
  );
}
