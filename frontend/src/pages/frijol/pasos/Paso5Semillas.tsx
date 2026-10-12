import { Campo, SiNo, Tarjeta } from '../ui';
import type { Borrador, Semillas } from '../tipos';
import type { Errores } from '../validacion';

interface Props {
  b: Borrador;
  actualizar: (fn: (b: Borrador) => Borrador) => void;
  errores: Errores;
}

// Paso 5 de 7 — Semillas. Tres preguntas Sí/No para todas las parcelas. El sistema calcula solo si cumple el criterio.
export default function Paso5Semillas({ b, actualizar, errores }: Props) {
  const s = b.semillas;
  const set = (parche: Partial<Semillas>) => actualizar(prev => ({ ...prev, semillas: { ...prev.semillas, ...parche } }));
  return (
    <Tarjeta>
      <div className="space-y-6">
        <Campo etiqueta="¿Usted se dedica o se ha dedicado con anterioridad a la producción de semillas?" error={errores.dedica}>
          <SiNo valor={s.dedica} alCambiar={v => set({ dedica: v })} />
        </Campo>
        <Campo etiqueta="¿Usted ha trabajado anteriormente con semillas de PROSEBIEN?" error={errores.trabajo_prosebien}>
          <SiNo valor={s.trabajo_prosebien} alCambiar={v => set({ trabajo_prosebien: v })} />
        </Campo>
        <Campo etiqueta="¿Utiliza o utilizará semillas de PROSEBIEN durante el ciclo PV de este año?" error={errores.usara_prosebien}>
          <SiNo valor={s.usara_prosebien} alCambiar={v => set({ usara_prosebien: v })} />
        </Campo>
      </div>
    </Tarjeta>
  );
}
