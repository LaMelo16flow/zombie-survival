import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { pressed, addTouchButton, isTouch } from './input.js';
import { heightAt, addOBox, addCircle, removeCollider } from './world.js';
import { addInteractable, removeInteractable } from './interact.js';
import { toon, paint, merge } from './style.js';
import { toast, showChoice, showModal, closeModal, icon } from './ui.js';
import { zombies, hitZombie } from './zombies.js';
import { sfx } from './audio.js';
import { ITEMS } from './items.js';
import { burst } from './effects.js';

/*
  BASE BUILDING — press B (BUILD on iPhone).
  Pick a piece, it appears as a ghost in front of you (green = OK, red = can't), rotate, place.
  Walls and doors block zombies (they will claw through them, so repair!), spike traps hurt them,
  campfires heal you and light the night, beds let you sleep, the workbench crafts, boxes store loot.
  Everything is saved with your game (and to GitHub).
*/

const MAT = toon(0xffffff, { vertexColors: true });
const P = paint;
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export const PIECES = {
  wall:  { name: 'Wall', cost: { wood: 4 }, hp: 160, size: [3, 0.4], blocks: true, desc: 'Blocks zombies' },
  door:  { name: 'Door', cost: { wood: 3, scrap: 1 }, hp: 140, size: [3, 0.4], blocks: true, desc: 'Open/close with USE' },
  spikes:{ name: 'Spike trap', cost: { wood: 2, scrap: 2 }, hp: 60, size: [2, 2], desc: 'Hurts zombies that step on it' },
  fire:  { name: 'Campfire', cost: { wood: 3 }, hp: 50, size: [1.4, 1.4], desc: 'Light + heals you nearby' },
  bed:   { name: 'Bed', cost: { wood: 5 }, hp: 60, size: [1.2, 2.2], desc: 'Sleep until morning' },
  bench: { name: 'Workbench', cost: { wood: 4, scrap: 4 }, hp: 80, size: [2, 1], desc: 'Craft ammo, meds, weapons' },
  chest: { name: 'Storage box', cost: { wood: 4 }, hp: 80, size: [1.2, 0.8], desc: 'Store items safely' },
  forge: { name: 'Forge', cost: { stone: 12, scrap: 4, wood: 4 }, hp: 200, size: [1.8, 1.8], desc: 'Smelt metal, tier 2–3 gear' },
  snare: { name: 'Snare', cost: { wood: 2, rope: 1 }, hp: 30, size: [1, 1], desc: 'Catches rabbits overnight' },
  stand: { name: 'Hunting stand', cost: { wood: 8, rope: 1 }, hp: 150, size: [2, 2], desc: 'Climb up: zombies can\'t reach you, animals don\'t notice you' },
  tanning: { name: 'Tanning rack', cost: { wood: 4, rope: 1 }, hp: 60, size: [2, 0.6], desc: 'Turn hides into leather' },
  smoke: { name: 'Smokehouse', cost: { wood: 6, stone: 4 }, hp: 120, size: [1.8, 1.8], desc: 'Smoke meat into jerky' }
};
Object.assign(PIECES, {
  stonewall: { name: 'Stone wall', cost: { stone: 6 }, hp: 420, size: [3, 0.6], blocks: true, desc: 'Very strong wall' },
  gate:      { name: 'Metal gate', cost: { metal: 3, scrap: 2 }, hp: 450, size: [3, 0.4], blocks: true, desc: 'Strong door' },
  barricade: { name: 'Barricade', cost: { wood: 3, scrap: 1 }, hp: 110, size: [3, 0.7], blocks: true, desc: 'Cheap low wall' },
  tower:     { name: 'Watchtower', cost: { wood: 10, stone: 4, rope: 1 }, hp: 300, size: [2.6, 2.6], desc: 'Climb up and see far; zombies can\'t reach you' },
  torch:     { name: 'Torch post', cost: { wood: 2, cloth: 1 }, hp: 30, size: [0.5, 0.5], desc: 'Lights your base at night' },
  garden:    { name: 'Garden plot', cost: { wood: 3 }, hp: 60, size: [2.4, 2.4], desc: 'Plant seeds, harvest vegetables in 2 days' },
  rain:      { name: 'Rain collector', cost: { wood: 4, cloth: 2, scrap: 2 }, hp: 80, size: [1.6, 1.6], desc: 'Clean water every day (more when it rains)' }
});
const ORDER = Object.keys(PIECES);
const CATS = {
  Defense: ['wall', 'stonewall', 'barricade', 'door', 'gate', 'spikes', 'tower'],
  Survival: ['fire', 'bed', 'chest', 'torch', 'garden', 'rain'],
  Crafting: ['bench', 'forge', 'tanning', 'smoke'],
  Hunting: ['snare', 'stand']
};
let cat = 'Defense';

