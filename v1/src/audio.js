// Stillvale - Web Audio: ambience, footsteps, positional coach sounds and the beat clock.
const P = 0.48378;
export const MUSIC = { beat: P, doorBeat: 42, endBeats: 64, loopStart: 106, loopEnd: 186 };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buf = {};
    this.manifest = {};
    this.ready = false;
    this.musicStart = null;
    this.musicOffsetBeats = 0;
    this.hasMusic = false;
  }

  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.comp).connect(c.destination);
    this.amb = c.createGain();
    this.amb.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.master);
    this.busPan = this.panner(8, 1.1);
    this.busPan.connect(this.master);
    this.busGain = c.createGain();
    this.busGain.gain.value = 0;
    this.busGain.connect(this.busPan);
    this.musicIn = c.createGain();
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 520;
    this.muffle.Q.value = 1.1;
    this.muffledGain = c.createGain();
    this.openGain = c.createGain();
    this.openGain.gain.value = 0;
    this.musicPan = this.panner(7, 1.0);
    this.musicIn.connect(this.muffle).connect(this.muffledGain).connect(this.musicPan).connect(this.master);
    this.musicIn.connect(this.openGain).connect(this.master);
    this.cowPan = this.panner(14, 1.2);
    this.cowPan.connect(this.amb);
  }

  panner(ref, roll) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 10000;
    return p;
  }

  async load(base, music) {
    this.manifest = await (await fetch(`${base}/manifest.json`)).json();
    const names = Object.keys(this.manifest);
    const get = async (url) => this.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
    await Promise.all(names.map(async (n) => (this.buf[n] = await get(`${base}/${n}.mp3`))));
    try {
      this.buf.music = await get(music);
      this.hasMusic = true;
    } catch (e) {
      this.hasMusic = false;
    }
    this.ready = true;
  }

  unlock() {
    if (this.ctx.state !== 'running') this.ctx.resume();
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) {}
    const a = document.getElementById('unlock');
    if (a) {
      a.play().catch(() => {});
    }
  }

  loop(name, dest, gain = 1, rate = 1) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.buf[name];
    src.loop = true;
    const m = this.manifest[name];
    if (m?.loop) {
      src.loopStart = m.loop[0];
      src.loopEnd = m.loop[1];
    }
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(c.currentTime, m?.loop ? m.loop[0] + Math.random() * (m.loop[1] - m.loop[0]) : 0);
    return { src, g };
  }

  once(name, dest, gain = 1, rate = 1, offset = 0, dur) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.buf[name];
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest || this.sfx);
    src.start(c.currentTime, offset, dur);
    return { src, g };
  }

  startAmbience() {
    if (this.ambOn) return;
    this.ambOn = true;
    this.birdsA = this.loop('birds-a', this.amb, 0.55);
    this.birdsB = this.loop('birds-b', this.amb, 0.0);
    this.wind = this.loop('wind', this.amb, 0.32);
    this.cows = this.loop('cowbells', this.cowPan, 0.9);
    this.amb.gain.setValueAtTime(0, this.ctx.currentTime);
    this.amb.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 3);
  }

  ambienceTick(t) {
    if (!this.ambOn) return;
    const c = this.ctx.currentTime;
    const x = 0.5 + 0.5 * Math.sin(t * 0.045);
    this.birdsA.g.gain.setTargetAtTime(0.55 * (1 - x) + 0.15, c, 0.5);
    this.birdsB.g.gain.setTargetAtTime(0.55 * x + 0.1, c, 0.5);
    const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1);
    this.wind.g.gain.setTargetAtTime(0.18 + gust * 0.3, c, 0.6);
  }

  fadeBirds(to, time) {
    if (!this.ambOn) return;
    const c = this.ctx.currentTime;
    for (const l of [this.birdsA, this.birdsB]) {
      l.g.gain.cancelScheduledValues(c);
      l.g.gain.setTargetAtTime(to, c, time / 3);
    }
    this.birdsMuted = to < 0.05;
  }

  step(norm) {
    const m = this.manifest.steps;
    if (!m) return;
    const i = Math.floor(Math.random() * m.steps.length);
    this.once('steps', this.sfx, (0.16 + 0.12 * Math.min(norm, 2)) * (0.85 + Math.random() * 0.3), 0.9 + Math.random() * 0.2, m.steps[i], m.len);
  }

  setListener(cam) {
    const l = this.ctx.listener, c = this.ctx.currentTime;
    const f = cam.getWorldDirection(this._f || (this._f = new cam.position.constructor()));
    if (l.positionX) {
      l.positionX.setTargetAtTime(cam.position.x, c, 0.02);
      l.positionY.setTargetAtTime(cam.position.y, c, 0.02);
      l.positionZ.setTargetAtTime(cam.position.z, c, 0.02);
      l.forwardX.setTargetAtTime(f.x, c, 0.02);
      l.forwardY.setTargetAtTime(f.y, c, 0.02);
      l.forwardZ.setTargetAtTime(f.z, c, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(cam.position.x, cam.position.y, cam.position.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  placePanner(p, x, y, z) {
    const c = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, c, 0.03);
      p.positionY.setTargetAtTime(y, c, 0.03);
      p.positionZ.setTargetAtTime(z, c, 0.03);
    } else p.setPosition(x, y, z);
  }

  startBus() {
    this.idle = this.loop('idle', this.busGain, 0.0);
    this.drive = this.loop('engine', this.busGain, 0.0);
    this.busGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.busGain.gain.linearRampToValueAtTime(1.6, this.ctx.currentTime + 2.5);
  }

  busTick(speed, x, y, z) {
    if (!this.idle) return;
    const c = this.ctx.currentTime;
    this.placePanner(this.busPan, x, y, z);
    this.placePanner(this.musicPan, x, y, z);
    const k = Math.min(1, speed / 10);
    this.drive.g.gain.setTargetAtTime(0.85 * k + 0.05, c, 0.15);
    this.idle.g.gain.setTargetAtTime(0.6 * (1 - k) + 0.1, c, 0.15);
    this.drive.src.playbackRate.setTargetAtTime(0.72 + speed * 0.045, c, 0.2);
    this.idle.src.playbackRate.setTargetAtTime(0.95 + speed * 0.02, c, 0.2);
  }

  busOneShot(name, gain = 1) {
    return this.once(name, this.busPan, gain);
  }

  startMusic(clipTime) {
    this.scheduleMusic(this.ctx.currentTime + 0.05 - Math.max(0, clipTime));
  }

  scheduleMusic(startAt) {
    const c = this.ctx;
    this.musicStart = startAt;
    this.musicOpen = false;
    this.muffledGain.gain.cancelScheduledValues(c.currentTime);
    this.muffledGain.gain.value = 2.2;
    this.openGain.gain.cancelScheduledValues(c.currentTime);
    this.openGain.gain.value = 0;
    if (!this.hasMusic) return;
    this.music = c.createBufferSource();
    this.music.buffer = this.buf.music;
    this.music.loop = true;
    this.music.loopStart = MUSIC.loopStart * P;
    this.music.loopEnd = MUSIC.loopEnd * P;
    this.music.connect(this.musicIn);
    const now = c.currentTime + 0.02;
    if (startAt >= now) this.music.start(startAt, 0);
    else this.music.start(now, now - startAt);
  }

  now() {
    return this.ctx.currentTime;
  }

  beat() {
    if (this.musicStart == null) return 0;
    const t = this.ctx.currentTime - this.musicStart - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    return t / P;
  }

  clipTime() {
    return this.musicStart == null ? -1 : this.ctx.currentTime - this.musicStart;
  }

  timeOfBeat(k) {
    return this.musicStart + k * P;
  }

  openMusic(atBeat) {
    if (this.musicStart == null) return;
    const when = Math.max(this.ctx.currentTime, this.timeOfBeat(atBeat));
    this.muffledGain.gain.setValueAtTime(this.muffledGain.gain.value, when);
    this.muffledGain.gain.linearRampToValueAtTime(0, when + 0.25);
    this.openGain.gain.setValueAtTime(0, when);
    this.openGain.gain.linearRampToValueAtTime(0.95, when + 0.04);
    this.musicOpen = true;
  }

  stopAll() {
    const c = this.ctx.currentTime;
    for (const s of [this.music, this.idle?.src, this.drive?.src]) {
      try {
        s?.stop(c + 0.05);
      } catch (e) {}
    }
    this.music = null;
    this.idle = this.drive = null;
    this.musicStart = null;
    this.musicOpen = false;
    this.busGain.gain.cancelScheduledValues(c);
    this.busGain.gain.value = 0;
    this.openGain.gain.cancelScheduledValues(c);
    this.openGain.gain.value = 0;
    this.fadeBirds(0.5, 2);
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }
}
