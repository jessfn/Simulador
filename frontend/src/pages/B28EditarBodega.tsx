import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, Phone, FileText, Lock } from 'lucide-react';
import { api } from '../services/api';
import { PageBanner } from '../components/Layout';

export default function B28EditarBodega() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [nombre, setNombre] = useState('');
  const [horario, setHorario] = useState('');
  const [telefono, setTelefono] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.infraestructura.get(Number(id))
      .then((r: any) => {
        const b = r.bodega || r;
        setNombre(b.nombre || '');
        setHorario(b.horario || '');
        setTelefono(b.telefono_contacto || '');
        setObservaciones(b.observaciones || '');
      })
      .catch(() => setError('No se pudo cargar la bodega'))
      .finally(() => setCargando(false));
  }, [id]);

  const guardar = async () => {
    if (!id) return;
    setGuardando(true);
    setError(null);
    try {
      await api.bodeguero.editarBodega(id, {
        horario: horario.trim(),
        telefono_contacto: telefono.trim(),
        observaciones: observaciones.trim(),
      });
      setOk(true);
      setTimeout(() => navigate(`/maiz/bodega/mis-bodegas/${id}`), 900);
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-[#eef8f2] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageBanner title="Editar datos de bodega" subtitle={nombre} back={-1} />

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Aviso: nombre/ubicación los controla el Admin */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-[1.25rem] p-5 flex items-start gap-3">
            <Lock size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-[14px] text-blue-700 font-medium leading-relaxed">
              El nombre y la ubicación de la bodega los gestiona el administrador.
              Aquí puedes actualizar tus datos de contacto.
            </p>
          </div>

          {/* Horario */}
          <div className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6">
            <label className="flex items-center gap-2 text-[14px] font-bold text-gray-700 mb-3">
              <Clock size={16} className="text-[#1A5C38]" /> Horario de atención
            </label>
            <input
              type="text"
              value={horario}
              onChange={e => setHorario(e.target.value)}
              placeholder="Ej. Lun a Vie 8:00–17:00, Sáb 8:00–13:00"
              className="w-full bg-[#eef8f2] border-0 rounded-[1rem] px-5 py-4 text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/30 transition-all"
            />
          </div>

          {/* Teléfono */}
          <div className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6">
            <label className="flex items-center gap-2 text-[14px] font-bold text-gray-700 mb-3">
              <Phone size={16} className="text-[#1A5C38]" /> Teléfono de contacto
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="Ej. 667 123 4567"
              className="w-full bg-[#eef8f2] border-0 rounded-[1rem] px-5 py-4 text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/30 transition-all"
            />
          </div>

          {/* Observaciones */}
          <div className="bg-white rounded-[1.5rem] border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-6">
            <label className="flex items-center gap-2 text-[14px] font-bold text-gray-700 mb-3">
              <FileText size={16} className="text-[#1A5C38]" /> Observaciones
            </label>
            <textarea
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Información adicional para los productores (servicios, requisitos, etc.)"
              rows={4}
              className="w-full bg-[#eef8f2] border-0 rounded-[1rem] px-5 py-4 text-[16px] font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/30 transition-all"
            />
          </div>

          {error && <p className="text-red-500 text-[14px] font-medium text-center">{error}</p>}
          {ok && <p className="text-emerald-600 text-[14px] font-bold text-center flex items-center justify-center gap-2">✓ Cambios guardados</p>}

          <button
            onClick={guardar}
            disabled={guardando}
            className="w-full bg-[#1A5C38] text-white py-4 rounded-[1.25rem] text-[17px] font-bold active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_4px_12px_rgba(26,92,56,0.2)] hover:shadow-[0_8px_24px_rgba(26,92,56,0.3)] disabled:hover:shadow-none"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
