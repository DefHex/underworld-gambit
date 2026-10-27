// More placeholder sound effects, synthesized from scratch (no third-party audio).
// Run after gen-audio.mjs, or via `node scripts/gen-sfx.mjs`. Any file in public/audio can be replaced
// by a CC0 recording with the same name (.ogg is tried before .wav).
import { writeFileSync } from 'node:fs';

const SR = 22050;
const TAU = Math.PI * 2;
let seed = 987654;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function wav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let peak = 0; for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 0.85 / peak : 1;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), 44 + i * 2);
  writeFileSync(`public/audio/${name}.wav`, buf);
}

const N = (sec) => Math.floor(sec * SR);
const make = (sec, fn) => Array.from({ length: N(sec) }, (_, i) => fn(i / SR, i));
const env = (t, a, d) => Math.min(t / a, 1) * Math.exp(-t / d);
const noise = (sec) => make(sec, () => rnd());
/** One-pole lowpass; `a` may be a function of time for a filter sweep. */
const lowpass = (xs, a) => { let y = 0; return xs.map((x, i) => { const k = typeof a === 'function' ? a(i / SR) : a; y += k * (x - y); return y; }); };
const highpass = (xs, a) => { const l = lowpass(xs, a); return xs.map((x, i) => x - l[i]); };
const mix = (...ls) => Array.from({ length: Math.max(...ls.map((l) => l.length)) }, (_, i) => ls.reduce((s, l) => s + (l[i] ?? 0), 0));
const shape = (xs, fn) => xs.map((x, i) => x * fn(i / SR));
const tone = (f, t) => Math.sin(TAU * f * t);
const note = (xs, start, f, len, gain = 1, decay = 0.25) => { // adds a decaying tone at `start` seconds
  for (let i = 0; i < N(len); i++) { const t = i / SR; const j = N(start) + i; if (j < xs.length) xs[j] += (tone(f, t) + 0.35 * tone(f * 2, t) + 0.15 * tone(f * 3, t)) * env(t, 0.006, decay) * gain; }
};

wav('explosion', mix(
  shape(lowpass(noise(1.1), 0.22), (t) => env(t, 0.003, 0.32)),
  make(1.1, (t) => tone(95 * Math.exp(-t * 2.2) + 32, t) * env(t, 0.004, 0.45) * 1.3),
  shape(highpass(noise(0.2), 0.4), (t) => env(t, 0.001, 0.02) * 0.9),
));

wav('rocket', mix(
  shape(lowpass(noise(1.2), (t) => 0.04 + 0.34 * Math.min(1, t / 0.9)), (t) => Math.min(t / 0.12, 1) * Math.exp(-Math.max(0, t - 0.7) * 3.2)),
  make(1.2, (t) => tone(62 + 40 * t, t) * 0.5 * Math.min(t / 0.1, 1) * Math.exp(-Math.max(0, t - 0.6) * 3)),
));

wav('chute', mix(
  shape(lowpass(noise(0.4), 0.45), (t) => env(t, 0.012, 0.1)),
  make(0.4, (t) => tone(110, t) * env(t, 0.01, 0.09) * 0.7),
));

wav('engine', mix(
  make(0.9, (t) => (((t * 38) % 1) * 2 - 1) * 0.5 * (0.7 + 0.3 * tone(14, t))),
  shape(lowpass(noise(0.9), 0.08), () => 0.7),
).map((x, i) => x * Math.min(i / SR / 0.15, 1) * Math.min((N(0.9) - i) / SR / 0.2, 1)));

wav('cannon', mix(
  shape(highpass(noise(0.12), 0.35), (t) => env(t, 0.0008, 0.015) * 1.1),
  make(0.8, (t) => tone(130 * Math.exp(-t * 4) + 38, t) * env(t, 0.003, 0.2) * 1.2),
  shape(lowpass(noise(0.8), 0.18), (t) => env(t, 0.002, 0.2) * 0.8),
));

wav('gallop', (() => {
  const xs = new Array(N(0.8)).fill(0);
  for (const [at, g] of [[0, 1], [0.15, 0.8], [0.32, 1], [0.46, 0.85], [0.64, 1]]) {
    for (let i = 0; i < N(0.14); i++) {
      const t = i / SR; const j = N(at) + i;
      xs[j] += (tone(150 * Math.exp(-t * 18) + 70, t) + rnd() * 0.25 * Math.exp(-t * 90)) * env(t, 0.002, 0.04) * g;
    }
  }
  return xs;
})());

wav('whip', mix(
  shape(highpass(noise(0.14), 0.3), (t) => Math.min(t / 0.1, 1) * 0.45),
  (() => { const xs = new Array(N(0.42)).fill(0); for (let i = 0; i < N(0.3); i++) { const t = i / SR; xs[N(0.12) + i] = (rnd() * Math.exp(-t / 0.012) + tone(3400, t) * Math.exp(-t / 0.02) * 0.6) * 1.2; } return xs; })(),
));