/* ---------- Models (one merged mesh each, anime wood) ---------- */
const WOOD = 0xb0773f, WOOD_D = 0x7a4f2a, METAL = 0x9aa3ad;
function model(type, open = false) {
  const g = [];
  if (type === 'stonewall') {
    for (let row = 0; row < 4; row++) for (let i = 0; i < 4; i++) { const w = row % 2 ? 0.75 : 0.72; g.push(P(box(w - 0.04, 0.58, 0.6, -1.125 + i * 0.75 + (row % 2 ? 0.2 : 0), 0.3 + row * 0.6, 0), [0xb9b2a6, 0xa7a196, 0x9c958c][(row + i) % 3])); }
  } else if (type === 'gate') {
    for (const x of [-1.4, 1.4]) g.push(P(box(0.25, 2.8, 0.3, x, 1.4), 0x5a6068));
    if (!open) { g.push(P(box(2.6, 2.3, 0.12, 0, 1.25), 0x8a939c)); for (let i = 0; i < 5; i++) g.push(P(box(0.08, 2.3, 0.2, -1 + i * 0.5, 1.25), 0x5a6068)); g.push(P(box(2.6, 0.12, 0.2, 0, 1.25), 0x5a6068)); }
    g.push(P(box(3, 0.25, 0.3, 0, 2.7), 0x5a6068));
  } else if (type === 'barricade') {
    for (const x of [-1.2, 0, 1.2]) g.push(P(box(0.15, 1.2, 0.15, x, 0.5, 0).rotateZ(0.15 * (x || 1)), WOOD_D));
    for (let i = 0; i < 3; i++) g.push(P(box(3, 0.25, 0.15, 0, 0.3 + i * 0.35, 0.1).rotateZ((i - 1) * 0.04), i % 2 ? WOOD : 0xc08a50));
    g.push(P(box(0.5, 0.6, 0.5, 0.9, 0.3, -0.25), 0x8a939c));
  } else if (type === 'tower') {
    for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) g.push(P(box(0.25, 6, 0.25, x, 3, z), WOOD_D));
    for (const y of [1.5, 3.5]) { g.push(P(box(2.4, 0.12, 0.12, 0, y, 1.1).rotateZ(0.5), WOOD)); g.push(P(box(2.4, 0.12, 0.12, 0, y, -1.1).rotateZ(-0.5), WOOD)); }
    g.push(P(box(2.8, 0.2, 2.8, 0, 6, 0), WOOD)); for (const [x, z, w, d] of [[0, -1.35, 2.8, 0.12], [-1.35, 0, 0.12, 2.8], [1.35, 0, 0.12, 2.8]]) g.push(P(box(w, 0.8, d, x, 6.5, z), WOOD));
    for (let i = 0; i < 11; i++) g.push(P(box(0.7, 0.07, 0.07, 0, 0.4 + i * 0.52, 1.25), WOOD));
  } else if (type === 'torch') {
    g.push(P(box(0.14, 2, 0.14, 0, 1), WOOD_D)); g.push(P(box(0.3, 0.2, 0.3, 0, 2.05), 0x5a4636));
  } else if (type === 'garden') {
    g.push(P(box(2.4, 0.25, 2.4, 0, 0.12), 0x6b4a2b)); for (const [x, z, w, d] of [[0, 1.2, 2.5, 0.12], [0, -1.2, 2.5, 0.12], [1.2, 0, 0.12, 2.5], [-1.2, 0, 0.12, 2.5]]) g.push(P(box(w, 0.35, d, x, 0.17, z), WOOD));
    for (let i = 0; i < 3; i++) g.push(P(box(2, 0.08, 0.3, 0, 0.27, -0.7 + i * 0.7), 0x4a3320));
  } else if (type === 'rain') {
    for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6]) g.push(P(box(0.1, 1.6, 0.1, x, 0.8, z), WOOD_D));
    g.push(P(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 10).translate(0, 0.5, 0), 0x4a6fa5)); g.push(P(new THREE.ConeGeometry(0.9, 0.4, 4).rotateX(Math.PI).rotateY(Math.PI / 4).translate(0, 1.7, 0), 0xe8e4d8));
  } else if (type === 'wall' || type === 'door') {
    for (const x of [-1.4, 1.4]) g.push(P(box(0.25, 2.6, 0.3, x, 1.3), WOOD_D));
    if (type === 'wall') for (let i = 0; i < 5; i++) g.push(P(box(2.9, 0.42, 0.22, 0, 0.3 + i * 0.47, (i % 2) * 0.04), i % 2 ? WOOD : 0xc08a50));
    else {
      g.push(P(box(2.9, 0.3, 0.3, 0, 2.45), WOOD_D));
      if (!open) { for (let i = 0; i < 4; i++) g.push(P(box(0.6, 2.2, 0.15, -0.9 + i * 0.6, 1.15), i % 2 ? WOOD : 0xc08a50)); g.push(P(box(2.4, 0.18, 0.2, 0, 1.6, 0.05), WOOD_D)); g.push(P(box(0.12, 0.12, 0.25, 0.9, 1.1, 0.1), METAL)); }
    }
    g.push(P(box(2.6, 0.12, 0.26, 0, 2.35, 0.03).rotateZ(0.0), WOOD_D));
  } else if (type === 'spikes') {
    g.push(P(box(2, 0.15, 2, 0, 0.07), WOOD_D));
    for (let i = 0; i < 9; i++) { const c = new THREE.ConeGeometry(0.1, 0.6, 5); c.translate(-0.65 + (i % 3) * 0.65, 0.4, -0.65 + Math.floor(i / 3) * 0.65); g.push(P(c, METAL)); }
  } else if (type === 'fire') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, s = new THREE.DodecahedronGeometry(0.2, 0); s.translate(Math.sin(a) * 0.6, 0.12, Math.cos(a) * 0.6); g.push(P(s, 0x8a8a8a)); }
    for (let i = 0; i < 3; i++) g.push(P(box(0.14, 0.14, 1.1, 0, 0.15, 0).rotateY(i * 1.05), WOOD_D));
  } else if (type === 'bed') {
    g.push(P(box(1.2, 0.35, 2.2, 0, 0.25), WOOD_D)); g.push(P(box(1.1, 0.2, 2.1, 0, 0.5), 0xe8e4e0));
    g.push(P(box(1.1, 0.12, 1.3, 0, 0.62, 0.35), 0x4a6fa5)); g.push(P(box(0.7, 0.18, 0.4, 0, 0.66, -0.75), 0xffffff));
  } else if (type === 'bench') {
    g.push(P(box(2, 0.15, 1, 0, 0.95), WOOD)); for (const x of [-0.85, 0.85]) for (const z of [-0.4, 0.4]) g.push(P(box(0.12, 0.95, 0.12, x, 0.47, z), WOOD_D));
    g.push(P(box(0.4, 0.3, 0.3, -0.5, 1.15), METAL)); g.push(P(box(0.6, 0.05, 0.1, 0.4, 1.06, 0.2), 0xc9372c));
  } else if (type === 'forge') {
    g.push(P(box(1.8, 1.2, 1.8, 0, 0.6), 0x8f8a84)); g.push(P(box(1.9, 0.2, 1.9, 0, 1.25), 0x6d6863));
    g.push(P(box(0.8, 0.55, 0.1, 0, 0.55, 0.9), 0xff7a2a)); g.push(P(box(0.5, 1.6, 0.5, 0.5, 2.1, -0.5), 0x6d6863));
    for (let i = 0; i < 6; i++) g.push(P(box(0.36, 0.2, 0.05, -0.6 + (i % 3) * 0.6, 0.25 + Math.floor(i / 3) * 0.6, 0.91), 0x7a746e));
  } else if (type === 'snare') {
    g.push(P(box(0.08, 0.6, 0.08, -0.35, 0.3, 0), WOOD_D), P(box(0.08, 0.6, 0.08, 0.35, 0.3, 0), WOOD_D), P(box(0.8, 0.05, 0.05, 0, 0.55, 0), WOOD));
    g.push(P(new THREE.TorusGeometry(0.22, 0.02, 4, 12).rotateX(Math.PI / 2).translate(0, 0.05, 0.1), 0xd8c08e));
  } else if (type === 'stand') {
    for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) g.push(P(box(0.15, 3.6, 0.15, x, 1.8, z), WOOD_D));
    g.push(P(box(2, 0.15, 2, 0, 3.6, 0), WOOD)); for (const [x, z, w, d] of [[0, -0.95, 2, 0.1], [-0.95, 0, 0.1, 2], [0.95, 0, 0.1, 2]]) g.push(P(box(w, 0.6, d, x, 3.95, z), WOOD));
    for (let i = 0; i < 7; i++) g.push(P(box(0.6, 0.06, 0.06, 0, 0.4 + i * 0.5, 1.0), WOOD));
  } else if (type === 'tanning') {
    for (const x of [-0.9, 0.9]) g.push(P(box(0.1, 1.8, 0.1, x, 0.9, 0), WOOD_D));
    g.push(P(box(1.9, 0.08, 0.08, 0, 1.75, 0), WOOD)); g.push(P(box(1.4, 1.2, 0.04, 0, 1.0, 0), 0xc4a27a));
  } else if (type === 'smoke') {
    g.push(P(box(1.6, 1.8, 1.6, 0, 0.9, 0), WOOD)); g.push(P(new THREE.ConeGeometry(1.25, 0.9, 4).rotateY(Math.PI / 4).translate(0, 2.25, 0), WOOD_D));
    g.push(P(box(0.6, 0.9, 0.08, 0, 0.6, 0.81), WOOD_D)); g.push(P(box(0.3, 0.6, 0.3, 0.4, 2.6, 0.3), 0x8f8a84));
  } else if (type === 'chest') {
    g.push(P(box(1.2, 0.6, 0.8, 0, 0.3), WOOD)); g.push(P(box(1.24, 0.15, 0.84, 0, 0.68), WOOD_D)); g.push(P(box(0.16, 0.2, 0.05, 0, 0.5, 0.42), METAL));
  }
  const m = new THREE.Mesh(merge(g), MAT); m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ---------- Placed pieces ---------- */
