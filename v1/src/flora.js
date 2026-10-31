// Stillvale - Kenney Nature Kit trees, rocks and logs, recolored and merged into static chunks.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rng, fbm, smoothstep, clamp } from './noise.js';
import { heightAt, groundAt, road, LAKE, START, WATER_Y, valleyEdge, stampNoGrass } from './world.js';

const MODELS = {
  near: ['tree_pineTallA_detailed', 'tree_pineTallB_detailed', 'tree_pineTallC_detailed', 'tree_pineTallD_detailed', 'tree_pineDefaultA', 'tree_pineDefaultB', 'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineRoundE'],
  far: ['tree_pineTallA', 'tree_pineTallB', 'tree_pineTallC', 'tree_pineTallD'],
  rocks: ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_largeE', 'rock_largeF'],
  tallRocks: ['rock_tallA', 'rock_tallB'],
  logs: ['log', 'log_large'],
  stumps: ['stump_old', 'stump_roundDetailed'],
  bushes: ['plant_bushDetailed', 'plant_bushLarge', 'plant_bush'],
};

const PALETTE = {
  leafsDark: [0.105, 0.2, 0.085],
  leafsGreen: [0.105, 0.2, 0.085],
  woodBarkDark: [0.2, 0.13, 0.085],
  woodBark: [0.2, 0.13, 0.085],
  woodInner: [0.52, 0.38, 0.22],
  dirt: [0.33, 0.32, 0.3],
  stone: [0.33, 0.32, 0.3],
  grass: [0.17, 0.25, 0.07],
  _defaultMat: [0.3, 0.3, 0.28],
};

async function loadModels(base) {
  const loader = new GLTFLoader();
  const names = [...new Set(Object.values(MODELS).flat())];
  const out = {};
  await Promise.all(names.map(async (n) => {
    const gltf = await loader.loadAsync(`${base}/${n}.glb`);
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const name = o.material.name in PALETTE ? o.material.name : '_defaultMat';
      parts.push({ pos: g.attributes.position.array, nrm: g.attributes.normal.array, col: PALETTE[name], leaf: name.startsWith('leafs') || name === 'grass' });
    });
    let minY = 1e9, maxY = -1e9, maxR = 0;
    for (const p of parts)
      for (let i = 0; i < p.pos.length; i += 3) {
        minY = Math.min(minY, p.pos[i + 1]);
        maxY = Math.max(maxY, p.pos[i + 1]);
        maxR = Math.max(maxR, Math.hypot(p.pos[i], p.pos[i + 2]));
      }
    out[n] = { parts, minY, h: maxY - minY, r: maxR, verts: parts.reduce((a, p) => a + p.pos.length / 3, 0) };
  }));
  return out;
}

class Chunks {
  constructor(size) {
    this.size = size;
    this.map = new Map();
  }
  add(x, z, item) {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(item);
  }
}

