import * as THREE from '../lib/three.module.min.js';

/*
  ANIME CEL-SHADED LOOK
  • toon(): flat 3-band shading (light / mid / shadow) instead of smooth lighting
  • Outline: a post-process pass that draws ink lines wherever depth jumps (silhouettes)
  • Sky: painted gradient dome with sun, puffy clouds and stars
*/

/* ---------- Toon materials ---------- */
const gradient = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]); // shadow / mid / light
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
const cache = new Map();
export function toon(color = 0xffffff, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const { unique, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...rest });
  if (!opts.unique) cache.set(key, m);
  return m;
}

/* ---------- Outline post-process ---------- */
export class Outline {
  constructor(renderer) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: ('ontouchstart' in window) ? 2 : 4 });
    this.rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        near: { value: 0.1 }, far: { value: 600 }, px: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
        ink: { value: new THREE.Color(0x1a1420) }, night: { value: 0 }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform float near; uniform float far;
        uniform vec2 px; uniform vec3 ink; uniform float night; varying vec2 vUv;
        float lin(vec2 uv){ float d = texture2D(tDepth, uv).x; return (near * far) / (far - d * (far - near)); }
        void main(){
          vec4 c = texture2D(tColor, vUv);
          float D = lin(vUv);
          float w = clamp(1.6 - D / 60.0, 0.8, 1.6);            // thicker lines up close
          float e = 0.0;
          e = max(e, abs(lin(vUv + vec2(px.x * w, 0.0)) - D));
          e = max(e, abs(lin(vUv - vec2(px.x * w, 0.0)) - D));
          e = max(e, abs(lin(vUv + vec2(0.0, px.y * w)) - D));
          e = max(e, abs(lin(vUv - vec2(0.0, px.y * w)) - D));
          float edge = smoothstep(0.035, 0.09, e / D) * (1.0 - smoothstep(70.0, 170.0, D));
          // anime grade: a little more saturation and contrast
          float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          vec3 col = mix(vec3(l), c.rgb, 1.12);
          col = (col - 0.5) * 1.06 + 0.5;
          col = mix(col, ink * (0.6 + night), edge * 0.92);
          gl_FragColor = vec4(max(col, 0.0), 1.0);
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(s.x, s.y); this.mat.uniforms.px.value.set(1 / s.x, 1 / s.y);
  }
  render(scene, camera) {
    this.mat.uniforms.near.value = camera.near; this.mat.uniforms.far.value = camera.far;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}

/* ---------- Sky dome, sun, clouds, stars ---------- */
export function createSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d8ef0) }, horizon: { value: new THREE.Color(0xc4ecff) }, sunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, sunCol: { value: new THREE.Color(0xfff2d9) }, sunVis: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunVis; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, smoothstep(0.0, 0.55, h));
        float s = dot(normalize(vDir), normalize(sunDir));
        c += sunCol * (smoothstep(0.9975, 0.998, s) * 1.2 + pow(max(s, 0.0), 40.0) * 0.35) * sunVis;   // hard disc + soft glow
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 16), mat);
  dome.renderOrder = -1; dome.frustumCulled = false;
  scene.add(dome);

  // Puffy anime clouds
  const clouds = new THREE.Group();
  const cMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient, fog: false, emissive: 0x6f7f99, emissiveIntensity: 0.6 });
  const ball = new THREE.IcosahedronGeometry(1, 2);
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(ball, cMat);
      const r = 9 + Math.random() * 9;
      m.scale.set(r, r * 0.7, r);
      m.position.set((j - n / 2) * 11 + Math.random() * 5, Math.random() * 5 + (j === Math.floor(n / 2) ? 6 : 0), Math.random() * 8);
      c.add(m);
    }
    const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 230;
    c.position.set(Math.sin(a) * d, 120 + Math.random() * 60, Math.cos(a) * d);
    c.rotation.y = Math.random() * 6;
    clouds.add(c);
  }
  scene.add(clouds);

  // Stars
  const sp = [];
  for (let i = 0; i < 900; i++) {
    const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) + 0.05; v.normalize().multiplyScalar(500);
    sp.push(v.x, v.y, v.z);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const sMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, sMat);
  scene.add(stars);

  return {
    dome, clouds, stars, mat, cMat, sMat,
    // follow the camera so the sky is always "infinitely" far
    update(camera, dt) {
      dome.position.copy(camera.position); stars.position.copy(camera.position);
      clouds.position.x = camera.position.x * 0.9; clouds.position.z = camera.position.z * 0.9;
      clouds.rotation.y += dt * 0.004;
    }
  };
}

/* ---------- Merge simple geometries into one (trees, characters) ---------- */
// Paint a geometry one colour (stored per vertex, so many colours can share one material).
export function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function merge(geos) {
  const parts = geos.map(g => g.index ? g.toNonIndexed() : g);
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const withColor = parts.some(g => g.attributes.color);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = withColor ? new Float32Array(count * 3).fill(1) : null;
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (col && g.attributes.color) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
