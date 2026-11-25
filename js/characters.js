import * as THREE from '../lib/three.module.min.js';
import { toon, paint, merge } from './style.js';

/*
  ANIME CHARACTERS
  Each body part (torso, head, arms, legs) is ONE mesh with vertex colours, so a character
  is only ~7 draw calls — important for iPhone with dozens of zombies on screen.
  Looks: big head, big anime eyes with a shine, styled hair, tapered jacket, shoes.
  Zombies: grey-green skin, glowing red eyes, open mouth, torn clothes and blood stains.
*/

const BODY_MAT = toon(0xffffff, { vertexColors: true });
const EYE_GLOW = new THREE.MeshBasicMaterial({ color: 0xff2a2a, fog: false });
const P = (geo, hex) => paint(geo, hex);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);

export const HAIR_STYLES = ['spiky', 'short', 'long', 'ponytail', 'buzz'];
export const HAIR_COLORS = [0x1c1a22, 0x3b2a20, 0x6b4226, 0xd9b26a, 0xb8442f, 0x2d3f73, 0xe8e4e0, 0x4a7a5a];
const pick = a => a[Math.floor(Math.random() * a.length)];
const darker = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

/* ---------- Parts ---------- */
function hairGeo(style, color, zombie) {
  const parts = [];
  const capG = new THREE.SphereGeometry(0.295, 14, 10, 0, Math.PI * 2, 0, Math.PI * (style === 'buzz' ? 0.42 : 0.56));
  capG.scale(1, 1.05, 1); capG.translate(0, 0.3, -0.015);
  parts.push(P(capG, color));
  if (style === 'spiky') {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, tilt = 0.9;
      const c = new THREE.ConeGeometry(0.09, 0.32, 5);
      c.rotateX(-tilt).rotateY(a + (zombie ? Math.random() : 0));
      c.translate(Math.sin(a) * 0.17, 0.5 + Math.cos(a) * 0.02, Math.cos(a) * 0.17 - 0.03);
      parts.push(P(c, color));
    }
    for (let i = -1; i <= 1; i++) { const f = new THREE.ConeGeometry(0.07, 0.24, 4); f.rotateX(Math.PI * 0.85); f.translate(i * 0.11, 0.42, 0.25); parts.push(P(f, color)); }
  } else if (style === 'short') {
    for (let i = -2; i <= 2; i++) { const f = new THREE.ConeGeometry(0.065, 0.2, 4); f.rotateX(Math.PI * 0.8); f.translate(i * 0.085, 0.43, 0.25); parts.push(P(f, color)); }
  } else if (style === 'long') {
    const back = new THREE.BoxGeometry(0.52, 0.62, 0.16); back.translate(0, 0.12, -0.2); parts.push(P(back, color));
    for (const x of [-0.27, 0.27]) { const s = new THREE.BoxGeometry(0.08, 0.5, 0.22); s.translate(x, 0.18, -0.02); parts.push(P(s, color)); }
    for (let i = -2; i <= 2; i++) { const f = new THREE.ConeGeometry(0.065, 0.22, 4); f.rotateX(Math.PI * 0.8); f.translate(i * 0.085, 0.43, 0.25); parts.push(P(f, color)); }
  } else if (style === 'ponytail') {
    const t = new THREE.ConeGeometry(0.11, 0.5, 7); t.rotateX(Math.PI * 0.82); t.translate(0, 0.33, -0.36); parts.push(P(t, color));
    const tie = sph(0.07, 8, 6); tie.translate(0, 0.45, -0.29); parts.push(P(tie, 0xc9372c));
    for (let i = -1; i <= 1; i++) { const f = new THREE.ConeGeometry(0.07, 0.2, 4); f.rotateX(Math.PI * 0.8); f.translate(i * 0.1, 0.43, 0.25); parts.push(P(f, color)); }
  }
  return parts;
}

