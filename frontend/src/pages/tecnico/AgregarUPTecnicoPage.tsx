import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronLeft, Undo2, CheckCircle2, Footprints, Loader2, ChevronDown } from 'lucide-react';
import DibujarPoligonoUP from '../../components/productor/DibujarPoligonoUP';
import type { DibujarPoligonoHandle, DrawMode } from '../../components/productor/DibujarPoligonoUP';
import NominatimSearch from '../../components/productor/NominatimSearch';
import { api } from '../../services/api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export default function AgregarUPTecnicoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: producerIdParam } = useParams();
  const state = (location.state || {}) as Record<string, any>;

  // Modo "adicional": llegamos con :id en la ruta y sin datos nuevos de productor.
  const modoAdicional = Boolean(producerIdParam);

  const mapRef = useRef<any>(null);
  const dibujarRef = useRef<DibujarPoligonoHandle>(null);

  const [nombreUP, setNombreUP] = useState('');
  const [estadoUp, setEstadoUp] = useState('');
  const [municipioUp, setMunicipioUp] = useState('');
  const [estadoId, setEstadoId] = useState('');
  const [estados, setEstados] = useState<{ state_id: string; name: string }[]>([]);
  const [municipios, setMunicipios] = useState<{ municipality_id: string; name: string }[]>([]);

  const [paso, setPaso] = useState<'info' | 'mapa' | 'exito'>('info');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [drawMode, setDrawMode] = useState<DrawMode>('idle');
  const [pointCount, setPointCount] = useState(0);
  const [capturandoGPS, setCapturandoGPS] = useState(false);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [center, setCenter] = useState<[number, number]>([23.6, -102.5]);
  const [mapReady, setMapReady] = useState(false);

  const [pendingUP, setPendingUP] = useState<{
    poligono: [number, number][];
    coords: { lat: number; lng: number };
    area: number;
  } | null>(null);
  const [coincideArea, setCoincideArea] = useState<boolean | null>(null);
  const [areaReal, setAreaReal] = useState('');

  const [resultado, setResultado] = useState<{ producer_id: number; up_id?: number; nombreProductor: string } | null>(null);

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

  useEffect(() => {
    if (paso === 'mapa' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCenter([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [paso]);

  const onUPDibujada = (poly: [number, number][], centro: { lat: number; lng: number }, area: number) => {
    setPendingUP({ poligono: poly, coords: centro, area });
    setCoincideArea(null);
    setAreaReal('');
  };

  const confirmarUP = () => {
    if (pendingUP) guardar(pendingUP.poligono, pendingUP.coords, pendingUP.area);
  };

  const redibujarUP = () => {
    setPendingUP(null);
    setPointCount(0);
    setGpsMsg(null);
    setTimeout(() => dibujarRef.current?.startEdit?.(), 50);
  };

  const guardar = async (
    poligono: [number, number][] | null,
    coords: { lat: number; lng: number } | null,
    areaCalc: number | null
  ) => {
    if (!estadoUp || !municipioUp) { setError('Selecciona el estado y municipio de la parcela.'); return; }
    setEnviando(true);
    setError(null);
    try {
      const upPayload = {
        nombre_up: nombreUP || undefined,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        poligono: poligono ?? null,
        area_calc_ha: areaCalc,
        area_real_ha: (coincideArea === false && areaReal) ? Number(areaReal) : areaCalc,
        coincide_area: coincideArea ?? true,
        estado_up: estadoUp,
        municipio_up: municipioUp,
      };

      if (modoAdicional && producerIdParam) {
        const res: any = await api.tecnico.agregarUP(producerIdParam, upPayload);
        setResultado({
          producer_id: Number(producerIdParam),
          up_id: res?.up_id ?? res?.up?.up_id,
          nombreProductor: state?.nombreProductor || 'Productor',
        });
      } else {
        const payload = {
          curp: state.curp,
          nombres: state.nombres,
          apellido_paterno: state.apellido_paterno,
          apellido_materno: state.apellido_materno,
          telefono: state.telefono,
          state_nombre: state.state_nombre,
          municipio_nombre: state.municipio_nombre,
          sexo: state.sexo,
          fecha_nac: state.fecha_nac,
          fuente: state.fuente,
          producer_id: state.producer_id,
          up: upPayload,
        };
        const res: any = await api.tecnico.registroAlterno(payload);
        setResultado({
          producer_id: res?.producer_id,
          up_id: res?.up_id,
          nombreProductor: `${state.nombres || ''} ${state.apellido_paterno || ''}`.trim(),
        });
      }
      setPaso('exito');
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la parcela.');
    } finally {
      setEnviando(false);
    }
  };

  const puedeTerminar = pointCount >= 3;

  if (paso === 'exito' && resultado) {
    return (
      <div className="min-h-screen bg-[#eef8f2] flex flex-col items-center justify-center px-6 py-10">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-[#1A5C38]" />
        </div>
        <h1 className="text-[20px] font-black text-slate-900 text-center">Registro guardado</h1>
        <p className="text-[13.5px] text-slate-500 text-center mt-1.5 max-w-xs">
          {resultado.nombreProductor} y su parcela quedaron registrados correctamente.
        </p>

        <div className="w-full max-w-sm mt-8 space-y-2.5">
          {resultado.up_id && (
            <button
              onClick={() => navigate(`/tecnico/productor/${resultado.producer_id}/ciclo`, { state: { up_id: resultado.up_id } })}
              className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] active:scale-[0.98] transition-all">
              Registrar ciclo de esta UP
            </button>
          )}
          <button onClick={() => navigate('/tecnico/registrar')}
            className="w-full border border-slate-200 text-slate-700 py-3.5 rounded-2xl font-bold text-[14.5px] active:scale-[0.98] transition-all bg-white">
            Registrar otro productor
          </button>
          <button onClick={() => navigate('/tecnico')}
            className="w-full text-slate-400 py-2.5 font-semibold text-[13px]">
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef8f2]">
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-[1100]">
        <button onClick={() => paso === 'mapa' ? setPaso('info') : navigate(-1)} className="p-2 rounded-lg hover:bg-[#eef8f2]">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="font-semibold text-gray-900">{modoAdicional ? 'Agregar parcela' : 'Registrar parcela'}</h1>
          <p className="text-xs text-gray-500">Unidad productiva (UP)</p>
        </div>
      </div>

      {paso === 'info' && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la parcela (opcional)</label>
            <input type="text" value={nombreUP} onChange={e => setNombreUP(e.target.value)}
              placeholder="Ej: Parcela Norte, El Potrero, etc."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5C38]" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado *</label>
              <div className="relative">
                <select
                  value={estadoId}
                  onChange={e => {
                    const sel = estados.find(s => s.state_id === e.target.value);
                    setEstadoId(e.target.value);
                    setEstadoUp(sel?.name || '');
                    setMunicipios([]);
                    setMunicipioUp('');
                  }}
                  className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A5C38]"
                >
                  <option value="">Selecciona el estado</option>
                  {estados.map(s => <option key={s.state_id} value={s.state_id}>{s.name}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Municipio *</label>
              <div className="relative">
                <select
                  value={municipioUp}
                  onChange={e => setMunicipioUp(e.target.value)}
                  disabled={!estadoId}
                  className="w-full appearance-none border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A5C38] disabled:bg-[#f4fbf7] disabled:text-gray-400"
                >
                  <option value="">{estadoId ? 'Selecciona el municipio' : 'Primero elige el estado'}</option>
                  {municipios.map(m => <option key={m.municipality_id} value={m.name}>{m.name}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-red-700 text-sm">{error}</p></div>
          )}

          <button onClick={() => setPaso('mapa')} disabled={!estadoUp || !municipioUp}
            className="w-full bg-[#1A5C38] text-white py-4 rounded-2xl font-semibold disabled:opacity-40">
            Continuar → Dibujar en mapa
          </button>
        </div>
      )}

      {paso === 'mapa' && (
        <div className="relative" style={{ height: 'calc(100vh - 64px)' }}>
          <div className="relative" style={{ height: '100%' }}>
            <MapContainer ref={mapRef} center={center} zoom={mapReady ? 16 : 5} style={{ height: '100%', width: '100%' }}
              whenReady={() => setMapReady(true)}>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="© Esri" />
              <DibujarPoligonoUP
                ref={dibujarRef}
                onModeChange={setDrawMode}
                onPointCountChange={setPointCount}
                onPoligonoCompleto={onUPDibujada}
                onPoligonoEliminado={() => {}}
              />
              {pendingUP && (
                <Polygon
                  positions={pendingUP.poligono}
                  pathOptions={{ color: '#4ade80', fillColor: '#22c55e', fillOpacity: 0.3, weight: 2.5, dashArray: '6 4' }}
                />
              )}
            </MapContainer>

            {!pendingUP && (
              <div className="absolute top-3 left-3 right-3 z-[1000] max-w-md mx-auto">
                <NominatimSearch
                  placeholder="Buscar dirección o localidad…"
                  onSelect={(lat, lng) => mapRef.current?.flyTo([lat, lng], 16)}
                />
              </div>
            )}

            {pendingUP ? (
              <div className="absolute bottom-0 left-0 right-0 z-[1000] animate-auth-in">
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none rounded-t-3xl" />
                <div className="relative bg-[#0c2e1a]/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-6 shadow-2xl">
                  <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-xl bg-green-500/20 flex items-center justify-center ring-1 ring-green-400/30">
                      <CheckCircle2 size={16} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-[15px] leading-tight">¿Confirmar esta parcela?</p>
                      <p className="text-white/50 text-[11px]">Revisa el polígono en el mapa antes de guardar</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                      <p className="text-green-300 font-black text-[17px] leading-none">{pendingUP.area.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</p>
                      <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Hectáreas</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                      <p className="text-white font-black text-[17px] leading-none">{pendingUP.poligono.length}</p>
                      <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Vértices</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2.5 text-center ring-1 ring-white/8">
                      <p className="text-white font-black text-[13px] leading-tight truncate">{municipioUp.split(' ')[0]}</p>
                      <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wide mt-1">Municipio</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-white/70 text-[12px] font-medium mb-2">¿El área calculada coincide con la parcela?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setCoincideArea(true); setAreaReal(''); }}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ring-1 transition-all active:scale-[0.97] ${
                          coincideArea === true ? 'bg-green-500 text-white ring-green-400' : 'bg-white/5 text-white/70 ring-white/15'
                        }`}>
                        Sí, coincide
                      </button>
                      <button
                        onClick={() => setCoincideArea(false)}
                        className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold ring-1 transition-all active:scale-[0.97] ${
                          coincideArea === false ? 'bg-amber-500 text-white ring-amber-400' : 'bg-white/5 text-white/70 ring-white/15'
                        }`}>
                        No, difiere
                      </button>
                    </div>
                    {coincideArea === false && (
                      <div className="mt-2.5 animate-fade-in">
                        <label className="block text-white/50 text-[11px] mb-1">Superficie real de la parcela</label>
                        <div className="relative">
                          <input
                            type="number" value={areaReal} onChange={e => setAreaReal(e.target.value)}
                            placeholder={String(pendingUP.area)} min="0.1" step="0.1" inputMode="decimal"
                            className="w-full bg-white/10 ring-1 ring-white/20 rounded-xl px-4 py-3 pr-12 text-white text-[16px] font-bold focus:ring-2 focus:ring-green-400/50 focus:outline-none placeholder-white/30"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm font-semibold">ha</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="mb-3 bg-red-500/15 ring-1 ring-red-400/30 rounded-xl p-3 text-red-200 text-[12.5px]">{error}</div>
                  )}

                  <div className="flex gap-2.5">
                    <button onClick={redibujarUP}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all">
                      <Undo2 size={16} /> Redibujar
                    </button>
                    <button onClick={confirmarUP}
                      disabled={enviando || coincideArea === null || (coincideArea === false && !areaReal)}
                      className="flex-[1.6] flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-400 text-white py-3.5 rounded-xl text-sm font-bold active:scale-[0.98] transition-all shadow-lg shadow-green-900/50 disabled:opacity-40">
                      <CheckCircle2 size={17} /> {enviando ? 'Guardando...' : 'Confirmar Parcela'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute bottom-4 left-4 right-4 z-[1000] max-w-md mx-auto space-y-2.5 animate-auth-in">
                <p className="text-center text-xs text-white bg-black/60 backdrop-blur-md rounded-xl px-4 py-2 font-medium ring-1 ring-white/10">
                  {pointCount === 0
                    ? 'Toca el mapa en cada esquina de la parcela para marcarla.'
                    : 'Toca la siguiente esquina. Cuando termines, pulsa Finalizar.'}
                </p>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3"><p className="text-red-700 text-xs">{error}</p></div>
                )}

                <button
                  onClick={() => {
                    setCapturandoGPS(true); setGpsMsg(null);
                    dibujarRef.current?.addPointGPS((info) => {
                      setCapturandoGPS(false);
                      if (!info.ok) setGpsMsg(info.error);
                      else if (info.accuracy > 30) setGpsMsg(`Punto registrado, señal GPS débil (±${Math.round(info.accuracy)} m).`);
                      else setGpsMsg(`Punto registrado (±${Math.round(info.accuracy)} m).`);
                    });
                  }}
                  disabled={capturandoGPS}
                  className="w-full bg-[#1A5C38]/90 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-all">
                  {capturandoGPS
                    ? (<><Loader2 size={16} className="animate-spin" /> Obteniendo ubicación…</>)
                    : (<><Footprints size={16} /> Estoy en la esquina — usar GPS</>)}
                </button>
                {gpsMsg && <p className="text-center text-[11px] text-green-200 bg-[#1A5C38]/80 backdrop-blur-md rounded-xl px-3 py-1.5 ring-1 ring-green-400/30">{gpsMsg}</p>}

                {pointCount > 0 && (
                  <div className="flex gap-2">
                    <button onClick={() => dibujarRef.current?.undoVertex()}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 backdrop-blur-md ring-1 ring-white/20 text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all">
                      <Undo2 size={16} /> Deshacer
                    </button>
                    <button onClick={() => dibujarRef.current?.finishDraw()} disabled={!puedeTerminar || enviando}
                      className="flex-[1.4] flex items-center justify-center gap-1.5 bg-green-500 text-white py-3.5 rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all shadow-lg shadow-green-900/50">
                      <CheckCircle2 size={17} /> {puedeTerminar ? `Continuar (${pointCount})` : `Faltan ${Math.max(0, 3 - pointCount)}`}
                    </button>
                  </div>
                )}
                {drawMode === 'editing' && (
                  <button onClick={() => dibujarRef.current?.saveEdit()}
                    className="w-full bg-green-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-green-900/50 active:scale-[0.98] transition-all">
                    Guardar ajustes
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
