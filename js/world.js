import * as THREE from '../lib/three.module.min.js';
import { rng, fbm, clamp } from './util.js';

export const WORLD_SIZE = 1000;          // metres, square, centred on 0,0
export const HALF = WORLD_SIZE / 2;
const SEED = 1337;

// Flat areas (towns, bases) register here so the terrain levels out under them.
export const flats = [];                 // {x, z, r, h}

function rawHeight(x, z) {
  const n = fbm(x / 180, z / 180, SEED, 4);
  const hills = Math.pow(n, 1.6) * 38;
  const edge = Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - (HALF - 60)) / 60); // mountains at the border
  return hills + edge * edge * 60;
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const f of flats) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + 25) {
      const t = clamp((d - f.r) / 25, 0, 1);
      h = f.h + (h - f.h) * t * t;
    }
  }
  return h;
}

export function addFlat(x, z, r) {
  const f = { x, z, r, h: rawHeight(x, z) };
  flats.push(f);
  return f;
}

/* ---------- Collision: circles + boxes in a coarse grid ---------- */
const CELL = 20;
const grid = new Map();
const key = (cx, cz) => cx + ',' + cz;
function insert(c, minX, minZ, maxX, maxZ) {
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const k = key(cx, cz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c);
    }
}
export function addCircle(x, z, r) { const c = { t: 0, x, z, r }; insert(c, x - r, z - r, x + r, z + r); return c; }
export function addBox(x, z, w, d) { const c = { t: 1, x, z, hw: w / 2, hd: d / 2 }; insert(c, x - w / 2, z - d / 2, x + w / 2, z + d / 2); return c; }

// Push a moving circle (pos.x/pos.z, radius r) out of obstacles.
export function collide(pos, r) {
  const k = key(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL));
  const list = grid.get(k);
  if (list) for (const c of list) {
    if (c.t === 0) {
      const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), p = (rr - d) / d; pos.x += dx * p; pos.z += dz * p; }
    } else {
      const nx = clamp(pos.x, c.x - c.hw, c.x + c.hw), nz = clamp(pos.z, c.z - c.hd, c.z + c.hd);
      const dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), p = (r - d) / d; pos.x += dx * p; pos.z += dz * p; }
        else { // centre inside the box: push out along the shortest axis
          const px = c.hw - Math.abs(pos.x - c.x), pz = c.hd - Math.abs(pos.z - c.z);
          if (px < pz) pos.x += Math.sign(pos.x - c.x || 1) * (px + r); else pos.z += Math.sign(pos.z - c.z || 1) * (pz + r);
        }
      }
    }
  }
  const lim = HALF - 8;
  pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
}

/* ---------- Building the 3D world ---------- */
export function buildTerrain(scene) {
  const SEG = 200;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x / 25, z / 25, 99, 2);
    if (h > 45) col.setRGB(0.42, 0.40, 0.37);                 // rock
    else col.setRGB(0.20 + n * 0.12, 0.30 + n * 0.12 - h * 0.001, 0.13 + n * 0.05); // grass
    for (const f of flats) if (Math.hypot(x - f.x, z - f.z) < f.r) col.setRGB(0.33 + n * 0.05, 0.31 + n * 0.05, 0.27);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export function buildForest(scene, avoid = () => false) {
  const r = rng(SEED + 7);
  const COUNT = 2600;
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6); trunkGeo.translate(0, 1.5, 0);
  const leafGeo = new THREE.ConeGeometry(2, 5.5, 7); leafGeo.translate(0, 5.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x4a3526 }), COUNT);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), COUNT);
  trunks.castShadow = leaves.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < COUNT && tries < COUNT * 6; tries++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 40), z = (r() - 0.5) * (WORLD_SIZE - 40);
    const density = fbm(x / 120, z / 120, SEED + 3, 2);   // clumps of forest
    if (density < 0.48 || avoid(x, z) || Math.hypot(x, z) < 15) continue;
    const h = heightAt(x, z);
    if (h > 50) continue;
    const sc = 0.7 + r() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
    m.compose(p.set(x, h - 0.2, z), q, s.set(sc, sc, sc));
    trunks.setMatrixAt(n, m); leaves.setMatrixAt(n, m);
    leaves.setColorAt(n, c.setHSL(0.28 + r() * 0.07, 0.45, 0.24 + r() * 0.1));
    addCircle(x, z, 0.5 * sc);
    n++;
  }
  trunks.count = leaves.count = n;
  scene.add(trunks, leaves);

  // Rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x6d6a63 }), 400);
  let k = 0;
  for (let i = 0; i < 400; i++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 40), z = (r() - 0.5) * (WORLD_SIZE - 40);
    if (avoid(x, z)) continue;
    const sc = 0.5 + r() * 1.6;
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    m.compose(p.set(x, heightAt(x, z), z), q, s.set(sc, sc * 0.7, sc));
    rocks.setMatrixAt(k++, m);
    if (sc > 1) addCircle(x, z, sc * 0.8);
  }
  rocks.count = k; rocks.castShadow = true;
  scene.add(rocks);
}
