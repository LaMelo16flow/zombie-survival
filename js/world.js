import * as THREE from '../lib/three.module.min.js';
import { rng, fbm, clamp } from './util.js';
import { toon, merge } from './style.js';

let _t = 0; const G_time = () => _t; export const tickWorld = t => { _t = t; };
export const G_grass = [];
export const WORLD_SIZE = 1800;          // metres, square, centred on 0,0 (the first 1 km in the middle is the original valley)
export const HALF = WORLD_SIZE / 2;
const SEED = 1337;
export const WATER = 5;                  // lakes fill everything below this height
export const inWater = (x, z) => heightAt(x, z) < WATER - 0.4;

// Flat areas (towns, bases) register here so the terrain levels out under them.
export const flats = [];                 // {x, z, r, h}

/* ---------- Regions: the city (east), the snowy mountains (north), the swamp (south-west) ---------- */
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function biome(x, z) {
  return { city: ss(560, 660, x) * (1 - ss(560, 700, -z) * 0.6), snow: ss(560, 680, -z), swamp: ss(520, 640, -x) * ss(300, 440, z) };
}
export const CITY_H = 14;
function rawHeight(x, z) {
  const n = fbm(x / 180, z / 180, SEED, 4);
  const hills = Math.pow(n, 1.6) * 38;
  const edge = Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - (HALF - 60)) / 60); // mountains at the border
  let h = hills + edge * edge * 60;
  const b = biome(x, z);
  if (b.snow > 0) h += b.snow * (22 + fbm(x / 90, z / 90, SEED + 9, 3) * 55);                  // big snowy peaks
  if (b.swamp > 0) h = h * (1 - b.swamp) + b.swamp * (WATER - 0.9 + fbm(x / 35, z / 35, SEED + 4, 2) * 3.2);   // flat, half-flooded
  if (b.city > 0) h = h * (1 - b.city) + b.city * CITY_H;                                     // flat city ground
  const d = (WATER + 1.5) - h;           // dig lakes deeper so shores are crisp
  if (d > 0) h -= d * d * 0.9;
  return h;
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
  const f = { x, z, r, h: Math.max(rawHeight(x, z), WATER + 1.2) };
  flats.push(f);
  return f;
}

/* ---------- Collision: circles + boxes in a coarse grid ---------- */
const CELL = 20;
const grid = new Map();
const key = (cx, cz) => cx + ',' + cz;
function insert(c, minX, minZ, maxX, maxZ) {
  c.cells = [];
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const k = key(cx, cz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c); c.cells.push(k);
    }
}
export function removeCollider(c) {
  for (const k of c.cells || []) { const l = grid.get(k); const i = l ? l.indexOf(c) : -1; if (i >= 0) l.splice(i, 1); }
  c.cells = [];
}
// Oriented box (for walls you can rotate): stored as a box in the rotated frame
export function addOBox(x, z, w, d, rot) {
  const c = { t: 2, x, z, hw: w / 2, hd: d / 2, cs: Math.cos(rot), sn: Math.sin(rot) };
  const r = Math.hypot(w, d) / 2; insert(c, x - r, z - r, x + r, z + r); return c;
}
export function addCircle(x, z, r) { const c = { t: 0, x, z, r }; insert(c, x - r, z - r, x + r, z + r); return c; }
export function addBox(x, z, w, d, top) { const c = { t: 1, x, z, hw: w / 2, hd: d / 2, top }; insert(c, x - w / 2, z - d / 2, x + w / 2, z + d / 2); return c; }
// Is this point inside something solid and tall (city towers)? Used to stop the camera going through walls.
export function solidAt(x, y, z) {
  const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (list) for (const c of list) if (c.t === 1 && c.top !== undefined && y < c.top && Math.abs(x - c.x) < c.hw + 0.3 && Math.abs(z - c.z) < c.hd + 0.3) return true;
  return false;
}

