import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { biome, heightAt, addBox, CITY_H, HALF, addCullable } from './world.js';
import { nearLocation } from './locations.js';
import { paint, merge, toon } from './style.js';
import { rng } from './util.js';
import { banner } from './ui.js';
import { ARMOR } from './items.js';

/*
  THE BIGGER WORLD — three new regions around the original valley:
  • Kessler City (east): roads, tall towers, lots of zombies and the best scrap, metal and ammo.
  • The Frozen North (north): snowy peaks, falling snow, frozen zombies — and the cold: keep warm
    with armour, a campfire or a car, or you start freezing.
  • The Drowned Marsh (south-west): half-flooded bog, thick fog, drowned zombies, herbs and boars.
*/
const VC = toon(0xffffff, { vertexColors: true });

/* ---------- City: road grid + towers ---------- */
function buildCity(scene) {
  const r = rng(77), g = [], roads = [];
  const X0 = 680, X1 = HALF - 70, Z0 = -480, Z1 = 480, STEP = 60;
  // roads (flat strips just above the ground) with lane lines
  for (let x = X0; x <= X1; x += STEP) { roads.push(paint(new THREE.BoxGeometry(10, 0.1, Z1 - Z0).translate(x, CITY_H + 0.06, 0), 0x3d4148)); for (let z = Z0; z < Z1; z += 8) roads.push(paint(new THREE.BoxGeometry(0.25, 0.12, 3.5).translate(x, CITY_H + 0.08, z), 0xe8e4d8)); }
  for (let z = Z0; z <= Z1; z += STEP) roads.push(paint(new THREE.BoxGeometry(X1 - X0 + 10, 0.1, 10).translate((X0 + X1) / 2, CITY_H + 0.06, z), 0x3d4148));
  const rm = new THREE.Mesh(merge(roads), VC); rm.receiveShadow = true; scene.add(rm);
  // towers on each block (skip places like downtown that have their own buildings)
  const COLS = [0x8a9bb5, 0xb7a07a, 0x9aa3ad, 0xc9b8a3, 0x6d8a9a, 0xa87c6a, 0x7a8a7a];
  for (let bx = X0; bx < X1; bx += STEP) for (let bz = Z0; bz < Z1; bz += STEP) {
    const cx = bx + STEP / 2, cz = bz + STEP / 2;
    if (nearLocation(cx, cz, 10) || biome(cx, cz).city < 0.7) continue;
    const n = r() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const w = 14 + r() * 14, d = 14 + r() * 14, h = 10 + Math.pow(r(), 1.6) * 45;
      const x = cx + (n === 2 ? (i ? 11 : -11) : 0), z = cz + (r() - 0.5) * 8, col = COLS[Math.floor(r() * COLS.length)];
      const ww = n === 2 ? Math.min(w, 20) : w;
      g.push(paint(new THREE.BoxGeometry(ww, h, d).translate(x, CITY_H + h / 2, z), col));
      g.push(paint(new THREE.BoxGeometry(ww + 0.6, 0.6, d + 0.6).translate(x, CITY_H + h + 0.3, z), 0x4a4f57));
      for (let fy = 3; fy < h - 1; fy += 3.4) for (const s of [-1, 1]) {   // window bands
        g.push(paint(new THREE.BoxGeometry(ww * 0.86, 1.2, 0.12).translate(x, CITY_H + fy, z + s * (d / 2 + 0.03)), r() < 0.15 ? 0xffe9a8 : 0x2a3d63));
        g.push(paint(new THREE.BoxGeometry(0.12, 1.2, d * 0.86).translate(x + s * (ww / 2 + 0.03), CITY_H + fy, z), r() < 0.15 ? 0xffe9a8 : 0x2a3d63));
      }
      addBox(x, z, ww, d, CITY_H + h);
    }
  }
  // merge in chunks so no single mesh gets too large
  // one mesh per city block row-chunk, each hidden when far away
  for (let i = 0; i < g.length; i += 160) { const m = new THREE.Mesh(merge(g.slice(i, i + 160)), VC); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    m.geometry.computeBoundingSphere(); const bs = m.geometry.boundingSphere; addCullable(m, bs.center.x, bs.center.z, bs.radius, 380); }
}

/* ---------- Falling snow (follows the camera) ---------- */
let snow, snowPos;
const NS = 1200, BOX = 40;
function buildSnow(scene) {
  const geo = new THREE.BufferGeometry(); snowPos = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) snowPos.set([Math.random() * BOX, Math.random() * 24, Math.random() * BOX], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  snow.frustumCulled = false; scene.add(snow);
}

const NAMES = { city: ['Kessler City', 'More zombies — and the best scrap, metal and ammo'], snow: ['The Frozen North', 'Keep warm: armour, a campfire or a car'], swamp: ['The Drowned Marsh', 'Thick fog. Something moves in the water.'] };
let current = null;

export const regionSystem = {
  init() {
    buildCity(G.scene); buildSnow(G.scene);
    G.regionFx = { fog: 0, snow: 0, city: 0 };
    G.biomeAt = biome;
  },
  update(dt) {
    const P = G.player.pos, b = biome(P.x, P.z), fx = G.regionFx;
    fx.fog += ((b.swamp * 0.75) - fx.fog) * Math.min(1, dt);
    fx.snow += ((b.snow > 0.3 ? b.snow : 0) - fx.snow) * Math.min(1, dt);
    fx.city = b.city;
    // entering a region shows its name once per visit
    const now = b.city > 0.6 ? 'city' : b.snow > 0.6 ? 'snow' : b.swamp > 0.6 ? 'swamp' : null;
    if (now !== current) { current = now; if (now) { banner(NAMES[now][0], NAMES[now][1], 3.5); G.save.world.regions = G.save.world.regions || []; if (!G.save.world.regions.includes(now)) { G.save.world.regions.push(now); G.addXP?.(60); } } }
    // snowfall
    snow.material.opacity = fx.snow * 0.9; snow.visible = fx.snow > 0.03;
    if (snow.visible) {
      for (let i = 0; i < NS; i++) {
        const o = i * 3; snowPos[o + 1] -= dt * (2.2 + (i % 5) * 0.3); snowPos[o] += Math.sin(G.time + i) * dt * 0.6;
        if (snowPos[o + 1] < 0) { snowPos[o + 1] += 24; snowPos[o] = Math.random() * BOX; snowPos[o + 2] = Math.random() * BOX; }
      }
      snow.geometry.attributes.position.needsUpdate = true;
      const c = G.camera.position; snow.position.set(c.x - BOX / 2, c.y - 12, c.z - BOX / 2);
    }
    // the cold
    const st = G.save.stats; if (st.warmth === undefined) st.warmth = 100;
    const night = G.save.world.hour >= 20 || G.save.world.hour < 6;
    const nearFire = G.nearStation?.('fire') || G.driving;
    const armour = (ARMOR[G.save.inv.armor] || ARMOR.none).block;   // jackets keep you warm too
    if (b.snow > 0.5 && !nearFire) st.warmth = Math.max(0, st.warmth - dt * (1.6 + (night ? 1.2 : 0) + (G.weather?.rain || 0)) * (1 - armour * 1.3));
    else st.warmth = Math.min(100, st.warmth + dt * (nearFire ? 8 : 2.5));
    if (st.warmth <= 0) { G.player.hurt(dt * 2, 'cold'); if (!this.warned) { G.toast?.('You are freezing! Find a fire or get in a car.', 3); this.warned = true; } }
    else if (st.warmth > 30) this.warned = false;
  }
};
