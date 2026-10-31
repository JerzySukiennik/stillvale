// Stillvale - camera-following instanced grass and wildflowers with wind and push-away.
import * as THREE from 'three';
import { rng } from './noise.js';
import { FIELD, SUN_DIR } from './world.js';

const MAX_PUSH = 12;

function clumpGeometry(blades, segs, seed, widthMul) {
  const r = rng(seed);
  const pos = [], blade = [], nrm = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const ang = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * 0.17;
    const rx = Math.cos(ang) * rad, rz = Math.sin(ang) * rad;
    const face = r() * Math.PI * 2;
    const fx = Math.cos(face), fz = Math.sin(face);
    const wx = -fz, wz = fx;
    const w = (0.045 + r() * 0.03) * widthMul;
    const hf = 0.62 + r() * 0.38;
    const lean = face + (r() - 0.5) * 0.8;
    const base = pos.length / 3;
    for (let l = 0; l <= segs; l++) {
      const t = l / segs;
      const hw = l === segs ? 0 : (w / 2) * (1 - Math.pow(t, 1.6) * 0.82);
      const sides = l === segs ? [0] : [-1, 1];
      for (const s of sides) {
        pos.push(rx + wx * hw * s, t, rz + wz * hw * s);
        blade.push(t, s, hf, lean);
        nrm.push(fx, 0, fz);
      }
    }
    for (let l = 0; l < segs; l++) {
      const a = base + l * 2;
      if (l === segs - 1) idx.push(a, a + 1, a + 2);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
  g.setIndex(idx);
  return g;
}

function flowerGeometry() {
  const pos = [], blade = [], nrm = [], idx = [];
  const add = (x, y, z, t, part) => {
    pos.push(x, y, z);
    blade.push(t, part, 1, 0);
    nrm.push(0, 1, 0);
    return pos.length / 3 - 1;
  };
  const sw = 0.008;
  const a = add(-sw, 0, 0, 0, 0), b = add(sw, 0, 0, 0, 0), c = add(-sw, 1, 0, 1, 0), d = add(sw, 1, 0, 1, 0);
  idx.push(a, b, c, b, d, c);
  const e = add(0, 0, -sw, 0, 0), f = add(0, 0, sw, 0, 0), g2 = add(0, 1, -sw, 1, 0), h = add(0, 1, sw, 1, 0);
  idx.push(e, f, g2, f, h, g2);
  const R = 0.055;
  for (let k = 0; k < 2; k++) {
    const an = (k * Math.PI) / 2 + 0.4;
    const cx = Math.cos(an) * R, cz = Math.sin(an) * R;
    const p0 = add(-cx, 1, -cz, 1, 1), p1 = add(cx, 1, cz, 1, 1);
    const p2 = add(-cz * 0.9, 1, cx * 0.9, 1, 1), p3 = add(cz * 0.9, 1, -cx * 0.9, 1, 1);
    idx.push(p0, p2, p1, p0, p1, p3);
  }
  const ctr = add(0, 1, 0, 1.02, 2), c1 = add(-0.018, 1, 0, 1.02, 2), c2 = add(0.009, 1, 0.016, 1.02, 2), c3 = add(0.009, 1, -0.016, 1.02, 2);
  idx.push(ctr, c1, c2, ctr, c2, c3, ctr, c3, c1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
  geo.setIndex(idx);
  return geo;
}

function gridInstances(geo, n, hole) {
  const arr = [];
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const d = Math.hypot(i, j);
      if (d > n + 0.5 || d < hole) continue;
      arr.push(i, j);
    }
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(new Float32Array(arr), 2));
  geo.instanceCount = arr.length / 2;
}

const COMMON = /* glsl */ `
attribute vec4 aBlade;
attribute vec2 aCell;
uniform sampler2D uHeight;
uniform sampler2D uMask;
uniform sampler2D uNoise;
uniform vec3 uCam;
uniform float uSpacing;
uniform float uRadius;
uniform float uInner;
uniform float uTime;
uniform vec2 uWind;
uniform vec4 uPush[${MAX_PUSH}];
uniform vec4 uBus;
uniform vec3 uBusSize;
uniform vec3 uSunDir;
varying vec3 vGrass;
varying float vBack;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

function grassVertex(kind) {
  const flower = kind === 'flower';
  return /* glsl */ `
