import { G, newSave } from './state.js';
import { clockText, isNight } from './daynight.js';
import { pressed, addTouchButton } from './input.js';
import { LOCATIONS } from './locations.js';
import { WORLD_SIZE, heightAt, WATER } from './world.js';
import { ITEMS, MELEE, GUNS, ARMOR } from './items.js';

const $ = id => document.getElementById(id);
let toastTimer = 0, bannerTimer = 0;

/* ---------- Icons (inline SVG, 24×24) ---------- */
const PATHS = {
  heart: 'M12 21s-7-4.4-9.5-9C.8 8.6 2.6 4.5 6.5 4.5c2.2 0 3.6 1.3 4.5 2.6.9-1.3 2.3-2.6 4.5-2.6 3.9 0 5.7 4.1 4 7.5C19 16.6 12 21 12 21z',
  food: 'M5 7h14l-1.2 12.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM4 4h16v2H4z',
  water: 'M12 2s7 7.6 7 12.5A7 7 0 0 1 5 14.5C5 9.6 12 2 12 2z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z',
  meds: 'M4 7h16v13H4zM9 3h6v4H9zm1.5 7v2.5H8v3h2.5V18h3v-2.5H16v-3h-2.5V10z',
  wood: 'M3 8h18v4H3zm2 6h14v4H5zM6 4h12v2H6z',
  scrap: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 3h-2.1a7 7 0 0 0-.9-2.2l1.5-1.5-1.8-1.8-1.5 1.5a7 7 0 0 0-2.2-.9V3h-2v2.1a7 7 0 0 0-2.2.9L7.3 4.5 5.5 6.3 7 7.8a7 7 0 0 0-.9 2.2H4v2h2.1c.2.8.5 1.5.9 2.2l-1.5 1.5 1.8 1.8 1.5-1.5c.7.4 1.4.7 2.2.9V21h2v-2.1c.8-.2 1.5-.5 2.2-.9l1.5 1.5 1.8-1.8-1.5-1.5c.4-.7.7-1.4.9-2.2H21z',
  ammo: 'M7 22V10l2-6 2 6v12zm6 0V10l2-6 2 6v12z',
  skull: 'M12 2a8 8 0 0 0-8 8c0 3 1.6 5.4 4 6.7V20h8v-3.3c2.4-1.3 4-3.7 4-6.7a8 8 0 0 0-8-8zM9 9.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm6 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM10 20h1v2h-1zm3 0h1v2h-1z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4zM4.2 2.8l2.8 2.8-1.4 1.4-2.8-2.8zm14.2 14.2 2.8 2.8-1.4 1.4-2.8-2.8zM2.8 19.8l2.8-2.8 1.4 1.4-2.8 2.8zM17 5.6l2.8-2.8 1.4 1.4-2.8 2.8z',
  moon: 'M14.5 2A9.5 9.5 0 1 0 22 16.5 8 8 0 0 1 14.5 2z',
  bat: 'M17.6 3.6 20.4 6.4 9 17.8l-2.8-2.8zM6.2 15 9 17.8 5.4 21.4 2.6 18.6z',
  gun: 'M3 7h16l2 2v3h-6l-1 2h-3l-1 6H6l1-6H3z',
  meat: 'M15.5 3a5.5 5.5 0 0 1 3.9 9.4l-5 5a4 4 0 0 1-5.4.2L6.6 20a2 2 0 1 1-2.8-2.8l2.4-2.4a4 4 0 0 1 .2-5.4l5-5A5.5 5.5 0 0 1 15.5 3z',
  leaf: 'M20 3C9 3 4 9 4 16c0 1.5.3 3 .8 4l1.6-1.6C9 12 13 9 17 8c-4 2-7.5 6-9 11 1 .3 2 .5 3 .5 7 0 10-7 9-16.5z',
  stone: 'M7 6l6-3 7 5 1 8-6 5H8l-5-6 1-6z',
  metal: 'M3 15l4-6h14l-4 6zm0 2h14v3H3z',
  cloth: 'M4 5c3 2 5 2 8 0s5-2 8 0v14c-3-2-5-2-8 0s-5 2-8 0z',
  leather: 'M6 3h12l2 5-3 13H7L4 8zm3 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  bone: 'M7 3a2.5 2.5 0 0 1 2.3 3.5l8.2 8.2A2.5 2.5 0 1 1 21 17a2.5 2.5 0 1 1-3.5 3.3l-8.2-8.2A2.5 2.5 0 1 1 6 7.5 2.5 2.5 0 0 1 7 3z',
  shield: 'M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z'
};
export const icon = n => `<svg class="i" viewBox="0 0 24 24"><path d="${PATHS[n] || PATHS.scrap}"/></svg>`;

