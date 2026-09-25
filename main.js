import * as THREE from 'three';
import { io } from '/socket.io/socket.io.esm.min.js';
import {
  SAFE_Z, ZONE_LEN, CORRIDOR_HALF, PLAZA_HALF_X, PLAZA_MIN_Z, MAX_PLAYERS, SELL_POS, FUSE_POS,
  ZONES, EGGS, PETS, RARITY_COLORS, petValue, zoneStart, zoneEnd, nestZ, WORLD_END_Z,
  walkSpeed, SLOW_MULT, CARRY_MULT, SHOP, clampMove, PLOT, plotCenter, insidePlot, nestPos, fmt, fmtTime,
  TREADMILL, treadmillPos, onTreadmill, treadBoardPos, PET_FUSE_POS, petFuseResult, RARITY_ORDER,
  REBIRTH, PASSES, MAX_NESTS_WITH_PASS,
} from '/config.js';

// =====================================================================
// Renderer
// =====================================================================
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const DAY_SKY = new THREE.Color('#8fd3ff'), NIGHT_SKY = new THREE.Color('#141c40');
const scene = new THREE.Scene();
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(DAY_SKY.clone(), 140, 380);

// ---- sky: gradient dome, blocky clouds, stars at night ----
const skyUniforms = {
  top: { value: new THREE.Color('#3f9cf0') }, bottom: { value: new THREE.Color('#cdeeff') },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
  }),
);
scene.add(sky);
const SKY = { dayTop: new THREE.Color('#3f9cf0'), dayBottom: new THREE.Color('#cdeeff'), nightTop: new THREE.Color('#070b24'), nightBottom: new THREE.Color('#1c2a5c') };
const stars = (() => {
  const pos = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, y = 0.15 + Math.random() * 0.85, r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(a) * r * 650, y * 650, Math.sin(a) * r * 650);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(m); return m;
})();
const clouds = [];
(() => {
  const cm = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, fog: false });
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(12 + Math.random() * 14, 5 + Math.random() * 4, 10 + Math.random() * 8), cm);
      b.position.set(k * 9 - n * 4.5, Math.random() * 3, (Math.random() - 0.5) * 8);
      c.add(b);
    }
    c.position.set((Math.random() - 0.5) * 700, 110 + Math.random() * 60, -250 + Math.random() * 2400);
    c.userData.speed = 2 + Math.random() * 3;
    scene.add(c); clouds.push(c);
  }
})();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 800);

const hemi = new THREE.HemisphereLight('#eaf6ff', '#4c8a3a', 1.15);
const sun = new THREE.DirectionalLight('#fff3d6', 1.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 220 });
sun.shadow.bias = -0.0005;
scene.add(hemi, sun, sun.target);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const matCache = {};
const mat = (color, opts) => {
  const key = color + (opts ? JSON.stringify(opts) : '');
  return matCache[key] || (matCache[key] = new THREE.MeshLambertMaterial({ color, ...opts }));
};
const box = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = o.receiveShadow = true; return o; };
const shade = (c, l) => '#' + new THREE.Color(c).offsetHSL(0, 0, l).getHexString();

// =====================================================================
// Lego-stud textures
// =====================================================================
const texCache = {};
function studTex(c1, c2 = c1, repX = 1, repY = 1) {
  const key = `${c1}|${c2}`;
  let base = texCache[key];
  if (!base) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    for (let qx = 0; qx < 2; qx++) for (let qy = 0; qy < 2; qy++) {
      const col = (qx + qy) % 2 ? c2 : c1;
      g.fillStyle = col; g.fillRect(qx * 128, qy * 128, 128, 128);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const x = qx * 128 + 16 + i * 32, y = qy * 128 + 16 + j * 32;
        g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(x + 1.5, y + 2.5, 10, 0, 7); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(x - 2.5, y - 2.5, 6, 0, 7); g.fill();
      }
    }
    base = texCache[key] = new THREE.CanvasTexture(cv);
    base.colorSpace = THREE.SRGBColorSpace;
    base.anisotropy = 8;
  }
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.needsUpdate = true;
  return t;
}
const studMat = (c1, c2, w, h, glow = 0) => new THREE.MeshLambertMaterial({ map: studTex(c1, c2, w / 16, h / 16), emissive: c1, emissiveIntensity: glow });

