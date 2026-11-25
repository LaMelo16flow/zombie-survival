import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { pressed, addTouchButton } from './input.js';
import { LOCATIONS } from './locations.js';
import { addInteractable, removeInteractable } from './interact.js';
import { spawnNPC, removeNPC, npcs, randomName } from './npc.js';
import { heightAt, addCircle } from './world.js';
import { toast, showChoice, showModal, closeModal, esc } from './ui.js';

export const FACTIONS = {
  haven:  { name: 'Riverside Haven', leader: 'Mara', shirt: 0x5a7a4a, css: '#7fb069', loc: 'haven',
            about: 'Families and farmers who still believe in helping strangers.', weapons: ['bat', 'pistol'] },
  wolves: { name: 'Iron Wolves', leader: 'Kane', shirt: 0x2a2a2a, hat: 0x8a1a1a, css: '#d1495b', loc: 'steel',
            about: 'Raiders who take what they want. Strength is the only law.', weapons: ['rifle', 'pistol', 'bat'] },
  order:  { name: 'Order of the Signal', leader: 'Brother Elias', shirt: 0xe0dccf, css: '#e9d8a6', loc: 'tower',
            about: 'A cult at the radio tower. They say the dead are a judgement — and the signal tells them what to do.', weapons: ['bat', 'pistol'] }
};
export const IDEOLOGIES = {
  protect:  { label: 'Protect the living', rep: { haven: 10, wolves: -5 } },
  strength: { label: 'Only the strong survive', rep: { wolves: 12, haven: -8 } },
  cure:     { label: 'Find a cure', rep: { haven: 5, order: -10 } }
};
const COLORS = { Crimson: '#c9372c', Gold: '#e0a34a', Azure: '#3a8dd3', Jade: '#3aa66b', Violet: '#8e5bd3', Ivory: '#e8e4d8' };

/* ---------- Reputation ---------- */
export function relation(f) {
  const fs = G.save.factions;
  if (fs.destroyed.includes(f)) return 'gone';
  if (fs.allies.includes(f)) return 'ally';
  const r = fs.rep[f];
  return r <= -30 ? 'hostile' : r >= 30 ? 'friendly' : 'neutral';
}
export function changeRep(f, d, quiet = false) {
  const fs = G.save.factions, before = relation(f);
  fs.rep[f] = Math.max(-100, Math.min(100, fs.rep[f] + d));
  if (fs.rep[f] <= -30) fs.allies = fs.allies.filter(a => a !== f);
  const after = relation(f);
  if (!quiet) toast(`${FACTIONS[f].name} ${d > 0 ? '+' : ''}${d}` + (before !== after ? ` — now <b>${after}</b>` : ''), 2.5);
}
export const karma = d => { G.save.karma += d; };

/* ---------- Faction camps ---------- */
function spawnCamp(f) {
  const F = FACTIONS[f], L = LOCATIONS.find(l => l.id === F.loc);
  if (G.save.factions.destroyed.includes(f)) return;
  const leader = spawnNPC({ name: F.leader, faction: f, role: 'leader', shirt: F.shirt, hat: F.hat, x: L.x, z: L.z - 4, hp: 200, weapon: 'pistol' });
  leader.talk = addInteractable({ getPos: () => leader.pos, r: 2.6, enabled: () => leader.alive && relation(f) !== 'hostile',
    label: () => `Talk to ${F.leader} (${F.name})`, action: () => talkToLeader(f) });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    spawnNPC({ name: randomName(), faction: f, role: 'guard', shirt: F.shirt, hat: F.hat, x: L.x + Math.sin(a) * L.r * 0.55, z: L.z + Math.cos(a) * L.r * 0.55, weapon: F.weapons[i % F.weapons.length] });
  }
}