function faceGeo(skin, zombie) {
  const parts = [];
  const head = sph(0.27, 16, 12); head.scale(1, 1.06, 0.96); head.translate(0, 0.28, 0); parts.push(P(head, skin));
  // ears
  for (const x of [-0.27, 0.27]) { const e = sph(0.055, 6, 5); e.scale(0.6, 1, 1); e.translate(x, 0.26, 0); parts.push(P(e, skin)); }
  // eyes: big dark ovals with a white shine (zombies get theirs from the glowing mesh)
  if (!zombie) for (const x of [-0.1, 0.1]) {
    const w = sph(0.07, 10, 8); w.scale(0.75, 1, 0.35); w.translate(x, 0.27, 0.235); parts.push(P(w, 0xffffff));
    const iris = sph(0.058, 10, 8); iris.scale(0.7, 1, 0.3); iris.translate(x, 0.262, 0.252); parts.push(P(iris, 0x2a1f3d));
    const shine = sph(0.018, 6, 5); shine.translate(x + 0.02, 0.29, 0.27); parts.push(P(shine, 0xffffff));
    const brow = new THREE.BoxGeometry(0.09, 0.018, 0.02); brow.rotateZ(x > 0 ? -0.15 : 0.15); brow.translate(x, 0.355, 0.245); parts.push(P(brow, 0x2a1f1a));
  }
  // mouth
  const m = new THREE.BoxGeometry(zombie ? 0.12 : 0.07, zombie ? 0.06 : 0.014, 0.02); m.translate(0, 0.13, 0.248); parts.push(P(m, zombie ? 0x3a0c10 : 0x7a3a3a));
  if (zombie) { const b = new THREE.BoxGeometry(0.06, 0.05, 0.02); b.translate(-0.12, 0.2, 0.235); parts.push(P(b, 0x6a1010)); }
  // neck
  const neck = cyl(0.08, 0.09, 0.12, 8); neck.translate(0, 0.0, 0); parts.push(P(neck, skin));
  return parts;
}

function torsoGeo(o) {
  const parts = [];
  const chest = cyl(0.27, 0.22, 0.62, 10); chest.scale(1, 1, 0.68); chest.translate(0, 0.33, 0); parts.push(P(chest, o.shirt));
  // open jacket stripe / zip
  const zip = new THREE.BoxGeometry(0.06, 0.6, 0.02); zip.translate(0, 0.33, 0.165); parts.push(P(zip, darker(o.shirt, o.zombie ? 0.6 : 0.55)));
  // collar
  const col = new THREE.TorusGeometry(0.15, 0.045, 6, 12); col.rotateX(Math.PI / 2); col.translate(0, 0.63, 0); parts.push(P(col, o.scarf || darker(o.shirt, 0.75)));
  if (o.scarf) { const tail = new THREE.BoxGeometry(0.09, 0.3, 0.03); tail.rotateZ(0.2); tail.translate(0.08, 0.48, 0.17); parts.push(P(tail, o.scarf)); }
  // belt + hips
  const hips = cyl(0.22, 0.2, 0.18, 10); hips.scale(1, 1, 0.75); hips.translate(0, 0.0, 0); parts.push(P(hips, o.pants));
  const belt = cyl(0.225, 0.225, 0.045, 10); belt.scale(1, 1, 0.76); belt.translate(0, 0.07, 0); parts.push(P(belt, 0x2a2420));
  if (o.zombie) for (let i = 0; i < 3; i++) {            // blood stains
    const b = sph(0.07 + Math.random() * 0.05, 6, 5); b.scale(1, 1.3, 0.3);
    const a = (Math.random() - 0.5) * 2.2; b.translate(Math.sin(a) * 0.2, 0.15 + Math.random() * 0.4, Math.cos(a) * 0.15); parts.push(P(b, 0x6a0f12));
  }
  if (o.pack) { const bag = new THREE.BoxGeometry(0.34, 0.4, 0.16); bag.translate(0, 0.36, -0.2); parts.push(P(bag, o.pack)); }
  return parts;
}