// =====================================================================
// Text labels
// =====================================================================
const allLabels = [];
function makeLabel(text, opts = {}) {
  const c = document.createElement('canvas');
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.userData = { c, opts, tex: null, text: null };
  setLabel(sprite, text);
  if (!opts.temp) allLabels.push(sprite);
  return sprite;
}
function setLabel(sprite, text) {
  if (sprite.userData.text === text) return;
  sprite.userData.text = text;
  const { c, opts } = sprite.userData;
  const size = opts.size || 40;
  const font = `700 ${size}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
  const ctx = c.getContext('2d');
  ctx.font = font;
  const lines = String(text).split('\n');
  const w = Math.max(8, Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 0.7));
  const h = Math.ceil(lines.length * size * 1.12 + size * 0.4);
  if (c.width !== w || c.height !== h || !sprite.userData.tex) {
    c.width = w; c.height = h;
    sprite.userData.tex?.dispose();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    sprite.userData.tex = tex;
    sprite.material.map = tex;
    sprite.material.needsUpdate = true;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  lines.forEach((l, i) => {
    const y = size * 0.2 + (i + 0.5) * size * 1.12;
    ctx.lineWidth = size * 0.22; ctx.strokeStyle = opts.stroke || '#15171c';
    ctx.strokeText(l, w / 2, y);
    const col = i === 0 ? opts.color : opts.color2;
    if (col === 'cyan') {
      const gr = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      gr.addColorStop(0, '#7ff3ff'); gr.addColorStop(1, '#2d8cff');
      ctx.fillStyle = gr;
    } else ctx.fillStyle = col || '#ffffff';
    ctx.fillText(l, w / 2, y);
  });
  sprite.userData.tex.needsUpdate = true;
  const s = (opts.scale || 1) * 0.03;
  sprite.scale.set(w * s, h * s, 1);
}
document.fonts?.ready.then(() => allLabels.forEach((l) => { const t = l.userData.text; l.userData.text = null; setLabel(l, t); }));

// =====================================================================
// Creatures (pets + guardians) — all face +z, about 1.6 tall at scale 1
// =====================================================================
function eyes(g, y, z, spread, size = 0.13) {
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.3, 0.05), mat('#111111'));
    e.position.set(s * spread, y, z);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(size * 0.4, size * 0.4, 0.06), mat('#ffffff'));
    hl.position.set(s * spread - size * 0.15, y + size * 0.25, z + 0.01);
    g.add(e, hl);
  }
}
function makeCreature(kind, color, accent) {
  const g = new THREE.Group();
  const body = mat(color), acc = mat(accent), white = mat('#ffffff'), dark = mat('#1d1f26');
  const legs = [];
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const sph = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); o.scale.set(sx, sy, sz); return o; };
  const bx = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cone = (r, h, m, seg = 8) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  const cyl = (r1, r2, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), m);
  const leg4 = (w, h, xs, zf, zb, m = body) => { for (const sx of [-1, 1]) for (const z of [zf, zb]) legs.push(add(bx(w, h, w, m), sx * xs, h / 2, z)); };

  switch (kind) {
    case 'bird': {
      add(sph(0.62, body, 1, 0.85, 1.25), 0, 0.85, 0);
      add(cyl(0.16, 0.22, 0.8, body), 0, 1.35, 0.45).rotation.x = 0.35;
      add(sph(0.33, body), 0, 1.75, 0.62);
      add(cone(0.13, 0.42, acc), 0, 1.7, 1.02).rotation.x = Math.PI / 2;
      eyes(g, 1.82, 0.93, 0.15, 0.09);
      for (const s of [-1, 1]) {
        add(bx(0.12, 0.45, 0.8, body), s * 0.6, 0.9, -0.05).rotation.z = s * 0.2;
        legs.push(add(bx(0.1, 0.4, 0.1, acc), s * 0.22, 0.2, 0.05));
        add(bx(0.25, 0.06, 0.3, acc), s * 0.22, 0.03, 0.15);
      }
      add(cone(0.25, 0.5, body, 6), 0, 1.0, -0.75).rotation.x = -Math.PI / 2.6;
      break;
    }
    case 'bunny': {
      add(sph(0.6, body, 1, 0.9, 1.05), 0, 0.62, 0);
      add(sph(0.45, body), 0, 1.3, 0.3);
      for (const s of [-1, 1]) {
        const ear = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.65, 4, 8), body), s * 0.18, 2.0, 0.2); ear.rotation.z = s * -0.15;
        add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), acc), s * 0.18, 2.0, 0.28).rotation.z = s * -0.15;
        legs.push(add(sph(0.2, body, 1, 0.6, 1.4), s * 0.3, 0.12, 0.3));
      }
      add(sph(0.08, acc), 0, 1.25, 0.74);
      add(sph(0.22, white), 0, 0.65, -0.62);
      eyes(g, 1.38, 0.72, 0.18, 0.1);
      break;
    }
    case 'slime': {
      const m = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.88 });
      add(sph(0.78, m, 1, 0.75, 1), 0, 0.58, 0);
      add(sph(0.3, m), 0, 1.15, -0.05);
      add(sph(0.14, acc), 0.35, 1.0, 0.45);
      eyes(g, 0.72, 0.76, 0.22, 0.14);
      add(bx(0.22, 0.05, 0.05, dark), 0, 0.5, 0.77);
      break;
    }
    case 'cat': case 'fox': {
      const fox = kind === 'fox';
      add(bx(0.8, 0.65, 1.25, body), 0, 0.75, -0.1);
      add(bx(0.78, 0.7, 0.7, body), 0, 1.3, 0.55);
      add(bx(fox ? 0.5 : 0.34, fox ? 0.3 : 0.24, fox ? 0.4 : 0.12, fox ? acc : acc), 0, 1.15, fox ? 1.0 : 0.92);
      if (fox) add(bx(0.6, 0.5, 0.1, acc), 0, 0.75, 0.52);
      for (const s of [-1, 1]) add(cone(fox ? 0.2 : 0.16, fox ? 0.5 : 0.34, fox ? body : acc, 4), s * 0.25, fox ? 1.87 : 1.78, 0.55).rotation.y = Math.PI / 4;
      leg4(0.2, 0.45, 0.27, 0.3, -0.5);
      if (fox) { const t = add(sph(0.3, body, 1, 1, 2.2), 0, 0.95, -1.1); t.rotation.x = 0.6; add(sph(0.2, acc), 0, 1.35, -1.55); }
      else add(bx(0.16, 0.16, 0.8, acc), 0, 1.05, -0.95).rotation.x = 0.7;
      eyes(g, 1.38, 0.91, 0.18, 0.11);
      break;
    }
    case 'dog': {
      add(bx(0.85, 0.7, 1.3, body), 0, 0.8, -0.1);
      add(bx(0.75, 0.7, 0.75, body), 0, 1.35, 0.65);
      add(bx(0.42, 0.32, 0.38, acc), 0, 1.2, 1.12);
      add(bx(0.16, 0.12, 0.1, dark), 0, 1.33, 1.32);
      for (const s of [-1, 1]) add(bx(0.18, 0.55, 0.35, acc), s * 0.46, 1.35, 0.6).rotation.z = s * 0.2;
      leg4(0.22, 0.5, 0.28, 0.3, -0.5);
      add(bx(0.14, 0.14, 0.6, body), 0, 1.3, -0.85).rotation.x = -0.8;
      eyes(g, 1.48, 1.02, 0.18, 0.11);
      break;
    }
    case 'lizard': {
      add(bx(0.75, 0.42, 1.5, body), 0, 0.45, 0);
      add(bx(0.62, 0.4, 0.72, body), 0, 0.55, 1.0);
      add(bx(0.3, 0.26, 1.2, body), 0, 0.4, -1.25).rotation.x = 0.12;
      for (const s of [-1, 1]) {
        legs.push(add(bx(0.45, 0.16, 0.2, body), s * 0.5, 0.2, 0.5), add(bx(0.45, 0.16, 0.2, body), s * 0.5, 0.2, -0.5));
        add(sph(0.12, white), s * 0.22, 0.8, 1.2);
        add(sph(0.06, dark), s * 0.22, 0.82, 1.3);
      }
      for (let i = 0; i < 3; i++) add(cone(0.1, 0.25, acc, 4), 0, 0.78, 0.4 - i * 0.45);
      break;
    }
    case 'dragon': {
      add(bx(0.9, 0.8, 1.4, body), 0, 0.9, 0);
      add(bx(0.5, 0.5, 0.7, body), 0, 1.5, 0.75).rotation.x = -0.5;
      add(bx(0.7, 0.6, 0.8, body), 0, 1.95, 1.05);
      add(bx(0.5, 0.25, 0.35, body), 0, 1.82, 1.55);
      for (const s of [-1, 1]) {
        add(cone(0.1, 0.45, acc, 6), s * 0.22, 2.4, 0.9).rotation.x = -0.4;
        add(bx(1.1, 0.08, 0.8, acc), s * 0.95, 1.45, -0.1).rotation.z = s * 0.45;
      }
      leg4(0.25, 0.55, 0.3, 0.4, -0.4);
      add(bx(0.3, 0.3, 1.2, body), 0, 0.75, -1.1).rotation.x = 0.3;
      add(bx(0.5, 0.1, 0.5, acc), 0, 0.72, -1.7);
      eyes(g, 2.05, 1.46, 0.2, 0.11);
      break;
    }
    case 'frog': {
      add(sph(0.72, body, 1.05, 0.6, 1), 0, 0.45, 0);
      for (const s of [-1, 1]) {
        add(sph(0.22, body), s * 0.32, 0.88, 0.35);
        add(sph(0.14, white), s * 0.32, 0.95, 0.5);
        add(sph(0.07, dark), s * 0.32, 0.97, 0.62);
        legs.push(add(bx(0.35, 0.14, 0.6, body), s * 0.6, 0.12, -0.2));
        add(bx(0.2, 0.1, 0.25, acc), s * 0.55, 0.06, 0.45);
      }
      add(bx(0.55, 0.05, 0.05, acc), 0, 0.5, 0.7);
      break;
    }
    case 'penguin': {
      add(sph(0.62, body, 0.9, 1.25, 0.85), 0, 0.85, 0);
      add(sph(0.48, white, 0.85, 1.1, 0.5), 0, 0.8, 0.28);
      add(sph(0.4, body), 0, 1.7, 0.05);
      add(cone(0.1, 0.35, acc), 0, 1.66, 0.5).rotation.x = Math.PI / 2;
      eyes(g, 1.78, 0.38, 0.14, 0.09);
      for (const s of [-1, 1]) {
        add(bx(0.1, 0.7, 0.35, body), s * 0.58, 0.95, 0).rotation.z = s * 0.3;
        legs.push(add(bx(0.22, 0.08, 0.35, acc), s * 0.2, 0.04, 0.2));
      }
      break;
    }
    case 'bear': {
      add(sph(0.7, body, 1, 0.95, 1.1), 0, 0.8, 0);
      add(sph(0.5, body), 0, 1.6, 0.3);
      add(sph(0.22, acc, 1, 0.8, 1), 0, 1.5, 0.72);
      add(sph(0.07, dark), 0, 1.56, 0.9);
      for (const s of [-1, 1]) {
        add(sph(0.17, body), s * 0.35, 2.02, 0.25);
        add(sph(0.09, acc), s * 0.35, 2.03, 0.33);
        legs.push(add(sph(0.22, body, 1, 1.3, 1), s * 0.35, 0.25, 0.35), add(sph(0.22, body, 1, 1.3, 1), s * 0.35, 0.25, -0.35));
      }
      eyes(g, 1.72, 0.76, 0.18, 0.1);
      break;
    }
    case 'monkey': {
      add(sph(0.55, body, 1, 1.1, 0.9), 0, 0.95, 0);
      add(sph(0.45, body), 0, 1.75, 0.1);
      add(sph(0.32, acc, 1, 0.9, 0.6), 0, 1.68, 0.4);
      add(sph(0.35, acc, 0.9, 1.1, 0.6), 0, 0.95, 0.35);
      for (const s of [-1, 1]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), acc), s * 0.46, 1.8, 0.05).rotation.z = Math.PI / 2;
        legs.push(add(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), body), s * 0.6, 0.85, 0.1));
        add(sph(0.18, body, 1, 1.4, 1), s * 0.25, 0.28, 0.1);
      }
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 14, Math.PI * 1.5), body);
      add(tail, 0, 0.9, -0.6).rotation.y = Math.PI / 2;
      eyes(g, 1.82, 0.52, 0.14, 0.09);
      break;
    }
    case 'pig': {
      add(sph(0.65, body, 0.95, 0.85, 1.2), 0, 0.72, 0);
      add(sph(0.45, body), 0, 1.0, 0.72);
      add(cyl(0.18, 0.18, 0.15, acc), 0, 0.95, 1.17).rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        add(sph(0.035, dark), s * 0.07, 0.95, 1.25);
        add(cone(0.14, 0.3, acc, 4), s * 0.26, 1.42, 0.6).rotation.x = 0.3;
      }
      leg4(0.2, 0.35, 0.3, 0.35, -0.4);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 6, 10), acc), 0, 0.85, -0.8);
      eyes(g, 1.15, 1.1, 0.17, 0.09);
      break;
    }
    case 'turtle': {
      add(sph(0.8, acc, 1, 0.55, 1.1), 0, 0.45, 0);
      for (let i = 0; i < 5; i++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 6), body), Math.cos(i * 1.26) * 0.38, 0.88, Math.sin(i * 1.26) * 0.42);
      add(sph(0.3, body), 0, 0.5, 0.95);
      for (const s of [-1, 1]) legs.push(add(sph(0.18, body, 1.2, 0.6, 1.4), s * 0.6, 0.2, 0.5), add(sph(0.18, body, 1.2, 0.6, 1.4), s * 0.6, 0.2, -0.5));
      eyes(g, 0.58, 1.22, 0.13, 0.08);
      break;
    }
    case 'crab': {
      add(sph(0.62, body, 1.3, 0.55, 0.95), 0, 0.6, 0);
      for (const s of [-1, 1]) {
        add(cyl(0.05, 0.05, 0.4, body), s * 0.22, 1.0, 0.35);
        add(sph(0.12, white), s * 0.22, 1.22, 0.38);
        add(sph(0.06, dark), s * 0.22, 1.24, 0.47);
        add(bx(0.2, 0.2, 0.55, body), s * 0.85, 0.6, 0.55).rotation.y = s * 0.4;
        const claw = add(sph(0.3, body, 1, 0.8, 1.2), s * 1.05, 0.7, 0.95);
        add(bx(0.12, 0.08, 0.3, acc), s * 1.05, 0.72, 1.25);
        void claw;
        for (let k = 0; k < 3; k++) {
          const l = add(bx(0.55, 0.08, 0.08, body), s * 0.85, 0.35, -0.3 + k * 0.28);
          l.rotation.z = s * -0.6; legs.push(l);
        }
      }
      break;
    }
    case 'owl': {
      add(sph(0.62, body, 0.95, 1.15, 0.9), 0, 0.85, 0);
      add(sph(0.42, acc, 0.8, 1, 0.4), 0, 0.75, 0.38);
      for (const s of [-1, 1]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), white), s * 0.22, 1.25, 0.5).rotation.x = Math.PI / 2;
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12), dark), s * 0.22, 1.25, 0.53).rotation.x = Math.PI / 2;
        add(cone(0.12, 0.35, body, 4), s * 0.35, 1.72, 0);
        add(bx(0.1, 0.6, 0.5, body), s * 0.6, 0.85, -0.05).rotation.z = s * 0.15;
        legs.push(add(bx(0.18, 0.12, 0.25, acc), s * 0.2, 0.06, 0.15));
      }
      add(cone(0.08, 0.2, acc, 4), 0, 1.08, 0.58).rotation.x = Math.PI / 1.6;
      break;
    }
    case 'snake': {
      for (let i = 0; i < 6; i++) {
        const r = 0.34 - i * 0.03;
        const seg = add(sph(r, i % 2 ? acc : body), Math.sin(i * 1.1) * 0.35, r, -i * 0.5);
        legs.push(seg);
      }
      add(cyl(0.3, 0.34, 0.8, body), 0, 0.6, 0.3).rotation.x = -0.3;
      add(sph(0.38, body, 1.1, 0.8, 1.3), 0, 1.05, 0.55);
      add(bx(0.06, 0.03, 0.35, mat('#ff3a3a')), 0, 0.95, 1.05);
      eyes(g, 1.17, 1.02, 0.18, 0.1);
      break;
    }
    case 'unicorn': {
      add(bx(0.75, 0.75, 1.4, body), 0, 1.15, 0);
      add(bx(0.45, 0.8, 0.45, body), 0, 1.75, 0.65).rotation.x = -0.4;
      add(bx(0.45, 0.45, 0.8, body), 0, 2.15, 0.95);
      add(cone(0.08, 0.6, acc), 0, 2.6, 1.05).rotation.x = 0.4;
      add(bx(0.15, 0.7, 0.5, acc), 0, 2.0, 0.45).rotation.x = -0.4;
      add(bx(0.18, 0.7, 0.2, acc), 0, 1.1, -0.8).rotation.x = 0.4;
      leg4(0.2, 0.8, 0.25, 0.5, -0.5);
      eyes(g, 2.25, 1.36, 0.2, 0.1);
      break;
    }
    default: { // round critter
      add(sph(0.7, body), 0, 0.7, 0);
      eyes(g, 0.85, 0.66, 0.2, 0.12);
    }
  }
  g.userData.legs = legs;
  return g;
}

function animateCreature(g, moving, t, dt) {
  const legs = g.userData.legs || [];
  legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 12 + i * Math.PI) * 0.6 : 0; });
}

// =====================================================================
// Eggs & nests
// =====================================================================
const eggMats = {};
function eggMat(type) {
  if (eggMats[type]) return eggMats[type];
  const e = EGGS[type];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  let seed = type.length * 97 + type.charCodeAt(0);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pat = e.pattern || 'spots';
  if (pat === 'rainbow') {
    const cols = ['#ff4f5a', '#ff9a2e', '#ffe03a', '#5cd15a', '#3fa7ff', '#a45cff'];
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 128 / cols.length, 256, 128 / cols.length + 1); });
  } else {
    g.fillStyle = e.color; g.fillRect(0, 0, 256, 128);
    g.fillStyle = e.spot;
    if (pat === 'stripes') {
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(0, 14 + i * 24); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 14 + i * 24 + (x / 16 % 2 ? 6 : -6)); g.lineWidth = 7; g.strokeStyle = e.spot; g.stroke(); }
    } else if (pat === 'stars') {
      for (let i = 0; i < 45; i++) { const r = rnd() < 0.15 ? 4 : 1.8; g.beginPath(); g.arc(rnd() * 256, rnd() * 128, r, 0, 7); g.fill(); }
    } else if (pat === 'shine') {
      const gr = g.createLinearGradient(0, 0, 256, 128);
      gr.addColorStop(0, e.color); gr.addColorStop(0.45, e.spot); gr.addColorStop(0.55, e.color); gr.addColorStop(1, e.spot);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (let i = 0; i < 8; i++) { const x = rnd() * 256, y = 16 + rnd() * 96; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 2, y); g.lineTo(x, y + 7); g.lineTo(x - 2, y); g.fill(); }
    } else {
      for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rnd() * 256, 16 + rnd() * 96, 6 + rnd() * 9, 0, 7); g.fill(); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const glow = { moon: 0.55, galaxy: 0.3, crystal: 0.25, dragon: 0.2, magma: 0.25, void: 0.2, pearl: 0.2, golden: 0.5, rainbow: 0.35, diamond: 0.5, cosmic: 0.45, celestial: 0.7 }[type] || 0;
  return (eggMats[type] = new THREE.MeshLambertMaterial({ map: tex, emissive: e.spot, emissiveIntensity: glow }));
}
const eggGeo = new THREE.SphereGeometry(1, 22, 16);
function makeEgg(type, s = 1) {
  const m = new THREE.Mesh(eggGeo, eggMat(type));
  m.scale.set(0.8 * s, 1.05 * s, 0.8 * s);
  m.castShadow = true;
  return m;
}

const twig = mat('#7b4e2a'), twigDark = mat('#5a371c');
function makeNest(scale = 1) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.42, 8, 18), twig);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.35; ring.castShadow = ring.receiveShadow = true;
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.3, 18), twigDark);
  bed.position.y = 0.15; bed.receiveShadow = true;
  g.add(ring, bed);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.2), i % 2 ? twig : twigDark);
    const a = (i / 9) * Math.PI * 2;
    s.position.set(Math.cos(a) * 1.35, 0.35 + (i % 3) * 0.12, Math.sin(a) * 1.35);
    s.rotation.y = -a + 0.3; s.rotation.z = (i % 2 ? 0.15 : -0.15);
    g.add(s);
  }
  g.scale.setScalar(scale);
  return g;
}

// =====================================================================
// Players (blocky avatars)
// =====================================================================
const SKINS = ['#f5cfa6', '#e2a577', '#b5754c', '#7c4a2c', '#ffd9a8'];
const HAIR = ['#6b3d1f', '#2a1a10', '#d99a3a', '#b5471f', '#111111'];
function makeAvatar(shirt, seed) {
  const g = new THREE.Group();
  const skin = mat(SKINS[seed % SKINS.length]), hair = mat(HAIR[(seed >> 2) % HAIR.length]);
  const pants = mat('#262a35'), sh = mat(shirt);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(s * 0.48, 1.8, 0);
    const l = box(0.9, 1.8, 0.9, pants); l.position.y = -0.9; p.add(l);
    const shoe = box(0.95, 0.3, 1.0, mat('#eeeeee')); shoe.position.set(0, -1.65, 0.05); p.add(shoe);
    g.add(p); legs.push(p);
  }
  const torso = box(1.9, 1.8, 0.95, sh); torso.position.y = 2.7; g.add(torso);
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(s * 1.42, 3.5, 0);
    const a = box(0.85, 1.25, 0.85, sh); a.position.y = -0.55; p.add(a);
    const h = box(0.82, 0.6, 0.82, skin); h.position.y = -1.45; p.add(h);
    g.add(p); arms.push(p);
  }
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.15, 18), skin);
  head.position.y = 4.2; head.castShadow = true; g.add(head);
  const top = box(1.34, 0.42, 1.34, hair); top.position.y = 4.78; g.add(top);
  const back = box(1.34, 0.9, 0.35, hair); back.position.set(0, 4.45, -0.52); g.add(back);
  const fringe = box(1.3, 0.3, 0.2, hair); fringe.position.set(0, 4.55, 0.6); g.add(fringe);
  eyes(g, 4.22, 0.625, 0.24, 0.14);
  // bat in the right hand
  const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 2.6, 8), mat('#a8683a'));
  bat.position.set(0, -1.5, 0.9); bat.rotation.x = Math.PI / 2 + 0.5; bat.castShadow = true;
  arms[1].add(bat);
  g.userData = { legs, arms, phase: seed };
  return g;
}
function animateAvatar(g, speed, dt, swinging, carrying) {
  const u = g.userData;
  u.phase += dt * Math.min(speed, 30) * 0.45;
  const sw = Math.min(speed / 10, 1) * 0.9;
  u.legs[0].rotation.x = Math.sin(u.phase) * sw;
  u.legs[1].rotation.x = -Math.sin(u.phase) * sw;
  if (carrying) {
    u.arms[0].rotation.x = u.arms[1].rotation.x = Math.PI;
  } else {
    u.arms[0].rotation.x = -Math.sin(u.phase) * sw;
    u.arms[1].rotation.x = Math.sin(u.phase) * sw;
  }
  if (swinging) u.arms[1].rotation.x = -1.9 + Math.sin(performance.now() / 40) * 0.6;
}


// =====================================================================
// Treadmills — 5 looks. Built with the runner facing +z, the console at the +z end.
// =====================================================================
function beltTexture(tier) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  if (tier === 3) { // lava
    g.fillStyle = '#5a1206'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = ['#ff6a1a', '#ffb02e', '#e8320f'][i % 3];
      g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 256, 6 + Math.random() * 16, 3 + Math.random() * 7, Math.random() * 3, 0, 7); g.fill();
    }
  } else if (tier === 5) { // rainbow
    const cols = ['#ff4f5a', '#ff9a2e', '#ffe03a', '#5cd15a', '#3fa7ff', '#a45cff'];
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 256 / 6, 128, 256 / 6 + 1); });
  } else if (tier === 6) { // omega
    g.fillStyle = '#0b0a10'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#ff2a55'; g.lineWidth = 3;
    for (let y = 0; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 16); g.lineTo(128, y); g.stroke(); }
  } else if (tier === 4) { // galaxy
    const gr = g.createLinearGradient(0, 0, 128, 256); gr.addColorStop(0, '#1a0f3a'); gr.addColorStop(1, '#3a1260');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 60; i++) { g.fillStyle = i % 5 ? '#ffffff' : '#ff8ef0'; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  } else {
    g.fillStyle = tier === 2 ? '#15233d' : '#1c1f26'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = tier === 2 ? '#2f5d9a' : '#343a46'; g.lineWidth = 4;
    for (let i = -256; i < 256; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
      g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
}

function makeTreadmill(tier) {
  const g = new THREE.Group();
  const L = TREADMILL.len, W = TREADMILL.width;
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const cone = (r, h, m) => new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), m);
  const styles = [
    { deck: '#8e919c', rail: '#a3a6b0', dark: '#5d606b' },   // Basic
    { deck: '#f2f4f7', rail: '#ffffff', dark: '#9aa3b2', trim: '#2f8cff' }, // Sport
    { deck: '#2b58c9', rail: '#3f7cf0', dark: '#1b3b8f', trim: '#8fdcff' }, // Crystal
    { deck: '#5a2320', rail: '#7a2d25', dark: '#2e1512', trim: '#ff7a1a' }, // Lava
    { deck: '#2a1c4a', rail: '#3b2966', dark: '#140c26', trim: '#ff6ee8' }, // Galaxy
    { deck: '#f7f7fb', rail: '#ffffff', dark: '#c9ced6', trim: '#ff5ab4' }, // Rainbow
    { deck: '#111018', rail: '#1d1a26', dark: '#0b0a10', trim: '#ff2a55' }, // Omega
  ][tier];
  const deckM = studMat(styles.deck, shade(styles.deck, -0.03), 16, 16);
  const railM = mat(styles.rail), darkM = mat(styles.dark);
  const trimM = styles.trim ? mat(styles.trim, { emissive: styles.trim, emissiveIntensity: tier >= 3 ? 0.8 : 0.15 }) : railM;

  // deck + belt
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.5, L + 0.6), deckM), 0, 0.25, 0);
  const beltTex = beltTexture(tier);
  const beltMat = new THREE.MeshLambertMaterial({ map: beltTex, emissive: tier === 3 ? '#ff5a10' : '#000000', emissiveIntensity: tier === 3 ? 0.6 : 0, emissiveMap: tier === 3 ? beltTex : null });
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(W, L), beltMat);
  belt.rotation.x = -Math.PI / 2; belt.position.y = 0.52; belt.receiveShadow = true; g.add(belt);
  // side rails
  for (const sx of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, L + 0.6), railM), sx * (W / 2 + 0.35), 0.62, 0);
    if (styles.trim) add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, L + 0.4), trimM), sx * (W / 2 + 0.35), 0.82, 0);
  }

  if (tier === 0) { // Basic: two uprights, handlebars, console
    for (const sx of [-1, 1]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 0.4), railM), sx * (W / 2 + 0.35), 2.2, L / 2 - 0.2).rotation.x = -0.15;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2.2), railM), sx * (W / 2 + 0.35), 3.2, L / 2 - 1.2);
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.8, 1.2), darkM), 0, 3.9, L / 2 - 0.1).rotation.x = -0.4;
  } else if (tier === 1) { // Sport: white arch with blue stripes
    for (const sx of [-1, 1]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.6, 0.9), railM), sx * (W / 2 + 0.6), 2.3, L / 2 - 0.4);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 0.95), trimM), sx * (W / 2 + 0.6) - sx * 0.3, 2.3, L / 2 - 0.4);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.7), railM), sx * (W / 2 + 0.6), 1.6, -L / 2 + 0.6);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, L - 0.6), railM), sx * (W / 2 + 0.6), 3.3, 0);
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 2.2, 0.7, 1.0), railM), 0, 4.8, L / 2 - 0.4);
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 2.2, 0.2, 1.05), trimM), 0, 4.5, L / 2 - 0.4);
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 1.0, 0.8), mat('#c9d3e0')), 0, 3.6, L / 2 - 0.9).rotation.x = -0.5;
  } else if (tier === 2) { // Crystal: blue frame with ice spikes
    const crystal = mat('#8fdcff', { emissive: '#4fb8ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.9 });
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 4.4, 0.8), deckM), 0, 2.2, L / 2 + 0.2);
    for (let i = 0; i < 5; i++) add(cone(0.45, 2.2 + (i % 2) * 1.4, crystal), -1.8 + i * 0.9, 5.2 + (i % 2) * 0.6, L / 2 + 0.2);
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const c = add(cone(0.3, 1.3 + (k % 2) * 0.6, crystal), sx * (W / 2 + 0.6), 1.3, -L / 2 + 0.8 + k * 1.9);
        c.rotation.z = -sx * 0.35;
      }
      add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.5), deckM), sx * (W / 2 + 0.5), 1.8, L / 2 - 0.8);
    }
  } else if (tier === 3) { // Lava: dark brick portal, chains of fire, torches
    const brick = studMat('#6b2a22', '#5a231d', 16, 16);
    const portal = mat('#080808');
    for (const sx of [-1, 1]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.6, 1.2), brick), sx * (W / 2 + 0.8), 2.8, L / 2);
      const fire = add(cone(0.55, 1.6, mat('#ffb02e', { emissive: '#ff6a1a', emissiveIntensity: 1 })), sx * (W / 2 + 0.8), 6.4, L / 2);
      fire.userData.flame = true;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), brick), sx * (W / 2 + 0.6), 1.2, -L / 2 + 0.6);
      add(cone(0.35, 1, mat('#ff7a1a', { emissive: '#ff5a10', emissiveIntensity: 1 })), sx * (W / 2 + 0.6), 2.1, -L / 2 + 0.6).userData.flame = true;
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 4.8, 0.3), portal), 0, 2.9, L / 2 + 0.3);
    add(new THREE.Mesh(new THREE.BoxGeometry(W + 2.8, 0.8, 1.3), brick), 0, 5.6, L / 2);
  } else if (tier === 5) { // Rainbow: stacked rainbow arch
    ['#ff4f5a', '#ff9a2e', '#ffe03a', '#5cd15a', '#3fa7ff', '#a45cff'].forEach((col, i) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(3.4 - i * 0.28, 0.14, 8, 28, Math.PI), mat(col, { emissive: col, emissiveIntensity: 0.4 }));
      arc.position.set(0, 0.5, L / 2 - 0.4); g.add(arc);
    });
    for (const sx of [-1, 1]) {
      const cloud = add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 })), sx * 3.2, 0.9, L / 2 - 0.4);
      cloud.scale.set(1.3, 0.8, 1);
    }
    for (let i = 0; i < 5; i++) { const st = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.25), mat('#ffe03a', { emissive: '#ffe03a', emissiveIntensity: 1 })), Math.cos(i * 1.3) * 2.4, 2.5 + (i % 3) * 0.7, -2 + i); st.userData.float = i; }
  } else if (tier === 6) { // Omega: black spikes, red rift ring
    const red = mat('#ff2a55', { emissive: '#ff2a55', emissiveIntensity: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.3, 8, 6), red);
    ring.position.set(0, 3.3, L / 2 - 0.3); ring.userData.spin = true; g.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshBasicMaterial({ color: '#1a0008', transparent: true, opacity: 0.85 }));
    core.position.copy(ring.position); core.position.z += 0.05; g.add(core);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6 + (k % 2) * 0.8, 4), k % 2 ? red : mat('#0b0a10')), sx * (W / 2 + 0.7), 1.3, -L / 2 + 0.9 + k * 1.8);
      sp.rotation.z = -sx * 0.3;
    }
  } else { // Galaxy: dark frame, glowing ring gate, floating stars
    const glow = mat('#ff6ee8', { emissive: '#ff6ee8', emissiveIntensity: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.28, 10, 36), glow);
    ring.position.set(0, 3.2, L / 2 - 0.3); g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.12, 8, 36), mat('#8fdcff', { emissive: '#8fdcff', emissiveIntensity: 0.9 }));
    ring2.position.copy(ring.position); ring2.userData.spin = true; g.add(ring2);
    for (let i = 0; i < 6; i++) {
      const st = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.3), mat('#fff27a', { emissive: '#fff27a', emissiveIntensity: 1 })), Math.cos(i) * 2.6, 2 + (i % 3), -2 + i * 0.8);
      st.userData.float = i;
    }
  }
  g.userData = { belt: beltTex };
  return g;
}

function boardTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 300;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { c, t };
}
function drawBoard(b, lvl) {
  const g = b.c.getContext('2d');
  g.fillStyle = '#16213e'; g.fillRect(0, 0, 512, 300);
  g.strokeStyle = '#2d3d66'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 290);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = (t, y, size, color) => { g.font = `700 ${size}px Fredoka, sans-serif`; g.lineWidth = size * 0.2; g.strokeStyle = '#0b1020'; g.strokeText(t, 256, y); g.fillStyle = color; g.fillText(t, 256, y); };
  text(`${TREADMILL.tiers[TREADMILL.tier(lvl)]} Treadmill`, 55, 50, '#ffffff');
  text(`+${fmt(TREADMILL.gain(lvl))} speed/s`, 118, 40, '#8fd8ff');
  if (lvl >= TREADMILL.maxLevel) {
    text('MAX LEVEL', 210, 60, '#ffe03a');
  } else {
    text(`Level ${lvl} > Level ${lvl + 1}`, 178, 38, '#6fdc5a');
    g.fillStyle = '#36d45a'; g.beginPath(); g.roundRect(146, 212, 220, 64, 14); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#0b1020'; g.stroke();
    text(`$${fmt(TREADMILL.cost(lvl))}`, 245, 44, '#ffffff');
  }
  b.t.needsUpdate = true;
}

// =====================================================================
// World
// =====================================================================
function signBoard(lines, w = 7, h = 3.4) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = '#16213e'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#2d3d66'; g.lineWidth = 10; g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = `700 ${l.size}px Fredoka, sans-serif`;
    g.fillStyle = l.color;
    g.fillText(l.text, c.width / 2, c.height * (i + 0.5) / lines.length);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  const backP = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat('#16213e'));
  backP.rotation.y = Math.PI; m.add(backP);
  const grp = new THREE.Group();
  const post = box(0.4, 3, 0.4, mat('#3a3f4a')); post.position.y = 1.5;
  m.position.y = 3 + h / 2;
  grp.add(post, m);
  return grp;
}

let fuseLabel, fuseCount, fuseGlow, petFuseLabel, petFuseStatus;
function buildWorld() {
  // plaza
  const pw = PLAZA_HALF_X * 2 + 4, pd = SAFE_Z - PLAZA_MIN_Z + 2;
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), studMat('#6ad14b', '#5ec541', pw, pd));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0, (SAFE_Z + PLAZA_MIN_Z) / 2); plaza.receiveShadow = true;
  scene.add(plaza);
  const wallC = '#d98a4d', wallC2 = '#d4834a';
  const wall = (w, h, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), studMat(wallC, wallC2, Math.max(w, d), h, 0.35));
    m.position.set(x, h / 2, z); m.receiveShadow = true; scene.add(m);
  };
  wall(pw + 4, 26, 2, 0, PLAZA_MIN_Z - 2);
  wall(2, 26, pd + 4, -PLAZA_HALF_X - 2, (SAFE_Z + PLAZA_MIN_Z) / 2);
  wall(2, 26, pd + 4, PLAZA_HALF_X + 2, (SAFE_Z + PLAZA_MIN_Z) / 2);
  const fw = PLAZA_HALF_X - CORRIDOR_HALF;
  wall(fw + 2, 26, 2, -(CORRIDOR_HALF + fw / 2 + 1), SAFE_Z + 1);
  wall(fw + 2, 26, 2, CORRIDOR_HALF + fw / 2 + 1, SAFE_Z + 1);

  // canyon zones
  ZONES.forEach((Z, i) => {
    const z0 = zoneStart(i), zc = z0 + ZONE_LEN / 2;
    const gw = CORRIDOR_HALF * 2 + 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(gw, ZONE_LEN), studMat(Z.ground[0], Z.ground[1], gw, ZONE_LEN));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, zc); floor.receiveShadow = true;
    scene.add(floor);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 36, ZONE_LEN), studMat(Z.wall, shade(Z.wall, -0.02), ZONE_LEN, 36, 0.35));
      m.position.set(s * (CORRIDOR_HALF + 2.5), 18, zc); m.receiveShadow = true;
      scene.add(m);
    }
    // sign at the zone entrance
    const sign = signBoard([
      { text: Z.name, size: 64, color: '#ffffff' },
      { text: Z.rec ? `⚡ ${fmt(Z.rec)} recommended` : 'Start here!', size: 46, color: '#ffe03a' },
    ]);
    sign.position.set(-CORRIDOR_HALF + 5, 0, z0 + 6);
    sign.rotation.y = Math.PI;
    scene.add(sign);
    // the guardian's dirt pile + big nest
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(15, 28), mat(shade(Z.ground[0], -0.18)));
    dirt.rotation.x = -Math.PI / 2; dirt.position.set(0, 0.03, nestZ(i)); dirt.receiveShadow = true;
    scene.add(dirt);
    const bigNest = makeNest(3.2); bigNest.position.set(0, 0, nestZ(i));
    scene.add(bigNest);
  });
  const end = new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR_HALF * 2 + 8, 36, 3), studMat('#1d1631', '#241b3b', 44, 36));
  end.position.set(0, 18, WORLD_END_Z + 1.5); scene.add(end);

  // SAFEZONE line + floor decal
  const line = new THREE.Mesh(new THREE.BoxGeometry(CORRIDOR_HALF * 2, 0.06, 0.35), new THREE.MeshBasicMaterial({ color: '#ff2a55' }));
  line.position.set(0, 0.06, SAFE_Z); scene.add(line);
  const dc = document.createElement('canvas'); dc.width = 512; dc.height = 128;
  const dg = dc.getContext('2d');
  dg.fillStyle = '#29b6ff'; dg.beginPath(); dg.roundRect(8, 24, 496, 80, 40); dg.fill();
  dg.font = '700 64px Fredoka, sans-serif'; dg.textAlign = 'center'; dg.textBaseline = 'middle';
  dg.lineWidth = 12; dg.strokeStyle = '#15171c'; dg.strokeText('SAFEZONE', 256, 66); dg.fillStyle = '#fff'; dg.fillText('SAFEZONE', 256, 66);
  const dt = new THREE.CanvasTexture(dc); dt.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: dt, transparent: true }));
  decal.rotation.set(-Math.PI / 2, 0, Math.PI); decal.position.set(0, 0.07, SAFE_Z - 2.5); scene.add(decal);

  // SELL stand
  const sell = new THREE.Group();
  for (const [x, z] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) { const p = box(0.35, 4.2, 0.35, mat('#6b6f78')); p.position.set(x, 2.1, z); sell.add(p); }
  const counter = box(4.8, 0.3, 1.2, mat('#6b6f78')); counter.position.set(0, 1.6, 1.4); sell.add(counter);
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 32;
  const sg = sc.getContext('2d');
  for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#ffffff' : '#e8243a'; sg.fillRect(i * 32, 0, 32, 32); }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const awning = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 4.2), new THREE.MeshLambertMaterial({ map: st }));
  awning.position.set(0, 4.4, 0); awning.rotation.x = 0.25; awning.castShadow = true; sell.add(awning);
  const sellLabel = makeLabel('SELL', { color: '#ff2a3a', size: 64, scale: 1.2 });
  sellLabel.position.y = 6.6; sell.add(sellLabel);
  sell.position.set(SELL_POS.x, 0, SELL_POS.z);
  scene.add(sell);

  // Fuse Machine
  const fuse = new THREE.Group();
  const blue = studMat('#2f6fe0', '#2b67d4', 16, 16);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 3.2), blue); bodyM.position.set(0.4, 1.8, 0); bodyM.castShadow = true; fuse.add(bodyM);
  const side = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.6), blue); side.position.set(-2.4, 1.1, 0); side.castShadow = true; fuse.add(side);
  const base = box(7.6, 0.3, 4.4, mat('#9aa0aa')); base.position.set(-0.6, 0.15, 0); fuse.add(base);
  for (let i = 0; i < 3; i++) {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12), mat('#3a3f4a'));
    ch.position.set(-0.8 + i * 1.2, 4.1, -0.3); ch.castShadow = true; fuse.add(ch);
  }
  const lever = box(0.18, 1.6, 0.18, mat('#1d222b')); lever.position.set(-2.8, 3.0, -0.4); fuse.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat('#1d222b')); knob.position.set(-2.8, 3.8, -0.4); fuse.add(knob);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12), mat('#e8243a')); btn.rotation.x = Math.PI / 2; btn.position.set(-2.4, 1.2, 1.35); fuse.add(btn);
  fuseGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  fuseGlow.position.set(0.6, 1.8, 1.61); fuse.add(fuseGlow);
  const q = makeLabel('?', { color: '#dfe8ff', size: 90, stroke: '#b9c8f0' }); q.position.set(0.6, 1.8, 1.8); q.scale.multiplyScalar(0.7); fuse.add(q);
  fuseLabel = makeLabel('Fuse Machine', { color: 'cyan', size: 56 }); fuseLabel.position.y = 6.4; fuse.add(fuseLabel);
  fuseCount = makeLabel('0/3', { size: 44 }); fuseCount.position.y = 5.2; fuse.add(fuseCount);
  fuse.position.set(FUSE_POS.x, 0, FUSE_POS.z);
  fuse.rotation.y = Math.PI; // screen faces the players coming from the plaza
  scene.add(fuse);

  // Pet Fuser: a pink machine with a paw on the front
  const pf = new THREE.Group();
  const pink = studMat('#e85aa8', '#dd5099', 16, 16);
  const pbody = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.8, 3.2), pink); pbody.position.set(0, 1.9, 0); pbody.castShadow = true; pf.add(pbody);
  const pbase = box(6.2, 0.3, 4.4, mat('#9aa0aa')); pbase.position.y = 0.15; pf.add(pbase);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#bff4ff', transparent: true, opacity: 0.55, emissive: '#7fe0ff', emissiveIntensity: 0.3 }));
  dome.position.set(0, 3.8, 0); pf.add(dome);
  for (const sx of [-1.5, 0, 1.5]) {
    const slot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), mat('#3a3f4a'));
    slot.position.set(sx, 0.9, 1.65); slot.rotation.x = Math.PI / 2; pf.add(slot);
  }
  const paw = makeLabel('🐾', { size: 90, color: '#ffffff', stroke: '#8a1f5a' }); paw.position.set(0, 2.4, 1.9); paw.scale.multiplyScalar(0.8); pf.add(paw);
  petFuseLabel = makeLabel('Pet Fuser', { color: '#ff9ad5', size: 56 }); petFuseLabel.position.y = 6.8; pf.add(petFuseLabel);
  petFuseStatus = makeLabel('Put in 3 pets', { size: 38 }); petFuseStatus.position.y = 5.6; pf.add(petFuseStatus);
  pf.position.set(PET_FUSE_POS.x, 0, PET_FUSE_POS.z);
  pf.rotation.y = Math.PI;
  scene.add(pf);

  // a few blocky trees in the plaza corners
  for (const [x, z] of [[-30, -128], [30, -128], [-44, -2], [44, -2], [0, -128]]) {
    const t = new THREE.Group();
    const trunk = box(1.2, 5, 1.2, mat('#7a4f2a')); trunk.position.y = 2.5;
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), studMat('#3f9a3a', '#3a9235', 16, 16));
    leaves.position.y = 6.5; leaves.castShadow = true;
    t.add(trunk, leaves); t.position.set(x, 0, z); scene.add(t);
  }
}


// =====================================================================
// Decorations: every zone gets its own props, the plaza gets a fountain, lamps and a gate
// =====================================================================
const animDecor = [];       // things that bob or spin
const lampBulbs = [];       // glow at night
const gcache = {};
const geo = (key, make) => gcache[key] || (gcache[key] = make());
const G = {
  box: (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (a, b, h, n = 10) => geo(`c${a},${b},${h},${n}`, () => new THREE.CylinderGeometry(a, b, h, n)),
  cone: (r, h, n = 8) => geo(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n)),
  sph: (r, n = 12) => geo(`s${r},${n}`, () => new THREE.SphereGeometry(r, n, Math.max(6, n - 4))),
  ico: (r) => geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)),
  oct: (r) => geo(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  dod: (r) => geo(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  torus: (r, t, arc = Math.PI * 2) => geo(`t${r},${t},${arc}`, () => new THREE.TorusGeometry(r, t, 8, 24, arc)),
};
const glowMat = (c, k = 0.8) => mat(c, { emissive: c, emissiveIntensity: k });
function part(g, geom, m, x, y, z, shadow = true) {
  const o = new THREE.Mesh(geom, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; g.add(o); return o;
}

const DECOR = {
  meadow: [
    (g) => { part(g, G.cyl(0.08, 0.08, 1.1, 5), mat('#3f8f2a'), 0, 0.55, 0, false); const c = ['#ff5a7a', '#ffe03a', '#ffffff', '#a45cff'][Math.floor(Math.random() * 4)]; part(g, G.sph(0.35, 8), mat(c), 0, 1.15, 0, false); part(g, G.sph(0.14, 6), mat('#ffb02e'), 0, 1.2, 0.25, false); },
    (g) => { for (let i = 0; i < 3; i++) part(g, G.sph(1.1, 10), mat(i % 2 ? '#3f9a3a' : '#4fb043'), i * 0.9 - 0.9, 0.9, (i % 2) * 0.5); },
    (g) => { part(g, G.dod(1.2), mat('#9aa0aa'), 0, 0.6, 0).rotation.set(Math.random(), Math.random(), 0); },
  ],
  jungle: [
    (g) => { for (let i = 0; i < 4; i++) { const t = part(g, G.cyl(0.35, 0.45, 2.2, 7), mat('#8a5a2a'), Math.sin(i * 0.4) * 0.6 * i * 0.3, 1.1 + i * 2, 0); t.rotation.z = 0.08 * i; }
             for (let k = 0; k < 6; k++) { const l = part(g, G.box(4, 0.15, 1.2), mat('#2f8a3a'), Math.cos(k) * 1.8, 9, Math.sin(k) * 1.8); l.rotation.y = k; l.rotation.z = -0.35; } },
    (g) => { for (let k = 0; k < 5; k++) { const f = part(g, G.cone(0.5, 2.4, 5), mat('#3aa048'), Math.cos(k) * 0.6, 1, Math.sin(k) * 0.6); f.rotation.z = Math.cos(k) * 0.5; f.rotation.x = Math.sin(k) * 0.5; } },
  ],
  desert: [
    (g) => { part(g, G.cyl(0.6, 0.7, 5, 8), mat('#3f9a52'), 0, 2.5, 0); part(g, G.cyl(0.4, 0.4, 2, 8), mat('#3f9a52'), 1.1, 3, 0); part(g, G.cyl(0.4, 0.4, 1.6, 8), mat('#3f9a52'), -1.1, 2.4, 0); part(g, G.box(1.2, 0.5, 0.6), mat('#3f9a52'), 0.7, 2.1, 0); part(g, G.box(1.2, 0.5, 0.6), mat('#3f9a52'), -0.7, 1.7, 0); },
    (g) => { part(g, G.dod(1.6), mat('#d9a86a'), 0, 0.8, 0).rotation.set(Math.random(), Math.random(), 0); },
  ],
  tundra: [
    (g) => { part(g, G.cyl(0.35, 0.4, 1.6, 6), mat('#6b4a2a'), 0, 0.8, 0); for (let k = 0; k < 3; k++) { part(g, G.cone(2.2 - k * 0.55, 2.4, 8), mat('#2f6b4a'), 0, 2.2 + k * 1.5, 0); part(g, G.cone(1.5 - k * 0.45, 0.9, 8), mat('#ffffff'), 0, 3.0 + k * 1.5, 0); } },
    (g) => { const c = part(g, G.oct(1.2), mat('#bff4ff', { emissive: '#6fd6ff', emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), 0, 1.6, 0); c.scale.y = 1.8; },
    (g) => { part(g, G.sph(1, 10), mat('#ffffff'), 0, 1, 0); part(g, G.sph(0.7, 10), mat('#ffffff'), 0, 2.4, 0); part(g, G.sph(0.5, 8), mat('#ffffff'), 0, 3.4, 0); part(g, G.cone(0.1, 0.6, 5), mat('#ff8a2e'), 0, 3.4, 0.6, false).rotation.x = Math.PI / 2; },
  ],
  reef: [
    (g) => { const c = ['#ff6a8a', '#ff9a4a', '#b05cff'][Math.floor(Math.random() * 3)]; for (let k = 0; k < 5; k++) { const b = part(g, G.cyl(0.18, 0.28, 2.5, 6), mat(c), Math.cos(k * 1.3) * 0.5, 1.3, Math.sin(k * 1.3) * 0.5); b.rotation.z = Math.cos(k * 1.3) * 0.5; b.rotation.x = Math.sin(k * 1.3) * 0.5; } },
    (g) => { for (let k = 0; k < 4; k++) { const w = part(g, G.box(0.25, 3 + k * 0.6, 0.12), mat('#2f9a6a'), k * 0.35 - 0.5, 1.6 + k * 0.3, 0, false); w.userData.sway = k; animDecor.push(w); } },
    (g) => { const sh = part(g, G.sph(0.9, 10), mat('#ffe6d6'), 0, 0.3, 0); sh.scale.set(1, 0.5, 1.2); },
  ],
  volcano: [
    (g) => { part(g, G.dod(1.8), mat('#2a1d1a'), 0, 0.9, 0).rotation.set(Math.random(), Math.random(), 0); const l = part(g, G.cyl(1.4, 1.4, 0.1, 14), glowMat('#ff5a10', 1), 2.4, 0.06, 0, false); l.receiveShadow = false; },
    (g) => { part(g, G.cone(1.2, 4.5, 6), mat('#3a2622'), 0, 2.2, 0); part(g, G.sph(0.5, 8), glowMat('#ff7a1a', 1), 0, 4.5, 0, false).userData.float = Math.random() * 6; },
  ],
  candy: [
    (g) => { part(g, G.cyl(0.15, 0.15, 5, 6), mat('#ffffff'), 0, 2.5, 0); const d = part(g, G.cyl(1.4, 1.4, 0.35, 20), mat(['#ff5ab4', '#7fe0ff', '#ffe03a'][Math.floor(Math.random() * 3)]), 0, 5.4, 0); d.rotation.x = Math.PI / 2; part(g, G.torus(0.8, 0.14), mat('#ffffff'), 0, 5.4, 0.2, false); },
    (g) => { for (let k = 0; k < 8; k++) part(g, G.cyl(0.3, 0.3, 0.6, 8), mat(k % 2 ? '#ffffff' : '#ff2a55'), 0, 0.3 + k * 0.6, 0); const h = part(g, G.torus(0.7, 0.3, Math.PI), mat('#ff2a55'), 0.7, 4.8, 0); },
    (g) => { part(g, G.sph(1, 10), mat(['#8be06a', '#ff9ad5', '#ffb02e'][Math.floor(Math.random() * 3)], { emissiveIntensity: 0 }), 0, 0.6, 0).scale.set(1, 0.9, 1); },
  ],
  void: [
    (g) => { const c = part(g, G.oct(1), glowMat('#b46cff', 0.7), 0, 3, 0, false); c.scale.y = 2; c.userData.float = Math.random() * 6; c.userData.spin = 0.6; animDecor.push(c); },
    (g) => { part(g, G.box(1.4, 7, 1.4), mat('#150f22'), 0, 3.5, 0); part(g, G.box(1.5, 0.2, 1.5), glowMat('#b46cff'), 0, 7, 0, false); },
  ],
  storm: [
    (g) => { part(g, G.cone(1.5, 8, 5), mat('#4a5468'), 0, 4, 0); part(g, G.cone(0.9, 5, 5), mat('#566178'), 1.6, 2.5, 0.5); },
    (g) => { const c = part(g, G.oct(0.8), glowMat('#ffe03a', 0.9), 0, 2.5, 0, false); c.scale.y = 1.8; c.userData.float = Math.random() * 6; c.userData.spin = 1; animDecor.push(c); },
  ],
  caves: [
    (g) => { const col = Math.random() < 0.5 ? '#7fe0ff' : '#b28cff'; for (let k = 0; k < 4; k++) { const c = part(g, G.oct(0.9), glowMat(col, 0.5), Math.cos(k * 1.6) * 0.8, 1.4, Math.sin(k * 1.6) * 0.8); c.scale.set(0.7, 2 + k * 0.4, 0.7); c.rotation.z = Math.cos(k) * 0.4; } },
  ],
  abyss: [
    (g) => { for (let k = 0; k < 4; k++) { const w = part(g, G.box(0.3, 4 + k, 0.12), mat('#1f6b6a'), k * 0.4 - 0.6, 2 + k * 0.5, 0, false); w.userData.sway = k; animDecor.push(w); } },
    (g) => { const j = part(g, G.sph(0.8, 12), mat('#3fe0ff', { emissive: '#3fe0ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.7 }), 0, 4, 0, false); j.scale.y = 0.7; j.userData.float = Math.random() * 6; animDecor.push(j); },
  ],
  sun: [
    (g) => { part(g, G.cyl(0.8, 0.9, 8, 12), mat('#ffe7a8'), 0, 4, 0); part(g, G.box(2.2, 0.6, 2.2), mat('#ffc02e'), 0, 8.2, 0); part(g, G.box(2.2, 0.6, 2.2), mat('#ffc02e'), 0, 0.3, 0); },
    (g) => { part(g, G.cyl(0.12, 0.12, 3.5, 5), mat('#3f8f2a'), 0, 1.75, 0, false); const f = part(g, G.cyl(0.9, 0.9, 0.2, 14), mat('#ffd23a'), 0, 3.6, 0.1); f.rotation.x = Math.PI / 2 - 0.3; part(g, G.cyl(0.45, 0.45, 0.25, 12), mat('#6b3d1f'), 0, 3.6, 0.2, false).rotation.x = Math.PI / 2 - 0.3; },
  ],
  heaven: [
    (g) => { for (let k = 0; k < 5; k++) part(g, G.sph(1.2 + Math.random() * 0.6, 10), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.25 }), k * 1.3 - 2.6, 0.8 + Math.random() * 0.6, Math.random()); },
    (g) => { part(g, G.cyl(0.6, 0.6, 7, 12), mat('#ffffff'), 0, 3.5, 0); part(g, G.torus(1, 0.15), glowMat('#ffd23a', 0.9), 0, 8.2, 0, false).rotation.x = Math.PI / 2; },
  ],
  factory: [
    (g) => { const gear = new THREE.Group(); part(gear, G.cyl(1.6, 1.6, 0.5, 16), mat('#8a93a3'), 0, 0, 0).rotation.x = Math.PI / 2;
             for (let k = 0; k < 8; k++) { const t = part(gear, G.box(0.6, 0.6, 0.5), mat('#8a93a3'), Math.cos(k * Math.PI / 4) * 1.8, Math.sin(k * Math.PI / 4) * 1.8, 0); t.rotation.z = k * Math.PI / 4; }
             gear.position.y = 2.6; gear.userData.spinZ = 0.8; g.add(gear); animDecor.push(gear); },
    (g) => { part(g, G.cyl(0.5, 0.5, 6, 10), mat('#5d6470'), 0, 3, 0); part(g, G.cyl(0.7, 0.7, 0.5, 10), mat('#ffb02e'), 0, 6, 0); },
    (g) => { part(g, G.box(2, 2, 2), mat('#b08a5a'), 0, 1, 0); part(g, G.box(1.4, 1.4, 1.4), mat('#9a7a4a'), 0.4, 2.7, 0.2); },
  ],
  dream: [
    (g) => { const col = Math.random() < 0.5 ? '#ff9ad5' : '#b28cff'; part(g, G.cyl(0.5, 0.7, 4, 10), mat('#fff4e8'), 0, 2, 0); const cap = part(g, G.sph(2, 14), mat(col), 0, 4, 0); cap.scale.y = 0.55; for (let k = 0; k < 4; k++) part(g, G.sph(0.3, 6), mat('#ffffff'), Math.cos(k * 1.5) * 1.3, 4.7, Math.sin(k * 1.5) * 1.3, false); },
    (g) => { const st = part(g, G.oct(0.6), glowMat('#fff27a', 1), 0, 4, 0, false); st.userData.float = Math.random() * 6; st.userData.spin = 1.2; animDecor.push(st); },
  ],
  omega: [
    (g) => { const sp = part(g, G.cone(0.9, 6, 4), mat('#0b0a10'), 0, 3, 0); part(g, G.cone(0.95, 0.8, 4), glowMat('#ff2a55', 1), 0, 5.7, 0, false); void sp; },
    (g) => { const o = part(g, G.sph(0.7, 10), glowMat('#ff2a55', 1), 0, 4, 0, false); o.userData.float = Math.random() * 6; animDecor.push(o); },
  ],
};

function buildDecor() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  ZONES.forEach((Z, i) => {
    const list = DECOR[Z.id];
    if (!list) return;
    const z0 = zoneStart(i), z1 = zoneEnd(i), nz = nestZ(i);
    for (let z = z0 + 14; z < z1 - 4; z += 6 + rnd() * 5) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const x = side * (12 + rnd() * 5.5);
        if (Math.abs(z - nz) < 17 && Math.abs(x) < 16) continue; // keep the egg pile clear
        const g = new THREE.Group();
        list[Math.floor(rnd() * list.length)](g);
        g.position.set(x, 0, z);
        g.rotation.y = rnd() * Math.PI * 2;
        const sc = 0.8 + rnd() * 0.5; g.scale.setScalar(sc);
        g.children.forEach((c) => { if ((c.userData.float !== undefined || c.userData.spinZ) && !animDecor.includes(c)) animDecor.push(c); });
        scene.add(g);
      }
    }
    // an arch at every zone border
    if (i > 0) {
      const archM = mat(shade(Z.wall, -0.08));
      const arch = new THREE.Group();
      part(arch, G.box(2, 16, 2), archM, -CORRIDOR_HALF + 0.5, 8, 0);
      part(arch, G.box(2, 16, 2), archM, CORRIDOR_HALF - 0.5, 8, 0);
      part(arch, G.box(CORRIDOR_HALF * 2 + 2, 2, 2.4), archM, 0, 16.5, 0);
      part(arch, G.box(CORRIDOR_HALF * 2 - 2, 0.4, 2.5), glowMat(Z.guardian.accent, 0.6), 0, 15.3, 0, false);
      arch.position.z = z0;
      scene.add(arch);
    }
  });

  // ---- plaza: fountain, flower beds, lamps, benches, entrance gate ----
  const stone = mat('#c9ced6'), water = new THREE.MeshLambertMaterial({ color: '#4fb8ff', emissive: '#2f8cff', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 });
  const f = new THREE.Group();
  part(f, G.cyl(7, 7.4, 1.2, 28), stone, 0, 0.6, 0);
  part(f, G.cyl(6.3, 6.3, 0.2, 28), water, 0, 1.15, 0, false);
  part(f, G.cyl(0.8, 1.1, 3.5, 12), stone, 0, 2.4, 0);
  part(f, G.cyl(2.6, 1.6, 0.6, 18), stone, 0, 4.3, 0);
  part(f, G.cyl(2.2, 2.2, 0.15, 18), water, 0, 4.55, 0, false);
  const spout = part(f, G.sph(0.9, 10), water, 0, 5.3, 0, false); spout.userData.float = 0; animDecor.push(spout);
  f.position.set(0, 0, -70);
  scene.add(f);
  const flowerCols = ['#ff5a7a', '#ffe03a', '#ffffff', '#a45cff', '#ff9a2e'];
  for (const [x, z] of [[-24, -40], [24, -40], [-24, -100], [24, -100], [-12, -128], [12, -128]]) {
    const bed = new THREE.Group();
    part(bed, G.box(9, 0.6, 4), mat('#6b4a2a'), 0, 0.3, 0);
    for (let k = 0; k < 10; k++) {
      part(bed, G.cyl(0.07, 0.07, 0.8, 4), mat('#3f8f2a'), -3.8 + k * 0.85, 0.9, (k % 2 ? 0.8 : -0.8), false);
      part(bed, G.sph(0.32, 7), mat(flowerCols[k % flowerCols.length]), -3.8 + k * 0.85, 1.35, (k % 2 ? 0.8 : -0.8), false);
    }
    bed.position.set(x, 0, z); scene.add(bed);
  }
  for (let z = -125; z <= -10; z += 23) {
    for (const x of [-32, 32]) {
      const lamp = new THREE.Group();
      part(lamp, G.cyl(0.2, 0.28, 7, 8), mat('#2d3140'), 0, 3.5, 0);
      part(lamp, G.box(1.2, 0.3, 1.2), mat('#2d3140'), 0, 7.1, 0);
      const bulb = part(lamp, G.sph(0.55, 10), new THREE.MeshLambertMaterial({ color: '#fff4c2', emissive: '#ffd66b', emissiveIntensity: 0.2 }), 0, 6.6, 0, false);
      lampBulbs.push(bulb);
      lamp.position.set(x, 0, z); scene.add(lamp);
    }
  }
  for (const [x, z, r] of [[-10, -55, 0], [10, -55, Math.PI], [-10, -85, 0], [10, -85, Math.PI]]) {
    const b = new THREE.Group();
    part(b, G.box(4, 0.3, 1.2), mat('#a8683a'), 0, 1.1, 0);
    part(b, G.box(4, 1, 0.25), mat('#a8683a'), 0, 1.8, -0.5);
    for (const sx of [-1.6, 1.6]) part(b, G.box(0.25, 1.1, 1), mat('#2d3140'), sx, 0.55, 0);
    b.position.set(x, 0, z); b.rotation.y = r + Math.PI / 2; scene.add(b);
  }
  // big gate over the canyon entrance
  const gate = new THREE.Group();
  const gm = studMat('#ffb02e', '#f5a623', 16, 16);
  part(gate, G.box(3.5, 26, 3.5), gm, -CORRIDOR_HALF - 1, 13, 0);
  part(gate, G.box(3.5, 26, 3.5), gm, CORRIDOR_HALF + 1, 13, 0);
  part(gate, G.box(CORRIDOR_HALF * 2 + 9, 5, 4), gm, 0, 27, 0);
  const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 160;
  const tg = tc.getContext('2d');
  tg.font = '700 118px Fredoka, sans-serif'; tg.textAlign = 'center'; tg.textBaseline = 'middle'; tg.lineJoin = 'round';
  tg.lineWidth = 22; tg.strokeStyle = '#15171c'; tg.strokeText('EGG HEIST', 512, 84); tg.fillStyle = '#ffe45c'; tg.fillText('EGG HEIST', 512, 84);
  const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_HALF * 2 + 6, 7.5), new THREE.MeshBasicMaterial({ map: tt, transparent: true }));
  title.position.set(0, 27, -2.05); title.rotation.y = Math.PI; gate.add(title);
  document.fonts?.ready.then(() => { tg.clearRect(0, 0, 1024, 160); tg.font = '700 118px Fredoka, sans-serif'; tg.strokeText('EGG HEIST', 512, 84); tg.fillText('EGG HEIST', 512, 84); tt.needsUpdate = true; });
  gate.position.set(0, 0, SAFE_Z + 1);
  scene.add(gate);
}

function animateDecor(t, dt, night) {
  for (const o of animDecor) {
    const u = o.userData;
    if (u.float !== undefined) o.position.y = (u.baseY ?? (u.baseY = o.position.y)) + Math.sin(t * 1.5 + u.float) * 0.5;
    if (u.spin) o.rotation.y += u.spin * dt;
    if (u.spinZ) o.rotation.z += u.spinZ * dt;
    if (u.sway !== undefined) o.rotation.z = Math.sin(t * 1.3 + u.sway) * 0.25;
  }
  for (const b of lampBulbs) b.material.emissiveIntensity = 0.2 + night * 1.2;
}

// =====================================================================
// Particles: confetti when eggs hatch, dust puffs when running
// =====================================================================
const particles = [];
const confettiGeo = new THREE.PlaneGeometry(0.35, 0.22);
const puffGeo = new THREE.SphereGeometry(0.35, 6, 4);
const CONFETTI = ['#ff5a7a', '#ffe03a', '#5cd15a', '#3fa7ff', '#a45cff', '#ffffff'];
function confetti(x, z, count = 40, cols = CONFETTI) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(confettiGeo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
    m.position.set(x, 2, z);
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
    scene.add(m);
    particles.push({ m, vx: Math.cos(a) * sp, vy: 8 + Math.random() * 8, vz: Math.sin(a) * sp, life: 0, max: 1.6 + Math.random() * 0.6, g: 18, spin: Math.random() * 10 });
  }
}
function puff(x, z) {
  if (particles.length > 400) return;
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#f2efe6', transparent: true, opacity: 0.6 }));
  m.position.set(x + (Math.random() - 0.5), 0.3, z + (Math.random() - 0.5));
  scene.add(m);
  particles.push({ m, vx: 0, vy: 0.8, vz: 0, life: 0, max: 0.5, g: 0, grow: 2.5 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    p.vy -= p.g * dt;
    p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.05, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
    if (p.spin) { p.m.rotation.x += p.spin * dt; p.m.rotation.y += p.spin * dt * 0.7; }
    if (p.grow) p.m.scale.setScalar(1 + p.life * p.grow);
    p.m.material.opacity = Math.max(0, 1 - p.life / p.max) * (p.grow ? 0.6 : 1);
    if (p.life >= p.max) { scene.remove(p.m); p.m.material.dispose(); particles.splice(i, 1); }
  }
}

// Frees GPU memory for things we remove (the game used to slow down the longer you played)
function disposeTree(o) {
  o.traverse((c) => {
    if (c.isSprite) { c.material.map?.dispose(); c.material.dispose(); const k = allLabels.indexOf(c); if (k >= 0) allLabels.splice(k, 1); }
    else if (c.isMesh && !Object.values(gcache).includes(c.geometry) && c.geometry !== eggGeo) c.geometry.dispose();
  });
}

// ---------------- plots ----------------
const plots = [];
function fenceLine(group, x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(x2 - x1, z2 - z1);
  const posts = Math.max(1, Math.round(len / 4));
  for (let i = 0; i <= posts; i++) {
    const p = box(0.6, 2.4, 0.6, mat('#4a3226'));
    p.position.set(x1 + (x2 - x1) * i / posts, 1.2, z1 + (z2 - z1) * i / posts);
    group.add(p);
  }
  for (const y of [0.9, 1.8]) {
    const r = box(0.3, 0.3, len, mat('#b5633a'));
    r.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); r.rotation.y = ang;
    group.add(r);
  }
}
function buildPlots() {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const c = plotCenter(i), hw = PLOT.w / 2, hd = PLOT.d / 2;
    const g = new THREE.Group(); scene.add(g);
    const back = c.x + c.side * hw, front = c.x - c.side * hw;
    fenceLine(g, back, c.z - hd, back, c.z + hd);
    fenceLine(g, front, c.z - hd, back, c.z - hd);
    fenceLine(g, front, c.z + hd, back, c.z + hd);
    fenceLine(g, front, c.z - hd, front, c.z - 4);
    fenceLine(g, front, c.z + 4, front, c.z + hd);
    const floorMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PLOT.w, PLOT.d), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(c.x, 0.04, c.z); g.add(floor);
    const sign = makeLabel('Empty Plot', { size: 48, color: '#d7dde6' });
    sign.position.set(back - c.side * 1, 5.5, c.z); g.add(sign);
    const nests = [];
    for (let n = 0; n < MAX_NESTS_WITH_PASS; n++) {
      const np = nestPos(i, n);
      const nest = makeNest(1); nest.position.set(np.x, 0, np.z); g.add(nest);
      const holder = new THREE.Group(); holder.position.set(np.x, 0.4, np.z); g.add(holder);
      nests.push({ nest, holder, key: '', label: null });
    }
    // treadmill + upgrade board
    const tp = treadmillPos(i);
    const tread = new THREE.Group();
    tread.position.set(tp.x, 0, tp.z);
    tread.rotation.y = c.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(tread);
    const bp = treadBoardPos(i);
    const board = boardTexture();
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), new THREE.MeshLambertMaterial({ map: board.t, emissive: '#ffffff', emissiveMap: board.t, emissiveIntensity: 0.25 }));
    bm.position.set(bp.x, 3.4, bp.z); bm.rotation.y = Math.PI;
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), mat('#16213e')); bm.add(bb); bb.rotation.y = Math.PI;
    const post = box(0.3, 2.1, 0.3, mat('#3a3f4a')); post.position.set(bp.x, 1.05, bp.z + 0.05);
    g.add(bm, post);
    plots.push({ c, floorMat, sign, signText: '', nests, petKey: '', pets: [], tread, treadTier: -1, board, boardLvl: -1 });
  }
}

// =====================================================================
// Networked state
// =====================================================================
const players = new Map(), fieldEggs = new Map();
const guardians = [];
let myId = null, myPlot = -1, me = null, snap = null, slow = false;
const myPos = { x: 0, z: 0, rot: 0 };
let nightLerp = 0;

const GSIZE = 2.2;
function buildGuardians() {
  ZONES.forEach((Z, i) => {
    const G = Z.guardian;
    const body = makeCreature(G.kind, G.color, G.accent);
    body.scale.setScalar(G.scale * GSIZE);
    const holder = new THREE.Group();
    holder.add(body);
    const top = G.scale * GSIZE * 2.1;
    const zzz = makeLabel('Z z z', { color: '#7fd0ff', size: 56, scale: 1.4 }); zzz.position.y = top + 3;
    const alert = makeLabel('!', { color: '#ff3a3a', size: 90, scale: 1.6 }); alert.position.y = top + 3.5; alert.visible = false;
    const name = makeLabel(G.name, { size: 40, scale: 1.3 }); name.position.y = top + 1;
    holder.add(zzz, alert, name);
    holder.position.set(0, 0, nestZ(i));
    holder.rotation.y = Math.PI;
    scene.add(holder);
    guardians.push({ holder, body, zzz, alert, tx: 0, tz: nestZ(i), tr: Math.PI, s: 'sleep', scale: G.scale, top });
  });
}

function playerView(p) {
  let v = players.get(p.id);
  if (!v) {
    const seed = [...p.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const body = makeAvatar(p.c, seed);
    const label = makeLabel(p.n, { size: 40, color: p.id === myId ? '#ffffff' : p.c }); label.position.y = 6.2;
    body.add(label);
    body.position.set(p.x, 0, p.z);
    scene.add(body);
    v = { body, label, egg: null, eggKey: '', speed: 0, tx: p.x, tz: p.z, tr: p.r };
    players.set(p.id, v);
  }
  return v;
}

function applySnapshot(s) {
  snap = s; me = s.me;
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    const v = playerView(p);
    v.tx = p.x; v.tz = p.z; v.tr = p.r; v.st = p.st; v.sw = p.sw; v.cy = p.cy; v.run = p.tr; v.pl = p.pl; v.tg = p.tg;
    const tag = `${p.vip ? '👑 ' : ''}${p.n}${p.rb ? ` [R${p.rb}]` : ''}`;
    if (v.tagText !== tag) {
      v.tagText = tag;
      v.label.userData.opts.color = p.vip ? '#ffd23a' : (p.id === myId ? '#ffffff' : p.c);
      v.label.userData.text = null; v.label.userData.bs = null;
      setLabel(v.label, tag);
    }
    if (p.id === myId) { v.sx = p.x; v.sz = p.z; }
    const key = p.cy || '';
    if (v.eggKey !== key) {
      v.eggKey = key;
      if (v.egg) v.body.remove(v.egg);
      v.egg = null;
      if (p.cy) { v.egg = makeEgg(p.cy, 0.75); v.egg.position.y = 6.4; v.body.add(v.egg); v.label.position.y = 8; }
      else v.label.position.y = 6.2;
    }
  }
  for (const [id, v] of players) if (!seen.has(id)) { scene.remove(v.body); disposeTree(v.body); players.delete(id); }

  s.guardians.forEach((g, i) => {
    const v = guardians[i]; v.tx = g.x; v.tz = g.z; v.tr = g.r; v.s = g.s;
    setLabel(v.alert, g.s === 'wake' ? String(g.w) : '!');
  });

  const seenE = new Set();
  for (const e of s.eggs) {
    seenE.add(e.id);
    let v = fieldEggs.get(e.id);
    if (!v) {
      const g = new THREE.Group();
      const egg = makeEgg(e.t, 1.35); egg.position.y = 1.42; g.add(egg);
      const E = EGGS[e.t];
      const lbl = makeLabel(E.name, { size: 30, color: e.t === 'moon' ? '#dfe4ff' : '#ffffff' }); lbl.position.y = 3.8; g.add(lbl);
      g.position.set(e.x, 0, e.z);
      scene.add(g);
      v = { g, egg };
      fieldEggs.set(e.id, v);
    }
    v.g.position.set(e.x, 0, e.z);
  }
  for (const [id, v] of fieldEggs) if (!seenE.has(id)) { scene.remove(v.g); disposeTree(v.g); fieldEggs.delete(id); }

  updatePlots(s);
  updateHud();
}

function updatePlots(s) {
  s.plots.forEach((pl, i) => {
    const view = plots[i];
    const owner = pl && s.players.find((p) => p.id === pl.o);
    const text = owner ? `${owner.n}'s Base` : 'Empty Plot';
    if (view.signText !== text) {
      view.signText = text;
      view.sign.userData.opts.color = owner ? owner.c : '#d7dde6';
      view.sign.userData.text = null;
      setLabel(view.sign, text);
    }
    view.floorMat.color.set(owner ? owner.c : '#ffffff');
    view.floorMat.opacity = owner ? 0.16 : 0;
    const built = pl ? pl.n : SHOP.startNests;
    view.nests.forEach((n, k) => {
      n.nest.visible = k < built;
      const e = pl && pl.e[k];
      const key = e ? e.t : '';
      if (n.key !== key) {
        n.key = key;
        disposeTree(n.holder); n.holder.clear(); n.label = null;
        if (e) {
          const egg = makeEgg(e.t, 0.8); egg.position.y = 0.85; n.holder.add(egg);
          n.label = makeLabel('', { size: 28 }); n.label.position.y = 3; n.holder.add(n.label);
        }
      }
      if (e && n.label) setLabel(n.label, `${EGGS[e.t].name}\n${e.h > 0 ? fmtTime(e.h) : 'Hatching!'}`);
    });
    // treadmill look follows its level
    const lvl = pl ? pl.t : 1;
    const tier = TREADMILL.tier(lvl);
    if (view.treadTier !== tier) {
      view.treadTier = tier;
      disposeTree(view.tread); view.tread.clear();
      view.treadModel = makeTreadmill(tier);
      view.tread.add(view.treadModel);
    }
    if (view.boardLvl !== lvl) { view.boardLvl = lvl; drawBoard(view.board, lvl); }
    view.running = !!s.players.find((p) => p.pl === i && p.tr);

    // pets wander around the front of the plot
    const pk = pl ? pl.p.join(',') : '';
    if (view.petKey !== pk) {
      view.petKey = pk;
      view.pets.forEach((p) => { scene.remove(p.g); disposeTree(p.g); });
      view.pets = [];
      (pl ? pl.p : []).forEach((id) => {
        const P = PETS[id];
        const g = makeCreature(P.kind, P.color, P.accent);
        g.scale.setScalar(1.3);
        const pos = randomPetSpot(view.c);
        g.position.set(pos.x, 0, pos.z);
        scene.add(g);
        view.pets.push({ g, tx: pos.x, tz: pos.z, wait: Math.random() * 3 });
      });
    }
  });
}
function randomPetSpot(c) {
  return { x: c.x - c.side * (2 + Math.random() * 11), z: c.z - 10 + Math.random() * 13 };
}

