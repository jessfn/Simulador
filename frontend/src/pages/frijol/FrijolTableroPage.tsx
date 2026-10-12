import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList } from 'lucide-react';
import { useAuthStore } from '../../store/auth';
import IconoFrijol from '../../components/IconoFrijol';

// Tablero de Frijol (F0). En esta etapa muestra el acceso; los contadores y borradores llegan con el registro.
export default function FrijolTableroPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const nombre = user?.nombre_completo || user?.nombres || 'Técnico';

  return (
    <div className="px-4 py-5 space-y-5">
      <section className="rounded-3xl bg-gradient-to-br from-[#0f3821] to-[#1A5C38] text-white p-5 shadow-lg">
        <div className="flex items-center gap-3">
          <IconoFrijol className="h-10 w-10" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-emerald-200/90 uppercase tracking-[0.12em]">Registro de Frijol</p>
            <h1 className="text-[22px] font-bold leading-tight truncate" style={{ fontFamily: 'Patria, Georgia, serif' }}>
              Hola, {nombre}
            </h1>
          </div>
        </div>
        <button
          onClick={() => navigate('/frijol/tecnico/nuevo')}
          className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl bg-white text-[#1A5C38] font-bold text-[16px] py-4 active:scale-[0.98] transition-transform"
        >
          <Plus size={20} /> Nuevo registro
        </button>
      </section>

      <button
        onClick={() => navigate('/frijol/tecnico/registros')}
        className="w-full flex items-center gap-3 rounded-2xl bg-white border border-slate-200 p-4 text-left active:scale-[0.99] transition-transform"
      >
        <span className="w-11 h-11 rounded-xl bg-[#eef8f2] text-[#1A5C38] flex items-center justify-center"><ClipboardList size={22} /></span>
        <span className="flex-1">
          <span className="block text-[15px] font-bold text-slate-900">Mis registros</span>
          <span className="block text-[13px] text-slate-500">Productores de frijol que has registrado</span>
        </span>
      </button>
    </div>
  );
}