const TRADES = {
  haven:  [['2 scrap', { scrap: 2 }, '3 food', { food: 3 }], ['2 wood', { wood: 2 }, '2 water', { water: 2 }]],
  wolves: [['3 food', { food: 3 }, '6 ammo', { ammo: 6 }], ['4 scrap', { scrap: 4 }, 'a pistol', { gun: 'pistol' }]],
  order:  [['2 food', { food: 2 }, '2 meds', { meds: 2 }], ['3 scrap', { scrap: 3 }, '1 meds + 2 water', { meds: 1, water: 2 }]]
};
const has = cost => Object.entries(cost).every(([k, v]) => (G.save.inv[k] || 0) >= v);
function trade(f) {
  const inv = G.save.inv;
  showChoice(`Trade — ${FACTIONS[f].name}`, 'What do you offer?', [
    ...TRADES[f].map(([gl, give, tl, take]) => ({ label: `Give ${gl} → get ${tl}`, disabled: !has(give), fn: () => {
      for (const [k, v] of Object.entries(give)) inv[k] -= v;
      for (const [k, v] of Object.entries(take)) { if (k === 'gun') { if (!inv.gun) inv.gun = v; inv.ammo += 4; } else inv[k] = (inv[k] || 0) + v; }
      toast('Deal.'); changeRep(f, 2, true); trade(f);
    } })),
    { label: 'Done' }
  ]);
}

export function talkToLeader(f) {
  const F = FACTIONS[f], fs = G.save.factions, rel = relation(f), mine = fs.player;
  const greet = { friendly: 'Good to see you, friend.', ally: 'Our people stand with yours.', neutral: 'State your business.' }[rel] || '...';
  const choices = [
    { label: 'Trade', fn: () => trade(f) },
    { label: 'Is there work for me?', fn: () => G.story?.offerWork(f) || showChoice(F.leader, '"Nothing right now. Come back another day."', [{ label: 'OK' }]) }
  ];
  if (mine && rel !== 'ally') choices.push({ label: `Propose an alliance with ${esc(mine.name)}`, note: 'Needs them to be friendly (30+)', disabled: rel !== 'friendly', fn: () => {
    fs.allies.push(f); toast(`<b>${F.name}</b> is now your ally!`, 3); G.emit('alliance', f);
  } });
  choices.push({ label: 'Leave' });
  showChoice(`${F.leader} — ${F.name}`, `<i>${F.about}</i><br><br>"${greet}"<br><small>Reputation: ${fs.rep[f]} (${rel})</small>`, choices);
}

/* ---------- Wandering survivors ---------- */
const STORIES = [
  'is hiding behind a car, clutching an empty water bottle.',
  'is limping — a bite? No, just a bad fall, they swear.',
  'is scavenging alone and looks like they have not slept in days.',
  'lost their group to a horde last night.',
  'is a former nurse looking for somewhere safe.',
  'is a mechanic with a bag of tools and nowhere to go.'
];
function spawnWanderer(x, z) {
  const n = spawnNPC({ name: randomName(), role: 'wanderer', shirt: [0x6b6b5a, 0x7a5a3a, 0x3a5a7a, 0x8a7a5a][Math.floor(Math.random() * 4)], x, z, weapon: Math.random() < 0.5 ? 'bat' : null });
  n.story = STORIES[Math.floor(Math.random() * STORIES.length)];
  n.talk = addInteractable({ getPos: () => n.pos, r: 2.4, enabled: () => n.alive && n.role === 'wanderer', label: () => `Talk to ${n.name}`, action: () => talkToWanderer(n) });
  return n;
}

function talkToWanderer(n) {
  const fs = G.save.factions, inv = G.save.inv, mine = fs.player;
  const full = mine && mine.members.length >= maxMembers();
  showChoice(n.name, `${n.name} ${n.story}`, [
    { label: mine ? `Invite ${n.name} to join ${esc(mine.name)}` : 'Invite them to join you', note: !mine ? 'Create your faction first (Q / CREW)' : full ? 'Your group is full — claim a base for more room' : 'Costs 1 food', disabled: !mine || full || inv.food < 1,
      fn: () => { inv.food--; recruit(n); karma(1); } },
    { label: 'Give them food and water', note: 'Costs 1 food, 1 water', disabled: inv.food < 1 || inv.water < 1, fn: () => {
      inv.food--; inv.water--; karma(2); changeRep('haven', 4); n.story = 'thanks you again for the food.'; } },
    { label: 'Rob them', note: 'Take what they have', fn: () => {
      inv.scrap += 1 + Math.floor(Math.random() * 3); inv.ammo += Math.floor(Math.random() * 4); inv.food += 1;
      karma(-3); changeRep('wolves', 5); changeRep('haven', -6);
      toast(`You take ${n.name}'s supplies. They run.`); n.role = 'gone'; n.home = { x: n.pos.x + 80, z: n.pos.z + 80 };
      setTimeout(() => removeNPC(n), 15000);
      G.emit('robbed', n);
    } },
    { label: 'Leave' }
  ]);
}