// =====================================================================
// HUD
// =====================================================================
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function petSvg(id) {
  const P = PETS[id], c = P.color, a = P.accent, k = '#16181d';
  const st = `stroke="${k}" stroke-width="2.5" stroke-linejoin="round"`;
  const eyesS = (y = 34, gap = 7) => `<rect x="${32 - gap - 2.5}" y="${y}" width="5" height="7" rx="2" fill="${k}"/><rect x="${32 + gap - 2.5}" y="${y}" width="5" height="7" rx="2" fill="${k}"/>`;
  const head = (r = 19, cy = 37) => `<circle cx="32" cy="${cy}" r="${r}" fill="${c}" ${st}/>`;
  const art = {
    bird: `${head()}<path d="M49 36l11 4-11 4z" fill="${a}" ${st}/>${eyesS()}`,
    bunny: `<ellipse cx="23" cy="13" rx="5.5" ry="13" fill="${c}" ${st}/><ellipse cx="41" cy="13" rx="5.5" ry="13" fill="${c}" ${st}/><ellipse cx="23" cy="14" rx="2.5" ry="9" fill="${a}"/><ellipse cx="41" cy="14" rx="2.5" ry="9" fill="${a}"/>${head(18, 40)}${eyesS(36)}<circle cx="32" cy="46" r="2.5" fill="${a}"/>`,
    slime: `<path d="M12 52Q10 26 32 20Q54 26 52 52z" fill="${c}" opacity=".9" ${st}/><circle cx="44" cy="30" r="4" fill="${a}"/>${eyesS(36)}`,
    cat: `<path d="M15 26l3-15 11 9zM49 26l-3-15-11 9z" fill="${a}" ${st}/>${head()}${eyesS()}<path d="M29 45l3 2 3-2" fill="none" stroke="${k}" stroke-width="2"/>`,
    fox: `<path d="M13 28l2-19 13 11zM51 28l-2-19-13 11z" fill="${c}" ${st}/>${head()}<path d="M20 44q12 14 24 0q-12 4-24 0z" fill="${a}"/>${eyesS()}<circle cx="32" cy="47" r="2.5" fill="${k}"/>`,
    dog: `${head()}<ellipse cx="13" cy="36" rx="6" ry="11" fill="${a}" ${st}/><ellipse cx="51" cy="36" rx="6" ry="11" fill="${a}" ${st}/><ellipse cx="32" cy="46" rx="8" ry="6" fill="${a}"/><circle cx="32" cy="43" r="3" fill="${k}"/>${eyesS(31)}`,
    lizard: `<ellipse cx="32" cy="38" rx="22" ry="15" fill="${c}" ${st}/><circle cx="22" cy="28" r="6" fill="#fff" ${st}/><circle cx="42" cy="28" r="6" fill="#fff" ${st}/><circle cx="23" cy="29" r="2.5" fill="${k}"/><circle cx="41" cy="29" r="2.5" fill="${k}"/><path d="M22 44q10 5 20 0" fill="none" stroke="${k}" stroke-width="2"/>`,
    dragon: `<path d="M20 22l-5-15 12 11zM44 22l5-15-12 11z" fill="${a}" ${st}/><path d="M6 40l10-8v14zM58 40l-10-8v14z" fill="${a}" ${st}/>${head()}${eyesS()}`,
    frog: `<ellipse cx="32" cy="42" rx="23" ry="15" fill="${c}" ${st}/><circle cx="20" cy="26" r="8" fill="${c}" ${st}/><circle cx="44" cy="26" r="8" fill="${c}" ${st}/><circle cx="20" cy="26" r="3.5" fill="${k}"/><circle cx="44" cy="26" r="3.5" fill="${k}"/><path d="M20 46q12 7 24 0" fill="none" stroke="${a}" stroke-width="3"/>`,
    penguin: `<ellipse cx="32" cy="36" rx="18" ry="23" fill="${c}" ${st}/><ellipse cx="32" cy="42" rx="11" ry="15" fill="#fff"/><path d="M28 34h8l-4 6z" fill="${a}" ${st}/>${eyesS(25, 6)}`,
    bear: `<circle cx="16" cy="20" r="7" fill="${c}" ${st}/><circle cx="48" cy="20" r="7" fill="${c}" ${st}/>${head()}<ellipse cx="32" cy="45" rx="8" ry="6" fill="${a}"/><circle cx="32" cy="43" r="2.5" fill="${k}"/>${eyesS(31)}`,
    monkey: `<circle cx="12" cy="36" r="7" fill="${a}" ${st}/><circle cx="52" cy="36" r="7" fill="${a}" ${st}/>${head()}<ellipse cx="32" cy="41" rx="12" ry="10" fill="${a}"/>${eyesS(33)}<path d="M28 46q4 3 8 0" fill="none" stroke="${k}" stroke-width="2"/>`,
    pig: `<path d="M15 24l2-10 9 6zM49 24l-2-10-9 6z" fill="${a}" ${st}/>${head()}<ellipse cx="32" cy="44" rx="8" ry="6" fill="${a}" ${st}/><circle cx="29" cy="44" r="1.8" fill="${k}"/><circle cx="35" cy="44" r="1.8" fill="${k}"/>${eyesS(30)}`,
    turtle: `<ellipse cx="32" cy="40" rx="24" ry="16" fill="${a}" ${st}/><path d="M22 34l10-6 10 6-4 11H26z" fill="${c}" opacity=".8"/><circle cx="52" cy="28" r="8" fill="${c}" ${st}/><circle cx="54" cy="26" r="2" fill="${k}"/>`,
    crab: `<circle cx="10" cy="26" r="7" fill="${c}" ${st}/><circle cx="54" cy="26" r="7" fill="${c}" ${st}/><ellipse cx="32" cy="42" rx="21" ry="13" fill="${c}" ${st}/><circle cx="26" cy="24" r="4.5" fill="#fff" ${st}/><circle cx="38" cy="24" r="4.5" fill="#fff" ${st}/><circle cx="26" cy="25" r="2" fill="${k}"/><circle cx="38" cy="25" r="2" fill="${k}"/>`,
    owl: `<path d="M16 20l3-12 8 9zM48 20l-3-12-8 9z" fill="${c}" ${st}/><ellipse cx="32" cy="36" rx="20" ry="22" fill="${c}" ${st}/><circle cx="24" cy="30" r="7" fill="#fff" ${st}/><circle cx="40" cy="30" r="7" fill="#fff" ${st}/><circle cx="24" cy="30" r="3.5" fill="${k}"/><circle cx="40" cy="30" r="3.5" fill="${k}"/><path d="M29 38h6l-3 5z" fill="${a}"/>`,
    snake: `<path d="M8 50q12-14 24 0t24 0" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round"/><circle cx="46" cy="24" r="13" fill="${c}" ${st}/><circle cx="42" cy="21" r="2.5" fill="${k}"/><circle cx="51" cy="21" r="2.5" fill="${k}"/><path d="M46 32v6l-2 2m2-2l2 2" stroke="#ff3a3a" stroke-width="2" fill="none"/>`,
    unicorn: `<path d="M32 4l4 16h-8z" fill="${a}" ${st}/><path d="M14 30q-4-14 8-14" fill="${a}" ${st}/>${head()}${eyesS()}<ellipse cx="32" cy="47" rx="7" ry="4" fill="${a}" opacity=".6"/>`,
  }[P.kind] || `${head()}${eyesS()}`;
  return `<svg viewBox="0 0 64 64">${art}</svg>`;
}
function eggSvg(t) {
  const E = EGGS[t];
  const fill = E.pattern === 'rainbow' ? 'url(#rb)' : E.color;
  const defs = E.pattern === 'rainbow' ? '<defs><linearGradient id="rb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4f5a"/><stop offset=".25" stop-color="#ffe03a"/><stop offset=".5" stop-color="#5cd15a"/><stop offset=".75" stop-color="#3fa7ff"/><stop offset="1" stop-color="#a45cff"/></linearGradient></defs>' : '';
  return `<svg viewBox="0 0 64 64">${defs}<ellipse cx="32" cy="35" rx="18" ry="24" fill="${fill}" stroke="#16181d" stroke-width="3"/><circle cx="25" cy="28" r="4" fill="${E.spot}"/><circle cx="38" cy="40" r="5" fill="${E.spot}"/><circle cx="36" cy="22" r="3" fill="${E.spot}"/></svg>`;
}

