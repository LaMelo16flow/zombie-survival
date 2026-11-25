import { G } from './state.js';
import { pressed, addTouchButton } from './input.js';
import { ITEMS, MELEE, GUNS, ARMOR } from './items.js';
import { toast, showModal, closeModal, icon } from './ui.js';
import { sfx } from './audio.js';

/*
  CRAFTING — press C (CRAFT on iPhone).
  Some recipes need a station nearby: Workbench, Campfire or Forge (build them with B).
  Tier 1 = by hand / workbench, tier 2 = workbench + metal, tier 3 = forge.
*/

const STATION_NAME = { bench: 'Workbench', fire: 'Campfire', forge: 'Forge', tanning: 'Tanning rack', smoke: 'Smokehouse' };
const own = (list, k) => { const inv = G.save.inv; inv[list] = inv[list] || []; if (!inv[list].includes(k)) inv[list].push(k); };
const gear = (kind, k) => () => {
  const inv = G.save.inv;
  if (kind === 'melee') { own('ownedMelee', k); inv.melee = k; }
  if (kind === 'gun') { own('ownedGuns', k); inv.gun = k; }
  if (kind === 'armor') { own('ownedArmor', k); inv.armor = k; }
};
const add = (k, n) => () => { G.save.inv[k] = (G.save.inv[k] || 0) + n; };
const owns = (list, k) => (G.save.inv[list] || []).includes(k);

export const RECIPES = [
  // ---- Basics (by hand)
  { cat: 'Basics', name: '2 Bandages', needs: { cloth: 2 }, give: add('bandage', 2) },
  { cat: 'Basics', name: 'Rope', needs: { cloth: 3 }, give: add('rope', 1) },
  { cat: 'Basics', name: 'Herbal remedy', needs: { herbs: 3, water: 1 }, give: add('herbmed', 1) },
  { cat: 'Basics', name: 'Bone spear', needs: { wood: 2, bone: 2 }, give: gear('melee', 'spear'), have: () => owns('ownedMelee', 'spear') },
  // ---- Workbench
  { cat: 'Weapons', name: '6 Crossbow bolts', needs: { wood: 2, scrap: 1 }, station: 'bench', give: add('bolts', 6) },
  { cat: 'Weapons', name: 'Crossbow', needs: { wood: 4, rope: 1, scrap: 3 }, station: 'bench', give: gear('gun', 'crossbow'), have: () => owns('ownedGuns', 'crossbow') },
  { cat: 'Weapons', name: '6 Bullets', needs: { scrap: 3 }, station: 'bench', give: add('ammo', 6) },
  { cat: 'Weapons', name: 'Machete', needs: { scrap: 5, wood: 2 }, station: 'bench', give: gear('melee', 'machete'), have: () => owns('ownedMelee', 'machete') },
  { cat: 'Weapons', name: 'Fire axe (chops trees faster)', needs: { metal: 2, wood: 3 }, station: 'bench', give: gear('melee', 'axe'), have: () => owns('ownedMelee', 'axe') },
  { cat: 'Weapons', name: 'Pistol', needs: { scrap: 8, metal: 1 }, station: 'bench', give: gear('gun', 'pistol'), have: () => owns('ownedGuns', 'pistol') },
  { cat: 'Armour', name: 'Leather jacket (blocks 15%)', needs: { leather: 6, cloth: 2 }, station: 'bench', give: gear('armor', 'leather'), have: () => owns('ownedArmor', 'leather') },
  { cat: 'Materials', name: 'Tan leather', needs: { hide: 2 }, station: 'tanning', give: add('leather', 1) },
  { cat: 'Cooking', name: 'Smoke 2 jerky', needs: { rawmeat: 2, wood: 1 }, station: 'smoke', give: add('jerky', 2) },
  { cat: 'Medicine', name: 'Medkit', needs: { cloth: 2, herbs: 2, scrap: 1 }, station: 'bench', give: add('meds', 1) },
  // ---- Forge (tier 2–3)
  { cat: 'Materials', name: 'Smelt metal bar', needs: { scrap: 3, wood: 1 }, station: 'forge', give: add('metal', 1) },
  { cat: 'Weapons', name: 'Shotgun', needs: { metal: 4, wood: 3 }, station: 'forge', give: gear('gun', 'shotgun'), have: () => owns('ownedGuns', 'shotgun') },
  { cat: 'Weapons', name: 'Rifle', needs: { metal: 6, wood: 3, scrap: 4 }, station: 'forge', give: gear('gun', 'rifle'), have: () => owns('ownedGuns', 'rifle') },
  { cat: 'Weapons', name: 'Katana', needs: { metal: 6, leather: 1 }, station: 'forge', give: gear('melee', 'katana'), have: () => owns('ownedMelee', 'katana') },
  { cat: 'Armour', name: 'Riot gear (blocks 30%)', needs: { metal: 4, leather: 3, cloth: 2 }, station: 'forge', give: gear('armor', 'riot'), have: () => owns('ownedArmor', 'riot') },
  { cat: 'Armour', name: 'Military armour (blocks 45%)', needs: { metal: 8, leather: 4, cloth: 4 }, station: 'forge', give: gear('armor', 'military'), have: () => owns('ownedArmor', 'military') },
  // ---- Campfire cooking
  { cat: 'Cooking', name: 'Cook meat', needs: { rawmeat: 1, wood: 1 }, station: 'fire', give: add('meat', 1) },
  { cat: 'Cooking', name: 'Hearty stew', needs: { meat: 1, veg: 1, water: 1 }, station: 'fire', give: add('stew', 2) },
  { cat: 'Cooking', name: 'Hunter\'s stew', needs: { rawmeat: 2, herbs: 1, water: 1 }, station: 'fire', give: add('stew', 2) },
  { cat: 'Cooking', name: 'Boil lake water', needs: { wood: 1 }, station: 'fire', give: add('water', 1), cond: () => G.save.inv.lakewater > 0, pay: () => { G.save.inv.lakewater--; } }
];
export const recipesFor = station => RECIPES.filter(r => (r.station || null) === station);