const placed = [];   // runtime: { data, mesh, coll, inter, light, flame }
const has = cost => Object.entries(cost).every(([k, v]) => (G.save.inv[k] || 0) >= v);
const pay = cost => { for (const [k, v] of Object.entries(cost)) G.save.inv[k] -= v; };
const costText = cost => Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(' + ');

function spawnPiece(data) {
  const def = PIECES[data.type];
  const mesh = model(data.type, data.open);
  mesh.position.set(data.x, heightAt(data.x, data.z), data.z); mesh.rotation.y = data.rot;
  G.scene.add(mesh);
  const r = { data, mesh };
  if (def.blocks && !data.open) r.coll = addOBox(data.x, data.z, def.size[0], def.size[1], data.rot);
  if (data.type === 'bed' || data.type === 'bench' || data.type === 'chest') r.coll = addCircle(data.x, data.z, 0.6);
  if (data.type === 'forge' || data.type === 'smoke') r.coll = addCircle(data.x, data.z, 1);
  if (data.type === 'tanning') r.coll = addOBox(data.x, data.z, 2, 0.4, data.rot);
  if (data.type === 'tower') { r.coll = addCircle(data.x, data.z, 1.4);
    const rg = [P(new THREE.ConeGeometry(2.3, 1.4, 4).rotateY(Math.PI / 4).translate(0, 8.3, 0), 0xc0574a)]; for (const x of [-1.25, 1.25]) for (const z of [-1.25, 1.25]) rg.push(P(box(0.12, 1.6, 0.12, x, 6.9, z), WOOD_D));
    r.roof = new THREE.Mesh(merge(rg), MAT); r.roof.castShadow = true; mesh.add(r.roof); }
  if (data.type === 'rain') r.coll = addCircle(data.x, data.z, 0.7);
  if (data.type === 'torch') { if (placed.filter(p => p.light).length < 6) { r.light = new THREE.PointLight(0xffb060, 0, 16, 1.5); r.light.position.set(data.x, mesh.position.y + 2.3, data.z); G.scene.add(r.light); }
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 5), new THREE.MeshBasicMaterial({ color: 0xffb030 })); fl.position.set(data.x, mesh.position.y + 2.35, data.z); G.scene.add(fl); r.flame = fl; }
  if (data.type === 'garden') setTimeout(() => refreshGarden(r));
  if (data.type === 'fire') {
    if (placed.filter(p => p.light).length < 6) { r.light = new THREE.PointLight(0xffa040, 0, 14, 1.6); r.light.position.set(data.x, mesh.position.y + 1, data.z); G.scene.add(r.light); }
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
    fl.position.set(data.x, mesh.position.y + 0.5, data.z); G.scene.add(fl); r.flame = fl;
  }
  const actions = {
    door: { label: () => data.open ? 'Close door' : 'Open door', action: () => toggleDoor(r) },
    gate: { label: () => data.open ? 'Close gate' : 'Open gate', action: () => toggleDoor(r) },
    tower: { label: () => G.player.elevated ? 'Climb down' : 'Climb the watchtower', action: () => climb(data, 6.1) },
    garden: { label: () => !data.planted ? 'Plant seeds (2 seeds)' : G.save.world.day >= data.planted + 2 ? 'Harvest vegetables' : `Growing… ready on day ${data.planted + 2}`, action: () => garden(r) },
    rain: { label: () => `Rain collector — ${data.stock || 0} water`, action: () => { const n = data.stock || 0; if (!n) return toast('Empty. It fills up a little every day.'); G.save.inv.water += n; data.stock = 0; toast(`+${n} water`); sfx.pickup(); } },
    bed: { label: () => 'Sleep', action: () => sleep() },
    bench: { label: () => 'Use workbench', action: () => G.openCrafting('bench') },
    forge: { label: () => 'Use forge', action: () => G.openCrafting('forge') },
    tanning: { label: () => 'Use tanning rack', action: () => G.openCrafting('tanning') },
    smoke: { label: () => 'Use smokehouse', action: () => G.openCrafting('smoke') },
    snare: { label: () => data.caught ? 'Collect your catch' : 'Snare (check back tomorrow)', action: () => {
      if (!data.caught) return toast('Nothing yet. Snares catch rabbits overnight.');
      data.caught = false; G.save.inv.rawmeat = (G.save.inv.rawmeat || 0) + 1; G.save.inv.hide = (G.save.inv.hide || 0) + 1; toast('A rabbit! +1 raw meat, +1 hide'); sfx.pickup(); } },
    stand: { label: () => G.player.elevated ? 'Climb down' : 'Climb the hunting stand', action: () => climb(data, 3.7) },
    chest: { label: () => 'Open storage box', action: () => openChest(data) },
    fire: { label: () => 'Cook at the campfire', action: () => G.openCrafting('fire') }
  }[data.type];
  if (actions) r.inter = addInteractable({ x: data.x, z: data.z, r: 2.2, ...actions });
  placed.push(r);
  return r;
}
function removePiece(r, refund = false) {
  G.scene.remove(r.mesh); if (r.coll) removeCollider(r.coll); if (r.inter) removeInteractable(r.inter);
  if (r.light) G.scene.remove(r.light); if (r.flame) G.scene.remove(r.flame);
  placed.splice(placed.indexOf(r), 1);
  G.save.builds = G.save.builds.filter(b => b !== r.data);
  if (refund) for (const [k, v] of Object.entries(PIECES[r.data.type].cost)) G.save.inv[k] += Math.floor(v / 2);
}
function climb(data, h) {
  const P = G.player;
  if (P.elevated) { P.elevated = null; P.pos.x = data.x + Math.sin(data.rot) * 2.2; P.pos.z = data.z + Math.cos(data.rot) * 2.2; }
  else P.elevated = { x: data.x, z: data.z, y: heightAt(data.x, data.z) + h };
}
function garden(r) {
  const d = r.data, inv = G.save.inv;
  if (!d.planted) { if ((inv.seeds || 0) < 2) return toast('You need 2 seeds (pick bushes or search farms).'); inv.seeds -= 2; d.planted = G.save.world.day; toast('Planted. Come back in 2 days.'); return refreshGarden(r); }
  if (G.save.world.day < d.planted + 2) return toast('Still growing.');
  inv.veg = (inv.veg || 0) + 4; inv.seeds = (inv.seeds || 0) + 1; d.planted = 0; toast('+4 vegetables, +1 seeds'); sfx.pickup(); refreshGarden(r);
}
const sproutGeo = merge([0, 1, 2].map(i => paint(new THREE.ConeGeometry(0.12, 0.5, 4).translate(0, 0.25, 0).rotateY(i).translate(Math.cos(i * 2) * 0.08, 0, Math.sin(i * 2) * 0.08), 0x6cb24e)));
function refreshGarden(r) {
  if (r.sprouts) { r.mesh.remove(r.sprouts); r.sprouts = null; }
  const d = r.data; if (!d.planted) return;
  const grown = Math.min(1, (G.save.world.day - d.planted + 0.3) / 2);
  const grp = new THREE.Group();
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(sproutGeo, MAT); m.position.set(-0.7 + (i % 3) * 0.7, 0.28, -0.7 + Math.floor(i / 3) * 0.7); m.scale.setScalar(0.4 + grown * 1.2); grp.add(m); }
  r.mesh.add(grp); r.sprouts = grp;
}
function toggleDoor(r) {
  r.data.open = !r.data.open;
  G.scene.remove(r.mesh); r.mesh = model(r.data.type, r.data.open); r.mesh.position.set(r.data.x, heightAt(r.data.x, r.data.z), r.data.z); r.mesh.rotation.y = r.data.rot; G.scene.add(r.mesh);
  if (r.coll) { removeCollider(r.coll); r.coll = null; }
  if (!r.data.open) r.coll = addOBox(r.data.x, r.data.z, 3, 0.4, r.data.rot);
  r.coll && (r.coll.piece = r);
  sfx.ui();
}

