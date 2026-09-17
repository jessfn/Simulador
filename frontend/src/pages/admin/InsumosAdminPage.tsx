import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Sprout, Download, Users, CheckCircle2, XCircle, Clock, HelpCircle } from 'lucide-react';
import { apiFetch, BASE } from '../../services/api';
import { usePermisosStore } from '../../store/permisos';

interface Edicion { id: number; nombre: string; version_catalogo: string; horizonte_meses: number; habilitada: boolean; }
interface Municipio { municipality_id: string; municipality_name: string; }
interface CantidadProducto { producto_id: string; nombre_visible: string; producto_nombre_otro: string | null; unidad_base: string; mes_compra: string; cantidad_total: string; productores: string; }
interface Resumen {
  edicion_id: number; productores_con_respuesta: number; productores_si: number; productores_no: number;
  productores_pendientes: number; lineas_por_identificar: number; cantidad_por_producto: CantidadProducto[];
}
interface Linea {
  linea_id: number; respuesta_id: number; producer_id: number;
  nombres: string; apellido_paterno: string; apellido_materno: string;
  categoria_id: string; producto: string; producto_nombre_otro: string | null;
  cantidad: string; cantidad_base: string; unidad_base: string; mes_compra: string;
  identificacion_pendiente: boolean; municipios_asociados: string | null; updated_at: string;
}
interface Categoria { id: string; nombre: string; }
interface Producto { id: string; categoria_id: string; nombre_visible: string; }

