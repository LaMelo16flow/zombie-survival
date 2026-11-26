import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { heightAt, collide, WATER, HALF } from './world.js';
import { nearLocation } from './locations.js';
import { addInteractable, removeInteractable } from './interact.js';
import { toon, paint, merge } from './style.js';
import { toast, damageNumber } from './ui.js';
import { burst, impact } from './effects.js';
import { sfx } from './audio.js';
import { isNight } from './daynight.js';

/*
  HUNTING — deer and rabbits run away, boars charge if you get close, wolves hunt in packs at night.
  Kill one, then press E / USE on the body to butcher it for raw meat, hide and bone.
  Cook meat at a campfire, tan hides into leather on a tanning rack, smoke jerky in a smokehouse.
*/
const KINDS = {
  rabbit: { name: 'Rabbit', hp: 15, speed: 2, run: 8.5, scared: 12, len: 0.6, h: 0.35, color: 0xb9a07a, loot: { rawmeat: 1, hide: 1 } },
  deer:   { name: 'Deer', hp: 60, speed: 1.6, run: 9, scared: 24, len: 1.6, h: 1.0, color: 0xb27a45, loot: { rawmeat: 3, hide: 2, bone: 1 } },
  boar:   { name: 'Boar', hp: 90, speed: 1.4, run: 7, angry: 9, len: 1.3, h: 0.7, color: 0x5a4636, dmg: 16, loot: { rawmeat: 4, hide: 2, bone: 2 } },
  wolf:   { name: 'Wolf', hp: 50, speed: 1.8, run: 8, hunt: 26, len: 1.3, h: 0.75, color: 0x7d8590, dmg: 11, loot: { rawmeat: 1, hide: 1, bone: 1 } }
};
const MAT = toon(0xffffff, { vertexColors: true });
const S = (r, sx, sy, sz, x, y, z, c) => paint(new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).translate(x, y, z), c);
const Bx = (w, h, d, x, y, z, c) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
const Cn = (r, h, x, y, z, rx, c) => paint(new THREE.ConeGeometry(r, h, 5).rotateX(rx).translate(x, y, z), c);
const darker = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

const geoCache = {};
function bodyGeo(kind) {
  if (geoCache[kind]) return geoCache[kind];
  const k = KINDS[kind], c = k.color, L = k.len, H = k.h, g = [];
  g.push(S(0.5, L, H * 0.8, H * 0.8, 0, H * 0.95, 0, c));                         // body
  const hy = H * 1.3, hz = L * 0.55;
  g.push(S(0.5, H * 0.55, H * 0.5, H * 0.75, 0, hy, hz, c));                      // head
  g.push(S(0.08, 1, 1, 1, -H * 0.12, hy + H * 0.08, hz + H * 0.3, 0x15121c), S(0.08, 1, 1, 1, H * 0.12, hy + H * 0.08, hz + H * 0.3, 0x15121c)); // eyes
  if (kind === 'rabbit') { g.push(S(0.5, 0.1, 0.45, 0.06, -0.06, hy + 0.3, hz - 0.05, c), S(0.5, 0.1, 0.45, 0.06, 0.06, hy + 0.3, hz - 0.05, c), S(0.5, 0.15, 0.15, 0.15, 0, H + 0.15, -L * 0.5, 0xffffff)); }
  if (kind === 'deer') { g.push(S(0.5, 0.25, 0.1, 0.1, 0, H + 0.1, -L * 0.52, 0xffffff));
    for (const s of [-1, 1]) { g.push(Bx(0.05, 0.5, 0.05, s * 0.12, hy + 0.45, hz - 0.05, 0x6b4a2b), Bx(0.05, 0.25, 0.05, s * 0.22, hy + 0.6, hz, 0x6b4a2b).rotateZ(0)); g.push(Cn(0.06, 0.2, s * 0.15, hy + 0.3, hz - 0.1, 0, darker(c, 0.8))); } }
  if (kind === 'boar') { g.push(Cn(0.04, 0.2, -0.13, hy - 0.1, hz + 0.35, -1.2, 0xf4efe4), Cn(0.04, 0.2, 0.13, hy - 0.1, hz + 0.35, -1.2, 0xf4efe4), S(0.5, 0.25, 0.2, 0.1, 0, hy - 0.05, hz + 0.38, 0x8a6a5a));
    for (let i = 0; i < 5; i++) g.push(Cn(0.06, 0.2, 0, H + 0.45, -0.3 + i * 0.15, 0, darker(c, 0.6))); }
  if (kind === 'wolf') { g.push(Cn(0.08, 0.2, -0.12, hy + 0.25, hz - 0.05, 0, c), Cn(0.08, 0.2, 0.12, hy + 0.25, hz - 0.05, 0, c), S(0.5, 0.2, 0.18, 0.4, 0, hy - 0.05, hz + 0.3, darker(c, 1.2)));
    g.push(S(0.5, 0.18, 0.18, 0.6, 0, H + 0.2, -L * 0.65, c)); }
  return (geoCache[kind] = merge(g));
}
const legCache = {};
function legGeo(kind) { if (legCache[kind]) return legCache[kind]; const H = KINDS[kind].h; return (legCache[kind] = merge([paint(new THREE.CylinderGeometry(H * 0.13, H * 0.09, H * 0.75, 6).translate(0, -H * 0.37, 0), darker(KINDS[kind].color, 0.75))])); }

