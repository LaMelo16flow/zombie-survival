import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { pressed, addTouchButton } from './input.js';
import { LOCATIONS } from './locations.js';
import { FACTIONS, changeRep, relation, addSpecialMember, members } from './factions.js';
import { spawnZombie } from './zombies.js';
import { spawnNPC, removeNPC, npcs, randomName } from './npc.js';
import { addInteractable, removeInteractable } from './interact.js';
import { heightAt } from './world.js';
import { toast, showChoice, showModal, closeModal, esc } from './ui.js';
import { sfx } from './audio.js';

/*
  MISSIONS
  • Faction story chains — 3 missions each from Mara (Haven), Kane (Iron Wolves) and Brother Elias (the Order).
  • Side missions — ask survivors you meet "Do you need help?".
  • Track one mission at a time: a gold beacon and a star on the minimap lead you there (J for the journal).
  Mission types: fetch, go-to, clear a horde, rescue + escort, hunt, kill specific zombies, kill a boss.
*/
const loc = id => LOCATIONS.find(l => l.id === id);
const M = () => (G.save.missions = G.save.missions || { active: [], done: [], tracked: null });
const has = needs => Object.entries(needs).every(([k, v]) => (G.save.inv[k] || 0) >= v);
const ITEMNAME = { meds: 'medkits', fuel: 'fuel cans', water: 'water', food: 'food', ammo: 'bullets', meat: 'cooked meat', leather: 'leather', herbs: 'herbs' };

/* ---------- Faction chains ---------- */
const CHAINS = {
  haven: [
    { title: 'Medicine run', desc: 'Mara needs 3 medkits for the sick children.', type: 'fetch', needs: { meds: 3 }, reward: { food: 4, water: 4 }, rep: 12, xp: 80 },
    { title: 'The lost scout', desc: 'Haven\'s scout Ellie went to Miller Farm and never came back. Find her and bring her home.', type: 'rescue', at: 'farm', name: 'Ellie', back: 'haven', reward: { meds: 2, seeds: 4 }, rep: 15, xp: 140 },
    { title: 'Defend the Haven', desc: 'A horde is marching on Riverside Haven. Clear it before it breaks the walls.', type: 'clear', at: 'haven', count: 14, kinds: ['walker', 'runner', 'brute', 'exploder'], reward: { meds: 4, seeds: 6, metal: 4 }, rep: 30, xp: 300, done: 'Mara offers Haven\'s full support. (Alliance unlocked if you have a faction.)' }
  ],
  wolves: [
    { title: 'Fuel for the pack', desc: 'Kane wants 3 fuel cans for the bikes.', type: 'fetch', needs: { fuel: 3 }, reward: { ammo: 15 }, rep: 12, xp: 80 },
    { title: 'Prove your teeth', desc: 'Kill 5 armoured riot zombies. Kane respects only strength.', type: 'kill', kind: 'armored', count: 5, reward: { ammo: 20, metal: 3 }, rep: 15, xp: 160 },
    { title: 'Take the fort', desc: 'Kill The Colonel at Fort Kessler so the Wolves can claim it.', type: 'boss', boss: 'colonel', reward: { ammo: 40, fuel: 3 }, rep: 30, xp: 300, done: 'The Iron Wolves raise their banner over Fort Kessler.' }
  ],
  order: [
    { title: 'Silence the screamers', desc: 'Brother Elias says the screamers "disturb the Signal". Kill 3 of them.', type: 'kill', kind: 'screamer', count: 3, reward: { herbs: 6, meds: 1 }, rep: 12, xp: 100 },
    { title: 'The old radio', desc: 'Fetch the old school radio from Pine Valley School — the faithful want it.', type: 'goto', at: 'school', item: 'the old school radio', reward: { meds: 2, water: 3 }, rep: 15, xp: 120 },
    { title: 'Face the source', desc: 'Elias says the Signal demands the death of Patient Zero, deep in Helix Lab.', type: 'boss', boss: 'zero', reward: { meds: 5, herbs: 5 }, rep: 30, xp: 300, done: 'Elias falls silent. "Then the Signal… lied to us?"' }
  ]
};
const GIVER = { haven: 'Mara', wolves: 'Kane', order: 'Brother Elias' };

