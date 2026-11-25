import { G, newSave } from './state.js';
import { clockText, isNight } from './daynight.js';
import { pressed, addTouchButton } from './input.js';
import { LOCATIONS } from './locations.js';
import { WORLD_SIZE } from './world.js';

const $ = id => document.getElementById(id);
let toastTimer = 0;

export function toast(msg, secs = 2.5) {
  const t = $('toast'); t.innerHTML = msg; t.style.opacity = 1; toastTimer = secs;
}

const BARS = [
  ['hp', 'HEALTH', '#c9372c'], ['hunger', 'FOOD', '#d39a3a'], ['thirst', 'WATER', '#3a8dd3'], ['stamina', 'STAMINA', '#9ac93a']
];
const barEls = {};
export function initHUD() {
  const wrap = $('bars'); wrap.innerHTML = '';
  for (const [k, label, color] of BARS) {
    const b = document.createElement('div'); b.className = 'bar';
    b.innerHTML = `<i style="background:${color}"></i><span>${label}</span>`;
    wrap.appendChild(b); barEls[k] = b.firstChild;
  }
  toast('Find shelter. Stay alive.', 3);
}

export function showDeath(cause) {
  const s = G.save;
  showModal(`<div class="panel" style="text-align:center"><h2 style="color:#c9372c">YOU DIED</h2>
    <p>${cause === 'zombie' ? 'The dead got you.' : cause === 'starving' ? 'Hunger and thirst took you.' : 'You did not make it.'}</p>
    <p>Survived to day ${s.world.day} · ${s.stats.kills} zombies killed</p>
    <button class="primary" id="d-again">Start again</button> <button id="d-load">Load last save</button></div>`);
  G.lockModal = true;
  $('d-again').onclick = () => G.newGame();
  $('d-load').onclick = () => location.reload();   // title screen offers Continue from the last autosave
}

export function showModal(html) { const m = $('modal'); m.innerHTML = html; m.classList.remove('hidden'); G.paused = true; document.exitPointerLock?.(); }
export function closeModal() { $('modal').classList.add('hidden'); G.paused = false; }

export function updateHUD(dt) {
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }
  const st = G.save.stats;
  for (const [k] of BARS) barEls[k].style.transform = `scaleX(${Math.max(0, st[k] / (k === 'hp' ? st.maxHp : 100))})`;
  const inv = G.save.inv;
  $('clock').innerHTML = `${clockText()}${isNight() ? ' 🌙' : ''}<br>☠ ${st.kills}` + (inv.gun ? `<br>🔫 ${inv.ammo}` : '');
}

/* ---------- Inventory ---------- */
const USE = {
  food:  { label: 'Eat',   fx: s => { s.hunger = Math.min(100, s.hunger + 35); }, msg: 'You eat. (+35 food)' },
  water: { label: 'Drink', fx: s => { s.thirst = Math.min(100, s.thirst + 40); }, msg: 'You drink. (+40 water)' },
  meds:  { label: 'Heal',  fx: s => { s.hp = Math.min(s.maxHp, s.hp + 45); }, msg: 'You patch yourself up. (+45 health)' }
};
const ICON = { food: '🥫', water: '💧', meds: '💊', wood: '🪵', scrap: '🔩', ammo: '🔫' };

export function openInventory() {
  const inv = G.save.inv;
  const rows = Object.keys(ICON).map(k => `<div class="row"><span>${ICON[k]} ${k}</span><span>${inv[k] || 0}
    ${USE[k] ? `<button class="small" data-use="${k}" ${inv[k] ? '' : 'disabled'}>${USE[k].label}</button>` : ''}</span></div>`).join('');
  showModal(`<div class="panel"><h2>Backpack</h2>
    <div class="row"><span>Melee</span><span>${inv.melee}</span></div>
    <div class="row"><span>Gun</span><span>${inv.gun || '—'}</span></div>
    ${rows}
    ${G.extraInventory ? G.extraInventory() : ''}
    <p style="opacity:.6;font-size:12px">Health ${G.save.stats.hp | 0} · Food ${G.save.stats.hunger | 0} · Water ${G.save.stats.thirst | 0}</p>
    <button class="primary" id="inv-close">Close</button></div>`);
  document.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    const k = b.dataset.use; if (!inv[k]) return;
    inv[k]--; USE[k].fx(G.save.stats); toast(USE[k].msg); openInventory();
  });
  $('inv-close').onclick = closeModal;
}

/* ---------- Map ---------- */
export function openMap() {
  const size = Math.max(200, Math.min(innerWidth - 80, innerHeight - 190));
  showModal(`<div class="panel" style="max-width:${size + 40}px"><h2>Map</h2>
    <canvas id="mapc" width="${size}" height="${size}" style="width:100%;border-radius:8px;background:#26301f"></canvas>
    <p style="font-size:12px;opacity:.7">Only places you have found are named. ${G.mapLegend ? G.mapLegend() : ''}</p>
    <button class="primary" id="map-close">Close</button></div>`);
  const c = $('mapc').getContext('2d'), k = size / WORLD_SIZE, toM = v => (v + WORLD_SIZE / 2) * k;
  c.font = '11px sans-serif';
  for (const L of LOCATIONS) {
    const found = G.save.world.discovered.includes(L.id);
    c.fillStyle = found ? (G.locationColor ? G.locationColor(L) : '#e0a34a') : 'rgba(255,255,255,.15)';
    c.beginPath(); c.arc(toM(L.x), toM(L.z), Math.max(4, L.r * k), 0, 7); c.fill();
    if (found) { c.fillStyle = '#fff'; c.fillText(L.name, toM(L.x) + 8, toM(L.z) + 4); }
  }
  const P = G.player;
  c.fillStyle = '#ff4136'; c.save(); c.translate(toM(P.pos.x), toM(P.pos.z)); c.rotate(-P.rot);
  c.beginPath(); c.moveTo(0, 8); c.lineTo(-5, -5); c.lineTo(5, -5); c.fill(); c.restore();
  $('map-close').onclick = closeModal;
}

export const uiSystem = {
  init() { addTouchButton('BAG', 'inventory', true); addTouchButton('MAP', 'map', true); },
  update() {
    if (pressed('inventory')) openInventory();
    if (pressed('map')) openMap();
  }
};
// Close windows with the same key
addEventListener('keydown', e => { if (G.paused && !document.querySelector('#modal input:focus') && ['KeyI', 'KeyM', 'Escape'].includes(e.code) && !G.dead && !G.lockModal) closeModal(); });

/* ---------- Choice dialog (used by factions and story) ---------- */
// choices: [{ label, fn, disabled?, note? }]
export function showChoice(title, text, choices, { lock = false } = {}) {
  G.lockModal = lock;
  showModal(`<div class="panel"><h2>${title}</h2><p>${text}</p><div class="choices">
    ${choices.map((c, i) => `<button data-c="${i}" ${c.disabled ? 'disabled style="opacity:.4"' : ''}>${c.label}${c.note ? `<br><small style="opacity:.6">${c.note}</small>` : ''}</button>`).join('')}
    </div></div>`);
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const c = choices[+b.dataset.c]; if (c.disabled) return;
    G.lockModal = false; closeModal(); c.fn && c.fn();
  });
}
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
