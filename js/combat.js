import { G } from './state.js';
import { pressed, down, input, addTouchButton } from './input.js';
import { sfx } from './audio.js';
import { burst, impact } from './effects.js';

/*
  COMBAT FEEL
  • Dodge roll (Space / DODGE): a quick roll in the direction you move, you can't be hit during it. Costs stamina.
  • Block (hold V / BLOCK): take far less damage from hits in front of you; block right as a hit lands
    ("perfect block") and the attacker staggers. Slows you down and drains stamina.
  • Combos: three melee hits in a row — the third hits harder and knocks back further.
  • Hit-stop: the game freezes for a split second on heavy hits and kills, so hits feel solid.
*/
const ROLL_T = 0.42, IFRAMES = 0.34;
let rollCd = 0;

export function roll() {
  const P = G.player, st = G.save.stats;
  if (rollCd > 0 || P.rollT > 0 || G.driving || P.elevated || st.stamina < 15) return;
  st.stamina -= 18; rollCd = 0.75; P.rollT = ROLL_T; P.iframes = IFRAMES;
  // roll the way the stick/keys point (relative to the camera), or backwards if standing still
  const fx = -Math.sin(P.camYaw), fz = -Math.cos(P.camYaw), rx = -fz, rz = fx;
  let vx = fx * -input.mz + rx * input.mx, vz = fz * -input.mz + rz * input.mx;
  if (Math.hypot(vx, vz) < 0.2) { vx = -Math.sin(P.rot); vz = -Math.cos(P.rot); }
  const l = Math.hypot(vx, vz); P.rollDir = { x: vx / l, z: vz / l };
  P.rot = Math.atan2(vx, vz);
  sfx.swing(); burst(P.pos.x, P.pos.y + 0.2, P.pos.z, 0xb9a07a, 6, 2, 0.12);
}

// Called by survival.damage before a hit lands. Returns the damage that gets through.
export function defend(dmg, from, src) {
  const P = G.player;
  if (P.iframes > 0 && from !== 'starving' && from !== 'cold') return 0;           // rolled through it
  if (P.blocking && src && src.pos && ['zombie', 'boss', 'raider', 'wolf', 'boar'].includes(from)) {
    let a = Math.atan2(src.pos.x - P.pos.x, src.pos.z - P.pos.z) - P.rot; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) < 1.25) {                                                        // the hit comes from the front
      const st = G.save.stats;
      impact(P.pos.x + Math.sin(P.rot) * 0.7, P.pos.y + 1.3, P.pos.z + Math.cos(P.rot) * 0.7, 0xbfe3ff, 0.6);
      if (G.time - P.blockStart < 0.25) {                                            // perfect block
        if (src.k) { src.stagger = 0.9; src.kx = Math.sin(P.rot) * 6; src.kz = Math.cos(P.rot) * 6; src.atkCd = Math.max(src.atkCd || 0, 1.2); }
        G.hitstop = 0.08; sfx.hit(); G.toast?.('Perfect block!', 0.8);
        return 0;
      }
      st.stamina = Math.max(0, st.stamina - dmg * 1.2); sfx.hit();
      return st.stamina > 0 ? dmg * (from === 'boss' ? 0.45 : 0.22) : dmg * 0.6;     // out of stamina: guard breaks
    }
  }
  return dmg;
}

export const combatSystem = {
  init() {
    addTouchButton('', 'dodge'); addTouchButton('', 'block');
    G.defend = defend;
  },
  update(dt) {
    const P = G.player;
    rollCd -= dt; P.iframes = Math.max(0, (P.iframes || 0) - dt);
    if (pressed('dodge')) roll();
    if (P.rollT > 0) {
      P.rollT -= dt;
      const sp = 9.5 * Math.min(1, P.rollT / ROLL_T + 0.35);
      P.pos.x += P.rollDir.x * sp * dt; P.pos.z += P.rollDir.z * sp * dt;
    }
    const wasBlocking = P.blocking;
    P.blocking = down('block') && !G.driving && !(P.rollT > 0) && G.save.stats.stamina > 1;
    if (P.blocking && !wasBlocking) P.blockStart = G.time;
    if (P.blocking) G.save.stats.stamina = Math.max(0, G.save.stats.stamina - dt * 4);
    P.combatSpeed = P.blocking ? 0.4 : P.rollT > 0 ? 0 : 1;
    if (P.combo && G.time - P.combo.t > 1.1) P.combo = null;
  }
};
