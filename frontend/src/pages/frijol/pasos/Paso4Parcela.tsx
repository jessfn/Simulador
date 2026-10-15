import { useEffect, useState } from 'react';
import { MapPin, Pencil, Map as MapaIcono, CheckCircle2 } from 'lucide-react';
import MapaUP from '../../../components/productor/MapaUP';
import MapaPoligono from '../MapaPoligono';
import { useMunicipios } from '../useRegistro';
import { Aviso, Campo, Opciones, Selector, Tarjeta, Texto, Contador } from '../ui';
import { vacioParcela } from '../validacion';
import type { Errores } from '../validacion';
import type { Borrador, CatalogosFrijol, Estado, ParcelaBorrador, ParcelaExistente } from '../tipos';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  catalogos: CatalogosFrijol | null;
  estados: Estado[];
  zona: { state_id: string; municipality_id: string | null }[];
  errores: Errores;
  /** mensaje del servidor (p. ej. traslape) que obliga a regresar al mapa */
  errorServidor?: string;
}

const centroDe = (g: ParcelaExistente['geom_geojson']): [number, number] | null => {
  if (!g) return null;
  const c = g.coordinates as number[][][] | number[][][][];
  const ring = (g.type === 'MultiPolygon' ? (c as number[][][][])[0]?.[0] : (c as number[][][])[0]) as number[][] | undefined;
  if (!ring || ring.length === 0) return null;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length, lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  return [lat, lng];
};

