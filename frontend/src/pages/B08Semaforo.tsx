import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageBanner } from '../components/Layout';
import { api } from '../services/api';
import { CheckCircle2 } from 'lucide-react';
import { useToast } from '../components/Toast';

type Sem = 'sin_actividad' | 'verde' | 'amarillo' | 'rojo';

const OPTIONS: { key: Sem; dotColor: string; label: string; desc: string; activeBg: string; activeBorder: string; activeText: string }[] = [
  { key: 'verde',    dotColor: 'bg-emerald-500', label: 'Comprando esta semana',          desc: 'Visible para productores en el mapa', activeBg: 'bg-emerald-50', activeBorder: 'border-emerald-400', activeText: 'text-emerald-700' },
  { key: 'amarillo', dotColor: 'bg-amber-400',   label: 'Comprando con capacidad limitada', desc: 'Espacio reducido disponible',          activeBg: 'bg-amber-50',   activeBorder: 'border-amber-400',   activeText: 'text-amber-700' },
  { key: 'rojo',     dotColor: 'bg-red-500',     label: 'No compro esta semana',           desc: 'Sin compras por el momento',          activeBg: 'bg-red-50',     activeBorder: 'border-red-400',     activeText: 'text-red-700' },
];

export default function B08Semaforo() {
  const { toast, confirm } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Sem>('sin_actividad');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.bodegas.get(Number(id))
      .then((r: any) => setSelected(r.bodega?.semaforo_compra || 'sin_actividad'))
      .catch(() => {});
  }, [id]);

  async function guardar() {
    const labels: Record<string, string> = { verde: 'Comprando esta semana', amarillo: 'Capacidad limitada', rojo: 'No compro esta semana' };
    const ok = await confirm(`¿Cambiar estado a "${labels[selected] || selected}"?`);
    if (!ok) return;
    setSaving(true);
    try {
      await api.bodegas.semaforo(Number(id), selected);
      navigate(-1);
    } catch (err: any) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="w-full">
      <PageBanner title="Estado de Compra" subtitle="Visible para productores" back={`/maiz/bodega/mis-bodegas/${id}`} />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-[14px] text-gray-400 text-center mb-6 font-medium">
            Indica si tu bodega está comprando maíz esta semana
          </p>

          {OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSelected(opt.key)}
              className={`w-full p-5 rounded-[1.5rem] border-2 text-left transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.98] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] group/btn
                ${selected === opt.key ? `${opt.activeBg} ${opt.activeBorder} shadow-[0_4px_12px_rgba(0,0,0,0.04)]` : 'bg-white border-transparent hover:border-black/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.02)]'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full flex-shrink-0 ${opt.dotColor} shadow-sm transition-transform duration-500 group-hover/btn:scale-110`} />
                <div className="flex-1 transition-transform duration-500 group-hover/btn:translate-x-1">
                  <p className={`font-bold text-[15px] ${selected === opt.key ? opt.activeText : 'text-gray-900'}`}>{opt.label}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5 font-medium">{opt.desc}</p>
                </div>
                {selected === opt.key && <CheckCircle2 size={20} className={opt.activeText} />}
              </div>
            </button>
          ))}

          <button
            onClick={guardar}
            disabled={saving}
            className="w-full mt-4 bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[16px] font-bold shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:hover:translate-y-0"
          >
            {saving ? 'Guardando…' : 'Guardar estado'}
          </button>
        </div>
      </div>
    </div>
  );
}
