import { G } from './state.js';

/*
  SOUND — everything is synthesised live with the Web Audio API (no sound files to download).
  • Music: soft anime-style pads + arpeggio; a drum pulse fades in when zombies are chasing you.
  • Effects: swings, hits, gunshots, footsteps, groans (placed left/right by direction), pickups, rain, thunder, crickets.
  iPhone only allows audio after a tap, so unlock() is called from the first button press.
*/

let ctx = null, master, musicBus, sfxBus, ambBus, noiseBuf;
const prefs = (() => { try { return JSON.parse(localStorage.getItem('deadground.audio')) || {}; } catch { return {}; } })();
export const audioPrefs = { music: prefs.music ?? true, sfx: prefs.sfx ?? true };
export function savePrefs() { try { localStorage.setItem('deadground.audio', JSON.stringify(audioPrefs)); } catch {} applyPrefs(); }
function applyPrefs() { if (!ctx) return; musicBus.gain.value = audioPrefs.music ? 0.32 : 0; sfxBus.gain.value = audioPrefs.sfx ? 0.8 : 0; ambBus.gain.value = audioPrefs.sfx ? 0.5 : 0; }

export function unlock() {
  if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
  musicBus = ctx.createGain(); sfxBus = ctx.createGain(); ambBus = ctx.createGain();
  musicBus.connect(master); sfxBus.connect(master); ambBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyPrefs();
  startMusic(); startAmbience();
}
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });

/* ---------- Building blocks ---------- */
const now = () => ctx.currentTime;
function env(g, t, a, peak, dec, sus = 0, rel = 0.05) {
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec);
  if (!sus) g.gain.setValueAtTime(0.0001, t + a + dec + rel);
}
function out(bus, pan = 0) {
  if (!ctx.createStereoPanner || !pan) return bus;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(bus); return p;
}
function noise(dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, a = 0.005, bus = sfxBus, pan = 0, sweep = 0, t = now() } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dur);
  src.connect(f); f.connect(g); g.connect(out(bus, pan));
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.1);
}
function tone(freq, dur, { type = 'sine', gain = 0.3, a = 0.005, bus = sfxBus, pan = 0, slide = 0, t = now() } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  const g = ctx.createGain(); env(g, t, a, gain, dur);
  o.connect(g); g.connect(out(bus, pan)); o.start(t); o.stop(t + dur + 0.1);
}