/* ---------- Your faction ---------- */
export const maxMembers = () => (G.save.factions.player?.base ? 8 : 3);

function recruit(n) {
  const mine = G.save.factions.player;
  removeInteractable(n.talk);
  removeNPC(n);
  const data = { id: Date.now() + Math.random(), name: n.name, hp: n.hp, weapon: n.weapon || 'bat', mode: 'follow', x: n.pos.x, z: n.pos.z };
  mine.members.push(data);
  spawnMember(data);
  toast(`<b>${n.name}</b> joined ${esc(mine.name)}!`, 3);
  G.emit('recruited', data);
}

function spawnMember(data) {
  const mine = G.save.factions.player;
  const n = spawnNPC({ name: data.name, role: 'member', faction: null, shirt: new THREE.Color(mine.color).getHex(), x: data.x, z: data.z, weapon: data.weapon, data, hp: 100 });
  n.hp = data.hp; n.mode = data.mode;
  if (data.mode === 'guard') n.home = { x: data.hx ?? data.x, z: data.hz ?? data.z };
  return n;
}
export const members = () => npcs.filter(n => n.role === 'member' && n.alive);

function createFaction() {
  showModal(`<div class="panel"><h2>Found your faction</h2>
    <p>Every group needs a name and something to believe in. Your choice changes how others see you.</p>
    <label>Name<input id="f-name" maxlength="24" placeholder="e.g. The Last Light"></label>
    <label>Colour<select id="f-color">${Object.entries(COLORS).map(([k, v]) => `<option value="${v}">${k}</option>`).join('')}</select></label>
    <label>Belief<select id="f-ideo">${Object.entries(IDEOLOGIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
    <button class="primary" id="f-ok">Create</button> <button id="f-cancel">Cancel</button></div>`);
  document.getElementById('f-cancel').onclick = closeModal;
  document.getElementById('f-ok').onclick = () => {
    const name = document.getElementById('f-name').value.trim() || 'The Survivors';
    const ideo = document.getElementById('f-ideo').value;
    G.save.factions.player = { name, color: document.getElementById('f-color').value, ideology: ideo, base: null, members: [], stock: { food: 0, water: 0 }, founded: G.save.world.day };
    closeModal();
    for (const [f, d] of Object.entries(IDEOLOGIES[ideo].rep)) changeRep(f, d, true);
    toast(`<b>${esc(name)}</b> is founded. Find survivors to recruit.`, 4);
    G.emit('factionCreated', G.save.factions.player);
  };
}

export function openFactionMenu() {
  const fs = G.save.factions, mine = fs.player;
  if (!mine) return createFaction();
  const base = mine.base && LOCATIONS.find(l => l.id === mine.base);
  const mem = members();
  const rows = mem.map(n => `<div class="row"><span>${esc(n.name)} · ${n.weapon} · ❤ ${n.hp | 0}</span>
    <button class="small" data-m="${n.data.id}">${n.mode === 'follow' ? 'Following' : 'Guarding'}</button></div>`).join('') || '<p style="opacity:.6">No members yet. Talk to survivors you meet.</p>';
  const reps = Object.entries(FACTIONS).map(([f, F]) => `<div class="row"><span style="color:${F.css}">${F.name}</span><span>${fs.rep[f]} · ${relation(f)}</span></div>`).join('');
  showModal(`<div class="panel"><h2 style="color:${mine.color}">${esc(mine.name)}</h2>
    <p>${IDEOLOGIES[mine.ideology].label} · Founded day ${mine.founded}<br>Base: ${base ? base.name : 'none — stand in an empty place you found and claim it'}</p>
    <h3>Members (${mem.length}/${maxMembers()})</h3>${rows}
    <h3>Other factions</h3>${reps}
    <p style="font-size:12px;opacity:.6">Karma: ${G.save.karma}. G key / CMD button: everyone follow ↔ hold position.</p>
    <button class="primary" id="fm-close">Close</button></div>`);
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const n = mem.find(m => String(m.data.id) === b.dataset.m); setMode(n, n.mode === 'follow' ? 'guard' : 'follow'); openFactionMenu();
  });
  document.getElementById('fm-close').onclick = closeModal;
}

