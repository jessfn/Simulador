import { Aviso, Campo, Texto, Tarjeta } from '../ui';
import type { Borrador } from '../tipos';
import type { Errores } from '../validacion';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  errores: Errores;
}

// Paso 2 de 7 — Datos del productor. Prellenados cuando vienen de SIMAC, SADER o RENAPO; siempre editables (con historial).
export default function Paso2Productor({ b, actualizar, errores }: Props) {
  const p = b.productor;
  const set = (campo: keyof Borrador['productor'], valor: string) => actualizar(prev => ({ ...prev, productor: { ...prev.productor, [campo]: valor } }));
  const enSimac = b.consulta?.codigo === 'EN_SIMAC' || b.consulta?.codigo === 'EN_FRIJOL_PROPIO';
  const bloq = (c: string) => !!b.consulta?.bloqueados?.includes(c);
  const hayBloqueados = (b.consulta?.bloqueados?.length ?? 0) > 0;
  const cambioTelefono = enSimac && b.consulta?.tiene_cuenta && (b.consulta.telefono_original || '') !== '' && p.telefono !== (b.consulta.telefono_original || '').replace(/\D/g, '').slice(-10);

  return (
    <div className="space-y-5">
      <Tarjeta>
        <div className="space-y-4">
          <Campo etiqueta="CURP"><div className="min-h-[50px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 flex items-center font-mono tracking-wider text-[15px] text-slate-600">{b.curp}</div></Campo>
          <Campo etiqueta="Nombre(s)" error={errores.nombres}><Texto valor={p.nombres} alCambiar={v => set('nombres', v)} error={errores.nombres} autoComplete="off" disabled={bloq('nombres')} /></Campo>
          <Campo etiqueta="Apellido paterno" error={errores.apellido_paterno}><Texto valor={p.apellido_paterno} alCambiar={v => set('apellido_paterno', v)} error={errores.apellido_paterno} autoComplete="off" disabled={bloq('apellido_paterno')} /></Campo>
          <Campo etiqueta="Apellido materno" obligatorio={false}><Texto valor={p.apellido_materno} alCambiar={v => set('apellido_materno', v)} autoComplete="off" disabled={bloq('apellido_materno')} /></Campo>

          <Campo etiqueta="Sexo" error={errores.sexo}>
            <div className="flex gap-3">
              {(['H', 'M'] as const).map(s => (
                <button key={s} type="button" onClick={() => set('sexo', s)} aria-pressed={p.sexo === s} disabled={bloq('sexo')}
                  className={`flex-1 min-h-[52px] rounded-2xl text-[16px] font-bold border-2 transition active:scale-[0.98] ${p.sexo === s ? 'bg-[#1A5C38] border-[#1A5C38] text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
                  {s === 'H' ? 'Hombre' : 'Mujer'}
                </button>
              ))}
            </div>
          </Campo>

          <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento}>
            <Texto type="date" valor={p.fecha_nacimiento} alCambiar={v => set('fecha_nacimiento', v)} error={errores.fecha_nacimiento}
              min={`${new Date().getFullYear() - 100}-01-01`} max={`${new Date().getFullYear() - 15}-12-31`} disabled={bloq('fecha_nacimiento')} />
          </Campo>

          <Campo etiqueta="Teléfono (10 dígitos)" error={errores.telefono}>
            <Texto valor={p.telefono} alCambiar={v => set('telefono', v.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" error={errores.telefono} autoComplete="off" placeholder="10 dígitos" disabled={bloq('telefono')} />
          </Campo>
          {cambioTelefono && (
            <Aviso tipo="ambar">Este productor usa su teléfono para recuperar su NIP en SIMAC. Confirma que el número nuevo es correcto.</Aviso>
          )}

          <Campo etiqueta="Correo electrónico" error={errores.correo} obligatorio={false}>
            <Texto valor={p.correo} alCambiar={v => set('correo', v)} type="email" inputMode="email" error={errores.correo} autoComplete="off" autoCapitalize="none" disabled={bloq('correo')} />
          </Campo>
        </div>
      </Tarjeta>

      {hayBloqueados && <Aviso tipo="ambar">Los datos que no puedes editar ya se corrigieron antes (o el teléfono es de un productor con cuenta). Deja su valor y sigue con el registro; si de verdad hay que cambiarlos, termina y pide el cambio desde la ficha del productor.</Aviso>}
      {enSimac && <Aviso tipo="info">Si cambias el nombre, el teléfono o el correo, este cambio también se verá en SIMAC maíz. Queda un historial de cada cambio.</Aviso>}
    </div>
  );
}
