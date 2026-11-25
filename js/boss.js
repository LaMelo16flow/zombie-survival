import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { LOCATIONS } from './locations.js';
import { spawnZombie, spawnGroup, explode, zombies } from './zombies.js';
import { animateHuman } from './characters.js';
import { heightAt } from './world.js';
import { toast, showChoice } from './ui.js';
import { burst, impact, shake } from './effects.js';
import { sfx, setTension } from './audio.js';

/*
  BOSSES
  • The Colonel — Fort Kessler. A giant in military armour. Charges at you (watch for the red flash, then dodge),
    slams the ground when you are close, calls soldier zombies at half health.
  • Patient Zero — Helix Research Lab. The first infected. Blinks behind you, spits acid, calls runners.
  Each drops great loot and changes the world when it dies. Their state is saved.
*/
const loc = id => LOCATIONS.find(l => l.id === id);
const BOSSES = {
  colonel: { name: 'THE COLONEL', title: 'Fort Kessler', loc: 'fort', hp: 1500,
    k: { hp: 1500, speed: 1.6, chase: 3.3, dmg: 26, shirts: [0x3d4630, 0x3d4630, 0x3d4630, 0x3d4630], skin: 0x7d8f6a, scale: 2.2, look: { hairStyle: 'buzz', hat: 0x2f3a28 }, armored: false } },
  zero:    { name: 'PATIENT ZERO', title: 'Helix Lab', loc: 'lab', hp: 1200,
    k: { hp: 1200, speed: 2, chase: 4.2, dmg: 18, shirts: [0xe8e4e0, 0xe8e4e0, 0xe8e4e0, 0xe8e4e0], skin: 0x9a7ad0, scale: 1.6, look: { hairStyle: 'long', hair: 0x2a1f3d } } }
};

let bar, active = null;
const state = () => (G.save.world.bosses = G.save.world.bosses || {});

/* ---------- Boss AI ---------- */
const AI = {
  colonel: {
    ai(zb, dt, d, dx, dz) {
      const P = G.player, b = zb.bs;
      b.t -= dt; zb.atkCd -= dt;
      const face = Math.atan2(dx, dz);
      if (b.mode === 'windup') {           // telegraph: glows red, then charges
        zb.rot = face; b.flash = (b.flash || 0) + dt;
        if (b.t <= 0) { b.mode = 'charge'; b.t = 1.1; b.dir = face; sfx.roar(); }
        return 0;
      }
      if (b.mode === 'charge') {
        zb.rot = b.dir;
        if (d < 2.6 * 1.5 && !b.hit) { b.hit = true; P.hurt(38, 'boss'); P.pos.x += Math.sin(b.dir) * 4; P.pos.z += Math.cos(b.dir) * 4; shake(0.5); }
        if (b.t <= 0) { b.mode = 'walk'; b.t = 4 + Math.random() * 3; b.hit = false; }
        return 15;
      }
      zb.rot += Math.atan2(Math.sin(face - zb.rot), Math.cos(face - zb.rot)) * Math.min(1, dt * 3);
      if (d < 4.5 && zb.atkCd <= 0) {      // ground slam
        zb.atkCd = 2.2; zb.atkAnim = 1; shake(0.45);
        burst(zb.pos.x, zb.pos.y + 0.2, zb.pos.z, 0xb9a07a, 26, 6, 0.2); impact(zb.pos.x, zb.pos.y + 0.5, zb.pos.z, 0xffffff, 2.5); sfx.hit();
        if (d < 5) P.hurt(24, 'boss');
      }
      if (b.t <= 0 && d > 7 && d < 40) { b.mode = 'windup'; b.t = 1.0; }
      if (!b.called && zb.hp < zb.maxHp * 0.5) { b.called = true; toast('The Colonel calls his soldiers!', 2.5); spawnGroup(zb.pos.x, zb.pos.z, 8, ['armored', 'armored', 'walker', 'runner']); sfx.roar(); }
      return d > 3.5 ? zb.k.chase : 0;
    }
  },
  zero: {
    ai(zb, dt, d, dx, dz) {
      const P = G.player, b = zb.bs;
      b.t -= dt; zb.atkCd -= dt; b.spit = (b.spit ?? 3) - dt;
      const face = Math.atan2(dx, dz);
      zb.rot += Math.atan2(Math.sin(face - zb.rot), Math.cos(face - zb.rot)) * Math.min(1, dt * 5);
      if (b.t <= 0 && d < 30) {           // blink behind you
        b.t = 5 + Math.random() * 3;
        burst(zb.pos.x, zb.pos.y + 1.5, zb.pos.z, 0x9a7ad0, 18, 4, 0.16);
        const back = P.rot + Math.PI;
        zb.pos.x = P.pos.x + Math.sin(back) * 3; zb.pos.z = P.pos.z + Math.cos(back) * 3;
        burst(zb.pos.x, zb.pos.y + 1.5, zb.pos.z, 0x9a7ad0, 18, 4, 0.16); sfx.scream(zb.pos.x, zb.pos.z);
      }
      if (b.spit <= 0 && d > 5 && d < 28) { b.spit = 2.5; spit(zb); }
      if (d < 2.6 && zb.atkCd <= 0) { zb.atkCd = 0.9; zb.atkAnim = 1; P.hurt(zb.k.dmg, 'boss'); }
      if (!b.called && zb.hp < zb.maxHp * 0.6) { b.called = true; toast('Patient Zero shrieks — runners are coming!', 2.5); spawnGroup(zb.pos.x, zb.pos.z, 7, ['runner']); }
      if (!b.called2 && zb.hp < zb.maxHp * 0.25) { b.called2 = true; spawnGroup(zb.pos.x, zb.pos.z, 5, ['exploder', 'runner']); }
      return d > 2.2 ? zb.k.chase : 0;
    }
  }
};

