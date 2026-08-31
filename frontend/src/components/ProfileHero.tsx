import { type ReactNode, useEffect, useRef } from 'react';
import { ChevronLeft, Warehouse, Sprout, ClipboardCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  titulo: string;
  nombre: string;
  initials: string;
  back?: string | number;
  badges?: ReactNode;
  meta?: string;
  variant?: 'productor' | 'bodega' | 'tecnico';
}

/* ── Canvas de fondo animado (solo dentro del hero verde) ─────────────── */
function HeroCanvas({ variant }: { variant: 'productor' | 'bodega' | 'tecnico' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let W = 0, H = 0;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width  = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    /* ── Partículas principales (3 capas de profundidad) ──
       depth 0 = fondo (pequeñas, lentas, tenues)
       depth 2 = frente (grandes, rápidas, más visibles) */
    interface P {
      x: number; y: number; s: number;
      vy: number; swayAmp: number; swaySpd: number;
      rot: number; vr: number;
      op: number; ph: number; depth: number;
      kind: number;           // subtipo de figura
      squeeze: number;        // deformación orgánica de la hoja
    }

    const makeP = (depth: number, spawnBottom = false): P => {
      const dScale = 0.55 + depth * 0.45;
      return {
        x: Math.random(),
        y: spawnBottom ? rnd(1.0, 1.15) : Math.random(),
        s: rnd(4, 8) * dScale,
        vy: -rnd(0.00010, 0.00022) * dScale,
        swayAmp: rnd(6, 18) * dScale,
        swaySpd: rnd(0.006, 0.013),
        rot: Math.random() * Math.PI * 2,
        vr: rnd(-0.012, 0.012),
        op: (0.04 + Math.random() * 0.08) * (0.6 + depth * 0.35),
        ph: Math.random() * Math.PI * 2,
        depth,
        kind: Math.floor(Math.random() * 3),
        squeeze: rnd(0.7, 1.0),
      };
    };

    const parts: P[] = [];
    for (let d = 0; d < 3; d++)
      for (let i = 0; i < (d === 0 ? 10 : d === 1 ? 8 : 6); i++)
        parts.push(makeP(d));

    /* ── Motas de polen / polvo brillante (ambos roles) ── */
    interface Mote { x: number; y: number; r: number; ph: number; spd: number; drift: number; }
    const motes: Mote[] = Array.from({ length: 22 }, () => ({
      x: Math.random(), y: Math.random(),
      r: rnd(0.6, 1.8),
      ph: Math.random() * Math.PI * 2,
      spd: rnd(0.008, 0.02),
      drift: rnd(-0.00004, 0.00004),
    }));

    /* ── Figuras del PRODUCTOR ── */
    // Hoja con curvatura orgánica, nervadura central y nervaduras laterales
    const drawHoja = (s: number, sq: number, a: number) => {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * sq, -s * 0.55, s * sq * 0.85, s * 0.45, 0, s);
      ctx.bezierCurveTo(-s * sq * 0.85, s * 0.45, -s * sq, -s * 0.55, 0, -s);
      ctx.fill();
      // nervadura central
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.85);
      ctx.quadraticCurveTo(s * 0.08, 0, 0, s * 0.85);
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.4})`;
      ctx.stroke();
      // nervaduras laterales
      ctx.lineWidth = 0.45;
      for (let i = -1; i <= 1; i += 2) {
        for (let j = 0; j < 3; j++) {
          const yy = -s * 0.45 + j * s * 0.38;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.quadraticCurveTo(i * s * 0.3, yy + s * 0.12, i * s * 0.5 * sq, yy + s * 0.22);
          ctx.stroke();
        }
      }
    };

    // Espiga de trigo: tallo con granos alternados
    const drawEspiga = (s: number, a: number) => {
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.2})`;
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.quadraticCurveTo(s * 0.15, 0, 0, -s);
      ctx.stroke();
      for (let j = 0; j < 4; j++) {
        const yy = -s + j * s * 0.42;
        for (let i = -1; i <= 1; i += 2) {
          ctx.beginPath();
          ctx.ellipse(i * s * 0.22, yy, s * 0.2, s * 0.34, i * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    // Semilla / brote pequeño
    const drawSemilla = (s: number) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.35, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.55);
      ctx.quadraticCurveTo(s * 0.5, -s * 1.1, s * 0.75, -s * 0.85);
      ctx.lineWidth = 0.7;
      ctx.stroke();
    };

    /* ── Figuras de la BODEGA ── */
    // Caja isométrica 3D con tapa iluminada
    const drawCaja3D = (s: number, a: number) => {
      const h = s * 0.85;
      // cara superior (más clara)
      ctx.fillStyle = `rgba(255,255,255,${a * 1.5})`;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.lineTo(s, -h * 0.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-s, -h * 0.5);
      ctx.closePath();
      ctx.fill();
      // cara izquierda
      ctx.fillStyle = `rgba(255,255,255,${a * 0.85})`;
      ctx.beginPath();
      ctx.moveTo(-s, -h * 0.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, h);
      ctx.lineTo(-s, h * 0.5);
      ctx.closePath();
      ctx.fill();
      // cara derecha (más oscura)
      ctx.fillStyle = `rgba(255,255,255,${a * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(s, -h * 0.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, h);
      ctx.lineTo(s, h * 0.5);
      ctx.closePath();
      ctx.fill();
      // fleje central
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.2})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -h * 0.75);
      ctx.lineTo(s * 0.5, -h * 0.25);
      ctx.stroke();
    };

    // Hexágono con núcleo (nodo logístico)
    const drawHex = (s: number, a: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(ang) * s, py = Math.sin(ang) * s;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.3})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
    };

    // Pallet: rejilla de listones
    const drawPallet = (s: number, a: number) => {
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.1})`;
      ctx.lineWidth = 0.8;
      const w = s * 1.3, hh = s * 0.9;
      ctx.strokeRect(-w / 2, -hh / 2, w, hh);
      ctx.beginPath();
      ctx.moveTo(-w / 2, -hh / 6); ctx.lineTo(w / 2, -hh / 6);
      ctx.moveTo(-w / 2, hh / 6);  ctx.lineTo(w / 2, hh / 6);
      ctx.moveTo(0, -hh / 2);      ctx.lineTo(0, hh / 2);
      ctx.stroke();
    };

    /* ── Figuras del TÉCNICO ECA (registro en campo) ── */
    // Pin de ubicación con núcleo — parcela geolocalizada
    const drawPin = (s: number, a: number) => {
      ctx.beginPath();
      ctx.moveTo(0, s * 1.1);
      ctx.bezierCurveTo(s * 0.85, s * 0.15, s * 0.8, -s * 0.75, 0, -s * 0.85);
      ctx.bezierCurveTo(-s * 0.8, -s * 0.75, -s * 0.85, s * 0.15, 0, s * 1.1);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.2})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.25, s * 0.32, 0, Math.PI * 2);
      ctx.fill();
    };

    // Portapapeles con palomita — registro capturado
    const drawClipboard = (s: number, a: number) => {
      const w = s * 1.1, h = s * 1.35;
      ctx.lineWidth = 0.85;
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.15})`;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      // clip superior
      ctx.beginPath();
      ctx.rect(-w * 0.22, -h / 2 - s * 0.14, w * 0.44, s * 0.22);
      ctx.stroke();
      // palomita
      ctx.beginPath();
      ctx.moveTo(-w * 0.22, h * 0.02);
      ctx.lineTo(-w * 0.04, h * 0.22);
      ctx.lineTo(w * 0.28, -h * 0.2);
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    // Objetivo/GPS — precisión de captura
    const drawTarget = (s: number, a: number) => {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(255,255,255,${a * 1.2})`;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.15); ctx.lineTo(0, -s * 0.95);
      ctx.moveTo(0, s * 0.95);  ctx.lineTo(0, s * 1.15);
      ctx.moveTo(-s * 1.15, 0); ctx.lineTo(-s * 0.95, 0);
      ctx.moveTo(s * 0.95, 0);  ctx.lineTo(s * 1.15, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    };

    let t = 0;
    const tick = () => {
      t += 1;
      ctx.clearRect(0, 0, W, H);

      /* halo respirante detrás del avatar (centro-arriba) */
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.011);
      const g = ctx.createRadialGradient(W / 2, H * 0.34, 10, W / 2, H * 0.34, W * 0.34);
      g.addColorStop(0, `rgba(255,255,255,${0.045 + breathe * 0.03})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      /* motas de polvo brillante con parpadeo suave */
      for (const m of motes) {
        m.y -= 0.00008;
        m.x += m.drift + Math.sin(t * 0.006 + m.ph) * 0.00003;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        const tw = 0.5 + 0.5 * Math.sin(t * m.spd * 3 + m.ph);
        ctx.beginPath();
        ctx.arc(m.x * W, m.y * H, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.05 + tw * 0.11})`;
        ctx.fill();
        // destello cruzado en las motas más brillantes
        if (tw > 0.82 && m.r > 1.2) {
          ctx.strokeStyle = `rgba(255,255,255,${(tw - 0.82) * 0.5})`;
          ctx.lineWidth = 0.6;
          const cx = m.x * W, cy = m.y * H, len = m.r * 3.2;
          ctx.beginPath();
          ctx.moveTo(cx - len, cy); ctx.lineTo(cx + len, cy);
          ctx.moveTo(cx, cy - len); ctx.lineTo(cx, cy + len);
          ctx.stroke();
        }
      }

      /* red de conexiones (bodega y técnico): líneas entre partículas cercanas */
      if (variant === 'bodega' || variant === 'tecnico') {
        const front = parts.filter(p => p.depth === 2);
        ctx.lineWidth = 0.5;
        for (let i = 0; i < front.length; i++) {
          for (let j = i + 1; j < front.length; j++) {
            const dx = (front[i].x - front[j].x) * W;
            const dy = (front[i].y - front[j].y) * H;
            const d = Math.hypot(dx, dy);
            if (d < 130) {
              const la = (1 - d / 130) * 0.07;
              ctx.strokeStyle = `rgba(255,255,255,${la})`;
              ctx.beginPath();
              ctx.moveTo(front[i].x * W, front[i].y * H);
              ctx.lineTo(front[j].x * W, front[j].y * H);
              ctx.stroke();
              // pulso viajando por la línea
              const pt = (t * 0.012 + i * 0.7) % 1;
              ctx.beginPath();
              ctx.arc(front[i].x * W + dx * -0 + (front[j].x - front[i].x) * W * pt,
                      front[i].y * H + (front[j].y - front[i].y) * H * pt,
                      1.1, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255,255,255,${la * 3})`;
              ctx.fill();
            }
          }
        }
      }

      /* partículas principales por capa (fondo → frente) */
      for (let d = 0; d < 3; d++) {
        for (const p of parts) {
          if (p.depth !== d) continue;
          p.y += p.vy;
          p.rot += p.vr + Math.sin(t * 0.004 + p.ph) * 0.002;
          const swayX = Math.sin(t * p.swaySpd + p.ph) * p.swayAmp;

          if (p.y * H < -26) Object.assign(p, makeP(p.depth, true));

          const flick = p.op * (0.7 + 0.3 * Math.sin(t * 0.017 + p.ph));
          ctx.save();
          ctx.translate(p.x * W + swayX, p.y * H);
          // vaivén de balanceo tipo péndulo (hoja cayendo/flotando)
          ctx.rotate(p.rot + Math.sin(t * p.swaySpd + p.ph) * 0.25);
          ctx.fillStyle   = `rgba(255,255,255,${flick})`;
          ctx.strokeStyle = `rgba(255,255,255,${flick})`;

          if (variant === 'productor') {
            if (p.kind === 0)      drawHoja(p.s * 1.15, p.squeeze, flick);
            else if (p.kind === 1) drawEspiga(p.s * 1.1, flick);
            else                   drawSemilla(p.s);
          } else if (variant === 'tecnico') {
            if (p.kind === 0)      drawPin(p.s * 0.9, flick);
            else if (p.kind === 1) drawClipboard(p.s * 0.85, flick);
            else                   drawTarget(p.s * 0.85, flick);
          } else {
            if (p.kind === 0)      drawCaja3D(p.s * 0.95, flick);
            else if (p.kind === 1) drawHex(p.s * 0.9, flick);
            else                   drawPallet(p.s, flick);
          }
          ctx.restore();
        }
      }

      /* ondas de luz en la base — doble capa con desfase */
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        const base = H * (0.74 + i * 0.075);
        ctx.moveTo(0, base);
        for (let x = 0; x <= W; x += 6) {
          ctx.lineTo(x, base
            + Math.sin(x * 0.011 + t * 0.016 + i * 2.1) * 7
            + Math.sin(x * 0.023 - t * 0.011 + i) * 3);
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.055 - i * 0.015})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }

      /* destello diagonal que barre lentamente el hero */
      const sweep = ((t * 0.0016) % 1.6) - 0.3;
      const sg = ctx.createLinearGradient(W * (sweep - 0.12), 0, W * (sweep + 0.12), H * 0.4);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.028)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [variant]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}

export default function ProfileHero({ titulo, nombre, initials, back, badges, meta, variant = 'bodega' }: Props) {
  const navigate = useNavigate();

  return (
    <div className="relative w-full overflow-hidden bg-gradient-to-br from-[#1A5C38] via-[#1e6b42] to-[#22733f]">
      {/* Círculos decorativos */}
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/[0.04] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/[0.03] pointer-events-none" />
      <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[340px] h-[340px] rounded-full bg-white/[0.025] pointer-events-none" />

      {/* Canvas animado según rol */}
      <HeroCanvas variant={variant} />

      {/* Botón volver */}
      {back !== undefined && (
        <button
          onClick={() => typeof back === 'number' ? navigate(back as number) : navigate(back as string)}
          className="absolute top-4 left-4 flex items-center gap-1 text-green-200/80 text-[13px] font-semibold z-10 active:opacity-60 transition-opacity"
        >
          <ChevronLeft size={18} strokeWidth={2.5} className="-ml-1" />
          Volver
        </button>
      )}

      {/* Contenido centrado */}
      <div
        className="relative flex flex-col items-center text-center px-6 pb-8"
        style={{ paddingTop: back !== undefined ? '3.5rem' : '1.5rem' }}
      >
        {/* "Mi Perfil" — primero arriba de todo */}
        <p
          className="text-[11px] sm:text-[12px] font-semibold text-white/45 uppercase tracking-[0.22em] mb-3"
          style={{ animation: 'phFadeUp .28s ease both', fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif", letterSpacing: '0.22em' }}
        >
          {titulo}
        </p>

        {/* Badge de rol */}
        <div
          className="flex items-center gap-1.5 mb-5"
          style={{ animation: 'phFadeUp .3s .07s ease both' }}
        >
          <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11.5px] font-semibold tracking-wide border backdrop-blur-sm
            ${variant === 'productor'
              ? 'bg-emerald-400/15 border-emerald-300/25 text-emerald-100'
              : variant === 'tecnico'
              ? 'bg-amber-400/15 border-amber-300/25 text-amber-100'
              : 'bg-sky-400/15 border-sky-300/25 text-sky-100'}`}
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            {variant === 'productor'
              ? <Sprout size={12} strokeWidth={2} />
              : variant === 'tecnico'
              ? <ClipboardCheck size={12} strokeWidth={2} />
              : <Warehouse size={12} strokeWidth={2} />}
            {variant === 'productor' ? 'Productor agrícola' : variant === 'tecnico' ? 'Técnico ECA' : 'Bodega / Industria'}
          </div>
        </div>

        {/* Avatar — círculo */}
        <div
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/15 backdrop-blur-sm ring-[3px] ring-white/30 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.3)] mb-5"
          style={{ animation: 'phPop .45s cubic-bezier(0.34,1.56,0.64,1) .1s both' }}
        >
          <span className="text-white text-[26px] sm:text-[30px] font-bold tracking-tight select-none"
            style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}>
            {initials}
          </span>
        </div>

        {/* Nombre */}
        <h1
          className="text-[21px] sm:text-[24px] text-white leading-snug max-w-xs sm:max-w-sm"
          style={{
            animation: 'phFadeUp .35s .18s ease both',
            fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}
        >
          {nombre}
        </h1>

        {/* Meta (email, curp, etc.) */}
        {meta && (
          <p
            className="text-green-200/60 text-[12px] sm:text-[13px] font-medium mt-1.5 truncate max-w-[240px]"
            style={{ animation: 'phFadeUp .35s .22s ease both' }}
          >
            {meta}
          </p>
        )}

        {/* Badges */}
        {badges && (
          <div
            className="flex items-center gap-2 mt-3.5 flex-wrap justify-center"
            style={{ animation: 'phFadeUp .35s .27s ease both' }}
          >
            {badges}
          </div>
        )}
      </div>

      {/* Curva inferior suave */}
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-[#eef8f2] rounded-t-[24px]" />

      <style>{`
        @keyframes phPop     { from { opacity:0; transform:scale(0.75) } to { opacity:1; transform:scale(1) } }
        @keyframes phFadeUp  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      `}</style>
    </div>
  );
}
