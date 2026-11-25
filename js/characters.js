import * as THREE from '../lib/three.module.min.js';

// Low-poly humanoid used by the player, survivors and zombies.
const box = (w, h, d, y = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0); return g; };
const GEO = {
  torso: box(0.62, 0.75, 0.34, 0), head: box(0.38, 0.4, 0.38, 0.2),
  limbA: box(0.18, 0.66, 0.18, -0.3), limbL: box(0.22, 0.78, 0.22, -0.39)
};
const matCache = new Map();
const mat = c => { if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return matCache.get(c); };

export function makeHuman({ skin = 0xc68e62, shirt = 0x37506b, pants = 0x2d2a26, hat = null } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.78; g.add(body);
  const torso = new THREE.Mesh(GEO.torso, mat(shirt)); torso.position.y = 0.5; body.add(torso);
  const head = new THREE.Mesh(GEO.head, mat(skin)); head.position.y = 0.9; body.add(head);
  if (hat) { const h = new THREE.Mesh(box(0.42, 0.12, 0.42, 0.45), mat(hat)); head.add(h); }
  const armL = new THREE.Mesh(GEO.limbA, mat(shirt)); armL.position.set(-0.41, 0.82, 0); body.add(armL);
  const armR = new THREE.Mesh(GEO.limbA, mat(shirt)); armR.position.set(0.41, 0.82, 0); body.add(armR);
  const handL = new THREE.Mesh(box(0.16, 0.16, 0.16, -0.66), mat(skin)); armL.add(handL);
  const handR = new THREE.Mesh(box(0.16, 0.16, 0.16, -0.66), mat(skin)); armR.add(handR);
  const legL = new THREE.Mesh(GEO.limbL, mat(pants)); legL.position.set(-0.16, 0.12, 0); body.add(legL);
  const legR = new THREE.Mesh(GEO.limbL, mat(pants)); legR.position.set(0.16, 0.12, 0); body.add(legR);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.parts = { body, torso, head, armL, armR, legL, legR };
  g.userData.phase = Math.random() * 10;
  return g;
}

// Give a human a weapon held in the right hand.
export function giveWeapon(h, kind) {
  const { armR } = h.userData.parts;
  if (armR.userData.weapon) armR.remove(armR.userData.weapon);
  let w = null;
  if (kind === 'bat') { w = new THREE.Mesh(box(0.08, 0.9, 0.08, 0.4), mat(0x8a6a44)); w.position.set(0, -0.68, 0.1); w.rotation.x = Math.PI / 2; }
  if (kind === 'pistol') { w = new THREE.Mesh(box(0.1, 0.14, 0.32, 0), mat(0x222222)); w.position.set(0, -0.72, 0.12); }
  if (kind === 'rifle') { w = new THREE.Mesh(box(0.1, 0.14, 0.9, 0), mat(0x2b2b22)); w.position.set(0, -0.72, 0.3); }
  if (w) { w.castShadow = true; armR.add(w); }
  armR.userData.weapon = w;
}

// Simple procedural animation. speed 0..1, zombie = arms forward, attack 0..1 swing progress.
export function animateHuman(h, dt, speed, { zombie = false, attack = 0, aim = false } = {}) {
  const p = h.userData.parts;
  h.userData.phase += dt * (4 + speed * 8);
  const s = Math.sin(h.userData.phase) * Math.min(1, speed * 1.4);
  p.legL.rotation.x = s * 0.8; p.legR.rotation.x = -s * 0.8;
  p.body.position.y = 0.78 + Math.abs(Math.cos(h.userData.phase)) * 0.05 * speed;
  if (zombie) {
    p.armL.rotation.x = -1.4 + Math.sin(h.userData.phase * 0.7) * 0.15;
    p.armR.rotation.x = -1.4 + Math.cos(h.userData.phase * 0.6) * 0.15 - attack * 0.6;
    p.torso.rotation.x = 0.15; p.head.rotation.z = 0.25;
  } else {
    p.armL.rotation.x = -s * 0.7;
    p.armR.rotation.x = aim ? -1.5 : (attack > 0 ? -2.4 + attack * 3.2 : s * 0.7);
    p.armR.rotation.z = attack > 0 ? -0.3 : 0;
  }
}
