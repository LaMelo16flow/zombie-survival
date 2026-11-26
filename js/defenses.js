import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { heightAt, addOBox, removeCollider } from './world.js';
import { addInteractable } from './interact.js';
import { toon, paint, merge } from './style.js';
import { toast } from './ui.js';
import { burst } from './effects.js';
import { sfx } from './audio.js';

/*
  BARRICADES & DEFENCES
  • Every house and building door can be boarded up (3 wood). Boards are solid: zombies must claw through
    them (you see them splinter); repair or take them down any time. Saved with your game.
  • Breakables: anything zombies can claw through when it blocks their way (boards, camp gates).
*/
const MAT = toon(0xffffff, { vertexColors: true });
export const doors = [];        // { id, x, z, y, w, rot } — filled while the world is built
export const breakables = [];   // { x, z, hw, hd, rot, hp, max, coll, mesh, onBreak, closed() }

export function registerDoor(id, x, z, w, rot = 0) { doors.push({ id, x, z, y: heightAt(x, z), w, rot }); }

/* ---------- Boards over a doorway ---------- */
function boardsMesh(w, hp, max) {
  const g = [], n = Math.max(1, Math.ceil(5 * hp / max));       // fewer planks as it gets damaged
  for (let i = 0; i < n; i++) {
    const tilt = (i % 2 ? 1 : -1) * (0.08 + (i * 37 % 7) * 0.02);
    g.push(paint(new THREE.BoxGeometry(w + 0.4, 0.28, 0.09).rotateZ(tilt).translate(0, 0.35 + i * 0.42, 0.05 * (i % 2)), i % 2 ? 0xb0773f : 0x8a5a30));
    g.push(paint(new THREE.BoxGeometry(0.08, 0.08, 0.1).translate(-w / 2, 0.35 + i * 0.42, 0.09), 0x9aa3ad));
    g.push(paint(new THREE.BoxGeometry(0.08, 0.08, 0.1).translate(w / 2, 0.35 + i * 0.42, 0.09), 0x9aa3ad));
  }
  const m = new THREE.Mesh(merge(g), MAT); m.castShadow = true; return m;
}
const saved = () => (G.save.world.boards = G.save.world.boards || {});
const BMAX = 140;

function board(d, hp = BMAX) {
  saved()[d.id] = hp;
  if (d.b) { G.scene.remove(d.b.mesh); removeCollider(d.b.coll); breakables.splice(breakables.indexOf(d.b), 1); }
  const mesh = boardsMesh(d.w, hp, BMAX); mesh.position.set(d.x, d.y, d.z); mesh.rotation.y = d.rot; G.scene.add(mesh);
  const b = { x: d.x, z: d.z, hw: d.w / 2 + 0.2, hd: 0.35, rot: d.rot, hp, max: BMAX, mesh, coll: addOBox(d.x, d.z, d.w + 0.2, 0.5, d.rot), door: d,
    closed: () => true, onDamage: () => { saved()[d.id] = b.hp; refresh(b); }, onBreak: () => unboard(d, true) };
  breakables.push(b); d.b = b;
}
function refresh(b) {   // swap to a mesh with fewer planks as it breaks
  const n = Math.ceil(5 * b.hp / b.max);
  if (n === b.planks) return; b.planks = n;
  G.scene.remove(b.mesh); b.mesh = boardsMesh(b.door.w, b.hp, b.max); b.mesh.position.set(b.door.x, b.door.y, b.door.z); b.mesh.rotation.y = b.door.rot; G.scene.add(b.mesh);
}
function unboard(d, broken = false) {
  if (!d.b) return;
  G.scene.remove(d.b.mesh); removeCollider(d.b.coll); breakables.splice(breakables.indexOf(d.b), 1); d.b = null;
  delete saved()[d.id];
  burst(d.x, d.y + 1.2, d.z, 0xb0773f, 16, 4, 0.14); sfx.hit();
  if (broken) { const P = G.player.pos; if (Math.hypot(P.x - d.x, P.z - d.z) < 40) toast('The zombies broke through a barricade!', 2.5); }
}