/* ---------- Bed, workbench, storage ---------- */
function sleep() {
  const P = G.player.pos;
  if (zombies.some(z => z.alive && Math.hypot(z.pos.x - P.x, z.pos.z - P.z) < 25)) return toast('You can\'t sleep with zombies nearby!');
  const w = G.save.world; if (w.hour > 7) { w.day++; G.emit('newDay', w.day); } w.hour = 7;
  const s = G.save.stats; s.hp = s.maxHp; s.hunger = Math.max(0, s.hunger - 15); s.thirst = Math.max(0, s.thirst - 20);
  G.banner?.('Day ' + w.day, 'YOU WAKE UP RESTED');
}
const STORE = ['food', 'water', 'meds', 'meat', 'wood', 'stone', 'scrap', 'metal', 'cloth', 'leather', 'ammo', 'bolts'];
function openChest(data) {
  data.stash = data.stash || {};
  const inv = G.save.inv, st = data.stash;
  showModal(`<div class="panel"><h2>Storage box</h2><p>Keep spare supplies at your base.</p>
    ${STORE.map(k => `<div class="row"><span>${icon(ITEMS[k].icon)} ${ITEMS[k].name}</span><span>bag ${inv[k] || 0} · box ${st[k] || 0}
      <button class="small" data-in="${k}" ${inv[k] ? '' : 'disabled'}>Put in</button> <button class="small" data-out="${k}" ${st[k] ? '' : 'disabled'}>Take</button></span></div>`).join('')}
    <button class="primary" id="ch-close">Close</button></div>`);
  document.querySelectorAll('[data-in]').forEach(b => b.onclick = () => { const k = b.dataset.in; st[k] = (st[k] || 0) + inv[k]; inv[k] = 0; openChest(data); });
  document.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { const k = b.dataset.out; inv[k] = (inv[k] || 0) + st[k]; st[k] = 0; openChest(data); });
  document.getElementById('ch-close').onclick = closeModal;
}

