import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { pressed, down, addTouchButton } from './input.js';
import { heightAt, collide, HALF } from './world.js';
import { makeHuman, animateHuman, giveWeapon } from './characters.js';
import { isNight } from './daynight.js';
import { toast, damageNumber } from './ui.js';
import { burst, impact } from './effects.js';
import { sfx } from './audio.js';
import { MELEE, GUNS } from './items.js';
import { settleY } from './interiors.js';

// Zombie kinds. Multipliers can be changed by story decisions (G.save.world.mods).
const KINDS = {
  walker: { hp: 40, speed: 1.6, chase: 3.4, dmg: 9, shirts: [0x5a6b8a, 0x8a5a4a, 0x6b7a4a, 0x7a6a8a], skin: 0x9aab8a },
  runner: { hp: 28, speed: 2.2, chase: 6.6, dmg: 7, shirts: [0x8a3b3b, 0xb0a070, 0x4a6a8a, 0x5a5a5a], skin: 0xa3b392, thin: true },
  brute:  { hp: 140, speed: 1.2, chase: 2.9, dmg: 22, shirts: [0x3a3a3a, 0x4a3a2a, 0x2a3a4a, 0x553333], skin: 0x7d8f6a, scale: 1.35 },
  // special zombies
  screamer: { hp: 30, speed: 1.4, chase: 3.2, dmg: 4, shirts: [0xe8e4e0, 0xd8d2c4, 0xc4bfb4, 0xe0dccf], skin: 0xc9d4c0, thin: true, look: { hairStyle: 'long', hair: 0xf0f0f0 }, special: 'scream' },
  exploder: { hp: 50, speed: 1.0, chase: 2.7, dmg: 0, shirts: [0x6b8a3a, 0x7a9a3a, 0x5a7a2a, 0x6a8a4a], skin: 0x8fbf5a, fat: true, look: { hairStyle: 'buzz' }, special: 'explode' },
  armored:  { hp: 120, speed: 1.3, chase: 3.0, dmg: 14, shirts: [0x2a3550, 0x252f45, 0x2a3550, 0x303a55], skin: 0x8a9a7a, look: { hairStyle: 'buzz', hat: 0x1a2030 }, armored: true },
  frozen:   { hp: 70, speed: 1.1, chase: 2.8, dmg: 12, shirts: [0xdfe9f4, 0xb8c8d8, 0xc4d4e0, 0xa8bccc], skin: 0xb8d4e8, look: { hairStyle: 'short', hair: 0xf4f8fc } },
  drowned:  { hp: 45, speed: 1.5, chase: 3.6, dmg: 10, shirts: [0x3a5a4a, 0x2a4a5a, 0x4a5a3a, 0x3a4a4a], skin: 0x6a9a8a, look: { hairStyle: 'long', hair: 0x2a3a2a } },
  crawler:  { hp: 25, speed: 0.9, chase: 2.4, dmg: 8, shirts: [0x5a4a3a, 0x4a4a4a, 0x6a5a4a, 0x3a3a3a], skin: 0x8a9a7a, crawl: true }
};
export { KINDS };

export const zombies = [];
const tmpV = new THREE.Vector3();
let flashLight;

export function nearbyZombies(x, z, r) { return zombies.filter(zb => zb.alive && Math.hypot(zb.pos.x - x, zb.pos.z - z) < r); }

export function spawnZombie(x, z, kind, extra = {}) {
  const k = extra.k || KINDS[kind];
  const v = Math.floor(Math.random() * 4);   // 4 looks per kind, geometry shared between same looks
  const mesh = makeHuman({ zombie: true, skin: k.skin, shirt: k.shirts[v], pants: [0x3a3530, 0x2f3a4a, 0x4a4035, 0x302a35][v],
    hair: [0x2a2622, 0x5a4a3a, 0x8a8a7a, 0x3a2a20][v], hairStyle: ['short', 'long', 'buzz', 'spiky'][v], ...(k.look || {}), cacheKey: extra.k ? null : kind + v });
  if (k.scale) mesh.scale.setScalar(k.scale);
  if (k.thin) mesh.scale.set(0.88, 1.02, 0.88);
  if (k.fat) mesh.scale.set(1.45, 1.05, 1.45);
  mesh.position.set(x, heightAt(x, z), z);
  G.scene.add(mesh);
  const mods = G.save.world.mods;
  const zb = { mesh, pos: mesh.position, kind, k, hp: k.hp * (mods.zHp || 1), maxHp: k.hp, alive: true, state: 'wander',
    rot: Math.random() * 6.28, wanderT: 0, atkCd: 0, atkAnim: 0, hitFlash: 0, deadT: 0, kx: 0, kz: 0 };
  Object.assign(zb, extra);
  zombies.push(zb);
  return zb;
}

