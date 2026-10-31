// Stillvale - hand-scripted blocky characters: rig, texture atlas, outfits and pose application.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const S = 0.33;
const BONE_NAMES = ['root', 'hips', 'torso', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR'];
const BI = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
const AT = 1024;

const REGIONS = {
  white: [4, 4, 24, 24],
  shemagh: [0, 768, 512, 256],
  ghutra: [512, 768, 512, 256],
  bisht: [512, 0, 256, 128],
  shirt: [768, 0, 128, 128],
  denim: [896, 0, 128, 128],
};
const faceRegion = (i) => [(i % 6) * 168 + 4, 256 + Math.floor(i / 6) * 168 + 4, 160, 160];

function drawAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = AT;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, AT, AT);
  const faces = ['classic', 'grin', 'stache', 'beard', 'shades', 'wink', 'shout', 'player', 'stacheGrin', 'beardShades', 'happy', 'cool'];
  faces.forEach((f, i) => drawFace(g, faceRegion(i), f));
  {
    const [x, y, w, h] = REGIONS.shemagh;
    g.fillStyle = '#f7f3ee';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#b3141e';
    const s = 16;
    for (let yy = 0; yy < h; yy += s)
      for (let xx = 0; xx < w; xx += s) {
        g.fillRect(x + xx, y + yy + 6, s, 4);
        g.fillRect(x + xx + 6, y + yy, 4, s);
        if ((xx / s + yy / s) % 2 === 0) {
          g.beginPath();
          g.moveTo(x + xx + 8, y + yy + 1);
          g.lineTo(x + xx + 15, y + yy + 8);
          g.lineTo(x + xx + 8, y + yy + 15);
          g.lineTo(x + xx + 1, y + yy + 8);
          g.closePath();
          g.fill();
        }
      }
    g.fillStyle = '#8f0f17';
    g.fillRect(x, y + h - 26, w, 10);
    g.fillRect(x, y + 16, w, 6);
  }
  {
    const [x, y, w, h] = REGIONS.ghutra;
    g.fillStyle = '#fbfbf8';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < w; i += 6) {
      g.beginPath();
      g.moveTo(x + i, y);
      g.lineTo(x + i, y + h);
      g.stroke();
    }
  }
  {
    const [x, y, w, h] = REGIONS.bisht;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#e0aa3e';
    g.fillRect(x, y, 26, h);
    g.fillRect(x + w - 26, y, 26, h);
    g.fillStyle = '#fbd77a';
    g.fillRect(x + 9, y, 5, h);
    g.fillRect(x + w - 14, y, 5, h);
  }
  {
    const [x, y, w, h] = REGIONS.shirt;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x + w / 2, y + 2, w * 0.2, h * 0.09, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.font = `800 ${Math.round(w * 0.2)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('GZOWO', x + w * 0.5, y + h * 0.5);
  }
  {
    const [x, y, w, h] = REGIONS.denim;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.14})`;
      g.fillRect(x + Math.random() * w, y + Math.random() * h, 1, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawFace(g, [x, y, w, h], kind) {
  const cx = x + w / 2, cy = y + h / 2;
  const ink = '#141414';
  const eye = (ex, ey, closed) => {
    g.fillStyle = ink;
    if (closed) {
      g.beginPath();
      g.lineWidth = 5;
      g.strokeStyle = ink;
      g.arc(ex, ey + 4, 9, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      return;
    }
    g.beginPath();
    g.ellipse(ex, ey, 8, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(ex + 2.5, ey - 4, 2.6, 0, Math.PI * 2);
    g.fill();
  };
  const smile = (r = 30, lw = 6, oy = 18) => {
    g.strokeStyle = ink;
    g.lineWidth = lw;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(cx, cy + oy - r, r, Math.PI * 0.22, Math.PI * 0.78);
    g.stroke();
  };
  const grin = (oy = 14) => {
    g.fillStyle = ink;
    g.beginPath();
    g.moveTo(cx - 32, cy + oy);
    g.quadraticCurveTo(cx, cy + oy + 48, cx + 32, cy + oy);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(cx - 24, cy + oy + 2, 48, 9);
    g.fillStyle = '#c4454f';
    g.beginPath();
    g.ellipse(cx, cy + oy + 24, 13, 6, 0, 0, Math.PI * 2);
    g.fill();
  };
  const stache = (oy = 12, wd = 46) => {
    g.fillStyle = '#1d1510';
    g.beginPath();
    g.moveTo(cx - wd / 2, cy + oy + 6);
    g.quadraticCurveTo(cx - wd / 4, cy + oy - 6, cx, cy + oy);
    g.quadraticCurveTo(cx + wd / 4, cy + oy - 6, cx + wd / 2, cy + oy + 6);
    g.quadraticCurveTo(cx, cy + oy + 10, cx - wd / 2, cy + oy + 6);
    g.fill();
  };
  const beard = () => {
    g.fillStyle = '#21180f';
    g.beginPath();
    g.moveTo(x + 22, cy + 2);
    g.quadraticCurveTo(x + 26, y + h - 6, cx, y + h - 2);
    g.quadraticCurveTo(x + w - 26, y + h - 6, x + w - 22, cy + 2);
    g.lineTo(x + w - 34, cy + 6);
    g.quadraticCurveTo(cx, cy + 56, x + 34, cy + 6);
    g.closePath();
    g.fill();
  };
  const brows = (oy = -34) => {
    g.strokeStyle = ink;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - 34, cy + oy + 2);
    g.lineTo(cx - 16, cy + oy - 2);
    g.moveTo(cx + 16, cy + oy - 2);
    g.lineTo(cx + 34, cy + oy + 2);
    g.stroke();
  };
  const shades = () => {
    g.fillStyle = '#0d0d10';
    g.beginPath();
    g.roundRect(cx - 50, cy - 26, 44, 26, 8);
    g.roundRect(cx + 6, cy - 26, 44, 26, 8);
    g.fill();
    g.fillRect(cx - 8, cy - 22, 16, 5);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(cx - 42, cy - 22, 10, 4);
    g.fillRect(cx + 14, cy - 22, 10, 4);
  };
  const ex = 22, ey = -14;
  switch (kind) {
    case 'classic': eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); smile(); break;
    case 'grin': eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); grin(); break;
    case 'stache': eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); stache(); smile(26, 5, 30); break;
    case 'beard':
      beard(); eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); stache(10);
      g.strokeStyle = '#f2e6d8'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy + 4, 18, Math.PI * 0.25, Math.PI * 0.75); g.stroke();
      break;
    case 'shades': shades(); smile(28, 6, 22); break;
    case 'wink': eye(cx - ex, cy + ey, true); eye(cx + ex, cy + ey); grin(); break;
    case 'shout':
      eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); brows();
      g.fillStyle = ink; g.beginPath(); g.ellipse(cx, cy + 30, 15, 20, 0, 0, Math.PI * 2); g.fill();
      break;
    case 'player': brows(-36); eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); smile(30, 6, 20); break;
    case 'stacheGrin': eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); grin(18); stache(6, 52); break;
    case 'beardShades': beard(); shades(); stache(10); break;
    case 'happy': eye(cx - ex, cy + ey, true); eye(cx + ex, cy + ey, true); grin(); break;
    case 'cool': brows(-34); eye(cx - ex, cy + ey); eye(cx + ex, cy + ey); stache(10, 40); smile(24, 5, 30); break;
  }
}

