import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { makeHuman, giveWeapon, animateHuman, HAIR_STYLES, HAIR_COLORS } from './characters.js';
import { heightAt } from './world.js';
import { pressed, addTouchButton } from './input.js';
import { toast, showModal, closeModal, esc } from './ui.js';
import { sfx } from './audio.js';

/*
  CHARACTER CREATOR + SKILLS
  New game → pick a name, skin, hair, clothes and a background (gives a starting kit and a bonus).
  You earn XP for kills, hunting, gathering, crafting, exploring and missions. Each level gives
  +5 max health and a skill point to spend in the skill tree (K / SKILLS).
*/

export const SKINS = [0xf1d0b5, 0xe0b48f, 0xc68e62, 0xa66f48, 0x8d5a3b, 0x5c3a24];
export const CLOTHES = [0xc0503a, 0x3a6fa5, 0x3aa66b, 0xe0a34a, 0x8e5bd3, 0x2a2622, 0xe8e4d8, 0xd1495b];
const PANTS = [0x2f3e55, 0x2a2622, 0x5a4a3a, 0x4a5a3a, 0x6b6b75];

export const PERKS = {
  fighter:   { name: 'Fighter', desc: '+20% melee damage. Starts with a machete.', kit: inv => { inv.ownedMelee.push('machete'); inv.melee = 'machete'; } },
  scavenger: { name: 'Scavenger', desc: 'Finds extra loot. Starts with food, water and a backpack of scrap.', kit: inv => { inv.food += 3; inv.water += 3; inv.scrap += 6; inv.cloth = 3; } },
  medic:     { name: 'Medic', desc: 'Healing items work 50% better. Starts with 3 medkits and bandages.', kit: inv => { inv.meds += 3; inv.bandage = 3; inv.herbs = 3; } },
  hunter:    { name: 'Hunter', desc: '+50% from hunting and gathering. Starts with a crossbow and 12 bolts.', kit: inv => { inv.ownedGuns.push('crossbow'); inv.gun = 'crossbow'; inv.bolts = 12; inv.rope = 1; } },
  mechanic:  { name: 'Mechanic', desc: 'Starts with fuel, scrap and metal; crafting stations from day one.', kit: inv => { inv.fuel = 2; inv.scrap += 10; inv.metal = 3; inv.wood += 8; } }
};

export const SKILLS = {
  brawler:  { name: 'Brawler', branch: 'Combat', desc: '+15% melee damage per rank' },
  marksman: { name: 'Marksman', branch: 'Combat', desc: '+15% ranged damage per rank' },
  stomach:  { name: 'Iron stomach', branch: 'Survival', desc: 'Hunger and thirst drop 15% slower per rank' },
  tough:    { name: 'Toughness', branch: 'Survival', desc: '+15 max health per rank' },
  forager:  { name: 'Forager', branch: 'Crafting', desc: '+25% from gathering and hunting per rank' },
  medicine: { name: 'Field medic', branch: 'Crafting', desc: 'Healing items +25% per rank' }
};
const MAX_RANK = 3;

/* ---------- XP & levels ---------- */
const need = lvl => Math.round(100 * Math.pow(lvl, 1.35));
export function addXP(n, why) {
  const st = G.save.stats;
  st.xp = (st.xp || 0) + n;
  while (st.xp >= need(st.level || 1)) {
    st.xp -= need(st.level || 1); st.level = (st.level || 1) + 1; st.points = (st.points || 0) + 1;
    applyMaxHp(); st.hp = st.maxHp;
    G.banner?.('Level ' + st.level, 'LEVEL UP — PRESS K TO SPEND A SKILL POINT', 3); sfx.discover();
  }
}
function applyMaxHp() { const st = G.save.stats; st.maxHp = 100 + ((st.level || 1) - 1) * 5 + (G.save.skills?.tough || 0) * 15; }
export const xpInfo = () => { const st = G.save.stats; return { level: st.level || 1, xp: st.xp || 0, need: need(st.level || 1), points: st.points || 0 }; };

// One multiplier the rest of the game asks for
export function skillMul(type) {
  const sk = G.save.skills || {}, perk = G.save.player.perk;
  switch (type) {
    case 'melee': return 1 + (sk.brawler || 0) * 0.15 + (perk === 'fighter' ? 0.2 : 0);
    case 'ranged': return 1 + (sk.marksman || 0) * 0.15;
    case 'gather': case 'hunt': return 1 + (sk.forager || 0) * 0.25 + (perk === 'hunter' ? 0.5 : 0);
    case 'heal': return 1 + (sk.medicine || 0) * 0.25 + (perk === 'medic' ? 0.5 : 0);
    case 'drain': return 1 - (sk.stomach || 0) * 0.15;
    case 'loot': return perk === 'scavenger' ? 1.5 : 1;
  }
  return 1;
}

