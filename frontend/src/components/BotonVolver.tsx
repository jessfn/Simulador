import BotonAtras from './BotonAtras';

/* Compatibilidad: las entradas de Maíz y Frijol usan este nombre; ahora es el mismo botón liquid glass de todo SIMAC. */
export default function BotonVolver({ onClick, className = '' }: { onClick: () => void; className?: string; style?: React.CSSProperties }) {
  return <BotonAtras onClick={onClick} tono="oscuro" className={className} />;
}