// Push a moving circle (pos.x/pos.z, radius r) out of obstacles.
export function collide(pos, r) {
  const k = key(Math.floor(pos.x / CELL), Math.floor(pos.z / CELL));
  const list = grid.get(k);
  if (list) for (const c of list) {
    if (c.t === 0) {
      const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), p = (rr - d) / d; pos.x += dx * p; pos.z += dz * p; }
    } else if (c.t === 2) {
      // rotate into the box frame, resolve, rotate back
      const rx = pos.x - c.x, rz = pos.z - c.z;
      const lx = rx * c.cs - rz * c.sn, lz = rx * c.sn + rz * c.cs;
      const nx = clamp(lx, -c.hw, c.hw), nz = clamp(lz, -c.hd, c.hd);
      let dx = lx - nx, dz = lz - nz; const d2 = dx * dx + dz * dz;
      let ox = 0, oz = 0;
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), p = (r - d) / d; ox = dx * p; oz = dz * p; }
        else { const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz); if (px < pz) ox = Math.sign(lx || 1) * (px + r); else oz = Math.sign(lz || 1) * (pz + r); }
        pos.x += ox * c.cs + oz * c.sn; pos.z += -ox * c.sn + oz * c.cs;
        c.touched = G_time();
      }
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

/* ---------- Building the 3D world (anime style) ---------- */
const GRASS = [new THREE.Color(0x6cb24e), new THREE.Color(0x86c35a), new THREE.Color(0x58a047)];
export function buildTerrain(scene) {
  const SEG = 320;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x / 40, z / 40, 99, 2);
    // painted bands rather than smooth noise
    const bm = biome(x, z);
    if (bm.snow > 0.45 && h > 14) col.set(n > 0.55 ? 0xf4f8fc : h > 60 && n < 0.4 ? 0xb8c4cf : 0xe3ecf4);   // snow
    else if (bm.city > 0.6) col.set(n > 0.5 ? 0x6d7178 : 0x62666d);                                      // asphalt and concrete
    else if (h > 46) col.set(n > 0.5 ? 0xb9b2a6 : 0x9c958c);                // rock
    else if (h > 38) col.set(0x7f9a5a);                                  // high meadow
    else if (bm.swamp > 0.5 && h >= WATER - 0.3) col.set(n > 0.5 ? 0x5d7a3e : 0x4c6634);                 // boggy ground
    else if (h < WATER + 0.9) col.set(h < WATER - 0.3 ? 0x6f8f8a : 0xe8d7a0); // lake bed / sand
    else col.copy(GRASS[n < 0.42 ? 2 : n < 0.6 ? 0 : 1]);
    for (const f of flats) { const d = Math.hypot(x - f.x, z - f.z); if (d < f.r) { const path = fbm(x / 9, z / 9, 7, 2);
      if (bm.snow > 0.45) col.set(path > 0.55 ? 0xc9d2da : 0xe8eff5); else if (bm.city > 0.6) col.set(path > 0.5 ? 0x8a8e95 : 0x7d8188); else col.set(d < f.r * 0.8 && path > 0.55 ? 0xd8c08e : path > 0.4 ? 0x9cc760 : 0x86b955); } }
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  buildWater(scene);
  return mesh;
}

// Stylised water: deep/shallow colours, white foam where it meets the shore, moving glints.
export const waterUniforms = { time: { value: 0 }, light: { value: 1 } };
function buildWater(scene) {
  const SEG = 300;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) depth[i] = WATER - heightAt(pos.getX(i), pos.getZ(i));
  geo.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), waterUniforms),
    vertexShader: `attribute float depth; varying float vDepth; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vDepth = depth; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform float light; varying float vDepth; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        if (vDepth < 0.0) discard;
        vec3 shallow = vec3(0.35, 0.80, 0.85), deep = vec3(0.12, 0.42, 0.66);
        vec3 c = mix(shallow, deep, smoothstep(0.3, 3.5, vDepth));
        float wave = sin(vW.x * 0.35 + time * 1.3) * sin(vW.z * 0.31 - time * 1.1);
        float glint = step(0.96, wave) * 0.45;
        float foam = 1.0 - smoothstep(0.05, 0.22, vDepth + sin(vW.x * 0.8 + vW.z * 0.6 + time * 2.0) * 0.04);
        c = mix(c + glint, vec3(1.0), foam);
        c *= mix(vec3(0.16, 0.2, 0.42), vec3(1.0), light);
        gl_FragColor = vec4(c, mix(0.82, 0.95, foam));
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`
  });
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER;
  water.renderOrder = 1;
  scene.add(water);
}

