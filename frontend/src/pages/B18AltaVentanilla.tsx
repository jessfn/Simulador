import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

export default function B18AltaVentanilla() {
  const { toast } = useToast();
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [form, setForm] = useState({
    bodega_id: '', tipo: '', nombre_enlace_agricultura: '',
    nombre_ventanilla: '', telefono_responsable: '', correo_responsable: '',
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.bodeguero.misBodegas().then((r: any) => setBodegas(r)).catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.ventanillas.create({ ...form, bodega_id: Number(form.bodega_id) });
      navigate('/maiz/bodega/ventanillas');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  }

  const inputClass = 'w-full bg-[#eef8f2] rounded-[1rem] px-5 py-4 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0 transition-all';
  const labelClass = 'block text-[14px] font-bold text-gray-700 mb-2';

  return (
    <div className="w-full pb-10">
      <PageHeader title="Nueva Ventanilla" back="/maiz/bodega/ventanillas" />

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bodega y tipo */}
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Bodega y tipo</p>
          <div>
            <label className={labelClass}>Bodega asociada</label>
            <select value={form.bodega_id} onChange={e => set('bodega_id', e.target.value)} required className={inputClass}>
              <option value="">Selecciona bodega</option>
              {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Tipos de apoyos que hay en esta ventanilla</label>
            <div className="grid grid-cols-3 gap-2">
              {[['coberturas', 'Coberturas'], ['incentivos', 'Incentivos'], ['ambos', 'Ambos']].map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => set('tipo', k)}
                  className={`py-4 rounded-[1rem] text-[15px] font-bold transition-all border-2
                    ${form.tipo === k
                      ? 'border-[#1A5C38] bg-[#1A5C38]/5 text-[#1A5C38]'
                      : 'border-transparent bg-[#eef8f2] text-gray-500 hover:bg-gray-200/50'}`}
                >
                  {l}
                </button>
              ))}
            </div>
              <p className="text-[13px] text-gray-500 font-medium mt-2">Selecciona qué apoyos del gobierno se gestionan en esta ventanilla</p>
            </div>
          </div>

          {/* Responsable */}
          <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-5">
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Responsable</p>
          <div>
            <label className={labelClass}>Nombre del enlace con Agricultura</label>
            <input
              type="text"
              value={form.nombre_enlace_agricultura}
              onChange={e => set('nombre_enlace_agricultura', e.target.value)}
              required
              placeholder="Nombre del responsable"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Nombre de la ventanilla <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              value={form.nombre_ventanilla}
              onChange={e => set('nombre_ventanilla', e.target.value)}
              placeholder="Ej: Ventanilla Norte"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Teléfono</label>
              <input
                type="tel"
                value={form.telefono_responsable}
                onChange={e => set('telefono_responsable', e.target.value)}
                required
                placeholder="6671234567"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Correo</label>
              <input
                type="email"
                value={form.correo_responsable}
                onChange={e => set('correo_responsable', e.target.value)}
                required
                placeholder="correo@sader.gob.mx"
                className={inputClass}
              />
            </div>
          </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[17px] font-bold active:scale-[0.98] transition-all disabled:opacity-40 shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] disabled:hover:shadow-none"
            >
              {loading ? 'Guardando…' : 'Crear ventanilla'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