function updateHud() {
  if (!me) return;
  $('money').textContent = fmt(me.money);
  $('inc').textContent = fmt(me.inc);
  $('spd').textContent = fmt(me.stat);
  $('fb').hidden = !me.fb; $('fbv').textContent = me.fb;
  const c = snap.cyc;
  $('cyc').textContent = fmtTime(c.left);
  $('cyc-icon').className = c.night ? 'sun' : 'moon';
  $('slot1').classList.toggle('cd', me.swingCd > 0.05);
  $('egg-badge').hidden = !((me.fr && me.fl === 0) || (me.pfr && me.pfl === 0));

  const mine = players.get(myId);
  if (mine?.cy) { $('carry').hidden = false; $('carry').textContent = `Carrying ${EGGS[mine.cy].name} — bring it home!`; }
  else $('carry').hidden = true;

  setLabel(fuseCount, me.fr ? (me.fl > 0 ? `Fusing ${fmtTime(me.fl)}` : 'Ready!') : `${me.fuse.length}/3`);
  setLabel(petFuseStatus, me.pfr ? (me.pfl > 0 ? `Fusing ${fmtTime(me.pfl)}` : 'Ready!') : 'Put in 3 pets');
  if ($('petfuse').open) renderPetFuse();

  // shop
  $('tread-lvl').textContent = me.tread;
  $('tread-max').textContent = TREADMILL.maxLevel;
  $('tread-gain').textContent = fmt(TREADMILL.gain(me.tread) * me.sm);
  $('tread-tier').textContent = TREADMILL.tiers[TREADMILL.tier(me.tread)];
  const tc = TREADMILL.cost(me.tread), nc = SHOP.nestCost(me.nests);
  const tmax = me.tread >= TREADMILL.maxLevel, nmax = me.nests >= me.maxNests;
  $('buy-tread').textContent = tmax ? 'MAX' : `$${fmt(tc)}`;
  $('buy-tread').disabled = tmax || me.money < tc;
  $('nest-n').textContent = me.nests;
  $('nest-max').textContent = me.maxNests;
  $('buy-nest').textContent = nmax ? 'MAX' : `$${fmt(nc)}`;
  $('buy-nest').disabled = nmax || me.money < nc;
  const rc = REBIRTH.cost(me.rebirths);
  $('rb-now').textContent = me.rebirths; $('rb-next').textContent = me.rebirths + 1;
  $('rb-mult').textContent = $('rb-mult2').textContent = String(+(1 + REBIRTH.boost * (me.rebirths + 1)).toFixed(2));
  $('do-rebirth').textContent = me.money >= rc ? `REBIRTH ($${fmt(rc)})` : `Need $${fmt(rc)}`;
  $('do-rebirth').disabled = me.money < rc;
  if ($('shop').open) renderPasses();
  if ($('inv').open) renderInv();
  if ($('index').open) renderIndex();
}

