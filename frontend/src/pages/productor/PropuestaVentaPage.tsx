import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sprout, Wheat, Check } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface UP {
  up_id: number;
  up_name: string;
  municipality_name: string;
  state_name: string;
  area_ha_calc: number;
  ciclos_activos?: Ciclo[];
}

interface Ciclo {
  cycle_id: number;
  cycle_type: string;
  cycle_year: number;
  variedad_nombre: string;
  variedad_code: string;
  variedad_other?: string;
  area_sown_ha: number;
  estado_ciclo: string;
}

type Paso = 'cargando' | 'sin_ciclo' | 'sel_up' | 'sel_ciclo' | 'datos';

export default function PropuestaVentaPage() {
  const navigate = useNavigate();
  const token = localStorage.getItem('simac_token') || '';

  const [ups, setUps] = useState<UP[]>([]);
  const [upSeleccionada, setUpSeleccionada] = useState<UP | null>(null);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [cicloSeleccionado, setCicloSeleccionado] = useState<Ciclo | null>(null);
  const [volumen, setVolumen] = useState('');
  const [precioMinimo, setPrecioMinimo] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>('cargando');
  const [publicarNegociacion, setPublicarNegociacion] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      try {
        const r = await fetch(`${BASE}/productor/mis-ups-con-ciclos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        const upsData: UP[] = d.ups || [];
        setUps(upsData);

        const upsConCiclos = upsData.filter(u => (u.ciclos_activos?.length || 0) > 0);

        if (upsConCiclos.length === 0) { setPaso('sin_ciclo'); return; }

        if (upsConCiclos.length === 1) {
          const up = upsConCiclos[0];
          setUpSeleccionada(up);
          const ciclosActivos = up.ciclos_activos || [];
          if (ciclosActivos.length === 1) {
            setCicloSeleccionado(ciclosActivos[0]);
            setPaso('datos');
          } else {
            setCiclos(ciclosActivos);
            setPaso('sel_ciclo');
          }
        } else {
          setPaso('sel_up');
        }
      } catch {
        setError('Error al cargar tus parcelas.');
        setPaso('sin_ciclo');
      }
    };
    cargar();
  }, []);

  const seleccionarUP = (up: UP) => {
    setUpSeleccionada(up);
    const ciclosActivos = up.ciclos_activos || [];
    if (ciclosActivos.length === 1) {
      setCicloSeleccionado(ciclosActivos[0]);
      setPaso('datos');
    } else {
      setCiclos(ciclosActivos);
      setPaso('sel_ciclo');
    }
  };

  const variedadLegible = (ciclo: Ciclo) =>
    ciclo.variedad_other || ciclo.variedad_nombre || ciclo.variedad_code || 'Sin variedad';

  const enviar = async () => {
    if (!volumen || Number(volumen) <= 0) { setError('Ingresa las toneladas que ofreces.'); return; }
    if (!fechaDesde || !fechaHasta) { setError('Selecciona el período de disponibilidad.'); return; }
    if (!upSeleccionada || !cicloSeleccionado) { setError('Error: no hay UP o ciclo seleccionado.'); return; }
    if (publicarNegociacion && (!precioMinimo || Number(precioMinimo) <= 0)) {
      setError('Para publicar como negociación abierta necesitas indicar un precio por tonelada.');
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/productor/disponibilidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          up_id: upSeleccionada.up_id,
          ciclo_id: cicloSeleccionado.cycle_id,
          tipo_maiz: cicloSeleccionado.variedad_code?.startsWith('MB') ? 'blanco'
            : cicloSeleccionado.variedad_code?.startsWith('MA') ? 'amarillo'
            : 'criollo',
          variedad_code: cicloSeleccionado.variedad_code,
          variedad_libre: cicloSeleccionado.variedad_other || null,
          volumen_estimado_ton: Number(volumen),
          precio_minimo_ton: precioMinimo ? Number(precioMinimo) : null,
          fecha_disponible_desde: fechaDesde,
          fecha_disponible_hasta: fechaHasta,
          ventana_venta: 'esta_semana',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Error al publicar la propuesta.'); return; }

      let mensaje = '¡Propuesta de venta publicada!';
      if (publicarNegociacion && data?.id) {
        try {
          const resProp = await fetch(`${BASE}/propuestas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              disponibilidad_id: data.id,
              precio_solicitado_ton: Number(precioMinimo),
              volumen_ton: Number(volumen),
              vigencia_hasta: fechaHasta,
            }),
          });
          const propData = await resProp.json();
          if (resProp.ok && propData?.alerta) {
            mensaje = 'Publicado. Tu precio está por debajo de la referencia de mercado — aun así, las bodegas ya pueden verlo y ofertar.';
          } else if (resProp.ok) {
            mensaje = '¡Listo! Las bodegas ya pueden ver tu propuesta y mandarte ofertas.';
          }
        } catch { /* la disponibilidad ya se publicó; la negociación es best-effort */ }
      }
      navigate('/productor', { state: { mensaje } });
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pb-8">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => {
            if (paso === 'datos' && ciclos.length > 1) setPaso('sel_ciclo');
            else if (paso === 'datos' || paso === 'sel_ciclo') setPaso(ups.filter(u => (u.ciclos_activos?.length || 0) > 0).length > 1 ? 'sel_up' : 'datos');
            else navigate(-1);
          }}
          className="p-2 rounded-lg hover:bg-[#eef8f2]">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-gray-900">Propuesta de venta</h1>
          <p className="text-xs text-gray-500">
            {paso === 'sel_up' && 'Selecciona tu parcela'}
            {paso === 'sel_ciclo' && 'Selecciona el ciclo'}
            {paso === 'datos' && 'Toneladas y fechas'}
          </p>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {paso === 'cargando' && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
          </div>
        )}

        {paso === 'sin_ciclo' && (
          <div className="text-center py-16">
            <Sprout size={48} className="text-[#1A5C38] mx-auto mb-4" />
            <p className="font-semibold text-gray-800 text-lg mb-2">Primero registra tu ciclo</p>
            <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">
              Para publicar una propuesta de venta necesitas tener un ciclo productivo activo registrado en tu parcela.
            </p>
            <button onClick={() => navigate('/productor/ciclo')}
              className="bg-[#1A5C38] text-white px-6 py-3 rounded-2xl font-semibold">
              Registrar mi ciclo →
            </button>
          </div>
        )}

        {paso === 'sel_up' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-4">¿De qué parcela es tu maíz?</p>
            {ups.filter(u => (u.ciclos_activos?.length || 0) > 0).map(up => (
              <button key={up.up_id} onClick={() => seleccionarUP(up)}
                className="w-full bg-white rounded-2xl border border-gray-200 p-4 text-left hover:border-[#1A5C38] hover:bg-green-50 transition-colors flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{up.up_name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{up.municipality_name}, {up.state_name}</p>
                  <p className="text-xs text-[#1A5C38] mt-1">
                    {up.ciclos_activos!.length} ciclo{up.ciclos_activos!.length > 1 ? 's' : ''} activo{up.ciclos_activos!.length > 1 ? 's' : ''} · {up.area_ha_calc} ha
                  </p>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
            ))}
          </div>
        )}

        {paso === 'sel_ciclo' && upSeleccionada && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-4">¿De qué ciclo es tu maíz?</p>
            {ciclos.map(ciclo => (
              <button key={ciclo.cycle_id}
                onClick={() => { setCicloSeleccionado(ciclo); setPaso('datos'); }}
                className="w-full bg-white rounded-2xl border border-gray-200 p-4 text-left hover:border-[#1A5C38] hover:bg-green-50 transition-colors flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{ciclo.cycle_type} {ciclo.cycle_year}</p>
                  <p className="text-sm text-[#1A5C38] mt-0.5 flex items-center gap-1"><Wheat size={14} /> {variedadLegible(ciclo)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ciclo.area_sown_ha} ha sembradas</p>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
            ))}
          </div>
        )}

        {paso === 'datos' && upSeleccionada && cicloSeleccionado && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <p className="text-xs text-green-600 font-medium mb-2">Tu propuesta de venta</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm"><span className="text-gray-600">Parcela:</span><span className="font-medium text-gray-800">{upSeleccionada.up_name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Ciclo:</span><span className="font-medium text-gray-800">{cicloSeleccionado.cycle_type} {cicloSeleccionado.cycle_year}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-600">Variedad:</span><span className="font-medium text-[#1A5C38] inline-flex items-center gap-1"><Wheat size={14} /> {variedadLegible(cicloSeleccionado)}</span></div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Cuántas toneladas ofreces? *</label>
              <input type="number" value={volumen} onChange={e => setVolumen(e.target.value)}
                placeholder="Ej: 50" min="0.1" step="0.1"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A5C38]" />
              <p className="text-xs text-gray-400 mt-1">Tu ciclo tiene {cicloSeleccionado.area_sown_ha} ha sembradas</p>
            </div>

            {/* Precio mínimo (#4) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Precio mínimo por tonelada
                <span className="text-gray-400 font-normal ml-1">(opcional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">$</span>
                <input type="number" value={precioMinimo} onChange={e => setPrecioMinimo(e.target.value)}
                  placeholder="Ej: 5000" min="0" step="50" inputMode="numeric"
                  className="w-full border border-gray-200 rounded-xl pl-8 pr-20 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#1A5C38]" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">MXN/ton</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Las bodegas verán este precio como punto de partida para negociar.</p>

              <label className="flex items-start gap-3 mt-4 pt-4 border-t border-gray-100 cursor-pointer">
                <input type="checkbox" checked={publicarNegociacion}
                  onChange={e => setPublicarNegociacion(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#1A5C38]" />
                <span className="text-sm text-gray-700">
                  <span className="font-medium">Publicar como negociación abierta a bodegas</span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Las bodegas cercanas podrán mandarte ofertas por este precio o mejor. Tú decides cuál aceptar desde "Mis propuestas". Recomendado.
                  </span>
                </span>
              </label>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <p className="text-sm font-medium text-gray-700">¿Cuándo estás disponible para vender? *</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Desde</label>
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C38]" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                  min={fechaDesde || new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C38]" />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-red-700 text-sm">{error}</p></div>
            )}

            <button onClick={enviar} disabled={enviando || !volumen || !fechaDesde || !fechaHasta}
              className="w-full bg-[#1A5C38] text-white py-4 rounded-2xl font-bold text-lg disabled:opacity-40 flex items-center justify-center gap-2">
              {enviando ? 'Publicando...' : (<><Check size={20} /> Publicar propuesta</>)}
            </button>
          </div>
        )}

        {error && paso !== 'datos' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4"><p className="text-red-700 text-sm">{error}</p></div>
        )}
      </div>
    </div>
  );
}