const WHITE_UV = [(REGIONS.white[0] + 12) / AT, 1 - (REGIONS.white[1] + 12) / AT];
const regionUV = ([x, y, w, h], u, v) => [(x + u * w) / AT, 1 - (y + (1 - v) * h) / AT];

class Builder {
  constructor() {
    this.parts = [];
  }
  add(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], color = '#ffffff', uv = 'plain', front = false, bone = 'torso', weights = null, flare = 0 }) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const frontRange = front && g.groups.length >= 6 ? g.groups.find((gr) => gr.materialIndex === 4) : null;
    if (flare) {
      const p = g.attributes.position;
      const bb = new THREE.Box3().setFromBufferAttribute(p);
      for (let i = 0; i < p.count; i++) {
        const t = (bb.max.y - p.getY(i)) / (bb.max.y - bb.min.y);
        p.setX(i, p.getX(i) * (1 + flare * t));
        p.setZ(i, p.getZ(i) * (1 + flare * 0.7 * t));
      }
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uvs = new Float32Array(n * 2);
    const src = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      let u = WHITE_UV;
      const inFront = !frontRange || (i >= frontRange.start && i < frontRange.start + frontRange.count);
      if (uv !== 'plain' && src && inFront) {
        const reg = Array.isArray(uv) ? uv : REGIONS[uv];
        const su = Math.min(Math.max(src.getX(i), 0), 1), sv = Math.min(Math.max(src.getY(i), 0), 1);
        u = regionUV(reg, su, sv);
      }
      uvs[i * 2] = u[0];
      uvs[i * 2 + 1] = u[1];
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const p = g.attributes.position;
    for (let i = 0; i < n; i++) {
      if (weights) {
        weights(p.getX(i), p.getY(i), p.getZ(i)).slice(0, 4).forEach(([b, w], k) => {
          si[i * 4 + k] = BI[b];
          sw[i * 4 + k] = w;
        });
      } else {
        si[i * 4] = BI[bone];
        sw[i * 4] = 1;
      }
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    this.parts.push(g);
  }
  box(w, h, d, opts, r = 0.035) {
    this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), opts);
  }
  head(opts) {
    const R = 0.212, H = 0.41, cr = 0.075, pts = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
      pts.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, cr + Math.sin(a) * cr));
    }
    for (let i = 0; i <= 5; i++) {
      const a = (i / 5) * (Math.PI / 2);
      pts.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, H - cr + Math.sin(a) * cr));
    }
    pts.push(new THREE.Vector2(0, H));
    const g = new THREE.LatheGeometry(pts, 28, -Math.PI, Math.PI * 2).toNonIndexed();
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const phi = Math.atan2(p.getX(i), p.getZ(i));
      uv.setXY(i, Math.min(Math.max(0.5 + phi / 2, 0), 1), Math.min(Math.max((p.getY(i) - 0.04) / (H - 0.1), 0), 1));
    }
    this.add(g, { ...opts, uv: faceRegion(opts.face) });
  }
  build(material) {
    const geo = mergeGeometries(this.parts, false);
    geo.computeBoundingSphere();
    const bones = {};
    const mk = (name, parent, x, y, z) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      if (parent) bones[parent].add(b);
      bones[name] = b;
    };
    mk('root', null, 0, 0, 0);
    mk('hips', 'root', 0, 2 * S, 0);
    mk('torso', 'hips', 0, 0, 0);
    mk('head', 'torso', 0, 2 * S, 0);
    mk('armL', 'torso', 1.5 * S, 1.78 * S, 0);
    mk('foreL', 'armL', 0, -0.9 * S, 0);
    mk('armR', 'torso', -1.5 * S, 1.78 * S, 0);
    mk('foreR', 'armR', 0, -0.9 * S, 0);
    mk('legL', 'hips', 0.5 * S, 0, 0);
    mk('shinL', 'legL', 0, -1.0 * S, 0);
    mk('legR', 'hips', -0.5 * S, 0, 0);
    mk('shinR', 'legR', 0, -1.0 * S, 0);
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.add(bones.root);
    mesh.bind(new THREE.Skeleton(BONE_NAMES.map((n) => bones[n])));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, bones, hipY: 2 * S };
  }
}

