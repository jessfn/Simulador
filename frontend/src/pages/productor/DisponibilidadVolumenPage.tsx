import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import DisponibilidadStepper from '../../components/productor/DisponibilidadStepper';

const RANGOS_RAPIDOS = [
  { label: 'Esta semana',      dias: 7  },
  { label: 'Este mes',         dias: 30 },
  { label: 'Próximos 2 meses', dias: 60 },
  { label: 'Elegir fechas',    dias: null },
];

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r.toISOString().split('T')[0];
}

export default function DisponibilidadVolumenPage() {
  const navigate = useNavigate();
  const [volumen, setVolumen] = useState(20);
  const [rangoIdx, setRangoIdx] = useState<number | null>(null);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [custom, setCustom] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const selectRango = (idx: number) => {
    const r = RANGOS_RAPIDOS[idx];
    setRangoIdx(idx);
    if (r.dias === null) {
      setCustom(true);
      setFechaDesde(today);
      setFechaHasta('');
    } else {
      setCustom(false);
      setFechaDesde(today);
      setFechaHasta(addDays(new Date(), r.dias));
    }
  };

  const canContinue = volumen > 0 && fechaDesde && fechaHasta;

  const confirmar = () => {
    sessionStorage.setItem('disp_volumen', String(volumen));
    sessionStorage.setItem('disp_fecha_desde', fechaDesde);
    sessionStorage.setItem('disp_fecha_hasta', fechaHasta);
    navigate('/maiz/productor/disponibilidad/confirmar');
  };

  return (
    <div className="bg-[#eef8f2] flex flex-col min-h-0">
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-1.5 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Disponibilidad</p>
          <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">Volumen y fechas</h1>
        </div>
      </div>
      <DisponibilidadStepper paso={3} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 sm:px-6 pb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 text-center mb-1">Cuantas toneladas?</h2>
          <div className="text-center mt-4 mb-2">
            <span className="text-5xl font-bold text-[#1A5C38]">{volumen}</span>
            <span className="text-xl text-zinc-400 ml-1">ton</span>
          </div>
          <input type="range" min={1} max={200} step={1} value={volumen}
            onChange={e => setVolumen(Number(e.target.value))}
            className="w-full accent-[#1A5C38]" />
          <div className="flex justify-between text-xs text-zinc-400 mt-1">
            <span>1 ton</span><span>200 ton</span>
          </div>

          <h3 className="text-base font-bold text-zinc-800 mt-8 mb-3">Cuando estara disponible?</h3>
          <div className="grid grid-cols-2 gap-2">
            {RANGOS_RAPIDOS.map((r, i) => (
              <button key={i} onClick={() => selectRango(i)}
                className={`py-3 rounded-xl text-sm font-medium ring-1 transition-all duration-200
                  ${rangoIdx === i ? 'ring-2 ring-[#1A5C38] bg-emerald-50 text-[#1A5C38]' : 'ring-zinc-200 text-zinc-600 hover:bg-[#eef8f2]'}`}>
                {r.label}
              </button>
            ))}
          </div>

          {custom && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-zinc-500 font-medium">Desde</label>
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                  className="w-full bg-white ring-1 ring-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1A5C38] focus:outline-none transition-shadow" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 font-medium">Hasta</label>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                  className="w-full bg-white ring-1 ring-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#1A5C38] focus:outline-none transition-shadow" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 border-t border-zinc-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto">
          <button onClick={confirmar} disabled={!canContinue}
            className="w-full bg-[#1A5C38] hover:bg-[#15482d] text-white py-4 rounded-2xl text-base font-semibold
                       disabled:opacity-40 active:scale-[0.98] transition-all duration-200">
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
