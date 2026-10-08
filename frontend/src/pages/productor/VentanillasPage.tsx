import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, ChevronLeft, AlertCircle } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface Ventanilla {
  id: number; nombre: string; municipio: string; estado: string;
}

export default function VentanillasPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipo = searchParams.get('tipo') || 'incentivo';
  const [items, setItems] = useState<Ventanilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [solicitando, setSolicitando] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [coordsProductor, setCoordsProductor] = useState<{ lat: number; lng: number } | null>(null);
  const [coordsCargadas, setCoordsCargadas] = useState(false);

  // Cargar coordenadas del productor desde el dashboard
  useEffect(() => {
    const token = localStorage.getItem('simac_token');
    fetch(`${BASE}/productor/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (d.lat && d.lng) setCoordsProductor({ lat: d.lat, lng: d.lng });
      })
      .catch(() => {})
      .finally(() => setCoordsCargadas(true));
  }, []);

  // Cargar ventanillas (sin filtro de distancia — hay pocas a nivel nacional)
  useEffect(() => {
    if (!coordsCargadas) return;
    const token = localStorage.getItem('simac_token');
    setLoading(true);
    const params = new URLSearchParams({ es_ventanilla: 'true', is_ventanilla: 'true' });
    fetch(`${BASE}/infraestructura?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        let lista: Ventanilla[] = d.infraestructura || (Array.isArray(d) ? d : d.data) || [];
        // Ordenar por proximidad si hay coords del productor
        if (coordsProductor && lista.length > 0) {
          lista = lista.slice().sort((a: any, b: any) => {
            const dist = (lat1: number, lng1: number, lat2: number, lng2: number) => {
              const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
              const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
              return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
            };
            const dA = (a.latitud && a.longitud) ? dist(coordsProductor.lat, coordsProductor.lng, a.latitud, a.longitud) : 99999;
            const dB = (b.latitud && b.longitud) ? dist(coordsProductor.lat, coordsProductor.lng, b.latitud, b.longitud) : 99999;
            return dA - dB;
          });
        }
        setItems(lista);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [coordsCargadas, coordsProductor]);

  const solicitar = async (infraId: number) => {
    setSolicitando(infraId);
    setErrorMsg('');
    try {
      const token = localStorage.getItem('simac_token');
      const res = await fetch(`${BASE}/productor/solicitar-apoyo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ infraestructura_id: infraId, tipo_apoyo: tipo, notas: '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'No se pudo enviar la solicitud. Intenta de nuevo.');
        setTimeout(() => setErrorMsg(''), 4000);
        return;
      }
      navigate(`/maiz/productor/solicitud/${data.solicitud_id || data.id}`);
    } catch {
      setErrorMsg('Error de conexión. Verifica tu internet e intenta de nuevo.');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setSolicitando(null);
    }
  };

  return (
    <div className="bg-[#eef8f2]">
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-1.5 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Apoyos</p>
          <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">
            {tipo === 'incentivo' ? 'Ventanillas de incentivos' : 'Ventanillas de coberturas'}
          </h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 sm:px-6 pt-4 pb-28 space-y-3">
        {loading && <p className="text-zinc-400 text-center py-8">Cargando ventanillas...</p>}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center text-center py-12 px-4 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white shadow-sm ring-1 ring-zinc-100 flex items-center justify-center">
              <MapPin size={24} className="text-zinc-300" />
            </div>
            <p className="text-zinc-700 font-semibold text-[15px]">No hay ventanillas disponibles</p>
            <p className="text-zinc-400 text-[13px] leading-relaxed max-w-xs">
              Por el momento no hay ventanillas activas en tu zona. Cuando se habiliten podrás solicitar información directamente desde aquí.
            </p>
          </div>
        )}

        {items.map(v => (
          <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-zinc-100">
            <p className="font-bold text-zinc-800">{v.nombre}</p>
            <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
              <MapPin size={12} /> {v.municipio}, {v.estado}
            </p>
            <button onClick={() => solicitar(v.id)}
              disabled={solicitando === v.id}
              className="mt-3 w-full bg-[#1A5C38] hover:bg-[#15482d] text-white py-3 rounded-xl text-sm font-semibold
                         active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
              {solicitando === v.id ? 'Enviando...' : 'Solicitar informacion'}
            </button>
          </div>
        ))}
      </div>

      {/* Toast de error */}
      {errorMsg && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] w-[calc(100%-2rem)] max-w-xs animate-fade-in">
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-2xl bg-red-600 text-white">
            <AlertCircle size={18} className="flex-shrink-0" />
            <p className="text-[13px] font-semibold leading-snug">{errorMsg}</p>
          </div>
        </div>
      )}
    </div>
  );
}