export class Colliders {
  constructor() {
    this.cell = 8;
    this.grid = new Map();
    this.all = [];
  }
  add(x, z, r, kind) {
    const c = { x, z, r, kind };
    this.all.push(c);
    const s = this.cell;
    for (let gx = Math.floor((x - r) / s); gx <= Math.floor((x + r) / s); gx++)
      for (let gz = Math.floor((z - r) / s); gz <= Math.floor((z + r) / s); gz++) {
        const k = gx * 100003 + gz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
  }
  near(x, z, r, out = []) {
    out.length = 0;
    const s = this.cell;
    for (let gx = Math.floor((x - r) / s); gx <= Math.floor((x + r) / s); gx++)
      for (let gz = Math.floor((z - r) / s); gz <= Math.floor((z + r) / s); gz++) {
        const l = this.grid.get(gx * 100003 + gz);
        if (l) for (const c of l) if (!out.includes(c)) out.push(c);
      }
    return out;
  }
  free(x, z, r) {
    for (const c of this.near(x, z, r + 6)) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
    return true;
  }
}

function buildChunkMesh(items, models, material, castShadow) {
  let count = 0;
  for (const it of items) count += models[it.model].verts;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3), sway = new Float32Array(count * 2);
  let o = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const it of items) {
    const md = models[it.model];
    q.setFromEuler(new THREE.Euler(it.tilt || 0, it.rot, it.tilt2 || 0));
    m.compose(new THREE.Vector3(it.x, it.y - md.minY * it.s, it.z), q, new THREE.Vector3(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1)));
    nm.getNormalMatrix(m);
    for (const p of md.parts) {
      for (let i = 0; i < p.pos.length; i += 3) {
        v.set(p.pos[i], p.pos[i + 1], p.pos[i + 2]);
        const hn = clamp((p.pos[i + 1] - md.minY) / md.h, 0, 1);
        v.applyMatrix4(m);
        pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
        v.set(p.nrm[i], p.nrm[i + 1], p.nrm[i + 2]).applyMatrix3(nm).normalize();
        nrm[o * 3] = v.x; nrm[o * 3 + 1] = v.y; nrm[o * 3 + 2] = v.z;
        const ao = it.tree ? 0.5 + 0.5 * Math.pow(hn, 0.65) : 0.75 + 0.25 * hn;
        const tint = p.leaf ? it.tint : it.tint2 || [1, 1, 1];
        col[o * 3] = p.col[0] * tint[0] * ao;
        col[o * 3 + 1] = p.col[1] * tint[1] * ao;
        col[o * 3 + 2] = p.col[2] * tint[2] * ao;
        sway[o * 2] = it.tree ? hn * hn * it.s * 0.02 : 0;
        sway[o * 2 + 1] = (it.x * 0.13 + it.z * 0.07) % 6.28;
        o++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sway, 2));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export async function buildFlora(scene, quality, base) {
  const models = await loadModels(base);
  const R = rng(4242);
  const colliders = new Colliders();
  const items = [];
  const wind = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSway;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
float sw = aSway.x * (sin(uTime * 1.1 + aSway.y) * 0.7 + sin(uTime * 2.3 + aSway.y * 2.0) * 0.3);
transformed.xz += vec2(0.8, -0.6) * sw;`);
  };
  const depthMat = new THREE.MeshDepthMaterial();

  const startClear = (x, z, r) => Math.hypot(x - START.x, z - START.z) > r;
  const roadClear = (x, z, r) => road.query(x, z).d > road.HALF + r;
  const dry = (x, z, m) => heightAt(x, z) > WATER_Y + m;
  const slopeOk = (x, z, lim) => {
    const e = 2;
    const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e) < lim;
  };
  const tintLeaf = () => {
    const k = 0.78 + R() * 0.42;
    const hue = R() * 0.16 - 0.06;
    return [k * (1 + hue * 0.8), k * (1 + hue * 0.3), k * (1 - hue)];
  };

  const addTree = (x, z, far, s) => {
    const list = far ? MODELS.far : MODELS.near;
    const model = list[Math.floor(R() * list.length)];
    const md = models[model];
    const target = s ?? (10 + R() * 11);
    const sc = target / md.h;
    const y = heightAt(x, z) - 0.25;
    items.push({ model, x, y, z, s: sc, rot: R() * 6.283, tree: true, tint: tintLeaf(), tilt: (R() - 0.5) * 0.05, tilt2: (R() - 0.5) * 0.05 });
    colliders.add(x, z, Math.max(0.5, md.r * sc * 0.42), 'tree');
    stampNoGrass(x, z, md.r * sc * 0.75, 0.75);
  };

  const den = quality.forest;
  const forestRing = (rMin, rMax, spacing, far) => {
    const ext = 190 * rMax + 40;
    for (let gz = -ext; gz < ext; gz += spacing)
      for (let gx = -ext; gx < ext; gx += spacing) {
        const x = gx + (R() - 0.5) * spacing * 0.9, z = gz + (R() - 0.5) * spacing * 0.9;
        const r = valleyEdge(x, z);
        if (r < rMin || r >= rMax) continue;
        const h = heightAt(x, z);
        if (h > 360 + 60 * fbm(x * 0.01, z * 0.01, 2) || h < WATER_Y + 0.8) continue;
        const clump = fbm(x * 0.013 + 4, z * 0.013 - 2, 3);
        const p = smoothstep(0.88, 1.12, r) * (0.55 + 0.6 * clump) * den;
        if (R() > p) continue;
        if (!roadClear(x, z, far ? 7 : 5)) continue;
        if (!slopeOk(x, z, 1.25)) continue;
        addTree(x, z, far);
      }
  };
  forestRing(0.86, 1.6, quality.forestSpacing, false);
  forestRing(1.6, 2.4, quality.forestSpacing * 1.5, true);
  forestRing(2.4, 3.4, quality.forestSpacing * 2.2, true);

  const groves = [[-92, -18, 7, 11], [-48, -78, 6, 9], [22, 92, 5, 8], [-118, 64, 9, 13], [148, 40, 6, 10], [-12, -112, 8, 12], [92, 88, 5, 8], [-150, -70, 7, 10]];
  for (const grove of groves) {
    const [cx, cz, count, sig] = grove;
    let n = count;
    for (let i = 0; i < count * 3 && n > 0; i++) {
      const a = R() * 6.283, d = Math.abs(R() + R() - 1) * sig * 1.8;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!roadClear(x, z, 6) || !dry(x, z, 1) || !startClear(x, z, 16)) continue;
      if (!colliders.free(x, z, 2.2)) continue;
      addTree(x, z, false, 8 + R() * 10);
      if (--n <= 0) break;
    }
  }
  for (let i = 0, made = 0; i < 400 && made < 26; i++) {
    const x = (R() - 0.5) * 340, z = (R() - 0.5) * 290 - 10;
    if (valleyEdge(x, z) > 0.88 || !roadClear(x, z, 7) || !dry(x, z, 1.2) || !startClear(x, z, 18)) continue;
    if (!colliders.free(x, z, 5)) continue;
    addTree(x, z, false, 9 + R() * 9);
    made++;
  }

  for (let i = 0, made = 0; i < 2000 && made < quality.rocks; i++) {
    const nearLake = R() < 0.25;
    let x, z;
    if (nearLake) {
      const a = R() * 6.283, d = LAKE.r * (1.05 + R() * 0.5);
      x = LAKE.x + Math.cos(a) * d;
      z = LAKE.z + Math.sin(a) * d;
    } else {
      x = (R() - 0.5) * 460;
      z = (R() - 0.5) * 400 - 10;
    }
    const r = valleyEdge(x, z);
    if (r > 1.35 || !roadClear(x, z, 3) || !startClear(x, z, 9)) continue;
    if (!nearLake && R() > 0.35 + smoothstep(0.7, 1.1, r)) continue;
    const tall = R() < 0.22;
    const list = tall ? MODELS.tallRocks : MODELS.rocks;
    const model = list[Math.floor(R() * list.length)];
    const md = models[model];
    const sc = tall ? 2.2 + R() * 2.5 : 1.6 + Math.pow(R(), 2) * 5.5;
    const rad = md.r * sc * 0.7;
    if (!colliders.free(x, z, rad + 0.6)) continue;
    const g = 0.85 + R() * 0.3;
    items.push({ model, x, y: groundAt(x, z) - 0.15 * sc, z, s: sc, rot: R() * 6.283, tree: false, tint: [0.9 + R() * 0.2, 0.95 + R() * 0.15, 0.85], tint2: [g, g, g * 0.97], tilt: (R() - 0.5) * 0.15 });
    colliders.add(x, z, rad, 'rock');
    stampNoGrass(x, z, rad * 0.95, 0.95);
    made++;
  }

  for (let i = 0, made = 0; i < 600 && made < 14; i++) {
    const t = colliders.all[Math.floor(R() * colliders.all.length)];
    if (!t || t.kind !== 'tree' || valleyEdge(t.x, t.z) > 1.1) continue;
    const a = R() * 6.283;
    const x = t.x + Math.cos(a) * (t.r + 3), z = t.z + Math.sin(a) * (t.r + 3);
    if (!roadClear(x, z, 3) || !dry(x, z, 1) || !startClear(x, z, 8) || !colliders.free(x, z, 1.6)) continue;
    const log = R() < 0.55;
    const list = log ? MODELS.logs : MODELS.stumps;
    const model = list[Math.floor(R() * list.length)];
    const sc = log ? 4.5 + R() * 2 : 2.4 + R() * 1.2;
    const rot = R() * 6.283;
    items.push({ model, x, y: groundAt(x, z) - 0.06 * sc, z, s: sc, rot, tree: false, tint: [1, 1, 1], tint2: [0.9, 0.9, 0.9] });
    if (log) {
      const len = models[model].r * sc;
      for (const k of [-0.6, 0, 0.6]) colliders.add(x + Math.sin(rot) * k * len, z + Math.cos(rot) * k * len, 0.55, 'log');
    } else colliders.add(x, z, 0.6, 'stump');
    stampNoGrass(x, z, 1.4, 0.6);
    made++;
  }

  for (let i = 0, made = 0; i < 3000 && made < quality.bushes; i++) {
    const t = colliders.all[Math.floor(R() * colliders.all.length)];
    if (!t || t.kind !== 'tree' || valleyEdge(t.x, t.z) > 1.25) continue;
    const a = R() * 6.283, d = t.r + 1 + R() * 4;
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    if (!roadClear(x, z, 2) || !dry(x, z, 0.8) || !startClear(x, z, 6)) continue;
    const model = MODELS.bushes[Math.floor(R() * MODELS.bushes.length)];
    const sc = 3 + R() * 3.5;
    items.push({ model, x, y: groundAt(x, z) - 0.1, z, s: sc, rot: R() * 6.283, tree: false, tint: [0.85 + R() * 0.3, 1 + R() * 0.25, 0.8 + R() * 0.2], sy: 0.8 + R() * 0.5 });
    made++;
  }

  const nearChunks = new Chunks(64), farChunks = new Chunks(192);
  for (const it of items) {
    const far = valleyEdge(it.x, it.z) > 1.6;
    (far ? farChunks : nearChunks).add(it.x, it.z, it);
  }
  const group = new THREE.Group();
  for (const [, list] of nearChunks.map) {
    const mesh = buildChunkMesh(list, models, material, true);
    mesh.customDepthMaterial = depthMat;
    group.add(mesh);
  }
  for (const [, list] of farChunks.map) group.add(buildChunkMesh(list, models, material, false));
  scene.add(group);
  return { group, colliders, count: items.length, update: (t) => (wind.value = t) };
}
