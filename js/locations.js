import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { addFlat, heightAt, addBox, addCircle } from './world.js';
import { addInteractable } from './interact.js';
import { spawnGroup } from './zombies.js';
import { toast, banner } from './ui.js';
import { sfx } from './audio.js';
import { rng } from './util.js';
import { toon } from './style.js';

// The places to explore. "type" decides buildings and loot.
export const LOCATIONS = [
  { id: 'pine',     name: 'Pine Hollow',          type: 'town',     x: 40,   z: 70,   r: 45 },
  { id: 'gas',      name: 'Route 9 Gas Station',  type: 'gas',      x: 140,  z: -110, r: 22 },
  { id: 'farm',     name: 'Miller Farm',          type: 'farm',     x: -170, z: -190, r: 32 },
  { id: 'hospital', name: "St. Mary's Hospital",  type: 'hospital', x: -230, z: 160,  r: 34 },
  { id: 'fort',     name: 'Fort Kessler',         type: 'military', x: 310,  z: -290, r: 45 },
  { id: 'haven',    name: 'Riverside Haven',      type: 'camp',     x: -330, z: -30,  r: 34, faction: 'haven' },
  { id: 'steel',    name: 'The Steel Yard',       type: 'raider',   x: 260,  z: 210,  r: 34, faction: 'wolves' },
  { id: 'tower',    name: 'Radio Tower',          type: 'tower',    x: -20,  z: 340,  r: 28, faction: 'order' },
  { id: 'mall',     name: 'Eastgate Mall',        type: 'mall',     x: 330,  z: 20,   r: 40 },
  { id: 'lab',      name: 'Helix Research Lab',   type: 'lab',      x: -340, z: -340, r: 30 }
];

const LOOT = {
  town:     { food: [0, 2], water: [0, 2], meds: [0, 1], wood: [0, 2], scrap: [0, 1], ammo: [0, 3] },
  gas:      { food: [1, 3], water: [1, 3], scrap: [1, 3] },
  farm:     { food: [1, 4], water: [0, 2], wood: [2, 5] },
  hospital: { meds: [1, 3], water: [0, 2] },
  military: { ammo: [4, 12], meds: [0, 1], scrap: [1, 2], gun: 0.25 },
  mall:     { food: [1, 3], water: [1, 3], scrap: [0, 2], melee: 0.2 },
  lab:      { meds: [1, 2], scrap: [1, 3] },
  camp: {}, raider: {}, tower: {}
};

const mats = {};
const M = c => mats[c] || (mats[c] = toon(c));
export const buildings = [];   // {x,z,hw,hd,roof} — roofs hide when you walk inside

// Hollow building with a door gap in the front (+z) wall.
function building(scene, x, z, w, d, h, color, roofColor = 0xc0574a) {
  const y = heightAt(x, z), T = 0.3, door = 2.2;
  const g = new THREE.Group(); g.position.set(x, y, z);
  const wall = (wx, wz, ww, wd) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, h, wd), M(color));
    m.position.set(wx, h / 2, wz); m.castShadow = m.receiveShadow = true; g.add(m);
    addBox(x + wx, z + wz, ww, wd);
  };
  wall(0, -d / 2, w, T);                 // back
  wall(-w / 2, 0, T, d); wall(w / 2, 0, T, d);  // sides
  const side = (w - door) / 2;
  wall(-(door / 2 + side / 2), d / 2, side, T); wall(door / 2 + side / 2, d / 2, side, T); // front with door
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(door, h - 2.4, T), M(color)); lintel.position.set(0, 2.4 + (h - 2.4) / 2, d / 2); g.add(lintel);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), M(0x5b5048)); floor.position.y = 0.05; floor.receiveShadow = true; g.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.3, d + 0.6), M(roofColor)); roof.position.y = h + 0.15; roof.castShadow = true; g.add(roof);
  scene.add(g);
  buildings.push({ x, z, hw: w / 2, hd: d / 2, roof });
  return g;
}

