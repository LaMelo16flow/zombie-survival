import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { isNight } from './daynight.js';
import { sfx, updateAmbience, setTension } from './audio.js';
import { toast } from './ui.js';

/*
  WEATHER — clear, cloudy, rain, storm, fog. Changes every few in-game hours and is saved.
  Rain and fog hide you from zombies (they see less far); rain keeps you from getting thirsty as fast.
  Storms bring lightning and thunder. Fireflies come out on clear nights.
*/
const TYPES = {
  clear:  { overcast: 0, rain: 0, fog: 0, wind: 0.2, odds: 0.45, msg: 'The sky clears.' },
  cloudy: { overcast: 0.55, rain: 0, fog: 0.1, wind: 0.4, odds: 0.22, msg: 'Clouds roll in.' },
  rain:   { overcast: 0.8, rain: 0.7, fog: 0.25, wind: 0.5, odds: 0.15, msg: 'Rain — the dead can\'t see you as well.' },
  storm:  { overcast: 1, rain: 1, fog: 0.35, wind: 1, odds: 0.08, msg: 'A storm is coming!' },
  fog:    { overcast: 0.45, rain: 0, fog: 1, wind: 0.1, odds: 0.1, msg: 'Thick fog. You can\'t see far — neither can they.' }
};
const W = { state: 'clear', overcast: 0, rain: 0, fog: 0, wind: 0.2, flash: 0 };
let rainMesh, rainPos, flies, flyPos, nextBolt = 8;
const N_RAIN = 1400, BOX = { x: 40, y: 26, z: 40 }, N_FLY = 70;

function absHour() { const w = G.save.world; return w.day * 24 + w.hour; }
function roll() {
  let r = Math.random(), pick = 'clear';
  for (const [k, t] of Object.entries(TYPES)) { if ((r -= t.odds) <= 0) { pick = k; break; } }
  return pick;
}
function setWeather(state, announce = true) {
  G.save.world.weather = { state, until: absHour() + 3 + Math.random() * 6 };
  W.state = state;
  if (announce) toast(TYPES[state].msg, 3);
}

export const weatherSystem = {
  init() {
    G.weather = W;
    if (!G.save.world.weather) setWeather('clear', false);
    W.state = G.save.world.weather.state;
    Object.assign(W, TYPES[W.state], { flash: 0 });
    // rain streaks
    const g = new THREE.BufferGeometry(); rainPos = new Float32Array(N_RAIN * 6);
    for (let i = 0; i < N_RAIN; i++) { const x = Math.random() * BOX.x, y = Math.random() * BOX.y, z = Math.random() * BOX.z; rainPos.set([x, y, z, x, y - 0.7, z], i * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    rainMesh.frustumCulled = false; G.scene.add(rainMesh);
    // fireflies
    const fg = new THREE.BufferGeometry(); flyPos = new Float32Array(N_FLY * 3);
    for (let i = 0; i < N_FLY; i++) flyPos.set([(Math.random() - 0.5) * 50, Math.random() * 3 + 0.3, (Math.random() - 0.5) * 50], i * 3);
    fg.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
    flies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xd8ff7a, size: 5, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    flies.frustumCulled = false; G.scene.add(flies);
  },
  update(dt) {
    if (absHour() > G.save.world.weather.until) setWeather(roll());
    const T = TYPES[W.state], k = Math.min(1, dt * 0.5);   // weather fades in over a few seconds
    for (const key of ['overcast', 'rain', 'fog', 'wind']) W[key] += (T[key] - W[key]) * k;

    // rain follows the camera
    const cam = G.camera.position, op = W.rain * 0.55;
    rainMesh.material.opacity = op; rainMesh.visible = op > 0.02;
    if (rainMesh.visible) {
      const fall = 24 * dt, drift = W.wind * 6 * dt;
      for (let i = 0; i < N_RAIN; i++) {
        const o = i * 6;
        let y = rainPos[o + 1] - fall, x = rainPos[o] + drift;
        if (y < 0) { y += BOX.y; x = Math.random() * BOX.x; rainPos[o + 2] = Math.random() * BOX.z; }
        if (x > BOX.x) x -= BOX.x;
        rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 3] = x - W.wind * 0.25; rainPos[o + 4] = y - 0.8; rainPos[o + 5] = rainPos[o + 2];
      }
      rainMesh.geometry.attributes.position.needsUpdate = true;
      rainMesh.position.set(cam.x - BOX.x / 2, cam.y - BOX.y / 2, cam.z - BOX.z / 2);
    }

    // lightning
    W.flash = Math.max(0, W.flash - dt * 3);
    if (W.state === 'storm') {
      nextBolt -= dt;
      if (nextBolt <= 0) { nextBolt = 6 + Math.random() * 12; W.flash = 1; sfx.thunder(0.4 + Math.random() * 2); }
    }

    // fireflies on clear nights
    const show = isNight() && W.rain < 0.1 ? 1 : 0;
    flies.material.opacity += ((show * (0.6 + Math.sin(G.time * 3) * 0.3)) - flies.material.opacity) * Math.min(1, dt * 2);
    if (flies.material.opacity > 0.02) {
      for (let i = 0; i < N_FLY; i++) { flyPos[i * 3] += Math.sin(G.time * 0.7 + i) * dt * 0.6; flyPos[i * 3 + 1] += Math.cos(G.time * 1.1 + i * 2) * dt * 0.3; flyPos[i * 3 + 2] += Math.cos(G.time * 0.5 + i) * dt * 0.6; }
      flies.geometry.attributes.position.needsUpdate = true;
      flies.position.set(G.player.pos.x, G.player.pos.y, G.player.pos.z);
    }
    // music tension: how many zombies are chasing close by?
    const chasing = (G.zombieList?.() || []).filter(z => z.alive && z.state === 'chase' && Math.hypot(z.pos.x - G.player.pos.x, z.pos.z - G.player.pos.z) < 30).length;
    setTension(Math.min(1, chasing / 4));
    updateAmbience(dt);
  }
};
