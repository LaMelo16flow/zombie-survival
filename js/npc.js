import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { heightAt, collide } from './world.js';
import { makeHuman, animateHuman, giveWeapon } from './characters.js';
import { zombies, hitZombie } from './zombies.js';
import { burst } from './effects.js';
import { settleY } from './interiors.js';

// Human characters that are not the player: faction guards, leaders, wandering survivors, your members.
export const npcs = [];

const FIRST = ['Ada', 'Bram', 'Cleo', 'Dimitri', 'Esi', 'Felix', 'Grace', 'Hugo', 'Ines', 'Jonah', 'Kofi', 'Lena', 'Malik', 'Nadia', 'Omar', 'Paz', 'Quinn', 'Rosa', 'Samuel', 'Tara', 'Uche', 'Vera', 'Wes', 'Yara', 'Zane', 'Amara', 'Boris', 'Chidi', 'Diane', 'Eko'];
export const randomName = () => FIRST[Math.floor(Math.random() * FIRST.length)];
const SKINS = [0x8d5a3b, 0xc68e62, 0x5c3a24, 0xe0b48f, 0x7a4b30, 0xa66f48];

const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a });
function tracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, tracerMat); G.scene.add(l);
  setTimeout(() => { G.scene.remove(l); g.dispose(); }, 70);
}

// opts: { name, faction, role: 'guard'|'leader'|'wanderer'|'member', weapon, shirt, x, z, hp, data }
export function spawnNPC(opts) {
  const mesh = makeHuman({ skin: opts.skin ?? SKINS[Math.floor(Math.random() * SKINS.length)], shirt: opts.shirt ?? 0x777766, pants: 0x2a2c30, hat: opts.hat });
  mesh.position.set(opts.x, heightAt(opts.x, opts.z), opts.z);
  G.scene.add(mesh);
  if (opts.weapon) giveWeapon(mesh, opts.weapon);
  const n = Object.assign({ hp: opts.hp || 80, maxHp: opts.hp || 80, rot: Math.random() * 6, cd: 0, attackT: 0, speed: 0, home: { x: opts.x, z: opts.z }, alive: true, wanderT: 0, stagger: 0, lastHit: -99, healCd: 0 }, opts, { mesh, pos: mesh.position });
  n.hurt = (dmg, from) => {
    if (!n.alive) return;
    // dodge: trained fighters sidestep some hits (members best, wanderers worst)
    const dodge = { member: 0.3, escort: 0.2, guard: 0.25, leader: 0.35, raider: 0.2, wanderer: 0.12 }[n.role] ?? 0.15;
    if (Math.random() < dodge && n.stagger <= 0) {
      const side = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      n.slide = { x: Math.sin(n.rot + side) * 5, z: Math.cos(n.rot + side) * 5, t: 0.22 }; n.dodged = (n.dodged || 0) + 1; return;
    }
    n.hp -= dmg; n.lastHit = G.time; n.stagger = 0.18;
    burst(n.pos.x, n.pos.y + 1.2, n.pos.z, 0x9a1018, 4, 3);
    if (n.hp <= 0) { n.alive = false; n.deadT = 0; G.emit('npcDied', n); }
  };
  npcs.push(n);
  return n;
}

export function removeNPC(n) { G.scene.remove(n.mesh); const i = npcs.indexOf(n); if (i >= 0) npcs.splice(i, 1); }

// Is this NPC hostile to the player right now?
export const isHostile = n => n.faction && G.relation && G.relation(n.faction) === 'hostile';

function nearestZombie(n, range) {
  let best = null, bd = range;
  for (const z of zombies) if (z.alive) { const d = Math.hypot(z.pos.x - n.pos.x, z.pos.z - n.pos.z); if (d < bd) { bd = d; best = z; } }
  return best ? { z: best, d: bd } : null;
}

