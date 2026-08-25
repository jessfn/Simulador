import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';
import { usePermisosSSE } from '../../hooks/usePermisosSSE';
import { usePermisosStore } from '../../store/permisos';
import { GlobalConexionBanner } from './ErrorConexionBanner';
import {
  LayoutDashboard, Users, Warehouse, AlertTriangle,
  TrendingUp, LogOut, Menu, X, ShieldCheck, ChevronRight,
  Sprout, BarChart3, Settings, Leaf, KeyRound, CircleUserRound, Layers,
  MessageCircle,
} from 'lucide-react';
import { apiFetch, BASE } from '../../services/api';

interface SidebarItem {
  label: string;
  subtitle?: string;
  path: string;
  icon: any;
  exact?: boolean;
  /** Vista en admin_permisos. undefined = siempre visible. */
  vista?: string;
  /** Solo visible para admin/responsable, nunca para OREF. */
  soloAdmin?: boolean;
}

const MENU: SidebarItem[] = [
  { label: 'Resumen',           subtitle: 'Métricas, estadísticas y vista general del sistema',               path: '/admin',                   icon: LayoutDashboard, exact: true, vista: 'resumen' },
  { label: 'Productores',       subtitle: 'Administración y gestión integral de agricultores registrados',    path: '/admin/productores',       icon: Users,           vista: 'productores' },
  { label: 'Parcelas',          subtitle: 'Mapa de todas las unidades de producción y parcelas registradas',  path: '/admin/parcelas',          icon: Layers,          vista: 'parcelas' },
  { label: 'Bodegas',           subtitle: 'Supervisión y control detallado de centros de acopio',             path: '/admin/bodegas',           icon: Warehouse,       vista: 'bodegas' },
  { label: 'Chats de Ayuda',    subtitle: 'Soporte en vivo a productores y bodegas',                          path: '/admin/chats',             icon: MessageCircle,   vista: 'chats_ayuda' },
  { label: 'Alertas',           subtitle: 'Centro de notificaciones y avisos en tiempo real',                 path: '/admin/alertas',           icon: AlertTriangle,   vista: 'alertas' },
  { label: 'Precios',           subtitle: 'Monitoreo de cotizaciones y variaciones del mercado',              path: '/admin/precios',           icon: TrendingUp,      vista: 'precios' },
  { label: 'Producción',        subtitle: 'Registro, seguimiento y estimación de cosechas activas',           path: '/admin/produccion',        icon: Sprout,          vista: 'produccion' },
  { label: 'Mercado',           subtitle: 'Análisis estadístico y proyecciones comerciales a futuro',         path: '/admin/mercado',           icon: BarChart3,       vista: 'mercado' },
  { label: 'SENASICA',          subtitle: 'Carga de alertas fitosanitarias y notificación a productores',     path: '/admin/senasica',          icon: Leaf,            vista: 'senasica' },
  { label: 'Configuración',     subtitle: 'Preferencias, roles de usuario y ajustes del sistema',             path: '/admin/configuracion',     icon: Settings,        soloAdmin: true },
  { label: 'Avisos Privacidad', subtitle: 'Constancias de aceptación con verificación biométrica y GPS',      path: '/admin/avisos-privacidad', icon: ShieldCheck,     vista: 'avisos-privacidad' },
  { label: 'Permisos',          subtitle: 'Usuarios del panel, roles y control de acceso por vista',          path: '/admin/permisos',          icon: KeyRound,        soloAdmin: true },
  { label: 'Mi Perfil',         subtitle: 'Edita tu información, email y contraseña de acceso',               path: '/admin/perfil',            icon: CircleUserRound },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const { puedeVerVista, permisosTotal } = usePermisosStore();
  const esAdminOResponsable = user?.rol === 'admin' || user?.rol === 'responsable';

  // admin y responsable tienen permisos totales; OREF carga sus permisos individuales
  usePermisosSSE(user?.userId, esAdminOResponsable);

  // Badge de conversaciones de soporte sin leer en el ítem "Chats de Ayuda".
  // Reactivo en vivo via SSE (no solo un polling cada rato) — se actualiza
  // en cuanto llega un mensaje nuevo aunque el admin esté en otra pantalla.
  const [chatsNoLeidos, setChatsNoLeidos] = useState(0);
  const chatsSseRef = useRef<EventSource | null>(null);
  useEffect(() => {
    if (!puedeVerVista('chats_ayuda')) return;
    const cargar = () => {
      apiFetch('/admin/chats').then(r => r.json()).then(d => {
        const total = (d.conversaciones || []).reduce((s: number, c: any) => s + (c.no_leidos_admin || 0), 0);
        setChatsNoLeidos(total);
      }).catch(() => {});
    };
    cargar();

    const token = localStorage.getItem('simac_token');
    if (!token) return;
    const es = new EventSource(`${BASE}/admin/chats/stream?token=${encodeURIComponent(token)}`);
    chatsSseRef.current = es;
    es.onmessage = (e) => {
      try {
        const { tipo } = JSON.parse(e.data);
        if (tipo === 'mensaje' || tipo === 'leido') cargar();
      } catch { /* ignore */ }
    };
    es.onerror = () => es.close();

    // Respaldo por si la conexión SSE se cae silenciosamente.
    const interval = setInterval(cargar, 30000);
    return () => { clearInterval(interval); es.close(); chatsSseRef.current = null; };
  }, [puedeVerVista]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  const pageInfo = () => {
    const m = MENU.find(i => i.exact ? i.path === location.pathname : location.pathname.startsWith(i.path));
    
    let label = m?.label ?? 'Panel';
    let subtitle = m?.subtitle ?? 'Administración integral del sistema';
    let Icon = m?.icon ?? LayoutDashboard;

    if (location.pathname.match(/\/admin\/productores\/.+/)) {
      label = 'Detalle Productor';
      subtitle = 'Expediente técnico e información detallada del productor';
      Icon = Users;
    }
    if (location.pathname.match(/\/admin\/bodegas\/.+/)) {
      label = 'Detalle Bodega';
      subtitle = 'Inventario, operaciones y ficha técnica del centro de acopio';
      Icon = Warehouse;
    }
    return { label, subtitle, Icon };
  };

  const initials = () => {
    const n = user?.nombres || user?.nombre_completo || 'AD';
    return n.slice(0, 2).toUpperCase();
  };

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-['Space_Grotesk'] font-bold tracking-wide transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
      isActive
        ? 'bg-white/15 text-white shadow-sm scale-[1.02]'
        : 'text-emerald-50/70 hover:text-white hover:bg-white/10 hover:scale-[1.02]'
    }`;

  const JustifiedText = ({ text, className }: { text: string; className?: string }) => (
    <div className={`flex justify-between ${className || ''}`}>
      {text.split('').map((c, i) => c === ' ' ? <span key={i} className="w-[0.3em]" /> : <span key={i}>{c}</span>)}
    </div>
  );

  const Brand = ({ small }: { small?: boolean }) => (
    <div className="flex items-center gap-3 group cursor-pointer select-none">
      <div className={`${small ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.1)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:rotate-6 group-hover:bg-white/30 group-active:scale-95`}>
        <ShieldCheck className="text-white transition-transform duration-500 group-hover:scale-110" size={small ? 16 : 19} strokeWidth={2.4} />
      </div>
      <div className={`${small ? 'w-[90px]' : 'w-[125px]'} flex flex-col justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1.5`}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <JustifiedText 
            text="SIMAC" 
            className={`${small ? 'text-[15px]' : 'text-[18px]'} font-black text-white leading-none uppercase mb-[4px] drop-shadow-sm transition-transform duration-500`} 
          />
        </div>
        {!small && (
          <JustifiedText 
            text="PLAN NACIONAL MAÍZ" 
            className="text-[7.5px] font-['Outfit'] text-emerald-100 font-bold uppercase tracking-wider leading-none mb-[5px] transition-colors duration-300 group-hover:text-white" 
          />
        )}
        <div className="w-full">
          <div className="w-full bg-black/10 text-white/90 font-['Outfit'] text-[8px] font-bold uppercase tracking-widest py-[3px] rounded leading-none transition-all duration-300 group-hover:bg-white/20 group-hover:text-white">
            <JustifiedText text="ADMINISTRADOR" className="px-1.5" />
          </div>
        </div>
      </div>
    </div>
  );

  const UserCard = () => (
    <div className="flex items-center gap-2.5 bg-black/10 rounded-2xl px-3 py-2.5 group hover:bg-black/20 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.02] cursor-default">
      <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-['Space_Grotesk'] font-black text-[13px] flex-shrink-0 group-hover:scale-110 group-hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]">
        {initials()}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1">
        <p className="text-[11px] font-['Space_Grotesk'] font-extrabold text-white tracking-wide truncate leading-none mb-[4px] group-hover:text-emerald-50 transition-colors uppercase">
          {user?.nombres || user?.nombre_completo || 'Administrador'}
        </p>
        <div className="flex items-center">
          <span className="bg-white/10 font-['Outfit'] text-white/80 text-[7px] font-bold uppercase tracking-widest px-1.5 py-[3px] rounded leading-none group-hover:text-white group-hover:bg-white/20 transition-colors">
            {user?.rol === 'admin' ? 'Administrador' : user?.rol ? user.rol.charAt(0).toUpperCase() + user.rol.slice(1) : 'Administrador'}
          </span>
        </div>
      </div>
    </div>
  );

  function puedeVerItem(item: SidebarItem): boolean {
    // Ítems sin restricción: siempre visible
    if (!item.vista && !item.soloAdmin) return true;
    // Ítems exclusivos de admin/responsable
    if (item.soloAdmin) return esAdminOResponsable;
    // Ítems con vista: respetar permisosTotal o permiso individual
    if (permisosTotal) return true;
    return puedeVerVista(item.vista!);
  }

  const NavItems = ({ mobile }: { mobile?: boolean }) => (
    <>
      {MENU.filter(puedeVerItem).map(item => (
        <NavLink key={item.path} to={item.path} end={item.exact} className={navCls}>
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)] transition-all duration-500" />}
              <item.icon size={16} strokeWidth={2.2} className={`flex-shrink-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isActive ? 'text-white scale-110' : 'text-emerald-100/60 group-hover:text-white group-hover:scale-110'}`} />
              <span className="truncate transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1">{item.label}</span>
              {item.path === '/admin/chats' && chatsNoLeidos > 0 && (
                <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-black flex items-center justify-center">
                  {chatsNoLeidos > 9 ? '9+' : chatsNoLeidos}
                </span>
              )}
              {!mobile && item.path !== '/admin/chats' && <ChevronRight size={13} className="ml-auto opacity-0 -translate-x-2 group-hover:opacity-40 group-hover:translate-x-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]" />}
            </>
          )}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#F5F6F8] text-gray-900 select-none">

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="hidden lg:flex flex-col w-[244px] xl:w-[264px] h-screen bg-[#0e5c33] flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
        <div className="relative z-10 flex items-center px-5 py-5 border-b border-emerald-300/30 flex-shrink-0">
          <Brand />
        </div>
        <div className="relative z-10 px-4 py-3 border-b border-emerald-300/30 flex-shrink-0">
          <UserCard />
        </div>
        <nav className="relative z-10 flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none">
          <NavItems />
        </nav>
        <div className="relative z-10 px-3 py-4 border-t border-emerald-300/30 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12.5px] font-['Space_Grotesk'] font-bold tracking-wide text-white/80 hover:text-white hover:bg-red-500/80 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)] active:scale-[0.98] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group"
          >
            <LogOut size={16} strokeWidth={2.2} className="flex-shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-translate-y-0.5" />
            <span className="transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MOBILE DRAWER ── */}
      <div
        className={`lg:hidden fixed inset-0 bg-gray-950/60 backdrop-blur-md z-40 transition-opacity duration-300 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className={`lg:hidden fixed top-0 bottom-0 left-0 z-50 flex flex-col bg-[#0e5c33] shadow-[8px_0_32px_rgba(0,0,0,0.5)]
          transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] w-[78vw] max-w-[300px]
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
        <div className="relative z-10 flex items-center justify-between px-5 py-4 border-b border-emerald-300/30 flex-shrink-0">
          <Brand small />
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-all duration-300 hover:scale-110 hover:rotate-90"
          >
            <X size={15} />
          </button>
        </div>
        <div className="relative z-10 px-4 py-3 border-b border-emerald-300/30 flex-shrink-0">
          <UserCard />
        </div>
        <nav className="relative z-10 flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none">
          <NavItems mobile />
        </nav>
        <div className="relative z-10 px-3 py-4 border-t border-emerald-300/30 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12.5px] font-['Space_Grotesk'] font-bold tracking-wide text-white/80 hover:text-white hover:bg-red-500/80 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group"
          >
            <LogOut size={15} strokeWidth={2.2} className="flex-shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 group-hover:-translate-y-0.5" />
            <span className="transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-1">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="relative h-16 flex items-center justify-between px-4 sm:px-6 py-3 bg-[#0a3c20]/95 backdrop-blur-2xl flex-shrink-0 border-b border-emerald-500/20 z-10 group/header overflow-hidden">
          {/* Animated background accent */}
          <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-emerald-400/10 to-transparent opacity-0 group-hover/header:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent opacity-50" />

          <div className="flex items-center gap-3 min-w-0 relative z-10">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden -ml-1 w-9 h-9 flex items-center justify-center rounded-full text-emerald-400 hover:text-white hover:bg-white/10 transition-all duration-300 flex-shrink-0"
              aria-label="Abrir menú"
            >
              <Menu size={19} />
            </button>
            <div className="flex items-center gap-2 min-w-0 group cursor-default">
              {(() => {
                const { label, subtitle, Icon } = pageInfo();
                return (
                  <>
                    <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-[0_2px_10px_rgba(0,0,0,0.1)] group-hover:bg-white/25 group-hover:scale-110 group-hover:shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] flex-shrink-0">
                      <Icon size={16} strokeWidth={2.5} />
                    </div>
                    <div className="h-6 w-[1.5px] bg-white/20 rounded-full flex-shrink-0 mx-1 group-hover:bg-white/40 group-hover:h-7 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]" />
                    <div className="flex flex-col min-w-0 justify-center">
                      <h2 className="text-[15px] sm:text-[17px] font-['Space_Grotesk'] font-bold text-white tracking-tight truncate leading-none drop-shadow-sm group-hover:translate-x-1 transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]">
                        {label}
                      </h2>
                      <p className="text-[7.5px] sm:text-[8px] font-['Outfit'] text-emerald-100/70 font-semibold uppercase tracking-widest truncate leading-none mt-[4px] group-hover:translate-x-1 group-hover:text-emerald-50 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] delay-75">
                        {subtitle}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[inset_0_0_10px_rgba(52,211,153,0.05)]">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">PNMB 2026</span>
              </div>
              <div className="h-4 w-px bg-emerald-500/30" />
            </div>

            <div className="text-right hidden sm:flex flex-col justify-center group cursor-default">
              <p className="text-[11px] text-white font-extrabold truncate max-w-[140px] leading-none mb-[5px] transition-colors duration-300 group-hover:text-emerald-300 uppercase drop-shadow-sm">
                {user?.nombres || user?.nombre_completo || 'Administrador'}
              </p>
              <div className="flex justify-end">
                <span className="text-emerald-500 text-[7px] font-bold uppercase tracking-widest leading-none transition-colors duration-300 group-hover:text-emerald-400">
                  {user?.rol === 'admin' ? 'Super Administrador' : user?.rol ? user.rol.charAt(0).toUpperCase() + user.rol.slice(1) : 'Administrador'}
                </span>
              </div>
            </div>

            <button onClick={() => navigate('/admin/perfil')}
              className="relative group/avatar cursor-pointer ml-1 active:scale-90 transition-transform">
              <div className="absolute inset-0 bg-emerald-400 rounded-full blur-[8px] opacity-40 group-hover/avatar:opacity-75 group-hover/avatar:blur-[12px] transition-all duration-300" />
              <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-black text-[12px] flex-shrink-0 ring-2 ring-[#03150a] group-hover/avatar:scale-105 transition-transform duration-300 ease-out shadow-lg">
                {initials()}
              </div>
            </button>
          </div>
        </header>

        <main className="flex-1 px-3 pb-3 pt-0 overflow-y-auto">
          <GlobalConexionBanner />
          <div key={location.pathname} className="max-w-[1400px] mx-auto h-full animate-fade-in">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-xl border-t border-gray-200/70 flex items-center justify-around px-1 py-1.5 safe-area-bottom flex-shrink-0">
          {MENU.filter(puedeVerItem).slice(0, 5).map(item => {
            const isActive = item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <NavLink key={item.path} to={item.path} end={item.exact}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200 min-w-0 flex-1">
                <item.icon size={19} strokeWidth={2.1}
                  className={`flex-shrink-0 transition-colors ${isActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className={`text-[9px] font-bold truncate transition-colors ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
          <button onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-0 flex-1">
            <Menu size={19} strokeWidth={2.1} className="text-gray-400" />
            <span className="text-[9px] font-bold text-gray-400">Más</span>
          </button>
        </nav>
        <div className="lg:hidden h-[60px] flex-shrink-0" />
      </div>
    </div>
  );
}
