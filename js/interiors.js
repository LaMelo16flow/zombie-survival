import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { heightAt, addBox } from './world.js';
import { addInteractable } from './interact.js';
import { toon, paint, merge } from './style.js';
import { toast } from './ui.js';
import { sfx } from './audio.js';
import { registerDoor } from './defenses.js';

/*
  EXPLORABLE BUILDINGS — houses with rooms and furniture you can search, and two-storey buildings
  with stairs (police station, apartments, school). Upper floors and roofs hide when you are inside
  so the camera can see you.
*/

/* ---------- Floors you can stand on (stairs, upper storeys) ---------- */
export const floors = [];   // { minX, maxX, minZ, maxZ, y, ramp?: { z0, z1, y0 } }
export function surfaceAt(x, z, y) {
  let h = heightAt(x, z);
  for (const f of floors) {
    if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
    let fy = f.y;
    if (f.ramp) { const t = Math.max(0, Math.min(1, (z - f.ramp.z0) / (f.ramp.z1 - f.ramp.z0))); fy = f.ramp.y0 + t * (f.y - f.ramp.y0); }
    if (fy <= y + 0.75 && fy > h) h = fy;
  }
  return h;
}
// Smoothly put something on the surface (falls if it walks off an edge)
export function settleY(pos, dt, min = -99) {
  const t = Math.max(surfaceAt(pos.x, pos.z, pos.y), min);
  pos.y = t >= pos.y - 0.35 ? t : Math.max(t, pos.y - 14 * dt);
}

const mats = {};
const M = c => mats[c] || (mats[c] = toon(c));
const VC = toon(0xffffff, { vertexColors: true });
const B = (w, h, d, x, y, z, c) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
export const multi = [];   // buildings with upper floors, for hiding

/* ---------- Furniture you can search ---------- */
const FURN = {
  shelf:  { label: 'Search the shelves', geo: () => merge([B(1.6, 2, 0.4, 0, 1, 0, 0x8a6342), ...[0.5, 1.1, 1.7].map(y => B(1.5, 0.06, 0.38, 0, y, 0.02, 0xc08a50)), B(0.3, 0.25, 0.25, -0.4, 0.68, 0, 0xe8364a), B(0.25, 0.3, 0.25, 0.3, 1.28, 0, 0x4a6fa5)]) },
  fridge: { label: 'Open the fridge', geo: () => merge([B(0.9, 1.9, 0.8, 0, 0.95, 0, 0xe8e4e0), B(0.05, 0.5, 0.06, 0.32, 1.3, 0.42, 0x9aa3ad), B(0.86, 0.04, 0.02, 0, 1.25, 0.41, 0xbfc6cd)]) },
  desk:   { label: 'Search the desk', geo: () => merge([B(1.6, 0.08, 0.8, 0, 0.78, 0, 0xb0773f), ...[[-0.72, -0.34], [0.72, -0.34], [-0.72, 0.34], [0.72, 0.34]].map(([x, z]) => B(0.08, 0.76, 0.08, x, 0.38, z, 0x7a4f2a)), B(0.5, 0.5, 0.7, 0.5, 0.45, 0, 0x8a6342), B(0.5, 0.35, 0.05, -0.3, 1.0, -0.2, 0x2a2f3a)]) },
  locker: { label: 'Open the locker', geo: () => merge([B(1.4, 2, 0.6, 0, 1, 0, 0x5a6b8a), ...[-0.35, 0.35].map(x => B(0.04, 1.8, 0.02, x, 1, 0.31, 0x3a4560)), B(0.3, 0.06, 0.02, -0.45, 1.6, 0.31, 0xdfe6ff), B(0.3, 0.06, 0.02, 0.25, 1.6, 0.31, 0xdfe6ff)]) },
  bed:    { label: 'Search under the bed', geo: () => merge([B(1.2, 0.4, 2.1, 0, 0.25, 0, 0x7a4f2a), B(1.1, 0.18, 2, 0, 0.52, 0, 0xf4efe4), B(1.12, 0.12, 1.2, 0, 0.64, 0.35, 0xe8a598), B(0.7, 0.16, 0.38, 0, 0.66, -0.72, 0xffffff)]) },
  sofa:   { label: 'Check the sofa cushions', geo: () => merge([B(2, 0.45, 0.9, 0, 0.3, 0, 0x5a8f5a), B(2, 0.6, 0.25, 0, 0.75, -0.33, 0x4a7a4a), B(0.25, 0.5, 0.9, -1, 0.5, 0, 0x4a7a4a), B(0.25, 0.5, 0.9, 1, 0.5, 0, 0x4a7a4a)]) },
  crate:  { label: 'Search the crate', geo: () => merge([B(0.9, 0.7, 0.7, 0, 0.35, 0, 0x8a6a40), B(0.92, 0.08, 0.72, 0, 0.5, 0, 0x6b4f33)]) },
  desk2:  { label: 'Search the teacher\'s desk', geo: () => merge([B(1.4, 0.75, 0.7, 0, 0.38, 0, 0x8a6342), B(0.6, 0.2, 0.4, -0.3, 0.85, 0, 0xe8e4d8)]) }
};
const geoCache = {};
let fid = 0;
export function furniture(scene, kind, x, y, z, rotY, loot, idBase) {
  const F = FURN[kind], m = new THREE.Mesh(geoCache[kind] || (geoCache[kind] = F.geo()), VC);
  m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true; scene.add(m);
  const id = idBase + ':f' + (fid++);
  const looted = () => { const t = G.save.world.looted[id]; return t !== undefined && G.save.world.day - t < 3; };
  addInteractable({ x, z, y, r: 1.9, label: () => looted() ? 'Already searched' : F.label, action: () => {
    if (looted()) return;
    G.save.world.looted[id] = G.save.world.day;
    toast(G.giveLoot(loot)); sfx.pickup(); G.emit('looted', { id, type: loot });
  } });
  return m;
}