export const animals = [];
function spawn(kind, x, z) {
  const k = KINDS[kind], g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo(kind), MAT); body.castShadow = true; g.add(body);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const l = new THREE.Mesh(legGeo(kind), MAT); l.position.set(sx * k.h * 0.25, k.h * 0.8, sz * k.len * 0.3); g.add(l); legs.push(l); }
  g.position.set(x, heightAt(x, z), z); G.scene.add(g);
  const a = { kind, k, g, pos: g.position, legs, body, hp: k.hp, alive: true, rot: Math.random() * 6, state: 'wander', t: 0, phase: Math.random() * 6, cd: 0, kx: 0, kz: 0 };
  a.onHit = dmg => hurt(a, dmg); a.aimY = k.h; a.hitR = Math.max(0.5, k.len * 0.45);
  animals.push(a);
  return a;
}
function hurt(a, dmg) {
  if (!a.alive) return;
  a.hp -= dmg; damageNumber(a.pos.x, a.pos.y + a.k.h + 0.6, a.pos.z, dmg);
  burst(a.pos.x, a.pos.y + a.k.h, a.pos.z, 0x9a1018, 6, 3); impact(a.pos.x, a.pos.y + a.k.h, a.pos.z, 0xffffff, 0.4); sfx.hit();
  a.state = a.kind === 'boar' || a.kind === 'wolf' ? 'attack' : 'flee';
  for (const o of animals) if (o.kind === a.kind && o.alive && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 20) o.state = a.state;   // herd reacts
  if (a.hp <= 0) die(a);
}
function die(a) {
  a.alive = false; a.g.rotation.z = Math.PI / 2; a.g.position.y += a.k.h * 0.3;
  G.emit('animalKilled', a);
  a.inter = addInteractable({ getPos: () => a.pos, r: 2.4, label: () => `Butcher the ${a.k.name.toLowerCase()}`, action: () => {
    const inv = G.save.inv, got = [], bonus = G.skillMul?.('hunt') || 1;
    for (const [item, n] of Object.entries(a.k.loot)) { const c = Math.max(1, Math.round(n * bonus)); inv[item] = (inv[item] || 0) + c; got.push(`${c} ${item}`); }
    toast('Butchered: ' + got.join(', ')); sfx.pickup(); burst(a.pos.x, a.pos.y + 0.4, a.pos.z, 0x9a1018, 10, 2);
    removeInteractable(a.inter); G.scene.remove(a.g); animals.splice(animals.indexOf(a), 1);
    G.emit('butchered', a);
  } });
  a.deadT = 0;
}

function pickKind(x, z) {
  const r = Math.random(), b = G.biomeAt ? G.biomeAt(x, z) : {};
  if (b.snow > 0.5) return r < 0.45 ? 'wolf' : r < 0.75 ? 'deer' : 'rabbit';
  if (b.swamp > 0.5) return r < 0.5 ? 'boar' : r < 0.75 ? 'rabbit' : 'deer';
  if (isNight() && r < 0.3) return 'wolf';
  if (r < 0.35) return 'rabbit';
  if (r < 0.7) return 'deer';
  if (r < 0.88) return 'boar';
  return 'wolf';
}

