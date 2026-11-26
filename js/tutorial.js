import { G } from './state.js';
import { input, isTouch } from './input.js';
import { settings } from './settings.js';

/*
  TUTORIAL — short tips for new players, one at a time, each one disappears when you do it.
  Turn off in Settings. Progress is saved, so tips never repeat.
*/
const T = isTouch;
const STEPS = [
  { id: 'move', text: T ? 'Move with your <b>left thumb</b>. Push it far to sprint.' : 'Move with <b>WASD</b>. Hold <b>Shift</b> to sprint.', done: () => G.player.moving },
  { id: 'look', text: T ? 'Drag on the <b>right side</b> of the screen to look around.' : '<b>Click</b> the game, then move the mouse to look around.', done: () => Math.abs(input.lookX) > 2 },
  { id: 'loot', text: 'Walk up to crates, cupboards and fridges and press ' + (T ? '<b>USE</b>' : '<b>E</b>') + ' to search them.', ev: 'looted' },
  { id: 'fight', text: 'Zombies! Hit them with ' + (T ? '<b>HIT</b>' : '<b>F</b> or left click') + '. You turn to the closest one automatically.', ev: 'zombieKilled' },
  { id: 'bag', text: 'Open your ' + (T ? '<b>BAG</b>' : 'backpack with <b>I</b>') + ' to eat, drink and heal. Keep FOOD and WATER up!', ev: 'bagOpened' },
  { id: 'gather', text: 'Chop trees and break rocks (' + (T ? 'USE' : 'E') + ') to get wood and stone.', ev: 'gathered' },
  { id: 'craft', text: 'Open ' + (T ? '<b>CRAFT</b>' : 'crafting with <b>C</b>') + ' to make bandages, weapons and more.', ev: 'crafted' },
  { id: 'build', text: 'Press ' + (T ? '<b>BUILD</b>' : '<b>B</b>') + ' to build a campfire, walls and a workbench.', ev: 'built' },
  { id: 'crew', text: 'Found your own faction with ' + (T ? '<b>MORE → CREW</b>' : '<b>Q</b>') + ' and invite survivors to join you.', ev: 'factionCreated' },
  { id: 'quest', text: 'Talk to faction leaders for missions. Your tracked mission shows as a <b>gold beacon</b>.', ev: 'missionStarted' }
];
let el, cur = null, shownT = 0;
const done = () => (G.save.tutorial = G.save.tutorial || []);

function next() {
  cur = STEPS.find(s => !done().includes(s.id)) || null;
  if (!cur || !settings.tips) { el.classList.add('hidden'); return; }
  el.innerHTML = `<span>${cur.text}</span><button class="small" id="tip-ok">Got it</button>`;
  el.classList.remove('hidden'); shownT = 0;
  document.getElementById('tip-ok').onclick = () => finish(cur.id);
}
function finish(id) { if (!done().includes(id)) done().push(id); if (cur && cur.id === id) { el.classList.add('hidden'); cur = null; setTimeout(next, 2500); } }

export const tutorialSystem = {
  init() {
    el = document.createElement('div'); el.id = 'tip'; el.className = 'hidden'; document.getElementById('hud').appendChild(el);
    el.style.pointerEvents = 'auto';
    for (const s of STEPS) if (s.ev) G.on(s.ev, () => finish(s.id));
    setTimeout(next, 4000);
  },
  update(dt) {
    if (!settings.tips) { if (cur) { el.classList.add('hidden'); cur = null; } return; }
    if (!cur) return;
    shownT += dt;
    if (cur.done && shownT > 1.2 && cur.done()) finish(cur.id);
  }
};
