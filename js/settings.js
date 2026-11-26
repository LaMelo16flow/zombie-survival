import { G } from './state.js';
import { showModal, showHub, closeModal } from './ui.js';
import { isTouch } from './input.js';

/*
  SETTINGS — graphics quality (Auto lowers it by itself if the game runs slowly), ink outlines,
  look sensitivity, invert look, FPS counter, tutorial tips. Saved on this device.
*/
const KEY = 'deadground.settings';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
export const settings = Object.assign({ quality: 'auto', outlines: true, sens: 1, invertY: false, fps: false, tips: true }, load());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} };

const LEVELS = ['low', 'medium', 'high'];
let level = settings.quality === 'auto' ? (isTouch ? 'medium' : 'high') : settings.quality;
export const quality = () => level;

export function applyGraphics() {
  const r = G.renderer; if (!r) return;
  const dpr = devicePixelRatio || 1;
  r.setPixelRatio({ low: Math.min(dpr, 0.8), medium: Math.min(dpr, isTouch ? 1.1 : 1.25), high: Math.min(dpr, isTouch ? 1.5 : 1.75) }[level]);
  r.setSize(innerWidth, innerHeight);
  G.outline?.setSize();
  if (G.sun) {
    G.sun.castShadow = level !== 'low';
    const size = level === 'high' ? 2048 : 1024;
    if (G.sun.shadow.mapSize.x !== size) { G.sun.shadow.mapSize.set(size, size); G.sun.shadow.map?.dispose(); G.sun.shadow.map = null; }
  }
  for (const m of G.grassMeshes || []) m.visible = level !== 'low';
  if (G.scene?.fog) G.drawScale = level === 'low' ? 0.75 : 1;
}

// Auto quality: if the frame rate stays low, step down (never back up in the same session, to avoid flicker)
let acc = 0, frames = 0, slow = 0, fpsEl = null;
export function trackFrame(dt) {
  acc += dt; frames++;
  if (acc >= 2) {
    const fps = frames / acc; acc = 0; frames = 0;
    if (fpsEl) fpsEl.textContent = Math.round(fps) + ' FPS · ' + level;
    if (settings.quality === 'auto' && G.running && !G.paused) {
      slow = fps < 30 ? slow + 1 : 0;
      if (slow >= 2 && level !== 'low') { level = LEVELS[LEVELS.indexOf(level) - 1]; slow = 0; applyGraphics(); G.toast?.(`Graphics lowered to ${level} to keep it smooth.`, 2); }
    }
  }
}
function fpsCounter() {
  if (settings.fps && !fpsEl) { fpsEl = document.createElement('div'); fpsEl.id = 'fps'; document.body.appendChild(fpsEl); }
  if (!settings.fps && fpsEl) { fpsEl.remove(); fpsEl = null; }
}

export function openGameSettings(back) {
  const opt = (k, v, label) => `<button class="small ${settings[k] === v ? 'on' : ''}" data-set="${k}" data-v='${JSON.stringify(v)}'>${label}</button>`;
  showHub('system', `<div class="panel"><h2>Settings</h2>
    <h3>Graphics</h3><div class="tabs">${opt('quality', 'auto', 'Auto')}${opt('quality', 'low', 'Low')}${opt('quality', 'medium', 'Medium')}${opt('quality', 'high', 'High')}</div>
    <p style="font-size:12px;opacity:.7">Now running: ${level}. Low turns off shadows and grass for older phones.</p>
    <h3>Ink outlines</h3><div class="tabs">${opt('outlines', true, 'On')}${opt('outlines', false, 'Off (faster)')}</div>
    <h3>Look sensitivity</h3><input type="range" id="st-sens" min="0.3" max="2.5" step="0.1" value="${settings.sens}">
    <h3>Invert look up/down</h3><div class="tabs">${opt('invertY', false, 'Normal')}${opt('invertY', true, 'Inverted')}</div>
    <h3>Show FPS</h3><div class="tabs">${opt('fps', false, 'Off')}${opt('fps', true, 'On')}</div>
    <h3>Tutorial tips</h3><div class="tabs">${opt('tips', true, 'On')}${opt('tips', false, 'Off')}</div>
    <button class="primary" id="st-back">Done</button></div>`);
  document.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
    const k = b.dataset.set, v = JSON.parse(b.dataset.v); settings[k] = v; save();
    if (k === 'quality') { level = v === 'auto' ? (isTouch ? 'medium' : 'high') : v; applyGraphics(); }
    fpsCounter(); openGameSettings(back);
  });
  document.getElementById('st-sens').oninput = e => { settings.sens = +e.target.value; save(); };
  document.getElementById('st-back').onclick = () => back ? back() : closeModal();
}

export function initSettings() { applyGraphics(); fpsCounter(); }
