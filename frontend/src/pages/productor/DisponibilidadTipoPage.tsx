import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Wheat } from 'lucide-react';
import DisponibilidadStepper from '../../components/productor/DisponibilidadStepper';

const TIPOS = [
  { valor: 'blanco',   etiqueta: 'Maíz Blanco',   bg: 'bg-zinc-100',    descripcion: 'H-40, H-59, H-564C y otros' },
  { valor: 'amarillo', etiqueta: 'Maíz Amarillo',  bg: 'bg-amber-100',   descripcion: 'H-384A, H-385, Buho y otros' },
  { valor: 'criollo',  etiqueta: 'Maíz Criollo',   bg: 'bg-emerald-100', descripcion: 'Criollo local o nativo' },
];

export default function DisponibilidadTipoPage() {
  const navigate = useNavigate();

  const seleccionar = (tipo: string) => {
    sessionStorage.setItem('disp_tipo', tipo);
    navigate('/maiz/productor/disponibilidad/variedad');
  };

  return (
    <div className="bg-[#eef8f2]">
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <button onClick={() => navigate('/maiz/productor')}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-1.5 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Disponibilidad</p>
          <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">Tipo de maiz</h1>
        </div>
      </div>
      <DisponibilidadStepper paso={1} />
      <div className="max-w-lg mx-auto px-4 sm:px-6">
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 text-center mb-1">
          Que tipo de maiz tienes?
        </h2>
        <p className="text-zinc-500 text-sm text-center mb-6">Toca una opcion para continuar</p>
        <div className="space-y-3">
          {TIPOS.map(t => (
            <button key={t.valor} onClick={() => seleccionar(t.valor)}
              className="w-full bg-white ring-1 ring-zinc-200 rounded-2xl
                         py-5 px-5 flex items-center gap-4 text-left
                         hover:ring-zinc-300 active:ring-2 active:ring-[#1A5C38] active:bg-emerald-50 transition-all duration-200">
              <div className={`w-12 h-12 ${t.bg} rounded-xl flex items-center justify-center shrink-0`}>
                <Wheat size={24} className="text-zinc-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-800">{t.etiqueta}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{t.descripcion}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