function prop(scene, geo, color, x, z, yOff = 0, collR = 0, rotY = 0) {
  const m = new THREE.Mesh(geo, M(color)); m.position.set(x, heightAt(x, z) + yOff, z); m.rotation.y = rotY;
  m.castShadow = true; scene.add(m); if (collR) addCircle(x, z, collR); return m;
}

function car(scene, x, z, rot, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.2), M(color)); body.position.y = 0.7;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.2), M(0x22282c)); cab.position.set(0, 1.45, -0.2);
  g.add(body, cab); g.position.set(x, heightAt(x, z), z); g.rotation.y = rot;
  g.traverse(o => o.castShadow = true); scene.add(g);
  addCircle(x + Math.sin(rot) * 1.1, z + Math.cos(rot) * 1.1, 1.1); addCircle(x - Math.sin(rot) * 1.1, z - Math.cos(rot) * 1.1, 1.1);
}

const crateGeo = new THREE.BoxGeometry(0.9, 0.7, 0.7);
function crate(scene, id, x, z, type) {
  const m = prop(scene, crateGeo, type === 'military' ? 0x4a5a32 : 0x8a6a40, x, z, 0.35, 0.5, Math.random());
  const looted = () => { const t = G.save.world.looted[id]; return t !== undefined && G.save.world.day - t < 3; };
  addInteractable({ x, z, r: 1.8, label: () => looted() ? 'Empty (refills in a few days)' : 'Search', action: () => {
    if (looted()) return;
    G.save.world.looted[id] = G.save.world.day;
    toast(giveLoot(type)); sfx.pickup();
    G.emit('looted', { id, type });
  }});
  return m;
}

export function giveLoot(type) {
  const t = LOOT[type] || LOOT.town, inv = G.save.inv, got = [];
  for (const [k, v] of Object.entries(t)) {
    if (k === 'gun') { if (Math.random() < v) { const g = inv.gun === 'pistol' || Math.random() < 0.5 ? 'rifle' : 'pistol'; if (inv.gun !== 'rifle') { inv.gun = g; got.push('a ' + g + '!'); inv.ammo += 6; } } continue; }
    if (k === 'melee') { if (Math.random() < v && inv.melee !== 'machete') { inv.melee = 'machete'; got.push('a machete!'); } continue; }
    const n = v[0] + Math.floor(Math.random() * (v[1] - v[0] + 1));
    if (n > 0) { inv[k] = (inv[k] || 0) + n; got.push(`${n} ${k}`); }
  }
  return got.length ? 'Found: ' + got.join(', ') : 'Nothing useful.';
}

/* ---------- Layout of each location ---------- */
export function registerFlats() { for (const L of LOCATIONS) addFlat(L.x, L.z, L.r); }
export function nearLocation(x, z, pad = 8) { return LOCATIONS.some(L => Math.hypot(x - L.x, z - L.z) < L.r + pad); }

