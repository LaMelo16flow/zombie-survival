import * as THREE from '../lib/three.module.min.js';
import { G, VERSION, newSave } from './state.js';
import { initInput, endFrame, input } from './input.js';
import { buildTerrain, buildForest, waterUniforms } from './world.js';
import { Outline, createSky } from './style.js';
import { createPlayer, updatePlayer } from './player.js';
import { initHUD, updateHUD, uiSystem, banner } from './ui.js';
import { interactSystem } from './interact.js';
import { npcSystem } from './npc.js';
import { factionSystem } from './factions.js';
import { storySystem } from './story.js';
import { effectsSystem } from './effects.js';
import { weatherSystem } from './weather.js';
import { buildingSystem } from './building.js';
import { vehicleSystem } from './vehicles.js';
import { craftingSystem } from './crafting.js';
import { gatherSystem } from './gather.js';
import { sfx, unlock } from './audio.js';
import { storageSystem, loadLocal, takeBootSave, openLoadList, openSettings, clearLocal } from './storage.js';
import { registerFlats, buildLocations, locationSystem, nearLocation } from './locations.js';
import { dayNight } from './daynight.js';
import { survival } from './survival.js';
import { zombieSystem } from './zombies.js';

const canvas = document.getElementById('game');
document.getElementById('ver').textContent = 'v' + VERSION;

function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, ('ontouchstart' in window) ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc4ecff, 60, 260);
  G.scene = scene;
  G.sky = createSky(scene);
  G.water = waterUniforms;
  G.outline = new Outline(renderer);

  G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1100);

  G.hemi = new THREE.HemisphereLight(0xdff2ff, 0x4a5a2a, 0.9);
  scene.add(G.hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  scene.add(sun, sun.target);
  G.sun = sun;

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    G.outline.setSize();
    G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
  });
}

function buildWorld() {
  registerFlats();
  buildTerrain(G.scene);
  buildForest(G.scene, (x, z) => nearLocation(x, z, 6));
  buildLocations(G.scene);
}

function startGame(save) {
  G.save = save;
  document.getElementById('title').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  createPlayer();
  G.systems = [weatherSystem, dayNight, survival, zombieSystem, interactSystem, locationSystem, npcSystem, factionSystem, storySystem, storageSystem, effectsSystem, buildingSystem, vehicleSystem, craftingSystem, gatherSystem, uiSystem];
  for (const s of G.systems) s.init?.();
  initHUD();
  input.enabled = true;
  G.running = true;
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.running && !G.paused && !G.dead) {
    G.time += dt;
    updatePlayer(dt);
    for (const s of G.systems) s.update(dt);
    // keep the shadow camera around the player
    const p = G.player.pos;
    G.sun.position.copy(p).addScaledVector(G.sunDir, 100); G.sun.target.position.copy(p);
    updateHUD(dt);
  }
  endFrame();
  if (!G.running) { G.time += dt; G.sky.update(G.camera, dt); G.water.time.value += dt; G.camera.position.set(Math.sin(G.time * 0.05) * 60, 30, Math.cos(G.time * 0.05) * 60); G.camera.lookAt(0, 8, 0); }
  G.outline.render(G.scene, G.camera);
}

initRenderer();
initInput(canvas);
buildWorld();
G.camera.position.set(30, 40, 30); G.camera.lookAt(0, 0, 0);
document.getElementById('btn-new').onclick = () => { clearLocal(); startGame(newSave()); };
const local = loadLocal();
const extra = document.getElementById('title-extra');
const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.onclick = fn; extra.appendChild(b); extra.appendChild(document.createElement('br')); };
if (local) btn(`Continue (day ${local.world.day})`, () => startGame(local), 'primary');
btn('Load from GitHub', () => openLoadList());
btn('GitHub storage', () => openSettings());
const boot = takeBootSave();
if (boot) startGame(boot);
requestAnimationFrame(loop);
G.newGame = () => { clearLocal(); location.reload(); };
G.banner = banner; G.sfx = sfx;
window.G = G; // handy for debugging in the browser console
