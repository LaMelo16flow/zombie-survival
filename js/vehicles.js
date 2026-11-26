import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';
import { input, pressed, down, updateMoveFromKeys, addTouchButton } from './input.js';
import { heightAt, collide, WATER, addCircle, removeCollider, addOBox } from './world.js';
import { addInteractable } from './interact.js';
import { toon, paint, merge } from './style.js';
import { toast, showChoice } from './ui.js';
import { zombies, hitZombie } from './zombies.js';
import { burst, shake } from './effects.js';
import { sfx, engine } from './audio.js';

/*
  VEHICLES — find cars and trucks around the map, press E / USE to get in.
  W/S or the stick: gas / brake / reverse · A/D: steer · E: get out · F: horn.
  They use fuel (find fuel cans or fill up at the gas station), take damage when you crash or
  run over zombies, and can be repaired with scrap. Their position, fuel and damage are saved.
*/

const TYPES = {
  car:   { name: 'Car', max: 24, accel: 11, turn: 1.9, hp: 100, len: 4.2, wid: 1.9, mass: 1 },
  truck: { name: 'Pickup truck', max: 20, accel: 9, turn: 1.6, hp: 170, len: 5, wid: 2.1, mass: 1.6 }
};
// Where vehicles start in a new game
const SPAWNS = [
  ['car', 30, 62, 0.3, 0xe8364a], ['truck', 150, -96, 1.6, 0x4a6fa5], ['car', -150, -175, 2.4, 0xffc94a],
  ['car', 335, 40, 0.1, 0xf4efe4], ['truck', 300, -262, 3.0, 0x5d6b47], ['car', -215, 178, 1.1, 0x36c5d6],
  ['truck', 60, 92, 2.2, 0x8a5a9f], ['car', -40, -60, 0.8, 0x7ad35a],
  // the bigger world
  ['car', 690, 60, 1.5, 0xe8e4e0], ['truck', 640, -205, 0.2, 0x2a2622], ['truck', 70, -700, 2.8, 0xd1495b], ['truck', -700, 590, 0.9, 0x5d6b47], ['car', 790, 290, 2.0, 0x36c5d6]
];

const MAT = toon(0xffffff, { vertexColors: true });
const GLASS = 0x2a3d63, LIGHT = 0xfff2b0, TAIL = 0xe8364a, DARK = 0x222226, CHROME = 0xc9d1d9;
const B = (w, h, d, x, y, z, c) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
function bodyGeo(type, color) {
  const g = [];
  if (type === 'car') {
    g.push(B(1.9, 0.6, 4.2, 0, 0.75, 0, color), B(1.7, 0.55, 2.1, 0, 1.32, -0.2, color));
    g.push(B(1.72, 0.42, 1.6, 0, 1.33, -0.2, GLASS), B(1.6, 0.4, 0.1, 0, 1.3, 0.86, GLASS));
    g.push(B(1.95, 0.25, 0.25, 0, 0.55, 2.1, CHROME), B(1.95, 0.25, 0.25, 0, 0.55, -2.1, CHROME));
  } else {
    g.push(B(2.1, 0.7, 5, 0, 0.85, 0, color), B(2, 0.75, 1.9, 0, 1.55, 0.8, color));
    g.push(B(2.02, 0.5, 1.5, 0, 1.6, 0.8, GLASS), B(1.9, 0.5, 0.1, 0, 1.55, 1.76, GLASS));
    g.push(B(2.1, 0.5, 0.15, 0, 1.4, -2.45, color), B(0.15, 0.5, 2.6, -1, 1.4, -1.2, color), B(0.15, 0.5, 2.6, 1, 1.4, -1.2, color));
    g.push(B(2.15, 0.3, 0.3, 0, 0.6, 2.5, CHROME));
  }
  const L = TYPES[type].len / 2, W = TYPES[type].wid / 2 - 0.3;
  g.push(B(0.35, 0.2, 0.06, -W, 0.85, L + 0.02, LIGHT), B(0.35, 0.2, 0.06, W, 0.85, L + 0.02, LIGHT));
  g.push(B(0.35, 0.18, 0.06, -W, 0.85, -L - 0.02, TAIL), B(0.35, 0.18, 0.06, W, 0.85, -L - 0.02, TAIL));
  return merge(g);
}
const wheelGeo = merge([paint(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12).rotateZ(Math.PI / 2), DARK), paint(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8).rotateZ(Math.PI / 2), CHROME)]);