export function buildLocations(scene) {
  const r = rng(42);
  for (const L of LOCATIONS) {
    let c = 0;
    const id = () => L.id + ':' + (c++);
    const at = (dx, dz) => [L.x + dx, L.z + dz];
    switch (L.type) {
      case 'town': {
        const spots = [[-22, -18], [0, -20], [22, -18], [-24, 12], [24, 12], [-6, 22], [12, 26]];
        for (const [dx, dz] of spots) {
          const w = 7 + r() * 3, d = 6 + r() * 2;
          building(scene, L.x + dx, L.z + dz, w, d, 3.2, [0xf2d6a2, 0xa8c8e8, 0xe8a598, 0xf4efe4][Math.floor(r() * 4)], [0xc0574a, 0x4a6fa5, 0x5a8f5a, 0x8a5a9f][Math.floor(r() * 4)]);
          crate(scene, id(), L.x + dx + (r() - 0.5) * (w - 3), L.z + dz - d / 4, 'town');
        }
        for (let i = 0; i < 4; i++) car(scene, L.x - 30 + i * 18 + r() * 5, L.z - 3 + r() * 4, r() * 6, [0x7a2020, 0x204a7a, 0x777777, 0x2f5a2f][i]);
        break;
      }
      case 'gas': {
        building(scene, L.x, L.z - 8, 10, 7, 3.4, 0xd8d0c0);
        const can = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 8), M(0xc0392b)); can.position.set(L.x, heightAt(L.x, L.z) + 4.5, L.z + 5); scene.add(can);
        for (const dx of [-6, 6]) prop(scene, new THREE.CylinderGeometry(0.25, 0.25, 4.5, 6), 0xdddddd, L.x + dx, L.z + 5, 2.25, 0.3);
        prop(scene, new THREE.BoxGeometry(1, 1.6, 0.8), 0x2c3e50, L.x - 2, L.z + 5, 0.8, 0.6);
        prop(scene, new THREE.BoxGeometry(1, 1.6, 0.8), 0x2c3e50, L.x + 2, L.z + 5, 0.8, 0.6);
        crate(scene, id(), L.x - 2, L.z - 9, 'gas'); crate(scene, id(), L.x + 3, L.z - 8, 'gas');
        car(scene, L.x + 9, L.z + 12, 1.2, 0x555555);
        break;
      }
      case 'farm': {
        building(scene, L.x - 10, L.z, 8, 7, 3.2, 0xe8e0cc);
        building(scene, L.x + 12, L.z - 4, 12, 10, 5.5, 0x8b2a1f, 0x444444);   // barn
        crate(scene, id(), L.x - 10, L.z - 1, 'farm'); crate(scene, id(), L.x + 12, L.z - 6, 'farm'); crate(scene, id(), L.x + 15, L.z - 2, 'farm');
        for (let i = 0; i < 18; i++) prop(scene, new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10), 0xd4b25a, L.x - 18 + (i % 6) * 4, L.z + 14 + Math.floor(i / 6) * 4, 0.6, 0.8, 0).rotation.z = Math.PI / 2;
        break;
      }
      case 'hospital': {
        building(scene, L.x, L.z - 4, 26, 16, 7, 0xe6e9ec, 0x9aa3a8);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.2), M(0xc0392b)); cross.position.set(L.x, heightAt(L.x, L.z) + 5.8, L.z + 4.15); scene.add(cross);
        const cross2 = cross.clone(); cross2.scale.set(0.27, 3.75, 1); scene.add(cross2);
        for (let i = 0; i < 5; i++) crate(scene, id(), L.x - 10 + i * 5, L.z - 9 + (i % 2) * 4, 'hospital');
        car(scene, L.x + 8, L.z + 12, 0.2, 0xffffff); car(scene, L.x - 9, L.z + 14, 2.6, 0x7a2020);
        break;
      }
      case 'military': {
        for (const [dx, dz] of [[-15, -15], [15, -15], [-15, 12]]) { building(scene, L.x + dx, L.z + dz, 12, 7, 3.6, 0x5d6b47, 0x3d4630); crate(scene, id(), L.x + dx - 2, L.z + dz - 1, 'military'); crate(scene, id(), L.x + dx + 3, L.z + dz - 1, 'military'); }
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (i === 4) continue; prop(scene, new THREE.BoxGeometry(8, 3, 0.5), 0x707070, L.x + Math.sin(a) * L.r * 0.95, L.z + Math.cos(a) * L.r * 0.95, 1.5, 0, a + Math.PI / 2); }
        prop(scene, new THREE.BoxGeometry(3, 2, 6), 0x3d4a2a, L.x + 14, L.z + 12, 1, 2.2);
        break;
      }
      case 'mall': {
        building(scene, L.x, L.z - 6, 30, 18, 6, 0xbfb6a8, 0x6b6b6b);
        for (let i = 0; i < 6; i++) crate(scene, id(), L.x - 12 + i * 5, L.z - 10 + (i % 2) * 5, 'mall');
        for (let i = 0; i < 6; i++) car(scene, L.x - 15 + i * 6, L.z + 16 + (i % 2) * 6, (i % 2) * Math.PI + 0.1, [0x7a2020, 0x204a7a, 0x777777, 0x2f5a2f, 0xb08a20, 0x222222][i]);
        break;
      }
      case 'lab': {
        building(scene, L.x, L.z, 18, 12, 5, 0xd0d6dc, 0x2c3e50);
        for (let i = 0; i < 3; i++) crate(scene, id(), L.x - 5 + i * 5, L.z - 3, 'lab');
        break;
      }
      case 'camp': {   // Haven — tents and a palisade
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; prop(scene, new THREE.ConeGeometry(2.4, 2.6, 4), 0x5a7a4a, L.x + Math.sin(a) * 12, L.z + Math.cos(a) * 12, 1.3, 2, a); }
        palisade(scene, L, 0x6b4f33);
        prop(scene, new THREE.CylinderGeometry(0.8, 1, 0.4, 8), 0x333333, L.x, L.z, 0.2, 0.9);
        break;
      }
      case 'raider': {  // Iron Wolves — scrap walls and containers
        for (const [dx, dz, ry] of [[-10, -8, 0], [10, -8, 0], [0, -14, Math.PI / 2], [-12, 8, 1]]) prop(scene, new THREE.BoxGeometry(2.6, 2.6, 7), [0x8a3b2a, 0x2a4a8a, 0x777744, 0x555555][Math.abs(dx) % 4], L.x + dx, L.z + dz, 1.3, 0, ry);
        for (const [dx, dz] of [[-10, -8], [10, -8], [0, -14], [-12, 8]]) addCircle(L.x + dx, L.z + dz, 2.5);
        palisade(scene, L, 0x5a5550);
        break;
      }
      case 'tower': {  // The Order — radio mast and a chapel
        prop(scene, new THREE.CylinderGeometry(0.3, 1.2, 40, 4), 0x8a8a8a, L.x + 8, L.z - 8, 20, 1.3);
        building(scene, L.x - 6, L.z, 10, 12, 5, 0xf0ece0, 0x5a2e2e);
        palisade(scene, L, 0xdedad0);
        break;
      }
    }
  }
}