export function openSkills() {
  const sk = G.save.skills = G.save.skills || {}, x = xpInfo();
  const branches = ['Combat', 'Survival', 'Crafting'].map(b => `<h3>${b}</h3>` + Object.entries(SKILLS).filter(([, s]) => s.branch === b).map(([id, s]) =>
    `<div class="row"><span><b>${s.name}</b> ${'●'.repeat(sk[id] || 0)}${'○'.repeat(MAX_RANK - (sk[id] || 0))}<br><small style="opacity:.75">${s.desc}</small></span>
      <button class="small ${x.points && (sk[id] || 0) < MAX_RANK ? 'primary' : ''}" data-sk="${id}" ${x.points && (sk[id] || 0) < MAX_RANK ? '' : 'disabled'}>+1</button></div>`).join('')).join('');
  const perk = PERKS[G.save.player.perk];
  showModal(`<div class="panel"><h2>${esc(G.save.player.name)} — level ${x.level}</h2>
    <p>${perk ? `<b>${perk.name}:</b> ${perk.desc}<br>` : ''}XP ${x.xp} / ${x.need} · <b style="color:var(--gold)">${x.points} skill point${x.points === 1 ? '' : 's'}</b></p>
    <div class="xpbar"><i style="width:${x.xp / x.need * 100}%"></i></div>
    ${branches}
    <p style="font-size:12px;opacity:.6">Earn XP by killing zombies and bosses, hunting, gathering, crafting, exploring and finishing missions.</p>
    <button class="primary" id="sk-close">Close</button></div>`);
  document.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => {
    const id = b.dataset.sk; if (!G.save.stats.points) return;
    sk[id] = (sk[id] || 0) + 1; G.save.stats.points--; applyMaxHp(); sfx.pickup(); openSkills();
  });
  document.getElementById('sk-close').onclick = closeModal;
}

/* ---------- Character creator ---------- */
let preview = null;
export function openCreator(onDone) {
  const look = { skin: 0x8d5a3b, hair: 0x1c1a22, hairStyle: 'spiky', shirt: 0xc0503a, pants: 0x2f3e55 };
  let name = '', perk = 'fighter';
  G.creating = true;
  document.getElementById('title').classList.add('hidden');
  const base = { x: 0, z: 0 }, y = heightAt(0, 0);
  G.camera.position.set(0.6, y + 1.5, 4.4); G.camera.lookAt(-2.1, y + 1.05, 0);
  const rebuild = () => {
    if (preview) G.scene.remove(preview);
    preview = makeHuman({ ...look, scarf: 0xf2e6c9, pack: 0x6b5a3a, shoes: 0xe8e4e0 });
    preview.position.set(base.x - 0.4, y, base.z); preview.rotation.y = 0.35;
    giveWeapon(preview, perk === 'hunter' ? 'crossbow' : perk === 'fighter' ? 'machete' : 'bat');
    G.scene.add(preview);
  };
  const sw = (list, key, cur) => list.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-k="${key}" data-v="${c}" style="background:#${c.toString(16).padStart(6, '0')}" aria-label="colour"></button>`).join('');
  const render = () => {
    showModal(`<div class="panel creator"><h2>Your survivor</h2>
      <label>Name<input id="cc-name" maxlength="20" placeholder="LaMelo" value="${esc(name)}"></label>
      <label>Skin</label><div class="sws">${sw(SKINS, 'skin', look.skin)}</div>
      <label>Hair</label><div class="tabs">${HAIR_STYLES.map(h => `<button class="small ${h === look.hairStyle ? 'on' : ''}" data-hs="${h}">${h}</button>`).join('')}</div>
      <div class="sws">${sw(HAIR_COLORS, 'hair', look.hair)}</div>
      <label>Jacket</label><div class="sws">${sw(CLOTHES, 'shirt', look.shirt)}</div>
      <label>Trousers</label><div class="sws">${sw(PANTS, 'pants', look.pants)}</div>
      <label>Background</label><div class="choices">${Object.entries(PERKS).map(([id, p]) => `<button data-perk="${id}" class="${id === perk ? 'on' : ''}"><span><b>${p.name}</b><small>${p.desc}</small></span></button>`).join('')}</div>
      <button class="primary" id="cc-go">Start surviving</button> <button id="cc-back">Back</button></div>`);
    G.paused = false;   // keep the preview animating
    const m = document.getElementById('modal'); m.classList.add('creator-wrap');
    document.getElementById('cc-name').oninput = e => { name = e.target.value; };
    m.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { look[b.dataset.k] = +b.dataset.v; rebuild(); render(); });
    m.querySelectorAll('[data-hs]').forEach(b => b.onclick = () => { look.hairStyle = b.dataset.hs; rebuild(); render(); });
    m.querySelectorAll('[data-perk]').forEach(b => b.onclick = () => { perk = b.dataset.perk; rebuild(); render(); });
    document.getElementById('cc-back').onclick = () => { m.classList.remove('creator-wrap'); closeModal(); G.creating = false; if (preview) G.scene.remove(preview); document.getElementById('title').classList.remove('hidden'); };
    document.getElementById('cc-go').onclick = () => {
      m.classList.remove('creator-wrap'); closeModal(); G.creating = false; if (preview) { G.scene.remove(preview); preview = null; }
      onDone({ name: name.trim() || 'Survivor', look: { ...look }, perk });
    };
  };
  rebuild(); render();
}
export function animatePreview(dt) { if (preview) { animateHuman(preview, dt, 0); preview.rotation.y += dt * 0.25; } }

/* ---------- System ---------- */
export const characterSystem = {
  init() {
    G.save.skills = G.save.skills || {};
    G.skillMul = skillMul; G.addXP = addXP;
    applyMaxHp();
    addTouchButton('SKILLS', 'skills', true);
    G.on('zombieKilled', zb => addXP(zb.bossId ? 500 : zb.k.scale ? 25 : 10));
    G.on('butchered', () => addXP(15));
    G.on('gathered', () => addXP(2));
    G.on('crafted', () => addXP(8));
    G.on('discover', () => addXP(40));
    G.on('looted', () => addXP(3));
    G.on('built', () => addXP(4));
    G.on('missionDone', m => addXP(m.xp || 80));
  },
  update() { if (pressed('skills')) openSkills(); }
};