/* ---------- Side missions from survivors ---------- */
function sideMission(giverName) {
  const found = LOCATIONS.filter(l => !l.faction && G.save.world.discovered.includes(l.id));
  const L = found.length ? found[Math.floor(Math.random() * found.length)] : loc('pine');
  const r = Math.random();
  if (r < 0.3) return { title: `Clear ${L.name}`, desc: `${giverName}'s family is hiding near ${L.name}. Kill the horde there.`, type: 'clear', at: L.id, count: 8, kinds: ['walker', 'runner', 'crawler'], reward: { food: 3, ammo: 8 }, xp: 120 };
  if (r < 0.5) return { title: 'Fresh meat', desc: `${giverName} is starving. Hunt 2 deer.`, type: 'hunt', kind: 'deer', count: 2, reward: { ammo: 6, cloth: 3 }, xp: 100 };
  if (r < 0.7) return { title: 'Thirsty', desc: `${giverName} needs 3 water.`, type: 'fetch', needs: { water: 3 }, reward: { scrap: 6, cloth: 2 }, xp: 60, giverHere: true };
  return { title: `Find ${giverName}'s friend`, desc: `${giverName}'s friend is trapped near ${L.name}. Bring them back here.`, type: 'rescue', at: L.id, name: randomName(), backXZ: { x: G.player.pos.x, z: G.player.pos.z }, reward: { meds: 1, food: 3 }, xp: 150, recruit: true };
}

/* ---------- Taking and finishing missions ---------- */
function start(m) {
  if (m.chain && M().active.some(a => a.chain === m.chain)) return;
  m.id = 'm' + Date.now() + Math.floor(Math.random() * 99); m.progress = 0; m.stage = 0;
  if (m.type === 'kill' || m.type === 'hunt') m.start = 0;
  M().active.push(m); M().tracked = m.id;
  G.banner?.(m.title, 'NEW MISSION', 2.6); sfx.discover();
  G.story?.log?.(`Started mission: ${m.title}.`);
}
function complete(m) {
  const s = M(); s.active = s.active.filter(a => a !== m); s.done.push(m.chain ? m.chain + m.step : m.title);
  if (s.tracked === m.id) s.tracked = s.active[0]?.id || null;
  const inv = G.save.inv, got = [];
  for (const [k, v] of Object.entries(m.reward || {})) { inv[k] = (inv[k] || 0) + v; got.push(`${v} ${ITEMNAME[k] || k}`); }
  if (m.chain) { changeRep(m.chain, m.rep || 10); G.save.missions.chain = G.save.missions.chain || {}; G.save.missions.chain[m.chain] = m.step + 1; }
  if (m.chain === 'haven' && m.step === 2 && mine() && !G.save.factions.allies.includes('haven')) { G.save.factions.allies.push('haven'); }
  G.emit('missionDone', m);
  G.banner?.(m.title, 'MISSION COMPLETE', 3); sfx.pickup();
  setTimeout(() => showChoice('Mission complete', `<b>${m.title}</b><br>${m.done || ''}<br>Reward: ${got.join(', ') || '—'} · +${m.xp || 80} XP`, [{ label: 'Nice' }]), 600);
  G.story?.log?.(`Completed mission: ${m.title}.`);
  cleanup(m);
}
const mine = () => G.save.factions.player;

/* ---------- Choices added to existing dialogs ---------- */
export function leaderChoice(f) {
  const step = (G.save.missions?.chain || {})[f] || 0, chain = CHAINS[f];
  const act = M().active.find(m => m.chain === f);
  if (act) {
    if (act.type === 'fetch') return { label: `Hand over ${Object.entries(act.needs).map(([k, v]) => `${v} ${ITEMNAME[k] || k}`).join(', ')} (${act.title})`, disabled: !has(act.needs),
      fn: () => { for (const [k, v] of Object.entries(act.needs)) G.save.inv[k] -= v; complete(act); } };
    return { label: `Mission: ${act.title} — in progress`, note: act.desc, disabled: true };
  }
  if (step >= chain.length) return null;
  const m = chain[step];
  return { label: `Story mission ${step + 1}/3: ${m.title}`, note: m.desc, fn: () => start({ ...m, chain: f, step, giver: GIVER[f] }) };
}
export function wandererChoice(n) {
  const act = M().active.find(m => m.giverId === n.uid);
  if (act) {
    if (act.type === 'fetch') return { label: `Give ${Object.entries(act.needs).map(([k, v]) => `${v} ${ITEMNAME[k] || k}`).join(', ')}`, disabled: !has(act.needs), fn: () => { for (const [k, v] of Object.entries(act.needs)) G.save.inv[k] -= v; complete(act); } };
    return null;
  }
  if (M().active.filter(m => !m.chain).length >= 3) return { label: 'Do you need help?', note: 'You already have 3 side missions', disabled: true };
  return { label: 'Do you need help?', fn: () => {
    n.uid = n.uid || 'w' + Date.now();
    const m = sideMission(n.name); m.giver = n.name; m.giverId = n.uid; if (m.giverHere) m.giverXZ = { x: n.pos.x, z: n.pos.z };
    showChoice(n.name, `"${m.desc}"`, [{ label: 'I\'ll do it', fn: () => start(m) }, { label: 'Not now' }]);
  } };
}