// Acid spit: a glowing ball that arcs toward where you are standing
const acids = [];
const acidGeo = new THREE.SphereGeometry(0.3, 8, 6), acidMat = new THREE.MeshBasicMaterial({ color: 0xb6ff5a });
function spit(zb) {
  const P = G.player, m = new THREE.Mesh(acidGeo, acidMat);
  m.position.set(zb.pos.x, zb.pos.y + 2.4, zb.pos.z); G.scene.add(m);
  const tx = P.pos.x, tz = P.pos.z, T = 1.1;
  acids.push({ m, vx: (tx - zb.pos.x) / T, vz: (tz - zb.pos.z) / T, vy: 6, t: 0 });
}

/* ---------- Spawning, health bar, rewards ---------- */
function spawnBoss(id) {
  const B = BOSSES[id], L = loc(B.loc);
  const zb = spawnZombie(L.x, L.z - 6, 'boss_' + id, { k: B.k, boss: AI[id], bossId: id, bs: { t: 3, mode: 'walk' } });
  zb.hp = zb.maxHp = B.hp * (1 + Math.max(0, G.save.world.day - 3) * 0.05);
  zb.state = 'chase';
  active = zb;
  bar.classList.remove('hidden');
  bar.querySelector('b').textContent = B.name; bar.querySelector('small').textContent = B.title;
  G.banner?.(B.name, 'BOSS', 3); sfx.roar();
}

const REWARDS = {
  colonel: inv => { const own = (l, k) => { inv[l] = inv[l] || []; if (!inv[l].includes(k)) inv[l].push(k); };
    own('ownedArmor', 'military'); inv.armor = 'military'; own('ownedGuns', 'rifle'); inv.gun = inv.gun || 'rifle'; inv.ammo += 30; inv.metal = (inv.metal || 0) + 6;
    return 'Military armour, a rifle, 30 bullets and 6 metal bars. The fort is quiet now.'; },
  zero: inv => { inv.meds += 5; inv.metal = (inv.metal || 0) + 4; G.save.world.mods.zHp = (G.save.world.mods.zHp || 1) * 0.85;
    G.save.story.flags.zeroDead = true;
    return '5 medkits and 4 metal bars. With Patient Zero dead, every zombie feels a little weaker (−15% health).'; }
};

export const bossSystem = {
  init() {
    bar = document.createElement('div'); bar.id = 'bossbar'; bar.className = 'hidden';
    bar.innerHTML = '<div><b></b><small></small></div><div class="hp"><i></i></div>';
    document.getElementById('hud').appendChild(bar);
    G.on('zombieKilled', zb => {
      if (!zb.bossId) return;
      state()[zb.bossId] = 'dead'; active = null; bar.classList.add('hidden');
      explode(zb.pos.x, zb.pos.y, zb.pos.z, 5, 0, zb.bossId === 'zero' ? 0x9a7ad0 : 0x8a7a5a);
      G.save.stats.bosses = (G.save.stats.bosses || 0) + 1;
      const msg = REWARDS[zb.bossId](G.save.inv);
      setTimeout(() => showChoice(`${BOSSES[zb.bossId].name} IS DEAD`, msg, [{ label: 'Victory!' }]), 900);
      G.story?.log?.(`Killed ${BOSSES[zb.bossId].name.toLowerCase()}.`);
      G.emit('bossKilled', zb.bossId);
    });
  },
  update(dt) {
    const P = G.player.pos;
    // a boss wakes up when you come close to its lair (and isn't dead yet)
    if (!active) for (const [id, B] of Object.entries(BOSSES)) {
      const L = loc(B.loc);
      if (state()[id] !== 'dead' && Math.hypot(P.x - L.x, P.z - L.z) < L.r + 6) { spawnBoss(id); break; }
    }
    if (active) {
      const L = loc(BOSSES[active.bossId].loc);
      if (!active.alive) { active = null; bar.classList.add('hidden'); }
      else if (Math.hypot(P.x - L.x, P.z - L.z) > L.r + 120) {   // you ran away: the boss goes back to sleep
        G.scene.remove(active.mesh); zombies.splice(zombies.indexOf(active), 1); active = null; bar.classList.add('hidden');
      } else {
        bar.querySelector('i').style.transform = `scaleX(${Math.max(0, active.hp / active.maxHp)})`;
        setTension(1);
        const glow = active.bs.mode === 'windup';
        active.mesh.traverse(o => { if (o.isMesh && o.material.emissive) { /* shared toon mat — tint via scale pulse instead */ } });
        active.mesh.scale.setScalar(active.k.scale * (glow ? 1 + Math.sin(G.time * 30) * 0.04 : 1));
        animateHuman(active.mesh, dt, active.bs.mode === 'charge' ? 1 : 0.5, { zombie: true, attack: active.atkAnim });
      }
    }
    for (let i = acids.length - 1; i >= 0; i--) {
      const a = acids[i]; a.t += dt; a.vy -= 12 * dt;
      a.m.position.x += a.vx * dt; a.m.position.y += a.vy * dt; a.m.position.z += a.vz * dt;
      const gy = heightAt(a.m.position.x, a.m.position.z);
      if (a.m.position.y <= gy + 0.2 || a.t > 3) {
        G.scene.remove(a.m); acids.splice(i, 1);
        burst(a.m.position.x, gy + 0.3, a.m.position.z, 0xb6ff5a, 14, 4, 0.14);
        if (Math.hypot(G.player.pos.x - a.m.position.x, G.player.pos.z - a.m.position.z) < 2.5) G.player.hurt(16, 'acid');
      }
    }
  }
};