/* ---------- Walls ---------- */
function wallSeg(group, ox, oz, cx, cz, w, d, y, h, color, collide) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(color)); m.position.set(cx, y + h / 2, cz); m.castShadow = m.receiveShadow = true; group.add(m);
  if (collide) addBox(ox + cx, oz + cz, w, d);
}
// A wall along X from x0 to x1 at z, with door gaps [[a,b],…]
function wallX(group, ox, oz, x0, x1, z, gaps, y, h, color, collide, T = 0.3) {
  let cur = x0; for (const [a, b] of [...gaps, [x1, x1]]) { if (a > cur + 0.05) wallSeg(group, ox, oz, (cur + a) / 2, z, a - cur, T, y, h, color, collide); if (b < x1) wallSeg(group, ox, oz, (a + b) / 2, z, b - a, T, y + 2.3, h - 2.3, color, false); cur = b; }
}
function wallZ(group, ox, oz, z0, z1, x, gaps, y, h, color, collide, T = 0.3) {
  let cur = z0; for (const [a, b] of [...gaps, [z1, z1]]) { if (a > cur + 0.05) wallSeg(group, ox, oz, x, (cur + a) / 2, T, a - cur, y, h, color, collide); if (b < z1) wallSeg(group, ox, oz, x, (a + b) / 2, T, b - a, y + 2.3, h - 2.3, color, false); cur = b; }
}

/* ---------- Rooms inside an existing one-storey house ---------- */
export function houseInterior(scene, idBase, x, z, w, d, h, color) {
  const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); scene.add(g);
  wallX(g, x, z, -w / 2, w / 2, -d / 2 + d * 0.45, [[-w / 4 - 0.6, -w / 4 + 0.6], [w / 4 - 0.6, w / 4 + 0.6]], 0, h, color, true, 0.2);   // splits front room / back rooms
  wallZ(g, x, z, -d / 2, -d / 2 + d * 0.45, 0, [], 0, h, color, true, 0.2);                   // two back bedrooms
  const y = g.position.y + 0.08;
  furniture(scene, 'bed', x - w / 4, y, z - d / 2 + 1.2, 0, 'town', idBase);
  furniture(scene, Math.random() < 0.5 ? 'shelf' : 'desk', x + w / 4, y, z - d / 2 + 0.5, 0, 'town', idBase);
  furniture(scene, 'fridge', x - w / 2 + 0.7, y, z + d / 2 - 1.2, Math.PI / 2, 'house_kitchen', idBase);
  furniture(scene, 'sofa', x + w / 2 - 1.4, y, z + d * 0.05, -Math.PI / 2, 'town', idBase);
}