// Explosion (exploders, bosses): hurts everyone nearby
export function explode(x, y, z, radius, dmg, color = 0x8fbf5a) {
  burst(x, y + 1, z, color, 26, 7, 0.2); burst(x, y + 0.5, z, 0xffc94a, 14, 5, 0.16); impact(x, y + 1, z, 0xffe680, 2.4);
  sfx.gun('rifle'); G.shake = Math.min(0.6, (G.shake || 0) + 0.4);
  const P = G.player;
  const dp = Math.hypot(P.pos.x - x, P.pos.z - z);
  if (dp < radius && !G.dead) P.hurt(dmg * (1 - dp / radius * 0.6), 'explosion');
  for (const o of zombies) if (o.alive && !o.boss) { const d = Math.hypot(o.pos.x - x, o.pos.z - z); if (d < radius) hitZombie(o, dmg * 1.5, x, z, 8); }
  G.emit('explosion', { x, z, radius, dmg });
}

// Spawn points can be placed by the world (hordes near towns, etc.)
export function spawnGroup(x, z, n, kinds = ['walker']) {
  for (let i = 0; i < n; i++) spawnZombie(x + (Math.random() - 0.5) * 12, z + (Math.random() - 0.5) * 12, kinds[Math.floor(Math.random() * kinds.length)]);
}

function maxZombies() {
  const mods = G.save.world.mods;
  return Math.round((isNight() ? 45 : 24) * (mods.density || 1) * (1 + (G.regionFx?.city || 0) * 0.6));
}

function pickKind(x = 0, z = 0) {
  const r = Math.random(), d = G.save.world.day, b = G.biomeAt ? G.biomeAt(x, z) : {};
  if (b.snow > 0.5 && r < 0.55) return 'frozen';
  if (b.swamp > 0.5 && r < 0.55) return 'drowned';
  if (b.city > 0.5 && r < 0.12) return Math.random() < 0.5 ? 'screamer' : 'armored';
  if (r < Math.min(0.05, 0.012 * d)) return 'screamer';
  if (r < Math.min(0.1, 0.025 * d)) return 'exploder';
  if (r < Math.min(0.15, 0.03 * d) && d >= 2) return 'armored';
  if (r < 0.2) return 'crawler';
  if (r < 0.2 + Math.min(0.08, 0.02 * d)) return 'brute';
  if (r < 0.38 + (isNight() ? 0.15 : 0)) return 'runner';
  return 'walker';
}

function setFlash(zb, on) {
  zb.mesh.traverse(o => { if (o.isMesh) { if (on) { o.userData.m = o.userData.m || o.material; o.material = hitMat; } else if (o.userData.m) o.material = o.userData.m; } });
}
const hitMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });

export function hitZombie(zb, dmg, fromX, fromZ, knock = 4) {
  if (!zb.alive) return;
  if (zb.k.armored) dmg *= dmg >= 45 ? 0.85 : 0.4;          // riot gear: only heavy hits get through
  if (zb.boss) { knock *= 0.1; dmg *= zb.boss.dmgMul?.(zb) ?? 1; }
  zb.hp -= dmg; zb.hitFlash = 0.12; setFlash(zb, true); sfx.hit();
  const hy = zb.pos.y + 1.2 * (zb.k.scale || 1);
  burst(zb.pos.x, hy, zb.pos.z, 0x7a0f14, 6, 3.5); damageNumber(zb.pos.x, hy + 0.5, zb.pos.z, dmg, dmg >= 50); impact(zb.pos.x, hy, zb.pos.z, 0xffffff, 0.5 + dmg / 80);
  const dx = zb.pos.x - fromX, dz = zb.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
  zb.kx = dx / l * knock; zb.kz = dz / l * knock;
  zb.state = 'chase';
  if (zb.hp <= 0) {
    zb.alive = false; zb.deadT = 0; setFlash(zb, false); zb.deadY = zb.pos.y;
    if (zb.k.special === 'explode' && !zb.exploded) { zb.exploded = true; setTimeout(() => explode(zb.pos.x, zb.pos.y, zb.pos.z, 4.5, 30), 50); }
    G.save.stats.kills++; sfx.splat(zb.pos.x, zb.pos.z);
    G.emit?.('zombieKilled', zb);
  }
}

