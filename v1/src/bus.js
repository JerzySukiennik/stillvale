// Stillvale - procedural coach: model, doors, roof hatch, seats and path driving across the valley.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundAt, heightAt, road, WATER_Y, LAKE } from './world.js';
import { clamp, smoothstep } from './noise.js';

export const BUS = { len: 12, wid: 2.55, floor: 1.1, roof: 3.47, doorZ: 5.0, doorX: -1.275, wheelbase: 6.5 };

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

class Merger {
  constructor() {
    this.sets = new Map();
  }
  add(key, geo, pos, rot = [0, 0, 0], color = null) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));
    const c = new THREE.Color(color || '#ffffff');
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    if (!this.sets.has(key)) this.sets.set(key, []);
    this.sets.get(key).push(g);
  }
  box(key, w, h, d, pos, color, r = 0.02, rot) {
    this.add(key, r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)) : new THREE.BoxGeometry(w, h, d), pos, rot, color);
  }
  build(materials, parent, shadow = true) {
    for (const [k, list] of this.sets) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), materials[k]);
      mesh.castShadow = shadow && k !== 'glass';
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
}

function makeMaterials(env) {
  const vc = { vertexColors: true };
  return {
    paint: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.26, metalness: 0.05, envMapIntensity: 1.1 }),
    trim: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.62, metalness: 0.1 }),
    chrome: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.25, metalness: 0.85 }),
    seat: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.95 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b1316, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.62, envMapIntensity: 1.8, depthWrite: false }),
    light: new THREE.MeshStandardMaterial({ ...vc, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.0 }),
  };
}

function wheelGeometry() {
  const parts = [];
  const add = (g, color) => {
    g = g.index ? g.toNonIndexed() : g;
    g.rotateZ(Math.PI / 2);
    const c = new THREE.Color(color), col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    parts.push(g);
  };
  add(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 22, 1), '#191919');
  add(new THREE.TorusGeometry(0.44, 0.075, 8, 22).rotateX(Math.PI / 2), '#1d1d1d');
  add(new THREE.CylinderGeometry(0.31, 0.31, 0.32, 18, 1), '#cfd2d4');
  add(new THREE.CylinderGeometry(0.12, 0.14, 0.36, 10, 1), '#55585b');
  add(new THREE.CylinderGeometry(0.24, 0.24, 0.335, 18, 1), '#a9adb0');
  return mergeGeometries(parts, false);
}