export function toast(msg, secs = 2.5) {
  const t = $('toast'); t.innerHTML = msg; t.style.opacity = 1; t.style.transform = 'translateX(-50%) skewX(-8deg)'; toastTimer = secs;
}
// Big cinematic banner (new place, new day…)
export function banner(big, small = '', secs = 3.2) {
  $('banner-big').textContent = big; $('banner-small').textContent = small;
  $('banner').classList.add('on'); bannerTimer = secs;
}

/* ---------- Floating damage numbers ---------- */
import * as THREE from '../lib/three.module.min.js';
const dmgList = [], v3 = new THREE.Vector3();
export function damageNumber(x, y, z, amount, crit = false) {
  const el = document.createElement('span'); el.textContent = Math.round(amount); if (crit) el.className = 'crit';
  $('dmg').appendChild(el); dmgList.push({ el, x: x + (Math.random() - 0.5) * 0.6, y, z, t: 0 });
  if (dmgList.length > 20) dmgList.shift().el.remove();
}
function updateDamageNumbers(dt) {
  for (let i = dmgList.length - 1; i >= 0; i--) {
    const d = dmgList[i]; d.t += dt;
    if (d.t > 0.9) { d.el.remove(); dmgList.splice(i, 1); continue; }
    v3.set(d.x, d.y + d.t * 1.4, d.z).project(G.camera);
    if (v3.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = '';
    d.el.style.left = ((v3.x + 1) / 2 * innerWidth) + 'px'; d.el.style.top = ((1 - v3.y) / 2 * innerHeight) + 'px';
    d.el.style.opacity = d.t < 0.6 ? 1 : 1 - (d.t - 0.6) / 0.3;
    d.el.style.transform = `translate(-50%,-50%) scale(${d.t < 0.1 ? 0.6 + d.t * 6 : 1.2 - Math.min(0.2, d.t)})`;
  }
}

/* ---------- Status bars ---------- */
const BARS = [
  ['hp', 'HP', 'var(--red)', 'heart'], ['hunger', 'FOOD', 'var(--gold)', 'food'], ['thirst', 'WATER', 'var(--blue)', 'water'], ['stamina', 'STAMINA', 'var(--green)', 'bolt']
];
const barEls = {};
export function initHUD() {
  const wrap = $('bars'); wrap.innerHTML = '';
  for (const [k, label, color, ic] of BARS) {
    const b = document.createElement('div'); b.className = 'bar';
    b.innerHTML = `<b></b><i style="background:${color}"></i><span>${icon(ic)}${label}</span>`;
    wrap.appendChild(b); barEls[k] = { el: b, fill: b.children[1], trail: b.children[0] };
  }
  $('initial').textContent = (G.save.player.name || 'S')[0].toUpperCase();
  banner('Pine Hollow Outskirts', 'DAY ' + G.save.world.day);
}

export function showDeath(cause) {
  const s = G.save;
  showModal(`<div class="panel center death"><h2>YOU DIED</h2>
    <p>${cause === 'zombie' ? 'The dead got you.' : cause === 'starving' ? 'Hunger and thirst took you.' : cause === 'raider' ? 'Raiders cut you down.' : cause === 'crash' ? 'You crashed.' : cause === 'wolf' ? 'The wolves got you.' : cause === 'explosion' ? 'Blown apart by an exploder.' : cause === 'boss' ? 'The boss was too strong — this time.' : cause === 'acid' ? 'Melted by acid.' : cause === 'boar' ? 'A boar gored you.' : 'You did not make it.'}</p>
    <p>Survived to day ${s.world.day} · ${s.stats.kills} zombies killed</p>
    <button class="primary" id="d-again">Start again</button> <button id="d-load">Load last save</button></div>`);
  G.lockModal = true;
  $('d-again').onclick = () => G.newGame();
  $('d-load').onclick = () => location.reload();   // title screen offers Continue from the last autosave
}

export function showModal(html) { const m = $('modal'); m.innerHTML = html; m.classList.remove('hidden'); G.paused = true; document.exitPointerLock?.(); }
export function closeModal() { $('modal').classList.add('hidden'); G.paused = false; }

let mmT = 0;
export function updateHUD(dt) {
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) { $('toast').style.opacity = 0; $('toast').style.transform = 'translateX(-50%) translateY(-10px) skewX(-8deg)'; } }
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').classList.remove('on'); }
  const st = G.save.stats;
  for (const [k] of BARS) {
    const f = Math.max(0, st[k] / (k === 'hp' ? st.maxHp : 100));
    const e = barEls[k]; e.fill.style.transform = e.trail.style.transform = `scaleX(${f})`;
    e.el.classList.toggle('low', f < 0.2);
  }
  $('portrait').style.setProperty('--hp', (st.hp / st.maxHp * 100) + '%');
  $('lvl').textContent = (st.points ? '+' : '') + (st.level || 1); $('lvl').classList.toggle('pts', !!st.points);
  $('xpfill').style.width = ((st.xp || 0) / Math.round(100 * Math.pow(st.level || 1, 1.35)) * 100) + '%';
  const inv = G.save.inv;
  const html = `<div class="t">${icon(isNight() ? 'moon' : 'sun')}${clockText()}</div>
    <div class="s"><span>${icon('skull')}${st.kills}</span>${inv.gun ? `<span>${icon('ammo')}${inv[(GUNS[inv.gun] || GUNS.pistol).ammo] || 0}</span>` : ''}</div>`;
  if ($('clock')._h !== html) { $('clock').innerHTML = html; $('clock')._h = html; }
  updateDamageNumbers(dt);
  $('crosshair').style.display = G.driving || G.building ? 'none' : '';
  mmT -= dt; if (mmT <= 0) { mmT = 0.1; drawMinimap(); }
}