/* ---------- Mission targets and checks ---------- */
function targetOf(m) {
  if (m.type === 'rescue') { if (m.stage === 1) { const b = m.back ? loc(m.back) : m.backXZ; return b ? { x: b.x, z: b.z, r: 10 } : null; } const L = loc(m.at); return { x: L.x, z: L.z, r: L.r }; }
  if (m.at) { const L = loc(m.at); return { x: L.x, z: L.z, r: L.r }; }
  if (m.type === 'boss') { const L = loc(m.boss === 'colonel' ? 'fort' : 'lab'); return { x: L.x, z: L.z, r: L.r }; }
  if (m.type === 'fetch') { if (m.giverXZ) return { ...m.giverXZ, r: 4 }; if (m.chain) { const L = loc(FACTIONS[m.chain].loc); return { x: L.x, z: L.z, r: L.r }; } }
  return null;
}
export function objectiveText(m) {
  switch (m.type) {
    case 'fetch': return `Bring ${Object.entries(m.needs).map(([k, v]) => `${Math.min(G.save.inv[k] || 0, v)}/${v} ${ITEMNAME[k] || k}`).join(', ')} to ${m.giver}`;
    case 'kill': return `Kill ${m.kind}s: ${m.progress}/${m.count}`;
    case 'hunt': return `Hunt ${m.kind}: ${m.progress}/${m.count}`;
    case 'clear': return m.spawned ? `Clear the horde: ${m.left ?? m.count} left` : `Go to ${loc(m.at).name}`;
    case 'rescue': return m.stage === 0 ? `Find ${m.name} at ${loc(m.at).name}` : `Bring ${m.name} back${m.back ? ' to ' + loc(m.back).name : ''}`;
    case 'goto': return `Go to ${loc(m.at).name} and find ${m.item}`;
    case 'boss': return `Kill ${m.boss === 'colonel' ? 'The Colonel' : 'Patient Zero'}`;
  }
  return '';
}

const runtime = new Map();   // per-mission things that live only this session (spawned NPCs, pickups)
function cleanup(m) { const r = runtime.get(m.id); if (!r) return; if (r.npc && r.npc.alive) { if (m.recruit && mine() && members().length < 8) { /* joins */ addSpecialMember(r.npc.name, null, 'bat'); toast(`${r.npc.name} joins ${esc(mine().name)}!`); } removeNPC(r.npc); } if (r.inter) removeInteractable(r.inter); if (r.item) G.scene.remove(r.item); runtime.delete(m.id); }

function tick(m) {
  const P = G.player.pos, t = targetOf(m), d = t ? Math.hypot(P.x - t.x, P.z - t.z) : 1e9;
  const r = runtime.get(m.id) || {}; runtime.set(m.id, r);
  if (m.type === 'boss' && G.save.world.bosses?.[m.boss] === 'dead') return complete(m);
  if (m.type === 'clear') {
    if (!m.spawned && d < 70) {
      m.spawned = true; r.z = [];
      for (let i = 0; i < m.count; i++) r.z.push(spawnZombie(t.x + (Math.random() - 0.5) * 24, t.z + (Math.random() - 0.5) * 24, m.kinds[i % m.kinds.length], { mission: m.id, state: 'chase' }));
      G.banner?.('Horde!', m.title.toUpperCase(), 2);
    }
    if (m.spawned) {
      if (!r.z) { m.spawned = false; return; }        // reloaded mid-fight: respawn when you come back
      m.left = r.z.filter(z => z.alive).length;
      if (m.left === 0) complete(m);
    }
  }
  if (m.type === 'rescue') {
    if (m.stage === 0 && d < 80 && !r.npc) {
      const L = loc(m.at);
      r.npc = spawnNPC({ name: m.name, role: 'escort', shirt: 0x7a5a3a, x: L.x + 6, z: L.z + 6, weapon: 'bat', hp: 90 });
      r.npc.mode = 'idle';
      r.inter = addInteractable({ getPos: () => r.npc.pos, r: 2.6, enabled: () => r.npc.alive && m.stage === 0, label: () => `Talk to ${m.name}`, action: () => {
        m.stage = 1; r.npc.mode = 'follow'; toast(`${m.name}: "Thank you! Get me out of here!"`, 3);
        for (let i = 0; i < 6; i++) spawnZombie(L.x + (Math.random() - 0.5) * 40, L.z + (Math.random() - 0.5) * 40, 'runner', { state: 'chase' });
      } });
    }
    if (m.stage === 1 && r.npc) {
      if (!r.npc.alive) { toast(`${m.name} didn't make it. Mission failed.`, 3); M().active = M().active.filter(a => a !== m); cleanup(m); return; }
      const b = targetOf(m);
      if (Math.hypot(r.npc.pos.x - b.x, r.npc.pos.z - b.z) < b.r + 4) complete(m);
    }
    if (m.stage === 1 && !r.npc) m.stage = 0;        // reloaded: they wait at the place again
  }
  if (m.type === 'goto') {
    if (!r.item && d < 80) {
      const L = loc(m.at), mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), new THREE.MeshBasicMaterial({ color: 0xffc94a }));
      const x = L.x - 6, z = L.z - 8; mesh.position.set(x, heightAt(x, z) + 0.8, z); G.scene.add(mesh); r.item = mesh;
      r.inter = addInteractable({ x, z, r: 2.4, label: () => `Take ${m.item}`, action: () => { complete(m); } });
    }
    if (r.item) r.item.rotation.y += 0.03;
  }
}