/* ---------- Effects ---------- */
// Where is a sound relative to the camera? → {vol, pan}
export function place(x, z, maxD = 40) {
  if (!G.camera) return { vol: 1, pan: 0 };
  const c = G.camera.position, dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
  const yaw = G.player ? G.player.camYaw : 0;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);          // camera right vector
  return { vol: Math.max(0, 1 - d / maxD), pan: d > 0.5 ? (dx * rx + dz * rz) / d * 0.8 : 0 };
}
export const sfx = {
  swing() { if (!ctx) return; noise(0.16, { freq: 1800, q: 0.7, gain: 0.35, sweep: 0.35 }); },
  hit() { if (!ctx) return; tone(140, 0.12, { gain: 0.5, slide: 0.5 }); noise(0.06, { type: 'highpass', freq: 2500, gain: 0.3 }); },
  splat(x, z) { if (!ctx) return; const p = place(x, z); if (!p.vol) return; noise(0.35, { type: 'lowpass', freq: 900, gain: 0.5 * p.vol, pan: p.pan, sweep: 0.3 }); tone(90, 0.25, { gain: 0.3 * p.vol, slide: 0.6, pan: p.pan }); },
  gun(kind) { if (!ctx) return; const big = kind === 'rifle';
    noise(big ? 0.5 : 0.3, { type: 'lowpass', freq: big ? 2400 : 3200, gain: 0.9, sweep: 0.15 });
    tone(big ? 70 : 110, big ? 0.35 : 0.2, { gain: 0.7, slide: 0.4 }); noise(0.03, { type: 'highpass', freq: 4000, gain: 0.5 }); },
  empty() { if (!ctx) return; tone(1800, 0.03, { type: 'square', gain: 0.1 }); },
  step(water) { if (!ctx) return; water ? noise(0.18, { freq: 700, q: 1.2, gain: 0.18, sweep: 2 }) : noise(0.07, { type: 'lowpass', freq: 500 + Math.random() * 300, gain: 0.22 }); },
  groan(x, z, pitch = 1) {
    if (!ctx) return; const p = place(x, z, 45); if (p.vol < 0.05) return;
    const t = now(), dur = 0.8 + Math.random() * 0.8, f0 = (70 + Math.random() * 40) * pitch;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.7 + Math.random() * 0.2), t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 4; const lg = ctx.createGain(); lg.gain.value = f0 * 0.06; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 450 + Math.random() * 300; f.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.45 * p.vol, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(out(sfxBus, p.pan)); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  },
  hurt() { if (!ctx) return; tone(220, 0.18, { type: 'triangle', gain: 0.35, slide: 0.6 }); noise(0.12, { type: 'lowpass', freq: 600, gain: 0.3 }); },
  pickup() { if (!ctx) return; const t = now(); tone(880, 0.12, { type: 'triangle', gain: 0.25, t }); tone(1320, 0.18, { type: 'triangle', gain: 0.22, t: t + 0.08 }); },
  ui() { if (!ctx) return; tone(660, 0.05, { type: 'triangle', gain: 0.12 }); },
  discover() { if (!ctx) return; const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.16, t: t + i * 0.09, bus: musicBus })); },
  night() { if (!ctx) return; const t = now(); [220, 207.6, 196].forEach((f, i) => tone(f, 1.2, { type: 'sawtooth', gain: 0.07, t: t + i * 0.35, a: 0.3, bus: musicBus })); },
  death() { if (!ctx) return; const t = now(); [392, 349, 311, 262].forEach((f, i) => tone(f, 0.9, { type: 'triangle', gain: 0.2, t: t + i * 0.3, a: 0.05, bus: musicBus })); },
  thunder(delay = 0) { if (!ctx) return; const t = now() + delay; noise(2.8, { type: 'lowpass', freq: 260, q: 0.5, gain: 0.9, a: 0.05, bus: ambBus, t, sweep: 0.4 }); noise(0.4, { type: 'lowpass', freq: 1200, gain: 0.4, t, bus: ambBus }); },
  scream(x, z) { if (!ctx) return; const p = place(x, z, 80); const t = now();
    tone(900, 1.2, { type: 'sawtooth', gain: 0.25 * Math.max(0.3, p.vol), slide: 1.6, pan: p.pan, t }); noise(1.1, { freq: 2500, q: 3, gain: 0.4 * Math.max(0.3, p.vol), sweep: 1.8, pan: p.pan, t }); },
  roar() { if (!ctx) return; const t = now(); tone(55, 1.4, { type: 'sawtooth', gain: 0.6, slide: 0.6, t }); noise(1.2, { type: 'lowpass', freq: 400, gain: 0.7, t, sweep: 0.5 }); },
  horn() { if (!ctx) return; tone(392, 0.35, { type: 'square', gain: 0.12 }); tone(494, 0.35, { type: 'square', gain: 0.1 }); }
};

/* ---------- Engine (one running engine at a time) ---------- */
let eng = null;
export const engine = {
  start() {
    if (!ctx || eng) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 20;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(sfxBus); o.start(); o2.start();
    g.gain.linearRampToValueAtTime(0.18, now() + 0.4);
    eng = { o, o2, f, g };
    noise(0.4, { type: 'lowpass', freq: 300, gain: 0.4 });  // ignition
  },
  set(speed, throttle) {
    if (!eng) return;
    const rpm = 40 + Math.abs(speed) * 4 + throttle * 25;
    eng.o.frequency.value = rpm; eng.o2.frequency.value = rpm / 2; eng.f.frequency.value = 300 + rpm * 6;
    eng.g.gain.value = 0.12 + throttle * 0.1;
  },
  stop() { if (!eng) return; const e = eng; eng = null; e.g.gain.linearRampToValueAtTime(0.0001, now() + 0.3); setTimeout(() => { e.o.stop(); e.o2.stop(); }, 400); }
};

