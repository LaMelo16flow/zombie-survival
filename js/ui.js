import { G } from './state.js';

const $ = id => document.getElementById(id);
let toastTimer = 0;

export function toast(msg, secs = 2.5) {
  const t = $('toast'); t.innerHTML = msg; t.style.opacity = 1; toastTimer = secs;
}

export function initHUD() {
  toast('Find shelter. Stay alive.', 3);
}

export function updateHUD(dt) {
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').style.opacity = 0; }
  const p = G.player.pos;
  $('clock').innerHTML = `${p.x.toFixed(0)}, ${p.z.toFixed(0)}`;
}
