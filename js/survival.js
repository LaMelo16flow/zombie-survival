import { G } from './state.js';
import { clamp } from './util.js';
import { toast, showDeath } from './ui.js';
import { burst, shake } from './effects.js';
import { sfx } from './audio.js';

// Hunger/thirst drop over time; at zero they hurt you. Sprinting uses stamina.
export const survival = {
  init() {
    G.player.canSprint = () => G.save.stats.stamina > 3;
    G.player.hurt = (dmg, from) => damage(dmg, from);
  },
  update(dt) {
    const s = G.save.stats, P = G.player;
    s.hunger = clamp(s.hunger - dt * 0.09, 0, 100);   // ~18 min from full to empty
    s.thirst = clamp(s.thirst - dt * 0.13 * (1 - (G.weather?.rain || 0) * 0.4), 0, 100);   // ~13 min
    if (P.sprinting) s.stamina = clamp(s.stamina - dt * 18, 0, 100);
    else s.stamina = clamp(s.stamina + dt * (P.moving ? 8 : 14), 0, 100);
    if (s.hunger <= 0 || s.thirst <= 0) damage(dt * 1.2, 'starving');
    else if (s.hunger > 60 && s.thirst > 60 && s.hp < s.maxHp) s.hp = Math.min(s.maxHp, s.hp + dt * 0.4);
    P.speedMul = s.hp < 25 ? 0.8 : 1;
    if (s.hunger < 15 && !warned.h) { toast('You are starving — find food.'); warned.h = true; }
    if (s.thirst < 15 && !warned.t) { toast('You are dehydrated — find water.'); warned.t = true; }
    if (s.hunger > 30) warned.h = false; if (s.thirst > 30) warned.t = false;
  }
};
const warned = { h: false, t: false };

export function damage(dmg, from) {
  const s = G.save.stats;
  if (G.dead) return;
  if (G.driving && from !== 'crash') dmg *= 0.3;   // the car protects you
  s.hp -= dmg;
  if (dmg > 2) {
    sfx.hurt(); const p = G.player.pos; burst(p.x, p.y + 1.2, p.z, 0xa0101a, 7, 3); shake(Math.min(0.35, dmg / 40));
    const v = document.getElementById('hurt');
    v.style.opacity = Math.min(0.8, 0.3 + dmg / 30);
    clearTimeout(v._t); v._t = setTimeout(() => v.style.opacity = 0, 180);
  }
  if (s.hp <= 0) { s.hp = 0; G.dead = true; sfx.death(); showDeath(from); }
}
