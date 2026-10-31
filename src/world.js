// Stillvale - valley terrain, road, lake, sky, light and the shared field textures.
import * as THREE from 'three';
import { rng, simplex, fbm, ridged, clamp, lerp, smoothstep } from './noise.js';

export const WATER_Y = -1.2;
export const LAKE = { x: 78, z: -74, r: 33 };
export const START = { x: -16, z: 52 };
export const FIELD = 320;
export const FIELD_RES = 512;
export const SUN_DIR = new THREE.Vector3(0.5, 0.6, 0.62).normalize();

const VALLEY = { x: 0, z: -10, a: 190, b: 160 };
const PASSES = [
  { dx: 300, dz: -275, crest: 262, top: 24 },
  { dx: -330, dz: 240, crest: 250, top: 30 },
];
for (const p of PASSES) {
  const l = Math.hypot(p.dx, p.dz);
  p.dx /= l;
  p.dz /= l;
}

const ROAD_PTS = [
  [470, -440], [400, -376], [330, -312], [268, -255], [212, -196], [168, -134],
  [142, -66], [114, -10], [62, 8], [12, 16], [-38, 20], [-92, 36], [-148, 72],
  [-204, 118], [-262, 168], [-330, 228], [-400, 290],
];

function valleyR(x, z) {
  const dx = (x - VALLEY.x) / VALLEY.a;
  const dz = (z - VALLEY.z) / VALLEY.b;
  return Math.sqrt(dx * dx + dz * dz) + 0.1 * fbm(x * 0.006 + 11, z * 0.006 - 4, 3);
}

function passShape(x, z) {
  let f = 0, target = 0;
  for (const p of PASSES) {
    const px = x - VALLEY.x, pz = z - VALLEY.z;
    const along = px * p.dx + pz * p.dz;
    const lat = Math.abs(px * p.dz - pz * p.dx);
    const w = Math.exp(-((lat / 62) ** 2)) * smoothstep(90, 190, along);
    if (w > f) {
      f = w;
      const rise = smoothstep(120, p.crest, along);
      const fall = smoothstep(p.crest, p.crest + 190, along);
      target = p.top * rise - p.top * 0.55 * fall + lat * lat * 0.004;
    }
  }
  return [f, target];
}

export function rawHeight(x, z) {
  const r = valleyR(x, z);
  let h = 2.6 + 1.6 * fbm(x * 0.011, z * 0.011, 3) + 0.4 * simplex(x * 0.04 + 7, z * 0.04 - 3);
  if (r > 0.7) {
    const wall = Math.pow(smoothstep(0.78, 2.3, r), 1.4) * 62;
    let hills = 0;
    if (r > 0.95) hills = (0.55 + 0.45 * fbm(x * 0.0042 + 3.1, z * 0.0042 - 1.7, 4)) * 75 * smoothstep(0.95, 2.8, r);
    let mtn = 0;
    if (r > 2.6) {
      const k = smoothstep(2.8, 8.5, r);
      mtn = (Math.pow(ridged(x * 0.00058 - 7.3, z * 0.00058 + 2.2, 5), 1.3) * 880 + fbm(x * 0.0016, z * 0.0016, 3) * 110) * k;
    }
    const [pf, pt] = passShape(x, z);
    h += lerp(wall + hills, pt, pf * 0.92) + mtn * (1 - pf * 0.6);
  }
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z) / (LAKE.r * (1 + 0.16 * simplex(x * 0.03 + 5, z * 0.03 + 9)));
  if (ld < 1.6) h = lerp(WATER_Y - 3.2, h, smoothstep(0.5, 1.5, ld));
  return h;
}

export const road = buildRoad();