/* ---------- Painted map image of the whole world (made once) ---------- */
let mapImg = null;
function mapImage() {
  if (mapImg) return mapImg;
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), img = c.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const h = heightAt((i + 0.5) / S * WORLD_SIZE - WORLD_SIZE / 2, (j + 0.5) / S * WORLD_SIZE - WORLD_SIZE / 2);
    const col = h < WATER - 1.2 ? [44, 110, 160] : h < WATER ? [70, 170, 190] : h < WATER + 0.9 ? [214, 196, 140] : h > 46 ? [150, 144, 136] : h > 30 ? [86, 128, 70] : [96, 150, 72];
    const o = (j * S + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return (mapImg = cv);
}

/* ---------- Minimap: 70 m around you, turns with the camera ---------- */
function drawMinimap() {
  const cv = $('minimap'), c = cv.getContext('2d'), W = cv.width, R = W / 2, P = G.player, range = 70, k = R / range;
  const yaw = P.camYaw + Math.PI;           // direction the camera looks
  c.clearRect(0, 0, W, W);
  c.save(); c.beginPath(); c.arc(R, R, R, 0, 7); c.clip();
  const cs0 = Math.cos(yaw), sn0 = Math.sin(yaw);
  c.setTransform(k * cs0, -k * sn0, -k * sn0, -k * cs0, R - k * (cs0 * P.pos.x - sn0 * P.pos.z), R + k * (sn0 * P.pos.x + cs0 * P.pos.z));
  c.drawImage(mapImage(), -WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = 'rgba(21,18,28,.25)'; c.fillRect(0, 0, W, W);
  const put = (x, z) => { const dx = x - P.pos.x, dz = z - P.pos.z; const cs = Math.cos(yaw), sn = Math.sin(yaw);
    return [R + (dx * cs - dz * sn) * k, R - (dx * sn + dz * cs) * k]; };
  for (const L of LOCATIONS) {
    const [x, y] = put(L.x, L.z); if (Math.hypot(x - R, y - R) > R + L.r * k) continue;
    c.fillStyle = G.save.world.discovered.includes(L.id) ? (G.locationColor ? G.locationColor(L) : '#ffc94a') + '88' : 'rgba(255,255,255,.12)';
    c.beginPath(); c.arc(x, y, L.r * k, 0, 7); c.fill();
  }
  const dot = (x, z, col, r = 4) => { const [a, b] = put(x, z); c.fillStyle = col; c.beginPath(); c.arc(a, b, r, 0, 7); c.fill(); };
  for (const zb of G.zombieList?.() || []) if (zb.alive) dot(zb.pos.x, zb.pos.z, '#e8364a', zb.k.scale ? 5 : 3.5);
  for (const n of G.npcList?.() || []) if (n.alive) dot(n.pos.x, n.pos.z, n.role === 'member' ? '#4aa3ff' : (G.relation && n.faction && G.relation(n.faction) === 'hostile') ? '#ff8a3a' : '#7ad35a', 4);
  for (const v of G.vehicleList?.() || []) dot(v.pos.x, v.pos.z, '#ffc94a', 5);
  if (G.missionTarget) { const [sx, sy] = put(G.missionTarget.x, G.missionTarget.z), dd = Math.hypot(sx - R, sy - R), k2 = dd > R - 10 ? (R - 10) / dd : 1;
    const mx = R + (sx - R) * k2, my = R + (sy - R) * k2; c.fillStyle = '#ffc94a'; c.strokeStyle = '#15121c'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 3.5 : 8; c.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); }
  for (const a of G.animalList?.() || []) if (a.alive) dot(a.pos.x, a.pos.z, a.kind === 'wolf' || a.kind === 'boar' ? '#c9372c' : '#e8d7a0', 3);
  c.restore();
  // you
  c.save(); c.translate(R, R); c.rotate(P.rot - yaw + Math.PI);
  c.fillStyle = '#fff8ec'; c.strokeStyle = '#15121c'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath(); c.stroke(); c.fill(); c.restore();
  // north marker
  const [nx, ny] = put(P.pos.x, P.pos.z - 1000); const a = Math.atan2(ny - R, nx - R);
  c.fillStyle = '#ffc94a'; c.font = '800 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', R + Math.cos(a) * (R - 14), R + Math.sin(a) * (R - 14));
}

