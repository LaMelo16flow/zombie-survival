// Keyboard + mouse (PC) and virtual joystick + buttons (iPhone).
export const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const keys = new Set();
const held = new Set();      // actions currently held
const pressedQ = new Set();  // actions pressed this frame
export const input = { mx: 0, mz: 0, lookX: 0, lookY: 0, enabled: false };

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'interact', KeyF: 'attack', Space: 'attack', KeyR: 'shoot',
  KeyB: 'build', KeyM: 'map', KeyQ: 'faction', KeyJ: 'journal', KeyI: 'inventory', Escape: 'menu', KeyP: 'menu',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5', Digit6: 'slot6', Digit7: 'slot7', Digit8: 'slot8', Digit9: 'slot9', KeyC: 'craft', KeyZ: 'nextcat', KeyK: 'skills',
  KeyG: 'command', KeyT: 'rotate', KeyX: 'demolish'
};

export function pressed(a) { return pressedQ.has(a); }
export function down(a) { return held.has(a); }
export function endFrame() { pressedQ.clear(); input.lookX = 0; input.lookY = 0; }
function press(a) { if (!held.has(a)) pressedQ.add(a); held.add(a); }
function release(a) { held.delete(a); }

export function initInput(canvas) {
  addEventListener('keydown', e => {
    const a = KEYMAP[e.code]; if (!a) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    keys.add(e.code); press(a); e.preventDefault();
  });
  addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (!a) return; keys.delete(e.code); release(a); });
  addEventListener('blur', () => { keys.clear(); held.clear(); });

  // Mouse look with pointer lock
  canvas.addEventListener('click', () => { if (!isTouch && input.enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); });
  addEventListener('mousemove', e => { if (document.pointerLockElement === canvas) { input.lookX += e.movementX; input.lookY += e.movementY; } });
  canvas.addEventListener('mousedown', e => { if (document.pointerLockElement === canvas) press(e.button === 2 ? 'shoot' : 'attack'); });
  addEventListener('mouseup', e => release(e.button === 2 ? 'shoot' : 'attack'));
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  if (isTouch) initTouch();
}

export function updateMoveFromKeys() {
  if (isTouch && (touchMove.x || touchMove.y)) { input.mx = touchMove.x; input.mz = touchMove.y; return; }
  let x = 0, z = 0;
  if (held.has('up')) z -= 1; if (held.has('down')) z += 1;
  if (held.has('left')) x -= 1; if (held.has('right')) x += 1;
  const l = Math.hypot(x, z) || 1;
  input.mx = x / l; input.mz = z / l;
}

/* ---------- Touch ---------- */
const touchMove = { x: 0, y: 0 };
function initTouch() {
  document.getElementById('touch').classList.remove('hidden');
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let stickId = null, lookId = null, lx = 0, ly = 0;
  const R = 55;
  addEventListener('touchstart', e => {
    if (!input.enabled) return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('#buttons')) continue;
      if (t.clientX < innerWidth * 0.45 && stickId === null) { stickId = t.identifier; moveStick(t); }
      else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: false });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) moveStick(t);
      else if (t.identifier === lookId) { input.lookX += (t.clientX - lx) * 1.6; input.lookY += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
    }
    if (input.enabled) e.preventDefault();
  }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; touchMove.x = touchMove.y = 0; knob.style.transform = ''; release('sprint'); }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  function moveStick(t) {
    const b = stick.getBoundingClientRect();
    let dx = t.clientX - (b.left + b.width / 2), dy = t.clientY - (b.top + b.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchMove.x = dx / R; touchMove.y = dy / R;
    if (l > R * 1.25) press('sprint'); else release('sprint');  // push the stick far = sprint
  }
}

// Add an on-screen button (touch only). action = name used with pressed()/down().
export function addTouchButton(label, action, small = false) {
  if (!isTouch) return;
  const b = document.createElement('div');
  b.className = small ? 'tb sm' : 'tb'; b.textContent = label;
  b.addEventListener('touchstart', e => { e.preventDefault(); b.classList.add('on'); press(action); }, { passive: false });
  b.addEventListener('touchend', e => { e.preventDefault(); b.classList.remove('on'); release(action); }, { passive: false });
  document.getElementById(small ? 'topbtns' : 'buttons').appendChild(b);
  return b;
}