// What is dangerous around this person? Zombies and attacking animals.
function threats(n, range) {
  let near = null, nd = range, count = 0, cx = 0, cz = 0;
  const add = (t, w = 1) => { const d = Math.hypot(t.pos.x - n.pos.x, t.pos.z - n.pos.z); if (d > range) return; count += w; cx += t.pos.x; cz += t.pos.z; if (d < nd) { nd = d; near = t; } };
  for (const z of zombies) if (z.alive) add(z, z.k.scale ? 2 : 1);
  for (const a of G.animalList?.() || []) if (a.alive && a.state === 'attack') add(a);
  return near ? { t: near, d: nd, count, cx: cx / Math.max(1, count), cz: cz / Math.max(1, count) } : null;
}
// Somewhere safe to run to: the player for your people, home for everyone else, a faction camp for wanderers.
function safeSpot(n) {
  if (n.role === 'member' || n.role === 'escort') return G.player.pos;
  if (n.role === 'wanderer' && G.safePlaces) { let best = null, bd = 1e9; for (const p of G.safePlaces()) { const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z); if (d < bd) { bd = d; best = p; } } if (best && bd < 160) return best; }
  return n.home;
}
const isRanged = n => n.weapon === 'pistol' || n.weapon === 'rifle' || n.weapon === 'shotgun' || n.weapon === 'crossbow';
function flee(n, th, dt, speed = 6.5) {
  // run away from the middle of the danger, leaning toward somewhere safe
  const s = safeSpot(n);
  let ax = n.pos.x - th.cx, az = n.pos.z - th.cz; const al = Math.hypot(ax, az) || 1;
  let bx = s.x - n.pos.x, bz = s.z - n.pos.z; const bl = Math.hypot(bx, bz) || 1;
  const k = bl > 6 && (ax * bx + az * bz) / (al * bl) > -0.2 ? 0.5 : 0;   // only head for safety if it isn't through the danger
  moveToward(n, n.pos.x + ax / al * (1 - k) + bx / bl * k, n.pos.z + az / al * (1 - k) + bz / bl * k, speed, dt);
}

function attack(n, target, d, isPlayer) {
  const ranged = isRanged(n);
  const range = ranged ? (n.range || 18) : 1.9 + (target.k?.scale ? 0.6 : 0);
  if (d > range) return false;
  n.cd -= 0;
  if (n.cd > 0) return true;
  n.cd = ranged ? 1.3 : 0.9; n.attackT = 1;
  const dmg = ranged ? (n.weapon === 'rifle' ? 34 : 18) : 14;
  if (ranged) tracer(new THREE.Vector3(n.pos.x, n.pos.y + 1.4, n.pos.z), new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z));
  if (isPlayer) G.player.hurt(dmg * 0.6, 'raider', n);
  else if (target.k) hitZombie(target, dmg, n.pos.x, n.pos.z, 3);
  else if (target.onHit) target.onHit(dmg);
  else target.hurt?.(dmg);
  return true;
}

function moveToward(n, x, z, speed, dt) {
  const a = Math.atan2(x - n.pos.x, z - n.pos.z);
  let r = a - n.rot; r = Math.atan2(Math.sin(r), Math.cos(r)); n.rot += r * Math.min(1, dt * 8);
  n.pos.x += Math.sin(n.rot) * speed * dt; n.pos.z += Math.cos(n.rot) * speed * dt;
  n.speed = speed / 8;
}