export const vehicles = [];
function spawnVehicle(data) {
  const T = TYPES[data.type];
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo(data.type, data.color), MAT); body.castShadow = true; g.add(body);
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const w = new THREE.Mesh(wheelGeo, MAT); w.position.set(sx * (T.wid / 2), 0.42, sz * (T.len / 2 - 0.85)); w.castShadow = true; g.add(w); wheels.push(w);
  }
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.6 }));
  smoke.position.set(0, 1.6, T.len / 2 - 0.5); smoke.visible = false; g.add(smoke);
  G.scene.add(g);
  const v = { data, T, g, body, wheels, smoke, pos: g.position, speed: 0, steer: 0, pitch: 0, roll: 0 };
  g.position.set(data.x, heightAt(data.x, data.z), data.z); g.rotation.y = data.rot;
  v.inter = addInteractable({ getPos: () => v.pos, r: 3.2, enabled: () => !G.driving && G.time - (G.exitT ?? -9) > 0.4,
    label: () => data.hp <= 0 ? `Wrecked ${T.name} — repair (4 scrap)` : `Drive ${T.name} · fuel ${Math.round(data.fuel)}% · ${Math.round(data.hp / T.hp * 100)}% condition`,
    action: () => data.hp <= 0 ? repair(v) : enter(v) });
  vehicles.push(v);
  park(v);
  return v;
}
// Parked cars are solid: two circles along the body. They are removed while you drive it.
function park(v) { unpark(v); const h = v.g.rotation.y, o = v.T.len / 2 - v.T.wid / 2; v.colls = [1, -1].map(s => addCircle(v.pos.x + Math.sin(h) * o * s, v.pos.z + Math.cos(h) * o * s, v.T.wid / 2 + 0.05)); }
function unpark(v) { for (const c of v.colls || []) removeCollider(c); v.colls = []; }

function repair(v) {
  const inv = G.save.inv;
  if (inv.scrap < 4) return toast('You need 4 scrap to repair it.');
  inv.scrap -= 4; v.data.hp = v.T.hp * 0.6; v.smoke.visible = false; toast(`${v.T.name} repaired.`); sfx.hit();
}

/* ---------- Driving ---------- */
let headlight, hud;
function enter(v) {
  if (v.data.fuel <= 0) {
    if (G.save.inv.fuel > 0) { G.save.inv.fuel--; v.data.fuel = Math.min(100, v.data.fuel + 50); toast('You pour a fuel can in. (+50%)'); }
    else return toast('Out of fuel. Find a fuel can or the gas station.');
  }
  G.driving = v; unpark(v); G.player.mesh.visible = false; engine.start();
  G.player.camYaw = v.data.rot + Math.PI; G.player.camPitch = 0.3;
  hud.classList.remove('hidden');
  toast('W/S gas & brake · A/D steer · E get out · F horn', 3);
}
function exit() {
  const v = G.driving; if (!v) return;
  G.driving = null; G.exitT = G.time; engine.stop();
  const side = v.g.rotation.y + Math.PI / 2, P = G.player;
  P.pos.x = v.pos.x + Math.sin(side) * (v.T.wid / 2 + 1); P.pos.z = v.pos.z + Math.cos(side) * (v.T.wid / 2 + 1);
  P.mesh.visible = true; P.rot = v.g.rotation.y;
  v.speed = 0; hud.classList.add('hidden'); if (v.dyn) { removeCollider(v.dyn); v.dyn = null; } park(v);
}