let plistKey = '';
function renderPlayerList() {
  const ps = [...snap.players].sort((a, b) => b.m - a.m);
  $('pcount').textContent = `${ps.length}/${MAX_PLAYERS}`;
  let html = ps.map((p) => `<li class="${p.id === myId ? 'me' : ''}"><span class="dot" style="background:${p.c}"></span><span class="nm">${p.rb ? `<span class="rb">R${p.rb}</span>` : ''}${p.vip ? '👑' : ''}${esc(p.n)}</span><span class="mn">$${fmt(p.m)}</span></li>`).join('');
  if (ps.length === 1) html += '<li class="hint">Nobody else here yet — press Invite and send the link to friends!</li>';
  $('plist').classList.toggle('solo', ps.length === 1);
  if (html !== plistKey) { plistKey = html; $('plist-rows').innerHTML = html; }
}
$('btn-invite').addEventListener('click', async () => {
  const link = `${location.origin}/?server=${myServer}`;
  try { await navigator.clipboard.writeText(link); toast(`Link copied! Friends who open it join you on Server ${myServer}.`, 'money'); }
  catch { prompt('Send this link to your friends:', link); }
});

let invTab = 'eggs', invKey = '', indexKey = '';
function renderInv() {
  const pl = snap?.plots[myPlot];
  if (!pl) return;
  const mine = players.get(myId);
  const key = JSON.stringify([invTab, pl.e, pl.p, me.fuse, me.fr, me.fl, mine?.cy]);
  if (key === invKey) return;
  invKey = key;
  let h = '';
  if (invTab === 'eggs') {
    if (mine?.cy) h += `<div class="section">Carrying</div><div class="cards">${eggCard(mine.cy, 'In your hands')}</div>`;
    const nests = pl.e.slice(0, pl.n);
    h += `<div class="section">On your nests (${nests.filter(Boolean).length}/${pl.n})</div>`;
    h += nests.some(Boolean) ? `<div class="cards">${nests.filter(Boolean).map((e) => eggCard(e.t, e.h ? `Hatches in ${fmtTime(e.h)}` : 'Hatching!')).join('')}</div>` : '<p class="empty">No eggs yet. Go steal some!</p>';
    if (me.fuse.length || me.fr) {
      h += `<div class="section">Fuse Machine</div><div class="cards">`;
      h += me.fr ? eggCard(me.fr, me.fl ? `Ready in ${fmtTime(me.fl)}` : 'Ready to collect!') : me.fuse.map((t) => eggCard(t, 'Waiting to fuse')).join('');
      h += '</div>';
    }
  } else {
    h += `<button class="bulk" data-bulk>Sell all Common & Uncommon</button>`;
    h += `<div class="section">Pets (${pl.p.length}/24)</div>`;
    h += pl.p.length ? `<div class="cards">${pl.p.map((id, i) => {
      const P = PETS[id];
      return `<div class="card">${petSvg(id)}<div class="nm">${esc(P.name)}</div><span class="rar" style="background:${RARITY_COLORS[P.rarity]}">${P.rarity}</span>${P.fuse ? '<span class="rar fuse">Fuse only</span>' : ''}<div class="meta">$${fmt(P.income)}/s</div><button data-sell="${i}" data-rar="${P.rarity}">Sell $${fmt(petValue(id))}</button></div>`;
    }).join('')}</div>` : '<p class="empty">No pets yet. Eggs hatch into pets on your nests.</p>';
  }
  $('inv-body').innerHTML = h;
}
function eggCard(t, meta) {
  const tag = EGGS[t].fuseTier !== undefined ? '<span class="rar fuse">Fuse only</span>' : '';
  return `<div class="card">${eggSvg(t)}<div class="nm">${EGGS[t].name}</div>${tag}<div class="meta">${meta}</div></div>`;
}
function renderIndex() {
  const key = me.index.join(',');
  if (key === indexKey) return;
  indexKey = key;
  const ids = Object.keys(PETS);
  $('index-count').textContent = `${me.index.length}/${ids.length} discovered`;
  const card = (id) => {
    const P = PETS[id];
    const tag = P.fuse ? '<span class="rar fuse">Fuse only</span>' : '';
    if (!me.index.includes(id)) return `<div class="card unknown"><svg viewBox="0 0 64 64"><circle cx="32" cy="36" r="20" fill="#9aa5b8"/><text x="32" y="45" text-anchor="middle" font-size="26" font-weight="700" fill="#e8edf5" font-family="Fredoka, sans-serif">?</text></svg><div class="nm">???</div><span class="rar" style="background:${RARITY_COLORS[P.rarity]}">${P.rarity}</span>${tag}</div>`;
    return `<div class="card">${petSvg(id)}<div class="nm">${esc(P.name)}</div><span class="rar" style="background:${RARITY_COLORS[P.rarity]}">${P.rarity}</span>${tag}<div class="meta">$${fmt(P.income)}/s</div></div>`;
  };
  $('index-body').innerHTML =
    `<div class="section full">Canyon pets</div>${ids.filter((id) => !PETS[id].fuse).map(card).join('')}` +
    `<div class="section full">Fuse-only pets</div>${ids.filter((id) => PETS[id].fuse).map(card).join('')}`;
}