/* ---------- Inventory ---------- */
const GROUPS = [
  ['Food & medicine', ['food', 'water', 'meds', 'bandage', 'herbmed', 'meat', 'jerky', 'stew', 'berries', 'veg', 'rawmeat', 'lakewater']],
  ['Materials', ['wood', 'stone', 'scrap', 'metal', 'cloth', 'hide', 'leather', 'bone', 'herbs', 'seeds', 'rope', 'fuel']],
  ['Ammo', ['ammo', 'bolts']]
];
export function openInventory() {
  const inv = G.save.inv; G.emit('bagOpened');
  const card = k => { const it = ITEMS[k]; return `<div class="item"><div class="ic">${icon(it.icon)}</div><div class="n">${inv[k] || 0}</div><div class="l">${it.name}</div>
    ${it.use ? `<button class="small" data-use="${k}" ${inv[k] ? '' : 'disabled'}>${it.use.label}</button>` : ''}</div>`; };
  const groups = GROUPS.map(([title, keys]) => { const have = keys.filter(k => inv[k] > 0 || ['food', 'water'].includes(k)); return have.length ? `<h3>${title}</h3><div class="items">${have.map(card).join('')}</div>` : ''; }).join('');
  const eq = (label, ic, list, cur, table, kind) => `<div class="row"><span>${icon(ic)} ${label}</span><span>${[...new Set([...(list || []), cur].filter(Boolean))].map(k =>
    `<button class="small ${k === cur ? 'primary' : ''}" data-eq="${kind}:${k}">${(table[k] || {}).name || k}</button>`).join(' ') || '—'}</span></div>`;
  showModal(`<div class="panel"><h2>Backpack</h2>
    <h3>Equipped</h3>
    ${eq('Melee', 'bat', inv.ownedMelee, inv.melee, MELEE, 'melee')}
    ${eq('Ranged', 'gun', inv.ownedGuns, inv.gun, GUNS, 'gun')}
    ${eq('Armour', 'shield', inv.ownedArmor, inv.armor, ARMOR, 'armor')}
    ${groups}
    ${G.extraInventory ? G.extraInventory() : ''}
    <button class="primary" id="inv-close">Close</button> <button id="inv-craft">Crafting</button></div>`);
  document.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    const k = b.dataset.use; if (!inv[k]) return;
    inv[k]--; const st = G.save.stats, hp0 = st.hp; ITEMS[k].use.fx(st); if (st.hp > hp0) st.hp = Math.min(st.maxHp, hp0 + (st.hp - hp0) * (G.skillMul?.('heal') || 1)); toast(`${ITEMS[k].name}: <b>${ITEMS[k].use.msg}</b>`); G.sfx?.pickup(); openInventory();
  });
  document.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => { const [kind, k] = b.dataset.eq.split(':'); inv[kind] = k; openInventory(); });
  $('inv-close').onclick = closeModal;
  $('inv-craft').onclick = () => G.openCrafting?.();
}