function body(B, o) {
  const legW = 0.98 * S;
  for (const [side, bx] of [['L', 0.5 * S], ['R', -0.5 * S]]) {
    B.box(legW, 0.35, legW, { pos: [bx, 0.485, 0], color: o.legs, bone: 'leg' + side, uv: o.legUV || 'plain' });
    B.box(legW * 0.97, 0.33, legW * 0.97, { pos: [bx, 0.182, 0], color: o.shins || o.legs, bone: 'shin' + side, uv: o.legUV || 'plain' });
    B.box(1.04 * S, 0.099, 1.24 * S, { pos: [bx, 0.05, 0.06], color: o.shoes, bone: 'shin' + side });
    if (o.sole) B.box(1.06 * S, 0.03, 1.27 * S, { pos: [bx, 0.015, 0.06], color: o.sole, bone: 'shin' + side }, 0.01);
  }
  B.box(2 * S, 2 * S, 1 * S, { pos: [0, 3 * S, 0], color: o.torso, bone: 'torso', uv: o.torsoUV || 'plain', front: !!o.torsoUV }, 0.05);
  for (const [side, bx] of [['L', 1.5 * S], ['R', -1.5 * S]]) {
    B.box(1 * S, 0.41, 1 * S, { pos: [bx, 1.125, 0], color: o.sleeve, bone: 'arm' + side });
    B.box(0.96 * S, 0.215, 0.96 * S, { pos: [bx, 0.8775, 0], color: o.forearm, bone: 'fore' + side });
    B.box(0.9 * S, 0.12, 0.9 * S, { pos: [bx, 0.72, 0], color: o.skin, bone: 'fore' + side });
  }
  B.head({ pos: [0, 4 * S + 0.005, 0], color: o.skin, bone: 'head', face: o.face });
}

