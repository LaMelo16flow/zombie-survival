import { G } from './state.js';
import { spots, nearestSpot, heightAt, WATER } from './world.js';
import { addInteractable } from './interact.js';
import { toast } from './ui.js';
import { burst } from './effects.js';
import { sfx } from './audio.js';
import { MELEE } from './items.js';

/*
  GATHERING — walk up to something and press E / USE:
  trees → wood (an axe gives more), big rocks → stone (sometimes scrap or metal),
  red-berry bushes → berries, white-flower bushes → herbs, lake shore → lake water.
  Trees and rocks run out after a few uses and grow back over the days.
*/
let target = null, cd = 0;
const used = () => (G.save.world.gathered = G.save.world.gathered || {});
const LIMIT = { tree: 4, rock: 5, bush: 1 };

function pickTarget() {
  const P = G.player.pos;
  const b = nearestSpot('bush', P.x, P.z, 2.2); if (b) return { kind: 'bush', s: b };
  const t = nearestSpot('tree', P.x, P.z, 2.0); if (t) return { kind: 'tree', s: t };
  const r = nearestSpot('rock', P.x, P.z, 2.6); if (r) return { kind: 'rock', s: r };
  const h = heightAt(P.x, P.z);
  if (h < WATER + 0.4) return { kind: 'lake', s: { x: P.x, z: P.z } };
  return null;
}
const left = t => LIMIT[t.kind] - (used()[t.kind + t.s.i] || 0);

function gather() {
  if (!target || cd > 0) return;
  cd = 0.6;
  const inv = G.save.inv, P = G.player, t = target, w = MELEE[inv.melee] || MELEE.fists;
  P.attackT = 1; P.rot = Math.atan2(t.s.x - P.pos.x, t.s.z - P.pos.z);
  const add = (k, n) => { inv[k] = (inv[k] || 0) + n; return n ? `${n} ${k}` : ''; };
  const y = heightAt(t.s.x, t.s.z);
  let got = [];
  if (t.kind === 'lake') {
    if ((inv.lakewater || 0) >= 5) return toast('Your bottles are full.');
    got.push(add('lakewater', 1)); sfx.step(true);
  } else {
    if (left(t) <= 0) return toast(t.kind === 'bush' ? 'Picked clean. It will grow back tomorrow.' : `This ${t.kind} is used up for now.`);
    used()[t.kind + t.s.i] = (used()[t.kind + t.s.i] || 0) + 1;
    const skill = G.skillMul?.('gather') || 1;
    if (t.kind === 'tree') { got.push(add('wood', Math.round((1 + (w.chop || 0)) * skill))); burst(t.s.x, y + 1.2, t.s.z, 0xc08a50, 8, 3, 0.1); sfx.hit(); }
    if (t.kind === 'rock') {
      got.push(add('stone', Math.round((1 + Math.floor(Math.random() * 2)) * skill)));
      if (Math.random() < 0.25) got.push(add('scrap', 1));
      if (Math.random() < 0.08 * skill) got.push(add('metal', 1));
      burst(t.s.x, y + 0.6, t.s.z, 0xb9b2a6, 8, 3, 0.1); sfx.hit();
    }
    if (t.kind === 'bush') { got.push(t.s.herb ? add('herbs', 2) : add('berries', 3)); if (Math.random() < 0.3) got.push(add('seeds', 1)); sfx.pickup(); }
  }
  toast('+' + got.filter(Boolean).join(', '), 1.4);
  G.emit('gathered', t.kind);
}

export const gatherSystem = {
  init() {
    addInteractable({ getPos: () => target ? target.s : { x: 1e9, z: 1e9 }, r: 3, enabled: () => !!target,
      label: () => ({ tree: 'Chop tree', rock: 'Break rock', bush: target.s.herb ? 'Pick herbs' : 'Pick berries', lake: 'Fill a bottle with lake water' })[target.kind] +
        (target.kind !== 'lake' ? (left(target) > 0 ? '' : ' (used up)') : ''),
      action: gather });
    G.on('newDay', () => { const u = used(); for (const k of Object.keys(u)) { if (k.startsWith('bush')) delete u[k]; else if ((u[k] -= 2) <= 0) delete u[k]; } });
  },
  update(dt) { cd -= dt; target = G.driving ? null : pickTarget(); }
};