/* ---------- Two-storey buildings with stairs ---------- */
const FH = 3.4;
export function multiStory(scene, L, cx, cz, w, d, { color, roof = 0x5a5f6a, rooms = [] }) {
  const base = heightAt(cx, cz), g0 = new THREE.Group(), g1 = new THREE.Group();
  g0.position.set(cx, base, cz); g1.position.set(cx, base, cz); scene.add(g0, g1);
  const T = 0.3, sx = w / 2 - 2.6;     // stairwell strip: x from sx to w/2
  // outer walls: ground floor has a front door, upper floor has windows (gaps up high are just visual)
  for (const [g, y, front] of [[g0, 0, [[-1.1, 1.1]]], [g1, FH, []]]) {
    wallX(g, cx, cz, -w / 2, w / 2, -d / 2, [], y, FH, color, y === 0);
    wallX(g, cx, cz, -w / 2, w / 2, d / 2, front, y, FH, color, y === 0);
    wallZ(g, cx, cz, -d / 2, d / 2, -w / 2, [], y, FH, color, y === 0);
    wallZ(g, cx, cz, -d / 2, d / 2, w / 2, [], y, FH, color, y === 0);
    // stairwell divider: a door at the front (ground) and one at the back (upstairs landing)
    wallZ(g, cx, cz, -d / 2, d / 2, sx, [[-d / 2 + 0.5, -d / 2 + 2.3], [d / 2 - 3.2, d / 2 - 1.4]], y, FH, 0xd8d2c4, y === 0, 0.2);
    // rooms on the left: front and back, joined by a doorway
    wallX(g, cx, cz, -w / 2, sx, 0, [[(sx - w / 2) / 2 - 0.8, (sx - w / 2) / 2 + 0.8]], y, FH, 0xd8d2c4, y === 0, 0.2);
  }
  // window strips
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const wm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.05), M(0x2a3d63)); wm.position.set(-w / 2 + 2 + i * (w - 4) / 3, FH * 1.55, s * (d / 2 + 0.16)); g1.add(wm); }
  // upper floor slab (not over the stairwell), landing at the top of the stairs
  const slab = new THREE.Mesh(new THREE.BoxGeometry(sx + w / 2, 0.25, d), M(0x9a8f80)); slab.position.set((sx - w / 2) / 2, FH - 0.12, 0); slab.receiveShadow = true; g1.add(slab);
  const land = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - sx, 0.25, 2.5), M(0x9a8f80)); land.position.set((sx + w / 2) / 2, FH - 0.12, -d / 2 + 1.25); g1.add(land);
  floors.push({ minX: cx - w / 2, maxX: cx + sx, minZ: cz - d / 2, maxZ: cz + d / 2, y: base + FH });
  floors.push({ minX: cx + sx, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz - d / 2 + 2.5, y: base + FH });
  // stairs: a ramp from the front of the stairwell up to the back landing, with steps drawn on it
  const z0 = cz + d / 2 - 1, z1 = cz - d / 2 + 2.5, len = z0 - z1;
  floors.push({ minX: cx + sx + 0.1, maxX: cx + w / 2, minZ: z1, maxZ: z0, y: base + FH, ramp: { z0, z1, y0: base } });
  const steps = Math.round(len / 0.45);
  for (let i = 0; i < steps; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - sx - 0.3, (i + 1) * FH / steps, 0.46), M(i % 2 ? 0xb0a494 : 0xa39888)); st.position.set((sx + w / 2) / 2, (i + 1) * FH / steps / 2, d / 2 - 1 - (i + 0.5) * len / steps); st.receiveShadow = true; g0.add(st); }
  // ground floor ceiling = upper slab underside (seen from below) and the roof
  const roofM = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6), M(roof)); roofM.position.set(0, FH * 2 + 0.15, 0); roofM.castShadow = true; g1.add(roofM);
  const floor0 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), M(0x8c8273)); floor0.position.y = 0.05; floor0.receiveShadow = true; g0.add(floor0);
  // furniture: rooms = [{ floor, side: 'front'|'back', kind, loot }]
  for (const r of rooms) {
    const y = base + (r.floor ? FH : 0) + 0.06, rx = cx + (r.dx ?? (-w / 2 + (sx + w / 2) * (0.25 + Math.random() * 0.5))), rz = cz + (r.side === 'front' ? d / 4 + (r.dz || 0) : -d / 4 + (r.dz || 0));
    furniture(scene, r.kind, rx, y, rz, r.rot || 0, r.loot, L.id);
  }
  g1.userData.keep = true;
  registerDoor('m' + Math.round(cx) + '_' + Math.round(cz), cx, cz + d / 2, 2.2, 0);
  multi.push({ x: cx, z: cz, hw: w / 2, hd: d / 2, base, g1, roof: roofM, slab });
}

// Hide the upper storey / roof while you are inside so the camera can see you
export function updateInteriors() {
  const P = G.player.pos;
  for (const b of multi) {
    const inside = Math.abs(P.x - b.x) < b.hw + 0.4 && Math.abs(P.z - b.z) < b.hd + 0.4;
    const up = P.y > b.base + FH - 0.6;
    b.roof.visible = !inside;
    for (const c of b.g1.children) if (c !== b.roof) c.visible = !inside || up;
  }
}