/* ---------- Zombies claw at whatever blocks them ---------- */
export function clawCheck(zb, dt, tx, tz) {
  for (const b of breakables) {
    if (!b.closed() || b.hp <= 0) continue;
    const dx = zb.pos.x - b.x, dz = zb.pos.z - b.z;
    const lx = dx * Math.cos(b.rot) - dz * Math.sin(b.rot), lz = dx * Math.sin(b.rot) + dz * Math.cos(b.rot);
    if (Math.abs(lx) > b.hw + 0.6 || Math.abs(lz) > b.hd + 0.9) continue;
    const tlz = (tx - b.x) * Math.sin(b.rot) + (tz - b.z) * Math.cos(b.rot);
    if (lz * tlz > 0) continue;                       // only if what they want is on the other side
    zb.clawT = (zb.clawT || 0) - dt;
    if (zb.clawT <= 0) {
      zb.clawT = 1.1; zb.atkAnim = 1; b.hp -= zb.k.dmg * (zb.k.scale ? 1.6 : 0.8);
      burst(b.x + (Math.random() - 0.5) * b.hw, heightAt(b.x, b.z) + 1 + Math.random(), b.z, 0xb0773f, 4, 2.5, 0.08);
      if (Math.random() < 0.4) sfx.hit();
      b.onDamage?.();
      if (b.hp <= 0) b.onBreak();
    }
    return true;
  }
  return false;
}

export const defenseSystem = {
  init() {
    for (const d of doors) {
      if (saved()[d.id] > 0) board(d, saved()[d.id]);
      addInteractable({ x: d.x, z: d.z, y: d.y, r: 2.1,
        label: () => d.b ? (d.b.hp < BMAX ? `Repair the barricade (1 wood) · ${Math.round(d.b.hp / BMAX * 100)}%` : 'Take the barricade down') : 'Board up this door (3 wood)',
        action: () => {
          const inv = G.save.inv;
          if (!d.b) { if ((inv.wood || 0) < 3) return toast('You need 3 wood to board up a door.'); inv.wood -= 3; board(d); sfx.hit(); toast('Door boarded up. Zombies will have to break through.'); G.emit('built', { type: 'boards' }); }
          else if (d.b.hp < BMAX) { if ((inv.wood || 0) < 1) return toast('You need 1 wood to repair it.'); inv.wood -= 1; d.b.hp = Math.min(BMAX, d.b.hp + 60); d.b.onDamage(); sfx.hit(); }
          else { unboard(d); inv.wood = (inv.wood || 0) + 1; toast('You pull the boards off (+1 wood).'); }
        } });
    }
    G.clawCheck = clawCheck;
  },
  update(dt) { updateCamps(dt); }
};

/* ---------- Faction camps: gate, watchtowers with sentries, spikes, lights, alarm, patrols ---------- */
import { spawnNPC, npcs, randomName } from './npc.js';
import { zombies, hitZombie } from './zombies.js';
const camps = [];

function gateLeaf(w, color) {
  const g = [];
  for (let i = 0; i < 4; i++) g.push(paint(new THREE.BoxGeometry(w / 4 - 0.04, 3, 0.18).translate(w / 8 + i * w / 4, 1.5, 0), i % 2 ? color : new THREE.Color(color).multiplyScalar(0.82).getHex()));
  g.push(paint(new THREE.BoxGeometry(w, 0.2, 0.25).translate(w / 2, 2.4, 0.08), 0x3a2a20), paint(new THREE.BoxGeometry(w, 0.2, 0.25).translate(w / 2, 0.7, 0.08), 0x3a2a20));
  g.push(paint(new THREE.BoxGeometry(w * 1.05, 0.18, 0.2).rotateZ(-Math.atan2(1.7, w)).translate(w / 2, 1.55, 0.12), 0x3a2a20));
  const m = new THREE.Mesh(merge(g), MAT); m.castShadow = true; return m;
}
function towerMesh() {
  const g = [], W = 0x6b4f33, D = 0x4a3320;
  for (const x of [-1, 1]) for (const z of [-1, 1]) g.push(paint(new THREE.BoxGeometry(0.22, 5.4, 0.22).translate(x, 2.7, z), D));
  g.push(paint(new THREE.BoxGeometry(2.6, 0.2, 2.6).translate(0, 5.2, 0), W));
  for (const [x, z, w, d] of [[0, 1.25, 2.6, 0.12], [0, -1.25, 2.6, 0.12], [1.25, 0, 0.12, 2.6], [-1.25, 0, 0.12, 2.6]]) g.push(paint(new THREE.BoxGeometry(w, 0.9, d).translate(x, 5.75, z), W));
  for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) g.push(paint(new THREE.BoxGeometry(0.12, 1.6, 0.12).translate(x, 6.6, z), D));
  g.push(paint(new THREE.ConeGeometry(2.1, 1.1, 4).rotateY(Math.PI / 4).translate(0, 7.9, 0), 0x5a3a2a));
  for (let i = 0; i < 9; i++) g.push(paint(new THREE.BoxGeometry(0.7, 0.07, 0.07).translate(0, 0.4 + i * 0.55, -1.15), W));
  const m = new THREE.Mesh(merge(g), MAT); m.castShadow = true; return m;
}
const spikeGeo = (() => { const g = [paint(new THREE.BoxGeometry(2.4, 0.15, 0.4).translate(0, 0.3, 0), 0x5a4030)];
  for (let i = 0; i < 5; i++) g.push(paint(new THREE.ConeGeometry(0.09, 1.3, 5).rotateX(0.9).translate(-1 + i * 0.5, 0.55, 0.25), 0xbfc6cd));
  return merge(g); })();