$('inv-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sell]');
  if (b) {
    if (['Legendary', 'Mythic', 'Secret'].includes(b.dataset.rar) && !confirm('Sell this pet? It is rare!')) return;
    socket.emit('sellPet', { i: Number(b.dataset.sell), id: snap.plots[myPlot].p[Number(b.dataset.sell)] });
    return;
  }
  if (e.target.closest('[data-bulk]')) socket.emit('sellWeak');
});
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  invTab = b.dataset.tab; invKey = '';
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  renderInv();
}));
function openInv(tab) {
  invTab = tab; invKey = '';
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  $('inv').showModal(); renderInv();
}
$('btn-inv').addEventListener('click', () => openInv('eggs'));
$('btn-eggs').addEventListener('click', () => openInv('eggs'));
$('btn-pets').addEventListener('click', () => openInv('pets'));
$('btn-index').addEventListener('click', () => { indexKey = ''; $('index').showModal(); renderIndex(); });
$('btn-shop').addEventListener('click', () => $('shop').showModal());
$('btn-settings').addEventListener('click', () => $('settings').showModal());
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('buy-tread').addEventListener('click', () => socket.emit('buy', 'tread'));
$('buy-nest').addEventListener('click', () => socket.emit('buy', 'nest'));
$('do-rebirth').addEventListener('click', () => {
  if (confirm('Rebirth? Your money, speed and treadmill go back to the start, but you keep your pets and get a permanent boost.')) socket.emit('rebirth');
});
document.querySelectorAll('[data-stab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-stab]').forEach((x) => x.classList.toggle('on', x === b));
  for (const t of ['up', 'rb', 'gp']) $(`stab-${t}`).hidden = t !== b.dataset.stab;
  if (b.dataset.stab === 'gp') { gpKey = ''; renderPasses(); }
}));