wav('slash', mix(
  shape(highpass(lowpass(noise(0.3), (t) => 0.7 - 0.5 * (t / 0.3)), 0.25), (t) => Math.sin(Math.min(1, t / 0.3) * Math.PI) * 0.9),
  make(0.3, (t) => tone(3200, t) * env(t, 0.004, 0.06) * 0.35),
));

wav('zap', shape(mix(
  make(0.6, (t) => (tone(58, t) > 0 ? 0.5 : -0.5)),
  shape(highpass(noise(0.6), 0.5), (t) => (Math.sin(TAU * 41 * t) > 0.2 ? 1 : 0.1)),
), (t) => Math.min(t / 0.01, 1) * Math.exp(-t / 0.3)));

wav('stomp', mix(
  make(0.5, (t) => tone(78 * Math.exp(-t * 6) + 38, t) * env(t, 0.003, 0.13) * 1.2),
  shape(lowpass(noise(0.5), 0.2), (t) => env(t, 0.002, 0.07)),
));

wav('smack', mix(
  shape(highpass(noise(0.25), 0.35), (t) => env(t, 0.001, 0.025)),
  make(0.25, (t) => tone(210 * Math.exp(-t * 14) + 90, t) * env(t, 0.002, 0.05)),
));

wav('thud', mix(
  make(0.45, (t) => tone(100 * Math.exp(-t * 7) + 45, t) * env(t, 0.004, 0.16)),
  shape(lowpass(noise(0.45), 0.12), (t) => env(t, 0.003, 0.09) * 0.8),
));

wav('fire', mix(
  shape(lowpass(noise(1.0), 0.13), (t) => Math.min(t / 0.1, 1) * Math.exp(-Math.max(0, t - 0.5) * 2.2) * 0.8),
  shape(highpass(noise(1.0), 0.6), (t) => (Math.abs(rnd()) > 0.93 ? 1 : 0) * 0.7 * Math.exp(-Math.max(0, t - 0.6) * 2)),
));

wav('whoosh', shape(lowpass(noise(0.32), (t) => 0.08 + 0.4 * Math.sin(Math.min(1, t / 0.32) * Math.PI)), (t) => Math.sin(Math.min(1, t / 0.32) * Math.PI) * 0.9));

wav('clang', (() => {
  const xs = new Array(N(0.7)).fill(0);
  for (const [f, d, g] of [[520, 0.4, 1], [1360, 0.25, 0.6], [2210, 0.15, 0.45], [3100, 0.1, 0.3]]) {
    for (let i = 0; i < xs.length; i++) { const t = i / SR; xs[i] += tone(f, t) * env(t, 0.001, d) * g; }
  }
  return xs;
})());

wav('promote', (() => {
  const xs = new Array(N(0.9)).fill(0);
  [523, 659, 784, 1047].forEach((f, i) => note(xs, i * 0.1, f, 0.5, 0.7, 0.22));
  for (let i = 0; i < xs.length; i++) { const t = i / SR; xs[i] += tone(2093, t) * env(t, 0.2, 0.2) * 0.12; }
  return xs;
})());

wav('castle', (() => {
  const xs = new Array(N(0.4)).fill(0);
  for (const at of [0, 0.15]) for (let i = 0; i < N(0.1); i++) { const t = i / SR; xs[N(at) + i] += (tone(310 * Math.exp(-t * 20) + 190, t) + rnd() * 0.3 * Math.exp(-t * 70)) * env(t, 0.001, 0.03); }
  return xs;
})());

wav('wrong', make(0.28, (t) => (tone(150 - 40 * t, t) > 0 ? 0.55 : -0.55) * env(t, 0.004, 0.1)).map((x, i, a) => x * 0.7 + (a[i - 4] ?? 0) * 0.3));

wav('victory', (() => {
  const xs = new Array(N(1.9)).fill(0);
  [[262, 0], [330, 0.17], [392, 0.34], [523, 0.52]].forEach(([f, at]) => note(xs, at, f, 0.4, 0.8, 0.3));
  for (const f of [523, 659, 784]) note(xs, 0.75, f, 1.1, 0.55, 0.7);
  return xs;
})());

wav('defeat', (() => {
  const xs = new Array(N(1.7)).fill(0);
  [[220, 0], [175, 0.3], [147, 0.6]].forEach(([f, at]) => note(xs, at, f, 0.9, 0.8, 0.5));
  note(xs, 0.6, 110, 1.0, 0.6, 0.6);
  return xs;
})());

wav('draw', (() => {
  const xs = new Array(N(1.0)).fill(0);
  note(xs, 0, 392, 0.5, 0.7, 0.3);
  note(xs, 0.25, 294, 0.7, 0.7, 0.4);
  return xs;
})());

wav('start', (() => {
  const xs = new Array(N(1.5)).fill(0);
  for (const [f, d, g] of [[98, 0.9, 1], [196, 0.6, 0.5], [294, 0.4, 0.3], [588, 0.25, 0.18]]) {
    for (let i = 0; i < xs.length; i++) { const t = i / SR; xs[i] += tone(f, t) * env(t, 0.006, d) * g; }
  }
  note(xs, 0.5, 392, 0.8, 0.35, 0.4);
  return xs;
})());

console.log('extra sound effects written');