export function fortifyCamp(L, f, F, relation) {
  const R = L.r * 0.9, gw = 2 * R * Math.sin(Math.PI / 22) - 0.35, gx = L.x, gz = L.z + R, gy = heightAt(gx, gz);
  const color = { haven: 0x8a6342, wolves: 0x6d7178, order: 0xd8d2c4 }[f] || 0x8a6342;
  // gate: two leaves hinged at the posts, swing inward
  const hingeL = new THREE.Group(), hingeR = new THREE.Group();
  hingeL.position.set(gx - gw / 2, gy, gz); hingeR.position.set(gx + gw / 2, gy, gz); hingeR.scale.x = -1;
  hingeL.add(gateLeaf(gw / 2, color)); hingeR.add(gateLeaf(gw / 2, color));
  G.scene.add(hingeL, hingeR);
  const camp = { L, f, F, relation, hingeL, hingeR, open: 1, alarm: 0, bellT: 0, sentries: [], lights: [] };
  const gate = { x: gx, z: gz, hw: gw / 2, hd: 0.4, rot: 0, hp: 420, max: 420, coll: null, closed: () => camp.open < 0.2 && gate.hp > 0,
    onDamage: () => {}, onBreak: () => { gate.brokenT = 40; if (gate.coll) { removeCollider(gate.coll); gate.coll = null; } burst(gx, gy + 1.5, gz, 0x8a6342, 20, 5, 0.18); sfx.hit();
      if (Math.hypot(G.player.pos.x - gx, G.player.pos.z - gz) < 60) toast(`The ${F.name} gate is broken!`, 2.5); } };
  camp.gate = gate; breakables.push(gate);
  // watchtowers either side of the gate, each with a sentry (only while the faction exists)
  for (const s of [-1, 1]) {
    const a = s * 0.42, tx = L.x + Math.sin(a) * (R - 3), tz = L.z + Math.cos(a) * (R - 3), ty = heightAt(tx, tz);
    const t = towerMesh(); t.position.set(tx, ty, tz); t.rotation.y = a; G.scene.add(t);
    const n = spawnNPC({ name: randomName(), faction: f, role: 'sentry', shirt: F.shirt, hat: F.hat, x: tx, z: tz, weapon: f === 'order' ? 'pistol' : 'rifle', hp: 90 });
    n.perch = { x: tx, y: ty + 5.3, z: tz }; n.range = 34; camp.sentries.push(n);
  }
  // spike traps outside the gate
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const m = new THREE.Mesh(spikeGeo, MAT); const sx = gx + i * 3.2, sz = gz + 5 + Math.abs(i) * 0.6;
    m.position.set(sx, heightAt(sx, sz), sz); m.rotation.y = i * 0.15; G.scene.add(m); camp.spikes = camp.spikes || []; camp.spikes.push({ x: sx, z: sz });
  }
  // lights for the night: two torches at the gate, a lantern in the middle
  for (const [lx, lz] of [[gx - gw / 2 - 0.8, gz + 0.8], [gx + gw / 2 + 0.8, gz + 0.8], [L.x, L.z]]) {
    const post = new THREE.Mesh(merge([paint(new THREE.BoxGeometry(0.15, 2.6, 0.15).translate(0, 1.3, 0), 0x3a2a20), paint(new THREE.BoxGeometry(0.32, 0.25, 0.32).translate(0, 2.7, 0), 0x2a2622)]), MAT);
    post.position.set(lx, heightAt(lx, lz), lz); G.scene.add(post);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 5), new THREE.MeshBasicMaterial({ color: 0xffb030 })); flame.position.set(lx, heightAt(lx, lz) + 3.05, lz); G.scene.add(flame);
    camp.lights.push(flame);
  }
  camp.light = new THREE.PointLight(0xffa040, 0, 26, 1.4); camp.light.position.set(gx, gy + 3.5, gz + 1); G.scene.add(camp.light);
  // guards patrol along the inside of the wall
  camp.patrol = Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2 + 0.2; return { x: L.x + Math.sin(a) * (R - 5), z: L.z + Math.cos(a) * (R - 5) }; });
  camps.push(camp);
  return camp;
}

