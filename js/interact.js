import { G } from './state.js';
import { pressed, addTouchButton } from './input.js';
import { esc } from './ui.js';

// Anything the player can use with E (crates, survivors, doors…)
// { x, z, r, label: () => string, action: () => void, enabled?: () => bool }
export const interactables = [];
export function addInteractable(o) { interactables.push(o); return o; }
export function removeInteractable(o) { const i = interactables.indexOf(o); if (i >= 0) interactables.splice(i, 1); }

const promptEl = () => document.getElementById('prompt');
let current = null;

export const interactSystem = {
  init() { addTouchButton('USE', 'interact'); },
  update() {
    const P = G.player;
    if (G.driving) { promptEl().style.display = 'none'; return; }
    let best = null, bd = 1e9;
    for (const o of interactables) {
      if (o.enabled && !o.enabled()) continue;
      const x = o.getPos ? o.getPos().x : o.x, z = o.getPos ? o.getPos().z : o.z;
      const d = Math.hypot(x - P.pos.x, z - P.pos.z);
      if (d < (o.r || 2) && d < bd) { bd = d; best = o; }
    }
    current = best;
    const el = promptEl();
    if (best) {
      const html = `<kbd>${window.matchMedia('(pointer:coarse)').matches ? '!' : 'E'}</kbd>${esc(best.label())}`;
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.style.display = 'block';
    }
    else el.style.display = 'none';
    if (best && pressed('interact')) best.action();
  }
};
