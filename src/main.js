// Stillvale - boot, quality, render loop and the walk's timeline.
import * as THREE from 'three';
import { buildWorld, START, LAKE, road, groundAt } from './world.js';
import { buildGrass } from './grass.js';
import { buildFlora } from './flora.js';
import { buildLife } from './life.js';
import { makeAtlas, makeMaterial, buildPlayer } from './avatar.js';
import { buildBus, spawnS, planApproach, startBus, predictTime, driveBus, poseBus, busFootprint, BUS } from './bus.js';
import { buildCrowd } from './crowd.js';
import { createPlayer } from './player.js';
import { AudioEngine, MUSIC } from './audio.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const mobile = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
const Q = mobile
  ? { dpr: Math.min(devicePixelRatio, 1.7), minDpr: 0.8, shadow: 1024, forest: 0.62, forestSpacing: 9.5, rocks: 45, bushes: 45,
      grass: { nearSpacing: 0.38, nearRadius: 11, farSpacing: 0.76, farRadius: 25, flowerSpacing: 1.35, flowerRadius: 17 } }
  : { dpr: Math.min(devicePixelRatio, 1.5), minDpr: 0.7, shadow: 2048, forest: 1, forestSpacing: 7, rocks: 70, bushes: 90,
      grass: { nearSpacing: 0.3, nearRadius: 15, farSpacing: 0.6, farRadius: 36, flowerSpacing: 1.0, flowerRadius: 26 } };

const ui = {
  title: document.getElementById('title'),
  begin: document.getElementById('begin'),
  bar: document.getElementById('bar'),
  hint: document.getElementById('hint'),
  pause: document.getElementById('pause'),
  caption: document.getElementById('caption'),
  again: document.getElementById('again'),
  timer: document.getElementById('timer'),
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
let dpr = Q.dpr;
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.25, 12000);
camera.position.set(START.x, 6, START.z + 10);

function fitCamera() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.8 ? 64 : 55;
  camera.updateProjectionMatrix();
  if (player) player.camDist = camera.aspect < 0.8 ? 7.4 : 5.6;
}
addEventListener('resize', fitCamera);

const progress = (f) => (ui.bar.style.transform = `scaleX(${f})`);
const S = { phase: 'loading', t: 0, doorAt: 0, doorBeat: null, paused: false, honkCool: 0, lastPlanAt: 0, nextCheck: 0, timerShown: -1 };
const audio = new AudioEngine();
let world, grass, flora, life, player, bus, crowd;