function setMode(n, mode) {
  n.mode = n.data.mode = mode;
  if (mode === 'guard') {
    const mine = G.save.factions.player, b = mine.base && LOCATIONS.find(l => l.id === mine.base);
    const atBase = b && Math.hypot(n.pos.x - b.x, n.pos.z - b.z) < b.r;
    n.home = { x: n.pos.x, z: n.pos.z }; n.data.hx = n.pos.x; n.data.hz = n.pos.z; n.data.atBase = !!atBase;
  } else n.data.atBase = false;
}

/* ---------- Bases ---------- */
const BASE_COST = { wood: 10, scrap: 5 };
const claimable = L => !L.faction && G.save.world.discovered.includes(L.id) && !G.save.factions.player?.base && !(G.save.world.lost || []).includes(L.id);

function buildBaseVisuals(L) {
  const mine = G.save.factions.player;
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), new THREE.MeshLambertMaterial({ color: 0x777777 })); pole.position.y = 3.5;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshLambertMaterial({ color: mine.color, side: THREE.DoubleSide })); flag.position.set(1.1, 6.2, 0);
  g.add(pole, flag); g.position.set(L.x + 3, heightAt(L.x + 3, L.z + 3), L.z + 3); G.scene.add(g);
  addCircle(L.x + 3, L.z + 3, 0.3);
  const mat = new THREE.MeshLambertMaterial({ color: 0x6b4f33 });
  for (let i = 0; i < 14; i++) {
    if (i === 0) continue;
    const a = i / 14 * Math.PI * 2, R = L.r + 4, x = L.x + Math.sin(a) * R, z = L.z + Math.cos(a) * R;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * Math.PI * R / 14 * 0.7, 1.4, 0.6), mat);
    m.position.set(x, heightAt(x, z) + 0.7, z); m.rotation.y = a + Math.PI / 2; m.castShadow = true; G.scene.add(m);
  }
  G.baseFlag = flag;
}

function claimBase(L) {
  const inv = G.save.inv, mine = G.save.factions.player;
  for (const [k, v] of Object.entries(BASE_COST)) inv[k] -= v;
  mine.base = L.id;
  buildBaseVisuals(L);
  toast(`<b>${L.name}</b> is now the base of ${esc(mine.name)}. No zombies will rise inside it.`, 4);
  G.emit('baseClaimed', L);
}

function manageBase(L) {
  const mine = G.save.factions.player, s = mine.stock, inv = G.save.inv;
  const guards = mine.members.filter(m => m.mode === 'guard' && m.atBase).length;
  showChoice(`${esc(mine.name)} — ${L.name}`, `Guards at base: ${guards} (each finds 1 food + 1 water a day).<br>Stockpile: 🥫 ${s.food} · 💧 ${s.water}`, [
    { label: 'Collect the stockpile', disabled: !s.food && !s.water, fn: () => { inv.food += s.food; inv.water += s.water; toast(`Collected ${s.food} food, ${s.water} water.`); s.food = s.water = 0; } },
    { label: 'Order followers to guard the base', fn: () => { for (const n of members()) if (n.mode === 'follow') { setMode(n, 'guard'); n.home = { x: L.x + (Math.random() - 0.5) * L.r, z: L.z + (Math.random() - 0.5) * L.r }; n.data.hx = n.home.x; n.data.hz = n.home.z; n.data.atBase = true; } toast('They take up positions.'); } },
    { label: 'Sleep until morning', note: 'Heals you fully', fn: () => {
      const w = G.save.world; if (w.hour > 7) { w.day++; G.emit('newDay', w.day); } w.hour = 7;
      G.save.stats.hp = G.save.stats.maxHp; G.save.stats.hunger -= 15; G.save.stats.thirst -= 20; toast('You wake up rested.');
    } },
    { label: 'Leave' }
  ]);
}

