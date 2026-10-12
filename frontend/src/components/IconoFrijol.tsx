// Icono de frijol (el mismo trazo del inicio de SIMAC) con degradado suave: tonos tierra y crema.
export const TRAZO_FRIJOL = 'M14 30c0-9 6-16 17-18 5 7 2 18-6 24-4 3-9 1-11-6ZM22 24c2-3 5-5 8-6';

export default function IconoFrijol({ className = '', gradiente = true }: { className?: string; gradiente?: boolean }) {
  return (
    <svg
      viewBox="11 9 25 30"
      fill="none"
      className={className}
      role="img"
      aria-label="Frijol"
      style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))' }}
    >
      {gradiente && (
        <defs>
          <linearGradient id="frijol-grad" x1="8" y1="8" x2="40" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f6dfb4" />
            <stop offset="0.55" stopColor="#e8b98a" />
            <stop offset="1" stopColor="#c98b7a" />
          </linearGradient>
        </defs>
      )}
      <path
        d={TRAZO_FRIJOL}
        stroke={gradiente ? 'url(#frijol-grad)' : 'currentColor'}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
