import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './simac-home.css';

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

// Canvas ligero: pocos nodos que flotan despacio, unidos por líneas finas.
// 30 fps máximo, se pausa si la pestaña no está visible y respeta "reducir movimiento".
function useRedCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, raf = 0, last = 0;
    let N: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const r = c!.getBoundingClientRect();
      W = r.width; H = r.height;
      c!.width = W * dpr; c!.height = H * dpr;
      x!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(26, Math.max(10, Math.round((W * H) / 38000)));
      N = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
        r: 1.4 + Math.random() * 1.6,
      }));
    }

    function draw(move: boolean) {
      const g = x!;
      g.clearRect(0, 0, W, H);
      const maxD = Math.min(210, W * 0.3);
      for (const n of N) {
        if (move) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > W) n.vx *= -1;
          if (n.y < 0 || n.y > H) n.vy *= -1;
        }
      }
      g.lineWidth = 0.8;
      for (let i = 0; i < N.length; i++) {
        for (let j = i + 1; j < N.length; j++) {
          const a = N[i], b = N[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < maxD) {
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
            g.strokeStyle = `rgba(214,255,235,${0.34 * (1 - d / maxD)})`; g.stroke();
          }
        }
      }
      g.fillStyle = 'rgba(240,210,160,.85)';
      for (const n of N) { g.beginPath(); g.arc(n.x, n.y, n.r, 0, 6.283); g.fill(); }
    }

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 33) return;
      last = ts;
      draw(true);
    };
    const start = () => {
      cancelAnimationFrame(raf); size();
      if (reduce) draw(false); else raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!reduce) raf = requestAnimationFrame(loop);
    };
    start();
    window.addEventListener('resize', start);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', start);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ref]);
}

export default function SimacHomePage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useRedCanvas(canvasRef);
  const [saliendo, setSaliendo] = useState(false);

  const irAMaiz = () => {
    if (saliendo) return;
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (sinMovimiento) { navigate('/bienvenida'); return; }
    setSaliendo(true);
    window.setTimeout(() => navigate('/bienvenida'), 220);
  };

  return (
    <div className={`sh-root${saliendo ? ' saliendo' : ''}`}>
      <main className="sh-main">
        <div className="sh-fondo" aria-hidden="true">
          <img src="/background-rye.jpg" alt="" />
          <i className="c1" /><i className="c2" /><i className="c4" />
        </div>

        <section className="sh-hero">
        <canvas ref={canvasRef} className="sh-canvas" aria-hidden="true" />

        <div className="sh-stage">
          <div className="sh-titulo sh-rise" style={{ animationDelay: '.15s' }}>
            <h1>SIMAC</h1>
          </div>
          <p className="sh-lema sh-rise" style={{ animationDelay: '.28s' }}>Sistema de Información de Mercados Agrícolas y Consulta</p>
          <div className="sh-greca sh-rise" style={{ animationDelay: '.36s' }}><span>Elige un cultivo</span></div>

          <div className="sh-cultivos sh-rise" style={{ animationDelay: '.45s' }}>
            <button className="sh-card sh-card--on" onClick={irAMaiz} aria-label="Entrar a Maíz">
              <span className="ico"><img src="/images/maiz-icono.png" alt="" /></span>
              <span className="txt">
                <span className="nombre">Maíz</span>
                <span className="tag">Disponible</span>
              </span>
              <span className="go" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </button>

            {PROXIMOS.map(c => (
              <div key={c.nombre} className="sh-card sh-card--off" aria-label={`${c.nombre}, próximamente`}>
                <span className="ico">
                  <svg viewBox="0 0 48 48" fill="none" stroke="#e3c08a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{c.icono}</svg>
                </span>
                <span className="txt">
                  <span className="nombre">{c.nombre}</span>
                  <span className="tag">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                    Próximamente
                  </span>
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
