// Stillvale - the passengers: seated grooving, leaving the coach, formation and beat-synced dancing.
import * as THREE from 'three';
import { buildDancer, buildDriver, blankPose, applyPose, lerpPose } from './avatar.js';
import { MOVES, RING_MOVES, seated, driver as driverPose, locomotion } from './moves.js';
import { groundAt } from './world.js';
import { BUS, pushOutOfBus } from './bus.js';
import { rng, clamp } from './noise.js';

const ROOF = [4, 11, 14];
const LINE = [6, 1, 8, 13];
const HATCH_Z = 1.72;
const ROOF_SPOTS = [[0.35, 3.6], [-0.4, 0.3], [0.3, -3.3]];

export function buildCrowd(scene, bus, material) {
  const R = rng(777);
  const window = bus.seats.filter((s) => Math.abs(s.x) > 0.5).sort((a, b) => a.row - b.row || a.x - b.x);
  const picks = [];
  for (let i = 0; i < 16; i++) picks.push(window[Math.round((i * (window.length - 1)) / 15)]);
  const roofSeats = window.filter((s) => s.row >= 1 && s.row <= 3).slice(0, 3);
  const order = [];
  const dancers = [];
  let ri = 0, other = picks.filter((s) => !roofSeats.includes(s));
  for (let i = 0; i < 16; i++) {
    const rig = buildDancer(material, i, R);
    const sc = 0.95 + R() * 0.1;
    rig.mesh.scale.setScalar(sc);
    const role = ROOF.includes(i) ? 'roof' : LINE.includes(i) ? 'line' : 'ring';
    const seat = role === 'roof' ? roofSeats[ri++] : other.shift();
    const d = {
      i, rig, role, seat, sc,
      pose: blankPose(), a: blankPose(), b: blankPose(),
      state: 'seated', pos: new THREE.Vector3(), yaw: 0, path: null, pathT: 0, phase: R() * 6, energy: 0.65 + R() * 0.35,
      offset: (R() - 0.5) * 0.06, move: 'bounceClap', prev: 'bounceClap', blendAt: -99, danceIn: 0, slot: new THREE.Vector3(),
      ringIdx: 0, lineIdx: LINE.indexOf(i), roofIdx: ROOF.indexOf(i), exitAt: 0, cane: rig.role.cane,
    };
    dancers.push(d);
  }
  const ring = dancers.filter((d) => d.role === 'ring');
  ring.forEach((d, k) => (d.ringIdx = k));
  const exitOrder = dancers.filter((d) => d.role !== 'roof').sort((a, b) => b.seat.z - a.seat.z);
  exitOrder.forEach((d, k) => order.push(d));

  const drv = buildDriver(material);
  const drvPose = blankPose();

  const crowd = {
    dancers, ring, driver: drv, center: new THREE.Vector3(), busDir: new THREE.Vector3(0, 0, 1), started: false, phrase: -99,
    doorBeat: 0, tmpW: new THREE.Vector3(), lastBeat: 0,
  };

  function seatAll() {
    for (const d of dancers) {
      if (d.rig.mesh.parent) d.rig.mesh.parent.remove(d.rig.mesh);
      bus.body.add(d.rig.mesh);
      d.rig.mesh.position.set(d.seat.x, BUS.floor + 0.005, d.seat.z + 0.05);
      d.rig.mesh.rotation.set(0, 0, 0);
      d.state = 'seated';
      d.danceIn = 0;
    }
    if (drv.mesh.parent) drv.mesh.parent.remove(drv.mesh);
    bus.body.add(drv.mesh);
    drv.mesh.position.set(0.62, BUS.floor + 0.005, 4.6);
    crowd.started = false;
    crowd.phrase = -99;
  }
  seatAll();

  function exitPath(d) {
    const s = d.seat;
    return [
      [s.x, BUS.floor, s.z],
      [0, BUS.floor, s.z],
      [0, BUS.floor, 4.85],
      [-0.75, BUS.floor - 0.1, 5.0],
      [-1.15, 0.5, 5.0],
      [-1.9, 0.0, 5.0],
    ];
  }
  function roofPath(d) {
    const s = d.seat, [sx, sz] = ROOF_SPOTS[d.roofIdx];
    return [
      [s.x, BUS.floor, s.z],
      [0, BUS.floor, s.z],
      [0, BUS.floor, HATCH_Z - 0.4],
      [0, BUS.roof + 0.02, HATCH_Z - 0.4],
      [sx, BUS.roof + 0.02, sz],
    ];
  }
  function walkPath(d, path, speed, dt) {
    let rem = speed * dt;
    while (rem > 0 && d.pathT < path.length - 1) {
      const i = Math.floor(d.pathT), t = d.pathT - i;
      const a = path[i], b = path[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const left = (1 - t) * len;
      if (rem >= left) {
        d.pathT = i + 1;
        rem -= left;
      } else {
        d.pathT += rem / Math.max(len, 1e-4);
        rem = 0;
      }
    }
    const i = Math.min(Math.floor(d.pathT), path.length - 2), t = d.pathT - i;
    const a = path[i], b = path[i + 1];
    d.rig.mesh.position.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    const dx = b[0] - a[0], dz = b[2] - a[2];
    if (Math.hypot(dx, dz) > 0.05) d.yaw = Math.atan2(dx, dz);
    d.rig.mesh.rotation.y = d.yaw;
    return d.pathT >= path.length - 1;
  }

  function open(doorBeat, player) {
    crowd.started = true;
    crowd.doorBeat = doorBeat;
    order.forEach((d, k) => {
      d.exitAt = doorBeat + 0.4 + k * 0.45;
      d.state = 'queued';
      d.pathT = 0;
      d.path = exitPath(d);
    });
    dancers.filter((d) => d.role === 'roof').forEach((d, k) => {
      d.exitAt = doorBeat + 1.5 + k * 1.1;
      d.state = 'queued';
      d.pathT = 0;
      d.path = roofPath(d);
    });
    crowd.center.set(player.x, player.y, player.z);
    crowd.busDir.set(bus.pos.x - player.x, 0, bus.pos.z - player.z).normalize();
  }

  function pickMoves(phrase) {
    const pr = rng(9000 + phrase * 31);
    const pool = RING_MOVES;
    const A = pool[Math.floor(pr() * pool.length)];
    let B = pool[Math.floor(pr() * pool.length)];
    if (B === A) B = pool[(pool.indexOf(A) + 3) % pool.length];
    const unison = phrase % 4 === 3;
    for (const d of dancers) {
      let m;
      if (d.role === 'line') m = d.lineIdx === 0 ? 'dabkeLead' : 'dabke';
      else if (d.role === 'roof') m = phrase % 2 ? 'pump' : 'roof';
      else if (unison) m = A;
      else if (d.cane && pr() < 0.6) m = 'ardah';
      else m = d.ringIdx % 2 ? A : B;
      if (m !== d.move) {
        d.prev = d.move;
        d.move = m;
        d.blendAt = phrase;
      }
    }
  }

  const tmp = new THREE.Vector3();
  function slotFor(d, beat) {
    const C = crowd.center;
    if (d.role === 'ring') {
      const n = ring.length;
      const th = (d.ringIdx / n) * Math.PI * 2 - beat * ((Math.PI * 2) / 96);
      const r = 3.3 + 0.55 * (d.ringIdx % 2) + 0.35 * Math.sin((Math.PI * beat) / 8);
      return d.slot.set(C.x + Math.sin(th) * r, 0, C.z + Math.cos(th) * r);
    }
    const bd = crowd.busDir;
    const ax = -bd.z, az = bd.x;
    const shift = 0.7 * Math.sin((Math.PI * beat) / 16);
    const off = (d.lineIdx - 1.5) * 0.82 + shift;
    return d.slot.set(C.x + bd.x * 6.3 + ax * off, 0, C.z + bd.z * 6.3 + az * off);
  }

  function facingFor(d) {
    if (d.role === 'line') return Math.atan2(-crowd.busDir.x, -crowd.busDir.z);
    return Math.atan2(crowd.center.x - d.pos.x, crowd.center.z - d.pos.z);
  }

  function update(dt, t, beat, music, player, busState) {
    const groove = music ? beat : t * 2.05;
    if (crowd.started) {
      const ph = Math.floor((beat - 2) / 8);
      if (ph !== crowd.phrase) {
        crowd.phrase = ph;
        pickMoves(ph);
      }
      tmp.set(player.x, player.y, player.z);
      crowd.center.lerp(tmp, Math.min(1, dt * 1.6));
    }
    for (const d of dancers) {
      const b = groove + d.offset;
      const P = d.pose;
      Object.assign(P, blankPose());
      if (d.state === 'seated' || (d.state === 'queued' && beat < d.exitAt)) {
        seated(b, P, music ? d.energy : 0.15);
        d.rig.mesh.rotation.y = 0;
      } else if (d.state === 'queued' || d.state === 'aisle') {
        d.state = 'aisle';
        const done = walkPath(d, d.path, d.role === 'roof' ? 3.2 : 4.8, dt);
        d.phase += dt * 9;
        locomotion(P, d.phase, 1.4, t);
        if (d.role === 'roof' && d.pathT > 2 && d.pathT < 3) {
          P.lArmS = P.rArmS = 2.7;
          P.lArmF = P.rArmF = 0.3;
          P.lLegF = 0.6 * Math.abs(Math.sin(d.phase));
          P.lKnee = 1.0 * Math.abs(Math.sin(d.phase));
          bus.hatchOpen = true;
        }
        if (done) {
          if (d.role === 'roof') {
            d.state = 'roof';
            d.danceIn = 0;
          } else {
            scene.attach(d.rig.mesh);
            d.pos.copy(d.rig.mesh.position);
            d.yaw += bus.yaw;
            d.rig.mesh.rotation.set(0, d.yaw, 0);
            d.state = 'run';
          }
        }
      } else if (d.state === 'roof') {
        d.danceIn = Math.min(1, d.danceIn + dt * 2.5);
        MOVES[d.move](b, d.b);
        lerpPose(blankPose(), d.b, d.danceIn, P);
        d.rig.mesh.getWorldPosition(crowd.tmpW);
        const want = Math.atan2(player.x - crowd.tmpW.x, player.z - crowd.tmpW.z) - bus.yaw;
        d.yaw += angleTo(d.yaw, want) * Math.min(1, dt * 3);
        d.rig.mesh.rotation.set(0, d.yaw, 0);
      } else {
        const slot = slotFor(d, beat);
        const dx = slot.x - d.pos.x, dz = slot.z - d.pos.z, dist = Math.hypot(dx, dz);
        if (d.state === 'run') {
          const sp = 6.0;
          const step = Math.min(dist, sp * dt);
          if (dist > 1e-3) {
            d.pos.x += (dx / dist) * step;
            d.pos.z += (dz / dist) * step;
            d.yaw += angleTo(d.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
          }
          d.phase += step * 3.1;
          locomotion(P, d.phase, 2, t);
          if (dist < 0.45) {
            d.state = 'dance';
            d.danceIn = 0;
            Object.assign(d.a, P);
          }
        } else {
          if (dist > 1.8) d.state = 'run';
          d.pos.x += dx * Math.min(1, dt * 2.2);
          d.pos.z += dz * Math.min(1, dt * 2.2);
          d.yaw += angleTo(d.yaw, facingFor(d)) * Math.min(1, dt * 4);
          d.danceIn = Math.min(1, d.danceIn + dt * 2.2);
          MOVES[d.move](b, d.b);
          const bl = clamp((beat - (d.blendAt * 8 + 2)) / 0.75, 0, 1);
          if (bl < 1) {
            const pa = blankPose();
            MOVES[d.prev](b, pa);
            lerpPose(pa, d.b, bl, d.b);
          }
          lerpPose(d.a, d.b, d.danceIn, P);
        }
      }
      applyPose(d.rig, P);
    }
    const ground = dancers.filter((d) => d.state === 'run' || d.state === 'dance');
    for (let i = 0; i < ground.length; i++) {
      const a = ground[i];
      for (let j = i + 1; j < ground.length; j++) {
        const c = ground[j];
        const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z, l = Math.hypot(dx, dz);
        if (l < 0.72 && l > 1e-4) {
          const k = (0.72 - l) * 0.5;
          a.pos.x -= (dx / l) * k; a.pos.z -= (dz / l) * k;
          c.pos.x += (dx / l) * k; c.pos.z += (dz / l) * k;
        }
      }
      const px = a.pos.x - player.x, pz = a.pos.z - player.z, pl = Math.hypot(px, pz);
      if (pl < 1.15 && pl > 1e-4) {
        a.pos.x = player.x + (px / pl) * 1.15;
        a.pos.z = player.z + (pz / pl) * 1.15;
      }
      pushOutOfBus(bus, a.pos, 0.35);
      a.pos.y = groundAt(a.pos.x, a.pos.z);
      a.rig.mesh.position.copy(a.pos);
      a.rig.mesh.rotation.set(0, a.yaw, 0);
    }
    Object.assign(drvPose, blankPose());
    driverPose(t, groove, drvPose, busState === 'stopped' || busState === 'open');
    applyPose(drv, drvPose);
  }

  function pushList(player) {
    const list = [{ x: player.x, z: player.z, r: 0.95, s: 1 }];
    for (const d of dancers) if (d.state === 'run' || d.state === 'dance') list.push({ x: d.pos.x, z: d.pos.z, r: 0.75, s: 1 });
    return list;
  }

  return Object.assign(crowd, { update, open, seatAll, pushList });
}

function angleTo(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