let spawnT = 0;
export const animalSystem = {
  init() {
    G.meleeTargets = () => animals.filter(a => a.alive).map(a => ({ pos: a.pos, onHit: a.onHit, r: a.hitR }));
    G.extraTargets = () => animals.filter(a => a.alive);
    G.animalList = () => animals;
    G.spawnAnimal = spawn;
  },
  update(dt) {
    const P = G.player;
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 2;
      if (animals.filter(a => a.alive).length < 14) {
        const ang = Math.random() * 6.28, d = 70 + Math.random() * 60;
        const x = P.pos.x + Math.sin(ang) * d, z = P.pos.z + Math.cos(ang) * d;
        if (Math.abs(x) < HALF - 30 && Math.abs(z) < HALF - 30 && heightAt(x, z) > WATER + 1 && heightAt(x, z) < 70 && !nearLocation(x, z, 25) && !(G.biomeAt && G.biomeAt(x, z).city > 0.4)) {
          const kind = pickKind(x, z), n = kind === 'wolf' ? 3 : kind === 'deer' ? 2 + Math.floor(Math.random() * 2) : kind === 'rabbit' ? 2 : 1;
          for (let i = 0; i < n; i++) spawn(kind, x + (Math.random() - 0.5) * 6, z + (Math.random() - 0.5) * 6);
        }
      }
    }
    const loud = P.sprinting ? 1.6 : P.moving ? 1 : 0.6;
    for (let i = animals.length - 1; i >= 0; i--) {
      const a = animals[i], k = a.k;
      const dx = P.pos.x - a.pos.x, dz = P.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > 190) { if (a.inter) removeInteractable(a.inter); G.scene.remove(a.g); animals.splice(i, 1); continue; }
      if (!a.alive) continue;
      a.cd -= dt; a.t -= dt;
      let speed = 0, face = null;
      if (a.kind === 'rabbit' || a.kind === 'deer') {
        if (d < k.scared * loud * (G.player.elevated ? 0.4 : 1)) a.state = 'flee';
        if (a.state === 'flee') { face = Math.atan2(-dx, -dz); speed = k.run; if (d > k.scared * 2.5) a.state = 'wander'; }
      } else {
        const range = a.kind === 'wolf' ? k.hunt * (isNight() ? 1.4 : 1) : k.angry;
        if (d < range && !G.dead && !G.driving) a.state = 'attack';
        if (a.state === 'attack') {
          if (a.hp < k.hp * 0.3 || d > range * 2.5) a.state = a.hp < k.hp * 0.3 ? 'flee' : 'wander';
          face = Math.atan2(dx, dz); speed = d > 1.6 ? k.run : 0;
          if (d < 1.8 && a.cd <= 0 && !G.player.elevated) { a.cd = 1.2; P.hurt(k.dmg, a.kind, a); if (a.kind === 'boar') { G.player.pos.x += dx / d * 1.5; G.player.pos.z += dz / d * 1.5; } }
        }
        if (a.state === 'flee') { face = Math.atan2(-dx, -dz); speed = k.run; if (d > 60) a.state = 'wander'; }
      }
      if (a.state === 'wander') {
        if (a.t <= 0) { a.t = 2 + Math.random() * 5; a.rot += (Math.random() - 0.5) * 2.5; a.walk = Math.random() < 0.55; }
        speed = a.walk ? k.speed : 0;
      }
      if (face !== null) { let r = face - a.rot; r = Math.atan2(Math.sin(r), Math.cos(r)); a.rot += r * Math.min(1, dt * 6); }
      a.pos.x += Math.sin(a.rot) * speed * dt; a.pos.z += Math.cos(a.rot) * speed * dt;
      if (heightAt(a.pos.x, a.pos.z) < WATER + 0.3) { a.pos.x -= Math.sin(a.rot) * speed * dt * 2; a.pos.z -= Math.cos(a.rot) * speed * dt * 2; a.rot += 1.5; }
      collide(a.pos, k.len * 0.35);
      a.pos.y = heightAt(a.pos.x, a.pos.z);
      a.g.rotation.y = a.rot;
      if (d < 100) {   // gallop
        a.phase += dt * (3 + speed * 2);
        const s = Math.sin(a.phase) * Math.min(1, speed / 2) * 0.7;
        a.legs[0].rotation.x = s; a.legs[3].rotation.x = s; a.legs[1].rotation.x = -s; a.legs[2].rotation.x = -s;
        a.body.position.y = Math.abs(Math.cos(a.phase)) * 0.06 * Math.min(1, speed / 3);
      }
      if (a.kind === 'wolf' && a.state === 'attack' && Math.random() < dt * 0.15) sfx.groan(a.pos.x, a.pos.z, 2.2);
    }
  }
};