/* ---------- Player combat ---------- */
const WEAPONS = MELEE;
let meleeCd = 0, shootCd = 0;

function melee() {
  const P = G.player, w = WEAPONS[G.save.inv.melee] || WEAPONS.fists;
  if (meleeCd > 0) return; meleeCd = w.cd; P.attackT = 1; sfx.swing();
  // soft lock-on: turn toward the closest enemy in reach (feels good on a phone)
  let near = null, nd = w.range + 1;
  for (const t of [...zombies.filter(z => z.alive), ...(G.hostileTargets?.() || []), ...(G.meleeTargets?.() || [])]) { const d = Math.hypot(t.pos.x - P.pos.x, t.pos.z - P.pos.z); if (d < nd) { nd = d; near = t; } }
  if (near) P.rot = Math.atan2(near.pos.x - P.pos.x, near.pos.z - P.pos.z);
  for (const zb of zombies) {
    if (!zb.alive) continue;
    const dx = zb.pos.x - P.pos.x, dz = zb.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d > w.range * (zb.k.scale || 1)) continue;
    let a = Math.atan2(dx, dz) - P.rot; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) < w.arc / 2 + 0.3) hitZombie(zb, w.dmg * (G.save.world.mods.playerDmg || 1) * (G.skillMul?.('melee') || 1), P.pos.x, P.pos.z, 5);
  }
  for (const n of G.hostileTargets?.() || []) {
    const dx = n.pos.x - P.pos.x, dz = n.pos.z - P.pos.z;
    if (Math.hypot(dx, dz) > w.range) continue;
    let a = Math.atan2(dx, dz) - P.rot; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) < w.arc / 2 + 0.3) n.hurt(w.dmg);
  }
  for (const t of G.meleeTargets?.() || []) {
    const dx = t.pos.x - P.pos.x, dz = t.pos.z - P.pos.z;
    if (Math.hypot(dx, dz) > w.range + (t.r || 0) * 0.6) continue;
    let a = Math.atan2(dx, dz) - P.rot; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) < w.arc / 2 + 0.4) t.onHit(w.dmg * (G.skillMul?.('melee') || 1));
  }
  G.emit?.('noise', { x: P.pos.x, z: P.pos.z, r: 12 });
}

function shoot() {
  const P = G.player, inv = G.save.inv;
  if (shootCd > 0) return;
  if (!inv.gun) { toast('You have no ranged weapon yet.', 1.2); shootCd = 0.6; return; }
  const gun = GUNS[inv.gun] || GUNS.pistol, ammoKey = gun.ammo;
  if ((inv[ammoKey] || 0) <= 0) { toast(ammoKey === 'bolts' ? 'Out of bolts!' : 'Out of bullets!', 1.2); sfx.empty(); shootCd = 0.6; return; }
  inv[ammoKey]--; inv.gun === 'crossbow' ? sfx.swing() : sfx.gun(inv.gun); shootCd = gun.cd;
  // face camera direction
  P.rot = P.camYaw + Math.PI; P.aimT = 0.4;
  const dir = new THREE.Vector3(); G.camera.getWorldDirection(dir);
  const origin = G.camera.position;
  const dmg = gun.dmg * (G.save.world.mods.playerDmg || 1) * (G.skillMul?.('ranged') || 1);
  const targets = [...zombies, ...(G.hostileTargets?.() || []).map(n => ({ alive: true, pos: n.pos, k: {}, npc: n })), ...(G.extraTargets?.() || [])];
  // shotgun: a cone of pellets, each hits the nearest thing along its line
  for (let p = 0; p < (gun.pellets || 1); p++) {
    const d = dir.clone();
    if (gun.pellets) { d.x += (Math.random() - 0.5) * 0.12; d.y += (Math.random() - 0.5) * 0.08; d.z += (Math.random() - 0.5) * 0.12; d.normalize(); }
    let best = null, bestT = gun.pellets ? 25 : 60;
    for (const zb of targets) {
      if (!zb.alive) continue;
      tmpV.set(zb.pos.x, zb.pos.y + (zb.aimY ?? 1.2 * (zb.k.scale || 1)), zb.pos.z).sub(origin);
      const t = tmpV.dot(d);
      if (t < 0 || t > bestT) continue;
      const perp = tmpV.addScaledVector(d, -t).length();
      if (perp < (zb.hitR ?? 0.7 * (zb.k.scale || 1))) { best = zb; bestT = t; }
    }
    if (best?.npc) best.npc.hurt(dmg); else if (best?.onHit) best.onHit(dmg); else if (best) hitZombie(best, dmg, P.pos.x, P.pos.z, gun.pellets ? 1.5 : 3);
  }
  impact(P.pos.x + Math.sin(P.rot) * 0.9, P.pos.y + 1.4, P.pos.z + Math.cos(P.rot) * 0.9, 0xffd060, 0.45);
  flashLight.intensity = 30; flashLight.position.set(P.pos.x + Math.sin(P.rot), P.pos.y + 1.5, P.pos.z + Math.cos(P.rot));
  G.emit?.('noise', { x: P.pos.x, z: P.pos.z, r: gun.noise });
}

