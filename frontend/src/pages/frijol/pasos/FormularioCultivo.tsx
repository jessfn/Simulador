import { Aviso, Campo, Casillas, ListaBuscable, Opciones, SiNo, Tarjeta, Texto, claseInput } from '../ui';
import { inferirCiclo } from '../../../utils/cicloSIAP';
import { produccionEstimada, regimenDe } from '../validacion';
import type { AvisosCultivo, Errores } from '../validacion';
import type { Borrador, CatalogosFrijol, CultivoBorrador } from '../tipos';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  catalogos: CatalogosFrijol | null;
  errores: Errores;
  avisos: AvisosCultivo;
  /** superficie de la parcela, solo informativa ("Puede ser menor si siembra otros cultivos") */
  superficie: number;
}

const hoyISO = () => new Date().toISOString().slice(0, 10);
const masDias = (dias: number) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);

// Formulario del cultivo de frijol (Paso 6 de 7). También se usa para corregir un cultivo ya enviado.
export default function FormularioCultivo({ b, actualizar, catalogos, errores, avisos, superficie }: Props) {
  const c = b.cultivo;
  const set = (parche: Partial<CultivoBorrador>) => actualizar(prev => ({ ...prev, cultivo: { ...prev.cultivo, ...parche } }));
  const inf = c.fecha_siembra ? inferirCiclo(c.fecha_siembra, regimenDe(b)) : null;
  const estimada = produccionEstimada(c);
  const num = (v: string) => v.replace(',', '.').replace(/[^0-9.]/g, '');

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#eef8f2] border border-[#cfe8d8] px-4 py-3 text-[15px] text-[#0f3f26] font-bold">Cultivo: Frijol</div>

      <Tarjeta titulo="Siembra y ciclo">
        <div className="space-y-5">
          <Campo etiqueta="Fecha de siembra" error={errores.fecha_siembra} ayuda="Real o estimada.">
            <Texto type="date" valor={c.fecha_siembra} alCambiar={v => set({ fecha_siembra: v, cycle_type: '' })} error={errores.fecha_siembra} min={masDias(-540)} max={masDias(180)} />
          </Campo>

          {inf && !inf.necesitaElegir && (
            <Aviso tipo="verde">Ciclo: <strong>{inf.etiqueta}</strong> (según calendario SIAP).</Aviso>
          )}
          {inf?.necesitaElegir && (
            <Campo etiqueta={regimenDe(b) === 'riego' ? 'Elige el ciclo (riego)' : 'Fecha de transición: elige el ciclo'} error={errores.cycle_type}>
              <Opciones valor={c.cycle_type} alCambiar={v => set({ cycle_type: v })} columnas={inf.opciones.length === 3 ? 2 : 2}
                opciones={inf.opciones.map(o => ({ code: o, label: o === 'ANUAL' ? 'Anual' : o }))} />
            </Campo>
          )}

          <Campo etiqueta="Fecha estimada de cosecha" error={errores.fecha_cosecha} aviso={avisos.cosecha}>
            <Texto type="date" valor={c.fecha_cosecha} alCambiar={v => set({ fecha_cosecha: v })} error={errores.fecha_cosecha} min={c.fecha_siembra || hoyISO()} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Variedad y superficie">
        <div className="space-y-5">
          <Campo etiqueta="Variedad" error={errores.variety_id}>
            <ListaBuscable valor={c.variety_id} alCambiar={v => set({ variety_id: v })} opciones={catalogos?.variedades || []} vacio="Elige la variedad" error={errores.variety_id} />
          </Campo>
          {(c.variety_id === 'OTRA' || c.variety_id === 'CRIOLLO_LOCAL') && (
            <Campo etiqueta={c.variety_id === 'OTRA' ? '¿Cuál variedad?' : 'Nombre local'} obligatorio={c.variety_id === 'OTRA'} error={errores.variety_other}>
              <Texto valor={c.variety_other} alCambiar={v => set({ variety_other: v })} error={errores.variety_other} autoComplete="off" />
            </Campo>
          )}
          <Campo etiqueta="Superficie sembrada de frijol (ha)" error={errores.area_sembrada_ha}
            ayuda={`Puede ser menor si siembra otros cultivos${superficie > 0 ? ` (la parcela tiene ${superficie.toFixed(2)} ha)` : ''}.`}>
            <input value={c.area_sembrada_ha} onChange={e => set({ area_sembrada_ha: num(e.target.value) })} inputMode="decimal" className={claseInput(errores.area_sembrada_ha)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="Rendimiento esperado (t/ha)" error={errores.rendimiento} aviso={avisos.rendimiento}>
            <input value={c.rendimiento} onChange={e => set({ rendimiento: num(e.target.value) })} inputMode="decimal" className={claseInput(errores.rendimiento)} autoComplete="off" />
          </Campo>
          {estimada !== null && <p className="text-[14px] text-slate-600 -mt-2">Producción estimada: <strong>{estimada.toLocaleString('es-MX', { maximumFractionDigits: 2 })} t</strong></p>}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Manejo del cultivo">
        <div className="space-y-5">
          <Campo etiqueta="Densidad de siembra (kg de semilla por ha)" error={errores.densidad} aviso={avisos.densidad}>
            <input value={c.densidad} onChange={e => set({ densidad: num(e.target.value) })} inputMode="decimal" className={claseInput(errores.densidad)} autoComplete="off" />
          </Campo>
          <Campo etiqueta="¿Usa fertilizante?" error={errores.usa_fertilizante}>
            <SiNo valor={c.usa_fertilizante} alCambiar={v => set({ usa_fertilizante: v, tipos_fertilizante: v ? c.tipos_fertilizante : [] })} />
          </Campo>
          {c.usa_fertilizante && (
            <Campo etiqueta="Tipo de fertilizante" error={errores.tipos_fertilizante}>
              <Casillas valor={c.tipos_fertilizante} alCambiar={v => set({ tipos_fertilizante: v })} opciones={catalogos?.tipo_fertilizante || []} />
            </Campo>
          )}
          <Campo etiqueta="Rotación" error={errores.rotacion}>
            <Opciones valor={c.rotacion} alCambiar={v => set({ rotacion: v })} opciones={catalogos?.rotacion_cultivo || []} />
          </Campo>
          <Campo etiqueta="Tipo de siembra" obligatorio={false}>
            <Opciones valor={c.tipo_siembra} alCambiar={v => set({ tipo_siembra: c.tipo_siembra === v ? '' : v })} opciones={catalogos?.tipo_siembra_frijol || []} />
          </Campo>
          <Campo etiqueta="Destino de la producción" obligatorio={false}>
            <Opciones valor={c.destino} alCambiar={v => set({ destino: c.destino === v ? '' : v })} opciones={catalogos?.destino_frijol || []} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Observaciones del terreno">
        <div className="space-y-4">
          <Campo etiqueta="Observaciones" error={errores.observaciones} ayuda="Construcciones, otros cultivos, áreas de ganadería, etc.">
            <textarea value={c.observaciones} onChange={e => set({ observaciones: e.target.value })} disabled={c.sin_observaciones} rows={4}
              className={claseInput(errores.observaciones) + ' py-3 resize-none'} />
          </Campo>
          <button type="button" role="checkbox" aria-checked={c.sin_observaciones} onClick={() => set({ sin_observaciones: !c.sin_observaciones, observaciones: c.sin_observaciones ? c.observaciones : '' })}
            className={`w-full min-h-[52px] px-4 rounded-2xl border-2 text-[15px] font-semibold flex items-center gap-3 text-left ${c.sin_observaciones ? 'bg-[#eef8f2] border-[#1A5C38] text-[#0f3f26]' : 'bg-white border-slate-200 text-slate-700'}`}>
            <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${c.sin_observaciones ? 'bg-[#1A5C38] border-[#1A5C38]' : 'border-slate-300'}`}>
              {c.sin_observaciones && <svg viewBox="0 0 12 12" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5 5 9.5 10 3" /></svg>}
            </span>
            Sin observaciones
          </button>
        </div>
      </Tarjeta>
    </div>
  );
}