function buildRoad() {
  const curve = new THREE.CatmullRomCurve3(ROAD_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength();
  const n = Math.ceil(len / 2);
  const pts = curve.getSpacedPoints(n);
  const px = new Float32Array(n + 1), pz = new Float32Array(n + 1), py = new Float32Array(n + 1), s = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    px[i] = pts[i].x;
    pz[i] = pts[i].z;
    py[i] = rawHeight(px[i], pz[i]);
    s[i] = i === 0 ? 0 : s[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
  }
  const sm = new Float32Array(n + 1);
  const W = 16;
  for (let i = 0; i <= n; i++) {
    let a = 0, c = 0;
    for (let k = -W; k <= W; k++) {
      const j = clamp(i + k, 0, n);
      const w = 1 - Math.abs(k) / (W + 1);
      a += py[j] * w;
      c += w;
    }
    sm[i] = Math.max(a / c, WATER_Y + 1.1);
  }
  const g = 0.085;
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i <= n; i++) sm[i] = clamp(sm[i], sm[i - 1] - g * 2, sm[i - 1] + g * 2);
    for (let i = n - 1; i >= 0; i--) sm[i] = clamp(sm[i], sm[i + 1] - g * 2, sm[i + 1] + g * 2);
  }
  const CELL = 20, MAXW = 38, OFF = 600, GN = 60;
  const grid = Array.from({ length: GN * GN }, () => []);
  for (let i = 0; i < n; i++) {
    const x0 = Math.min(px[i], px[i + 1]) - MAXW, x1 = Math.max(px[i], px[i + 1]) + MAXW;
    const z0 = Math.min(pz[i], pz[i + 1]) - MAXW, z1 = Math.max(pz[i], pz[i + 1]) + MAXW;
    for (let gx = Math.floor((x0 + OFF) / CELL); gx <= Math.floor((x1 + OFF) / CELL); gx++)
      for (let gz = Math.floor((z0 + OFF) / CELL); gz <= Math.floor((z1 + OFF) / CELL); gz++)
        if (gx >= 0 && gz >= 0 && gx < GN && gz < GN) grid[gz * GN + gx].push(i);
  }
  const res = { d: 1e9, sd: 0, s: 0, y: 0, i: 0, tx: 0, tz: 1 };
  function query(x, z) {
    res.d = 1e9;
    const gx = Math.floor((x + OFF) / CELL), gz = Math.floor((z + OFF) / CELL);
    if (gx < 0 || gz < 0 || gx >= GN || gz >= GN) return res;
    const list = grid[gz * GN + gx];
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const ax = px[i], az = pz[i], bx = px[i + 1] - ax, bz = pz[i + 1] - az;
      const ll = bx * bx + bz * bz;
      const t = clamp(((x - ax) * bx + (z - az) * bz) / ll, 0, 1);
      const cx = ax + bx * t, cz = az + bz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < res.d) {
        res.d = d;
        res.i = i;
        res.s = s[i] + t * (s[i + 1] - s[i]);
        res.y = sm[i] + t * (sm[i + 1] - sm[i]);
        const il = 1 / Math.sqrt(ll);
        res.tx = bx * il;
        res.tz = bz * il;
        res.sd = (bx * (z - az) - bz * (x - ax)) * il;
      }
    }
    return res;
  }
  function at(sv, out = {}) {
    sv = clamp(sv, 0, s[n]);
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (s[m] <= sv) lo = m; else hi = m;
    }
    const t = (sv - s[lo]) / Math.max(1e-6, s[hi] - s[lo]);
    out.x = px[lo] + (px[hi] - px[lo]) * t;
    out.z = pz[lo] + (pz[hi] - pz[lo]) * t;
    out.y = sm[lo] + (sm[hi] - sm[lo]) * t;
    const dx = px[hi] - px[lo], dz = pz[hi] - pz[lo], l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l;
    out.tz = dz / l;
    return out;
  }
  return { px, pz, py: sm, s, n, length: s[n], query, at, HALF: 3.1 };
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  const q = road.query(x, z);
  if (q.d < 38) {
    const w0 = road.HALF + 0.6;
    const w1 = Math.min(w0 + 5 + 0.75 * Math.abs(h - q.y), 37);
    h = lerp(q.y, h, smoothstep(w0, w1, q.d));
  }
  return h;
}

const hgrid = new Float32Array(FIELD_RES * FIELD_RES);
const mask = new Uint8Array(FIELD_RES * FIELD_RES * 4);
const CELLM = (FIELD * 2) / (FIELD_RES - 1);

export function groundAt(x, z) {
  const fx = (x + FIELD) / CELLM, fz = (z + FIELD) / CELLM;
  if (fx < 0 || fz < 0 || fx >= FIELD_RES - 1 || fz >= FIELD_RES - 1) return heightAt(x, z);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
  const i = iz * FIELD_RES + ix;
  const a = hgrid[i] + (hgrid[i + 1] - hgrid[i]) * tx;
  const b = hgrid[i + FIELD_RES] + (hgrid[i + FIELD_RES + 1] - hgrid[i + FIELD_RES]) * tx;
  return a + (b - a) * tz;
}

