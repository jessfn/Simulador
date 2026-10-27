import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Circle } from 'lucide-react';

import BotonAtras from '../../components/BotonAtras';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const ESTADOS = ['enviada', 'recibida', 'contactado', 'agendada', 'canalizada'];
const ESTADO_LABELS: Record<string, string> = {
  enviada:    'Solicitud enviada',
  recibida:   'La ventanilla recibió tu solicitud',
  contactado: 'La ventanilla te va a contactar',
  agendada:   'Cita agendada',
  canalizada: 'Solicitud canalizada con éxito',
};

interface Solicitud {
  id: number; tipo_apoyo: string; estado: string; created_at: string;
  notas_ventanilla?: string;
}

export default function EstadoSolicitudPage() {
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/productor/mis-solicitudes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setSolicitudes(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;

  return (
    <div className="bg-[#eef8f2]">
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <BotonAtras onClick={() => navigate(-1)} tono="claro" />
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Apoyos</p>
          <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">Mis solicitudes</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 pt-4 space-y-4">
        {solicitudes.length === 0 && (
          <p className="text-zinc-400 text-center py-8">No tienes solicitudes aun</p>
        )}

        {solicitudes.map(s => {
          const currentIdx = ESTADOS.indexOf(s.estado);
          return (
            <div key={s.id} className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-zinc-100">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="font-bold text-zinc-800 capitalize">{s.tipo_apoyo}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString('es-MX')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium
                  ${s.estado === 'canalizada' ? 'bg-green-100 text-green-700'
                  : s.estado === 'rechazada' ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-700'}`}>
                  {ESTADO_LABELS[s.estado] || s.estado}
                </span>
              </div>

              {/* Timeline */}
              <div className="space-y-3 ml-1">
                {ESTADOS.map((e, i) => {
                  const done = i <= currentIdx;
                  return (
                    <div key={e} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        {done
                          ? <CheckCircle size={18} className="text-[#1A5C38]" />
                          : <Circle size={18} className="text-zinc-300" />
                        }
                        {i < ESTADOS.length - 1 && (
                          <div className={`w-0.5 h-6 ${i < currentIdx ? 'bg-[#1A5C38]' : 'bg-zinc-200'}`} />
                        )}
                      </div>
                      <p className={`text-sm ${done ? 'text-zinc-800 font-medium' : 'text-zinc-400'}`}>
                        {ESTADO_LABELS[e]}
                      </p>
                    </div>
                  );
                })}
              </div>

              {s.notas_ventanilla && (
                <div className="mt-4 bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-600 font-medium">Nota de la ventanilla:</p>
                  <p className="text-sm text-blue-800 mt-1">{s.notas_ventanilla}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
