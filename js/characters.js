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

// Arms and legs are two pieces each (upper + lower) so elbows and knees can bend.
function upperArmGeo(o) {
  const parts = [];
  const sh = sph(0.1, 8, 6); parts.push(P(sh, o.shirt));
  const upper = cyl(0.085, 0.074, 0.31, 7); upper.translate(0, -0.155, 0); parts.push(P(upper, o.shirt));
  const elbow = sph(0.074, 7, 5); elbow.translate(0, -0.31, 0); parts.push(P(elbow, o.shirt));
  return parts;
}
function forearmGeo(o, torn) {
  const parts = [];
  const fore = cyl(torn ? 0.06 : 0.072, torn ? 0.055 : 0.066, 0.27, 7); fore.translate(0, -0.135, 0); parts.push(P(fore, torn ? o.skin : o.shirt));
  if (!torn) { const cuff = cyl(0.075, 0.075, 0.05, 7); cuff.translate(0, -0.26, 0); parts.push(P(cuff, darker(o.shirt, 0.7))); }
  const hand = sph(0.075, 8, 6); hand.scale(1, 1.15, 1); hand.translate(0, -0.33, 0); parts.push(P(hand, o.skin));
  return parts;
}
function thighGeo(o) {
  const parts = [];
  const hip = sph(0.105, 8, 6); parts.push(P(hip, o.pants));
  const t = cyl(0.105, 0.088, 0.36, 7); t.translate(0, -0.18, 0); parts.push(P(t, o.pants));
  const knee = sph(0.088, 7, 5); knee.translate(0, -0.36, 0); parts.push(P(knee, o.pants));
  return parts;
}
function shinGeo(o) {
  const parts = [];
  const sn = cyl(0.088, 0.075, 0.32, 7); sn.translate(0, -0.16, 0); parts.push(P(sn, o.pants));
  const shoe = new THREE.BoxGeometry(0.16, 0.11, 0.28); shoe.translate(0, -0.35, 0.04); parts.push(P(shoe, o.shoes));
  const sole = new THREE.BoxGeometry(0.17, 0.03, 0.29); sole.translate(0, -0.41, 0.04); parts.push(P(sole, o.zombie ? 0x3a3530 : 0xeeeeee));
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
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  const headParts = [...faceGeo(o.skin, o.zombie), ...hairGeo(o.hairStyle, o.hair, o.zombie)];
  if (o.hat) { const band = new THREE.TorusGeometry(0.285, 0.04, 6, 16); band.rotateX(Math.PI / 2); band.translate(0, 0.38, -0.01); headParts.push(P(band, o.hat));
    const knot = new THREE.BoxGeometry(0.1, 0.16, 0.04); knot.translate(0, 0.32, -0.29); headParts.push(P(knot, o.hat)); }
  head.add(mesh(cached(key && key + 'h', () => merge(headParts))));
  if (o.zombie) {   // glowing eyes — bright at night, the anime-horror look
    const eyes = new THREE.Mesh(cached('zeyes', () => { const a = sph(0.045, 8, 6); a.scale(1, 0.7, 0.4); a.translate(-0.1, 0.27, 0.245); const b = a.clone(); b.translate(0.2, 0, 0); return merge([a, b]); }), EYE_GLOW);
    head.add(eyes);
  }
  const ua = cached(key && key + 'ua', () => merge(upperArmGeo(o)));
  const armL = mesh(ua); armL.position.set(-0.34, 0.56, 0); torso.add(armL);
  const armR = mesh(ua); armR.position.set(0.34, 0.56, 0); torso.add(armR);
  const foreL = mesh(cached(key && key + 'faL', () => merge(forearmGeo(o, o.zombie)))); foreL.position.y = -0.31; armL.add(foreL);
  const foreR = mesh(cached(key && key + 'faR', () => merge(forearmGeo(o, false)))); foreR.position.y = -0.31; armR.add(foreR);
  const th = cached(key && key + 'th', () => merge(thighGeo(o))), sh = cached(key && key + 'sh', () => merge(shinGeo(o)));
  const legL = mesh(th); legL.position.set(-0.12, 0.0, 0); body.add(legL);
  const legR = mesh(th); legR.position.set(0.12, 0.0, 0); body.add(legR);
  const shinL = mesh(sh); shinL.position.y = -0.36; legL.add(shinL);
  const shinR = mesh(sh); shinR.position.y = -0.36; legR.add(shinR);

  g.userData.parts = { body, torso, head, armL, armR, legL, legR, foreL, foreR, shinL, shinR };
  g.userData.anim = { turn: 0, lastRot: null, hurt: 0, breath: Math.random() * 6, look: 0, lookT: 0, wpn: null };
  g.userData.phase = Math.random() * 10;
  return g;
}

