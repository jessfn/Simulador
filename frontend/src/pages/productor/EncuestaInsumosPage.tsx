import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

interface CatalogoInsumos {
  edicion_id: number; version_catalogo: string; periodo_inicio: string; periodo_fin: string;
  categorias: { id: string; nombre: string; ayuda: string | null }[];
  productos: { id: string; categoria_id: string; nombre_visible: string; requiere_nombre_conocido: boolean; es_otro: boolean }[];
  presentaciones: { id: string; producto_id: string; envase: string; contenido: number; unidad: string }[];
}
interface LineaUI {
  producto_id: string; producto_nombre: string;
  presentacion_id: string | null; presentacion_label: string;
  presentacion_otro_envase: string | null; presentacion_otro_contenido: number | null; presentacion_otro_unidad: string | null;
  a_granel: boolean; cantidad: number; mes_compra: string;
  nombre_conocido: string | null; preferencia_marca: string | null; identificacion_no_disponible: boolean;
}

export default function EncuestaInsumosPage() {
  const navigate = useNavigate();

  const [catalogo, setCatalogo] = useState<CatalogoInsumos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noAplica, setNoAplica] = useState(false);

  const [respuesta, setRespuesta] = useState<'si' | 'no' | null>(null);
  const [lineas, setLineas] = useState<LineaUI[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [enEdicion, setEnEdicion] = useState<number | null>(null);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);

  const draftVacio = {
    categoriaId: '', productoId: '', presentacionId: '',
    modo: 'catalogo' as 'catalogo' | 'otra' | 'granel',
    otroEnvase: '', otroContenido: '', otroUnidad: '', granelUnidad: '',
    cantidad: '', mes: '', nombreConocido: '', sinIdentificar: false, marca: '',
  };
  const [draft, setDraft] = useState(draftVacio);

  useEffect(() => {
    (async () => {
      try {
        const [cat, encuesta]: any = await Promise.all([
          fetch(`${BASE}/productor/auth/catalogo-insumos`).then(r => r.json()),
          api.productor.obtenerEncuesta(),
        ]);
        setCatalogo(cat);
        if (!encuesta.elegible) { setNoAplica(true); }
        else if (encuesta.respuesta) {
          setRespuesta(encuesta.respuesta.respuesta);
          if (encuesta.lineas?.length) {
            setLineas(encuesta.lineas.map((l: any) => ({
              producto_id: l.producto_id,
              producto_nombre: l.producto_nombre + (l.nombre_conocido && l.producto_id?.endsWith('-999') ? `: ${l.nombre_conocido}` : ''),
              presentacion_id: l.presentacion_id,
              presentacion_label: l.presentacion_id ? `${l.envase} de ${l.contenido} ${l.presentacion_unidad}` : (l.a_granel ? `A granel (${l.presentacion_otro_unidad})` : `${l.presentacion_otro_envase} de ${l.presentacion_otro_contenido} ${l.presentacion_otro_unidad}`),
              presentacion_otro_envase: l.presentacion_otro_envase, presentacion_otro_contenido: l.presentacion_otro_contenido, presentacion_otro_unidad: l.presentacion_otro_unidad,
              a_granel: l.a_granel, cantidad: Number(l.cantidad), mes_compra: String(l.mes_compra).slice(0, 7),
              nombre_conocido: l.nombre_conocido, preferencia_marca: l.preferencia_marca, identificacion_no_disponible: l.identificacion_pendiente && !l.nombre_conocido,
            })));
          }
        }
      } catch {
        setError('No se pudo cargar la encuesta.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const productosDeCategoria = catalogo ? catalogo.productos.filter(p => p.categoria_id === draft.categoriaId) : [];
  const presentacionesDelProducto = catalogo ? catalogo.presentaciones.filter(p => p.producto_id === draft.productoId) : [];
  const productoSel = catalogo?.productos.find(p => p.id === draft.productoId) || null;

  const mesesDisponibles = (() => {
    if (!catalogo) return [];
    const inicio = new Date(catalogo.periodo_inicio); const fin = new Date(catalogo.periodo_fin);
    const nombresMes = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const out: { valor: string; label: string }[] = [];
    const cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const finMes = new Date(fin.getFullYear(), fin.getMonth(), 1);
    while (cur <= finMes) {
      out.push({ valor: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`, label: `${nombresMes[cur.getMonth()]} ${cur.getFullYear()}` });
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  })();

  function resetForm() { setDraft(draftVacio); setEnEdicion(null); setMostrarForm(false); setErrorForm(null); }

  function guardarLinea() {
    setErrorForm(null);
    if (!draft.categoriaId || !draft.productoId) { setErrorForm('Selecciona la categoría y el producto.'); return; }
    const cantidad = Number(draft.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) { setErrorForm('Indica una cantidad válida.'); return; }
    if (!draft.mes) { setErrorForm('Indica el mes en que lo necesita.'); return; }
    if (productoSel?.es_otro && !draft.nombreConocido.trim()) { setErrorForm('Escribe el nombre que conoces del producto.'); return; }
    if (productoSel?.requiere_nombre_conocido && !productoSel.es_otro && !draft.nombreConocido.trim() && !draft.sinIdentificar) {
      setErrorForm('Indica la variedad/fórmula, o marca que no la identificas.'); return;
    }

    let presentacion_id: string | null = null, otroEnvase: string | null = null, otroContenido: number | null = null, otroUnidad: string | null = null, aGranel = false, label = '';
    if (draft.modo === 'granel') {
      if (!draft.granelUnidad) { setErrorForm('Indica la unidad de la compra a granel.'); return; }
      aGranel = true; otroUnidad = draft.granelUnidad; label = `A granel (${draft.granelUnidad})`;
    } else if (draft.modo === 'catalogo') {
      const pres = presentacionesDelProducto.find(p => p.id === draft.presentacionId);
      if (!pres) { setErrorForm('Selecciona una presentación.'); return; }
      if (!Number.isInteger(cantidad)) { setErrorForm('La cantidad de envases debe ser entera.'); return; }
      presentacion_id = pres.id; label = `${pres.envase} de ${pres.contenido} ${pres.unidad}`;
    } else {
      if (!draft.otroEnvase.trim() || !draft.otroContenido || !draft.otroUnidad) { setErrorForm('Especifica envase, contenido y unidad.'); return; }
      if (!Number.isInteger(cantidad)) { setErrorForm('La cantidad de envases debe ser entera.'); return; }
      otroEnvase = draft.otroEnvase.trim(); otroContenido = Number(draft.otroContenido); otroUnidad = draft.otroUnidad;
      label = `${otroEnvase} de ${otroContenido} ${otroUnidad}`;
    }

    const nueva: LineaUI = {
      producto_id: draft.productoId,
      producto_nombre: productoSel?.es_otro ? `${productoSel.nombre_visible}: ${draft.nombreConocido.trim()}` : (productoSel?.nombre_visible || ''),
      presentacion_id, presentacion_label: label,
      presentacion_otro_envase: otroEnvase, presentacion_otro_contenido: otroContenido, presentacion_otro_unidad: otroUnidad,
      a_granel: aGranel, cantidad, mes_compra: draft.mes,
      nombre_conocido: draft.nombreConocido.trim() || null, preferencia_marca: draft.marca.trim() || null,
      identificacion_no_disponible: draft.sinIdentificar,
    };
    setLineas(prev => { if (enEdicion !== null) { const c = [...prev]; c[enEdicion] = nueva; return c; } return [...prev, nueva]; });
    resetForm();
  }

  function editarLinea(i: number) {
    const l = lineas[i];
    const p = catalogo?.productos.find(x => x.id === l.producto_id);
    setDraft({
      categoriaId: p?.categoria_id || '', productoId: l.producto_id, presentacionId: l.presentacion_id || '',
      modo: l.a_granel ? 'granel' : (l.presentacion_id ? 'catalogo' : 'otra'),
      otroEnvase: l.presentacion_otro_envase || '', otroContenido: l.presentacion_otro_contenido != null ? String(l.presentacion_otro_contenido) : '',
      otroUnidad: l.a_granel ? '' : (l.presentacion_otro_unidad || ''), granelUnidad: l.a_granel ? (l.presentacion_otro_unidad || '') : '',
      cantidad: String(l.cantidad), mes: l.mes_compra, nombreConocido: l.nombre_conocido || '',
      sinIdentificar: l.identificacion_no_disponible, marca: l.preferencia_marca || '',
    });
    setEnEdicion(i); setMostrarForm(true);
  }

  async function enviar() {
    if (!respuesta) { setError('Responde si tiene o no compras previstas.'); return; }
    if (respuesta === 'si' && lineas.length === 0) { setError('Agrega al menos un producto.'); return; }
    setError(null); setGuardando(true);
    try {
      await api.productor.guardarEncuesta({
        respuesta,
        lineas: respuesta === 'si' ? lineas.map(l => ({
          producto_id: l.producto_id, presentacion_id: l.presentacion_id,
          presentacion_otro_envase: l.presentacion_otro_envase, presentacion_otro_contenido: l.presentacion_otro_contenido,
          presentacion_otro_unidad: l.presentacion_otro_unidad, a_granel: l.a_granel, cantidad: l.cantidad,
          mes_compra: l.mes_compra, nombre_conocido: l.nombre_conocido, preferencia_marca: l.preferencia_marca,
          identificacion_no_disponible: l.identificacion_no_disponible,
        })) : [],
      });
      setExito(true);
    } catch (e: any) {
      setError(e.message || 'No se pudo guardar la encuesta.');
    } finally {
      setGuardando(false);
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A5C38]/20 focus:border-[#1A5C38] transition-all';
  const labelCls = 'block text-[12px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';

  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm gap-2"><Loader2 size={18} className="animate-spin" /> Cargando…</div>;
  }

  if (noAplica) {
    return (
      <div className="min-h-screen bg-[#eef8f2] flex flex-col items-center justify-center px-6 py-10 text-center">
        <AlertTriangle size={28} className="text-slate-300 mb-2" />
        <p className="text-[14px] font-semibold text-slate-600 max-w-xs">Esta encuesta solo aplica a productores con al menos una parcela en el estado de Sinaloa.</p>
        <button onClick={() => navigate(-1)} className="mt-6 text-[#1A5C38] font-bold text-[13.5px]">Volver</button>
      </div>
    );
  }

  if (exito) {
    return (
      <div className="min-h-screen bg-[#eef8f2] flex flex-col items-center justify-center px-6 py-10">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-[#1A5C38]" />
        </div>
        <h1 className="text-[20px] font-black text-slate-900 text-center">Encuesta guardada</h1>
        <p className="text-[13.5px] text-slate-500 text-center mt-1.5 max-w-xs">Gracias por responder, tu información quedó registrada.</p>
        <button onClick={() => navigate('/productor/perfil')}
          className="mt-8 w-full max-w-sm bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] active:scale-[0.98] transition-all">
          Volver a mi perfil
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-8 bg-[#f8faf9]">
      <div className="sticky top-0 z-20 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/60 px-4 sm:px-6 pt-3.5 pb-4 shadow-sm">
        <div className="max-w-[700px] mx-auto">
          <button onClick={() => navigate(-1)} className="flex items-center gap-0.5 text-[#1A5C38] text-[14px] font-bold mb-2 hover:opacity-70 transition-opacity">
            <ChevronLeft size={18} strokeWidth={2.5} className="-ml-1" /> Volver
          </button>
          <h1 className="text-[19px] sm:text-[20px] font-bold text-slate-900 leading-tight">¿Qué insumos necesita comprar?</h1>
          <p className="text-[12px] text-slate-500 font-medium mt-0.5">Para sus parcelas de Sinaloa</p>
        </div>
      </div>

      <div className="p-4 max-w-[700px] mx-auto space-y-4">
        <p className="text-slate-500 text-[13px] leading-relaxed">
          Cuéntenos qué necesita comprar para sus parcelas de Sinaloa durante los próximos {catalogo ? Math.round((new Date(catalogo.periodo_fin).getTime() - new Date(catalogo.periodo_inicio).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 6} meses.
          La Secretaría usará esta información para buscar mejores condiciones de compra. No es un pedido ni garantiza un descuento.
        </p>

        <div>
          <p className={labelCls}>¿Tiene previsto comprar insumos?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button onClick={() => { setRespuesta('si'); setError(null); }}
              className={`py-3 rounded-xl font-bold text-[13.5px] ${respuesta === 'si' ? 'bg-[#1A5C38] text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>Sí</button>
            <button onClick={() => { setRespuesta('no'); setLineas([]); resetForm(); }}
              className={`py-3 rounded-xl font-bold text-[13.5px] ${respuesta === 'no' ? 'bg-[#1A5C38] text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>No tengo compras previstas</button>
          </div>
        </div>

        {respuesta === 'si' && !mostrarForm && (
          <>
            {lineas.length > 0 && (
              <div className="space-y-2">
                {lineas.map((l, i) => (
                  <div key={i} className="bg-white rounded-xl p-3 border border-slate-100">
                    <p className="text-[13.5px] font-bold text-slate-800">{l.producto_nombre}</p>
                    <p className="text-[11.5px] text-slate-400 mt-0.5">{l.cantidad} · {l.presentacion_label} · {mesesDisponibles.find(m => m.valor === l.mes_compra)?.label || l.mes_compra}</p>
                    <div className="flex gap-3 mt-1.5">
                      <button onClick={() => editarLinea(i)} className="text-[11px] font-bold text-[#1A5C38]">Cambiar</button>
                      <button onClick={() => setLineas(prev => prev.filter((_, idx) => idx !== i))} className="text-[11px] font-bold text-red-500">Quitar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setMostrarForm(true)}
              className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-[13.5px] flex items-center justify-center gap-1.5">
              <Plus size={16} /> Agregar {lineas.length > 0 ? 'otro' : 'un'} producto
            </button>
          </>
        )}

        {respuesta === 'si' && mostrarForm && catalogo && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3.5">
            <div>
              <label className={labelCls}>Categoría</label>
              <select value={draft.categoriaId} onChange={e => setDraft(d => ({ ...d, categoriaId: e.target.value, productoId: '', presentacionId: '' }))} className={inputCls}>
                <option value="">Selecciona una categoría</option>
                {catalogo.categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            {draft.categoriaId && (
              <div>
                <label className={labelCls}>Producto o fórmula</label>
                <select value={draft.productoId} onChange={e => setDraft(d => ({ ...d, productoId: e.target.value, presentacionId: '', modo: 'catalogo' }))} className={inputCls}>
                  <option value="">Selecciona un producto</option>
                  {productosDeCategoria.map(p => <option key={p.id} value={p.id}>{p.nombre_visible}</option>)}
                </select>
              </div>
            )}
            {productoSel?.es_otro && (
              <div>
                <label className={labelCls}>Nombre que conoce del producto</label>
                <input type="text" value={draft.nombreConocido} onChange={e => setDraft(d => ({ ...d, nombreConocido: e.target.value }))} className={inputCls} />
              </div>
            )}
            {productoSel?.requiere_nombre_conocido && !productoSel.es_otro && (
              <div>
                <label className={labelCls}>Variedad/fórmula que conoce</label>
                <input type="text" value={draft.nombreConocido} disabled={draft.sinIdentificar}
                  onChange={e => setDraft(d => ({ ...d, nombreConocido: e.target.value }))} className={`${inputCls} disabled:opacity-40`} />
                <label className="flex items-center gap-2 mt-2 text-[12px] text-slate-500">
                  <input type="checkbox" checked={draft.sinIdentificar}
                    onChange={e => setDraft(d => ({ ...d, sinIdentificar: e.target.checked, nombreConocido: e.target.checked ? '' : d.nombreConocido }))} />
                  No identifico la variedad/fórmula
                </label>
              </div>
            )}
            {draft.productoId && (
              <div>
                <label className={labelCls}>Presentación</label>
                <div className="flex gap-2 mb-2">
                  {presentacionesDelProducto.length > 0 && (
                    <button onClick={() => setDraft(d => ({ ...d, modo: 'catalogo' }))} className={`flex-1 py-2 rounded-lg text-[11.5px] font-bold ${draft.modo === 'catalogo' ? 'bg-[#1A5C38] text-white' : 'bg-slate-100 text-slate-500'}`}>Del catálogo</button>
                  )}
                  <button onClick={() => setDraft(d => ({ ...d, modo: 'otra' }))} className={`flex-1 py-2 rounded-lg text-[11.5px] font-bold ${draft.modo === 'otra' ? 'bg-[#1A5C38] text-white' : 'bg-slate-100 text-slate-500'}`}>Otra</button>
                  <button onClick={() => setDraft(d => ({ ...d, modo: 'granel' }))} className={`flex-1 py-2 rounded-lg text-[11.5px] font-bold ${draft.modo === 'granel' ? 'bg-[#1A5C38] text-white' : 'bg-slate-100 text-slate-500'}`}>A granel</button>
                </div>
                {draft.modo === 'catalogo' && (
                  <select value={draft.presentacionId} onChange={e => setDraft(d => ({ ...d, presentacionId: e.target.value }))} className={inputCls}>
                    <option value="">Selecciona una presentación</option>
                    {presentacionesDelProducto.map(p => <option key={p.id} value={p.id}>{p.envase} de {p.contenido} {p.unidad}</option>)}
                  </select>
                )}
                {draft.modo === 'otra' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input type="text" placeholder="Envase" value={draft.otroEnvase} onChange={e => setDraft(d => ({ ...d, otroEnvase: e.target.value }))} className={inputCls} />
                    <input type="number" placeholder="Contenido" value={draft.otroContenido} onChange={e => setDraft(d => ({ ...d, otroContenido: e.target.value }))} className={inputCls} />
                    <select value={draft.otroUnidad} onChange={e => setDraft(d => ({ ...d, otroUnidad: e.target.value }))} className={inputCls}>
                      <option value="">Unidad</option>
                      {['kg','g','ton','L','mL','semillas'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}
                {draft.modo === 'granel' && (
                  <select value={draft.granelUnidad} onChange={e => setDraft(d => ({ ...d, granelUnidad: e.target.value }))} className={inputCls}>
                    <option value="">Unidad de compra a granel</option>
                    {['kg','g','ton','L','mL'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}
              </div>
            )}
            {draft.productoId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Cantidad</label>
                  <input type="number" inputMode="decimal" value={draft.cantidad} onChange={e => setDraft(d => ({ ...d, cantidad: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Mes</label>
                  <select value={draft.mes} onChange={e => setDraft(d => ({ ...d, mes: e.target.value }))} className={inputCls}>
                    <option value="">Selecciona el mes</option>
                    {mesesDisponibles.map(m => <option key={m.valor} value={m.valor}>{m.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            {draft.productoId && (
              <div>
                <label className={labelCls}>Marca de preferencia (opcional)</label>
                <input type="text" value={draft.marca} onChange={e => setDraft(d => ({ ...d, marca: e.target.value }))} className={inputCls} />
              </div>
            )}
            {errorForm && <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-[12px] text-center">{errorForm}</div>}
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={resetForm} className="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-[13.5px]">Cancelar</button>
              <button onClick={guardarLinea} className="py-3 bg-[#1A5C38] text-white rounded-xl font-bold text-[13.5px]">Guardar producto</button>
            </div>
          </div>
        )}

        {error && <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-[12px] text-center">{error}</div>}

        {!mostrarForm && (
          <button onClick={enviar} disabled={guardando}
            className="w-full bg-[#1A5C38] hover:bg-[#124227] text-white py-3.5 rounded-2xl font-bold text-[14.5px] active:scale-[0.98] transition-all disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar encuesta'}
          </button>
        )}
      </div>
    </div>
  );
}
