import * as THREE from '../lib/three.module.min.js';
import { G } from './state.js';

// Anime hit effects: blood/dust bursts, white impact stars, camera shake.
const MAX = 400;
let parts, stars = [];
const pool = [];   // {x,y,z,vx,vy,vz,life,max,size}
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();

function starGeo() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 0.22 : (i % 4 === 0 ? 1 : 0.6); i ? sh.lineTo(Math.sin(a) * r, Math.cos(a) * r) : sh.moveTo(0, r); }
  return new THREE.ShapeGeometry(sh);
}

export function burst(x, y, z, color, n = 8, speed = 4, size = 0.12) {
  for (let i = 0; i < n; i++) {
    if (pool.length >= MAX) pool.shift();
    const a = Math.random() * Math.PI * 2, up = Math.random();
    pool.push({ x, y, z, vx: Math.sin(a) * speed * (0.4 + Math.random()), vy: speed * (0.4 + up), vz: Math.cos(a) * speed * (0.4 + Math.random()),
      life: 0, max: 0.5 + Math.random() * 0.4, size: size * (0.6 + Math.random() * 0.8), color });
  }
}
export function impact(x, y, z, color = 0xffffff, size = 0.6) {
  const st = stars.find(t => t.t >= t.max); if (!st) return;
  st.mesh.position.set(x, y, z); st.mesh.material.color.set(color); st.t = 0; st.size = size; st.mesh.visible = true;
  st.mesh.rotation.z = Math.random() * 6;
}
export const shake = amt => { G.shake = Math.min(0.5, (G.shake || 0) + amt); };

export const effectsSystem = {
  init() {
    parts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    parts.count = 0; parts.frustumCulled = false; G.scene.add(parts);
    const geo = starGeo();
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      mesh.renderOrder = 10; mesh.visible = false; G.scene.add(mesh);
      stars.push({ mesh, t: 1, max: 0.18, size: 0.6 });
    }
    G.on('zombieKilled', zb => { burst(zb.pos.x, zb.pos.y + 1, zb.pos.z, 0x7a0f14, 14, 5, 0.14); burst(zb.pos.x, zb.pos.y + 0.2, zb.pos.z, 0xb8a888, 8, 2, 0.2); });
    G.on('npcDied', n => burst(n.pos.x, n.pos.y + 1, n.pos.z, 0x9a1018, 12, 4, 0.12));
  },
  update(dt) {
    let k = 0;
    for (let i = pool.length - 1; i >= 0; i--) {
      const o = pool[i]; o.life += dt;
      if (o.life > o.max) { pool.splice(i, 1); continue; }
      o.vy -= 14 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      const sc = o.size * (1 - o.life / o.max);
      m.compose(p.set(o.x, o.y, o.z), q, s.set(sc, sc, sc));
      parts.setMatrixAt(k, m); parts.setColorAt(k, c.set(o.color)); k++;
    }
    parts.count = k; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    for (const st of stars) {
      if (st.t >= st.max) { st.mesh.visible = false; continue; }
      st.t += dt; const f = st.t / st.max;
      st.mesh.scale.setScalar(st.size * (0.4 + f * 0.9)); st.mesh.material.opacity = 1 - f;
      st.mesh.quaternion.copy(G.camera.quaternion);
    }
    if (G.shake) { G.shake = Math.max(0, G.shake - dt * 1.5); }
  }
};
