import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { formatNum } from '../utils/format';
import { Phone, MapPin, Zap, Package, BarChart2, Signal, PenLine, ChevronLeft } from 'lucide-react';

type Tab = 'general' | 'inventario' | 'precios' | 'senales';

export default function B06BodegaDetalle() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('general');
  const [bodega, setBodega] = useState<any>(null);
  const [inventarios, setInventarios] = useState<any[]>([]);
  const [contactos, setContactos] = useState<any[]>([]);
  const [precios, setPrecios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.infraestructura.get(Number(id))
      .then((r: any) => {
        setBodega(r.bodega || r);
        setInventarios(r.inventarios || []);
        setContactos(r.contactos || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab === 'precios') {
      api.infraestructura.precios(Number(id))
        .then((r: any) => setPrecios(r.precios || r))
        .catch(() => {});
    }
  }, [tab, id]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'inventario', label: 'Inventario' },
    { key: 'precios', label: 'Precios' },
    { key: 'senales', label: 'Requerimientos' },
  ];

  const ultimoInventario = inventarios[0] || null;

  const tabIcons: Record<Tab, React.ReactNode> = {
    general:    <MapPin size={14} />,
    inventario: <Package size={14} />,
    precios:    <BarChart2 size={14} />,
    senales:    <Signal size={14} />,
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-[#1A5C38]/30 border-t-[#1A5C38] rounded-full animate-spin" />
    </div>
  );
  if (!bodega) return (
    <div className="flex flex-col items-center justify-center py-24 gap-2">
      <p className="text-[16px] font-semibold text-gray-600">Bodega no encontrada</p>
    </div>
  );

  return (
    <div className="w-full">
      {/* ── BANNER VERDE con tabs integradas ── */}
      <div className="sticky top-0 z-20 w-full bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f] rounded-b-3xl shadow-[0_8px_30px_rgba(26,92,56,0.25)] overflow-hidden" style={{ transform: 'none', animation: 'none' }}>
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none opacity-60" />
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 pt-3 pb-4 relative z-10">

          {/* Volver */}
          <button
            onClick={() => navigate('/maiz/bodega/mis-bodegas')}
            className="flex items-center gap-0.5 text-green-200/80 text-[13px] font-medium mb-2 active:opacity-60 hover:text-green-100 transition-opacity"
          >
            <ChevronLeft size={16} strokeWidth={2.5} className="-ml-1" />
            Volver
          </button>

          {/* Título */}
          <div className="mb-3">
            <h1 className="text-[19px] sm:text-[22px] font-bold text-white leading-tight drop-shadow-sm truncate">{bodega.nombre}</h1>
            <p className="text-green-100/70 text-[12px] mt-0.5 font-medium truncate">{bodega.municipio}, {bodega.estado}</p>
          </div>

          {/* Tabs como pills — scroll horizontal en móvil, todas visibles en desktop */}
          <div className="flex items-center gap-1.5 w-full overflow-x-auto scrollbar-none">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-bold transition-colors duration-150 ' +
                  (tab === t.key
                    ? 'bg-white text-[#1A5C38] shadow-sm'
                    : 'bg-white/15 text-white/80 hover:bg-white/25 hover:text-white border border-white/10')}
              >
                {tabIcons[t.key]}
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── General ── */}
        {tab === 'general' && (
          <div className="space-y-4">
          <button
            onClick={() => navigate(`/maiz/bodega/mis-bodegas/${id}/editar`)}
            className="flex items-center gap-2 px-5 py-3 bg-[#1A5C38] text-white rounded-2xl text-[15px] font-semibold active:opacity-80 transition-opacity"
          >
            <PenLine size={16} /> Editar datos de contacto
          </button>
          {(bodega.horario || bodega.telefono_contacto || bodega.observaciones) && (
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_4px_rgba(0,0,0,0.06)] divide-y divide-gray-100">
              <p className="px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Datos de contacto</p>
              {[
                ['Horario', bodega.horario || '—'],
                ['Teléfono', bodega.telefono_contacto || '—'],
                ['Observaciones', bodega.observaciones || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-start gap-3 px-4 py-3.5">
                  <span className="text-[14px] text-gray-500 flex-shrink-0">{k}</span>
                  <span className="text-[14px] font-semibold text-gray-800 text-right">{v}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-white rounded-2xl border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] divide-y divide-gray-100 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-500 group">
              <p className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest transition-colors group-hover:text-emerald-600/80">Información</p>
              {[
                ['Capacidad', (bodega.capacidad_ton != null && bodega.capacidad_ton > 0) ? `${formatNum(bodega.capacidad_ton)} ton` : 'Sin datos registrados'],

                ['Localidad', bodega.localidad || '—'],
                ['Estatus operativo', bodega.estatus_operativo || '—'],
                ['Coordenadas', `${bodega.latitud?.toFixed(4) || '—'}, ${bodega.longitud?.toFixed(4) || '—'}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center px-4 py-3.5 hover:bg-[#f4fbf7]/50 transition-colors">
                  <span className="text-[14px] text-gray-500 font-medium">{k}</span>
                  <span className="text-[14px] font-semibold text-gray-800 text-right max-w-[55%] truncate">{v}</span>
                </div>
              ))}
            </div>
            {contactos.length > 0 && (
              <div className="bg-white rounded-2xl border border-black/[0.04] shadow-[0_2px_8px_rgba(0,0,0,0.02)] divide-y divide-gray-100 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-500 group">
                <p className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest transition-colors group-hover:text-emerald-600/80">Contactos</p>
                {contactos.map((c: any) => (
                  <div key={c.id} className="px-4 py-3.5 flex items-start gap-3 hover:bg-[#f4fbf7]/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[#1A5C38]/[0.08] flex items-center justify-center flex-shrink-0 mt-0.5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6">
                      <Phone size={14} className="text-[#1A5C38]" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-gray-800">{c.nombre}</p>
                      {c.cargo && <p className="text-[12px] text-gray-400 font-medium">{c.cargo}</p>}
                      {c.telefono && <p className="text-[12px] text-[#1A5C38] font-bold mt-0.5">{c.telefono}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        )}

        {/* ── Inventario ── */}
        {tab === 'inventario' && (
          <div className="space-y-4">
            <button
              onClick={() => navigate(`/maiz/bodega/inventario?bodega_id=${id}`)}
              className="flex items-center gap-2 px-5 py-3 bg-[#1A5C38] text-white rounded-2xl text-[15px] font-semibold active:opacity-80 transition-opacity"
            >
              <Zap size={16} /> Actualizar inventario
            </button>
            {ultimoInventario ? (
              <div className="space-y-3">
                {/* Último inventario destacado */}
                <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_4px_rgba(0,0,0,0.06)] divide-y divide-gray-100">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Último registro</p>
                    <span className="text-[12px] text-gray-400">{ultimoInventario.fecha || '—'}</span>
                  </div>
                  {[
                    ['Tipo de maíz', ultimoInventario.tipo_maiz || '—'],
                    ['Vol. almacenado', `${formatNum(ultimoInventario.volumen_almacenamiento || 0)} ton`],
                    ['Calidad', ultimoInventario.calidad || '—'],
                    ['Ciclo', ultimoInventario.ciclo || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center px-4 py-3.5">
                      <span className="text-[14px] text-gray-500">{k}</span>
                      <span className="text-[14px] font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                  {ultimoInventario.observaciones && (
                    <div className="px-4 py-3.5">
                      <p className="text-[11px] text-gray-400 uppercase tracking-widest mb-1">Observaciones</p>
                      <p className="text-[14px] text-gray-700">{ultimoInventario.observaciones}</p>
                    </div>
                  )}
                </div>

                {/* Historial de inventarios (C-03) */}
                {inventarios.length > 1 && (
                  <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_4px_rgba(0,0,0,0.06)] divide-y divide-gray-50">
                    <p className="px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Historial de inventarios</p>
                    {inventarios.slice(1).map((inv: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-[13px] font-semibold text-gray-800">
                            {formatNum(inv.volumen_almacenamiento || 0)} ton · {inv.tipo_maiz || '—'}
                          </p>
                          <p className="text-[11px] text-gray-400">{inv.calidad || 'Sin calidad'} · {inv.ciclo || ''}</p>
                        </div>
                        <span className="text-[12px] text-gray-400 flex-shrink-0 ml-2">{inv.fecha || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
                <Package size={32} className="text-gray-200" />
                <p className="text-[14px]">Sin registros de inventario</p>
              </div>
            )}
          </div>
        )}

        {/* ── Precios ── */}
        {tab === 'precios' && (
          <div className="space-y-4">
            <button
              onClick={() => navigate(`/maiz/bodega/precio-diario?bodega_id=${id}`)}
              className="flex items-center gap-2 px-5 py-3 bg-[#1A5C38] text-white rounded-2xl text-[15px] font-semibold active:opacity-80 transition-opacity"
            >
              <Zap size={16} /> Publicar precio de hoy
            </button>
            {precios.length > 0 ? (
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Últimos 30 días</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={precios.slice(0, 30).reverse()}>
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} width={55} />
                    <Tooltip formatter={(v: any) => [`$${v}`, 'Precio']} />
                    <Line type="monotone" dataKey="precio" stroke="#1A5C38" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 divide-y divide-gray-100">
                  {precios.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex justify-between items-center py-2.5">
                      <span className="text-[13px] text-gray-400">{p.fecha} · {p.tipo_maiz}</span>
                      <span className="text-[14px] font-bold text-[#1A5C38]">${formatNum(p.precio)}/ton</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 gap-2 text-gray-400">
                <BarChart2 size={32} className="text-gray-200" />
                <p className="text-[14px]">Sin historial de precios</p>
              </div>
            )}
          </div>
        )}

        {/* ── Señales ── */}
        {tab === 'senales' && (
          <div className="space-y-4">
            <button
              onClick={() => navigate(`/maiz/bodega/senales/nueva?bodega_id=${id}`)}
              className="flex items-center gap-2 px-5 py-3 bg-[#1A5C38] text-white rounded-2xl text-[15px] font-semibold active:opacity-80 transition-opacity"
            >
              <Signal size={16} /> Nueva señal de compra
            </button>
            <div className="bg-white rounded-2xl border border-black/[0.06] p-6 text-center">
              <Signal size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-[14px] text-gray-400">
                No hay requerimientos activos para esta bodega.
              </p>
              <button
                onClick={() => navigate('/maiz/bodega/requerimientos')}
                className="text-[14px] text-[#1A5C38] font-semibold underline mt-2 active:opacity-70"
              >
                Publicar un requerimiento
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