function armGeo(o, torn) {
  const parts = [];
  const sh = sph(0.1, 8, 6); sh.translate(0, 0, 0); parts.push(P(sh, o.shirt));
  const upper = cyl(0.085, 0.07, torn ? 0.28 : 0.56, 7); upper.translate(0, torn ? -0.14 : -0.28, 0); parts.push(P(upper, o.shirt));
  if (torn) { const fore = cyl(0.06, 0.055, 0.3, 7); fore.translate(0, -0.43, 0); parts.push(P(fore, o.skin)); }
  else { const cuff = cyl(0.075, 0.075, 0.05, 7); cuff.translate(0, -0.56, 0); parts.push(P(cuff, darker(o.shirt, 0.7))); }
  const hand = sph(0.075, 8, 6); hand.scale(1, 1.15, 1); hand.translate(0, -0.64, 0); parts.push(P(hand, o.skin));
  return parts;
}

function legGeo(o) {
  const parts = [];
  const leg = cyl(0.1, 0.08, 0.66, 7); leg.translate(0, -0.33, 0); parts.push(P(leg, o.pants));
  const shoe = new THREE.BoxGeometry(0.16, 0.11, 0.28); shoe.translate(0, -0.71, 0.04); parts.push(P(shoe, o.shoes));
  const sole = new THREE.BoxGeometry(0.17, 0.03, 0.29); sole.translate(0, -0.77, 0.04); parts.push(P(sole, o.zombie ? 0x3a3530 : 0xeeeeee));
  return parts;
}

/* ---------- Build a character ---------- */
const geoCache = new Map();
function cached(key, fn) { if (key && geoCache.has(key)) return geoCache.get(key); const g = fn(); if (key) geoCache.set(key, g); return g; }

// opts: skin, shirt, pants, hat (bandana colour), hair, hairStyle, zombie, scarf, pack, shoes, cacheKey
export function makeHuman(opts = {}) {
  const o = {
    skin: 0xc68e62, shirt: 0x37506b, pants: 0x2d2a33, shoes: 0x3a3030,
    hair: pick(HAIR_COLORS), hairStyle: pick(HAIR_STYLES), ...opts
  };
  if (o.zombie) { o.shoes = 0x2a2622; }
  const key = o.cacheKey;      // zombies of the same look share geometry
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.8; g.add(body);
  const mesh = (geo) => { const m = new THREE.Mesh(geo, BODY_MAT); m.castShadow = true; return m; };

  const torso = mesh(cached(key && key + 't', () => merge(torsoGeo(o)))); body.add(torso);
  const head = new THREE.Group(); head.position.y = 0.66; body.add(head);
  const headParts = [...faceGeo(o.skin, o.zombie), ...hairGeo(o.hairStyle, o.hair, o.zombie)];
  if (o.hat) { const band = new THREE.TorusGeometry(0.285, 0.04, 6, 16); band.rotateX(Math.PI / 2); band.translate(0, 0.38, -0.01); headParts.push(P(band, o.hat));
    const knot = new THREE.BoxGeometry(0.1, 0.16, 0.04); knot.translate(0, 0.32, -0.29); headParts.push(P(knot, o.hat)); }
  head.add(mesh(cached(key && key + 'h', () => merge(headParts))));
  if (o.zombie) {   // glowing eyes — bright at night, the anime-horror look
    const eyes = new THREE.Mesh(cached('zeyes', () => { const a = sph(0.045, 8, 6); a.scale(1, 0.7, 0.4); a.translate(-0.1, 0.27, 0.245); const b = a.clone(); b.translate(0.2, 0, 0); return merge([a, b]); }), EYE_GLOW);
    head.add(eyes);
  }
  const armL = mesh(cached(key && key + 'aL', () => merge(armGeo(o, o.zombie)))); armL.position.set(-0.34, 0.56, 0); body.add(armL);
  const armR = mesh(cached(key && key + 'aR', () => merge(armGeo(o, false)))); armR.position.set(0.34, 0.56, 0); body.add(armR);
  const legGeoM = cached(key && key + 'l', () => merge(legGeo(o)));
  const legL = mesh(legGeoM); legL.position.set(-0.12, 0.0, 0); body.add(legL);
  const legR = mesh(legGeoM); legR.position.set(0.12, 0.0, 0); body.add(legR);

  g.userData.parts = { body, torso, head, armL, armR, legL, legR };
  g.userData.phase = Math.random() * 10;
  return g;
}