export function normalAt(x, z, out) {
  const e = 0.8;
  const hx = groundAt(x + e, z) - groundAt(x - e, z);
  const hz = groundAt(x, z + e) - groundAt(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function valleyEdge(x, z) {
  return valleyR(x, z);
}

export function stampNoGrass(x, z, r, strength = 1) {
  const c0 = Math.floor((x - r + FIELD) / CELLM), c1 = Math.ceil((x + r + FIELD) / CELLM);
  const r0 = Math.floor((z - r + FIELD) / CELLM), r1 = Math.ceil((z + r + FIELD) / CELLM);
  for (let iz = Math.max(0, r0); iz <= Math.min(FIELD_RES - 1, r1); iz++)
    for (let ix = Math.max(0, c0); ix <= Math.min(FIELD_RES - 1, c1); ix++) {
      const wx = ix * CELLM - FIELD, wz = iz * CELLM - FIELD;
      const d = Math.hypot(wx - x, wz - z) / r;
      if (d < 1) {
        const k = (iz * FIELD_RES + ix) * 4 + 2;
        mask[k] = Math.round(mask[k] * (1 - strength * smoothstep(1, 0.55, d)));
      }
    }
}

function buildFields() {
  for (let iz = 0; iz < FIELD_RES; iz++) {
    for (let ix = 0; ix < FIELD_RES; ix++) {
      const x = ix * CELLM - FIELD, z = iz * CELLM - FIELD;
      const h = heightAt(x, z);
      const i = iz * FIELD_RES + ix;
      hgrid[i] = h;
      const q = road.query(x, z);
      const onRoad = 1 - smoothstep(road.HALF - 0.6, road.HALF + 0.7 + 0.5 * simplex(x * 0.3, z * 0.3), q.d);
      const sd = q.d < 30 ? clamp(q.sd, -8, 8) : 8;
      const patch = smoothstep(-0.55, 0.35, fbm(x * 0.045 + 3, z * 0.045 - 8, 3));
      const water = smoothstep(WATER_Y + 0.15, WATER_Y + 0.6, h);
      const r = valleyR(x, z);
      const slopeFade = 1 - smoothstep(1.15, 1.6, r);
      const dens = clamp((0.62 + 0.38 * patch) * (1 - onRoad * 0.97) * water * (0.35 + 0.65 * slopeFade), 0, 1);
      let tall = smoothstep(0.15, 0.55, fbm(x * 0.022 - 13, z * 0.022 + 5, 3));
      tall = Math.max(tall, smoothstep(0.85, 1.15, r) * 0.8);
      tall *= 1 - smoothstep(road.HALF + 4, road.HALF + 1, q.d);
      const k = i * 4;
      mask[k] = Math.round(onRoad * 255);
      mask[k + 1] = Math.round(clamp(0.5 + sd / 16, 0, 1) * 255);
      mask[k + 2] = Math.round(dens * 255);
      mask[k + 3] = Math.round(clamp(tall, 0, 1) * 255);
    }
  }
}

function tileNoise(size, seed) {
  const r = rng(seed);
  const data = new Uint8Array(size * size * 4);
  const base = [3, 6, 12, 24];
  for (let c = 0; c < 4; c++) {
    const acc = new Float32Array(size * size);
    let amp = 1, tot = 0;
    for (let o = 0; o < 4; o++) {
      const f = base[c] << o;
      const lat = new Float32Array(f * f);
      for (let i = 0; i < f * f; i++) lat[i] = r();
      for (let y = 0; y < size; y++) {
        const gy = (y / size) * f, y0 = Math.floor(gy), ty = gy - y0, sy = ty * ty * (3 - 2 * ty);
        const y1 = (y0 + 1) % f;
        for (let x = 0; x < size; x++) {
          const gx = (x / size) * f, x0 = Math.floor(gx), tx = gx - x0, sx = tx * tx * (3 - 2 * tx);
          const x1 = (x0 + 1) % f;
          const a = lat[y0 * f + x0] + (lat[y0 * f + x1] - lat[y0 * f + x0]) * sx;
          const b = lat[y1 * f + x0] + (lat[y1 * f + x1] - lat[y1 * f + x0]) * sx;
          acc[y * size + x] += (a + (b - a) * sy) * amp;
        }
      }
      tot += amp;
      amp *= 0.5;
    }
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < acc.length; i++) {
      mn = Math.min(mn, acc[i]);
      mx = Math.max(mx, acc[i]);
    }
    for (let i = 0; i < acc.length; i++) data[i * 4 + c] = Math.round(((acc[i] - mn) / (mx - mn)) * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function terrainAxis() {
  const inner = [];
  for (let v = -240; v <= 240; v += 2) inner.push(v);
  const outer = [];
  let p = 240, step = 2;
  while (p < 6200) {
    step *= 1.14;
    p += step;
    outer.push(p);
  }
  return [...outer.slice().reverse().map((v) => -v), ...inner, ...outer];
}

function buildTerrain(fields) {
  const ax = terrainAxis();
  const n = ax.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = ax[i], z = ax[j];
      const k = (j * n + i) * 3;
      pos[k] = x;
      pos[k + 1] = Math.abs(x) <= FIELD - 2 && Math.abs(z) <= FIELD - 2 ? groundAt(x, z) : heightAt(x, z);
      pos[k + 2] = z;
    }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.maskTex = { value: fields.maskTex };
    sh.uniforms.noiseTex = { value: fields.noiseTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW;\nvarying vec3 vNW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNW = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW;
varying vec3 vNW;
uniform sampler2D maskTex;
uniform sampler2D noiseTex;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 fuv = (vW.xz + ${FIELD.toFixed(1)}) / ${(FIELD * 2).toFixed(1)};
  float inField = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
  vec4 m = texture2D(maskTex, clamp(fuv, 0.0, 1.0));
  m = mix(vec4(0.0, 1.0, 0.25, 0.5), m, inField);
  vec4 n1 = texture2D(noiseTex, vW.xz * 0.0045);
  vec4 n2 = texture2D(noiseTex, vW.xz * 0.037);
  vec4 n3 = texture2D(noiseTex, vW.xz * 0.31);
  vec3 lush = vec3(0.15, 0.285, 0.065);
  vec3 dry = vec3(0.33, 0.39, 0.12);
  vec3 dark = vec3(0.09, 0.18, 0.045);
  vec3 col = mix(lush, dry, smoothstep(0.5, 0.78, n1.r) * 0.75);
  col = mix(col, dark, smoothstep(0.55, 0.85, n2.g) * 0.45);
  col *= 0.82 + 0.36 * n3.b;
  col *= mix(1.0, 0.72, (1.0 - inField) * 0.5);
  float sd = (m.g - 0.5) * 16.0;
  float track = smoothstep(0.62, 0.22, abs(abs(sd) - 0.95));
  float crown = smoothstep(0.42, 0.12, abs(sd));
  vec3 dirt = vec3(0.46, 0.36, 0.23) * (0.85 + 0.3 * n3.g);
  vec3 roadCol = mix(dirt, dirt * 0.72, track);
  roadCol = mix(roadCol, col * 0.9, crown * 0.55);
  col = mix(col, roadCol, m.r);
  float shore = smoothstep(${(WATER_Y + 1.0).toFixed(2)}, ${(WATER_Y + 0.15).toFixed(2)}, vW.y);
  col = mix(col, vec3(0.36, 0.33, 0.24) * (0.8 + 0.3 * n3.r), shore);
  float slope = 1.0 - vNW.y;
  vec3 rock = vec3(0.42, 0.41, 0.39) * (0.75 + 0.45 * n2.r);
  col = mix(col, rock, smoothstep(0.5, 0.74, slope + 0.1 * n2.b));
  float alt = vW.y + 90.0 * (n1.g - 0.5);
  col = mix(col, rock * 0.95, smoothstep(300.0, 500.0, alt));
  col = mix(col, vec3(0.93, 0.95, 0.98), smoothstep(690.0, 800.0, alt - 220.0 * slope));
  diffuseColor.rgb *= col;
}`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function buildWater(fields) {
  const geo = new THREE.CircleGeometry(LAKE.r * 1.9, 72);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        heightTex: { value: fields.heightTex },
        noiseTex: { value: fields.noiseTex },
        sunDir: { value: SUN_DIR },
        time: { value: 0 },
      },
    ]),
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D heightTex;
      uniform sampler2D noiseTex;
      uniform vec3 sunDir;
      uniform float time;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float wave(vec2 p) {
        return texture2D(noiseTex, p * 0.045 + vec2(time * 0.011, time * 0.007)).r
             + 0.6 * texture2D(noiseTex, p * 0.11 - vec2(time * 0.009, -time * 0.013)).g;
      }
      void main() {
        vec2 fuv = (vW.xz + ${FIELD.toFixed(1)}) / ${(FIELD * 2).toFixed(1)};
        float ground = texture2D(heightTex, fuv).r;
        float depth = ${WATER_Y.toFixed(2)} - ground;
        float e = 0.35;
        float h0 = wave(vW.xz);
        float gx = wave(vW.xz + vec2(e, 0.0)) - h0;
        float gz = wave(vW.xz + vec2(0.0, e)) - h0;
        vec3 N = normalize(vec3(-gx * 2.2, 1.0, -gz * 2.2));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(vec3(0.66, 0.79, 0.9), vec3(0.2, 0.42, 0.76), pow(max(R.y, 0.0), 0.6));
        vec3 body = mix(vec3(0.17, 0.3, 0.22), vec3(0.03, 0.1, 0.12), smoothstep(0.0, 2.4, depth));
        vec3 col = mix(body, sky, clamp(fres + 0.12, 0.0, 1.0));
        col += vec3(1.0, 0.94, 0.82) * pow(max(dot(R, sunDir), 0.0), 260.0) * 2.5;
        col = mix(col, vec3(0.78, 0.84, 0.8), smoothstep(0.22, 0.0, depth) * 0.3);
        float alpha = smoothstep(0.0, 0.45, depth) * (0.82 + 0.18 * fres);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, WATER_Y, LAKE.z);
  mesh.renderOrder = 1;
  return mesh;
}

function buildSky(noiseTex) {
  const geo = new THREE.SphereGeometry(9000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: SUN_DIR }, time: { value: 0 }, noiseTex: { value: noiseTex } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 sunDir;
      uniform float time;
      uniform sampler2D noiseTex;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 zenith = vec3(0.07, 0.22, 0.6);
        vec3 horizon = vec3(0.68, 0.8, 0.9);
        vec3 col = mix(horizon, zenith, pow(h, 0.38));
        col = mix(col, vec3(0.62, 0.72, 0.8), smoothstep(0.0, -0.25, d.y));
        float sd = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.86, 0.62) * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.45);
        col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.9998, sd) * 6.0;
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 0.42 + vec2(time * 0.0035, time * 0.0016);
          float n = texture2D(noiseTex, uv * 0.35).r * 0.52 + texture2D(noiseTex, uv * 0.83 + 0.3).g * 0.3
                  + texture2D(noiseTex, uv * 1.9 + 0.7).b * 0.13 + texture2D(noiseTex, uv * 4.3).a * 0.05;
          float cov = smoothstep(0.5, 0.74, n);
          float fade = smoothstep(0.015, 0.22, d.y);
          vec3 base = vec3(0.7, 0.75, 0.82);
          vec3 cc = mix(base, vec3(1.0), smoothstep(0.52, 0.85, n));
          cc += vec3(1.0, 0.88, 0.7) * pow(sd, 5.0) * 0.35 * cov;
          col = mix(col, cc, cov * fade * 0.96);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export function buildWorld(scene, quality) {
  buildFields();
  const noiseTex = tileNoise(256, 7);
  const half = new Uint16Array(FIELD_RES * FIELD_RES);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(hgrid[i]);
  const heightTex = new THREE.DataTexture(half, FIELD_RES, FIELD_RES, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  const maskTex = new THREE.DataTexture(mask, FIELD_RES, FIELD_RES, THREE.RGBAFormat);
  maskTex.magFilter = THREE.LinearFilter;
  maskTex.minFilter = THREE.LinearFilter;
  const fields = { heightTex, maskTex, noiseTex, mask };

  const terrain = buildTerrain(fields);
  scene.add(terrain);
  const water = buildWater(fields);
  scene.add(water);
  const sky = buildSky(noiseTex);
  scene.add(sky);

  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.6, 0.72, 0.84), 0.0004);
  const hemi = new THREE.HemisphereLight(0xc4dcff, 0x56632f, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  const sm = quality.shadow;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
  sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const tmp = new THREE.Vector3();
  function update(dt, t, focus) {
    sky.material.uniforms.time.value = t;
    water.material.uniforms.time.value = t;
    const texel = (sc.right - sc.left) / sm;
    tmp.set(Math.round(focus.x / texel) * texel, Math.round(focus.y / texel) * texel, Math.round(focus.z / texel) * texel);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(SUN_DIR, 140);
  }
  function commitMask() {
    maskTex.needsUpdate = true;
  }
  return { terrain, water, sky, sun, hemi, fields, update, commitMask };
}