async function boot() {
  progress(0.05);
  await new Promise((r) => setTimeout(r, 30));
  await audio.init();
  const audioP = audio.load('assets/audio', 'music/track.mp3').then(() => progress(0.9));
  world = buildWorld(scene, Q);
  progress(0.35);
  await new Promise((r) => setTimeout(r, 0));
  flora = await buildFlora(scene, Q, 'assets/models');
  world.commitMask();
  progress(0.6);
  grass = buildGrass(scene, world.fields, Q);
  life = buildLife(scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  skyScene.add(world.sky.clone());
  scene.environment = pmrem.fromScene(skyScene, 0, 1, 11000).texture;
  scene.environmentIntensity = 0.55;
  const atlas = makeAtlas();
  const charMat = makeMaterial(atlas);
  const rig = buildPlayer(charMat);
  scene.add(rig.mesh);
  bus = buildBus(scene);
  crowd = buildCrowd(scene, bus, charMat);
  player = createPlayer(rig, camera, canvas, flora.colliders, bus, {
    onStep: (n) => audio.ready && S.phase !== 'title' && audio.step(n),
  });
  player.cinematic = titleShot;
  fitCamera();
  progress(0.75);
  renderer.compile(scene, camera);
  await audioP;
  progress(1);
  S.phase = 'title';
  ui.begin.disabled = false;
  ui.begin.textContent = 'Begin';
  document.body.classList.add('ready');
  if (DEBUG) window.__sv = { S, player, bus, crowd, audio, renderer, scene, camera, world, grass, flora, life, begin, spawnBus, setPaused, finish, again, Q, setDpr };
}

function titleShot(dt, t, cam) {
  const a = t * 0.018;
  const x = START.x - 18 + Math.sin(a) * 26, z = START.z + 14 + Math.cos(a * 0.7) * 10;
  cam.position.set(x, groundAt(x, z) + 3.2 + Math.sin(a * 0.5) * 0.6, z);
  cam.lookAt(LAKE.x + 60, 26, LAKE.z - 110);
}

function endShot(dt, t, cam) {
  S.orbit = (S.orbit || 0) + dt * 0.11;
  const c = crowd.center;
  const x = c.x + Math.sin(S.orbit + player.camYaw) * 9.5, z = c.z + Math.cos(S.orbit + player.camYaw) * 9.5;
  cam.position.lerp(new THREE.Vector3(x, Math.max(groundAt(x, z) + 2.4, c.y + 2.6), z), Math.min(1, dt * 1.5));
  cam.lookAt(c.x, c.y + 1.3, c.z);
}

function begin() {
  if (S.phase !== 'title') return;
  audio.unlock();
  audio.startAmbience();
  ui.title.classList.add('gone');
  player.cinematic = null;
  player.enabled = true;
  player.camPos.set(0, 0, 0);
  S.phase = 'calm';
  S.t = 0;
  document.body.classList.add('playing');
  armCountdown(params.has('bus') ? parseFloat(params.get('bus')) || 25 : 60);
  showHint();
  lock();
}

function armCountdown(sec) {
  S.doorAt = audio.now() + sec;
  audio.scheduleMusic(S.doorAt - MUSIC.doorBeat * MUSIC.beat);
  S.nextCheck = 0;
  S.timerShown = -1;
  S.doorBeat = null;
  ui.timer.classList.add('show');
  updateTimer(sec);
}

function updateTimer(left) {
  const s = Math.max(0, Math.ceil(left - 0.05));
  if (s === S.timerShown) return;
  S.timerShown = s;
  ui.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (s <= 10) {
    ui.timer.classList.remove('tick');
    void ui.timer.offsetWidth;
    ui.timer.classList.add('tick');
  }
}

function quickEta() {
  const q = road.query(player.pos.x, player.pos.z);
  const along = Math.max(0, q.s - spawnS()) + Math.min(q.d, 400) * 1.35;
  return along / 12.5 + 7;
}

function showHint() {
  ui.hint.textContent = player.isTouch ? 'Left thumb to walk  ·  right thumb to look around' : 'WASD to walk  ·  Shift to run  ·  Space to jump  ·  mouse to look';
  ui.hint.classList.add('show');
  clearTimeout(S.hintTimer);
  S.hintTimer = setTimeout(() => ui.hint.classList.remove('show'), 7000);
}

function lock() {
  if (player.isTouch) return;
  canvas.requestPointerLock?.()?.catch?.(() => {});
}

ui.begin.addEventListener('click', begin);
canvas.addEventListener('click', () => {
  if (S.phase !== 'title' && S.phase !== 'loading' && !player.isTouch && document.pointerLockElement !== canvas) lock();
});
ui.pause.addEventListener('click', () => {
  if (player.isTouch) setPaused(false);
  else lock();
});
document.addEventListener('pointerlockchange', () => {
  if (player.isTouch || DEBUG) return;
  const locked = document.pointerLockElement === canvas;
  if (locked) setPaused(false);
  else if (['calm', 'arrival', 'party'].includes(S.phase)) setPaused(true);
});
document.addEventListener('visibilitychange', () => {
  if (!DEBUG && document.hidden && ['calm', 'arrival', 'party', 'end'].includes(S.phase)) setPaused(true);
});

function setPaused(p) {
  if (S.paused === p) return;
  S.paused = p;
  ui.pause.classList.toggle('show', p);
  player.enabled = !p && S.phase !== 'end';
  if (p) audio.suspend();
  else audio.resume();
}

function spawnBus() {
  const s0 = spawnS();
  const plan = planApproach(bus, player.pos, flora.colliders, s0);
  startBus(bus, plan, s0);
  if (S.doorAt - audio.now() < 8) armCountdown(predictTime(bus, 17) + 2);
  audio.startBus();
  S.phase = 'arrival';
  S.lastPlanAt = S.t;
  S.honked = false;
  S.doorBeat = null;
}

function replan() {
  const q = road.query(bus.pos.x, bus.pos.z);
  const onRoad = q.d < 1.5 && bus.plan && bus.s < bus.path.length - 25;
  const plan = planApproach(bus, player.pos, flora.colliders, onRoad ? q.s : null);
  if (onRoad && plan.path.pts.length) plan.path.pts[0] = [bus.pos.x, bus.pos.z];
  const v = bus.v;
  bus.path = plan.path;
  bus.plan = plan;
  bus.s = 0;
  bus.v = v;
}

function tickTimeline(dt) {
  S.t += dt;
  const left = S.doorAt - audio.now();
  if (S.phase === 'calm' || S.phase === 'arrival') updateTimer(left);
  if (S.phase === 'calm' && S.t >= S.nextCheck) {
    S.nextCheck = S.t + 0.5;
    if (left <= quickEta() + 2) spawnBus();
  }
  if (S.phase === 'arrival') {
    const remain = bus.path.length - bus.s;
    const moved = Math.hypot(player.pos.x - bus.plan.target.x, player.pos.z - bus.plan.target.z);
    if (bus.state === 'driving' && moved > 9 && remain > 18 && S.t - S.lastPlanAt > 1.5) {
      replan();
      S.lastPlanAt = S.t;
    }
    const cruise = clamp(remain / Math.max(left - 1.2 - 5, 0.6), 6, 21);
    driveBus(bus, dt, player.pos, cruise);
    S.honkCool -= dt;
    const dToPlayer = Math.hypot(bus.pos.x - player.pos.x, bus.pos.z - player.pos.z);
    if ((!S.honked && dToPlayer < 48) || (bus.blocked && S.honkCool <= 0)) {
      audio.busOneShot('horn', 1.4);
      S.honked = true;
      S.honkCool = 3.5;
    }
    if (bus.state === 'stopped' && S.doorBeat == null) {
      audio.busOneShot('brake', 1.3);
      const nowBeat = audio.beat() + 0.5 / MUSIC.beat;
      S.doorBeat = Math.max(MUSIC.doorBeat, Math.ceil((nowBeat - 2) / 8) * 8 + 2);
    }
    if (S.doorBeat != null && audio.beat() >= S.doorBeat - 0.02) openDoors();
  }
  if (S.phase === 'party' && audio.beat() >= S.doorBeat + MUSIC.endBeats) finish();
}

function openDoors() {
  bus.doorOpen = true;
  bus.state = 'open';
  ui.timer.classList.remove('show');
  audio.busOneShot('door', 1.5);
  audio.openMusic(S.doorBeat);
  audio.fadeBirds(0, 2.5);
  setTimeout(() => {
    audio.once('flock', audio.sfx, 1.0);
    const ax = player.pos.x - bus.pos.x, az = player.pos.z - bus.pos.z, l = Math.hypot(ax, az) || 1;
    life.scatter(bus.pos.x - (ax / l) * 25, groundAt(bus.pos.x, bus.pos.z) + 8, bus.pos.z - (az / l) * 25, -ax / l, -az / l);
  }, 900);
  crowd.open(S.doorBeat, player.pos);
  S.phase = 'party';
}

function finish() {
  S.phase = 'end';
  S.orbit = 0;
  player.enabled = false;
  player.cinematic = endShot;
  ui.caption.classList.add('show');
  ui.hint.classList.remove('show');
  document.body.classList.remove('playing');
  setTimeout(() => ui.again.classList.add('show'), 2600);
  if (document.pointerLockElement) document.exitPointerLock();
}

function again() {
  audio.stopAll();
  bus.group.visible = false;
  bus.state = 'hidden';
  bus.doorOpen = false;
  bus.hatchOpen = false;
  bus.doorT = bus.hatchT = 0;
  crowd.seatAll();
  player.resetTo(START.x, START.z, LAKE.x + 40, LAKE.z - 40);
  player.cinematic = null;
  player.camPos.set(0, 0, 0);
  player.enabled = true;
  ui.caption.classList.remove('show');
  ui.again.classList.remove('show');
  document.body.classList.add('playing');
  S.phase = 'calm';
  S.t = 0;
  audio.fadeBirds(0.5, 2);
  armCountdown(45);
  showHint();
  lock();
}
ui.again.addEventListener('click', again);

const clock = new THREE.Clock();
let acc = 0, frames = 0, gameT = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (S.phase === 'loading') return;
  if (!S.paused) {
    gameT += dt;
    if (['calm', 'arrival', 'party'].includes(S.phase)) tickTimeline(dt);
    player.update(dt, gameT);
    if (bus.group.visible) {
      poseBus(bus, dt, gameT);
      audio.busTick(bus.v, bus.pos.x, bus.pos.y + 1.4, bus.pos.z);
    }
    const music = audio.musicStart != null;
    crowd.update(dt, gameT, music ? audio.beat() : gameT * 2.07, music, player.pos, bus.state);
    life.update(dt, gameT);
  }
  grass.setPush(crowd.pushList(player.pos));
  grass.setBus(bus.group.visible ? busFootprint(bus) : null);
  player.updateCamera(dt, gameT);
  grass.update(gameT, camera.position);
  world.update(dt, gameT, player.cinematic ? camera.position : player.pos);
  flora.update(gameT);
  if (audio.ready) {
    audio.setListener(camera);
    audio.ambienceTick(gameT);
  }
  renderer.render(scene, camera);
  acc += dt;
  frames++;
  if (acc > 1.5) {
    const ms = (acc / frames) * 1000;
    if (ms > 21 && dpr > Q.minDpr) setDpr(dpr - 0.1);
    else if (ms < 13.5 && dpr < Q.dpr) setDpr(dpr + 0.05);
    if (DEBUG) window.__fps = { ms: +ms.toFixed(1), dpr, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    acc = 0;
    frames = 0;
  }
}

function setDpr(v) {
  dpr = Math.max(Q.minDpr, Math.min(Q.dpr, v));
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
}

renderer.setAnimationLoop(frame);
boot().catch((e) => {
  console.error(e);
  ui.begin.textContent = 'Something went wrong. Reload?';
});
