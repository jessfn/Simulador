import { useEffect } from 'react';
import { Aviso, Campo, Texto, Tarjeta } from '../ui';
import type { Borrador } from '../tipos';
import type { Errores } from '../validacion';
import { extraerDatosCurp } from '../../../utils/curp';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  errores: Errores;
}

// Paso 2 de 7 — Datos del productor.
// Si provienen de RENAPO o SADER (activo), los datos de identidad son de solo lectura.
// La fecha de nacimiento y sexo siempre se obtienen y aseguran desde la CURP.
export default function Paso2Productor({ b, actualizar, errores }: Props) {
  const p = b.productor;
  const set = (campo: keyof Borrador['productor'], valor: string) => actualizar(prev => ({ ...prev, productor: { ...prev.productor, [campo]: valor } }));
  const enSimac = b.consulta?.codigo === 'EN_SIMAC' || b.consulta?.codigo === 'EN_FRIJOL_PROPIO';
  const esOficial = b.consulta?.codigo === 'RENAPO' || b.consulta?.codigo === 'PADRON_SADER';
  const bloq = (c: string) => !!b.consulta?.bloqueados?.includes(c);
  const hayBloqueados = (b.consulta?.bloqueados?.length ?? 0) > 0;
  const cambioTelefono = enSimac && b.consulta?.tiene_cuenta && (b.consulta.telefono_original || '') !== '' && p.telefono !== (b.consulta.telefono_original || '').replace(/\D/g, '').slice(-10);

  // Asegurar fecha y sexo desde la CURP si aún no están asignados en el borrador
  const curpInfo = extraerDatosCurp(b.curp);
  useEffect(() => {
    if (curpInfo.valida) {
      if (!p.fecha_nacimiento && curpInfo.fechaNacimiento) {
        set('fecha_nacimiento', curpInfo.fechaNacimiento);
      }
      if (!p.sexo && curpInfo.sexo) {
        set('sexo', curpInfo.sexo);
      }
    }
  }, [b.curp, curpInfo.valida, curpInfo.fechaNacimiento, curpInfo.sexo, p.fecha_nacimiento, p.sexo]);

  // Si proviene de fuente oficial (RENAPO o SADER activo) o ya existe en SIMAC, los nombres son inmutables
  const nombresBloqueados = esOficial || enSimac || bloq('nombres');
  const apellidoPatBloqueado = esOficial || enSimac || bloq('apellido_paterno');
  const apellidoMatBloqueado = esOficial || enSimac || bloq('apellido_materno');

  return (
    <div className="space-y-5">
      {esOficial && (
        <Aviso tipo="verde">
          Datos de identidad verificados ante {b.consulta?.codigo === 'RENAPO' ? 'RENAPO' : 'el Padrón de SADER'}. Los datos personales están protegidos y se muestran en solo lectura.
        </Aviso>
      )}

      {enSimac && (
        <Aviso tipo="info">
          Este productor ya está registrado en SIMAC. Los datos de identidad están protegidos.
        </Aviso>
      )}

      {!esOficial && !enSimac && (
        <Aviso tipo="info">
          Fecha de nacimiento y sexo obtenidos directamente de la CURP. Completa los nombres del productor.
        </Aviso>
      )}

      <Tarjeta>
        <div className="space-y-4">
          <Campo etiqueta="CURP"><div className="min-h-[50px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 flex items-center font-mono tracking-wider text-[15px] text-slate-600">{b.curp}</div></Campo>
          <Campo etiqueta="Nombre(s)" error={errores.nombres}><Texto valor={p.nombres} alCambiar={v => set('nombres', v)} error={errores.nombres} autoComplete="off" disabled={nombresBloqueados} /></Campo>
          <Campo etiqueta="Apellido paterno" error={errores.apellido_paterno}><Texto valor={p.apellido_paterno} alCambiar={v => set('apellido_paterno', v)} error={errores.apellido_paterno} autoComplete="off" disabled={apellidoPatBloqueado} /></Campo>
          <Campo etiqueta="Apellido materno" obligatorio={false}><Texto valor={p.apellido_materno} alCambiar={v => set('apellido_materno', v)} autoComplete="off" disabled={apellidoMatBloqueado} /></Campo>

          <Campo etiqueta="Sexo" error={errores.sexo} ayuda="Obtenido de la CURP">
            <div className="flex gap-3">
              {(['H', 'M'] as const).map(s => (
                <button key={s} type="button" aria-pressed={p.sexo === s} disabled={true}
                  className={`flex-1 min-h-[52px] rounded-2xl text-[16px] font-bold border-2 transition ${p.sexo === s ? 'bg-[#1A5C38] border-[#1A5C38] text-white opacity-90' : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'}`}>
                  {s === 'H' ? 'Hombre' : 'Mujer'}
                </button>
              ))}
            </div>
          </Campo>

          <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento} ayuda="Obtenida de la CURP">
            <Texto type="date" valor={p.fecha_nacimiento} alCambiar={v => set('fecha_nacimiento', v)} error={errores.fecha_nacimiento}
              min={`${new Date().getFullYear() - 100}-01-01`} max={`${new Date().getFullYear() - 15}-12-31`} disabled={true} />
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

      {hayBloqueados && !esOficial && !enSimac && <Aviso tipo="ambar">Los datos que no puedes editar ya se corrigieron antes (o el teléfono es de un productor con cuenta). Deja su valor y sigue con el registro; si de verdad hay que cambiarlos, termina y pide el cambio desde la ficha del productor.</Aviso>}
      {enSimac && <Aviso tipo="info">Si cambias el teléfono o el correo, este cambio también se verá en SIMAC maíz. Queda un historial de cada cambio.</Aviso>}
    </div>
  );
}
