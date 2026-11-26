import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { clamp, lerp } from './util.js';

// One in-game day = 12 real minutes. Night is 20:00 → 06:00.
export const HOURS_PER_SEC = 24 / (12 * 60);

const C = h => new THREE.Color(h);
const SKY = {   // [top, horizon]
  night: [C(0x0b1236), C(0x2a3170)], dawn: [C(0x6a8fd8), C(0xffb38a)],
  day: [C(0x3d8ef0), C(0xc4ecff)], dusk: [C(0x5a5fb0), C(0xff9a6a)]
};
const top = new THREE.Color(), hor = new THREE.Color(), tmp = new THREE.Color();
const SUN_DAY = C(0xfff2d9), SUN_DUSK = C(0xffa060), MOON = C(0x8fa6ff);
let flash;
G.sunDir = new THREE.Vector3(0.4, 0.8, 0.3);

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
    if (w.hour >= 6 && w.hour - dt * HOURS_PER_SEC < 6) G.banner?.('Day ' + w.day, 'DAWN');
    if (w.hour >= 20 && w.hour - dt * HOURS_PER_SEC < 20) { G.banner?.('Night falls', 'THE DEAD GROW BOLDER'); G.sfx?.night(); }
    const h = w.hour;
    const light = clamp(Math.sin(((h - 6) / 14) * Math.PI) * 1.4, 0, 1);          // 0 night … 1 noon
    const dawn = clamp(1 - Math.abs(h - 6.3) / 1.4, 0, 1), dusk = clamp(1 - Math.abs(h - 19.3) / 1.5, 0, 1);
    top.copy(SKY.night[0]).lerp(SKY.day[0], light); hor.copy(SKY.night[1]).lerp(SKY.day[1], light);
    if (dawn > 0) { top.lerp(SKY.dawn[0], dawn * 0.8); hor.lerp(SKY.dawn[1], dawn * 0.85); }
    if (dusk > 0) { top.lerp(SKY.dusk[0], dusk * 0.8); hor.lerp(SKY.dusk[1], dusk * 0.85); }
    // weather: overcast greys the sky, fog pulls the horizon in, lightning flashes everything white
    const W0 = G.weather || { overcast: 0, fog: 0, flash: 0 }, R = G.regionFx || { fog: 0, snow: 0 };
    const Wt = { ...W0, fog: Math.max(W0.fog, R.fog), overcast: Math.max(W0.overcast, R.snow * 0.5) };
    tmp.setRGB(0.55, 0.6, 0.66).multiplyScalar((0.25 + light * 0.75) * (1 - (Wt.rain || 0) * 0.35));
    top.lerp(tmp, Wt.overcast * 0.75); hor.lerp(tmp, Wt.overcast * 0.6 + Wt.fog * 0.3);
    if (Wt.flash > 0) { top.lerp(C(0xeef2ff), Wt.flash * 0.7); hor.lerp(C(0xeef2ff), Wt.flash * 0.5); }
    G.scene.fog.color.copy(hor);
    G.scene.fog.near = lerp(25, 60, light) * (1 - Wt.fog * 0.85); G.scene.fog.far = lerp(130, 260, light) * (1 - Wt.fog * 0.65 - Wt.overcast * 0.15);
    // sun arcs across the sky; at night a blue moon light takes over (anime nights are blue, not black)
    const t = ((h - 6) / 12) * Math.PI, isDay = h > 5.5 && h < 20.5;
    if (isDay) G.sunDir.set(Math.cos(t) * 0.8, Math.max(0.12, Math.sin(t)), 0.35).normalize();
    else { const tm = (((h + 18) % 24 - 6) / 12) * Math.PI; G.sunDir.set(Math.cos(tm) * 0.7, Math.max(0.25, Math.sin(tm)), -0.3).normalize(); }
    G.sun.color.copy(isDay ? tmp.copy(SUN_DAY).lerp(SUN_DUSK, Math.max(dawn, dusk)) : MOON);
    G.sun.intensity = (isDay ? 0.5 + light * 2.1 : 0.9) * (1 - Wt.overcast * 0.55);
    G.hemi.color.copy(top).lerp(C(0xffffff), 0.5); G.hemi.groundColor.copy(isDay ? C(0x4a5a2a) : C(0x1a2040));
    G.hemi.intensity = (0.75 + light * 0.25) * (1 - Wt.overcast * 0.3) + Wt.flash * 2.5;
    if (G.sky) {
      const u = G.sky.mat.uniforms;
      u.top.value.copy(top); u.horizon.value.copy(hor); u.sunDir.value.copy(G.sunDir);
      u.sunCol.value.copy(isDay ? tmp.copy(SUN_DAY).lerp(SUN_DUSK, Math.max(dawn, dusk)) : C(0xdfe6ff)); u.sunVis.value = (isDay ? 1 : 0.6) * (1 - Wt.overcast);
      G.sky.cMat.emissive.copy(hor).multiplyScalar(0.55); G.sky.cMat.color.setScalar((0.35 + light * 0.65) * (1 - Wt.overcast * 0.45));
      G.sky.sMat.opacity = clamp(1 - light * 3, 0, 1);
      G.sky.update(G.camera, dt);
    }
    if (G.outline) G.outline.mat.uniforms.night.value = (1 - light) * 0.4;
    if (G.water) { G.water.time.value += dt; G.water.light.value = light; }
    // flashlight at night
    const P = G.player;
    flash.intensity = light < 0.35 ? (0.35 - light) * 90 : 0;
    flash.position.set(P.pos.x + Math.sin(P.rot) * 0.3, P.pos.y + 1.6, P.pos.z + Math.cos(P.rot) * 0.3);
    flash.target.position.set(P.pos.x + Math.sin(P.rot) * 10, P.pos.y, P.pos.z + Math.cos(P.rot) * 10);
  }
};