/* ---------- Beacon + tracker HUD ---------- */
let beacon, panel;
export function trackedMission() { const s = M(); return s.active.find(m => m.id === s.tracked) || null; }

export function openMissions() {
  const s = M();
  const rows = s.active.map(m => `<div class="row"><span><b>${m.title}</b>${m.chain ? ` <small style="color:${FACTIONS[m.chain].css}">${FACTIONS[m.chain].name}</small>` : ''}<br><small style="opacity:.8">${objectiveText(m)}</small></span>
    <button class="small ${m.id === s.tracked ? 'primary' : ''}" data-tr="${m.id}">${m.id === s.tracked ? 'Tracking' : 'Track'}</button></div>`).join('') || '<p style="opacity:.7">No missions. Talk to faction leaders, or ask survivors if they need help.</p>';
  showModal(`<div class="panel"><h2>Missions</h2>${rows}<p style="font-size:12px;opacity:.6">Done: ${s.done.length}</p><button class="primary" id="ms-close">Close</button> <button id="ms-journal">Journal</button></div>`);
  document.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { s.tracked = b.dataset.tr; openMissions(); });
  document.getElementById('ms-close').onclick = closeModal;
  document.getElementById('ms-journal').onclick = () => G.openJournal?.();
}

let checkT = 0;
export const missionSystem = {
  init() {
    M();
    G.missions = { leaderChoice, wandererChoice, tracked: trackedMission, objectiveText };
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.35, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beacon.visible = false; G.scene.add(beacon);
    panel = document.createElement('div'); panel.id = 'mission'; document.getElementById('hud').appendChild(panel);
    addTouchButton('QUESTS', 'missions', true);
    G.on('zombieKilled', zb => { for (const m of M().active) if (m.type === 'kill' && zb.kind === m.kind) { m.progress++; if (m.progress >= m.count) complete(m); } });
    G.on('animalKilled', a => { for (const m of M().active) if (m.type === 'hunt' && a.kind === m.kind) { m.progress++; if (m.progress >= m.count) complete(m); } });
    G.on('bossKilled', id => { for (const m of [...M().active]) if (m.type === 'boss' && m.boss === id) complete(m); });
  },
  update(dt) {
    if (pressed('missions')) openMissions();
    checkT -= dt;
    if (checkT <= 0) { checkT = 0.4; for (const m of [...M().active]) tick(m); }
    const m = trackedMission(), t = m && targetOf(m);
    beacon.visible = !!t;
    if (t) { beacon.position.set(t.x, heightAt(t.x, t.z) + 60, t.z); beacon.material.opacity = 0.25 + Math.sin(G.time * 3) * 0.1; }
    const html = m ? `<b>${m.title}</b><span>${objectiveText(m)}${t ? ` · ${Math.round(Math.hypot(G.player.pos.x - t.x, G.player.pos.z - t.z))} m` : ''}</span>` : '';
    if (panel._h !== html) { panel.innerHTML = html; panel._h = html; panel.style.display = m ? '' : 'none'; }
    G.missionTarget = t;
  }
};
