// Tiny synthesized sound effects via WebAudio (no asset files needed).

let ctx = null;

export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq = 440, to = freq, dur = 0.15, type = 'sine', vol = 0.25, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur = 0.3, vol = 0.4) {
  if (!ctx) return;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

export const sfx = {
  bump: () => tone({ freq: 260, to: 380, dur: 0.12, type: 'sine', vol: 0.25 }),
  hit: () => { tone({ freq: 300, to: 620, dur: 0.14, type: 'triangle', vol: 0.3 }); noise(0.05, 0.15); },
  kick: () => { tone({ freq: 140, to: 900, dur: 0.3, type: 'square', vol: 0.18 }); noise(0.08, 0.25); },
  jump: () => tone({ freq: 420, to: 700, dur: 0.1, type: 'sine', vol: 0.12 }),
  dash: () => { noise(0.18, 0.18); tone({ freq: 200, to: 520, dur: 0.16, type: 'sine', vol: 0.1 }); },
  combo: (n) => tone({ freq: 500 + n * 80, to: 800 + n * 80, dur: 0.12, type: 'triangle', vol: 0.15, delay: 0.05 }),
  pop: () => { noise(0.4, 0.6); tone({ freq: 900, to: 80, dur: 0.35, type: 'sawtooth', vol: 0.15 }); },
  count: (last) => tone({ freq: last ? 880 : 440, dur: last ? 0.35 : 0.15, type: 'square', vol: 0.12 }),
};