/* ---------- Build mode ---------- */
let building = false, sel = 0, rot = 0, ghost = null, ghostType = null, bar = null;
const ghostOK = new THREE.MeshBasicMaterial({ color: 0x7ad35a, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xe8364a, transparent: true, opacity: 0.45, depthWrite: false });

function ghostSpot() {
  const P = G.player, d = PIECES[ORDER[sel]].size[1] > 1.5 ? 3 : 2.6;
  const yaw = P.camYaw + Math.PI;
  let x = P.pos.x + Math.sin(yaw) * d, z = P.pos.z + Math.cos(yaw) * d;
  x = Math.round(x * 2) / 2; z = Math.round(z * 2) / 2;      // snap to half-metres
  // snap walls to the end of a nearby wall so they line up
  if (PIECES[ORDER[sel]].blocks) for (const r of placed) if (PIECES[r.data.type].blocks) {
    for (const s of [-1, 1]) {
      const ex = r.data.x + Math.cos(r.data.rot) * 3 * s, ez = r.data.z - Math.sin(r.data.rot) * 3 * s;
      if (Math.hypot(ex - x, ez - z) < 1.2 && Math.abs(((r.data.rot - rot) % Math.PI + Math.PI) % Math.PI) < 0.01) { x = ex; z = ez; }
    }
  }
  return { x, z };
}
function canPlace(x, z) {
  const def = PIECES[ORDER[sel]];
  if (!has(def.cost)) return false;
  if (heightAt(x, z) < 4.6) return false;    // not in water
  return !placed.some(r => Math.hypot(r.data.x - x, r.data.z - z) < 0.8);
}
function enter() {
  building = true; G.building = true; sel = Math.min(sel, ORDER.length - 1);
  bar.classList.remove('hidden'); renderBar();
  toast(isTouch ? 'Build mode — pick a piece, ROT to turn, PLACE to build' : 'Build mode — Z category · 1-7 pick · T rotate · F / click place · X remove · B exit', 3);
}
function exit() { building = false; G.building = false; bar.classList.add('hidden'); if (ghost) { G.scene.remove(ghost); ghost = null; ghostType = null; } }
function renderBar() {
  bar.innerHTML = Object.keys(CATS).map(c => `<button class="bp cat ${c === cat ? 'on' : ''}" data-cat="${c}"><b>${c}</b></button>`).join('') +
    CATS[cat].map((k, n) => { const i = ORDER.indexOf(k), p = PIECES[k]; return `<button class="bp ${i === sel ? 'on' : ''}" data-p="${i}" ${has(p.cost) ? '' : 'data-poor="1"'} title="${p.desc}">
    <b>${n + 1} · ${p.name}</b><small>${costText(p.cost)}</small></button>`; }).join('') +
    (isTouch ? `<button class="bp act" data-a="rot"><b>ROT</b></button><button class="bp act" data-a="place"><b>PLACE</b></button><button class="bp act" data-a="del"><b>REMOVE</b></button><button class="bp act" data-a="exit"><b>EXIT</b></button>` : '');
  bar.querySelectorAll('[data-p]').forEach(b => b.onpointerdown = e => { e.stopPropagation(); sel = +b.dataset.p; renderBar(); });
  bar.querySelectorAll('[data-cat]').forEach(b => b.onpointerdown = e => { e.stopPropagation(); cat = b.dataset.cat; sel = ORDER.indexOf(CATS[cat][0]); renderBar(); });
  bar.querySelectorAll('[data-a]').forEach(b => b.onpointerdown = e => { e.stopPropagation(); ({ rot: () => rot += Math.PI / 2, place, del: demolish, exit })[b.dataset.a](); });
}
function place() {
  const { x, z } = ghostSpot();
  if (!canPlace(x, z)) { toast(has(PIECES[ORDER[sel]].cost) ? 'Can\'t build there.' : `Need ${costText(PIECES[ORDER[sel]].cost)}.`, 1.5); return; }
  pay(PIECES[ORDER[sel]].cost);
  const data = { id: Date.now() + Math.random(), type: ORDER[sel], x, z, rot: rot % (Math.PI * 2), hp: PIECES[ORDER[sel]].hp };
  G.save.builds.push(data); spawnPiece(data);
  burst(x, heightAt(x, z) + 0.5, z, 0xc08a50, 8, 3, 0.12); sfx.hit();
  G.emit('built', data); renderBar();
}
function demolish() {
  const P = G.player.pos; let best = null, bd = 4;
  for (const r of placed) { const d = Math.hypot(r.data.x - P.x, r.data.z - P.z); if (d < bd) { bd = d; best = r; } }
  if (!best) return toast('Nothing to remove here.', 1.2);
  removePiece(best, true); toast(`Removed ${PIECES[best.data.type].name} (half refunded).`, 1.5); renderBar();
}

