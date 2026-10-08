import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { CheckCircle2 } from 'lucide-react';

export default function B16ProponerConcepto() {
  const { toast } = useToast();
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('MXN/ton');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.conceptos.proponer({ nombre, unidad_default: unidad });
      setOk(true);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  }

  if (ok) return (
    <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-20 text-center">
      <div className="max-w-2xl mx-auto bg-white rounded-[1.5rem] shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-black/[0.04] p-10">
        <CheckCircle2 size={56} className="text-[#1A5C38] mx-auto mb-5" />
        <p className="text-[22px] font-bold text-gray-900">Propuesta enviada</p>
        <p className="text-[15px] text-gray-500 font-medium mt-2 mb-8">Te notificaremos cuando el admin la apruebe.</p>
        <button
          onClick={() => navigate('/maiz/bodega/tarifario')}
          className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[17px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)]"
        >
          Volver al tarifario
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full overflow-x-hidden">
      <PageHeader title="Proponer Nuevo Servicio" back="/maiz/bodega/tarifario" />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Detalles del servicio</p>
            <div>
              <label className="block text-[15px] font-medium text-gray-600 mb-1.5">Nombre del concepto</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                required
                placeholder="Ej: Análisis de calidad"
                className="w-full bg-[#eef8f2] rounded-[1rem] px-5 py-4 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0 transition-all"
              />
            </div>
            <div>
              <label className="block text-[15px] font-medium text-gray-600 mb-1.5">Unidad de cobro</label>
              <select
                value={unidad}
                onChange={e => setUnidad(e.target.value)}
                className="w-full bg-[#eef8f2] rounded-[1rem] px-5 py-4 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0 transition-all"
              >
              <option value="MXN/ton">MXN/ton</option>
              <option value="MXN/ton/mes">MXN/ton/mes</option>
              <option value="MXN/viaje">MXN/viaje</option>
            </select>
          </div>
        </div>

        <div className="bg-[#eef8f2] rounded-[1.25rem] p-5">
          <p className="text-[13px] text-gray-500 font-medium leading-snug">
            Tu propuesta será revisada por el equipo de Maíz. Una vez aprobada, podrás establecer precios para este servicio en tus bodegas.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[17px] font-bold active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] disabled:opacity-40 disabled:active:scale-100 disabled:hover:shadow-none"
        >
          {loading ? 'Enviando…' : 'Enviar propuesta'}
        </button>
      </form>
      </div>
    </div>
  );
}