export function buildBus(scene, env) {
  const mats = makeMaterials(env);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const M = new Merger();
  const W = BUS.wid, hw = W / 2;
  const white = '#f4f5f4', dark = '#1b1c1d', gray = '#7d8184';

  M.box('paint', W, 0.68, 10.45, [0, 0.76, -0.775], white, 0.13);
  M.box('paint', W, 0.68, 0.45, [0, 0.76, 5.775], white, 0.12);
  M.box('paint', 1.9, 0.68, 1.1, [0.325, 0.76, 5.0], white, 0.02);
  M.box('trim', 0.625, 0.2, 1.06, [-0.9375, 0.52, 5.0], '#3c3e40', 0.01);
  M.box('trim', 0.375, 0.24, 1.06, [-0.8125, 0.74, 5.0], '#3c3e40', 0.01);
  M.box('trim', 0.2, 0.24, 1.06, [-0.725, 0.98, 5.0], '#3c3e40', 0.01);
  M.box('paint', 0.08, 0.45, 12.0, [hw - 0.04, 1.325, 0], white, 0.02);
  M.box('paint', 0.08, 0.45, 10.45, [-hw + 0.04, 1.325, -0.775], white, 0.02);
  M.box('paint', 0.08, 0.45, 0.45, [-hw + 0.04, 1.325, 5.775], white, 0.02);
  M.box('paint', W, 0.42, 12.0, [0, 3.26, 0], white, 0.15);
  for (const z of [-5.86, -4.4, -2.92, -1.44, 0.04, 1.52, 3.0, 4.4]) M.box('paint', 0.1, 1.52, 0.12, [hw - 0.05, 2.3, z], white, 0.02);
  for (const z of [-5.86, -4.4, -2.92, -1.44, 0.04, 1.52, 3.0, 4.4, 5.6]) M.box('paint', 0.1, 1.52, 0.12, [-hw + 0.05, 2.3, z], white, 0.02);
  M.box('trim', 0.12, 1.95, 0.14, [hw - 0.06, 2.12, 5.93], dark, 0.03);
  M.box('trim', 0.12, 1.95, 0.14, [-hw + 0.06, 2.12, 5.93], dark, 0.03);
  M.box('paint', W, 0.16, 0.1, [0, 1.18, 5.95], white, 0.02);
  M.box('paint', W, 1.95, 0.1, [0, 2.07, -5.95], white, 0.03);
  M.box('trim', 2.5, 0.28, 0.14, [0, 0.56, 6.03], '#2e3133', 0.05);
  M.box('trim', 2.5, 0.28, 0.14, [0, 0.56, -6.03], '#2e3133', 0.05);
  M.box('trim', 1.3, 0.26, 0.03, [0, 0.83, 6.01], '#202224', 0.01);
  for (let i = 0; i < 5; i++) M.box('chrome', 1.2, 0.02, 0.03, [0, 0.74 + i * 0.045, 6.025], '#c9ccce', 0);
  M.box('paint', 1.6, 0.18, 3.2, [0, 3.56, -0.6], '#dfe2e3', 0.06);
  for (const x of [-0.5, 0, 0.5]) M.box('trim', 0.32, 0.03, 2.8, [x, 3.66, -0.6], '#9a9ea1', 0.01);
  M.box('trim', 0.86, 0.05, 0.86, [0, 3.475, 1.7], '#5f6366', 0.02);
  for (const sx of [-1, 1]) {
    M.box('trim', 0.05, 0.05, 0.62, [sx * 1.22, 3.08, 6.18], dark, 0.01, [0.35, 0, 0]);
    M.box('trim', 0.04, 0.04, 0.32, [sx * 1.32, 2.98, 6.42], dark, 0.01, [0, sx * 0.6, 0]);
    M.box('trim', 0.1, 0.4, 0.22, [sx * 1.4, 2.72, 6.5], dark, 0.04);
    M.box('glass', 0.012, 0.32, 0.18, [sx * 1.4, 2.72, 6.38], '#ffffff', 0);
  }
  for (const z of [3.9, -2.6, -3.85]) for (const sx of [-1, 1]) {
    const arch = new THREE.CircleGeometry(0.64, 20, 0, Math.PI);
    M.add('trim', arch, [sx * (hw + 0.006), 0.5, z], [0, sx * Math.PI / 2, 0], '#111213');
  }
  M.box('glass', 0.03, 1.48, 11.8, [hw + 0.002, 2.3, -0.05], '#ffffff', 0);
  M.box('glass', 0.03, 1.48, 10.25, [-hw - 0.002, 2.3, -0.825], '#ffffff', 0);
  M.box('glass', 0.03, 1.48, 0.3, [-hw - 0.002, 2.3, 5.78], '#ffffff', 0);
  M.box('glass', 2.36, 1.74, 0.03, [0, 2.13, 5.985], '#ffffff', 0);
  M.box('trim', 2.4, 0.05, 11.9, [0, 1.115, -0.05], '#2a2c2e', 0);
  M.box('trim', 2.3, 0.4, 0.55, [0, 1.32, 5.55], '#1d1e20', 0.04);
  const wheel = new THREE.TorusGeometry(0.2, 0.025, 6, 18);
  M.add('trim', wheel, [0.62, 1.75, 5.05], [-1.0, 0, 0], '#151515');
  for (let r = 0; r < 11; r++) {
    const z = 3.55 - r * 0.84;
    for (const x of [0.78, 0.32, -0.32, -0.78]) {
      if (z > 3.2 && x < 0) continue;
      M.box('seat', 0.42, 0.12, 0.44, [x, 1.56, z], '#2b3550', 0.04);
      M.box('seat', 0.42, 0.62, 0.1, [x, 1.92, z - 0.24], '#2b3550', 0.04, [-0.12, 0, 0]);
      M.box('seat', 0.4, 0.16, 0.12, [x, 2.24, z - 0.29], '#e9e5dc', 0.04, [-0.12, 0, 0]);
    }
  }
  M.box('seat', 0.5, 0.12, 0.5, [0.62, 1.56, 4.55], '#1d1e20', 0.04);
  M.box('seat', 0.5, 0.7, 0.1, [0.62, 1.95, 4.27], '#1d1e20', 0.04, [-0.15, 0, 0]);
  M.build(mats, body);

  const ledTex = canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#050505';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff9a1f';
    g.font = 'bold 44px "Geeza Pro", "Noto Sans Arabic", "Arial", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('فوق التل', w / 2, h / 2 + 2);
    const img = g.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % 4 === 3 || y % 4 === 3) {
      const i = (y * w + x) * 4;
      img.data[i] *= 0.25; img.data[i + 1] *= 0.25; img.data[i + 2] *= 0.25;
    }
    g.putImageData(img, 0, 0);
  });
  const led = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.21), new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false }));
  led.position.set(0, 2.86, 5.975);
  body.add(led);

  const liveryTex = canvasTex(2048, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#0c6f78');
    grd.addColorStop(1, '#16a39a');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, h * 0.62);
    g.bezierCurveTo(w * 0.35, h * 0.5, w * 0.6, h * 0.95, w, h * 0.3);
    g.lineTo(w, h * 0.48);
    g.bezierCurveTo(w * 0.62, h * 1.05, w * 0.35, h * 0.68, 0, h * 0.8);
    g.closePath();
    g.fill();
    g.fillStyle = '#c9a24a';
    g.beginPath();
    g.moveTo(w * 0.1, h * 0.86);
    g.bezierCurveTo(w * 0.4, h * 0.74, w * 0.62, h * 1.1, w, h * 0.55);
    g.lineTo(w, h * 0.6);
    g.bezierCurveTo(w * 0.62, h * 1.16, w * 0.4, h * 0.8, w * 0.1, h * 0.9);
    g.fill();
    g.fillStyle = '#18484d';
    g.font = '800 54px "Avenir Next", "Segoe UI", system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('GZOWO TOURS', w * 0.06, h * 0.32);
  });
  const liveryMat = new THREE.MeshStandardMaterial({ map: liveryTex, transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 0.66), liveryMat);
    p.position.set(sx * (hw + 0.004), 0.83, -0.2);
    p.rotation.y = sx * Math.PI / 2;
    body.add(p);
  }
  const plateTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a3d8f';
    g.fillRect(0, 0, 26, h);
    g.fillStyle = '#111';
    g.font = 'bold 40px "DIN Alternate", "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('GZ 2026', w / 2 + 12, h / 2 + 2);
  });
  for (const z of [6.105, -6.105]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 }));
    plate.position.set(0, 0.6, z);
    if (z < 0) plate.rotation.y = Math.PI;
    body.add(plate);
  }
  const L = new Merger();
  for (const sx of [-1, 1]) L.box('light', 0.48, 0.16, 0.05, [sx * 0.86, 0.98, 6.0], '#f3f7fa', 0.03);
  L.build(mats, body, false);
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.35, roughness: 0.3 });
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.42, 0.05, 2, 0.02), tail);
    t.position.set(sx * 1.05, 1.0, -6.0);
    body.add(t);
  }

  const doors = [];
  for (const [hz, dir] of [[5.55, -1], [4.45, 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(-hw - 0.01, 0, hz);
    const D = new Merger();
    D.box('paint', 0.05, 2.62, 0.08, [0, 1.74, dir * 0.03], white, 0.01);
    D.box('paint', 0.05, 2.62, 0.08, [0, 1.74, dir * 0.52], white, 0.01);
    D.box('paint', 0.05, 0.1, 0.55, [0, 0.48, dir * 0.275], white, 0.01);
    D.box('paint', 0.05, 0.1, 0.55, [0, 3.0, dir * 0.275], white, 0.01);
    D.box('paint', 0.05, 0.08, 0.55, [0, 1.62, dir * 0.275], white, 0.01);
    D.box('glass', 0.025, 2.45, 0.46, [0, 1.74, dir * 0.275], '#ffffff', 0);
    D.build(mats, pivot);
    body.add(pivot);
    doors.push({ pivot, dir });
  }
  const hatch = new THREE.Group();
  hatch.position.set(0, 3.5, 2.12);
  const hm = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.06, 0.8, 2, 0.02), mats.trim);
  hm.geometry.translate(0, 0, -0.4);
  hm.material = new THREE.MeshStandardMaterial({ color: 0x9da1a4, roughness: 0.5 });
  hm.castShadow = true;
  hatch.add(hm);
  body.add(hatch);

  const wheelGeo = wheelGeometry();
  const wheels = [];
  for (const z of [3.9, -2.6, -3.85]) for (const sx of [-1, 1]) {
    const steer = new THREE.Group();
    steer.position.set(sx * 1.2, 0.52, z);
    const w = new THREE.Mesh(wheelGeo, mats.trim);
    w.castShadow = true;
    steer.add(w);
    group.add(steer);
    wheels.push({ steer, mesh: w, front: z > 0 });
  }

  const seats = [];
  for (let r = 0; r < 11; r++) {
    const z = 3.55 - r * 0.84;
    for (const x of [0.78, 0.32, -0.32, -0.78]) {
      if (z > 3.2 && x < 0) continue;
      seats.push({ x, y: BUS.floor + 0.51, z, row: r });
    }
  }

  group.visible = false;
  scene.add(group);

  const bus = {
    group, body, doors, hatch, wheels, seats, led,
    state: 'hidden',
    pos: new THREE.Vector3(), yaw: 0, v: 0, s: 0, roll: 0, pitch: 0, bounce: 0, wheelRot: 0, steer: 0,
    path: null, doorT: 0, hatchT: 0, doorOpen: false, hatchOpen: false, stopTime: 0, honked: false, blocked: false, plannedFor: null,
  };
  return bus;
}

