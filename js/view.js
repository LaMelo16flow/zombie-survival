import { G } from './state.js';
import { isTouch } from './input.js';

/*
  VIEW — the camera and screen layout adapt to the device:
  • PC: over-the-shoulder camera (character a little left of centre so you can aim past it), mouse wheel zooms.
  • Phone (sideways only): wider field of view and a closer camera so the action fills the small screen;
    held upright, the game pauses and asks you to turn the phone.
  • Tablet: in between. Very wide screens get a tighter vertical field of view so nothing looks stretched.
*/
export const view = { fov: 62, dist: 7, shoulder: 0, height: 1.7, zoom: 1, device: 'pc' };

function profile() {
  const w = innerWidth, h = innerHeight, short = Math.min(w, h), aspect = w / h;
  let p;
  if (isTouch && short < 520) p = { device: 'phone', fov: 70, dist: 6.0, shoulder: 0, height: 1.8 };
  else if (isTouch) p = { device: 'tablet', fov: 64, dist: 6.6, shoulder: 0.25, height: 1.75 };
  else p = { device: 'pc', fov: 60, dist: 7, shoulder: 0.75, height: 1.65 };
  if (aspect > 2) p.fov *= 2 / aspect * 0.35 + 0.65;          // ultra-wide: keep the horizontal view sane
  if (aspect < 1.2 && !isTouch) p.fov += 6;                     // narrow desktop window
  return p;
}

function apply() {
  Object.assign(view, profile());
  document.documentElement.dataset.device = view.device;
  if (G.camera) { G.camera.fov = view.fov; G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix(); }
  if (G.player) G.player.camDist = view.dist * view.zoom;
  checkRotate();
}

// Phones play sideways only
let rotEl = null, pausedByRotate = false;
function checkRotate() {
  const portrait = isTouch && innerHeight > innerWidth && Math.min(innerWidth, innerHeight) < 520;
  if (portrait && !rotEl) {
    rotEl = document.createElement('div'); rotEl.id = 'rotate';
    rotEl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h7a2 2 0 0 1 2 2v7h-2V4H7v16h4v2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 12h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm0 2v4h6v-4zM18 6a5 5 0 0 1 3.9 4.1l1.1-1.1 1 1-3 3-3-3 1-1 1.4 1.4A3.5 3.5 0 0 0 18 7.5z"/></svg><b>Turn your phone sideways</b><span>Dead Ground is played in landscape.</span>';
    document.body.appendChild(rotEl);
    if (G.running && !G.paused) { G.paused = true; pausedByRotate = true; }
  } else if (!portrait && rotEl) {
    rotEl.remove(); rotEl = null;
    if (pausedByRotate) { G.paused = false; pausedByRotate = false; }
  }
}

export function initView() {
  apply();
  addEventListener('resize', apply);
  addEventListener('orientationchange', () => setTimeout(apply, 250));
  screen.orientation?.lock?.('landscape').catch(() => {});      // works on Android in full screen; iPhone ignores it
  addEventListener('wheel', e => {                              // PC: zoom the camera with the mouse wheel
    if (!G.running || G.paused) return;
    view.zoom = Math.max(0.45, Math.min(1.8, view.zoom * (e.deltaY > 0 ? 1.08 : 0.93)));
    if (G.player && !G.driving) G.player.camDist = view.dist * view.zoom;
  }, { passive: true });
  G.view = view;
}
