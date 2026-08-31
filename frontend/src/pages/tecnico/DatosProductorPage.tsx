import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ArrowRight, AlertTriangle } from 'lucide-react';
import { PageHeaderTecnico } from '../../components/LayoutTecnico';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function DatosProductorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { curp: curpParam } = useParams();
  const state = (location.state || {}) as Record<string, any>;

  const [nombres, setNombres] = useState(state.nombres || '');
  const [apellidoPaterno, setApellidoPaterno] = useState(state.apellido_paterno || '');
  const [apellidoMaterno, setApellidoMaterno] = useState(state.apellido_materno || '');
  const [telefono, setTelefono] = useState('');
  const [estadoId, setEstadoId] = useState('');
  const [estadoNombre, setEstadoNombre] = useState('');
  const [municipioNombre, setMunicipioNombre] = useState('');
  const [estados, setEstados] = useState<{ state_id: string; name: string }[]>([]);
  const [municipios, setMunicipios] = useState<{ municipality_id: string; name: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${BASE}/auth/states`)
      .then(r => r.json())
      .then(d => setEstados(d.states || (Array.isArray(d) ? d : [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!estadoId) { setMunicipios([]); return; }
    fetch(`${BASE}/auth/municipalities?state_id=${estadoId}`)
      .then(r => r.json())
      .then(d => setMunicipios(d.municipalities || (Array.isArray(d) ? d : [])))
      .catch(() => {});
  }, [estadoId]);

  function continuar() {
    if (!nombres.trim() || !apellidoPaterno.trim()) {
      setError('Nombres y apellido paterno son obligatorios.');
      return;
    }
    if (!telefono || telefono.length < 10) {
      setError('Ingresa un teléfono válido de 10 dígitos.');
      return;
    }
    if (!estadoNombre || !municipioNombre) {
      setError('Selecciona el estado y municipio del productor.');
      return;
    }
    setError('');
    navigate(`/tecnico/registrar/${curpParam}/up`, {
      state: {
        ...state,
        curp: curpParam,
        nombres,
        apellido_paterno: apellidoPaterno,
        apellido_materno: apellidoMaterno,
        telefono,
        state_nombre: estadoNombre,
        municipio_nombre: municipioNombre,
      },
    });
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20 focus:border-[#1A5C38] transition-all';

  return (
    <div className="min-h-full pb-8">
      <PageHeaderTecnico title="Datos del productor" subtitle="Paso 2 · Información básica" back={-1} />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Nombres</label>
            <input type="text" value={nombres} onChange={e => setNombres(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Apellido paterno</label>
            <input type="text" value={apellidoPaterno} onChange={e => setApellidoPaterno(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Apellido materno</label>
            <input type="text" value={apellidoMaterno} onChange={e => setApellidoMaterno(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-1.5">Teléfono</label>
            <input type="tel" inputMode="numeric" value={telefono}
              onChange={e => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10 dígitos" maxLength={10} className={inputCls} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Estado</label>
            <div className="relative">
              <select value={estadoId}
                onChange={e => {
                  const sel = estados.find(s => s.state_id === e.target.value);
                  setEstadoId(e.target.value);
                  setEstadoNombre(sel?.name || '');
                  setMunicipios([]);
                  setMunicipioNombre('');
                }}
                className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20">
                <option value="">Selecciona el estado</option>
                {estados.map(s => <option key={s.state_id} value={s.state_id}>{s.name}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-bold text-slate-700 mb-2">Municipio</label>
            <div className="relative">
              <select value={municipioNombre} onChange={e => setMunicipioNombre(e.target.value)} disabled={!estadoId}
                className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-3 pr-10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20 disabled:bg-[#f4fbf7] disabled:text-slate-400">
                <option value="">{estadoId ? 'Selecciona el municipio' : 'Primero elige el estado'}</option>
                {municipios.map(m => <option key={m.municipality_id} value={m.name}>{m.name}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-[12.5px] text-red-600">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> <span>{error}</span>
          </div>
        )}

        <button onClick={continuar}
          className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
          Continuar → Dibujar parcela <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
