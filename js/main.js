import * as THREE from '../lib/three.module.min.js';
import { G, VERSION, newSave } from './state.js';
import { initInput, endFrame, input } from './input.js';
import { buildTerrain, buildForest } from './world.js';
import { createPlayer, updatePlayer } from './player.js';
import { initHUD, updateHUD } from './ui.js';
import { dayNight } from './daynight.js';
import { survival } from './survival.js';
import { zombieSystem } from './zombies.js';

const canvas = document.getElementById('game');
document.getElementById('ver').textContent = 'v' + VERSION;

function initRenderer() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2 });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb3b8);
  scene.fog = new THREE.Fog(0x9fb3b8, 40, 220);
  G.scene = scene;

  G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);

  G.hemi = new THREE.HemisphereLight(0xcfd8dc, 0x3a3326, 0.9);
  scene.add(G.hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  scene.add(sun, sun.target);
  G.sun = sun;

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix();
  });
}

function buildWorld() {
  buildTerrain(G.scene);
  buildForest(G.scene);
}

function startGame(save) {
  G.save = save;
  document.getElementById('title').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  createPlayer();
  G.systems = [dayNight, survival, zombieSystem];
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
    G.sun.position.set(p.x + 40, p.y + 80, p.z + 25); G.sun.target.position.copy(p);
    updateHUD(dt);
  }
  endFrame();
  G.renderer.render(G.scene, G.camera);
}

initRenderer();
initInput(canvas);
buildWorld();
G.camera.position.set(30, 40, 30); G.camera.lookAt(0, 0, 0);
document.getElementById('btn-new').onclick = () => startGame(newSave());
requestAnimationFrame(loop);
window.G = G; // handy for debugging in the browser console