/* ---------- System ---------- */
let spawnT = 0;
export const zombieSystem = {
  init() {
    flashLight = new THREE.PointLight(0xffc070, 0, 12); G.scene.add(flashLight);
    G.zombieList = () => zombies;
    addTouchButton('HIT', 'attack');
    addTouchButton('SHOOT', 'shoot');
    G.on?.('noise', n => { for (const zb of zombies) if (zb.alive && Math.hypot(zb.pos.x - n.x, zb.pos.z - n.z) < n.r) zb.state = 'chase'; });
  },
  update(dt) {
    const P = G.player;
    meleeCd -= dt; shootCd -= dt;
    if (P.aimT > 0) P.aimT -= dt;
    P.aiming = P.aimT > 0;
    if (!G.dead && !G.building && !G.driving) {
      if (pressed('attack') || (down('attack') && meleeCd <= 0)) melee();
      if (pressed('shoot') || (down('shoot') && shootCd <= 0)) shoot();
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 300);
    giveWeaponOnce();

    // Spawning around the player (not in safe zones)
    spawnT -= dt;
    const alive = zombies.filter(z => z.alive).length;
    if (spawnT <= 0 && alive < maxZombies()) {
      spawnT = 0.6;
      const a = Math.random() * 6.28, d = 55 + Math.random() * 45;
      const x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
      if (Math.abs(x) < HALF - 20 && Math.abs(z) < HALF - 20 && !(G.isSafe && G.isSafe(x, z))) spawnZombie(x, z, pickKind(x, z));
    }

    const night = isNight();
    const Wt = G.weather || { rain: 0, fog: 0 };
    const sight = (night ? 34 : 24) * (P.sprinting ? 1.5 : 1) * (G.save.world.mods.stealth || 1) * (1 - Wt.rain * 0.2 - Wt.fog * 0.35);
    for (let i = zombies.length - 1; i >= 0; i--) {
      const zb = zombies[i];
      const dx = P.pos.x - zb.pos.x, dz = P.pos.z - zb.pos.z, d = Math.hypot(dx, dz);
      if (!zb.alive) {
        zb.deadT += dt;
        zb.mesh.rotation.x = Math.max(-Math.PI / 2, -zb.deadT * 5);
        zb.mesh.position.y = (zb.deadY ?? zb.pos.y) + 0.2;
        if (zb.deadT > 8 || d > 150) { G.scene.remove(zb.mesh); zombies.splice(i, 1); }
        continue;
      }
      if (d > 160 && !zb.boss) { G.scene.remove(zb.mesh); zombies.splice(i, 1); continue; }
      if (zb.hitFlash > 0) { zb.hitFlash -= dt; if (zb.hitFlash <= 0) setFlash(zb, false); }

      // pick a target: player or the nearest ally/NPC (set up by factions)
      let tx = P.pos.x, tz = P.pos.z, td = G.dead ? 1e9 : d, target = null;
      if (G.targetsForZombies) for (const t of G.targetsForZombies()) {
        const e = Math.hypot(t.pos.x - zb.pos.x, t.pos.z - zb.pos.z);
        if (e < td) { td = e; tx = t.pos.x; tz = t.pos.z; target = t; }
      }
      if (zb.state === 'wander' && td < sight) { zb.state = 'chase'; if (d < 40) sfx.groan(zb.pos.x, zb.pos.z, zb.k.scale ? 0.7 : 1); }
      else if (d < 30 && Math.random() < dt * (zb.state === 'chase' ? 0.12 : 0.03)) sfx.groan(zb.pos.x, zb.pos.z, zb.k.scale ? 0.7 : zb.k.thin ? 1.3 : 1);
      if (zb.state === 'chase' && td > sight * 2.2) zb.state = 'wander';

      let speed = 0;
      const mods = G.save.world.mods;
      if (zb.boss) speed = zb.boss.ai(zb, dt, d, dx, dz);
      else if (zb.state === 'chase') {
        // special zombies
        if (zb.k.special === 'scream' && !zb.screamCd) {
          zb.screamCd = 15; zb.atkAnim = 1; sfx.scream?.(zb.pos.x, zb.pos.z);
          G.banner?.('SCREAMER!', 'THE HORDE HEARD IT', 1.8);
          G.emit('noise', { x: zb.pos.x, z: zb.pos.z, r: 70 });
          spawnGroup(zb.pos.x + (Math.random() - 0.5) * 30, zb.pos.z + (Math.random() - 0.5) * 30, 5, ['walker', 'runner']);
        }
        if (zb.k.special === 'explode' && td < 2.2 && !zb.exploded) { zb.exploded = true; zb.hp = 0; hitZombie(zb, 1, zb.pos.x, zb.pos.z, 0); continue; }
        const a = Math.atan2(tx - zb.pos.x, tz - zb.pos.z);
        let r = a - zb.rot; r = Math.atan2(Math.sin(r), Math.cos(r)); zb.rot += r * Math.min(1, dt * 6);
        if (!target && G.driving) td = G.carSurfDist(zb.pos.x, zb.pos.z) + 0.9;   // claw at the car you're in
        const reach = 1.3 * (zb.k.scale || 1);
        if (td > reach) speed = zb.k.chase * (mods.zSpeed || 1) * (night ? 1.15 : 1);
        zb.atkCd -= dt;
        if (td <= reach + 0.25 && zb.atkCd <= 0 && Math.abs((target ? target.pos.y : P.pos.y) - zb.pos.y) < 1.6) {
          zb.atkCd = 1.1; zb.atkAnim = 1;
          if (target) target.hurt(zb.k.dmg, zb); else if (!P.elevated) P.hurt(zb.k.dmg * (mods.zDmg || 1), 'zombie');
        }
      } else {
        zb.wanderT -= dt;
        if (zb.wanderT <= 0) { zb.wanderT = 2 + Math.random() * 5; zb.rot += (Math.random() - 0.5) * 2.5; zb.idle = Math.random() < 0.4; }
        speed = zb.idle ? 0 : zb.k.speed * 0.5;
      }
      if (zb.screamCd) zb.screamCd = Math.max(0, zb.screamCd - dt) || null;
      zb.atkAnim = Math.max(0, zb.atkAnim - dt * 2.5);
      zb.pos.x += Math.sin(zb.rot) * speed * dt + zb.kx * dt;
      zb.pos.z += Math.cos(zb.rot) * speed * dt + zb.kz * dt;
      zb.kx *= Math.pow(0.02, dt); zb.kz *= Math.pow(0.02, dt);
      // keep zombies apart
      if (d < 40) for (const o of zombies) if (o !== zb && o.alive) {
        const ex = zb.pos.x - o.pos.x, ez = zb.pos.z - o.pos.z, e2 = ex * ex + ez * ez;
        if (e2 < 0.8 && e2 > 1e-4) { const e = Math.sqrt(e2), p = (0.9 - e) / e * 0.5; zb.pos.x += ex * p; zb.pos.z += ez * p; }
      }
      collide(zb.pos, 0.4 * (zb.k.scale || 1));
      settleY(zb.pos, dt);
      zb.mesh.rotation.y = zb.rot;
      if (d < 90 && !zb.boss) animateHuman(zb.mesh, dt, speed / 4, { zombie: true, attack: zb.atkAnim });
      if (zb.k.crawl) { const p = zb.mesh.userData.parts; p.body.rotation.x = 1.35; p.body.position.y = 0.32; p.legL.rotation.x = p.legR.rotation.x = 0.2; p.head.rotation.x = -1.1; }
    }
  }
};

let lastMelee = null;
function giveWeaponOnce() {
  const inv = G.save.inv, P = G.player;
  const want = P.aiming && inv.gun ? inv.gun : inv.melee;
  if (want !== lastMelee) { giveWeapon(P.mesh, want); lastMelee = want; }
}