function headwear(B, kind, tails) {
  const hd = 4 * S;
  const cloth = '#ffffff';
  B.box(0.5, 0.15, 0.5, { pos: [0, hd + 0.4, -0.01], color: cloth, uv: kind, bone: 'head' }, 0.05);
  for (const sx of [-1, 1]) B.box(0.06, 0.5, 0.42, { pos: [sx * 0.235, hd + 0.17, -0.04], rot: [0, 0, sx * -0.06], color: cloth, uv: kind, bone: 'head' }, 0.02);
  B.box(0.5, 0.56, 0.06, { pos: [0, hd + 0.12, -0.235], rot: [0.1, 0, 0], color: cloth, uv: kind, bone: 'head' }, 0.02);
  if (tails) for (const sx of [-1, 1]) B.box(0.13, 0.44, 0.05, { pos: [sx * 0.2, hd - 0.02, 0.205], rot: [-0.12, 0, sx * 0.08], color: cloth, uv: kind, bone: 'head' }, 0.02);
  else B.box(0.46, 0.08, 0.22, { pos: [0, hd + 0.47, 0.05], rot: [0.3, 0, 0], color: cloth, uv: kind, bone: 'head' }, 0.03);
  for (const dy of [0.488, 0.515]) B.add(new THREE.TorusGeometry(0.17, 0.016, 6, 24), { pos: [0, hd + dy, -0.01], rot: [Math.PI / 2, 0, 0], color: '#121212', bone: 'head' });
}

export function makeAtlas() {
  return drawAtlas();
}

export function makeMaterial(atlas) {
  return new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.72, metalness: 0 });
}

export function buildPlayer(material) {
  const B = new Builder();
  body(B, { skin: '#f1c48f', torso: '#2f8f4e', torsoUV: 'shirt', sleeve: '#2f8f4e', forearm: '#f1c48f', legs: '#34497a', legUV: 'denim', shoes: '#f4f4f4', sole: '#3a3a3a', face: 7 });
  const hair = '#e9c25b', hd = 4 * S;
  B.box(0.47, 0.12, 0.47, { pos: [0, hd + 0.415, -0.005], color: hair, bone: 'head' }, 0.04);
  B.box(0.46, 0.27, 0.13, { pos: [0, hd + 0.28, -0.17], color: hair, bone: 'head' }, 0.04);
  for (const sx of [-1, 1]) B.box(0.07, 0.17, 0.32, { pos: [sx * 0.214, hd + 0.33, -0.04], color: hair, bone: 'head' }, 0.025);
  const spikes = [[-0.13, 0.46, 0.13, 0.4], [0.0, 0.48, 0.15, 0.55], [0.13, 0.46, 0.12, 0.35], [-0.06, 0.5, 0.02, 0.2], [0.08, 0.5, -0.06, -0.2]];
  for (const [x, y, z, a] of spikes) B.box(0.15, 0.1, 0.17, { pos: [x, hd + y, z], rot: [a, x * 2, 0], color: hair, bone: 'head' }, 0.03);
  return B.build(material);
}

const SKINS = ['#c98d5a', '#b97a4a', '#d9a370', '#a8693c', '#e0b07c', '#8f5a33', '#c48452'];
const FACES = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 2, 1, 3, 8, 0];