export function busLocalToWorld(bus, x, y, z, out) {
  return out.set(x, y, z).applyMatrix4(bus.body.matrixWorld);
}

function hermite(ax, az, atx, atz, bx, bz, btx, btz, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    pts.push([h00 * ax + h10 * atx + h01 * bx + h11 * btx, h00 * az + h10 * atz + h01 * bz + h11 * btz]);
  }
  return pts;
}

function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

export function samplePath(path, s, out) {
  const { pts, cum } = path;
  s = clamp(s, 0, path.length);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= s) lo = m; else hi = m;
  }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  out.x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
  out.z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
  const dx = pts[hi][0] - pts[lo][0], dz = pts[hi][1] - pts[lo][1];
  out.yaw = Math.atan2(dx, dz);
  return out;
}

function curvatureAt(path, s) {
  const a = samplePath(path, s - 2, {}), b = samplePath(path, s + 2, {});
  let d = b.yaw - a.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d / 4;
}

export function spawnS() {
  let best = 0, bd = 1e9;
  for (let i = 0; i <= road.n; i++) {
    const x = road.px[i], z = road.pz[i];
    const along = (x * 300 + (z + 10) * -275) / Math.hypot(300, 275);
    const d = Math.abs(along - 345);
    if (d < bd && x > 0) {
      bd = d;
      best = road.s[i];
    }
  }
  return best;
}

