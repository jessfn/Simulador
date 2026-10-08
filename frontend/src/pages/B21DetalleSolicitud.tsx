import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

const FLUJO = ['contactado', 'agendada', 'canalizada', 'cerrada'];


const flujoColor: Record<string, string> = {
  contactado: 'border-yellow-400 bg-yellow-50 text-yellow-800',
  agendada: 'border-purple-400 bg-purple-50 text-purple-800',
  canalizada: 'border-green-500 bg-green-50 text-green-800',
  cerrada: 'border-gray-300 bg-[#f4fbf7] text-gray-600',
};

export default function B21DetalleSolicitud() {
  const { toast } = useToast();
  const { id, sid } = useParams<{ id: string; sid: string }>();
  const [solicitud, setSolicitud] = useState<any>(null);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.ventanillas.solicitudes(Number(id))
      .then((r: any) => {
        const found = r.find((s: any) => s.id === Number(sid));
        if (found) { setSolicitud(found); setNuevoEstado(found.estado); }
      }).catch(() => {});
  }, [id, sid]);

  async function guardar() {
    setSaving(true);
    try {
      await api.ventanillas.cambiarEstado(Number(id), Number(sid), { estado: nuevoEstado, notas });
      navigate(`/maiz/bodega/ventanillas/${id}/solicitudes`);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally { setSaving(false); }
  }

  if (!solicitud) return (
    <div className="p-10 text-center text-gray-400 text-[15px]">Cargando…</div>
  );

  return (
    <div className="w-full pb-10">
      <PageHeader title="Detalle de Solicitud" back={`/maiz/bodega/ventanillas/${id}/solicitudes`} />

      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Datos del productor */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6">
          <div className="pb-4 border-b border-gray-100">
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Productor</p>
          </div>
          <div className="pt-5 space-y-2.5">
            <p className="font-black text-[20px] text-gray-900 tracking-tight">
              {solicitud.productor_nombre || 'Productor no registrado'}
            </p>
            <p className="text-[15px] font-medium text-gray-500">{solicitud.municipio}</p>
            <p className="text-[15px] font-medium text-gray-700">
              Apoyo: <span className="font-bold text-[#1A5C38] bg-[#1A5C38]/10 px-2 py-0.5 rounded-lg">{solicitud.nombre_apoyo}</span>
            </p>
            <p className="text-[12px] text-gray-400">
              {new Date(solicitud.created_at).toLocaleString('es-MX')}
            </p>
          </div>
        </div>

        {/* Cambiar estado */}
        <div className="bg-white rounded-[1.5rem] shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-black/[0.04] p-6 space-y-6">
          <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Estado de la solicitud</p>
          <div className="flex flex-wrap gap-2.5">
            {FLUJO.map(e => (
              <button
                key={e}
                onClick={() => setNuevoEstado(e)}
                className={`px-5 py-2.5 rounded-[1.25rem] text-[14px] font-bold border-2 transition-all hover:scale-[1.02] active:scale-[0.98]
                  ${nuevoEstado === e
                    ? (flujoColor[e] || 'border-[#1A5C38] bg-green-50 text-[#1A5C38]') + ' shadow-[0_4px_12px_rgba(0,0,0,0.05)]'
                    : 'border-transparent bg-[#eef8f2] text-gray-500 hover:bg-gray-200/60'}`}
              >
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[14px] font-bold text-gray-700 mb-2">Notas de gestión</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={4}
              placeholder="Registro de la gestión realizada…"
              className="w-full bg-[#eef8f2] rounded-[1rem] px-5 py-4 text-[16px] font-medium outline-none focus:ring-2 focus:ring-[#1A5C38]/30 border-0 resize-none transition-all"
            />
          </div>

          <div className="pt-2">
            <button
              onClick={guardar}
              disabled={saving || nuevoEstado === solicitud.estado}
              className="w-full bg-[#1A5C38] text-white rounded-[1.25rem] py-4 text-[17px] font-bold active:scale-[0.98] transition-all disabled:opacity-40 shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] disabled:hover:shadow-none"
            >
              {saving ? 'Guardando…' : 'Guardar cambio de estado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