/* ---------- Map ---------- */
export function openMap() {
  const size = Math.max(200, Math.min(innerWidth - 80, innerHeight - 190));
  showModal(`<div class="panel" style="max-width:${size + 40}px"><h2>Map</h2>
    <canvas id="mapc" width="${size}" height="${size}" style="width:100%;border-radius:12px;background:#2a3b33;border:3px solid #15121c"></canvas>
    <p style="font-size:12px;opacity:.7">Only places you have found are named. ${G.mapLegend ? G.mapLegend() : ''}</p>
    <button class="primary" id="map-close">Close</button></div>`);
  const c = $('mapc').getContext('2d'), k = size / WORLD_SIZE, toM = v => (v + WORLD_SIZE / 2) * k;
  c.imageSmoothingEnabled = true; c.drawImage(mapImage(), 0, 0, size, size);
  c.font = '800 12px sans-serif';
  for (const L of LOCATIONS) {
    const found = G.save.world.discovered.includes(L.id);
    c.fillStyle = found ? (G.locationColor ? G.locationColor(L) : '#e0a34a') : 'rgba(21,18,28,.35)';
    c.beginPath(); c.arc(toM(L.x), toM(L.z), Math.max(4, L.r * k), 0, 7); c.fill();
    if (found) { c.lineWidth = 3; c.strokeStyle = '#15121c'; c.strokeText(L.name, toM(L.x) + 8, toM(L.z) + 4); c.fillStyle = '#fff8ec'; c.fillText(L.name, toM(L.x) + 8, toM(L.z) + 4); }
  }
  const P = G.player;
  c.fillStyle = '#e8364a'; c.save(); c.translate(toM(P.pos.x), toM(P.pos.z)); c.rotate(-P.rot);
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
    ${choices.map((c, i) => `<button data-c="${i}" ${c.disabled ? 'disabled' : ''}><span class="k">${i + 1}</span><span>${c.label}${c.note ? `<small>${c.note}</small>` : ''}</span></button>`).join('')}
    </div></div>`);
  G.sfx?.ui();
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const c = choices[+b.dataset.c]; if (c.disabled) return; G.sfx?.ui();
    G.lockModal = false; closeModal(); c.fn && c.fn();
  });
}
// Number keys pick a choice in any open dialog
addEventListener('keydown', e => {
  if (!G.paused || !/^Digit[1-9]$/.test(e.code) || document.querySelector('#modal input:focus')) return;
  document.querySelector(`#modal [data-c="${+e.code.slice(5) - 1}"]:not([disabled])`)?.click();
});
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