// Resource spots you can gather from (trees → wood, big rocks → stone/metal, bushes → berries/herbs)
export const spots = { tree: [], rock: [], bush: [] };
const spotGrid = new Map();
export function nearestSpot(kind, x, z, r) {
  if (!spotGrid.has(kind)) { const g = new Map(); for (const s of spots[kind]) { const k = Math.floor(s.x / 10) + ',' + Math.floor(s.z / 10); if (!g.has(k)) g.set(k, []); g.get(k).push(s); } spotGrid.set(kind, g); }
  const g = spotGrid.get(kind), cx = Math.floor(x / 10), cz = Math.floor(z / 10);
  let best = null, bd = r;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const s of g.get((cx + i) + ',' + (cz + j)) || []) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}

export function buildForest(scene, avoid = () => false) {
  const r = rng(SEED + 7);
  const dry = (x, z) => heightAt(x, z) > WATER + 0.8;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);

  // Two tree shapes: tall pines and round "anime" broadleaf trees
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7); trunkGeo.translate(0, 1.6, 0);
  const pineGeo = merge([
    new THREE.ConeGeometry(2.3, 3.6, 8).translate(0, 3.6, 0),
    new THREE.ConeGeometry(1.8, 3.0, 8).translate(0, 5.3, 0),
    new THREE.ConeGeometry(1.2, 2.4, 8).translate(0, 6.8, 0)
  ]);
  const roundGeo = merge([
    new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4.6, 0),
    new THREE.IcosahedronGeometry(1.6, 1).translate(1.5, 4.0, 0.4),
    new THREE.IcosahedronGeometry(1.5, 1).translate(-1.3, 4.2, -0.6),
    new THREE.IcosahedronGeometry(1.4, 1).translate(0.2, 5.9, 0.3)
  ]);
  const N = 2600;
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x7a5236), N * 2);
  const pines = new THREE.InstancedMesh(pineGeo, toon(0xffffff), N);
  const rounds = new THREE.InstancedMesh(roundGeo, toon(0xffffff), N);
  let nt = 0, np = 0, nr = 0;
  for (let tries = 0; (np + nr) < N * 1.7 && tries < N * 10; tries++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 40), z = (r() - 0.5) * (WORLD_SIZE - 40);
    const density = fbm(x / 120, z / 120, SEED + 3, 2);
    const bm = biome(x, z);
    if (density < (bm.swamp > 0.5 ? 0.42 : 0.48) || bm.city > 0.4 || avoid(x, z) || Math.hypot(x, z) < 15 || !dry(x, z)) continue;
    const h = heightAt(x, z);
    if (h > (bm.snow > 0.4 ? 75 : 50)) continue;
    const sc = 0.75 + r() * 0.7;
    q.setFromAxisAngle(up, r() * 6.28);
    m.compose(p.set(x, h - 0.2, z), q, s.set(sc, sc, sc));
    const pine = h > 22 || bm.snow > 0.4 || r() < 0.45;
    if (pine && np < N) { pines.setMatrixAt(np, m); pines.setColorAt(np++, bm.snow > 0.4 ? c.setHSL(0.55, 0.18 + r() * 0.1, 0.78 + r() * 0.12) : c.setHSL(0.36 + r() * 0.05, 0.55, 0.32 + r() * 0.08)); }
    else if (!pine && nr < N) { rounds.setMatrixAt(nr, m); rounds.setColorAt(nr++, bm.swamp > 0.4 ? c.setHSL(0.2 + r() * 0.05, 0.35, 0.28 + r() * 0.06) : c.setHSL(0.22 + r() * 0.1, 0.6, 0.42 + r() * 0.1)); }
    else continue;
    trunks.setMatrixAt(nt++, m);
    addCircle(x, z, 0.5 * sc); spots.tree.push({ x, z, i: spots.tree.length });
  }
  trunks.count = nt; pines.count = np; rounds.count = nr;
  for (const t of [trunks, pines, rounds]) { t.castShadow = true; scene.add(t); }

  // Rocks
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), toon(0xa7a196), 750);
  let k = 0;
  for (let i = 0; i < 750; i++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 40), z = (r() - 0.5) * (WORLD_SIZE - 40);
    if (avoid(x, z)) continue;
    const sc = 0.5 + r() * 1.6;
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
    m.compose(p.set(x, heightAt(x, z), z), q, s.set(sc, sc * 0.7, sc));
    rocks.setMatrixAt(k++, m);
    if (sc > 1) { addCircle(x, z, sc * 0.8); spots.rock.push({ x, z, i: spots.rock.length }); }
  }
  rocks.count = k; rocks.castShadow = true;
  scene.add(rocks);

  // Grass tufts and flowers
  const blade = merge([0, 1, 2].map(i => new THREE.ConeGeometry(0.09, 0.7, 3, 1, true).translate(Math.cos(i * 2.1) * 0.15, 0.35, Math.sin(i * 2.1) * 0.15).rotateY(i)));
  const G = ('ontouchstart' in window) ? 12000 : 26000, grass = new THREE.InstancedMesh(blade, toon(0xffffff), G);
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.14, 0).translate(0, 0.55, 0), toon(0xffffff), 3000);
  const PETALS = [0xff8fb1, 0xffffff, 0xffe066, 0xb39cff, 0xff6b6b];
  let g = 0, f = 0;
  for (let i = 0; i < G * 2 && g < G; i++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 60), z = (r() - 0.5) * (WORLD_SIZE - 60);
    const h = heightAt(x, z);
    const gb = biome(x, z);
    if (h < WATER + 1 || h > 40 || gb.city > 0.4 || gb.snow > 0.4 || avoid(x, z)) continue;
    const sc = 0.7 + r() * 0.9;
    q.setFromAxisAngle(up, r() * 6.28);
    m.compose(p.set(x, h, z), q, s.set(sc, sc, sc));
    grass.setMatrixAt(g, m); grass.setColorAt(g++, c.setHSL(0.25 + r() * 0.06, 0.6, 0.38 + r() * 0.12));
    if (f < 3000 && r() < 0.2) { m.compose(p.set(x + 0.3, h, z + 0.2), q, s.set(1, 1, 1)); flowers.setMatrixAt(f, m); flowers.setColorAt(f++, c.set(PETALS[Math.floor(r() * PETALS.length)])); }
  }
  grass.count = g; flowers.count = f;
  scene.add(grass, flowers);
  G_grass.push(grass, flowers);

  // Berry / herb bushes
  const bushGeo = merge([new THREE.IcosahedronGeometry(0.8, 1).translate(0, 0.6, 0), new THREE.IcosahedronGeometry(0.6, 1).translate(0.6, 0.45, 0.2), new THREE.IcosahedronGeometry(0.55, 1).translate(-0.5, 0.45, -0.2)]);
  const NB = 1000, bushes = new THREE.InstancedMesh(bushGeo, toon(0xffffff), NB);
  const dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 0), toon(0xffffff), NB * 4);
  let nb = 0, nd = 0;
  for (let i = 0; i < NB * 4 && nb < NB; i++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 60), z = (r() - 0.5) * (WORLD_SIZE - 60), h = heightAt(x, z);
    const bb = biome(x, z);
    if (h < WATER + 1 || h > 38 || bb.city > 0.4 || bb.snow > 0.4 || avoid(x, z)) continue;
    const herb = r() < 0.4;
    m.compose(p.set(x, h, z), q.setFromAxisAngle(up, r() * 6), s.set(1, 1, 1));
    bushes.setMatrixAt(nb, m); bushes.setColorAt(nb, c.setHSL(herb ? 0.3 : 0.36, 0.5, herb ? 0.42 : 0.3));
    for (let k = 0; k < 4; k++) { m.compose(p.set(x + (r() - 0.5) * 1.2, h + 0.7 + r() * 0.6, z + (r() - 0.5) * 1.2), q, s.set(1, 1, 1)); dots.setMatrixAt(nd, m); dots.setColorAt(nd++, c.set(herb ? 0xf4f0ff : 0xe8364a)); }
    spots.bush.push({ x, z, i: nb, herb }); nb++;
  }
  bushes.count = nb; dots.count = nd;
  scene.add(bushes, dots);
}