const fwd = new THREE.Vector3(), tmp = { x: 0, z: 0 };
function drive(dt) {
  const v = G.driving, P = G.player, d = v.data, T = v.T;
  updateMoveFromKeys();
  const throttle = -input.mz, steer = input.mx;
  const wet = heightAt(v.pos.x, v.pos.z) < WATER - 0.5;
  // speed
  const broken = d.hp <= 0, noFuel = d.fuel <= 0;
  let acc = 0;
  if (!broken && !noFuel) {
    if (throttle > 0.1) acc = v.speed < -0.5 ? T.accel * 2.2 : T.accel * throttle;
    else if (throttle < -0.1) acc = v.speed > 0.5 ? -T.accel * 2.2 : T.accel * 0.6 * throttle;
  }
  v.speed += acc * dt;
  v.speed -= v.speed * (wet ? 2.5 : 0.45) * dt;                         // rolling friction / water
  const max = T.max * (d.hp < T.hp * 0.3 ? 0.6 : 1) * (wet ? 0.35 : 1);
  v.speed = Math.max(-max * 0.4, Math.min(max, v.speed));
  if (Math.abs(v.speed) < 0.05 && Math.abs(throttle) < 0.1) v.speed = 0;
  d.fuel = Math.max(0, d.fuel - Math.abs(throttle) * dt * 0.35);
  if (d.fuel <= 0 && !v.warned) { toast('Out of fuel!'); v.warned = true; }
  // steering — stronger at low speed, never spins on the spot
  v.steer += (steer - v.steer) * Math.min(1, dt * 6);
  const turn = v.steer * T.turn * Math.min(1, Math.abs(v.speed) / 6) * Math.sign(v.speed || 1) * (1 - Math.min(0.5, Math.abs(v.speed) / 60));
  v.g.rotation.y -= turn * dt;
  const h = v.g.rotation.y;
  const before = { x: v.pos.x, z: v.pos.z };
  v.pos.x += Math.sin(h) * v.speed * dt; v.pos.z += Math.cos(h) * v.speed * dt;
  // collisions: test a circle at the front and at the back (our own body collider is taken out while we test)
  if (v.dyn) { removeCollider(v.dyn); v.dyn = null; }
  let hit = 0;
  for (const s of [1, -1]) {
    tmp.x = v.pos.x + Math.sin(h) * s * (T.len / 2 - 0.9); tmp.z = v.pos.z + Math.cos(h) * s * (T.len / 2 - 0.9);
    const ox = tmp.x, oz = tmp.z; collide(tmp, T.wid / 2 + 0.1);
    const px = tmp.x - ox, pz = tmp.z - oz; if (px || pz) { v.pos.x += px; v.pos.z += pz; hit = Math.max(hit, Math.hypot(px, pz)); }
  }
  if (hit > 0.02 && Math.abs(v.speed) > 4) {
    const impact = Math.abs(v.speed);
    d.hp -= impact * 0.9 / T.mass; v.speed *= -0.25; shake(Math.min(0.5, impact / 30)); sfx.hit();
    burst(v.pos.x + Math.sin(h) * T.len / 2, v.pos.y + 1, v.pos.z + Math.cos(h) * T.len / 2, 0xc9d1d9, 10, 4, 0.12);
    if (d.hp <= 0) { d.hp = 0; toast(`The ${T.name.toLowerCase()} is wrecked! You climb out.`, 3); exit(); return; }
  } else if (hit > 0) v.speed *= 0.9;
  // run over zombies
  if (Math.abs(v.speed) > 3) for (const zb of zombies) {
    if (!zb.alive) continue;
    const dx = zb.pos.x - v.pos.x, dz = zb.pos.z - v.pos.z;
    const lz = dx * Math.sin(h) + dz * Math.cos(h), lx = dx * Math.cos(h) - dz * Math.sin(h);
    if (Math.abs(lz) < T.len / 2 + 0.4 && Math.abs(lx) < T.wid / 2 + 0.3) {
      const dmg = Math.abs(v.speed) * 6;
      hitZombie(zb, dmg, v.pos.x, v.pos.z, Math.abs(v.speed) * 0.8);
      d.hp -= (zb.k.scale ? 8 : 2) / T.mass; v.speed *= zb.k.scale ? 0.4 : 0.85; shake(0.12);
      burst(zb.pos.x, zb.pos.y + 1, zb.pos.z, 0x7a0f14, 10, 5, 0.14);
    }
  }
  // sit on the terrain, tilt with the slope
  const fx = Math.sin(h) * T.len / 2, fz = Math.cos(h) * T.len / 2, rx = Math.cos(h) * T.wid / 2, rz = -Math.sin(h) * T.wid / 2;
  const hf = heightAt(v.pos.x + fx, v.pos.z + fz), hb = heightAt(v.pos.x - fx, v.pos.z - fz);
  const hr = heightAt(v.pos.x + rx, v.pos.z + rz), hl = heightAt(v.pos.x - rx, v.pos.z - rz);
  v.pos.y = Math.max((hf + hb + hr + hl) / 4, WATER - 0.9);
  v.g.rotation.x = 0; v.g.rotation.z = 0;
  v.body.rotation.x = -Math.atan2(hf - hb, T.len) ; v.body.rotation.z = Math.atan2(hr - hl, T.wid);
  for (const w of v.wheels) w.rotation.x += v.speed * dt / 0.42;
  v.wheels[0].rotation.y = v.wheels[1].rotation.y = v.steer * 0.45;
  // player rides along
  P.pos.set(v.pos.x, v.pos.y, v.pos.z); P.rot = h; P.moving = Math.abs(v.speed) > 1; P.sprinting = Math.abs(v.speed) > 12;
  d.x = v.pos.x; d.z = v.pos.z; d.rot = h;
  // the moving car is solid: zombies, people and animals bump into it and claw at it instead of walking through
  v.dyn = addOBox(v.pos.x, v.pos.z, T.wid, T.len, h);
  // camera swings behind the car when you are not looking around
  if (Math.abs(input.lookX) < 0.5 && Math.abs(v.speed) > 2) {
    let want = h + Math.PI; let dd = want - P.camYaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); P.camYaw += dd * Math.min(1, dt * 2);
  }
  engine.set(v.speed, Math.abs(throttle));
  if (pressed('attack')) sfx.horn();
  if (pressed('interact')) exit();
  // headlights
  const night = G.save.world.hour >= 19 || G.save.world.hour < 6.5;
  headlight.intensity = night ? 120 : 0;
  headlight.position.set(v.pos.x + fx, v.pos.y + 1, v.pos.z + fz);
  headlight.target.position.set(v.pos.x + Math.sin(h) * 20, v.pos.y, v.pos.z + Math.cos(h) * 20);
  hud.innerHTML = `<b>${Math.round(Math.abs(v.speed) * 3.6)}</b> km/h<span>FUEL <i style="--f:${d.fuel}%"></i></span><span>CAR <i style="--f:${d.hp / T.hp * 100}%;--c:var(--red)"></i></span>`;
  v.smoke.visible = d.hp < T.hp * 0.3;
}