function roadPoints(s0, s1, step = 4) {
  const pts = [], tmp = {};
  for (let s = s0; s < s1; s += step) {
    road.at(s, tmp);
    pts.push([tmp.x, tmp.z]);
  }
  road.at(s1, tmp);
  pts.push([tmp.x, tmp.z]);
  return pts;
}

function pathValid(pts, colliders, player, tailFree) {
  let maxK = 0;
  const near = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const g = heightAt(x, z);
    if (g < WATER_Y + 0.6) return null;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.25) return null;
    for (const c of colliders.near(x, z, 6, near)) if (Math.hypot(c.x - x, c.z - z) < c.r + 2.1) return null;
    if (i < pts.length - tailFree && Math.hypot(x - player.x, z - player.z) < 5) return null;
    if (i > 0 && i < pts.length - 1) {
      const a = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const b = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      maxK = Math.max(maxK, Math.abs(d) / Math.max(seg, 0.5));
    }
  }
  if (maxK > 1 / 8.5) return null;
  return maxK;
}

function footprintOk(cx, cz, yaw, colliders) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
  const near = [];
  const hs = [];
  for (const a of [-5.6, 0, 5.6]) for (const b of [-1.2, 1.2]) {
    const x = cx + fx * a + lx * b, z = cz + fz * a + lz * b;
    const g = heightAt(x, z);
    if (g < WATER_Y + 0.5) return false;
    hs.push(g);
    for (const c of colliders.near(x, z, 4, near)) if (Math.hypot(c.x - x, c.z - z) < c.r + 1.0) return false;
  }
  return Math.max(...hs) - Math.min(...hs) < 2.2;
}

