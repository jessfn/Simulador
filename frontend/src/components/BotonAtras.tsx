import { ChevronLeft } from 'lucide-react';

/**
 * Botón "Volver" único de SIMAC (Maíz y Frijol: entradas, login, registro, recuperar NIP, técnico y productor).
 * Liquid glass: vidrio translúcido con desenfoque, borde de luz y brillo superior.
 *  - Siempre mide lo mismo (44 px de alto, mínimo 44 de ancho) y va en la misma posición: primer renglón de la pantalla, esquina izquierda.
 *  - `tono="oscuro"` se usa sobre fondos verdes/oscuros (vidrio blanco); `tono="claro"` sobre fondos claros (vidrio verde).
 *  - `solo icono` en pantallas muy angostas se resuelve con CSS (el texto "Volver" se oculta bajo 340 px; el botón sigue siendo de 44 px).
 */
export default function BotonAtras({ onClick, tono = 'oscuro', etiqueta = 'Volver', className = '', disabled }: {
  onClick: () => void; tono?: 'oscuro' | 'claro'; etiqueta?: string; className?: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={etiqueta} className={`boton-atras boton-atras--${tono} ${className}`}>
      <ChevronLeft size={20} strokeWidth={2.6} aria-hidden="true" />
      <span className="boton-atras__texto">{etiqueta}</span>
    </button>
  );
}
