import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './simac-home.css';
import MenuPublico from '../components/MenuPublico';
import CampoVivo from '../components/CampoVivo';

const CINTA = ['Precios de mercado', 'Mapa de bodegas', 'Parcelas', 'Ciclos productivos', 'Apoyos y ventanillas', 'Consulta'];
const PROXIMOS = [
  {
    nombre: 'Frijol',
    icono: <path d="M14 30c0-9 6-16 17-18 5 7 2 18-6 24-4 3-9 1-11-6ZM22 24c2-3 5-5 8-6" />,
  },
  {
    nombre: 'Trigo',
    icono: <path d="M24 44V14M24 14c-4-1-6-4-6-8 4 1 6 4 6 8Zm0 0c4-1 6-4 6-8-4 1-6 4-6 8ZM24 26c-4-1-6-4-6-8 4 1 6 4 6 8Zm0 0c4-1 6-4 6-8-4 1-6 4-6 8ZM24 38c-4-1-6-4-6-8 4 1 6 4 6 8Zm0 0c4-1 6-4 6-8-4 1-6 4-6 8Z" />,
  },
];

export default function SimacHomePage() {
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);

  const irAMaiz = () => {
    if (saliendo) return;
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento) { navigate('/maiz'); return; }
    if (typeof document.startViewTransition === 'function') { navigate('/maiz', { viewTransition: true }); return; }
    setSaliendo(true);
    window.setTimeout(() => navigate('/maiz'), 220);
  };

  return (
    <div className={`sh-root${saliendo ? ' saliendo' : ''}`}>
      <MenuPublico onEntrarMaiz={irAMaiz} />

      <main className="sh-main">
        <div className="sh-fondo" aria-hidden="true">
          <img src="/background-rye.jpg" alt="" />
          <i className="c1" /><i className="c2" /><i className="c4" />
        </div>

        <section className="sh-hero">
        <CampoVivo className="sh-canvas" />

        <div className="sh-stage">
          <div className="sh-titulo sh-rise" style={{ animationDelay: '.15s' }}>
            <h1>SIMAC</h1>
          </div>
          <p className="sh-lema sh-rise" style={{ animationDelay: '.28s' }}>Sistema de Información de Mercados Agrícolas y Consulta</p>
          <div className="sh-greca sh-rise" style={{ animationDelay: '.36s' }}><span>Elige un cultivo</span></div>

          <div className="sh-cultivos sh-rise" style={{ animationDelay: '.45s' }}>
            <button className="sh-card sh-card--on" onClick={irAMaiz} aria-label="Entrar a Maíz">
              <span className="fila">
                <img className="icono" src="/images/maiz-icono.png" alt="" />
                <span className="nombre">Maíz</span>
              </span>
              <span className="tag">Disponible</span>
              <span className="go" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </button>

            {PROXIMOS.map(c => (
              <div key={c.nombre} className="sh-card sh-card--off" aria-label={`${c.nombre}, próximamente`}>
                <span className="fila">
                  <svg className="icono" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{c.icono}</svg>
                  <span className="nombre">{c.nombre}</span>
                </span>
                <span className="tag">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                  Próximamente
                </span>
              </div>
            ))}
          </div>
        </div>
        </section>

        <div className="sh-cinta" aria-hidden="true">
          <div className="sh-pista">
            {[0, 1, 2, 3].flatMap(k => CINTA.map(t => <span key={`${k}-${t}`}>{t}</span>))}
          </div>
        </div>
      </main>

      <footer className="sh-bottom">
        <div className="in">
          <div className="sh-logos">
            <img className="gob" src="/images/gobmex.png" alt="Gobierno de México" />
            <span className="sep" />
            <img className="agri" src="/images/agricultura.png" alt="Secretaría de Agricultura y Desarrollo Rural" />
          </div>
        </div>
      </footer>
    </div>
  );
}