export function planApproach(bus, player, colliders, fromRoadS) {
  const P = { x: player.x, z: player.z };
  const q = road.query(P.x, P.z);
  const sNear = q.d < 1e8 ? q.s : road.length * 0.5;
  const cands = [];
  const start = fromRoadS;
  const doorD = 6.2;
  for (let k = 0; k < 24; k++) {
    const yaw = (k / 24) * Math.PI * 2;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const cx = P.x - rx * (1.275 + doorD) - fx * BUS.doorZ, cz = P.z - rz * (1.275 + doorD) - fz * BUS.doorZ;
    if (!footprintOk(cx, cz, yaw, colliders)) continue;
    const cq = road.query(cx, cz);
    const sC = cq.d < 1e8 ? cq.s : sNear;
    for (const back of [26, 40, 58, 80]) {
      let sLeave = Math.max(start + 6, Math.min(sC, sNear) - back);
      if (start == null) sLeave = null;
      let ax, az, atx, atz;
      if (sLeave != null) {
        const a = road.at(sLeave, {});
        ax = a.x; az = a.z; atx = a.tx; atz = a.tz;
      } else {
        ax = bus.pos.x; az = bus.pos.z; atx = Math.sin(bus.yaw); atz = Math.cos(bus.yaw);
      }
      const dist = Math.hypot(cx - ax, cz - az);
      if (dist < 12) continue;
      const tl = dist * 0.85;
      const curve = hermite(ax, az, atx * tl, atz * tl, cx, cz, fx * tl, fz * tl, Math.max(16, Math.ceil(dist / 2.5)));
      const k2 = pathValid(curve, colliders, P, 6);
      if (k2 == null) continue;
      const lead = sLeave != null ? roadPoints(start, sLeave) : [[bus.pos.x, bus.pos.z]];
      if (sLeave != null && pathValid(lead, colliders, P, 0) == null) continue;
      const pl = polyline([...lead, ...curve.slice(1)]);
      const offRoad = sLeave != null ? pl.length - (sLeave - start) : pl.length;
      cands.push({ path: pl, cost: pl.length * 0.2 + offRoad * 0.6 + k2 * 400, yaw, cx, cz });
    }
  }
  if (cands.length) {
    cands.sort((a, b) => a.cost - b.cost);
    return { ...cands[0], target: P, mode: 'approach' };
  }
  const sStop = clamp(sNear - BUS.doorZ, (start ?? 0) + 10, road.length - 5);
  const pts = start != null ? roadPoints(start, sStop) : [[bus.pos.x, bus.pos.z], ...roadPoints(Math.max(0, road.query(bus.pos.x, bus.pos.z).s), sStop)];
  return { path: polyline(pts), target: P, mode: 'road' };
}