export const buildingSystem = {
  init() {
    G.nearStation = type => placed.some(r => r.data.type === type && Math.hypot(r.data.x - G.player.pos.x, r.data.z - G.player.pos.z) < 4.5);
    G.save.builds = G.save.builds || [];
    for (const b of G.save.builds) spawnPiece(b);
    bar = document.createElement('div'); bar.id = 'buildbar'; bar.className = 'hidden';
    document.body.appendChild(bar);
    addTouchButton('BUILD', 'build', true);
    G.on('newDay', () => { for (const r of placed) { if (r.data.type === 'spikes') r.data.hp = PIECES.spikes.hp; if (r.data.type === 'snare' && Math.random() < 0.6) r.data.caught = true;
      if (r.data.type === 'rain') r.data.stock = Math.min(8, (r.data.stock || 0) + 2 + ((G.weather?.rain || 0) > 0.3 ? 2 : 0)); if (r.data.type === 'garden') refreshGarden(r); } });
  },
  update(dt) {
    if (pressed('build')) building ? exit() : enter();
    const P = G.player.pos;
    // campfires: flicker, light at night, heal nearby
    for (const r of placed) if (r.roof) { const e = G.player.elevated; r.roof.visible = !(e && e.x === r.data.x && e.z === r.data.z); }
    for (const r of placed) if (r.flame) {
      const night = G.save.world.hour >= 19 || G.save.world.hour < 6.5;
      if (r.light) r.light.intensity = (night ? 18 : r.data.type === 'torch' ? 0 : 4) + Math.sin(G.time * 13 + r.data.x) * 2;
      if (r.data.type === 'torch') { r.flame.visible = night; continue; }
      r.flame.scale.set(1 + Math.sin(G.time * 17) * 0.1, 1 + Math.sin(G.time * 11) * 0.2, 1);
      if (Math.hypot(r.data.x - P.x, r.data.z - P.z) < 4) { const s = G.save.stats; s.hp = Math.min(s.maxHp, s.hp + dt * 1.2); }
    }
    // spike traps hurt zombies; zombies claw at walls they bump into
    for (const zb of zombies) {
      if (!zb.alive) continue;
      for (const r of placed) {
        const dx = zb.pos.x - r.data.x, dz = zb.pos.z - r.data.z;
        if (Math.abs(dx) > 3 || Math.abs(dz) > 3) continue;
        if (r.data.type === 'spikes' && r.data.hp > 0 && Math.abs(dx) < 1.1 && Math.abs(dz) < 1.1) {
          zb.spikeT = (zb.spikeT || 0) - dt;
          if (zb.spikeT <= 0) { zb.spikeT = 0.5; hitZombie(zb, 12, r.data.x, r.data.z, 1); r.data.hp -= 2; }
        }
        if (PIECES[r.data.type].blocks && !r.data.open && zb.state === 'chase') {
          const lx = dx * Math.cos(r.data.rot) - dz * Math.sin(r.data.rot), lz = dx * Math.sin(r.data.rot) + dz * Math.cos(r.data.rot);
          if (Math.abs(lx) < 1.7 && Math.abs(lz) < 0.9) {
            zb.clawT = (zb.clawT || 0) - dt;
            if (zb.clawT <= 0) { zb.clawT = 1.2; zb.atkAnim = 1; r.data.hp -= zb.k.dmg * 0.8;
              if (r.data.hp <= 0) { burst(r.data.x, heightAt(r.data.x, r.data.z) + 1, r.data.z, 0xc08a50, 14, 4, 0.16); sfx.splat(r.data.x, r.data.z); toast(`A ${PIECES[r.data.type].name.toLowerCase()} was broken!`, 2); removePiece(r); break; } }
          }
        }
      }
    }
    if (!building) return;
    for (let i = 1; i <= 9; i++) if (pressed('slot' + i) && CATS[cat][i - 1]) { sel = ORDER.indexOf(CATS[cat][i - 1]); renderBar(); }
    if (pressed('nextcat')) { const c = Object.keys(CATS); cat = c[(c.indexOf(cat) + 1) % c.length]; sel = ORDER.indexOf(CATS[cat][0]); renderBar(); }
    if (pressed('rotate')) rot += Math.PI / 2;
    if (pressed('attack')) place();
    if (pressed('demolish')) demolish();
    if (pressed('menu')) exit();
    const type = ORDER[sel];
    if (ghostType !== type) { if (ghost) G.scene.remove(ghost); ghost = model(type); ghost.castShadow = false; G.scene.add(ghost); ghostType = type; }
    const { x, z } = ghostSpot(), ok = canPlace(x, z);
    ghost.material = ok ? ghostOK : ghostBad;
    ghost.position.set(x, heightAt(x, z), z); ghost.rotation.y = rot;
  }
};