// Paso 4 de 7 — Parcela. Primero se elige una parcela que el productor ya tenga (SIMAC o frijol), o se agrega una nueva.
export default function Paso4Parcela({ b, actualizar, catalogos, estados, zona, errores, errorServidor }: Props) {
  const p = b.parcela;
  const propias = b.consulta?.parcelas || [];
  const municipios = useMunicipios(p.state_id);
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const set = (parche: Partial<ParcelaBorrador>) => actualizar(prev => ({ ...prev, parcela: { ...prev.parcela, ...parche } }));

  // Si el servidor rechazó el polígono (traslape), se vuelve directo al mapa
  useEffect(() => { if (errorServidor) setMapaAbierto(true); }, [errorServidor]);

  // El estado arranca con el de la zona del técnico (si trabaja en uno solo)
  useEffect(() => {
    if (p.modo === 'nueva' && !p.state_id) {
      const unicos = Array.from(new Set(zona.map(z => z.state_id)));
      if (unicos.length === 1) set({ state_id: unicos[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.modo, zona.length]);

  const siguienteNumero = () => {
    const usados = propias.map(x => x.numero_up || 0);
    return Math.min(Math.max(1, ...usados) + (usados.length ? 1 : 0), b.complementaria.total_ups) || 1;
  };

  function elegirExistente(u: ParcelaExistente) {
    actualizar(prev => ({
      ...prev,
      parcela: {
        ...vacioParcela(), modo: 'existente', up_id: u.up_id, nombre: u.up_name, numero_up: u.numero_up ?? null,
        state_id: u.state_id || '', municipality_id: u.municipality_id || '', localidad: u.localidad || '',
        documento: u.documento_propiedad || '', documento_otro: u.documento_propiedad_otro || '',
        regimen: '',
      },
    }));
  }

  function nuevaParcela() {
    actualizar(prev => ({ ...prev, parcela: { ...vacioParcela(), modo: 'nueva', numero_up: siguienteNumero() } }));
  }

  const seleccionada = p.modo === 'existente' ? propias.find(u => u.up_id === p.up_id) : null;

  // ── F4-a: elegir parcela ──
  if (!p.modo && propias.length > 0) {
    return (
      <div className="space-y-4">
        <Aviso tipo="info">Este productor ya tiene parcelas registradas. Elige en cuál se registrará el frijol, o agrega una nueva.</Aviso>
        {propias.map(u => (
          <Tarjeta key={u.up_id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[17px] font-bold text-slate-900 truncate">{u.up_name}</p>
                <p className="text-[13.5px] text-slate-500 mt-0.5">
                  {u.numero_up ? `Parcela ${u.numero_up} · ` : ''}{(u.area_ha_real ?? u.area_ha_calc) ? `${Number(u.area_ha_real ?? u.area_ha_calc).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha · ` : ''}{u.municipality_name}, {u.state_name}
                </p>
              </div>
              {u.tiene_frijol && <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">Ya tiene frijol {u.ciclos_frijol[0]}</span>}
            </div>
            <button type="button" onClick={() => elegirExistente(u)}
              className="mt-4 w-full min-h-[52px] rounded-2xl bg-[#1A5C38] text-white text-[15px] font-bold active:scale-[0.98]">Registrar frijol en esta parcela</button>
          </Tarjeta>
        ))}
        <button type="button" onClick={nuevaParcela}
          className="w-full min-h-[54px] rounded-2xl bg-white border-2 border-dashed border-slate-300 text-slate-700 text-[15px] font-bold active:scale-[0.98]">Es otra parcela (agregar nueva)</button>
      </div>
    );
  }
  if (!p.modo) {
    // Productor sin parcelas: va directo a la parcela nueva
    return (<div className="space-y-4"><Aviso tipo="info">Este productor aún no tiene parcelas. Registra la primera.</Aviso>
      <button type="button" onClick={nuevaParcela} className="w-full min-h-[54px] rounded-2xl bg-[#1A5C38] text-white text-[16px] font-bold">Agregar la parcela</button></div>);
  }

  const campoNumero = (
    <Campo etiqueta={`Número de parcela (de ${b.complementaria.total_ups})`} error={errores.numero_up}>
      <Contador valor={p.numero_up || 1} alCambiar={v => set({ numero_up: v })} min={1} max={Math.max(1, b.complementaria.total_ups)} />
    </Campo>
  );

  const documento = (
    <>
      <Campo etiqueta="Documento de propiedad" error={errores.documento}>
        <Opciones valor={p.documento} alCambiar={v => set({ documento: v })} opciones={catalogos?.documento_propiedad || []} />
      </Campo>
      {p.documento === 'otro' && (
        <Campo etiqueta="¿Cuál documento?" error={errores.documento_otro}>
          <Texto valor={p.documento_otro} alCambiar={v => set({ documento_otro: v })} error={errores.documento_otro} autoComplete="off" />
        </Campo>
      )}
    </>
  );

  // ── Parcela existente: datos en solo lectura y se piden los que faltan ──
  if (p.modo === 'existente' && seleccionada) {
    const c = centroDe(seleccionada.geom_geojson);
    return (
      <div className="space-y-5">
        <Tarjeta titulo="Parcela elegida" acciones={propias.length > 0 ? <button type="button" onClick={() => set({ modo: null })} className="text-[14px] font-bold text-[#1A5C38] min-h-[44px] px-2">Cambiar</button> : undefined}>
          <p className="text-[17px] font-bold text-slate-900">{seleccionada.up_name}</p>
          <p className="text-[13.5px] text-slate-500 mt-0.5 mb-3">{seleccionada.municipality_name}, {seleccionada.state_name} · {(seleccionada.area_ha_real ?? seleccionada.area_ha_calc) ? `${Number(seleccionada.area_ha_real ?? seleccionada.area_ha_calc).toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha` : ''}</p>
          {c && <MapaUP lat={c[0]} lng={c[1]} locationConfirmed centroidSource="productor" height="170px" zoom={15} poligono={seleccionada.geom_geojson ? ((seleccionada.geom_geojson.type === 'MultiPolygon' ? (seleccionada.geom_geojson.coordinates as number[][][][])[0][0] : (seleccionada.geom_geojson.coordinates as number[][][])[0]) as [number, number][]) : null} />}
        </Tarjeta>
        <Tarjeta titulo="Datos que faltan">
          <div className="space-y-5">
            {campoNumero}
            <Campo etiqueta="Localidad o ejido" error={errores.localidad}><Texto valor={p.localidad} alCambiar={v => set({ localidad: v })} error={errores.localidad} autoComplete="off" /></Campo>
            {documento}
          </div>
        </Tarjeta>
      </div>
    );
  }

  // ── F4-b: parcela nueva ──
  const area = p.area_calc_ha;
  const real = Number(p.area_real_ha);
  const difiere = !!(area && real > 0 && Math.abs(real - area) / area > 0.10);

  return (
    <div className="space-y-5">
      {mapaAbierto && (
        <MapaPoligono
          vertices={p.vertices} poligono={p.poligono} propias={propias} mensajeServidor={errorServidor}
          alCambiarVertices={v => set({ vertices: v })}
          alBorrarTodo={() => set({ vertices: [], poligono: null, area_calc_ha: null })}
          alTerminar={(poli, ha) => { set({ poligono: poli, vertices: poli, area_calc_ha: ha }); setMapaAbierto(false); }}
          alCerrar={() => setMapaAbierto(false)} />
      )}

      {propias.length > 0 && !p.nombre && (
        <button type="button" onClick={() => set({ modo: null })} className="text-[14px] font-bold text-[#1A5C38] min-h-[44px]">← Elegir una parcela que ya tiene</button>
      )}

      <Tarjeta titulo="Datos de la parcela">
        <div className="space-y-5">
          <Campo etiqueta="Nombre de la parcela" error={errores.nombre} ayuda="Por ejemplo: El Bajío">
            <Texto valor={p.nombre} alCambiar={v => set({ nombre: v })} error={errores.nombre} autoComplete="off" />
          </Campo>
          {campoNumero}
          <Campo etiqueta="Estado" error={errores.state_id}>
            <Selector valor={p.state_id} alCambiar={v => set({ state_id: v, municipality_id: '' })} opciones={estados.map(e => ({ code: e.state_id, label: e.name }))} vacio="Elige el estado" error={errores.state_id} />
          </Campo>
          <Campo etiqueta="Municipio" error={errores.municipality_id}
            aviso={p.state_id && p.municipality_id && zona.length > 0 && !zona.some(z => z.state_id === p.state_id && (!z.municipality_id || z.municipality_id === p.municipality_id)) ? 'Este municipio está fuera de tu zona de operación.' : undefined}>
            <Selector valor={p.municipality_id} alCambiar={v => set({ municipality_id: v })} opciones={municipios.map(m => ({ code: m.municipality_id, label: m.name }))}
              vacio={p.state_id ? 'Elige el municipio' : 'Primero elige el estado'} deshabilitado={!p.state_id} error={errores.municipality_id} />
          </Campo>
          <Campo etiqueta="Localidad o ejido" error={errores.localidad}><Texto valor={p.localidad} alCambiar={v => set({ localidad: v })} error={errores.localidad} autoComplete="off" /></Campo>
          {documento}
          <Campo etiqueta="Régimen hídrico" error={errores.regimen}>
            <Opciones valor={p.regimen} alCambiar={v => set({ regimen: v as 'temporal' | 'riego' })} columnas={2}
              opciones={[{ code: 'temporal', label: 'Temporal (lluvia)' }, { code: 'riego', label: 'Riego' }]} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Polígono de la parcela">
        {p.poligono && p.poligono.length >= 3 ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={24} />
              <div><p className="text-[15px] font-bold text-slate-900">Polígono listo</p>
                <p className="text-[13px] text-slate-500">{area ? `${area.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha calculadas · ` : ''}{p.poligono.length} puntos</p></div>
            </div>
            <button type="button" onClick={() => setMapaAbierto(true)} className="min-h-[46px] px-4 rounded-2xl bg-slate-100 text-slate-700 text-[14px] font-bold flex items-center gap-1.5"><Pencil size={15} /> Editar</button>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-slate-600 mb-3 leading-snug">Dibuja la parcela caminando su borde con el GPS o marcando las esquinas en el mapa.{p.vertices.length > 0 ? ` Llevas ${p.vertices.length} punto${p.vertices.length === 1 ? '' : 's'}.` : ''}</p>
            <button type="button" onClick={() => setMapaAbierto(true)}
              className="w-full min-h-[56px] rounded-2xl bg-[#1A5C38] text-white text-[16px] font-bold flex items-center justify-center gap-2.5 active:scale-[0.98]"><MapaIcono size={20} /> {p.vertices.length > 0 ? 'Continuar el dibujo' : 'Dibujar la parcela'}</button>
          </>
        )}
        {errores.poligono && <p role="alert" className="text-[13px] text-red-600 font-medium mt-2">{errores.poligono}</p>}
        {p.poligono && area ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center gap-3"><MapPin size={18} className="text-[#1A5C38]" />
              <p className="text-[14px] text-slate-700">Superficie calculada: <strong>{area.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha</strong></p></div>
            <Campo etiqueta="Superficie ajustada (ha)" obligatorio={false} error={errores.area_real_ha} ayuda="Solo si la superficie real es distinta a la calculada.">
              <Texto valor={p.area_real_ha} alCambiar={v => set({ area_real_ha: v.replace(',', '.') })} inputMode="decimal" error={errores.area_real_ha} autoComplete="off" />
            </Campo>
            {difiere && (
              <Campo etiqueta="Motivo de la diferencia" error={errores.motivo_diferencia} ayuda="Difiere más de 10 % de la calculada.">
                <Texto valor={p.motivo_diferencia} alCambiar={v => set({ motivo_diferencia: v })} error={errores.motivo_diferencia} autoComplete="off" />
              </Campo>
            )}
          </div>
        ) : null}
      </Tarjeta>
    </div>
  );
}