function descargarBlob(contenido: string, nombreArchivo: string) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombreArchivo });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMes(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

export default function InsumosAdminPage() {
  const { puedo, permisosTotal } = usePermisosStore();
  const puedeExportar = permisosTotal || puedo('insumos', 'exportar');

  const [ediciones, setEdiciones] = useState<Edicion[]>([]);
  const [edicionId, setEdicionId] = useState<number | null>(null);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  const [filtroMunicipio, setFiltroMunicipio] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroProducto, setFiltroProducto] = useState('');
  const [filtroRespuesta, setFiltroRespuesta] = useState<'' | 'si' | 'no'>('');

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState<'lineas' | 'no' | null>(null);

  useEffect(() => {
    apiFetch('/admin/insumos/ediciones').then(r => r.json()).then(d => {
      setEdiciones(d.ediciones || []);
      const vigente = (d.ediciones || []).find((e: Edicion) => e.habilitada);
      if (vigente) setEdicionId(vigente.id);
    }).catch(() => {});
    apiFetch('/admin/insumos/municipios').then(r => r.json()).then(d => setMunicipios(d.municipios || [])).catch(() => {});
    fetch(`${BASE}/productor/auth/catalogo-insumos`).then(r => r.json()).then(d => {
      setCategorias(d.categorias || []);
      setProductos(d.productos || []);
    }).catch(() => {});
  }, []);

  const params = useCallback(() => {
    const p = new URLSearchParams();
    if (edicionId) p.set('edicion_id', String(edicionId));
    if (filtroMunicipio) p.set('municipio', filtroMunicipio);
    if (filtroCategoria) p.set('categoria', filtroCategoria);
    if (filtroProducto) p.set('producto', filtroProducto);
    if (filtroRespuesta) p.set('respuesta', filtroRespuesta);
    return p;
  }, [edicionId, filtroMunicipio, filtroCategoria, filtroProducto, filtroRespuesta]);

  const cargar = useCallback(() => {
    if (!edicionId) return;
    setLoading(true);
    const qs = params().toString();
    Promise.all([
      apiFetch(`/admin/insumos/resumen?${qs}`).then(r => r.json()),
      apiFetch(`/admin/insumos/lineas?${qs}`).then(r => r.json()),
    ]).then(([r, l]) => {
      setResumen(r);
      setLineas(l.lineas || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [edicionId, params]);

  useEffect(() => { cargar(); }, [cargar]);

  async function exportar(tipo: 'lineas' | 'no') {
    setExportando(tipo);
    try {
      const qs = params().toString();
      const res = await apiFetch(`/admin/insumos/export?tipo=${tipo}&${qs}`);
      const texto = await res.text();
      descargarBlob(texto, tipo === 'no' ? 'encuesta_insumos_respuestas_no.csv' : 'encuesta_insumos_lineas.csv');
    } finally {
      setExportando(null);
    }
  }

  const productosDeCategoria = filtroCategoria ? productos.filter(p => p.categoria_id === filtroCategoria) : productos;

  return (
    <div className="flex flex-col h-[calc(100vh-76px)] overflow-hidden gap-2">
      {/* Barra superior */}
      <div className="bg-[#fdf5e8] flex-shrink-0 rounded-b-2xl border border-amber-900/10 border-t-0 overflow-hidden">
        <div className="px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[12px]">
            <Sprout size={13} /> Encuesta de Insumos — Intención de compra
          </div>
          <button onClick={cargar} className="p-1.5 rounded-lg text-amber-700 bg-amber-100 hover:bg-amber-700 hover:text-white border border-amber-700/20 hover:border-transparent transition">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="border-t border-amber-900/10 mx-2" />
        <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap">
          <select value={edicionId ?? ''} onChange={e => setEdicionId(Number(e.target.value))}
            className="text-[10.5px] font-semibold bg-white border border-amber-200 rounded-lg px-2 py-1">
            {ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre} (v{e.version_catalogo})</option>)}
          </select>
          <select value={filtroCategoria} onChange={e => { setFiltroCategoria(e.target.value); setFiltroProducto(''); }}
            className="text-[10.5px] font-semibold bg-white border border-amber-200 rounded-lg px-2 py-1">
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)}
            className="text-[10.5px] font-semibold bg-white border border-amber-200 rounded-lg px-2 py-1">
            <option value="">Todos los productos</option>
            {productosDeCategoria.map(p => <option key={p.id} value={p.id}>{p.nombre_visible}</option>)}
          </select>
          <select value={filtroMunicipio} onChange={e => setFiltroMunicipio(e.target.value)}
            className="text-[10.5px] font-semibold bg-white border border-amber-200 rounded-lg px-2 py-1">
            <option value="">Todos los municipios</option>
            {municipios.map(m => <option key={m.municipality_id} value={m.municipality_id}>{m.municipality_name}</option>)}
          </select>
          <select value={filtroRespuesta} onChange={e => setFiltroRespuesta(e.target.value as any)}
            className="text-[10.5px] font-semibold bg-white border border-amber-200 rounded-lg px-2 py-1">
            <option value="">Sí y No</option>
            <option value="si">Solo Sí</option>
            <option value="no">Solo No</option>
          </select>
          {filtroMunicipio && (
            <span className="text-[9.5px] text-amber-700/70 italic">Municipios asociados; volumen no distribuido por parcela.</span>
          )}
        </div>
      </div>

      {/* Indicadores */}
      {resumen && (
        <div className="grid grid-cols-5 gap-2 flex-shrink-0">
          {[
            { label: 'Con respuesta', val: resumen.productores_con_respuesta, icon: Users, color: 'text-indigo-700 bg-indigo-50' },
            { label: 'Sí', val: resumen.productores_si, icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-50' },
            { label: 'No', val: resumen.productores_no, icon: XCircle, color: 'text-gray-600 bg-gray-100' },
            { label: 'Pendientes', val: resumen.productores_pendientes, icon: Clock, color: 'text-amber-700 bg-amber-50' },
            { label: 'Líneas por identificar', val: resumen.lineas_por_identificar, icon: HelpCircle, color: 'text-red-700 bg-red-50' },
          ].map(({ label, val, icon: Icon, color }) => (
            <div key={label} className={`rounded-2xl border border-gray-100 p-3 flex items-center gap-2.5 ${color}`}>
              <Icon size={18} />
              <div>
                <p className="text-[17px] font-black leading-none">{val}</p>
                <p className="text-[9px] font-bold uppercase tracking-wide opacity-70 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabla de líneas */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
          <span className="text-[10.5px] text-gray-400 font-medium">{lineas.length} línea{lineas.length !== 1 ? 's' : ''} (máx. 500 por consulta)</span>
          {puedeExportar && (
            <div className="flex gap-1.5">
              <button onClick={() => exportar('lineas')} disabled={exportando !== null}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-700 hover:text-white text-[10px] font-bold border border-amber-700/20 hover:border-transparent transition disabled:opacity-50">
                <Download size={11} /> {exportando === 'lineas' ? 'Exportando…' : 'Exportar líneas (Sí)'}
              </button>
              <button onClick={() => exportar('no')} disabled={exportando !== null}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-700 hover:text-white text-[10px] font-bold border border-gray-700/10 hover:border-transparent transition disabled:opacity-50">
                <Download size={11} /> {exportando === 'no' ? 'Exportando…' : 'Exportar respuestas No'}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <RefreshCw size={20} className="text-amber-600 animate-spin" />
            <p className="text-[12px] text-gray-400">Cargando…</p>
          </div>
        ) : lineas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <Sprout size={28} className="text-gray-300" />
            <p className="text-[13px] font-bold text-gray-500">Sin líneas que coincidan con los filtros</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse" style={{ fontSize: '11.5px' }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50/90 border-b border-gray-100">
                  {['Productor', 'Producto', 'Cantidad', 'Mes', 'Municipios', 'Identificación', 'Actualizado'].map(h => (
                    <th key={h} className="py-2 px-3 text-[9.5px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap first:pl-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lineas.map(l => (
                  <tr key={l.linea_id} className="hover:bg-[#fdf9f0] transition-colors">
                    <td className="py-2 pl-4 pr-3 whitespace-nowrap">
                      <p className="font-bold text-gray-800">{l.nombres} {l.apellido_paterno} {l.apellido_materno || ''}</p>
                      <p className="text-[10px] text-gray-400">#{l.producer_id}</p>
                    </td>
                    <td className="py-2 px-3">
                      <p className="font-semibold text-gray-700">{l.producto}</p>
                      {l.producto_nombre_otro && <p className="text-[10px] text-gray-400">{l.producto_nombre_otro}</p>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap font-semibold text-gray-700">{Number(l.cantidad_base).toLocaleString('es-MX', { maximumFractionDigits: 2 })} {l.unidad_base}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-gray-500 capitalize">{fmtMes(l.mes_compra)}</td>
                    <td className="py-2 px-3 max-w-[220px] truncate text-gray-500" title={l.municipios_asociados || ''}>{l.municipios_asociados || '—'}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {l.identificacion_pendiente
                        ? <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full border text-amber-700 bg-amber-50 border-amber-200">Pendiente</span>
                        : <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full border text-emerald-700 bg-emerald-50 border-emerald-200">Identificado</span>}
                    </td>
                    <td className="py-2 px-3 pr-4 whitespace-nowrap text-gray-500">{fmtFecha(l.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
