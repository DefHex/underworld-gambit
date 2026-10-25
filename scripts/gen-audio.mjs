// Generates original placeholder sound effects and music loops (no third-party assets).
// Replace any file in public/audio with a CC0 recording of the same name to upgrade it.
import { writeFileSync } from 'node:fs';

const SR = 22050;
const TAU = Math.PI * 2;
let seed = 12345;
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

const make = (sec, fn) => Array.from({ length: Math.floor(sec * SR) }, (_, i) => fn(i / SR, i));
const env = (t, a, d) => Math.min(t / a, 1) * Math.exp(-t / d);

wav('select', make(0.09, (t) => Math.sin(TAU * 880 * t) * env(t, 0.003, 0.03)));
wav('ui', make(0.05, (t) => Math.sin(TAU * 1320 * t) * env(t, 0.002, 0.015)));
wav('move', make(0.14, (t) => (rnd() * 0.5 + Math.sin(TAU * 190 * t)) * env(t, 0.002, 0.03)));
wav('capture', make(0.3, (t) => (rnd() * 0.6 + Math.sin(TAU * 110 * t) * 1.2) * env(t, 0.002, 0.07)));
wav('fall', make(1.1, (t) => {
  const f = 320 * Math.exp(-t * 2.6) + 40;
  const crackle = rnd() * (Math.sin(TAU * 23 * t) > 0.6 ? 1 : 0.1) * Math.exp(-t * 3);
  return (Math.sin(TAU * f * t) * 1.0 + crackle * 0.8 + Math.sin(TAU * 52 * t) * 0.6) * env(t, 0.01, 0.55);
}));
wav('rise', make(1.0, (t) => {
  const f = 180 + 1100 * (t / 1.0) ** 1.6;
  const shimmer = Math.sin(TAU * (f * 2.01) * t) * 0.35 + Math.sin(TAU * (f * 3.02) * t) * 0.15;
  return (Math.sin(TAU * f * t) + shimmer) * Math.min(t / 0.05, 1) * Math.exp(-Math.max(0, t - 0.55) * 5) * 0.8;
}));
wav('destroy', make(0.5, (t) => (rnd() * 0.7 + Math.sin(TAU * 70 * t)) * env(t, 0.003, 0.1)));
wav('check', make(0.5, (t) => (t < 0.22 ? Math.sin(TAU * 520 * t) : Math.sin(TAU * 780 * (t - 0.22))) * (t < 0.22 ? 1 : 0.9) * env(t % 0.22, 0.004, 0.12)));
wav('mate', make(2.2, (t) => {
  let s = 0;
  for (const [f, a] of [[98, 1], [147, 0.6], [196, 0.45], [247, 0.3]]) s += Math.sin(TAU * f * t) * a;
  return s * env(t, 0.01, 0.9);
}));

// Music: 16 s seamless loops. Every frequency is a whole number of Hz so the loop closes cleanly.
const L = 16;
wav('music_over', make(L, (t) => {
  let s = 0;
  const chords = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 330]];
  const c = chords[Math.floor(t / 4) % 4];
  for (const f of c) s += Math.sin(TAU * f * t) * 0.3;
  s *= 0.5 + 0.5 * Math.sin(TAU * ((t % 4) / 4) * 0.5 + 0.0) ** 2;
  s += Math.sin(TAU * 110 * t) * 0.25;
  return s;
}));
wav('music_under', make(L, (t) => {
  const lfo = 0.6 + 0.4 * Math.sin(TAU * (2 / L) * t);
  return (Math.sin(TAU * 55 * t) * 0.8 + Math.sin(TAU * 82 * t) * 0.4 * lfo + Math.sin(TAU * 110 * t + Math.sin(TAU * (4 / L) * t) * 2) * 0.25 + Math.sin(TAU * 233 * t) * 0.08 * lfo);
}));
console.log('audio written');