function palisade(scene, L, color) {
  const n = 22;
  for (let i = 0; i < n; i++) {
    if (i === 0) continue; // gate facing +z
    const a = i / n * Math.PI * 2, R = L.r * 0.9;
    const x = L.x + Math.sin(a) * R, z = L.z + Math.cos(a) * R;
    prop(scene, new THREE.BoxGeometry(2 * Math.PI * R / n + 0.2, 2.8, 0.5), color, x, z, 1.4, 0, a + Math.PI / 2);
    addCircle(x, z, 1.6);
  }
}

/* ---------- Exploring: discovery, roofs, location hordes ---------- */
export const locationSystem = {
  update(dt) {
    const P = G.player, w = G.save.world;
    for (const L of LOCATIONS) {
      const d = Math.hypot(P.pos.x - L.x, P.pos.z - L.z);
      if (d < L.r + 10 && !w.discovered.includes(L.id)) {
        w.discovered.push(L.id);
        banner(L.name, 'DISCOVERED'); sfx.discover();
        G.emit('discover', L);
      }
      // A horde waits in dangerous places when you arrive
      if (d < L.r + 60 && d > L.r + 30 && !L.faction && !L._spawned) {
        L._spawned = true;
        const n = { military: 10, hospital: 7, mall: 8, lab: 6, town: 6 }[L.type] || 3;
        spawnGroup(L.x, L.z, n, L.type === 'military' ? ['walker', 'runner', 'brute'] : ['walker', 'walker', 'runner']);
      }
      if (d > L.r + 200) L._spawned = false;
    }
    let inAny = false;
    for (const b of buildings) {
      const inside = Math.abs(P.pos.x - b.x) < b.hw + 0.5 && Math.abs(P.pos.z - b.z) < b.hd + 0.5;
      b.roof.visible = !inside; if (inside) inAny = true;
    }
    P.camDist += ((inAny ? 3.6 : 7) - P.camDist) * Math.min(1, dt * 4);
  }
};