// ---------- gamepasses (real money) ----------
let gpKey = '', buying = null;
const zl = (grosze) => `${(grosze / 100).toFixed(2).replace('.', ',')} zł`;
function renderPasses() {
  const owned = me?.passes || [];
  const key = JSON.stringify([owned, !!me?.account]);
  if (key === gpKey) return;
  gpKey = key;
  $('gp-list').innerHTML = Object.entries(PASSES).map(([id, P]) => {
    const has = owned.includes(id);
    return `<div class="gp${has ? ' owned' : ''}"><div class="ic">${P.icon}</div><div class="tx"><h3>${esc(P.name)}</h3><p>${esc(P.desc)}</p></div>
      <button class="buy" data-pass="${id}" ${has ? 'disabled' : ''}>${has ? 'Owned ✓' : zl(P.price)}</button></div>`;
  }).join('');
}
$('gp-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pass]');
  if (!b) return;
  if (!auth.token) { openAccount('Make an account first, so your gamepass is saved and never lost.'); return; }
  buying = b.dataset.pass;
  const P = PASSES[buying];
  $('bp-info').innerHTML = `<span class="ic">${P.icon}</span><div><div><b>${esc(P.name)}</b></div><div>${esc(P.desc)}</div><div class="price">${zl(P.price)}</div><div class="fine">For account: <b>${esc(auth.user)}</b></div></div>`;
  $('bp-parent').checked = $('bp-now').checked = false;
  $('bp-go').disabled = true; $('bp-err').textContent = '';
  $('buypass').showModal();
});
for (const id of ['bp-parent', 'bp-now']) $(id).addEventListener('change', () => { $('bp-go').disabled = !($('bp-parent').checked && $('bp-now').checked); });
$('bp-go').addEventListener('click', async () => {
  $('bp-go').disabled = true; $('bp-err').textContent = 'Opening secure payment…';
  try {
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ pass: buying }) });
    const d = await r.json();
    if (d.url) { location.href = d.url; return; }
    $('bp-err').textContent = d.error || 'Something went wrong.';
  } catch { $('bp-err').textContent = 'Could not reach the server.'; }
  $('bp-go').disabled = false;
});

// ---------- accounts ----------
const auth = { token: localStorage.getItem('eh-token') || '', user: localStorage.getItem('eh-user') || '' };
function setAuth(token, user) {
  auth.token = token || ''; auth.user = user || '';
  try {
    if (token) { localStorage.setItem('eh-token', token); localStorage.setItem('eh-user', user); }
    else { localStorage.removeItem('eh-token'); localStorage.removeItem('eh-user'); }
  } catch {}
  renderAcct();
}
function renderAcct() {
  if (auth.token) {
    $('acct').innerHTML = `Logged in as <b>${esc(auth.user)}</b> <button class="ghost" id="acct-out">Log out</button>`;
    $('name').value = auth.user; $('name').disabled = true;
    $('set-acct-text').textContent = `Logged in as ${auth.user}. Your progress is saved online.`;
    $('set-acct').textContent = 'Log out';
  } else {
    $('acct').innerHTML = `Save your progress online: <button id="acct-in">Log in / Sign up</button>`;
    $('name').disabled = false;
    $('set-acct-text').textContent = 'Playing as a guest — progress is only saved in this browser.';
    $('set-acct').textContent = 'Log in';
  }
}
$('acct').addEventListener('click', (e) => {
  if (e.target.id === 'acct-in') openAccount();
  if (e.target.id === 'acct-out') logout();
});
$('set-acct').addEventListener('click', () => (auth.token ? logout() : openAccount()));
function openAccount(why) {
  $('acc-why').textContent = why || 'An account saves your progress online and lets you use gamepasses on any device.';
  $('acc-err').textContent = '';
  $('account').showModal();
}
async function logout() {
  try { await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` } }); } catch {}
  setAuth('', '');
  location.href = location.origin;
}
async function accountSubmit(kind) {
  const username = $('acc-user').value.trim(), password = $('acc-pass').value;
  $('acc-err').textContent = '';
  try {
    const r = await fetch(`/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, save: kind === 'signup' ? readSave() : undefined }) });
    const d = await r.json();
    if (!r.ok) { $('acc-err').textContent = d.error || 'Something went wrong.'; return; }
    setAuth(d.token, d.username);
    $('account').close();
    if (joined) location.reload(); // rejoin with the account's progress
  } catch { $('acc-err').textContent = 'Could not reach the server.'; }
}
$('acc-login').addEventListener('click', () => accountSubmit('login'));
$('acc-signup').addEventListener('click', () => accountSubmit('signup'));
renderAcct();

$('set-shadows').addEventListener('click', () => {
  sun.castShadow = !sun.castShadow;
  $('set-shadows').textContent = sun.castShadow ? 'On' : 'Off';
});
$('set-server').addEventListener('click', () => { location.href = location.origin; });
$('set-reset').addEventListener('click', () => {
  if (!confirm('Delete all your progress?')) return;
  resetting = true;
  try { localStorage.removeItem('eh-save'); } catch {}
  location.reload();
});

function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  const box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'alert' ? 4000 : 3000);
}

function setSlow(on) {
  slow = on;
  $('slow').setAttribute('aria-checked', String(on));
  socket.emit('slow', on);
}
$('slow').addEventListener('click', () => setSlow(!slow));

// what can I do right here?
function currentPrompt() {
  const v = players.get(myId);
  if (!v || !me) return null;
  const near = (p, r) => (myPos.x - p.x) ** 2 + (myPos.z - p.z) ** 2 < r * r;
  if (near(treadBoardPos(myPlot), 3.5)) {
    return me.tread >= TREADMILL.maxLevel ? { text: 'Treadmill is maxed!', key: false }
      : { text: `Upgrade Treadmill — $${fmt(TREADMILL.cost(me.tread))}`, key: true };
  }
  if (onTreadmill(myPlot, myPos.x, myPos.z)) return { text: `Running! +${fmt(TREADMILL.gain(me.tread))} speed/s`, key: false };
  if (v.cy && near(SELL_POS, 6)) return { text: `Sell ${EGGS[v.cy].name} for $${fmt(EGGS[v.cy].value)}`, key: true };
  if (near(FUSE_POS, 6)) {
    if (v.cy) return me.fr || me.fuse.length >= 3 ? { text: 'Fuse Machine is busy', key: false } : { text: `Put ${EGGS[v.cy].name} in (${me.fuse.length}/3)`, key: true };
    if (me.fr) return me.fl > 0 ? { text: `Fusing… ${fmtTime(me.fl)}`, key: false } : { text: `Collect ${EGGS[me.fr].name}`, key: true };
    if (me.fuse.length) return { text: 'Take egg back out', key: true };
    return { text: 'Bring 3 eggs to fuse them into a better one', key: false };
  }
  if (near(PET_FUSE_POS, 6)) {
    if (me.pfr) return me.pfl > 0 ? { text: `Fusing pets… ${fmtTime(me.pfl)}`, key: false } : (v.cy ? { text: 'Your hands are full', key: false } : { text: `Collect ${EGGS[me.pfr].name}`, key: true });
    return { text: 'Fuse 3 pets into a special egg', key: true };
  }
  if (!v.cy) {
    for (let pl = 0; pl < snap.plots.length; pl++) {
      const P = snap.plots[pl];
      if (!P || pl === myPlot || !insidePlot(pl, myPos.x, myPos.z)) continue;
      for (let n = 0; n < P.e.length; n++) {
        if (P.e[n] && near(nestPos(pl, n), 3.4)) return { text: `Steal ${EGGS[P.e[n].t].name}`, key: true };
      }
    }
  }
  return null;
}
function doInteract() {
  const near = (p, r) => (myPos.x - p.x) ** 2 + (myPos.z - p.z) ** 2 < r * r;
  if (me && !me.pfr && near(PET_FUSE_POS, 6)) { openPetFuse(); return; }
  socket.emit('interact');
}

// ---------- Pet Fuser window ----------
let pfPick = [], pfKey = '';
function openPetFuse() { pfPick = []; pfKey = ''; $('petfuse').showModal(); renderPetFuse(); }
function renderPetFuse() {
  const pl = snap?.plots[myPlot];
  if (!pl) return;
  pfPick = pfPick.filter((i) => i < pl.p.length);
  const key = JSON.stringify([pl.p, pfPick, me.pfr]);
  if (key === pfKey) return;
  pfKey = key;
  const preview = pfPick.length === 3 ? petFuseResult(pfPick.map((i) => pl.p[i])) : null;
  $('pf-slots').innerHTML = [0, 1, 2].map((k) => {
    const i = pfPick[k];
    return i === undefined ? '<div class="pf-slot empty">?</div>' : `<div class="pf-slot">${petSvg(pl.p[i])}</div>`;
  }).join('<span class="plus">+</span>') + `<span class="plus">=</span><div class="pf-slot result">${preview ? eggSvg(preview) : '?'}</div>`;
  $('pf-result').textContent = preview ? `You'll get a ${EGGS[preview].name}!` : 'Pick 3 pets. Rarer pets make a better egg.';
  $('pf-go').disabled = !preview || !!me.pfr;
  $('pf-go').textContent = me.pfr ? 'Fuser is busy' : 'FUSE';
  $('pf-list').innerHTML = pl.p.length ? pl.p.map((id, i) => {
    const P = PETS[id];
    return `<button class="card pick${pfPick.includes(i) ? ' on' : ''}" data-i="${i}">${petSvg(id)}<div class="nm">${esc(P.name)}</div><span class="rar" style="background:${RARITY_COLORS[P.rarity]}">${P.rarity}</span></button>`;
  }).join('') : '<p class="empty">You have no pets yet.</p>';
}
$('pf-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const i = Number(b.dataset.i);
  pfPick = pfPick.includes(i) ? pfPick.filter((x) => x !== i) : pfPick.length < 3 ? [...pfPick, i] : pfPick;
  pfKey = ''; renderPetFuse();
});
$('pf-go').addEventListener('click', () => {
  const pl = snap?.plots[myPlot];
  if (!pl || pfPick.length !== 3) return;
  const rare = pfPick.some((i) => RARITY_ORDER.indexOf(PETS[pl.p[i]].rarity) >= 4);
  if (rare && !confirm('This will use up a Legendary or better pet. Continue?')) return;
  socket.emit('petFuse', pfPick.map((i) => ({ i, id: pl.p[i] })));
  $('petfuse').close();
});

let promptText = '';
function updatePrompt() {
  const p = currentPrompt();
  const html = p ? `${p.key ? '<kbd>E</kbd>' : ''}${esc(p.text)}` : '';
  if (html !== promptText) {
    promptText = html;
    $('prompt').hidden = !p;
    $('prompt').innerHTML = html;
    $('t-e').textContent = p?.key ? p.text.split(' ')[0] : 'E';
  }
}