/* ---------- Weapons ---------- */
const WMAT = toon(0xffffff, { vertexColors: true });
const WEAPON_GEO = {
  bat: () => { const h = cyl(0.03, 0.03, 0.3, 6); h.translate(0, 0.1, 0); const b = cyl(0.06, 0.035, 0.6, 7); b.translate(0, 0.55, 0); return merge([P(h, 0x3a2a20), P(b, 0xc89a5a)]); },
  machete: () => { const h = new THREE.BoxGeometry(0.05, 0.2, 0.05); h.translate(0, 0.05, 0); const bl = new THREE.BoxGeometry(0.02, 0.6, 0.11); bl.translate(0, 0.45, 0.02); return merge([P(h, 0x222222), P(bl, 0xd8dde3)]); },
  pistol: () => { const s = new THREE.BoxGeometry(0.07, 0.09, 0.3); s.translate(0, 0.02, 0.08); const gr = new THREE.BoxGeometry(0.06, 0.16, 0.08); gr.rotateX(0.25); gr.translate(0, -0.07, -0.02); return merge([P(s, 0x2b2e36), P(gr, 0x4a3a2a)]); },
  rifle: () => { const s = new THREE.BoxGeometry(0.07, 0.1, 0.9); s.translate(0, 0.02, 0.28); const st = new THREE.BoxGeometry(0.07, 0.15, 0.25); st.translate(0, -0.03, -0.15); const sc = cyl(0.03, 0.03, 0.2, 6); sc.rotateX(Math.PI / 2); sc.translate(0, 0.1, 0.25); return merge([P(s, 0x2f3328), P(st, 0x5a4030), P(sc, 0x111111)]); }
};
const wCache = {};
export function giveWeapon(h, kind) {
  const { armR } = h.userData.parts;
  if (armR.userData.weapon) armR.remove(armR.userData.weapon);
  armR.userData.weapon = null;
  if (!WEAPON_GEO[kind]) return;
  const w = new THREE.Mesh(wCache[kind] || (wCache[kind] = WEAPON_GEO[kind]()), WMAT);
  w.castShadow = true;
  // melee weapons stick forward from the fist; guns line up with the arm so they point where you aim
  w.position.set(0, -0.66, 0.04); w.rotation.x = Math.PI / 2;
  armR.add(w); armR.userData.weapon = w;
}

/* ---------- Animation ---------- */
// speed 0..1, zombie = arms forward + lurch, attack 0..1 swing progress, aim = arm raised
export function animateHuman(h, dt, speed, { zombie = false, attack = 0, aim = false } = {}) {
  const p = h.userData.parts;
  h.userData.phase += dt * (4 + speed * 8);
  const ph = h.userData.phase;
  const s = Math.sin(ph) * Math.min(1, speed * 1.4);
  p.legL.rotation.x = s * 0.8; p.legR.rotation.x = -s * 0.8;
  p.body.position.y = 0.8 + Math.abs(Math.cos(ph)) * 0.05 * speed;
  if (zombie) {
    p.armL.rotation.x = -1.35 + Math.sin(ph * 0.7) * 0.15;
    p.armR.rotation.x = -1.35 + Math.cos(ph * 0.6) * 0.15 - attack * 0.7;
    p.armL.rotation.z = 0.1; p.armR.rotation.z = -0.1;
    p.torso.rotation.x = 0.18 + Math.sin(ph * 0.5) * 0.04;
    p.head.rotation.z = 0.28 + Math.sin(ph * 0.4) * 0.1; p.head.rotation.x = 0.15;
    p.body.rotation.z = Math.sin(ph * 0.5) * 0.06;       // lurching walk
  } else {
    p.armL.rotation.x = -s * 0.7;
    p.armR.rotation.x = aim ? -1.5 : (attack > 0 ? -2.4 + attack * 3.2 : s * 0.7);
    p.armR.rotation.z = attack > 0 ? -0.3 : 0;
    p.torso.rotation.y = attack > 0 ? (attack - 0.5) * 0.5 : 0;
    p.head.rotation.y = Math.sin(ph * 0.15) * 0.08 * (1 - speed);   // idle glance
  }
}
