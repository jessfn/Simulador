import { Aviso, Tarjeta } from '../ui';
import { cicloDe, produccionEstimada, regimenDe, superficieParcela } from '../validacion';
import type { Borrador, CatalogosFrijol, Estado } from '../tipos';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  catalogos: CatalogosFrijol | null;
  estados: Estado[];
  nombreMunicipio: string;
  irAPaso: (paso: number) => void;
  errorEnvio: string;
  enLinea: boolean;
}

const Fila = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-1.5 text-[14.5px]"><dt className="text-slate-500 flex-shrink-0">{k}</dt><dd className="font-semibold text-slate-900 text-right break-words min-w-0">{v}</dd></div>
);

function Bloque({ titulo, paso, irAPaso, children }: { titulo: string; paso: number; irAPaso: (p: number) => void; children: React.ReactNode }) {
  return (
    <Tarjeta titulo={titulo} acciones={<button type="button" onClick={() => irAPaso(paso)} className="text-[14px] font-bold text-[#1A5C38] min-h-[44px] px-2">Editar</button>}>
      <dl className="divide-y divide-slate-50">{children}</dl>
    </Tarjeta>
  );
}

// Paso 7 de 7 — Revisar y enviar.
export default function Paso7Revisar({ b, actualizar, catalogos, estados, nombreMunicipio, irAPaso, errorEnvio, enLinea }: Props) {
  const p = b.productor, c = b.complementaria, pa = b.parcela, cu = b.cultivo;
  const etiqueta = (lista: { code: string; label: string }[] | undefined, code: string) => lista?.find(x => x.code === code)?.label || code || '—';
  const sup = superficieParcela(pa, b.consulta?.parcelas?.find(u => u.up_id === pa.up_id));
  const ciclo = cicloDe(b);
  const sino = (v: boolean | null) => (v === null ? '—' : v ? 'Sí' : 'No');
  const estim = produccionEstimada(cu);

  return (
    <div className="space-y-4">
      {b.consulta?.codigo === 'NO_VERIFICABLE' && <Aviso tipo="ambar">La CURP se verificará automáticamente. Si hay un problema, te avisaremos en tu tablero.</Aviso>}
      {!enLinea && <Aviso tipo="ambar">Sin conexión. Puedes revisar el registro; para enviarlo necesitas señal. Tu captura está guardada en el teléfono.</Aviso>}
      {errorEnvio && <Aviso tipo="rojo">{errorEnvio}</Aviso>}

      <Bloque titulo="Productor" paso={2} irAPaso={irAPaso}>
        <Fila k="Nombre" v={`${p.nombres} ${p.apellido_paterno} ${p.apellido_materno}`.trim()} />
        <Fila k="CURP" v={<span className="font-mono text-[13px]">{b.curp}</span>} />
        <Fila k="Sexo" v={p.sexo === 'H' ? 'Hombre' : p.sexo === 'M' ? 'Mujer' : '—'} />
        <Fila k="Nacimiento" v={p.fecha_nacimiento} />
        <Fila k="Teléfono" v={p.telefono} />
        {p.correo && <Fila k="Correo" v={p.correo} />}
      </Bloque>

      <Bloque titulo="Información complementaria" paso={3} irAPaso={irAPaso}>
        <Fila k="Parcelas en total" v={c.total_ups} />
        <Fila k="Otros programas" v={c.participa ? c.programas_sader.map(x => catalogos?.programas_sader.find(s => s.clave === x)?.nombre || x).join(', ') : 'No participa'} />
        {c.organizacion && <Fila k="Organización" v={c.organizacion} />}
        <Fila k="Seguro agrícola" v={c.seguro ? etiqueta(catalogos?.seguro_agricola, c.seguro) : 'No indicó'} />
      </Bloque>

      <Bloque titulo="Parcela" paso={4} irAPaso={irAPaso}>
        <Fila k="Nombre" v={pa.nombre} />
        <Fila k="Número" v={`${pa.numero_up} de ${c.total_ups}`} />
        <Fila k="Ubicación" v={`${pa.localidad}, ${nombreMunicipio}, ${estados.find(e => e.state_id === pa.state_id)?.name || ''}`} />
        <Fila k="Documento" v={pa.documento === 'otro' ? pa.documento_otro : etiqueta(catalogos?.documento_propiedad, pa.documento)} />
        <Fila k="Superficie" v={sup > 0 ? `${sup.toLocaleString('es-MX', { maximumFractionDigits: 2 })} ha` : '—'} />
        <Fila k="Régimen" v={pa.modo === 'nueva' ? (regimenDe(b) === 'riego' ? 'Riego' : 'Temporal') : 'Parcela existente'} />
      </Bloque>

      <Bloque titulo="Semillas" paso={5} irAPaso={irAPaso}>
        <Fila k="Se dedica a producir semillas" v={sino(b.semillas.dedica)} />
        <Fila k="Ha trabajado con PROSEBIEN" v={sino(b.semillas.trabajo_prosebien)} />
        <Fila k="Usará PROSEBIEN en PV" v={sino(b.semillas.usara_prosebien)} />
      </Bloque>

      <Bloque titulo="Cultivo de frijol" paso={6} irAPaso={irAPaso}>
        <Fila k="Ciclo" v={ciclo?.etiqueta || '—'} />
        <Fila k="Siembra" v={cu.fecha_siembra} />
        <Fila k="Cosecha estimada" v={cu.fecha_cosecha} />
        <Fila k="Variedad" v={cu.variety_other ? `${etiqueta(catalogos?.variedades, cu.variety_id)} (${cu.variety_other})` : etiqueta(catalogos?.variedades, cu.variety_id)} />
        <Fila k="Superficie sembrada" v={`${cu.area_sembrada_ha} ha`} />
        <Fila k="Rendimiento esperado" v={`${cu.rendimiento} t/ha`} />
        {estim !== null && <Fila k="Producción estimada" v={`${estim} t`} />}
        <Fila k="Densidad" v={`${cu.densidad} kg/ha`} />
        <Fila k="Fertilizante" v={cu.usa_fertilizante ? cu.tipos_fertilizante.map(x => etiqueta(catalogos?.tipo_fertilizante, x)).join(', ') : 'No usa'} />
        <Fila k="Rotación" v={etiqueta(catalogos?.rotacion_cultivo, cu.rotacion)} />
        {cu.tipo_siembra && <Fila k="Tipo de siembra" v={etiqueta(catalogos?.tipo_siembra_frijol, cu.tipo_siembra)} />}
        {cu.destino && <Fila k="Destino" v={etiqueta(catalogos?.destino_frijol, cu.destino)} />}
        <Fila k="Observaciones" v={cu.sin_observaciones ? 'Sin observaciones' : cu.observaciones} />
      </Bloque>

      <button type="button" role="checkbox" aria-checked={b.confirmacion} onClick={() => actualizar(prev => ({ ...prev, confirmacion: !prev.confirmacion }))}
        className={`w-full min-h-[60px] px-4 py-3 rounded-2xl border-2 text-[15px] font-semibold flex items-center gap-3 text-left ${b.confirmacion ? 'bg-[#eef8f2] border-[#1A5C38] text-[#0f3f26]' : 'bg-white border-slate-300 text-slate-700'}`}>
        <span className={`w-7 h-7 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${b.confirmacion ? 'bg-[#1A5C38] border-[#1A5C38]' : 'border-slate-300'}`}>
          {b.confirmacion && <svg viewBox="0 0 12 12" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5 5 9.5 10 3" /></svg>}
        </span>
        Confirmo que la información fue proporcionada por el productor.
      </button>
    </div>
  );
}
