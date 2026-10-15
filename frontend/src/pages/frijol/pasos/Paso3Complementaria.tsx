import { Aviso, Campo, Casillas, Contador, Opciones, SiNo, Tarjeta, Texto } from '../ui';
import type { Borrador, CatalogosFrijol, Complementaria } from '../tipos';
import type { Errores } from '../validacion';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  catalogos: CatalogosFrijol | null;
  errores: Errores;
}

// Paso 3 de 7 — Información complementaria del productor. La primera vez se llena completa; en las siguientes parcelas se
// muestra un resumen con botón "Editar".
export default function Paso3Complementaria({ b, actualizar, catalogos, errores }: Props) {
  const c = b.complementaria;
  const set = (parche: Partial<Complementaria>) => actualizar(prev => ({ ...prev, complementaria: { ...prev.complementaria, ...parche } }));
  const nombreProg = (clave: string) => catalogos?.programas_sader.find(p => p.clave === clave)?.nombre || clave;

  if (b.complementaria_resumen) {
    return (
      <Tarjeta titulo="Información del productor" acciones={
        <button type="button" onClick={() => actualizar(prev => ({ ...prev, complementaria_resumen: false }))} className="text-[14px] font-bold text-[#1A5C38] min-h-[44px] px-2">Editar</button>}>
        <dl className="text-[15px] space-y-2.5 text-slate-700">
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Parcelas en total</dt><dd className="font-bold">{c.total_ups}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Otros programas</dt><dd className="font-bold text-right">{c.participa ? c.programas_sader.map(nombreProg).join(', ') : 'No participa'}</dd></div>
          {c.organizacion && <div className="flex justify-between gap-4"><dt className="text-slate-500">Organización</dt><dd className="font-bold text-right">{c.organizacion}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-slate-500">Seguro agrícola</dt><dd className="font-bold text-right">{catalogos?.seguro_agricola.find(s => s.code === c.seguro)?.label || 'No indicó'}</dd></div>
        </dl>
      </Tarjeta>
    );
  }

  return (
    <div className="space-y-5">
      <Tarjeta>
        <div className="space-y-5">
          <Campo etiqueta="¿Cuántas parcelas tiene en total?" error={errores.total_ups}>
            <Contador valor={c.total_ups} alCambiar={v => set({ total_ups: v })} min={1} max={50} />
          </Campo>

          <Campo etiqueta="¿Participa en otros programas de la Secretaría de Agricultura?" error={errores.participa}>
            <SiNo valor={c.participa} alCambiar={v => set({ participa: v, programas_sader: v ? c.programas_sader : [], programas_otro: v ? c.programas_otro : '' })} />
          </Campo>

          {c.participa && (
            <Campo etiqueta="¿Cuál(es)?" error={errores.programas_sader}>
              <Casillas valor={c.programas_sader} alCambiar={v => set({ programas_sader: v })}
                opciones={(catalogos?.programas_sader || []).map(p => ({ code: p.clave, label: p.clave === 'otro_sader' ? 'Otro' : p.nombre }))} />
            </Campo>
          )}
          {c.participa && c.programas_sader.includes('otro_sader') && (
            <Campo etiqueta="¿Cuál otro programa?" error={errores.programas_otro}>
              <Texto valor={c.programas_otro} alCambiar={v => set({ programas_otro: v })} error={errores.programas_otro} autoComplete="off" />
            </Campo>
          )}

          <Campo etiqueta="Organización (sociedad, cooperativa o SPR)" obligatorio={false}>
            <Texto valor={c.organizacion} alCambiar={v => set({ organizacion: v })} autoComplete="off" />
          </Campo>

          <Campo etiqueta="Seguro agrícola" obligatorio={false}>
            <Opciones valor={c.seguro} alCambiar={v => set({ seguro: v })} opciones={catalogos?.seguro_agricola || []} />
          </Campo>
          {c.seguro === 'otro' && (
            <Campo etiqueta="Nombre del seguro o programa" error={errores.seguro_nombre}>
              <Texto valor={c.seguro_nombre} alCambiar={v => set({ seguro_nombre: v })} error={errores.seguro_nombre} autoComplete="off" />
            </Campo>
          )}
        </div>
      </Tarjeta>
      {b.consulta?.codigo === 'EN_FRIJOL_PROPIO' && <Aviso tipo="info">Estos datos ya estaban registrados. Si los cambias, se actualizan para todas sus parcelas.</Aviso>}
    </div>
  );
}
