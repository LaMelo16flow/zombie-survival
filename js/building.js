import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { pressed, addTouchButton, isTouch } from './input.js';
import { heightAt, addOBox, addCircle, removeCollider } from './world.js';
import { addInteractable, removeInteractable } from './interact.js';
import { toon, paint, merge } from './style.js';
import { toast, showChoice, showModal, closeModal, icon } from './ui.js';
import { zombies, hitZombie } from './zombies.js';
import { sfx } from './audio.js';
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
  chest: { name: 'Storage box', cost: { wood: 4 }, hp: 80, size: [1.2, 0.8], desc: 'Store items safely' }
};
const ORDER = Object.keys(PIECES);

/* ---------- Models (one merged mesh each, anime wood) ---------- */
const WOOD = 0xb0773f, WOOD_D = 0x7a4f2a, METAL = 0x9aa3ad;
function model(type, open = false) {
  const g = [];
  if (type === 'wall' || type === 'door') {
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
  if (data.type === 'fire') {
    r.light = new THREE.PointLight(0xffa040, 0, 14, 1.6); r.light.position.set(data.x, mesh.position.y + 1, data.z); G.scene.add(r.light);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), new THREE.MeshBasicMaterial({ color: 0xffb030 }));
    fl.position.set(data.x, mesh.position.y + 0.5, data.z); G.scene.add(fl); r.flame = fl;
  }
  const actions = {
    door: { label: () => data.open ? 'Close door' : 'Open door', action: () => toggleDoor(r) },
    bed: { label: () => 'Sleep', action: () => sleep() },
    bench: { label: () => 'Use workbench', action: () => craftMenu() },
    chest: { label: () => 'Open storage box', action: () => openChest(data) },
    fire: { label: () => 'Warm up by the fire', action: () => toast('The fire heals you while you stay close.') }
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
function toggleDoor(r) {
  r.data.open = !r.data.open;
  G.scene.remove(r.mesh); r.mesh = model('door', r.data.open); r.mesh.position.set(r.data.x, heightAt(r.data.x, r.data.z), r.data.z); r.mesh.rotation.y = r.data.rot; G.scene.add(r.mesh);
  if (r.coll) { removeCollider(r.coll); r.coll = null; }
  if (!r.data.open) r.coll = addOBox(r.data.x, r.data.z, 3, 0.4, r.data.rot);
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
const RECIPES = [
  { name: '6 ammo', cost: { scrap: 3 }, give: inv => { inv.ammo += 6; } },
  { name: '1 meds (bandages)', cost: { scrap: 1, water: 1 }, give: inv => { inv.meds += 1; } },
  { name: 'Machete', cost: { scrap: 5, wood: 2 }, give: inv => { inv.melee = 'machete'; }, show: inv => inv.melee !== 'machete' },
  { name: 'Pistol', cost: { scrap: 8, wood: 1 }, give: inv => { inv.gun = inv.gun || 'pistol'; inv.ammo += 4; }, show: inv => !inv.gun },
  { name: 'Rifle', cost: { scrap: 14, wood: 3 }, give: inv => { inv.gun = 'rifle'; inv.ammo += 6; }, show: inv => inv.gun !== 'rifle' },
  { name: '4 wood (break scrap crates)', cost: { scrap: 2 }, give: inv => { inv.wood += 4; } }
];
function craftMenu() {
  const inv = G.save.inv;
  showChoice('Workbench', `You have ${inv.wood} wood, ${inv.scrap} scrap, ${inv.water} water.`, [
    ...RECIPES.filter(r => !r.show || r.show(inv)).map(r => ({ label: `Craft ${r.name}`, note: costText(r.cost), disabled: !has(r.cost),
      fn: () => { pay(r.cost); r.give(inv); sfx.pickup(); toast(`Crafted <b>${r.name}</b>`); craftMenu(); } })),
    { label: 'Done' }
  ]);
}
const STORE = ['food', 'water', 'meds', 'wood', 'scrap', 'ammo'];
function openChest(data) {
  data.stash = data.stash || {};
  const inv = G.save.inv, st = data.stash;
  showModal(`<div class="panel"><h2>Storage box</h2><p>Keep spare supplies at your base.</p>
    ${STORE.map(k => `<div class="row"><span>${icon(k)} ${k}</span><span>bag ${inv[k] || 0} · box ${st[k] || 0}
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
  toast(isTouch ? 'Build mode — pick a piece, ROT to turn, PLACE to build' : 'Build mode — 1-7 pick · T rotate · F / click place · X remove · B exit', 3);
}
function exit() { building = false; G.building = false; bar.classList.add('hidden'); if (ghost) { G.scene.remove(ghost); ghost = null; ghostType = null; } }
function renderBar() {
  bar.innerHTML = ORDER.map((k, i) => { const p = PIECES[k]; return `<button class="bp ${i === sel ? 'on' : ''}" data-p="${i}" ${has(p.cost) ? '' : 'data-poor="1"'}>
    <b>${i + 1} · ${p.name}</b><small>${costText(p.cost)}</small></button>`; }).join('') +
    (isTouch ? `<button class="bp act" data-a="rot"><b>ROT</b></button><button class="bp act" data-a="place"><b>PLACE</b></button><button class="bp act" data-a="del"><b>REMOVE</b></button><button class="bp act" data-a="exit"><b>EXIT</b></button>` : '');
  bar.querySelectorAll('[data-p]').forEach(b => b.onpointerdown = e => { e.stopPropagation(); sel = +b.dataset.p; renderBar(); });
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
    G.save.builds = G.save.builds || [];
    for (const b of G.save.builds) spawnPiece(b);
    bar = document.createElement('div'); bar.id = 'buildbar'; bar.className = 'hidden';
    document.body.appendChild(bar);
    addTouchButton('BUILD', 'build', true);
    G.on('newDay', () => { for (const r of placed) if (r.data.type === 'spikes') r.data.hp = PIECES.spikes.hp; });
  },
  update(dt) {
    if (pressed('build')) building ? exit() : enter();
    const P = G.player.pos;
    // campfires: flicker, light at night, heal nearby
    for (const r of placed) if (r.light) {
      const night = G.save.world.hour >= 19 || G.save.world.hour < 6.5;
      r.light.intensity = (night ? 18 : 4) + Math.sin(G.time * 13 + r.data.x) * 2;
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
    if (pressed('slot1')) sel = 0; if (pressed('slot2')) sel = 1; if (pressed('slot3')) sel = 2;
    for (let i = 4; i <= 7; i++) if (pressed('slot' + i)) sel = i - 1;
    if (pressed('slot1') || pressed('slot2') || pressed('slot3') || [4, 5, 6, 7].some(i => pressed('slot' + i))) renderBar();
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