export function buildDancer(material, idx, R) {
  const B = new Builder();
  const white = '#f3f2ee';
  body(B, { skin: SKINS[idx % SKINS.length], torso: white, sleeve: white, forearm: white, legs: white, shins: white, shoes: R() < 0.5 ? '#4a3524' : '#1e1e1e', face: FACES[idx % FACES.length] });
  headwear(B, idx % 7 === 3 ? 'ghutra' : 'shemagh', R() < 0.6);
  const hipY = 2 * S;
  B.box(0.72, 0.6, 0.39, {
    pos: [0, hipY - 0.27, 0],
    color: white,
    flare: 0.14,
    weights: (x, y) => {
      const f = Math.min(Math.max((hipY - 0.06 - y) / 0.5, 0), 1) * 0.6;
      const l = Math.min(Math.max((x + 0.08) / 0.16, 0), 1);
      return [['hips', 1 - f], ['legL', f * l], ['legR', f * (1 - l)]];
    },
  }, 0.04);
  const role = { cane: false, cloth: false, bisht: false };
  if (idx === 0 || idx === 9) {
    role.bisht = true;
    const bc = idx === 0 ? '#3a2614' : '#141414';
    B.box(0.72, 0.98, 0.05, { pos: [0, 0.92, -0.2], color: bc, uv: 'bisht', bone: 'torso' }, 0.02);
    for (const sx of [-1, 1]) B.box(0.14, 0.98, 0.05, { pos: [sx * 0.29, 0.92, 0.19], color: bc, uv: 'bisht', bone: 'torso' }, 0.02);
  }
  if (idx % 5 === 2) {
    role.cane = true;
    B.add(new THREE.CylinderGeometry(0.014, 0.014, 0.7, 6), { pos: [-1.5 * S, 0.39, 0.02], color: '#6b4a2b', bone: 'foreR' });
  }
  if (idx === 6) {
    role.cloth = true;
    B.box(0.2, 0.3, 0.02, { pos: [-1.5 * S, 0.5, 0.03], color: '#ffffff', uv: 'shemagh', bone: 'foreR' }, 0.005);
  }
  const rig = B.build(material);
  rig.role = role;
  return rig;
}

export function buildDriver(material) {
  const B = new Builder();
  body(B, { skin: '#b97a4a', torso: '#f3f2ee', sleeve: '#f3f2ee', forearm: '#f3f2ee', legs: '#f3f2ee', shoes: '#1e1e1e', face: 4 });
  headwear(B, 'shemagh', true);
  return B.build(material);
}

export function blankPose() {
  return {
    bob: 0, hop: 0, spin: 0, px: 0, pz: 0, hipSway: 0, hipTwist: 0, hipPitch: 0, hipRoll: 0,
    lean: 0, side: 0, twist: 0, nod: 0, tilt: 0, turn: 0,
    lArmF: 0, lArmS: 0.06, lArmT: 0, lElb: 0.1, rArmF: 0, rArmS: 0.06, rArmT: 0, rElb: 0.1,
    lLegF: 0, lLegS: 0, lKnee: 0, rLegF: 0, rLegS: 0, rKnee: 0,
  };
}

export const POSE_KEYS = Object.keys(blankPose());

export function lerpPose(a, b, t, out) {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export function applyPose(rig, p) {
  const b = rig.bones;
  b.root.position.set(p.px, p.hop, p.pz);
  b.root.rotation.set(0, p.spin, 0);
  b.hips.position.set(p.hipSway, rig.hipY + p.bob, 0);
  b.hips.rotation.set(p.hipPitch, p.hipTwist, p.hipRoll);
  b.torso.rotation.set(p.lean, p.twist, -p.side);
  b.head.rotation.set(p.nod, p.turn, -p.tilt);
  b.armL.rotation.set(-p.lArmF, -p.lArmT, p.lArmS);
  b.armR.rotation.set(-p.rArmF, p.rArmT, -p.rArmS);
  b.foreL.rotation.set(-p.lElb, 0, 0);
  b.foreR.rotation.set(-p.rElb, 0, 0);
  b.legL.rotation.set(-p.lLegF, 0, p.lLegS);
  b.legR.rotation.set(-p.rLegF, 0, -p.rLegS);
  b.shinL.rotation.set(p.lKnee, 0, 0);
  b.shinR.rotation.set(p.rKnee, 0, 0);
}
