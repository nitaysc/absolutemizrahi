// Lightweight Web Audio SFX — no asset downloads, instant playback.
// Used for snappy click feedback on gambling tiles (Mines, etc.).
let _ctx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    const AC =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
  return _ctx;
}

function tone(opts: {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  sweepTo?: number;
  delay?: number;
}) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.sweepTo),
      t0 + opts.duration,
    );
  }
  const peak = opts.gain ?? 0.18;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
}

function noise(duration: number, gain = 0.25) {
  const c = ctx();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * duration), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 1200;
  src.connect(filt).connect(g).connect(c.destination);
  src.start();
}

/** Crisp ascending chime — like Stake's gem reveal. */
export function playGem() {
  tone({ freq: 880, duration: 0.12, type: "triangle", gain: 0.18 });
  tone({ freq: 1320, duration: 0.18, type: "triangle", gain: 0.14, delay: 0.05 });
}

/** Punchy boom for hitting a bomb. */
export function playBomb() {
  tone({ freq: 180, duration: 0.45, type: "sawtooth", gain: 0.32, sweepTo: 50 });
  noise(0.35, 0.3);
}

/** Soft tick when you press a hidden tile. */
export function playTileClick() {
  tone({ freq: 520, duration: 0.06, type: "square", gain: 0.08 });
}

/** Cheery cashout sound. */
export function playCashout() {
  tone({ freq: 660, duration: 0.12, type: "triangle", gain: 0.18 });
  tone({ freq: 880, duration: 0.14, type: "triangle", gain: 0.18, delay: 0.08 });
  tone({ freq: 1175, duration: 0.2, type: "triangle", gain: 0.18, delay: 0.16 });
}