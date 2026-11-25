import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { heightAt, collide } from './world.js';
import { makeHuman, animateHuman, giveWeapon } from './characters.js';
import { zombies, hitZombie } from './zombies.js';

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
  const n = Object.assign({ hp: 80, maxHp: opts.hp || 80, rot: Math.random() * 6, cd: 0, attackT: 0, speed: 0, home: { x: opts.x, z: opts.z }, alive: true, wanderT: 0 }, opts, { mesh, pos: mesh.position });
  n.hurt = (dmg) => {
    if (!n.alive) return;
    n.hp -= dmg;
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

function attack(n, target, d, isPlayer) {
  const ranged = n.weapon === 'pistol' || n.weapon === 'rifle';
  const range = ranged ? 18 : 1.9;
  if (d > range) return false;
  n.cd -= 0;
  if (n.cd > 0) return true;
  n.cd = ranged ? 1.3 : 0.9; n.attackT = 1;
  const dmg = ranged ? (n.weapon === 'rifle' ? 34 : 18) : 14;
  if (ranged) tracer(new THREE.Vector3(n.pos.x, n.pos.y + 1.4, n.pos.z), new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z));
  if (isPlayer) G.player.hurt(dmg * 0.6, 'raider');
  else if (target.k) hitZombie(target, dmg, n.pos.x, n.pos.z, 3);
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
      if (dP > 220 && n.role !== 'member') { n.mesh.visible = false; continue; }   // sleep far away
      n.mesh.visible = true;
      n.cd -= dt; n.attackT = Math.max(0, n.attackT - dt * 3); n.speed = 0;
      const zt = nearestZombie(n, n.role === 'wanderer' ? 6 : 16);

      if (n.role === 'member' && n.mode === 'follow') {
        if (zt && attack(n, zt.z, zt.d)) { n.rot = Math.atan2(zt.z.pos.x - n.pos.x, zt.z.pos.z - n.pos.z); }
        else if (zt && zt.d < 14) moveToward(n, zt.z.pos.x, zt.z.pos.z, 4.5, dt);
        else if (dP > 3.5) moveToward(n, P.pos.x, P.pos.z, dP > 12 ? 8.5 : (P.sprinting ? 8 : 4.6), dt);
        if (dP > 60) { n.pos.x = P.pos.x - 2; n.pos.z = P.pos.z - 2; } // catch up
      } else if (isHostile(n) && dP < (n.role === 'raider' ? 150 : 26) && !G.dead) {
        if (!attack(n, P, dP, true)) moveToward(n, P.pos.x, P.pos.z, 4.2, dt);
        else n.rot = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z);
      } else if (zt && n.role !== 'wanderer') {
        if (!attack(n, zt.z, zt.d)) moveToward(n, zt.z.pos.x, zt.z.pos.z, 4, dt);
        else n.rot = Math.atan2(zt.z.pos.x - n.pos.x, zt.z.pos.z - n.pos.z);
      } else {
        // idle near home, face player when close
        const dh = Math.hypot(n.home.x - n.pos.x, n.home.z - n.pos.z);
        if (dh > 4) moveToward(n, n.home.x, n.home.z, 2, dt);
        else if (dP < 6) { const a = Math.atan2(P.pos.x - n.pos.x, P.pos.z - n.pos.z); n.rot += Math.atan2(Math.sin(a - n.rot), Math.cos(a - n.rot)) * Math.min(1, dt * 4); }
        else { n.wanderT -= dt; if (n.wanderT < 0) { n.wanderT = 3 + Math.random() * 6; n.rot += (Math.random() - 0.5) * 3; n.walk = Math.random() < 0.5; } if (n.walk && n.role !== 'leader') moveToward(n, n.pos.x + Math.sin(n.rot), n.pos.z + Math.cos(n.rot), 1.2, dt); }
      }
      collide(n.pos, 0.4);
      n.pos.y = heightAt(n.pos.x, n.pos.z);
      n.mesh.rotation.y = n.rot;
      if (dP < 90) animateHuman(n.mesh, dt, n.speed, { attack: n.attackT, aim: (n.weapon === 'pistol' || n.weapon === 'rifle') && n.attackT > 0 });
      if (n.role === 'member') { const m = n.data; m.x = n.pos.x; m.z = n.pos.z; m.hp = n.hp; }
    }
  }
};
