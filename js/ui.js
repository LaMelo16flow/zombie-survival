import { G, newSave } from './state.js';
import { clockText, isNight } from './daynight.js';

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
    <button class="primary" id="d-again">Start again</button></div>`);
  $('d-again').onclick = () => location.reload();
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
