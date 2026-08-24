import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function DisponibilidadConfirmPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const tipo = sessionStorage.getItem('disp_tipo') || '';
  const variedadCode = sessionStorage.getItem('disp_variedad_code') || '';
  const variedadNombre = sessionStorage.getItem('disp_variedad_nombre') || '';
  const variedadLibre = sessionStorage.getItem('disp_variedad_libre') || '';
  const volumen = sessionStorage.getItem('disp_volumen') || '';
  const fechaDesde = sessionStorage.getItem('disp_fecha_desde') || '';
  const fechaHasta = sessionStorage.getItem('disp_fecha_hasta') || '';

  const [humedad, setHumedad] = useState('');
  const [impurezas, setImpurezas] = useState('');
  const [granoQuebrado, setGranoQuebrado] = useState('');

  const enviar = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('simac_token');
      const res = await fetch(`${BASE}/productor/disponibilidad`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo_maiz: tipo,
          variedad_code: variedadCode,
          variedad_libre: variedadLibre || null,
          volumen_estimado_ton: Number(volumen),
          fecha_disponible_desde: fechaDesde,
          fecha_disponible_hasta: fechaHasta,
          humedad_pct: humedad || null,
          impurezas_pct: impurezas || null,
          grano_quebrado_pct: granoQuebrado || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Error al enviar');
        return;
      }
      // Limpiar sessionStorage
      ['disp_tipo','disp_variedad_code','disp_variedad_nombre','disp_variedad_libre','disp_volumen','disp_fecha_desde','disp_fecha_hasta']
        .forEach(k => sessionStorage.removeItem(k));
      setSent(true);
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-white flex flex-col items-center justify-center px-6 sm:px-8 text-center py-12">
        <CheckCircle size={64} className="text-[#1A5C38] mb-4" />
        <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-2">Listo!</h2>
        <p className="text-zinc-500 text-sm sm:text-base mb-6 max-w-sm">
          Las bodegas cercanas a tu zona podran ver que tienes maiz disponible.
          Te notificamos si alguna esta interesada.
        </p>
        <button onClick={() => navigate('/productor')}
          className="bg-[#1A5C38] hover:bg-[#15482d] text-white px-8 py-3 rounded-2xl font-semibold transition-all duration-200 active:scale-[0.98]">
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#eef8f2] flex flex-col">
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_4px_20px_rgba(26,92,56,0.25)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-5">
          <button onClick={() => navigate(-1)}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-1.5 active:opacity-60 transition-opacity">
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <p className="text-[11px] font-semibold text-green-300/70 uppercase tracking-widest mb-1">Disponibilidad</p>
          <h1 className="text-[19px] sm:text-[22px] font-black text-white leading-tight tracking-tight">Confirmar</h1>
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-lg mx-auto px-5 sm:px-8 py-6">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-sm ring-1 ring-zinc-100">
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Tipo de maiz</span>
              <span className="font-medium text-zinc-800 text-sm capitalize">{tipo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Variedad</span>
              <span className="font-medium text-zinc-800 text-sm">{variedadNombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Volumen</span>
              <span className="font-bold text-zinc-900">{volumen} toneladas</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 text-sm">Disponible</span>
              <span className="font-medium text-zinc-800 text-sm">
                {fechaDesde ? new Date(fechaDesde + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                {' — '}
                {fechaHasta ? new Date(fechaHasta + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </span>
            </div>
          </div>

          <div className="mt-4 bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 space-y-3 shadow-sm ring-1 ring-zinc-100">
            <p className="text-[13px] font-bold text-gray-400 uppercase tracking-widest">Calidad (opcional)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 font-medium">Humedad (%)</label>
                <input type="number" value={humedad} onChange={e => setHumedad(e.target.value)} step="0.1" placeholder="14.5"
                  className="w-full bg-[#eef8f2] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A5C38]/30" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 font-medium">Impurezas (%)</label>
                <input type="number" value={impurezas} onChange={e => setImpurezas(e.target.value)} step="0.1" placeholder="2"
                  className="w-full bg-[#eef8f2] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A5C38]/30" />
              </div>
              <div>
                <label className="text-xs text-zinc-500 font-medium">Q. quebrado (%)</label>
                <input type="number" value={granoQuebrado} onChange={e => setGranoQuebrado(e.target.value)} step="0.1" placeholder="3"
                  className="w-full bg-[#eef8f2] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#1A5C38]/30" />
              </div>
            </div>
          </div>

          <div className="mt-6 bg-emerald-50 ring-1 ring-emerald-200 rounded-2xl p-4">
            <p className="text-emerald-800 text-sm">
              Las bodegas cercanas a tu zona podran ver que tienes maiz disponible.
              Te notificamos si alguna esta interesada.
            </p>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 ring-1 ring-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 sm:px-8 py-4 border-t border-zinc-200 bg-white/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto">
          <button onClick={enviar} disabled={loading}
            className="w-full bg-[#1A5C38] hover:bg-[#15482d] text-white py-4 rounded-2xl text-base font-semibold
                       disabled:opacity-40 active:scale-[0.98] transition-all duration-200">
            {loading ? 'Enviando...' : 'Confirmar y publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}
