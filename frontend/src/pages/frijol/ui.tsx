import { useState, type ReactNode } from 'react';
import { Minus, Plus, AlertTriangle, Info, Search, X, ChevronDown } from 'lucide-react';

// Piezas de formulario para trabajar en campo: texto de 16 px, áreas táctiles de 48 px o más, contraste alto.
export const VERDE = '#1A5C38';

export function Campo({ etiqueta, error, ayuda, aviso, children, obligatorio = true }: {
  etiqueta: string; error?: string; ayuda?: string; aviso?: string; children: ReactNode; obligatorio?: boolean;
}) {
  return (
    <div>
      <label className="block text-[14px] font-bold text-slate-800 mb-1.5">
        {etiqueta}{!obligatorio && <span className="font-medium text-slate-400"> (opcional)</span>}
      </label>
      {children}
      {ayuda && !error && <p className="text-[12.5px] text-slate-500 mt-1.5 leading-snug">{ayuda}</p>}
      {aviso && !error && <p className="text-[12.5px] text-amber-700 mt-1.5 leading-snug flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />{aviso}</p>}
      {error && <p role="alert" className="text-[13px] text-red-600 font-medium mt-1.5 leading-snug">{error}</p>}
    </div>
  );
}

const baseInput = 'w-full min-h-[50px] bg-white border-2 rounded-2xl px-4 text-[16px] text-slate-900 placeholder-slate-300 outline-none transition-colors disabled:bg-slate-50 disabled:text-slate-500';
export const claseInput = (error?: string) => `${baseInput} ${error ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-[#14532d]'}`;

export function Texto({ valor, alCambiar, error, ...resto }: {
  valor: string; alCambiar: (v: string) => void; error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <input {...resto} value={valor} onChange={e => alCambiar(e.target.value)} className={claseInput(error) + ' ' + (resto.className || '')} />;
}

export function Selector({ valor, alCambiar, opciones, vacio, error, deshabilitado }: {
  valor: string; alCambiar: (v: string) => void; opciones: { code: string; label: string }[]; vacio: string; error?: string; deshabilitado?: boolean;
}) {
  return (
    <div className="relative">
      <select value={valor} onChange={e => alCambiar(e.target.value)} disabled={deshabilitado} className={claseInput(error) + ' appearance-none pr-11'}>
        <option value="">{vacio}</option>
        {opciones.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
      </select>
      <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
    </div>
  );
}

/** Sí / No con botones grandes. */
export function SiNo({ valor, alCambiar, etiquetaSi = 'Sí', etiquetaNo = 'No' }: { valor: boolean | null; alCambiar: (v: boolean) => void; etiquetaSi?: string; etiquetaNo?: string }) {
  const b = (activo: boolean, texto: string, v: boolean) => (
    <button type="button" onClick={() => alCambiar(v)} aria-pressed={activo}
      className={`flex-1 min-h-[52px] rounded-2xl text-[16px] font-bold border-2 transition active:scale-[0.98] ${activo ? 'bg-[#14532d] border-[#14532d] text-white shadow-md' : 'bg-white border-slate-300 text-slate-800'}`}>
      {texto}
    </button>
  );
  return <div className="flex gap-3">{b(valor === true, etiquetaSi, true)}{b(valor === false, etiquetaNo, false)}</div>;
}

/** Elección única con botones apilados (opciones largas). */
export function Opciones({ valor, alCambiar, opciones, columnas = 1 }: { valor: string; alCambiar: (v: string) => void; opciones: { code: string; label: string }[]; columnas?: 1 | 2 }) {
  return (
    <div className={columnas === 2 ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'}>
      {opciones.map(o => {
        const activo = valor === o.code;
        return (
          <button key={o.code} type="button" onClick={() => alCambiar(o.code)} aria-pressed={activo}
            className={`w-full min-h-[52px] px-4 py-2.5 rounded-2xl text-[15px] font-semibold border-2 text-left transition active:scale-[0.99] ${activo ? 'bg-[#14532d] border-[#14532d] text-white shadow-md' : 'bg-white border-slate-300 text-slate-800'}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Elección múltiple con casillas grandes. */
export function Casillas({ valor, alCambiar, opciones }: { valor: string[]; alCambiar: (v: string[]) => void; opciones: { code: string; label: string }[] }) {
  return (
    <div className="space-y-2.5">
      {opciones.map(o => {
        const activo = valor.includes(o.code);
        return (
          <button key={o.code} type="button" role="checkbox" aria-checked={activo}
            onClick={() => alCambiar(activo ? valor.filter(x => x !== o.code) : [...valor, o.code])}
            className={`w-full min-h-[52px] px-4 py-2.5 rounded-2xl text-[15px] font-semibold border-2 text-left flex items-center gap-3 transition active:scale-[0.99] ${activo ? 'bg-[#14532d] border-[#14532d] text-white shadow-md' : 'bg-white border-slate-300 text-slate-800'}`}>
            <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${activo ? 'bg-white border-white' : 'border-slate-400'}`}>
              {activo && <svg viewBox="0 0 12 12" width="14" height="14" fill="none" stroke="#14532d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5 5 9.5 10 3" /></svg>}
            </span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Contador con botones − / +. */
export function Contador({ valor, alCambiar, min = 1, max = 99 }: { valor: number; alCambiar: (v: number) => void; min?: number; max?: number }) {
  const btn = 'w-14 h-14 rounded-2xl border-2 border-slate-200 bg-white flex items-center justify-center text-slate-700 active:scale-95 disabled:opacity-30';
  return (
    <div className="flex items-center gap-4">
      <button type="button" aria-label="Menos" className={btn} disabled={valor <= min} onClick={() => alCambiar(valor - 1)}><Minus size={22} /></button>
      <span className="min-w-[48px] text-center text-[26px] font-bold text-slate-900" aria-live="polite">{valor}</span>
      <button type="button" aria-label="Más" className={btn} disabled={valor >= max} onClick={() => alCambiar(valor + 1)}><Plus size={22} /></button>
    </div>
  );
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'ambar' | 'rojo' | 'verde'; children: ReactNode }) {
  const est = {
    info: 'bg-sky-50 border-sky-200 text-sky-900', ambar: 'bg-amber-50 border-amber-200 text-amber-900',
    rojo: 'bg-red-50 border-red-200 text-red-800', verde: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  }[tipo];
  const Icono = tipo === 'info' || tipo === 'verde' ? Info : AlertTriangle;
  return (
    <div role={tipo === 'rojo' ? 'alert' : undefined} className={`rounded-2xl border px-4 py-3 text-[14px] leading-snug flex items-start gap-2.5 ${est}`}>
      <Icono size={16} className="mt-0.5 flex-shrink-0" /><div>{children}</div>
    </div>
  );
}

export function Tarjeta({ titulo, acciones, children }: { titulo?: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
      {(titulo || acciones) && (
        <div className="flex items-center justify-between mb-3">
          {titulo && <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-[0.1em]">{titulo}</h3>}
          {acciones}
        </div>
      )}
      {children}
    </section>
  );
}

/** Lista con buscador para elegir una opción entre muchas (variedades). */
export function ListaBuscable({ valor, alCambiar, opciones, vacio, error }: {
  valor: string; alCambiar: (v: string) => void; opciones: { code: string; label: string }[]; vacio: string; error?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const actual = opciones.find(o => o.code === valor);
  const visibles = opciones.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <button type="button" onClick={() => { setQ(''); setAbierto(true); }}
        className={`${claseInput(error)} text-left flex items-center justify-between`}>
        <span className={actual ? 'text-slate-900' : 'text-slate-300'}>{actual ? actual.label : vacio}</span>
        <ChevronDown size={18} className="text-slate-400" />
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[10000] bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={vacio}>
          <div className="flex items-center gap-2 p-3 border-b border-slate-100" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
                className="w-full min-h-[50px] bg-slate-50 rounded-2xl pl-11 pr-4 text-[16px] outline-none" />
            </div>
            <button type="button" aria-label="Cerrar" onClick={() => setAbierto(false)} className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {visibles.length === 0 && <p className="p-6 text-slate-400 text-center">Sin resultados</p>}
            {visibles.map(o => (
              <button key={o.code} type="button" onClick={() => { alCambiar(o.code); setAbierto(false); }}
                className={`w-full px-5 py-4 text-left text-[16px] ${o.code === valor ? 'bg-[#eef8f2] font-bold text-[#0f3f26]' : 'text-slate-800'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
