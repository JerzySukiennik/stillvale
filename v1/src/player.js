// Stillvale - keyboard, mouse and touch input, third-person movement, collisions and camera.
import * as THREE from 'three';
import { blankPose, applyPose } from './avatar.js';
import { locomotion, airborne } from './moves.js';
import { groundAt, valleyEdge, WATER_Y, START, LAKE } from './world.js';
import { pushOutOfBus, busRayClip } from './bus.js';
import { clamp } from './noise.js';

export function createPlayer(rig, camera, dom, colliders, bus, hooks) {
  const p = {
    rig,
    pos: new THREE.Vector3(START.x, groundAt(START.x, START.z), START.z),
    vel: new THREE.Vector3(),
    yaw: 0, vy: 0, grounded: true, phase: 0, speed: 0,
    camYaw: 0, camPitch: 0.22, camDist: 5.6, camPos: new THREE.Vector3(),
    enabled: false, cinematic: null,
  };
  const keys = new Set();
  const touch = { move: null, look: null, mx: 0, mz: 0, run: false };
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  p.isTouch = isTouch;

  function resetTo(x, z, faceX, faceZ) {
    p.pos.set(x, groundAt(x, z), z);
    p.vel.set(0, 0, 0);
    p.vy = 0;
    p.yaw = Math.atan2(faceX - x, faceZ - z);
    p.camYaw = p.yaw + Math.PI;
    p.camPitch = 0.2;
    p.rig.mesh.position.copy(p.pos);
    p.rig.mesh.rotation.y = p.yaw;
  }
  resetTo(START.x, START.z, LAKE.x + 40, LAKE.z - 40);

  addEventListener('keydown', (e) => {
    if (!p.enabled) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  const look = (dx, dy, k) => {
    p.camYaw -= dx * k;
    p.camPitch = clamp(p.camPitch + dy * k, -0.3, 1.15);
  };
  dom.addEventListener('mousemove', (e) => {
    if (!p.enabled || isTouch) return;
    if (document.pointerLockElement === dom) look(e.movementX, e.movementY, 0.0024);
  });
  dom.addEventListener('wheel', (e) => {
    if (!p.enabled) return;
    p.camDist = clamp(p.camDist + e.deltaY * 0.004, 3.2, 9.5);
  }, { passive: true });

  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const jumpBtn = document.getElementById('jumpbtn');
  if (isTouch) document.body.classList.add('touch');
  let jumpQueued = false;
  jumpBtn?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    jumpQueued = true;
  }, { passive: false });
  dom.addEventListener('touchstart', (e) => {
    if (!p.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && !touch.move) {
        touch.move = { id: t.identifier, x: t.clientX, y: t.clientY };
        stick.style.transform = `translate(${t.clientX - 60}px, ${t.clientY - 60}px)`;
        stick.classList.add('on');
        knob.style.transform = 'translate(0px, 0px)';
      } else if (!touch.look) touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  dom.addEventListener('touchmove', (e) => {
    if (!p.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (touch.move && t.identifier === touch.move.id) {
        let dx = t.clientX - touch.move.x, dy = t.clientY - touch.move.y;
        const l = Math.hypot(dx, dy), R = 52;
        if (l > R) {
          dx *= R / l;
          dy *= R / l;
        }
        touch.mx = dx / R;
        touch.mz = dy / R;
        touch.run = l > R * 1.25;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (touch.look && t.identifier === touch.look.id) {
        look(t.clientX - touch.look.x, t.clientY - touch.look.y, 0.0058);
        touch.look.x = t.clientX;
        touch.look.y = t.clientY;
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (touch.move && t.identifier === touch.move.id) {
        touch.move = null;
        touch.mx = touch.mz = 0;
        touch.run = false;
        stick.classList.remove('on');
      }
      if (touch.look && t.identifier === touch.look.id) touch.look = null;
    }
  };
  dom.addEventListener('touchend', endTouch);
  dom.addEventListener('touchcancel', endTouch);

  const pose = blankPose();
  const near = [];
  const prevPos = new THREE.Vector3();
  let lastStepPhase = 0;

  function update(dt, t) {
    let ix = 0, iz = 0, run = false, jump = false;
    if (p.enabled) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
      run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      jump = keys.has('Space') || jumpQueued;
      if (touch.move) {
        ix = touch.mx;
        iz = -touch.mz;
        run = touch.run;
      }
    }
    jumpQueued = false;
    const il = Math.hypot(ix, iz);
    if (il > 1) {
      ix /= il;
      iz /= il;
    }
    const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
    const rx = Math.cos(p.camYaw), rz = -Math.sin(p.camYaw);
    const mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const ml = Math.hypot(mx, mz);
    const maxSpd = run ? 6.6 : 3.5;
    const tvx = mx * maxSpd, tvz = mz * maxSpd;
    const acc = p.grounded ? 16 : 5;
    p.vel.x += clamp(tvx - p.vel.x, -acc * dt, acc * dt);
    p.vel.z += clamp(tvz - p.vel.z, -acc * dt, acc * dt);
    if (ml > 0.05) {
      let d = Math.atan2(mx, mz) - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 11);
    }
    prevPos.copy(p.pos);
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    const g0 = groundAt(prevPos.x, prevPos.z), g1 = groundAt(p.pos.x, p.pos.z);
    const horiz = Math.hypot(p.pos.x - prevPos.x, p.pos.z - prevPos.z);
    if (p.grounded && horiz > 1e-4 && (g1 - g0) / horiz > 0.72) {
      p.pos.x = prevPos.x;
      p.pos.z = prevPos.z;
      p.vel.x *= 0.3;
      p.vel.z *= 0.3;
    }
    if (g1 < WATER_Y + 0.22) {
      p.pos.x = prevPos.x;
      p.pos.z = prevPos.z;
    }
    const edge = valleyEdge(p.pos.x, p.pos.z);
    if (edge > 1.02) {
      const cx = p.pos.x, cz = p.pos.z + 10;
      const l = Math.hypot(cx, cz) || 1;
      const k = Math.min(0.4, (edge - 1.02) * 8);
      p.pos.x -= (cx / l) * k;
      p.pos.z -= (cz / l) * k;
    }
    for (const c of colliders.near(p.pos.x, p.pos.z, 3, near)) {
      const dx = p.pos.x - c.x, dz = p.pos.z - c.z, l = Math.hypot(dx, dz), m = c.r + 0.38;
      if (l < m && l > 1e-4) {
        p.pos.x = c.x + (dx / l) * m;
        p.pos.z = c.z + (dz / l) * m;
      }
    }
    pushOutOfBus(bus, p.pos, 0.42);
    const ground = groundAt(p.pos.x, p.pos.z);
    if (p.grounded && jump) {
      p.vy = 6.4;
      p.grounded = false;
      hooks.onJump?.();
    }
    if (!p.grounded) {
      p.vy -= 21 * dt;
      p.pos.y += p.vy * dt;
      if (p.pos.y <= ground) {
        p.pos.y = ground;
        p.vy = 0;
        p.grounded = true;
        hooks.onLand?.();
      }
    } else {
      if (ground < p.pos.y - 0.35) {
        p.grounded = false;
        p.vy = 0;
      } else p.pos.y = ground;
    }
    const sp = Math.hypot(p.pos.x - prevPos.x, p.pos.z - prevPos.z) / Math.max(dt, 1e-4);
    p.speed += (sp - p.speed) * Math.min(1, dt * 10);
    const norm = p.speed < 3.6 ? p.speed / 3.5 : 1 + (p.speed - 3.5) / 3.1;
    p.phase += sp * dt * (norm > 1 ? 1.95 : 2.8);
    Object.assign(pose, blankPose());
    if (p.grounded) locomotion(pose, p.phase, clamp(norm, 0, 2), t);
    else airborne(pose, p.vy);
    applyPose(rig, pose);
    rig.mesh.position.copy(p.pos);
    rig.mesh.rotation.y = p.yaw;
    if (p.grounded && norm > 0.25) {
      const sp2 = Math.floor(p.phase / Math.PI);
      if (sp2 !== lastStepPhase) {
        lastStepPhase = sp2;
        hooks.onStep?.(norm);
      }
    }
  }

  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();
  function updateCamera(dt, t, focusOverride) {
    if (p.cinematic) {
      p.cinematic(dt, t, camera);
      p.camPos.copy(camera.position);
      return;
    }
    camTarget.set(p.pos.x, p.pos.y + 1.45, p.pos.z);
    const cp = Math.cos(p.camPitch), sp = Math.sin(p.camPitch);
    desired.set(camTarget.x + Math.sin(p.camYaw) * cp * p.camDist, camTarget.y + sp * p.camDist, camTarget.z + Math.cos(p.camYaw) * cp * p.camDist);
    const g = groundAt(desired.x, desired.z) + 0.45;
    if (desired.y < g) desired.y = g;
    const clip = busRayClip(bus, camTarget, desired);
    if (clip < 1) desired.lerpVectors(camTarget, desired, Math.max(clip, 0.12));
    if (p.camPos.lengthSq() === 0) p.camPos.copy(desired);
    p.camPos.lerp(desired, Math.min(1, dt * 14));
    camera.position.copy(p.camPos);
    camera.lookAt(focusOverride || camTarget);
  }

  return Object.assign(p, { update, updateCamera, resetTo, keys });
}
