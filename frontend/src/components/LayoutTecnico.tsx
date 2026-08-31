import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, UserPlus, LogOut, ShieldCheck, ChevronLeft, UserCircle } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import ChatBubble from './ChatBubble';

const NAV = [
  { path: '/tecnico', icon: Home, label: 'Inicio' },
  { path: '/tecnico/registrar', icon: UserPlus, label: 'Registrar' },
  { path: '/tecnico/perfil', icon: UserCircle, label: 'Perfil' },
];

export function LayoutTecnico({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/tecnico/login');
  }

  const nombre = user?.nombre_completo || user?.nombres || 'Técnico ECA';
  const initials = nombre
    ? nombre.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : 'T';

  return (
    <div className="fixed inset-0 bg-[#eef8f2] flex flex-col w-full overflow-hidden">
      {/* Header */}
      <header className="flex-none z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200/60"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#1A5C38] flex items-center justify-center">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[14px] font-black text-slate-900 leading-none">SIMAC · Técnicos ECA</p>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{nombre}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#eef8f2] flex items-center justify-center text-[#1A5C38] text-[12px] font-bold">
              {initials}
            </div>
            <button onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto w-full relative scroll-smooth bg-[#eef8f2]" style={{ overscrollBehaviorY: 'contain' }}>
        <div className="w-full max-w-2xl mx-auto">{children}</div>
      </main>

      {/* Bottom nav */}
      <nav className="flex-none z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_20px_rgb(0,0,0,0.02)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
          {NAV.map(({ path, icon: Icon, label }) => {
            const active = pathname === path || (path !== '/tecnico' && pathname.startsWith(path + '/'));
            return (
              <Link key={path} to={path}
                className={`flex-1 flex flex-col items-center justify-center pt-2.5 pb-3 gap-1 transition-colors
                  ${active ? 'text-[#1A5C38]' : 'text-slate-400 hover:text-slate-500'}`}>
                <Icon size={24} strokeWidth={active ? 2.5 : 2} />
                <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <ChatBubble />
    </div>
  );
}

export function PageHeaderTecnico({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: string | number;
}) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/60 px-4 sm:px-6 pt-3.5 pb-4 shadow-sm">
      <div className="max-w-[700px] mx-auto">
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
    </div>
  );
}
