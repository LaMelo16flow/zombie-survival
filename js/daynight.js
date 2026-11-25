import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { clamp, lerp } from './util.js';

// One in-game day = 12 real minutes. Night is 20:00 → 06:00.
export const HOURS_PER_SEC = 24 / (12 * 60);

const DAY_SKY = new THREE.Color(0x9fb3b8), DUSK_SKY = new THREE.Color(0x8a5a4a), NIGHT_SKY = new THREE.Color(0x0a0e16);
const tmp = new THREE.Color();
let flash;

export function isNight() { const h = G.save.world.hour; return h >= 20 || h < 6; }
export function clockText() {
  const h = G.save.world.hour, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `Day ${G.save.world.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export const dayNight = {
  init() {
    flash = new THREE.SpotLight(0xfff4d6, 0, 45, 0.5, 0.5, 1.2);
    G.scene.add(flash, flash.target);
  },
  update(dt) {
    const w = G.save.world;
    w.hour += dt * HOURS_PER_SEC;
    if (w.hour >= 24) { w.hour -= 24; w.day++; G.emit?.('newDay', w.day); }
    const h = w.hour;
    // daylight 0..1
    const light = clamp(Math.sin(((h - 6) / 14) * Math.PI) * 1.4, 0, 1);
    const dusk = clamp(1 - Math.abs(h - 19.5) / 1.5, 0, 1) + clamp(1 - Math.abs(h - 6) / 1.2, 0, 1) * 0.6;
    tmp.copy(NIGHT_SKY).lerp(DAY_SKY, light).lerp(DUSK_SKY, dusk * 0.5);
    G.scene.background.copy(tmp); G.scene.fog.color.copy(tmp);
    G.scene.fog.far = lerp(70, 220, light);
    G.sun.intensity = 0.05 + light * 1.55;
    G.hemi.intensity = 0.18 + light * 0.75;
    // flashlight at night
    const P = G.player;
    flash.intensity = light < 0.35 ? (0.35 - light) * 120 : 0;
    flash.position.set(P.pos.x + Math.sin(P.rot) * 0.3, P.pos.y + 1.6, P.pos.z + Math.cos(P.rot) * 0.3);
    flash.target.position.set(P.pos.x + Math.sin(P.rot) * 10, P.pos.y, P.pos.z + Math.cos(P.rot) * 10);
  }
};