/* ---------- Music: procedural pads + arpeggio + combat drums ---------- */
const DAY = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];     // Am F C G
const NIGHT = [[50, 53, 57], [46, 50, 53], [53, 57, 60], [45, 49, 52]];   // Dm Bb F A
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
let step = 0, nextT = 0, tension = 0;
export function setTension(v) { tension += (v - tension) * 0.1; }
function startMusic() {
  nextT = now() + 0.2;
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const night = G.save && (G.save.world.hour >= 20 || G.save.world.hour < 6);
    const bpm = 78 + tension * 40, beat = 60 / bpm / 2;   // eighth notes
    while (nextT < now() + 0.3) {
      const prog = night ? NIGHT : DAY, chord = prog[Math.floor(step / 16) % 4], t = nextT;
      if (step % 16 === 0) for (const n of chord) {             // pad
        tone(mtof(n), beat * 16, { type: 'triangle', gain: 0.05, a: 1.2, bus: musicBus, t });
        tone(mtof(n) * 1.004, beat * 16, { type: 'sine', gain: 0.04, a: 1.5, bus: musicBus, t });
      }
      if (step % 16 === 0) tone(mtof(chord[0] - 12), beat * 14, { type: 'sine', gain: 0.09, a: 0.4, bus: musicBus, t });   // bass
      const arp = [0, 1, 2, 1, 2, 0, 1, 2], n = chord[arp[step % 8]] + 12 + (step % 16 > 7 ? 12 : 0);
      if (step % 2 === 0 || tension > 0.4) tone(mtof(n), beat * 1.6, { type: 'triangle', gain: 0.035 + tension * 0.02, bus: musicBus, t, pan: (step % 4 - 1.5) * 0.3 });
      if (tension > 0.25) {                                       // combat drums fade in
        const v = Math.min(1, (tension - 0.25) * 1.6);
        if (step % 4 === 0) tone(110, 0.18, { gain: 0.55 * v, slide: 0.35, bus: musicBus, t });
        if (step % 8 === 4) noise(0.12, { freq: 1800, q: 0.8, gain: 0.25 * v, bus: musicBus, t });
        noise(0.03, { type: 'highpass', freq: 7000, gain: 0.08 * v, bus: musicBus, t });
      }
      nextT += beat; step++;
    }
  }, 100);
}

/* ---------- Ambience: wind, rain, crickets ---------- */
let wind, rain, rainGain, windGain;
function loopNoise(type, freq, q) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(ambBus); src.start();
  return { src, f, g };
}
function startAmbience() {
  wind = loopNoise('bandpass', 400, 0.6); windGain = wind.g;
  rain = loopNoise('highpass', 1800, 0.4); rainGain = rain.g;
  setInterval(() => {   // crickets at night
    if (!ctx || !G.save || G.paused) return;
    const h = G.save.world.hour, rainy = (G.weather?.rain || 0) > 0.2;
    if ((h >= 20 || h < 5) && !rainy && Math.random() < 0.6) {
      const t = now(), f = 4200 + Math.random() * 600, pan = Math.random() * 1.6 - 0.8;
      for (let i = 0; i < 3; i++) tone(f, 0.04, { gain: 0.03, t: t + i * 0.07, bus: ambBus, pan });
    }
  }, 900);
}
export function updateAmbience(dt) {
  if (!ctx) return;
  const w = G.weather || { rain: 0, wind: 0.3 };
  windGain.gain.value += ((0.15 + w.wind * 0.5) - windGain.gain.value) * dt;
  wind.f.frequency.value = 300 + Math.sin(G.time * 0.3) * 120 + w.wind * 200;
  rainGain.gain.value += ((w.rain * 0.55) - rainGain.gain.value) * dt * 2;
}
