import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { LOCATIONS } from './locations.js';
import { heightAt } from './world.js';
import { toon, paint, merge } from './style.js';

/*
  LIVING WORLD — moving props:
  • Wind: tree tops and grass sway (done on the graphics card, costs almost nothing), stronger in storms.
  • Flags wave over every camp and over your base.
  • The mill wheel turns, the radar dish sweeps, signs swing.
  • Chimney / campfire smoke rises from faction camps and the ski lodge.
*/
import { wind } from './style.js';
export { windMaterial } from './style.js';

/* ---------- Flags ---------- */
const flags = [];
export function addFlag(x, z, color, h = 7) {
  const y = heightAt(x, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), toon(0x9a9a9a)); pole.position.set(x, y + h / 2, z); pole.castShadow = true; G.scene.add(pole);
  const geo = new THREE.PlaneGeometry(2.2, 1.3, 10, 4); geo.translate(1.1, 0, 0);
  const cloth = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide, unique: true })); cloth.position.set(x, y + h - 0.7, z); cloth.castShadow = true; G.scene.add(cloth);
  flags.push({ cloth, base: Float32Array.from(geo.attributes.position.array), ph: Math.random() * 6 });
  return cloth;
}
function waveFlags(t) {
  const s = wind.strength.value;
  for (const f of flags) {
    if (!f.cloth.visible) continue;
    const pos = f.cloth.geometry.attributes.position, b = f.base;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], k = x / 2.2;                                  // the free end moves most
      pos.array[i * 3 + 2] = Math.sin(t * 4 * (0.6 + s * 0.4) + x * 2.2 + f.ph) * 0.28 * k * (0.5 + s * 0.6);
      pos.array[i * 3 + 1] = b[i * 3 + 1] - k * k * 0.25 * (1.2 - s * 0.5);
    }
    pos.needsUpdate = true; f.cloth.geometry.computeVertexNormals();
    f.cloth.rotation.y = Math.sin(t * 0.3 + f.ph) * 0.4;
  }
}

/* ---------- Spinning / swinging things ---------- */
const spinners = [];   // { obj, axis: 'x'|'y'|'z', speed, swing? }
export function addSpinner(obj, axis, speed, swing = 0) { obj.userData.keep = true; spinners.push({ obj, axis, speed, swing, base: obj.rotation[axis] }); }

/* ---------- Smoke ---------- */
const smokes = [];
const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
function addSmoke(x, y, z, rate = 0.5) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xd8dde3, transparent: true, opacity: 0.5, depthWrite: false });
  const puffs = Array.from({ length: 10 }, (_, i) => { const m = new THREE.Mesh(puffGeo, mat.clone()); m.userData.t = i / 10 * 4; G.scene.add(m); return m; });
  smokes.push({ x, y, z, puffs, rate });
}

export const propSystem = {
  init() {
    // a flag over every faction camp, smoke from their fires, smoke from the lodge chimney
    const FLAG = { haven: 0x7fb069, wolves: 0xd1495b, order: 0xe9d8a6 };
    for (const L of LOCATIONS) {
      if (L.faction) { addFlag(L.x + 4, L.z + 4, FLAG[L.faction], 9); addSmoke(L.x - 3, heightAt(L.x - 3, L.z + 2) + 1, L.z + 2); }
      if (L.type === 'lodge') addSmoke(L.x + 5, heightAt(L.x, L.z) + 7.5, L.z - 6, 0.7);
    }
    G.addFlag = addFlag;
  },
  update(dt) {
    const t = G.time, W = G.weather;
    wind.strength.value += (((W ? 0.6 + W.wind * 1.8 : 1)) - wind.strength.value) * Math.min(1, dt);
    wind.time.value = t;
    waveFlags(t);
    for (const s of spinners) s.obj.rotation[s.axis] = s.swing ? s.base + Math.sin(t * s.speed) * s.swing : s.obj.rotation[s.axis] + s.speed * dt;
    const cam = G.camera.position;
    for (const sm of smokes) {
      const near = Math.hypot(sm.x - cam.x, sm.z - cam.z) < 260;
      for (const p of sm.puffs) {
        p.visible = near; if (!near) continue;
        p.userData.t = (p.userData.t + dt * sm.rate) % 4; const k = p.userData.t / 4;
        p.position.set(sm.x + Math.sin(k * 5 + t * 0.3) * k * 1.5 + (W?.wind || 0.2) * k * 6, sm.y + k * 9, sm.z + Math.cos(k * 4) * k);
        p.scale.setScalar(0.6 + k * 2.6); p.material.opacity = 0.45 * (1 - k) * Math.min(1, k * 8);
      }
    }
  }
};