const nameOf = k => (ITEMS[k] || {}).name || k;
const has = needs => Object.entries(needs).every(([k, v]) => (G.save.inv[k] || 0) >= v);
const stationNear = st => !st || (G.nearStation && G.nearStation(st));
const CATS = ['Basics', 'Weapons', 'Armour', 'Medicine', 'Materials', 'Cooking'];

let tab = 'Basics';
export function openCrafting(focus) {
  if (focus) tab = { bench: 'Weapons', forge: 'Weapons', fire: 'Cooking', smoke: 'Cooking', tanning: 'Materials' }[focus] || tab;
  const inv = G.save.inv;
  const list = RECIPES.filter(r => r.cat === tab && !(r.have && r.have()));
  const rows = list.map((r, i) => {
    const okStation = stationNear(r.station), okMat = has(r.needs) && (!r.cond || r.cond());
    const needs = Object.entries(r.needs).map(([k, v]) => `<span style="color:${(inv[k] || 0) >= v ? 'inherit' : '#ff8a8a'}">${v} ${nameOf(k).toLowerCase()} (${inv[k] || 0})</span>`).join(', ')
      + (r.cond && !r.cond() ? ', <span style="color:#ff8a8a">lake water</span>' : '');
    return `<div class="row"><span><b>${r.name}</b><br><small style="opacity:.75">${needs}${r.station ? ` · <span style="color:${okStation ? '#7ad35a' : '#ff8a8a'}">${STATION_NAME[r.station]}${okStation ? ' ✓' : ' needed'}</span>` : ''}</small></span>
      <button class="small ${okStation && okMat ? 'primary' : ''}" data-r="${RECIPES.indexOf(r)}" ${okStation && okMat ? '' : 'disabled'}>Craft</button></div>`;
  }).join('') || '<p style="opacity:.7">Nothing new to craft here — you own everything in this list.</p>';
  showModal(`<div class="panel"><h2>Crafting</h2>
    <div class="tabs">${CATS.map(c => `<button class="small ${c === tab ? 'on' : ''}" data-t="${c}">${c}</button>`).join('')}</div>
    ${rows}
    <p style="font-size:12px;opacity:.65">Stations nearby: ${['bench', 'fire', 'forge', 'tanning', 'smoke'].filter(s => stationNear(s)).map(s => STATION_NAME[s]).join(', ') || 'none — build them with B'}</p>
    <button id="cr-close">Close</button></div>`);
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; openCrafting(); });
  document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
    const r = RECIPES[+b.dataset.r];
    for (const [k, v] of Object.entries(r.needs)) inv[k] -= v;
    r.pay?.(); r.give(); sfx.pickup(); toast(`Crafted <b>${r.name}</b>`); G.emit('crafted', r); openCrafting();
  });
  document.getElementById('cr-close').onclick = closeModal;
}

export const craftingSystem = {
  init() { addTouchButton('CRAFT', 'craft', true); G.openCrafting = openCrafting; },
  update() { if (pressed('craft')) openCrafting(); }
};