export const npcSystem = {
  update(dt) {
    const P = G.player;
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i];
      if (!n.alive) {
        n.deadT += dt; n.mesh.rotation.x = Math.max(-Math.PI / 2, -n.deadT * 5);
        if (n.deadT > 10) removeNPC(n);
        continue;
      }
      const dP = Math.hypot(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
      if (dP > 220 && n.role !== 'member' && !(n.role === 'escort' && n.mode === 'follow')) { n.mesh.visible = false; continue; }   // sleep far away
      n.mesh.visible = true;
      n.cd -= dt; n.attackT = Math.max(0, n.attackT - dt * 3); n.speed = 0; n.stagger -= dt; n.healCd -= dt;
      if (n.slide) { n.pos.x += n.slide.x * dt; n.pos.z += n.slide.z * dt; if ((n.slide.t -= dt) <= 0) n.slide = null; }
      const follower = (n.role === 'member' || n.role === 'escort') && n.mode === 'follow';
      const th = threats(n, n.role === 'wanderer' ? 14 : 18);
      const hpF = n.hp / n.maxHp;
      // patch themselves up when it's quiet (or a quick bandage in a fight if badly hurt)
      if (hpF < 1 && G.time - n.lastHit > 5 && (!th || th.d > 14)) n.hp = Math.min(n.maxHp, n.hp + dt * 4);
      if (hpF < 0.3 && n.healCd <= 0 && (!th || th.d > 5) && n.role !== 'wanderer') { n.healCd = 25; n.hp = Math.min(n.maxHp, n.hp + n.maxHp * 0.35); burst(n.pos.x, n.pos.y + 1.3, n.pos.z, 0x7ad35a, 6, 2, 0.1); }
      const panic = th && (hpF < 0.35 || th.count >= (isRanged(n) ? 9 : 7) || (n.role === 'wanderer' && (!n.weapon || hpF < 0.7 || th.count > 2)));

      if (n.role === 'sentry') {
        // lookout on a watchtower: stays up there, shoots zombies (and the player, if the faction is hostile)
        const z = threats(n, n.range || 34);
        const enemy = isHostile(n) && dP < 34 && !G.dead ? { t: P, d: dP, isP: true } : z ? { t: z.t, d: z.d } : null;
        if (enemy) { n.rot = Math.atan2(enemy.t.pos.x - n.pos.x, enemy.t.pos.z - n.pos.z); if (n.cd <= 0) attack(n, enemy.t, enemy.d, enemy.isP); }
        else { n.wanderT -= dt; if (n.wanderT < 0) { n.wanderT = 2 + Math.random() * 3; n.lookA = (Math.random() - 0.5) * 2.4; } n.rot += Math.atan2(Math.sin((n.lookA || 0) - n.rot), Math.cos((n.lookA || 0) - n.rot)) * Math.min(1, dt * 2); }
        n.pos.set(n.perch.x, n.perch.y, n.perch.z); n.mesh.rotation.y = n.rot;
        if (dP < 90) animateHuman(n.mesh, dt, 0, { aim: !!enemy, weapon: n.weapon, stagger: n.stagger > 0 ? n.stagger : 0 });
        continue;
      }
      if (n.stagger > 0) { /* flinch: lose a moment */ }
      else if (isHostile(n) && dP < (n.role === 'raider' ? 150 : 26) && !G.dead && !(th && th.d < 3)) {
        if (hpF < 0.25 && n.role !== 'leader') flee(n, { cx: P.pos.x, cz: P.pos.z }, dt, 6);
        else if (!attack(n, P, dP, true)) moveToward(n, P.pos.x, P.pos.z, 4.2, dt);
        else n.rot = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
      } else if (th && panic && n.role !== 'leader') {
        flee(n, th, dt, follower ? 7 : 6.5);                        // too many, too hurt, or unarmed: get out
        if (th.d < 2 && n.weapon && n.cd <= 0) attack(n, th.t, th.d); // cornered: swing on the way out
      } else if (th && (th.d < (n.role === 'wanderer' ? 6 : 16) || follower)) {
        const face = Math.atan2(th.t.pos.x - n.pos.x, th.t.pos.z - n.pos.z);
        if (isRanged(n) && th.d < 5) { flee(n, th, dt, 4.5); if (n.cd <= 0) { n.rot = face; attack(n, th.t, th.d); } }   // keep distance, shoot
        else if (attack(n, th.t, th.d)) { n.rot = face; if (!isRanged(n) && n.cd > 0.6) moveToward(n, n.pos.x - Math.sin(face), n.pos.z - Math.cos(face), 2.5, dt); }   // hit and step back
        else if (follower && dP > 14) moveToward(n, P.pos.x, P.pos.z, 7, dt);                   // don't chase too far from you
        else moveToward(n, th.t.pos.x, th.t.pos.z, 4.5, dt);
      } else if (follower) {
        if (dP > 3.5) moveToward(n, P.pos.x, P.pos.z, dP > 12 ? 8.5 : (P.sprinting ? 8 : 4.6), dt);
      } else {
        // idle near home, face player when close
        const dh = Math.hypot(n.home.x - n.pos.x, n.home.z - n.pos.z);
        if (dh > 4) moveToward(n, n.home.x, n.home.z, 2, dt);
        else if (dP < 6) { const a = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); n.rot += Math.atan2(Math.sin(a - n.rot), Math.cos(a - n.rot)) * Math.min(1, dt * 4); }
        else { n.wanderT -= dt; if (n.wanderT < 0) { n.wanderT = 3 + Math.random() * 6; n.rot += (Math.random() - 0.5) * 3; n.walk = Math.random() < 0.5; } if (n.walk && n.role !== 'leader') moveToward(n, n.pos.x + Math.sin(n.rot), n.pos.z + Math.cos(n.rot), 1.2, dt); }
      }
      if (follower && dP > 60) { n.pos.x = P.pos.x - 2; n.pos.z = P.pos.z - 2; }   // catch up
      collide(n.pos, 0.4);
      settleY(n.pos, dt);
      n.mesh.rotation.y = n.rot;
      if (dP < 90) animateHuman(n.mesh, dt, n.speed, { attack: isRanged(n) ? 0 : n.attackT, aim: isRanged(n) && (n.attackT > 0 || n.cd > 0), stagger: n.stagger > 0 ? n.stagger : 0, weapon: n.weapon });
      if (n.role === 'member') { const m = n.data; m.x = n.pos.x; m.z = n.pos.z; m.hp = n.hp; }
    }
  }
};
