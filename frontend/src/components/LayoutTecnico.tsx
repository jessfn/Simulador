import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, UserPlus, LogOut, ShieldCheck, UserCircle, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import ChatBubble from './ChatBubble';
import BotonAtras from './BotonAtras';
import IconoFrijol from './IconoFrijol';

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

function iniciales(nombre: string) {
  return nombre ? nombre.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() : 'T';
}

/** Frijol: teléfono → barra superior + navegación inferior; tableta → igual con columna más ancha; computadora (≥1024 px) → barra lateral fija. */
function LayoutFrijol({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const inicio = '/frijol/tecnico';
  const nombre = user?.nombre_completo || user?.nombres || 'Técnico ECA';
  // El asistente de registro y el perfil son pantallas de formulario: una columna más angosta se lee mejor que una a todo lo ancho.
  const estrecha = pathname.startsWith('/frijol/tecnico/nuevo') || pathname.startsWith('/frijol/tecnico/perfil');
  const enRegistro = pathname.startsWith('/frijol/tecnico/nuevo');

  function handleLogout() { logout(); navigate('/frijol/tecnico/login'); }
  const activo = (path: string) => pathname === path || (path !== inicio && pathname.startsWith(path + '/'));

  return (
    <div className="fixed inset-0 flex flex-col lg:flex-row w-full overflow-hidden bg-[#e3f1e8]">
      {/* Barra lateral (computadora) */}
      <aside className="tec-lateral hidden lg:flex flex-col flex-none w-64 xl:w-72 bg-gradient-to-b from-[#0a3c20] via-[#0f3821] to-[#14532d] text-white border-r border-emerald-950 shadow-[4px_0_24px_rgba(0,0,0,0.12)]" aria-label="Navegación principal">
        <div className="flex items-center gap-3 px-6 pt-7 pb-6">
          <IconoFrijol className="h-10 w-10 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[17px] font-black leading-tight">Frijol</p>
            <p className="text-[12px] font-semibold text-emerald-200/90 leading-tight mt-0.5">Técnicos ECA</p>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto">
          {NAV_FRIJOL.map(({ path, icon: Icon, label }) => {
            const a = activo(path);
            return (
              <Link key={path} to={path} aria-current={a ? 'page' : undefined}
                className={`flex items-center gap-3.5 min-h-[48px] px-4 rounded-2xl text-[15px] transition-colors ${a ? 'bg-white/15 text-white font-bold ring-1 ring-white/20' : 'text-emerald-100/85 font-medium hover:bg-white/10 hover:text-white'}`}>
                <Icon size={21} strokeWidth={a ? 2.5 : 2} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 mt-4 rounded-2xl bg-black/20 border border-white/10 p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-[#0f3821] flex items-center justify-center text-[13px] font-bold flex-shrink-0">{iniciales(nombre)}</div>
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold leading-tight break-words">{nombre}</p>
              {user?.tipo_tecnico_etiqueta && <p className="text-[11.5px] text-emerald-200/90 mt-0.5 leading-tight">{user.tipo_tecnico_etiqueta}</p>}
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full min-h-[42px] rounded-xl bg-white/10 hover:bg-white/20 text-[13.5px] font-semibold flex items-center justify-center gap-2 transition-colors">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Barra superior (teléfono y tableta) */}
        <header className="tec-encabezado-app lg:hidden flex-none z-30 border-b bg-gradient-to-r from-[#0a3c20] via-[#0f3821] to-[#14532d] border-emerald-950 shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between gap-3 py-3" style={{ paddingInline: 'max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px))' }}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/15 ring-1 ring-white/25">
                <ShieldCheck size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-black leading-tight text-white">Frijol · Técnicos ECA</p>
                <p className="text-[11px] font-semibold mt-0.5 leading-tight text-emerald-200 break-words">{nombre}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold bg-emerald-100 text-[#0f3821]">{iniciales(nombre)}</div>
              <button onClick={handleLogout} className="p-2.5 rounded-lg transition-colors text-emerald-100 hover:text-white hover:bg-white/10" aria-label="Cerrar sesión">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="tec-area flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full relative scroll-smooth bg-[#e3f1e8]" style={{ overscrollBehaviorY: 'contain' }}>
          <div className={`tec-col ${estrecha ? 'tec-col--estrecha' : ''} ${enRegistro ? '' : 'pb-24 lg:pb-10'}`}>{children}</div>
        </main>

        {/* Navegación inferior (teléfono y tableta) */}
        <nav className="tec-nav lg:hidden flex-none z-30 bg-[#0f3821] border-t border-emerald-950 shadow-[0_-4px_20px_rgb(0,0,0,0.18)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingInline: 'env(safe-area-inset-left, 0px) env(safe-area-inset-right, 0px)' }} aria-label="Navegación principal">
          <div className="flex items-stretch max-w-xl mx-auto">
            {NAV_FRIJOL.map(({ path, icon: Icon, label }) => {
              const a = activo(path);
              return (
                <Link key={path} to={path} aria-current={a ? 'page' : undefined}
                  className={`flex-1 flex flex-col items-center justify-center pt-2 pb-2.5 gap-1 transition-colors ${a ? 'text-white' : 'text-emerald-200/80 hover:text-white'}`}>
                  <span className={`flex items-center justify-center w-14 h-8 rounded-full transition-colors ${a ? 'bg-emerald-500/30' : ''}`}><Icon size={22} strokeWidth={a ? 2.5 : 2} /></span>
                  <span className={`text-[11px] leading-none ${a ? 'font-bold' : 'font-medium'}`}>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* El asistente de registro es una tarea de atención completa: ahí no se muestra la burbuja de ayuda para que no tape campos ni botones */}
      {!enRegistro && <ChatBubble />}
    </div>
  );
}

export function LayoutTecnico({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const esFrijol = pathname.startsWith('/frijol');
  if (esFrijol) return <LayoutFrijol>{children}</LayoutFrijol>;

  const NAV = NAV_MAIZ;
  const inicio = '/maiz/tecnico';

  function handleLogout() {
    logout();
    navigate('/maiz/tecnico/login');
  }

  const nombre = user?.nombre_completo || user?.nombres || 'Técnico ECA';
  const initials = iniciales(nombre);

  return (
    <div className="fixed inset-0 flex flex-col w-full overflow-hidden bg-[#eef8f2]">
      {/* Header */}
      <header className="flex-none z-30 border-b bg-white/95 backdrop-blur-xl border-slate-200/60"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1A5C38]">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-black leading-tight text-slate-900">Maíz · Técnicos ECA</p>
              <p className="text-[11px] font-semibold mt-0.5 leading-tight text-slate-400">{nombre}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold bg-[#eef8f2] text-[#1A5C38]">
              {initials}
            </div>
            <button onClick={handleLogout}
              className="p-2 rounded-lg transition-colors text-slate-400 hover:text-red-500 hover:bg-red-50"
              aria-label="Cerrar sesión">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden w-full relative scroll-smooth bg-[#eef8f2]" style={{ overscrollBehaviorY: 'contain' }}>
        <div className="w-full max-w-2xl mx-auto">{children}</div>
      </main>

      {/* Bottom nav */}
      <nav className="flex-none z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-4px_20px_rgb(0,0,0,0.02)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
          {NAV.map(({ path, icon: Icon, label }) => {
            const active = pathname === path || (path !== inicio && pathname.startsWith(path + '/'));
            const color = active ? 'text-[#1A5C38]' : 'text-slate-400 hover:text-slate-500';
            return (
              <Link key={path} to={path}
                className={`flex-1 flex flex-col items-center justify-center pt-2 pb-2.5 gap-1 transition-colors ${color}`}>
                <span className="flex items-center justify-center w-14 h-8 rounded-full"><Icon size={22} strokeWidth={active ? 2.5 : 2} /></span>
                <span className={`text-[11px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
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
  const esFrijol = useLocation().pathname.startsWith('/frijol');

  if (esFrijol) {
    // Frijol: el encabezado llena el área de contenido (no la ventana, que incluye la barra lateral); en computadora el botón Volver
    // queda siempre en la esquina izquierda del área y el título en la columna.
    return (
      <div className="encabezado-tec sticky top-0 z-20 pt-3.5 pb-4 shadow-sm bg-[#14532d] border-b border-emerald-950 text-white lg:py-4">
        <div className="encabezado-tec__fila">
          {back !== undefined && (
            <div className="mb-2.5 lg:mb-0 flex-none"><BotonAtras onClick={() => navigate(back as never)} tono="oscuro" /></div>
          )}
          <div className="encabezado-tec__in">
            <h1 className="text-[20px] lg:text-[24px] font-bold leading-tight text-white break-words">{title}</h1>
            {subtitle && <p className="text-[12px] lg:text-[13px] font-medium mt-0.5 text-emerald-100 break-words">{subtitle}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="encabezado-ancho sticky top-0 z-20 pt-3.5 pb-4 shadow-sm bg-white/95 backdrop-blur-md border-b border-slate-200/60">
      {back !== undefined && (
        <div className="mb-2.5"><BotonAtras onClick={() => navigate(back as never)} tono="claro" /></div>
      )}
      <div className="max-w-[700px] mx-auto">
        <h1 className="text-[20px] font-bold leading-tight text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-[12px] font-medium mt-0.5 text-slate-500 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}