/* ---------- Fuel at the gas station ---------- */
function addPumpStation() {
  const nearCar = () => vehicles.find(v => v.data.hp > 0 && Math.hypot(v.pos.x - 140, v.pos.z + 105) < 14);
  addInteractable({ x: 140, z: -105, r: 3, enabled: () => !G.driving,
    label: () => nearCar() ? `Fill up the ${nearCar().T.name.toLowerCase()} (once a day)` : 'Fill a fuel can (once a day)',
    action: () => {
      const w = G.save.world; if (w.pumpDay === w.day) return toast('The pump is dry today. Come back tomorrow.');
      w.pumpDay = w.day; const v = nearCar();
      if (v) { v.data.fuel = 100; v.warned = false; toast('Tank full!'); } else { G.save.inv.fuel = (G.save.inv.fuel || 0) + 1; toast('You fill a fuel can.'); }
      sfx.pickup();
    } });
}

export const vehicleSystem = {
  init() {
    G.save.vehicles = G.save.vehicles || [];
    SPAWNS.forEach(([type, x, z, rot, color], i) => { if (!G.save.vehicles.some(v => v.id === i)) G.save.vehicles.push({ id: i, type, x, z, rot, color, fuel: 30 + Math.round(Math.random() * 50), hp: TYPES[type].hp }); });   // older saves get the new cars too
    for (const d of G.save.vehicles) spawnVehicle(d);
    headlight = new THREE.SpotLight(0xfff2d0, 0, 60, 0.55, 0.6, 1.2); G.scene.add(headlight, headlight.target);
    hud = document.createElement('div'); hud.id = 'drivehud'; hud.className = 'hidden'; document.getElementById('hud').appendChild(hud);
    G.driveUpdate = drive;
    // While you drive, every hit lands on the car, not on you. If the car breaks, you climb out unhurt.
    G.damageCar = (dmg, from) => {
      const v = G.driving; if (!v) return;
      v.data.hp -= dmg * 0.8 / v.T.mass; shake(Math.min(0.25, dmg / 60)); sfx.hit();
      burst(v.pos.x, v.pos.y + 1.2, v.pos.z, 0xc9d1d9, 5, 3, 0.1);
      if (v.data.hp <= 0) { v.data.hp = 0; toast(`The ${v.T.name.toLowerCase()} is wrecked! You climb out.`, 3); exit(); }
    };
    // distance from a point to the outside of the car you are driving (zombies use it to know if they can reach)
    G.carSurfDist = (x, z) => {
      const v = G.driving; if (!v) return 1e9;
      const h = v.g.rotation.y, dx = x - v.pos.x, dz = z - v.pos.z;
      const lz = Math.abs(dx * Math.sin(h) + dz * Math.cos(h)) - v.T.len / 2, lx = Math.abs(dx * Math.cos(h) - dz * Math.sin(h)) - v.T.wid / 2;
      return Math.hypot(Math.max(0, lx), Math.max(0, lz));
    };
    G.vehicleList = () => vehicles;
    addPumpStation();
    G.extraInventory = () => `<div class="row"><span>Fuel cans</span><b>${G.save.inv.fuel || 0}</b></div>`;
    G.on('npcDied', () => {});
  },
  update(dt) {
    for (const v of vehicles) if (v !== G.driving && v.data.hp < v.T.hp * 0.3) v.smoke.visible = true;
    if (!G.driving) headlight.intensity = 0;
  }
};