// =====================================================================
// Input
// =====================================================================
const keys = new Set();
const CAM = { min: 8, max: 45, dragSpeed: 0.006, keySpeed: 2.4, minPitch: -0.15, maxPitch: 1.35 };
let yaw = 0, pitch = 0.42, camDist = 24, camActual = 24;
const stickVec = { x: 0, y: 0 };
const typing = (e) => e.target.tagName === 'INPUT' || document.querySelector('dialog[open]');
addEventListener('keydown', (e) => {
  if (typing(e)) return;
  keys.add(e.code);
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyE') doInteract();
  if (e.code === 'KeyF' || e.code === 'Space') { e.preventDefault(); socket.emit('swing'); }
  if (e.code === 'KeyQ') setSlow(!slow);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Camera: drag with right mouse button (or left, a quick left click swings the bat),
// one finger on touch, two fingers to pinch-zoom, mouse wheel to zoom, arrow keys to turn.
const touches = new Map();
let drag = null, pinch = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = Math.hypot(a.x - b.x, a.y - b.y);
    drag = null;
  } else {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2 && pinch) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    camDist = Math.max(CAM.min, Math.min(CAM.max, camDist * (pinch / d)));
    pinch = d;
    return;
  }
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  if (drag.button === 0 && e.pointerType === 'mouse' && drag.moved < 6) return; // still might be a click
  turnCamera(dx * CAM.dragSpeed, dy * CAM.dragSpeed * 0.7);
});
function endPointer(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = 0;
  if (drag && e.pointerId === drag.id) {
    if (drag.moved < 6 && drag.button === 0 && e.pointerType === 'mouse' && joined) socket.emit('swing');
    drag = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { camDist = Math.max(CAM.min, Math.min(CAM.max, camDist + e.deltaY * 0.03)); }, { passive: true });
function turnCamera(dx, dy) {
  yaw -= dx;
  pitch = Math.max(CAM.minPitch, Math.min(CAM.maxPitch, pitch + dy));
}

const stick = $('stick'), knob = $('knob');
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2, l = Math.hypot(dx, dy);
  if (l > max) { dx *= max / l; dy *= max / l; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  stickVec.x = dx / max; stickVec.y = dy / max;
}
stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; stickVec.x = stickVec.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
$('t-e').addEventListener('pointerdown', (e) => { e.preventDefault(); doInteract(); });
$('t-swing').addEventListener('pointerdown', (e) => { e.preventDefault(); socket.emit('swing'); });
$('slot1').addEventListener('click', () => socket.emit('swing'));

function moveVector() {
  let f = 0, r = 0;
  if (keys.has('KeyW')) f += 1;
  if (keys.has('KeyS')) f -= 1;
  if (keys.has('KeyD')) r += 1;
  if (keys.has('KeyA')) r -= 1;
  f -= stickVec.y; r += stickVec.x;
  const s = Math.sin(yaw), c = Math.cos(yaw);
  let x = -s * f + c * r, z = -c * f - s * r;
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return { x, z };
}

// =====================================================================
// Networking
// =====================================================================
const socket = io();
let joined = false, resetting = false, lastInput = { x: 9, z: 9 }, lastInputAt = 0;
const readSave = () => { try { return JSON.parse(localStorage.getItem('eh-save') || 'null'); } catch { return null; } };
// ?server=3 in the link = join that server (used by Invite links)
const linkServer = new URLSearchParams(location.search).get('server');
let paidParam = new URLSearchParams(location.search).get('paid');
let myServer = null;
function join(server = myServer || linkServer || undefined) {
  const name = $('name').value.trim() || 'Player';
  try { localStorage.setItem('eh-name', name); } catch {}
  $('start-msg').textContent = '';
  socket.emit('join', auth.token ? { token: auth.token, server } : { name, save: readSave(), server });
}
socket.on('connect', () => { if (joined) { joined = false; join(myServer); } });
socket.on('welcome', ({ id, plot, server }) => {
  joined = true; myId = id; myPlot = plot; myServer = server;
  $('sname').textContent = `Server ${server}`;
  history.replaceState(null, '', `?server=${server}`);
  const c = plotCenter(plot);
  myPos.x = c.x - c.side * 10; myPos.z = c.z;
  yaw = c.side * Math.PI / 2;
  $('start').hidden = true; $('hud').hidden = false;
  if (slow) socket.emit('slow', true);
  if (paidParam) {
    toast(paidParam === 'cancel' ? 'Payment cancelled — nothing was charged.' : `Payment received! ${PASSES[paidParam]?.name || 'Your gamepass'} turns on in a few seconds.`, paidParam === 'cancel' ? 'info' : 'big');
    paidParam = null;
  }
});
socket.on('kicked', (msg) => { joined = false; myServer = null; $('start').hidden = false; $('hud').hidden = true; $('start-msg').textContent = msg; });
socket.on('loggedOut', () => { setAuth('', ''); $('start').hidden = false; $('hud').hidden = true; joined = false; $('start-msg').textContent = 'Please log in again.'; openAccount('Your login expired — please log in again.'); });
socket.on('joinError', (msg) => {
  if (joined || myServer) { joined = false; myServer = null; $('start').hidden = false; $('hud').hidden = true; }
  $('start-msg').textContent = msg;
});
socket.on('servers', (list) => {
  const ul = $('server-list');
  if (!list.length) { ul.innerHTML = '<li class="loading">No servers yet — press Play!</li>'; return; }
  ul.innerHTML = list.map((g) => {
    const full = g.players >= g.max;
    const mine = String(g.id) === String(linkServer);
    return `<li class="${mine ? 'mine' : ''}"><span>Server ${g.id}${mine ? ' (invited)' : ''}</span><span class="bar"><i style="width:${(g.players / g.max) * 100}%"></i></span><span class="cnt">${g.players}/${g.max}</span><button data-server="${g.id}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Join'}</button></li>`;
  }).join('');
});
$('server-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-server]');
  if (b) join(Number(b.dataset.server));
});
$('new-server').addEventListener('click', () => join('new'));
socket.on('s', applySnapshot);
socket.on('toast', ({ text, kind }) => toast(text, kind));
socket.on('save', (s) => { if (!resetting) try { localStorage.setItem('eh-save', JSON.stringify(s)); } catch {} });
socket.on('fx', (f) => {
  if (f.type === 'hatch') {
    const big = f.big || ['Mythic', 'Secret', 'Divine', 'Omega'].includes(f.rarity);
    confetti(f.x, f.z, big ? 120 : 40, f.rarity && !big ? [RARITY_COLORS[f.rarity], '#ffffff', '#ffe03a'] : CONFETTI);
  } else spawnRing(f.x, f.z);
});
socket.on('disconnect', () => { if (joined) toast('Connection lost — reconnecting…', 'alert'); });
if (!auth.token) $('name').value = localStorage.getItem('eh-name') || '';
$('play').addEventListener('click', () => join());
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
if (linkServer) $('play').textContent = `JOIN SERVER ${linkServer}`;

const rings = [], pops = [];
function spawnSpeedPop(v, mine) {
  const gain = (v.tg || 10) * 0.5;
  const s = makeLabel(`👟 +${fmt(gain)}`, { size: 40, color: '#ffffff', temp: true, scale: mine ? 1.2 : 0.9 });
  const b = v.body.position;
  s.position.set(b.x + (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.2), 7.4 + Math.random() * 0.8, b.z + (Math.random() - 0.5) * 1.5);
  scene.add(s);
  pops.push({ s, t: 0 });
}
function spawnRing(x, z) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.3, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.2, z);
  scene.add(m); rings.push({ m, t: 0 });
}

// =====================================================================
// Main loop
// =====================================================================
buildWorld();
buildDecor();
buildPlots();
buildGuardians();
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();

// Is this camera position inside the open play area (not inside/behind a wall)?
function camSpotOk(x, y, z) {
  if (z <= SAFE_Z + 0.5) {
    if (y > 26) return true; // above the plaza walls
    return Math.abs(x) <= PLAZA_HALF_X + 0.5 && z >= PLAZA_MIN_Z - 0.5 && (z <= SAFE_Z - 0.3 || Math.abs(x) <= CORRIDOR_HALF + 0.5);
  }
  if (y > 36) return true; // above the canyon walls
  return Math.abs(x) <= CORRIDOR_HALF + 0.5 && z <= WORLD_END_Z - 0.5;
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const smooth = 1 - Math.exp(-dt * 12);

  // my player: predict locally, gently correct toward the server
  const mine = players.get(myId);
  if (joined && mine) {
    const mv = moveVector();
    const now = performance.now();
    if (Math.abs(mv.x - lastInput.x) > 0.01 || Math.abs(mv.z - lastInput.z) > 0.01 || now - lastInputAt > 250) {
      socket.emit('input', mv); lastInput = mv; lastInputAt = now;
    }
    let sp = walkSpeed(me?.stat || 0) * (slow ? SLOW_MULT : 1) * (mine.cy ? CARRY_MULT : 1);
    if (mine.st) sp = 0;
    const ox = myPos.x, oz = myPos.z;
    [myPos.x, myPos.z] = clampMove(ox, oz, ox + mv.x * sp * dt, oz + mv.z * sp * dt);
    if (mv.x || mv.z) myPos.rot = Math.atan2(mv.x, mv.z);
    if (mine.sx !== undefined) {
      const ex = mine.sx - myPos.x, ez = mine.sz - myPos.z;
      if (Math.hypot(ex, ez) > 6) { myPos.x = mine.sx; myPos.z = mine.sz; }
      else { myPos.x += ex * 0.06; myPos.z += ez * 0.06; }
    }
    mine.tx = myPos.x; mine.tz = myPos.z; mine.tr = myPos.rot;
    updatePrompt();
  }

  for (const [id, v] of players) {
    const px = v.body.position.x, pz = v.body.position.z;
    const nx = id === myId ? v.tx : px + (v.tx - px) * smooth;
    const nz = id === myId ? v.tz : pz + (v.tz - pz) * smooth;
    const sp = Math.hypot(nx - px, nz - pz) / Math.max(dt, 1e-4);
    v.speed += (sp - v.speed) * 0.25;
    v.body.position.set(nx, 0, nz);
    let dr = (v.tr ?? 0) - v.body.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    v.body.rotation.y += dr * smooth * 1.5;
    v.body.rotation.z = v.st ? Math.sin(t * 25) * 0.15 : 0;
    animateAvatar(v.body, v.run ? 24 : v.speed, dt, v.sw, !!v.cy);
    if (v.speed > 10 && !v.run) { v.puffT = (v.puffT || 0) - dt; if (v.puffT <= 0) { v.puffT = 0.12; puff(nx, nz); } }
    if (id !== myId) {
      // keep other players' name tags a readable size, however far away they are
      const bs = v.label.userData.bs || (v.label.userData.bs = v.label.scale.clone());
      const d = camera.position.distanceTo(v.body.position);
      const k = Math.max(1, d / 30);
      v.label.scale.set(bs.x * k, bs.y * k, 1);
    }
    if (v.run) {
      v.pop = (v.pop || 0) - dt;
      if (v.pop <= 0) { v.pop = 0.5; spawnSpeedPop(v, id === myId); }
    }
    if (v.egg) v.egg.rotation.y += dt;
  }

  for (const g of guardians) {
    const h = g.holder;
    const ox = h.position.x, oz = h.position.z;
    h.position.x += (g.tx - ox) * smooth; h.position.z += (g.tz - oz) * smooth;
    const moving = Math.hypot(h.position.x - ox, h.position.z - oz) > dt * 2;
    let dr = g.tr - h.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    h.rotation.y += dr * smooth;
    const asleep = g.s === 'sleep';
    g.zzz.visible = asleep; g.alert.visible = g.s === 'chase' || g.s === 'wake';
    g.body.position.y = g.s === 'chase' ? Math.abs(Math.sin(t * 8)) * 0.4 : 0;
    if (g.s === 'wake') g.body.rotation.z = Math.sin(t * 30) * 0.04; else g.body.rotation.z = 0;
    g.body.scale.y = g.scale * GSIZE * (asleep ? 0.9 + Math.sin(t * 1.5) * 0.03 : 1);
    g.zzz.position.y = g.top + 3 + Math.sin(t * 1.5) * 0.4;
    animateCreature(g.body, moving, t, dt);
  }

  for (const v of fieldEggs.values()) { v.egg.rotation.y += dt * 0.6; v.egg.position.y = 1.42 + Math.sin(t * 2 + v.g.position.x) * 0.08; }

  for (const pv of plots) for (const p of pv.pets) {
    const dx = p.tx - p.g.position.x, dz = p.tz - p.g.position.z, l = Math.hypot(dx, dz);
    if (l < 0.2) {
      p.wait -= dt;
      animateCreature(p.g, false, t, dt);
      if (p.wait <= 0) { const s = randomPetSpot(pv.c); p.tx = s.x; p.tz = s.z; p.wait = 2 + Math.random() * 4; }
    } else {
      const step = Math.min(l, 2.5 * dt);
      p.g.position.x += (dx / l) * step; p.g.position.z += (dz / l) * step;
      p.g.rotation.y = Math.atan2(dx, dz);
      p.g.position.y = Math.abs(Math.sin(t * 10)) * 0.15;
      animateCreature(p.g, true, t, dt);
    }
  }

  for (const pv of plots) {
    const m = pv.treadModel;
    if (!m) continue;
    if (pv.running) m.userData.belt.offset.y -= dt * 1.6;
    m.children.forEach((o) => {
      if (o.userData.flame) o.scale.y = 1 + Math.sin(t * 14 + o.position.x) * 0.2;
      if (o.userData.spin) o.rotation.z += dt;
      if (o.userData.float !== undefined) o.position.y = 2 + (o.userData.float % 3) + Math.sin(t * 2 + o.userData.float) * 0.3;
    });
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt;
    p.s.position.y += dt * 2.6;
    p.s.material.opacity = Math.max(0, 1 - p.t / 1.1);
    if (p.t > 1.1) { scene.remove(p.s); p.s.material.map?.dispose(); p.s.material.dispose(); pops.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    r.m.scale.setScalar(1 + r.t * 10); r.m.material.opacity = 1 - r.t / 0.45;
    if (r.t > 0.45) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }

  // day / night
  nightLerp += ((snap?.cyc.night ? 1 : 0) - nightLerp) * Math.min(1, dt * 0.6);
  skyUniforms.top.value.copy(SKY.dayTop).lerp(SKY.nightTop, nightLerp);
  skyUniforms.bottom.value.copy(SKY.dayBottom).lerp(SKY.nightBottom, nightLerp);
  scene.background.copy(skyUniforms.bottom.value);
  scene.fog.color.copy(skyUniforms.bottom.value);
  stars.material.opacity = nightLerp;
  for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 380) c.position.x = -380; }
  hemi.intensity = 1.15 - nightLerp * 0.7;
  sun.intensity = 1.7 - nightLerp * 1.3;
  fuseGlow.material.color.setScalar(0.85 + Math.sin(t * 3) * 0.15);

  // camera
  const focus = mine ? mine.body.position : tmpV.set(0, 0, -60);
  if (!joined) yaw += dt * 0.05;
  if (joined && !document.querySelector('dialog[open]')) {
    const kx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const ky = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    if (kx || ky) turnCamera(kx * CAM.keySpeed * dt, ky * CAM.keySpeed * 0.6 * dt);
  }
  const want = joined ? camDist : 90;
  const ph = joined ? pitch : 0.5;
  const dir = { x: Math.sin(yaw) * Math.cos(ph), y: Math.sin(ph), z: Math.cos(yaw) * Math.cos(ph) };
  const fy = focus.y + 3.5;
  // pull the camera in so it never ends up inside or behind a wall
  let allowed = want;
  if (joined) {
    // walk out from the player toward the camera and stop at the first wall
    for (let d = 0.5; d <= want; d += 0.5) {
      if (!camSpotOk(focus.x + dir.x * d, fy + dir.y * d, focus.z + dir.z * d)) { allowed = Math.max(1.5, d - 0.8); break; }
    }
  }
  camActual = allowed < camActual ? allowed : camActual + (allowed - camActual) * Math.min(1, dt * 4);
  camera.position.set(focus.x + dir.x * camActual, Math.max(0.8, fy + dir.y * camActual), focus.z + dir.z * camActual);
  camera.lookAt(focus.x, fy, focus.z);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  animateDecor(t, dt, nightLerp);
  updateParticles(dt);
  sun.position.set(focus.x + 40, 80, focus.z + 25);
  sun.target.position.set(focus.x, 0, focus.z);

  renderer.render(scene, camera);
}
frame();