vec2 gcell = floor(uCam.xz / uSpacing) + aCell;
float g1 = gHash(gcell), g2 = gHash(gcell + 17.31), g3 = gHash(gcell + 41.77), g4 = gHash(gcell + 7.13);
vec2 wp = (gcell + vec2(g1, g2)) * uSpacing;
float dist = length(wp - uCam.xz);
vec2 fuv = (wp + ${FIELD.toFixed(1)}) / ${(FIELD * 2).toFixed(1)};
vec4 gm = texture2D(uMask, fuv);
float ground = texture2D(uHeight, fuv).r;
float fade = smoothstep(uRadius, uRadius * 0.78, dist);
if (uInner > 0.0) fade *= smoothstep(uInner * 0.8, uInner * 1.05, dist);
float inside = 1.0 - step(1.0, max(abs(fuv.x - 0.5), abs(fuv.y - 0.5)) * 2.0);
${flower
    ? `float bloom = smoothstep(0.42, 0.72, texture2D(uNoise, wp * 0.021 + 0.37).g) * gm.b;
float keep = step(g3, bloom * 0.9) * inside;
float height = (0.28 + 0.3 * g4) * mix(1.0, 1.45, gm.a) * keep * fade;`
    : `float keep = step(g3, gm.b) * inside;
float height = mix(0.34, 0.68, g4) * mix(1.0, 2.25, gm.a * gm.a) * keep * fade;`}
float alive = step(0.004, height);
float t = aBlade.x;
float rot = g1 * 6.2831;
float cr = cos(rot), sr = sin(rot);
vec3 lp = position;
lp.xz = vec2(lp.x * cr - lp.z * sr, lp.x * sr + lp.z * cr) * mix(0.8, 1.5, gm.a) * (0.65 + 0.6 * height) * alive;
float hgt = height * ${flower ? '1.0' : 'aBlade.z'};
float leanA = aBlade.w + rot;
vec2 bend = vec2(cos(leanA), sin(leanA)) * ${flower ? '0.08' : '0.22'};
float wave = sin(uTime * 1.25 + dot(wp, uWind) * 0.085) * 0.5 + 0.5;
float gust = wave * (0.55 + 0.45 * sin(uTime * 0.31 + wp.x * 0.011 - wp.y * 0.007));
bend += uWind * (0.12 + gust * 0.55) + vec2(sin(uTime * 3.7 + g2 * 40.0), cos(uTime * 3.1 + g1 * 40.0)) * 0.035;
float flatK = 0.0;
for (int i = 0; i < ${MAX_PUSH}; i++) {
  vec4 P = uPush[i];
  vec2 d = wp - P.xy;
  float l = length(d);
  float f = (1.0 - smoothstep(P.z * 0.35, P.z, l)) * P.w;
  bend += (d / max(l, 0.05)) * f * 1.3;
  flatK = max(flatK, f * 0.35);
}
vec2 bl = wp - uBus.xy;
vec2 bq = vec2(bl.x * uBus.z - bl.y * uBus.w, bl.x * uBus.w + bl.y * uBus.z);
float inBus = (1.0 - smoothstep(uBusSize.x, uBusSize.x + 0.7, abs(bq.x))) * (1.0 - smoothstep(uBusSize.y, uBusSize.y + 0.7, abs(bq.y))) * uBusSize.z;
flatK = max(flatK, inBus * 0.9);
hgt *= 1.0 - flatK;
float bl2 = min(length(bend), 1.4);
vec3 offs = vec3(bend.x, 0.0, bend.y) * t * t * hgt;
lp.y = t * hgt * (1.0 - 0.28 * bl2 * t);
vec3 gw = vec3(wp.x, ground - 0.03, wp.y) + lp + offs;
`;
}

function makeMaterial(kind, uniforms) {
  const flower = kind === 'flower';
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON)
      .replace('#include <beginnormal_vertex>', grassVertex(kind) + `
