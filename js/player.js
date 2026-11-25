import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { input, down, updateMoveFromKeys } from './input.js';
import { heightAt, collide, inWater } from './world.js';
import { WATER } from './world.js';
import { sfx } from './audio.js';
import { makeHuman, animateHuman } from './characters.js';
import { clamp } from './util.js';

export function createPlayer() {
  const mesh = makeHuman({ shirt: 0xc0503a, pants: 0x2f3e55, skin: 0x8d5a3b, hair: 0x1c1a22, hairStyle: 'spiky', scarf: 0xf2e6c9, pack: 0x6b5a3a, shoes: 0xe8e4e0 });
  G.scene.add(mesh);
  const s = G.save.player;
  mesh.position.set(s.x, heightAt(s.x, s.z), s.z);
  mesh.rotation.y = s.rot;
  G.player = {
    mesh, pos: mesh.position, rot: s.rot, speed: 0, radius: 0.45,
    camYaw: s.rot + Math.PI, camPitch: 0.35, camDist: 7,
    attackT: 0, aiming: false
  };
  return G.player;
}

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

export function updatePlayer(dt) {
  const P = G.player;
  updateMoveFromKeys();

  // Camera orbit
  P.camYaw -= input.lookX * 0.0035;
  P.camPitch = clamp(P.camPitch + input.lookY * 0.0028, -0.25, 1.1);
  if (G.driving) { G.driveUpdate(dt); followCamera(dt, P.pos.x, P.pos.y + 1.6, P.pos.z, 10); syncSave(); return; }

  // Movement relative to camera
  const sprint = down('sprint') && (P.canSprint ? P.canSprint() : true);
  const maxSpeed = (sprint ? 8.5 : 4.6) * (P.speedMul || 1) * (inWater(P.pos.x, P.pos.z) ? 0.55 : 1);
  const fx = -Math.sin(P.camYaw), fz = -Math.cos(P.camYaw);
  const rx = -fz, rz = fx;
  let vx = (fx * -input.mz + rx * input.mx), vz = (fz * -input.mz + rz * input.mx);
  const mag = Math.min(1, Math.hypot(input.mx, input.mz));
  if (mag > 0.05) {
    const l = Math.hypot(vx, vz); vx /= l; vz /= l;
    P.pos.x += vx * maxSpeed * mag * dt;
    P.pos.z += vz * maxSpeed * mag * dt;
    const target = Math.atan2(vx, vz);
    let d = target - P.rot; d = Math.atan2(Math.sin(d), Math.cos(d));
    P.rot += d * Math.min(1, dt * 12);
  }
  P.moving = mag > 0.05;
  if (P.moving) { P.stepT = (P.stepT || 0) - dt * (sprint ? 1.7 : 1) * mag; if (P.stepT <= 0) { P.stepT = 0.42; sfx.step(inWater(P.pos.x, P.pos.z)); } }
  P.sprinting = sprint && P.moving;
  P.speed = mag * (sprint ? 1 : 0.55);
  collide(P.pos, P.radius);
  P.pos.y = Math.max(heightAt(P.pos.x, P.pos.z), WATER - 1.1);   // swim instead of sinking
  P.mesh.rotation.y = P.rot;

  if (P.attackT > 0) P.attackT = Math.max(0, P.attackT - dt * 3);
  animateHuman(P.mesh, dt, P.speed, { attack: P.attackT, aim: P.aiming });

  followCamera(dt, P.pos.x, P.pos.y + 1.7, P.pos.z, P.camDist);
  syncSave();
}
function syncSave() { const P = G.player, s = G.save.player; s.x = P.pos.x; s.z = P.pos.z; s.rot = P.rot; }

// Orbit camera around a point (used on foot and in vehicles)
export function followCamera(dt, x, y, z, dist) {
  const P = G.player;
  camTarget.set(x, y, z);
  const cp = Math.cos(P.camPitch);
  camPos.set(
    camTarget.x + Math.sin(P.camYaw) * cp * dist,
    camTarget.y + Math.sin(P.camPitch) * dist,
    camTarget.z + Math.cos(P.camYaw) * cp * dist
  );
  const ground = heightAt(camPos.x, camPos.z) + 0.6;
  if (camPos.y < ground) camPos.y = ground;
  G.camera.position.lerp(camPos, Math.min(1, dt * 14));
  G.camera.lookAt(camTarget);
  if (G.shake) { const k = G.shake * 0.6; G.camera.position.x += (Math.random() - 0.5) * k; G.camera.position.y += (Math.random() - 0.5) * k; }
}
