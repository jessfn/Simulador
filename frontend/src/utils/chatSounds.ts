// Sonidos sintetizados (Web Audio API) para el chat de ayuda — sin depender
// de archivos de audio externos. Un "swoosh" ascendente al enviar (como
// WhatsApp) y un "pop" descendente de dos notas al recibir.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, peak = 0.16) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSentSound() {
  const c = getCtx();
  if (!c) return;
  tone(c, 720, 0, 0.09);
  tone(c, 1040, 0.06, 0.12);
}

export function playReceivedSound() {
  const c = getCtx();
  if (!c) return;
  tone(c, 900, 0, 0.1);
  tone(c, 680, 0.09, 0.15);
}

/** Desbloquea el audio ante el primer gesto del usuario (política de autoplay). */
export function desbloquearAudio() {
  getCtx();
}