/* ---------- Weapons ---------- */
const WMAT = toon(0xffffff, { vertexColors: true });
const WEAPON_GEO = {
  bat: () => { const h = cyl(0.03, 0.03, 0.3, 6); h.translate(0, 0.1, 0); const b = cyl(0.06, 0.035, 0.6, 7); b.translate(0, 0.55, 0); return merge([P(h, 0x3a2a20), P(b, 0xc89a5a)]); },
  machete: () => { const h = new THREE.BoxGeometry(0.05, 0.2, 0.05); h.translate(0, 0.05, 0); const bl = new THREE.BoxGeometry(0.02, 0.6, 0.11); bl.translate(0, 0.45, 0.02); return merge([P(h, 0x222222), P(bl, 0xd8dde3)]); },
  pistol: () => { const s = new THREE.BoxGeometry(0.07, 0.09, 0.3); s.translate(0, 0.02, 0.08); const gr = new THREE.BoxGeometry(0.06, 0.16, 0.08); gr.rotateX(0.25); gr.translate(0, -0.07, -0.02); return merge([P(s, 0x2b2e36), P(gr, 0x4a3a2a)]); },
  spear: () => { const sh = cyl(0.03, 0.03, 1.6, 6); sh.translate(0, 0.5, 0); const tip = new THREE.ConeGeometry(0.06, 0.3, 5); tip.translate(0, 1.43, 0); return merge([P(sh, 0x8a6a44), P(tip, 0xece4d4)]); },
  axe: () => { const h = cyl(0.035, 0.035, 0.9, 6); h.translate(0, 0.35, 0); const hd = new THREE.BoxGeometry(0.06, 0.22, 0.3); hd.translate(0, 0.72, 0.1); return merge([P(h, 0xc0392b), P(hd, 0xbfc6cd)]); },
  katana: () => { const h = cyl(0.03, 0.03, 0.26, 6); h.translate(0, 0.05, 0); const g = new THREE.BoxGeometry(0.14, 0.03, 0.1); g.translate(0, 0.19, 0); const b = new THREE.BoxGeometry(0.02, 0.85, 0.06); b.translate(0, 0.62, 0); return merge([P(h, 0x2a1f3d), P(g, 0xffc94a), P(b, 0xf0f4f8)]); },
  shotgun: () => { const s = cyl(0.04, 0.04, 0.75, 6); s.rotateX(Math.PI / 2); s.translate(0, 0.04, 0.3); const st = new THREE.BoxGeometry(0.08, 0.14, 0.4); st.translate(0, -0.02, -0.12); return merge([P(s, 0x2b2e36), P(st, 0x7a5236)]); },
  crossbow: () => { const s = new THREE.BoxGeometry(0.07, 0.08, 0.6); s.translate(0, 0, 0.15); const bow = new THREE.BoxGeometry(0.7, 0.04, 0.05); bow.translate(0, 0.02, 0.4); const bolt = cyl(0.012, 0.012, 0.5, 4); bolt.rotateX(Math.PI / 2); bolt.translate(0, 0.06, 0.2); return merge([P(s, 0x6b4a2b), P(bow, 0x2a2622), P(bolt, 0xe8e4d8)]); },
  rifle: () => { const s = new THREE.BoxGeometry(0.07, 0.1, 0.9); s.translate(0, 0.02, 0.28); const st = new THREE.BoxGeometry(0.07, 0.15, 0.25); st.translate(0, -0.03, -0.15); const sc = cyl(0.03, 0.03, 0.2, 6); sc.rotateX(Math.PI / 2); sc.translate(0, 0.1, 0.25); return merge([P(s, 0x2f3328), P(st, 0x5a4030), P(sc, 0x111111)]); }
};
const wCache = {};
export function giveWeapon(h, kind) {
  const { foreR } = h.userData.parts;
  if (foreR.userData.weapon) foreR.remove(foreR.userData.weapon);
  foreR.userData.weapon = null; h.userData.anim && (h.userData.anim.wpn = kind || null);
  if (!WEAPON_GEO[kind]) return;
  const w = new THREE.Mesh(wCache[kind] || (wCache[kind] = WEAPON_GEO[kind]()), WMAT);
  w.castShadow = true;
  // held in the fist, pointing forward from the hand
  w.position.set(0, -0.35, 0.04); w.rotation.x = Math.PI / 2;
  foreR.add(w); foreR.userData.weapon = w;
}