vec3 objectNormal = normalize(vec3(normal.x * cr - normal.z * sr, 0.0, normal.x * sr + normal.z * cr) * 0.35 + vec3(0.0, 1.0, 0.0));`)
      .replace('#include <begin_vertex>', `vec3 transformed = gw;
vec3 dry = texture2D(uNoise, wp * 0.0045).rgb;
float dryK = smoothstep(0.5, 0.78, dry.r) * 0.75;
${flower
    ? `float part = aBlade.y;
vec3 petal = g4 < 0.46 ? vec3(0.92, 0.92, 0.86) : g4 < 0.74 ? vec3(0.95, 0.74, 0.12) : g4 < 0.88 ? vec3(0.42, 0.33, 0.85) : vec3(0.9, 0.42, 0.62);
vec3 stem = vec3(0.18, 0.33, 0.08);
vGrass = part < 0.5 ? stem * mix(0.5, 1.0, t) : part < 1.5 ? petal : vec3(0.95, 0.72, 0.1);`
    : `vec3 cBase = vec3(0.045, 0.1, 0.02);
vec3 cMid = mix(vec3(0.16, 0.31, 0.065), vec3(0.34, 0.4, 0.12), dryK);
vec3 cTip = mix(vec3(0.42, 0.6, 0.15), vec3(0.6, 0.6, 0.24), dryK);
vec3 cl = t < 0.5 ? mix(cBase, cMid, t * 2.0) : mix(cMid, cTip, (t - 0.5) * 2.0);
vGrass = cl * (0.72 + 0.56 * g3);`}
vec3 toCam = normalize(cameraPosition - gw);
vBack = pow(max(dot(-toCam, uSunDir), 0.0), 3.0) * t;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;\nvarying float vBack;')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGrass;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGrass * vec3(1.0, 0.95, 0.7) * vBack * 1.6;');
  };
  return mat;
}

export function buildGrass(scene, fields, quality) {
  const push = Array.from({ length: MAX_PUSH }, () => new THREE.Vector4(1e5, 1e5, 1, 0));
  const shared = {
    uHeight: { value: fields.heightTex },
    uMask: { value: fields.maskTex },
    uNoise: { value: fields.noiseTex },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.8, -0.6).normalize() },
    uPush: { value: push },
    uBus: { value: new THREE.Vector4(1e5, 1e5, 1, 0) },
    uBusSize: { value: new THREE.Vector3(1.3, 6, 0) },
    uSunDir: { value: SUN_DIR },
  };
  const layers = [];
  const mk = (kind, geo, spacing, radius, inner) => {
    const u = { ...shared, uCam: { value: new THREE.Vector3() }, uSpacing: { value: spacing }, uRadius: { value: radius }, uInner: { value: inner } };
    gridInstances(geo, Math.ceil(radius / spacing), inner > 0 ? inner / spacing - 2 : -1);
    const mesh = new THREE.Mesh(geo, makeMaterial(kind, u));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
    layers.push({ mesh, u, count: geo.instanceCount });
  };
  const q = quality.grass;
  mk('grass', clumpGeometry(7, 3, 11, 1.2), q.nearSpacing, q.nearRadius, 0);
  mk('grass', clumpGeometry(5, 2, 23, 2.1), q.farSpacing, q.farRadius, q.nearRadius - 2.5);
  mk('flower', flowerGeometry(), q.flowerSpacing, q.flowerRadius, 0);

  function setPush(list) {
    for (let i = 0; i < MAX_PUSH; i++) {
      const p = list[i];
      if (p) push[i].set(p.x, p.z, p.r, p.s ?? 1);
      else push[i].set(1e5, 1e5, 1, 0);
    }
  }
  function setBus(b) {
    if (!b) {
      shared.uBusSize.value.z = 0;
      return;
    }
    shared.uBus.value.set(b.x, b.z, Math.cos(b.yaw), Math.sin(b.yaw));
    shared.uBusSize.value.set(b.hw, b.hl, 1);
  }
  function update(t, cam) {
    shared.uTime.value = t;
    for (const l of layers) l.u.uCam.value.copy(cam);
  }
  return { update, setPush, setBus, layers };
}