function bell(x, z) {   // alarm bell: three quick rings
  if (!G.sfx || Math.hypot(G.player.pos.x - x, G.player.pos.z - z) > 120) return;
  for (let i = 0; i < 3; i++) setTimeout(() => G.sfx.ui?.(), i * 180);
}

export function updateCamps(dt) {
  const P = G.player.pos, night = G.save.world.hour >= 19 || G.save.world.hour < 6.5;
  for (const c of camps) {
    const gone = c.relation(c.f) === 'gone', g = c.gate;
    if (Math.hypot(P.x - c.L.x, P.z - c.L.z) > 260) continue;
    // how many zombies are coming?
    let threat = 0, nearest = null, nd = 1e9;
    for (const zb of zombies) if (zb.alive) { const d = Math.hypot(zb.pos.x - g.x, zb.pos.z - g.z); if (d < 45) { threat++; if (d < nd) { nd = d; nearest = zb; } } }
    // alarm: ring the bell and close up
    if (!gone && threat > 0 && c.alarm <= 0) { bell(g.x, g.z); if (Math.hypot(P.x - g.x, P.z - g.z) < 70) toast(`${c.F.name}: the alarm bell rings — gate closing!`, 2); }
    c.alarm = threat > 0 ? 8 : Math.max(0, c.alarm - dt);
    // the gate opens for friends near it when it's safe; hostile factions keep it shut
    const friend = c.relation(c.f) !== 'hostile', playerAtGate = Math.hypot(P.x - g.x, P.z - g.z) < 9;
    const wantOpen = gone || g.hp <= 0 || (friend && (playerAtGate && nd > 10 || (!night && c.alarm <= 0)));
    c.open += ((wantOpen ? 1 : 0) - c.open) * Math.min(1, dt * 2.5);
    c.hingeL.rotation.y = -c.open * 1.6; c.hingeR.rotation.y = c.open * 1.6;
    const closed = c.open < 0.2 && g.hp > 0;
    if (closed && !g.coll) g.coll = addOBox(g.x, g.z, g.hw * 2, 0.5, 0);
    if (!closed && g.coll) { removeCollider(g.coll); g.coll = null; }
    // the faction repairs its gate after a while
    if (g.hp <= 0) { if ((g.brokenT -= dt) <= 0 && !gone) { g.hp = g.max; } }
    else if (!gone && threat === 0) g.hp = Math.min(g.max, g.hp + dt * 15);
    // spikes hurt zombies that walk over them
    for (const s of c.spikes) for (const zb of zombies) if (zb.alive && Math.abs(zb.pos.x - s.x) < 1.3 && Math.abs(zb.pos.z - s.z) < 0.8) {
      zb.spikeT = (zb.spikeT || 0) - dt; if (zb.spikeT <= 0) { zb.spikeT = 0.5; hitZombie(zb, 14, s.x, s.z, 1.5); }
    }
    // night lights
    for (const fl of c.lights) { fl.visible = night && !gone; fl.scale.y = 1 + Math.sin(G.time * 12 + fl.position.x) * 0.15; }
    c.light.intensity = night && !gone ? 13 + Math.sin(G.time * 9) * 2 : 0;
    // guards: rally to the gate during an alarm, otherwise walk the wall
    if (!gone) for (const n of npcs) if (n.faction === c.f && n.role === 'guard' && n.alive) {
      n.patrolI ??= Math.floor(Math.random() * c.patrol.length);
      if (c.alarm > 0) n.home = { x: g.x + (n.patrolI % 3 - 1) * 2.5, z: g.z - 4 };
      else { const w = c.patrol[n.patrolI]; if (Math.hypot(n.pos.x - w.x, n.pos.z - w.z) < 2) n.patrolI = (n.patrolI + 1) % c.patrol.length; n.home = c.patrol[n.patrolI]; }
    }
  }
}
