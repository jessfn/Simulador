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

// Fondo suave y ligero: unos pocos orbes de luz verde tenue que flotan y algunas partículas.
// 30 fps máximo, resolución interna baja (son formas difusas), se pausa si la pestaña no se ve
// y queda quieto si el dispositivo pide menos animación.
interface Orbe { fx: number; fy: number; ax: number; ay: number; px: number; py: number; r: number; c: [number, number, number]; a: number }
interface Luz { x: number; y: number; v: number; r: number; ph: number }

const ORBES: Orbe[] = [
  { fx: 0.11, fy: 0.09, ax: 0.30, ay: 0.22, px: 0.0, py: 1.2, r: 0.55, c: [52, 211, 153], a: 0.085 },
  { fx: 0.08, fy: 0.12, ax: 0.34, ay: 0.26, px: 2.1, py: 0.4, r: 0.62, c: [16, 185, 129], a: 0.075 },
  { fx: 0.13, fy: 0.07, ax: 0.26, ay: 0.30, px: 4.0, py: 2.6, r: 0.48, c: [45, 212, 191], a: 0.055 },
  { fx: 0.06, fy: 0.10, ax: 0.38, ay: 0.20, px: 5.3, py: 3.9, r: 0.38, c: [188, 149, 92], a: 0.04 },
];

function useCampoVivo(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, raf = 0, ultimo = 0, t = 0;
    let luces: Luz[] = [];
    const puntero = { x: 0, y: 0, tx: 0, ty: 0 };

    function size() {
      const dpr = 1;
      const r = c!.getBoundingClientRect();
      W = r.width; H = r.height;
      c!.width = Math.max(1, Math.round(W * dpr)); c!.height = Math.max(1, Math.round(H * dpr));
      g!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(18, Math.max(8, Math.round((W * H) / 60000)));
      luces = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        v: 0.12 + Math.random() * 0.28, r: 0.7 + Math.random() * 1.7, ph: Math.random() * 6.28,
      }));
    }

    function dibujar() {
      g!.clearRect(0, 0, W, H);
      g!.globalCompositeOperation = 'screen';
      puntero.x += (puntero.tx - puntero.x) * 0.04;
      puntero.y += (puntero.ty - puntero.y) * 0.04;
      const diag = Math.max(W, H);

      // Orbes de luz
      for (const o of ORBES) {
        const x = W * (0.5 + o.ax * Math.sin(t * o.fx * 6.283 + o.px)) + puntero.x * 26 * o.r;
        const y = H * (0.5 + o.ay * Math.cos(t * o.fy * 6.283 + o.py)) + puntero.y * 18 * o.r;
        const rad = diag * o.r;
        const grad = g!.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},${o.a})`);
        grad.addColorStop(0.55, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},${o.a * 0.35})`);
        grad.addColorStop(1, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},0)`);
        g!.fillStyle = grad;
        g!.fillRect(Math.max(0, x - rad), Math.max(0, y - rad), rad * 2, rad * 2);
      }

      // Luciérnagas
      for (const l of luces) {
        const brillo = 0.10 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.6 + l.ph));
        g!.beginPath(); g!.arc(l.x, l.y, l.r * 3.4, 0, 6.283);
        g!.fillStyle = `rgba(167,243,208,${brillo * 0.10})`; g!.fill();
        g!.beginPath(); g!.arc(l.x, l.y, l.r, 0, 6.283);
        g!.fillStyle = `rgba(236,253,245,${brillo})`; g!.fill();
      }
      g!.globalCompositeOperation = 'source-over';
    }

    function avanzar(dt: number) {
      t += dt;
      for (const l of luces) {
        l.y -= l.v * dt * 60;
        l.x += Math.sin(t * 0.8 + l.ph) * 0.18;
        if (l.y < -8) { l.y = H + 8; l.x = Math.random() * W; }
      }
    }

    const bucle = (ts: number) => {
      raf = requestAnimationFrame(bucle);
      if (ultimo && ts - ultimo < 32) return;
      const dt = Math.min(0.06, ultimo ? (ts - ultimo) / 1000 : 0.033);
      ultimo = ts;
      avanzar(dt); dibujar();
    };
    const iniciar = () => {
      cancelAnimationFrame(raf); size(); ultimo = 0;
      if (reduce) { t = 3; dibujar(); } else raf = requestAnimationFrame(bucle);
    };
    const alCambiarVisibilidad = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!reduce) { ultimo = 0; raf = requestAnimationFrame(bucle); }
    };
    const alMover = (e: PointerEvent | TouchEvent) => {
      const p = 'touches' in e ? e.touches[0] : e;
      if (!p || !W || !H) return;
      puntero.tx = (p.clientX / W - 0.5) * 2;
      puntero.ty = (p.clientY / H - 0.5) * 2;
    };
    iniciar();
    window.addEventListener('resize', iniciar);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('pointermove', alMover);
    window.addEventListener('touchmove', alMover, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', iniciar);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('touchmove', alMover);
    };
  }, [ref]);
}

export default function SimacHomePage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCampoVivo(canvasRef);
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