export function startBus(bus, plan, s0) {
  bus.path = plan.path;
  bus.plan = plan;
  bus.s = 0;
  bus.v = 12;
  bus.state = 'driving';
  bus.group.visible = true;
  bus.doorT = 0;
  bus.hatchT = 0;
  bus.doorOpen = false;
  bus.hatchOpen = false;
  bus.honked = false;
  const p = samplePath(bus.path, 0, {});
  bus.pos.set(p.x, groundAt(p.x, p.z), p.z);
  bus.yaw = p.yaw;
}

export function predictTime(bus, cruise = 15) {
  let s = 0, v = bus.v, t = 0;
  const L = bus.path.length;
  while (s < L - 0.05 && t < 120) {
    const dt = 0.05;
    const vt = targetSpeed(bus, s, cruise);
    v += clamp(vt - v, -3.2 * dt, 1.6 * dt);
    s += v * dt;
    t += dt;
  }
  return t;
}

function targetSpeed(bus, s, cruise) {
  const L = bus.path.length;
  const remain = L - s;
  let vt = remain > 60 ? cruise : Math.min(cruise, 10);
  for (const ahead of [0, 6, 12, 20]) {
    const k = Math.abs(curvatureAt(bus.path, s + ahead));
    if (k > 1e-4) vt = Math.min(vt, Math.sqrt(2.4 / k) + ahead * 0.12);
  }
  vt = Math.min(vt, Math.sqrt(2 * 2.6 * Math.max(remain - 0.3, 0)) + 0.3);
  return Math.max(remain < 0.4 ? 0 : 1.2, vt);
}

const tmpP = {};
export function driveBus(bus, dt, player, cruise = 15) {
  if (bus.state !== 'driving') return;
  const L = bus.path.length;
  let vt = targetSpeed(bus, bus.s, cruise);
  const fx = Math.sin(bus.yaw), fz = Math.cos(bus.yaw);
  const dx = player.x - bus.pos.x, dz = player.z - bus.pos.z;
  const ahead = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
  bus.blocked = ahead > 3 && ahead < 6.5 + bus.v * 1.1 && lat < 2.4;
  if (bus.blocked) vt = 0;
  const acc = clamp(vt - bus.v, -3.4 * dt, 1.6 * dt);
  bus.accel = acc / Math.max(dt, 1e-3);
  bus.v = Math.max(0, bus.v + acc);
  bus.s = Math.min(L, bus.s + bus.v * dt);
  samplePath(bus.path, bus.s, tmpP);
  let dy = tmpP.yaw - bus.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  bus.yaw += dy * Math.min(1, dt * 6);
  bus.pos.x = tmpP.x;
  bus.pos.z = tmpP.z;
  const k = curvatureAt(bus.path, bus.s + 3);
  bus.steer += (clamp(Math.atan(k * BUS.wheelbase), -0.6, 0.6) - bus.steer) * Math.min(1, dt * 5);
  bus.wheelRot += (bus.v * dt) / 0.52;
  bus.lat = bus.v * bus.v * k;
  if (L - bus.s < 0.08 && bus.v < 0.4) {
    bus.v = 0;
    bus.state = 'stopped';
  }
}