/* ---------- System ---------- */
export const factionSystem = {
  init() {
    const fs = G.save.factions;
    G.relation = relation;
    for (const f of Object.keys(FACTIONS)) spawnCamp(f);
    // survivors scattered around the world
    for (let i = 0; i < 9; i++) {
      const L = LOCATIONS.filter(l => !l.faction)[i % 7];
      spawnWanderer(L.x + (Math.random() - 0.5) * L.r * 1.6, L.z + (Math.random() - 0.5) * L.r * 1.6);
    }
    if (fs.player) {
      for (const m of fs.player.members) spawnMember(m);
      if (fs.player.base) buildBaseVisuals(LOCATIONS.find(l => l.id === fs.player.base));
    }
    // claim/manage points at every location
    for (const L of LOCATIONS.filter(l => !l.faction)) {
      addInteractable({ x: L.x, z: L.z, r: 5, enabled: () => !!G.save.factions.player && (claimable(L) || G.save.factions.player.base === L.id),
        label: () => G.save.factions.player.base === L.id ? 'Manage base' : `Claim ${L.name} as your base (10 wood, 5 scrap)`,
        action: () => {
          if (G.save.factions.player.base === L.id) return manageBase(L);
          if (!has(BASE_COST)) return toast('You need 10 wood and 5 scrap to fortify this place.');
          claimBase(L);
        } });
    }
    G.isSafe = (x, z) => {
      const mine = G.save.factions.player;
      return LOCATIONS.some(L => (L.faction && relation(L.faction) !== 'gone' && Math.hypot(x - L.x, z - L.z) < L.r + 15) ||
        (mine && mine.base === L.id && Math.hypot(x - L.x, z - L.z) < L.r + 25));
    };
    G.hostileTargets = () => npcs.filter(n => n.alive && n.mesh.visible && n.faction && relation(n.faction) === 'hostile');
    G.targetsForZombies = () => npcs.filter(n => n.alive && n.mesh.visible && n.role !== 'leader');
    G.locationColor = L => L.faction ? FACTIONS[L.faction].css : (G.save.factions.player?.base === L.id ? G.save.factions.player.color : '#e0a34a');
    G.mapLegend = () => Object.values(FACTIONS).map(F => `<span style="color:${F.css}">● ${F.name}</span>`).join(' ');
    G.on('newDay', () => {
      const mine = G.save.factions.player;
      if (mine?.base) { const g = mine.members.filter(m => m.mode === 'guard' && m.atBase).length; mine.stock.food += g; mine.stock.water += g; }
      const P = G.player, a = Math.random() * 6.28;
      spawnWanderer(P.pos.x + Math.sin(a) * 60, P.pos.z + Math.cos(a) * 60);   // a new survivor appears every day
    });
    G.on('npcDied', n => {
      if (n.faction && FACTIONS[n.faction]) changeRep(n.faction, n.role === 'leader' ? -40 : -8);
      if (n.role === 'leader') { G.save.factions.leadersKilled.push(n.faction); G.emit('leaderKilled', n.faction); }
      if (n.role === 'member') {
        const mine = G.save.factions.player;
        mine.members = mine.members.filter(m => m !== n.data);
        toast(`💀 <b>${esc(n.name)}</b> has died.`, 3);
      }
    });
    addTouchButton('CREW', 'faction', true);
    addTouchButton('CMD', 'command', true);
  },
  update(dt) {
    if (pressed('faction')) openFactionMenu();
    if (pressed('command') && G.save.factions.player) {
      const mem = members(); if (!mem.length) return;
      const anyFollow = mem.some(n => n.mode === 'follow');
      for (const n of mem) setMode(n, anyFollow ? 'guard' : 'follow');
      toast(anyFollow ? 'Hold position!' : 'Follow me!', 1.5);
    }
    if (G.baseFlag) G.baseFlag.rotation.y = Math.sin(G.time * 2) * 0.3;
  }
};