/* ---------- Animation ----------
  Procedural, human-like motion (all angles in radians):
  • Gait: a walk/run cycle where hips swing, knees bend in the swing phase and lock in the stance phase,
    the pelvis bobs twice per step and sways side to side, shoulders counter-rotate the hips, arms swing
    opposite the legs with bent elbows. Running leans forward with high knees and pumping arms.
  • Turning leans into the turn; stopping and starting tilt the body.
  • Idle: breathing, slow weight shift between feet, glancing around.
  • Actions: weapon-specific attacks with wind-up → strike → follow-through, two-handed aiming for long guns,
    guard pose for blocking, tucked dodge roll, flinch when hit, swimming strokes in water.
  • Zombies: an uneven shamble — one stiff dragging leg, lolling head, arms reaching, lurching torso.
*/
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const TWO_HANDED = { rifle: 1, shotgun: 1, crossbow: 1 };
const HEAVY = { bat: 1, axe: 1 };

export function animateHuman(h, dt, speed, o = {}) {
  const { zombie = false, attack = 0, aim = false, roll = 0, block = false, stagger = 0, swim = false, sprint = false, hurt = 0, combo = 0 } = o;
  const p = h.userData.parts, A = h.userData.anim || (h.userData.anim = { turn: 0, lastRot: null, hurt: 0, breath: 0, look: 0, lookT: 0 });
  const wpn = o.weapon ?? A.wpn;
  // turning rate (for leaning into turns)
  const rot = h.rotation.y;
  if (A.lastRot !== null) { let dr = rot - A.lastRot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); A.turn = lerp(A.turn, dt > 0 ? dr / dt : 0, Math.min(1, dt * 8)); }
  A.lastRot = rot;
  const run = Math.min(1, Math.max(0, (speed - 0.55) / 0.45));           // 0 walk … 1 sprint
  const move = Math.min(1, speed * 1.6);
  h.userData.phase += dt * (zombie ? 3 + speed * 9 : 4.5 + speed * 8.5);
  const ph = h.userData.phase, s = Math.sin(ph), c = Math.cos(ph);
  A.breath += dt * (1.6 + run * 2.5);

  // reset the pose we drive every frame
  p.body.position.set(0, 0.8, 0); p.body.rotation.set(0, 0, 0);
  p.torso.rotation.set(0, 0, 0); p.torso.scale.set(1, 1, 1); p.head.rotation.set(0, 0, 0);
  for (const k of ['armL', 'armR', 'legL', 'legR', 'foreL', 'foreR', 'shinL', 'shinR']) p[k].rotation.set(0, 0, 0);

  if (zombie) {   // ---------- shamble
    const drag = Math.sin(ph * 0.5) * 0.5 + 0.5;
    p.legL.rotation.x = s * 0.55 * move; p.shinL.rotation.x = Math.max(0, -c) * 0.7 * move;
    p.legR.rotation.x = -s * 0.35 * move; p.shinR.rotation.x = 0.1;                       // the stiff leg
    p.body.position.y = 0.8 + Math.abs(c) * 0.06 * move - drag * 0.03;
    p.body.rotation.z = Math.sin(ph * 0.5) * 0.09; p.body.position.x = Math.sin(ph * 0.5) * 0.04;
    p.torso.rotation.x = 0.22 + Math.sin(ph * 0.5) * 0.05; p.torso.rotation.y = s * 0.12;
    p.head.rotation.z = 0.3 + Math.sin(ph * 0.37) * 0.15; p.head.rotation.x = 0.12 + Math.sin(ph * 0.23) * 0.1;
    p.armL.rotation.x = -1.25 + Math.sin(ph * 0.7) * 0.18; p.foreL.rotation.x = -0.25 + Math.sin(ph * 0.9) * 0.15;
    p.armR.rotation.x = -1.1 + Math.cos(ph * 0.6) * 0.2 - attack * 0.8; p.foreR.rotation.x = -0.45 + attack * 0.4;
    p.armL.rotation.z = 0.12; p.armR.rotation.z = -0.15;
    if (attack > 0) { p.torso.rotation.x += Math.sin(attack * Math.PI) * 0.35; p.armL.rotation.x -= attack * 0.6; }
    if (stagger > 0) { p.torso.rotation.x = -0.35; p.head.rotation.x = -0.5; p.armL.rotation.x = -0.4; p.armR.rotation.x = -0.3; p.body.position.z = -0.05; }
    return;
  }

  // ---------- legs: walk / run cycle
  const swing = lerp(0.48, 0.95, run) * move;
  p.legL.rotation.x = s * swing; p.legR.rotation.x = -s * swing;
  const kneeAmt = lerp(0.75, 1.5, run) * move;
  p.shinL.rotation.x = Math.max(0, -c) * kneeAmt + Math.max(0, s) * 0.12 * move;      // knee bends while the leg swings forward
  p.shinR.rotation.x = Math.max(0, c) * kneeAmt + Math.max(0, -s) * 0.12 * move;
  // pelvis: bob twice per step, sway toward the standing leg, rotate with the stride
  p.body.position.y = 0.8 - 0.035 * move + Math.abs(c) * lerp(0.04, 0.09, run) * move;
  p.body.position.x = s * 0.025 * move * (1 - run);
  p.body.rotation.y = s * 0.12 * move;
  // torso: counter-rotate shoulders, lean forward with speed, lean into turns
  p.torso.rotation.y = -s * lerp(0.14, 0.22, run) * move;
  p.torso.rotation.x = lerp(0.03, 0.26, run) * move;
  p.body.rotation.z = Math.max(-0.22, Math.min(0.22, -A.turn * 0.05 * (0.3 + speed)));
  // arms: swing opposite the legs, elbows bend more when running
  const aSwing = lerp(0.45, 0.95, run) * move;
  p.armL.rotation.x = -s * aSwing; p.armR.rotation.x = s * aSwing;
  p.foreL.rotation.x = -lerp(0.2, 1.25, run) - Math.max(0, s) * 0.3 * move;
  p.foreR.rotation.x = -lerp(0.2, 1.25, run) - Math.max(0, -s) * 0.3 * move;
  p.armL.rotation.z = 0.08 + run * 0.1; p.armR.rotation.z = -0.08 - run * 0.1;
  // ---------- idle life: breathing, weight shift, glancing
  if (move < 0.15) {
    const idle = 1 - move / 0.15, shift = Math.sin(A.breath * 0.23);
    p.torso.scale.y = 1 + Math.sin(A.breath) * 0.012 * idle;
    p.body.position.x += shift * 0.03 * idle; p.body.rotation.z += shift * 0.03 * idle;
    p.legL.rotation.z = -0.03 + shift * 0.03 * idle; p.legR.rotation.z = 0.03 + shift * 0.03 * idle;
    p.shinL.rotation.x += Math.max(0, shift) * 0.12 * idle; p.shinR.rotation.x += Math.max(0, -shift) * 0.12 * idle;
    A.lookT -= dt; if (A.lookT <= 0) { A.lookT = 2 + Math.random() * 4; A.look = (Math.random() - 0.5) * 1.1; }
    p.head.rotation.y = lerp(p.head.rotation.y, A.look, 0.5) * idle;
    p.armL.rotation.x += Math.sin(A.breath * 0.5) * 0.03; p.foreL.rotation.x -= 0.15; p.foreR.rotation.x -= 0.15;
  }
  // ---------- swimming: body forward, breaststroke arms, frog kick
  if (swim) {
    const st = Math.sin(ph * 0.7);
    p.torso.rotation.x = 0.9; p.body.position.y = 0.5;
    p.armL.rotation.x = -2.4 + st * 0.6; p.armR.rotation.x = -2.4 + st * 0.6; p.armL.rotation.z = 0.4 + st * 0.5; p.armR.rotation.z = -0.4 - st * 0.5;
    p.foreL.rotation.x = -0.6 - st * 0.4; p.foreR.rotation.x = -0.6 - st * 0.4;
    p.legL.rotation.x = 0.9 + st * 0.3; p.legR.rotation.x = 0.9 - st * 0.3; p.shinL.rotation.x = 0.6 + Math.max(0, st); p.shinR.rotation.x = 0.6 + Math.max(0, -st);
  }
  // ---------- aiming
  if (aim) {
    p.torso.rotation.y += 0.15; p.head.rotation.y = -0.15; p.torso.rotation.x *= 0.5;
    if (TWO_HANDED[wpn]) {   // stock to shoulder, support hand under the barrel
      p.armR.rotation.x = -1.3; p.armR.rotation.z = 0.2; p.foreR.rotation.x = -0.28; p.foreR.rotation.y = 0.15;
      p.armL.rotation.x = -1.2; p.armL.rotation.z = -0.6; p.foreL.rotation.x = -0.55;
    } else {                 // pistol: one straight arm, the other hand cups it
      p.armR.rotation.x = -1.5; p.foreR.rotation.x = -0.08;
      p.armL.rotation.x = -1.3; p.armL.rotation.z = -0.5; p.foreL.rotation.x = -0.5;
    }
  }
  // ---------- melee: wind-up → strike → follow-through, different per weapon
  if (attack > 0) {
    const t = 1 - Math.min(1, attack);                                   // 0 → 1 through the swing
    const wind = t < 0.28 ? ease(t / 0.28) : 1 - ease(Math.min(1, (t - 0.28) / 0.2));
    const strike = t < 0.28 ? 0 : ease(Math.min(1, (t - 0.28) / 0.2));
    const back = t > 0.5 ? 1 - (t - 0.5) / 0.5 : 1;                      // recover
    if (!wpn || wpn === 'fists') {                                       // jab / cross, alternating
      const R = combo % 2 === 0, arm = R ? p.armR : p.armL, fore = R ? p.foreR : p.foreL;
      arm.rotation.x = lerp(-0.6, -1.55, strike) * back - wind * 0.2; fore.rotation.x = lerp(-1.6, -0.05, strike * back);
      p.torso.rotation.y += (R ? 1 : -1) * (-0.35 * strike + 0.2 * wind) * back;
      p.legL.rotation.x += 0.2 * strike * back;
    } else if (wpn === 'spear') {                                        // two-handed thrust
      p.armR.rotation.x = lerp(-0.9, -1.6, strike) * back; p.foreR.rotation.x = lerp(-1.4, -0.1, strike * back);
      p.armL.rotation.x = lerp(-0.8, -1.4, strike) * back; p.foreL.rotation.x = -0.8;
      p.torso.rotation.x += 0.15 * strike * back; p.body.position.z = 0.15 * strike * back;
    } else if (wpn === 'katana' || wpn === 'machete') {                 // diagonal slash from over the shoulder
      p.armR.rotation.x = lerp(-2.6, -0.4, strike) * (wind > 0 ? 1 : back) - wind * 0.3; p.armR.rotation.z = lerp(-0.9, 0.6, strike);
      p.foreR.rotation.x = -0.5 * (1 - strike);
      p.torso.rotation.y += lerp(-0.6, 0.55, strike) * back; p.armL.rotation.x = -0.6 * back;
    } else {                                                             // bat / axe: big two-handed swing
      const heavy = HEAVY[wpn] ? 1 : 0.8;
      p.torso.rotation.y += (wind * -0.85 + strike * 0.9) * back * heavy;
      p.armR.rotation.x = (-2.3 * wind + lerp(-2.3, -0.9, strike) * (1 - wind)) * back; p.armR.rotation.z = -0.4 * wind + 0.5 * strike;
      p.foreR.rotation.x = -1.1 * wind - 0.2;
      p.armL.rotation.x = p.armR.rotation.x * 0.9; p.armL.rotation.z = 0.6; p.foreL.rotation.x = -1.2;
      p.legL.rotation.x += 0.25 * strike * back; p.legR.rotation.x -= 0.15 * strike * back;
      p.body.rotation.y += 0.2 * strike * back;
    }
    if (combo === 0 && attack > 1) p.body.position.y -= 0.05;            // finisher: a deeper step-in
  }
  // ---------- guard
  if (block) {
    p.armL.rotation.x = -1.35; p.armR.rotation.x = -1.35; p.armL.rotation.z = -0.35; p.armR.rotation.z = 0.35;
    p.foreL.rotation.x = -1.4; p.foreR.rotation.x = -1.4; p.torso.rotation.x = 0.18; p.head.rotation.x = 0.15;
    p.shinL.rotation.x += 0.35; p.shinR.rotation.x += 0.35; p.legL.rotation.x -= 0.2; p.legR.rotation.x -= 0.15; p.body.position.y -= 0.06;
  }
  // ---------- dodge roll: tuck tight and flip
  if (roll > 0) {
    const tuck = Math.sin(roll * Math.PI);
    p.body.rotation.x = roll * Math.PI * 2; p.body.position.y = 0.8 - tuck * 0.35;
    p.legL.rotation.x = p.legR.rotation.x = -1.4 * tuck; p.shinL.rotation.x = p.shinR.rotation.x = 2.0 * tuck;
    p.armL.rotation.x = p.armR.rotation.x = -1.2 * tuck; p.foreL.rotation.x = p.foreR.rotation.x = -1.6 * tuck;
    p.torso.rotation.x = 0.6 * tuck; p.head.rotation.x = 0.5 * tuck;
  }
  // ---------- hit flinch / stagger
  const fl = Math.max(hurt * 3, stagger > 0 ? 0.8 : 0);
  if (fl > 0) { p.torso.rotation.x -= 0.35 * fl; p.head.rotation.x -= 0.4 * fl; p.armL.rotation.x -= 0.3 * fl; p.armR.rotation.x -= 0.3 * fl; p.body.position.z = -0.06 * fl; }
}