export function poseBus(bus, dt, t) {
  const fx = Math.sin(bus.yaw), fz = Math.cos(bus.yaw), lx = Math.cos(bus.yaw), lz = -Math.sin(bus.yaw);
  const hF = groundAt(bus.pos.x + fx * 4.3, bus.pos.z + fz * 4.3), hB = groundAt(bus.pos.x - fx * 3.2, bus.pos.z - fz * 3.2);
  const hL = groundAt(bus.pos.x + lx * 1.1, bus.pos.z + lz * 1.1), hR = groundAt(bus.pos.x - lx * 1.1, bus.pos.z - lz * 1.1);
  const pitchT = -Math.atan2(hF - hB, 7.5) - clamp((bus.accel || 0) * 0.006, -0.03, 0.03);
  const rollT = Math.atan2(hL - hR, 2.2) + clamp((bus.lat || 0) * 0.012, -0.05, 0.05);
  bus.pitch += (pitchT - bus.pitch) * Math.min(1, dt * 4);
  bus.roll += (rollT - bus.roll) * Math.min(1, dt * 4);
  const y = (hF * 3.2 + hB * 4.3) / 7.5;
  bus.pos.y = y;
  const rumble = bus.state === 'driving' ? Math.sin(t * 23) * 0.006 * Math.min(1, bus.v / 6) : Math.sin(t * 31) * 0.0018;
  bus.group.position.set(bus.pos.x, y, bus.pos.z);
  bus.group.rotation.set(0, bus.yaw, 0);
  bus.body.position.y = rumble;
  bus.body.rotation.set(bus.pitch, 0, bus.roll);
  for (const w of bus.wheels) {
    w.mesh.rotation.x = bus.wheelRot;
    w.steer.rotation.y = w.front ? bus.steer : 0;
  }
  const ease = (x) => x * x * (3 - 2 * x);
  bus.doorT = clamp(bus.doorT + (bus.doorOpen ? dt : -dt) / 0.7, 0, 1);
  const a = ease(bus.doorT) * 1.45;
  bus.doors[0].pivot.rotation.y = a * 1;
  bus.doors[1].pivot.rotation.y = -a;
  bus.hatchT = clamp(bus.hatchT + (bus.hatchOpen ? dt : -dt) / 0.8, 0, 1);
  bus.hatch.rotation.x = ease(bus.hatchT) * 1.9;
}

export function busFootprint(bus) {
  return { x: bus.pos.x, z: bus.pos.z, yaw: bus.yaw, hw: BUS.wid / 2 + 0.05, hl: BUS.len / 2 + 0.1 };
}

export function pushOutOfBus(bus, p, r) {
  if (!bus.group.visible) return false;
  const fx = Math.sin(bus.yaw), fz = Math.cos(bus.yaw), lx = Math.cos(bus.yaw), lz = -Math.sin(bus.yaw);
  const dx = p.x - bus.pos.x, dz = p.z - bus.pos.z;
  const a = dx * fx + dz * fz, b = dx * lx + dz * lz;
  const hl = BUS.len / 2 + r, hw = BUS.wid / 2 + r;
  if (Math.abs(a) >= hl || Math.abs(b) >= hw) return false;
  const pa = hl - Math.abs(a), pb = hw - Math.abs(b);
  if (pa < pb) {
    const na = Math.sign(a) * hl;
    p.x = bus.pos.x + fx * na + lx * b;
    p.z = bus.pos.z + fz * na + lz * b;
  } else {
    const nb = Math.sign(b) * hw;
    p.x = bus.pos.x + fx * a + lx * nb;
    p.z = bus.pos.z + fz * a + lz * nb;
  }
  return true;
}

export function busRayClip(bus, from, to, pad = 0.35) {
  if (!bus.group.visible) return 1;
  const fx = Math.sin(bus.yaw), fz = Math.cos(bus.yaw), lx = Math.cos(bus.yaw), lz = -Math.sin(bus.yaw);
  const ax = from.x - bus.pos.x, az = from.z - bus.pos.z, bx = to.x - bus.pos.x, bz = to.z - bus.pos.z;
  const a0 = ax * fx + az * fz, b0 = ax * lx + az * lz, a1 = bx * fx + bz * fz, b1 = bx * lx + bz * lz;
  const hl = BUS.len / 2 + pad, hw = BUS.wid / 2 + pad;
  let t0 = 0, t1 = 1;
  for (const [p0, p1, h] of [[a0, a1, hl], [b0, b1, hw]]) {
    const d = p1 - p0;
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(p0) > h) return 1;
      continue;
    }
    let ta = (-h - p0) / d, tb = (h - p0) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return 1;
  }
  const y = from.y + (to.y - from.y) * t0;
  if (y > bus.pos.y + BUS.roof + 0.4) return 1;
  return Math.max(0, t0 - 0.02);
}
