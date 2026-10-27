import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, UserPlus, LogOut, ShieldCheck, UserCircle, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import ChatBubble from './ChatBubble';
import BotonAtras from './BotonAtras';

const NAV_MAIZ = [
  { path: '/maiz/tecnico', icon: Home, label: 'Inicio' },
  { path: '/maiz/tecnico/registrar', icon: UserPlus, label: 'Registrar' },
  { path: '/maiz/tecnico/perfil', icon: UserCircle, label: 'Perfil' },
];
const NAV_FRIJOL = [
  { path: '/frijol/tecnico', icon: Home, label: 'Inicio' },
  { path: '/frijol/tecnico/nuevo', icon: UserPlus, label: 'Nuevo' },
  { path: '/frijol/tecnico/registros', icon: ClipboardList, label: 'Registros' },
  { path: '/frijol/tecnico/perfil', icon: UserCircle, label: 'Perfil' },
];

export function LayoutTecnico({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const esFrijol = pathname.startsWith('/frijol');
  const NAV = esFrijol ? NAV_FRIJOL : NAV_MAIZ;
  const inicio = esFrijol ? '/frijol/tecnico' : '/maiz/tecnico';

  function handleLogout() {
    logout();
    navigate(esFrijol ? '/frijol/tecnico/login' : '/maiz/tecnico/login');
  }

  const nombre = user?.nombre_completo || user?.nombres || 'Técnico ECA';
  const initials = nombre
    ? nombre.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : 'T';

  return (
    <div className={`fixed inset-0 flex flex-col w-full overflow-hidden ${esFrijol ? 'bg-[#e3f1e8]' : 'bg-[#eef8f2]'}`}>
      {/* Header */}
      <header className={`flex-none z-30 border-b ${esFrijol ? 'bg-gradient-to-r from-[#0a3c20] via-[#0f3821] to-[#14532d] border-emerald-950 shadow-md' : 'bg-white/95 backdrop-blur-xl border-slate-200/60'}`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${esFrijol ? 'bg-white/15 ring-1 ring-white/25' : 'bg-[#1A5C38]'}`}>
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className={`text-[14px] font-black leading-tight ${esFrijol ? 'text-white' : 'text-slate-900'}`}>{esFrijol ? 'Frijol' : 'Maíz'} · Técnicos ECA</p>
              <p className={`text-[11px] font-semibold mt-0.5 leading-tight ${esFrijol ? 'text-emerald-200 break-words' : 'text-slate-400'}`}>{nombre}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold ${esFrijol ? 'bg-emerald-100 text-[#0f3821]' : 'bg-[#eef8f2] text-[#1A5C38]'}`}>
              {initials}
            </div>
            <button onClick={handleLogout}
              className={`p-2 rounded-lg transition-colors ${esFrijol ? 'text-emerald-100 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
              aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`flex-1 overflow-y-auto overflow-x-hidden w-full relative scroll-smooth ${esFrijol ? 'bg-[#e3f1e8]' : 'bg-[#eef8f2]'}`} style={{ overscrollBehaviorY: 'contain' }}>
        <div className={`w-full max-w-2xl mx-auto ${esFrijol && !pathname.startsWith('/frijol/tecnico/nuevo') ? 'pb-24' : ''}`}>{children}</div>
      </main>

      {/* Bottom nav */}
      <nav className={`flex-none z-30 ${esFrijol ? 'bg-[#0f3821] border-t border-emerald-950 shadow-[0_-4px_20px_rgb(0,0,0,0.18)]' : 'bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_20px_rgb(0,0,0,0.02)]'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
          {NAV.map(({ path, icon: Icon, label }) => {
            const active = pathname === path || (path !== inicio && pathname.startsWith(path + '/'));
            const color = esFrijol ? (active ? 'text-white' : 'text-emerald-200/80 hover:text-white') : (active ? 'text-[#1A5C38]' : 'text-slate-400 hover:text-slate-500');
            return (
              <Link key={path} to={path}
                className={`flex-1 flex flex-col items-center justify-center pt-2 pb-2.5 gap-1 transition-colors ${color}`}>
                <span className={`flex items-center justify-center w-14 h-8 rounded-full ${esFrijol && active ? 'bg-emerald-500/30' : ''}`}><Icon size={22} strokeWidth={active ? 2.5 : 2} /></span>
                <span className={`text-[11px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* El asistente de registro es una tarea de atención completa: ahí no se muestra la burbuja de ayuda para que no tape campos ni botones */}
      {!(esFrijol && pathname.startsWith('/frijol/tecnico/nuevo')) && <ChatBubble />}
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
  const esFrijol = useLocation().pathname.startsWith('/frijol');
  return (
    <div className={`encabezado-ancho sticky top-0 z-20 pt-3.5 pb-4 shadow-sm ${esFrijol ? 'bg-[#14532d] border-b border-emerald-950 text-white' : 'bg-white/95 backdrop-blur-md border-b border-slate-200/60'}`}>
      {back !== undefined && (
        <div className="mb-2.5"><BotonAtras onClick={() => navigate(back as never)} tono={esFrijol ? 'oscuro' : 'claro'} /></div>
      )}
      <div className="max-w-[700px] mx-auto">
        <h1 className={`text-[20px] font-bold leading-tight ${esFrijol ? 'text-white break-words' : 'text-slate-900 truncate'}`}>{title}</h1>
        {subtitle && <p className={`text-[12px] font-medium mt-0.5 ${esFrijol ? 'text-emerald-100 break-words' : 'text-slate-500 truncate'}`}>{subtitle}</p>}
      </div>
    </div>
  );
}
