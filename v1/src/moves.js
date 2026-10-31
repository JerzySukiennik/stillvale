// Stillvale - procedural locomotion and beat-synced dance moves for the blocky rig.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fract = (x) => x - Math.floor(x);
const down = (b) => Math.pow(0.5 + 0.5 * Math.cos(TAU * b), 1.6);
const smooth = (x) => x * x * (3 - 2 * x);
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));

export function locomotion(o, phase, speed, t) {
  const w = clamp(speed, 0, 1), r = clamp(speed - 1, 0, 1);
  const s = Math.sin(phase), c = Math.cos(phase);
  const legA = 0.52 * w + 0.42 * r;
  o.lLegF = s * legA;
  o.rLegF = -s * legA;
  o.lKnee = Math.max(0, c) * (0.55 * w + 0.85 * r) + 0.04;
  o.rKnee = Math.max(0, -c) * (0.55 * w + 0.85 * r) + 0.04;
  const armA = 0.42 * w + 0.5 * r;
  o.lArmF = -s * armA;
  o.rArmF = s * armA;
  o.lArmS = o.rArmS = 0.07 + 0.05 * r;
  o.lElb = o.rElb = 0.15 + 0.15 * w + 1.0 * r;
  o.bob = -0.035 * s * s * (w + r * 0.6) + 0.02 * r * Math.abs(c);
  o.lean = 0.03 * w + 0.17 * r;
  o.twist = -s * (0.07 * w + 0.05 * r);
  o.hipTwist = s * 0.06 * w;
  o.nod = 0.04 * r;
  const idle = 1 - w;
  o.bob += idle * 0.008 * Math.sin(t * 1.7);
  o.lArmS += idle * 0.04 * (1 + Math.sin(t * 1.7));
  o.rArmS += idle * 0.04 * (1 + Math.sin(t * 1.7));
  o.turn = idle * 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.13);
  return o;
}

export function airborne(o, vy) {
  const k = clamp(0.5 - vy * 0.08, 0, 1);
  o.lLegF = 0.45 * k + 0.1;
  o.rLegF = 0.15;
  o.lKnee = 0.9 * k + 0.2;
  o.rKnee = 0.45;
  o.lArmS = o.rArmS = 0.7 + 0.5 * k;
  o.lArmF = o.rArmF = 0.35;
  o.lElb = o.rElb = 0.4;
  return o;
}

function bounceClap(b, o) {
  const d = down(b), open = 1 - d;
  o.bob = -0.075 * d;
  o.lKnee = o.rKnee = 0.34 * d;
  o.lLegF = o.rLegF = 0.17 * d;
  o.lean = 0.06 + 0.08 * d;
  o.nod = 0.16 * d - 0.06;
  o.lArmF = o.rArmF = 1.15 + 0.12 * d;
  o.lArmS = o.rArmS = -0.12 + 0.6 * open;
  o.lElb = o.rElb = 0.95 - 0.35 * open;
}

function handsUp(b, o) {
  const sw = Math.sin(Math.PI * b), d = down(b);
  o.bob = -0.05 * d;
  o.lKnee = o.rKnee = 0.22 * d;
  o.lLegF = o.rLegF = 0.11 * d;
  o.hipSway = 0.06 * sw;
  o.side = -0.1 * sw;
  o.lArmF = o.rArmF = 0.25;
  o.lArmS = 2.55 + 0.25 * sw;
  o.rArmS = 2.55 - 0.25 * sw;
  o.lElb = o.rElb = 0.3;
  o.lArmT = o.rArmT = 0.3 * Math.sin(TAU * b);
  o.tilt = 0.15 * sw;
  o.nod = -0.12 + 0.1 * d;
}

function shimmy(b, o) {
  const q = Math.sin(2 * TAU * b), d = down(b);
  o.twist = 0.17 * q;
  o.hipTwist = -0.08 * q;
  o.lArmF = 0.55 + 0.16 * q;
  o.rArmF = 0.55 - 0.16 * q;
  o.lArmS = o.rArmS = 0.28;
  o.lElb = o.rElb = 1.5;
  o.bob = -0.04 * d;
  o.lKnee = o.rKnee = 0.2 * d;
  o.lLegF = o.rLegF = 0.1 * d;
  o.lean = -0.05;
  o.nod = -0.1 + 0.06 * d;
  o.turn = 0.18 * Math.sin((Math.PI * b) / 2);
}

function pump(b, o) {
  const d = down(b);
  o.bob = -0.07 * d;
  o.lKnee = o.rKnee = 0.3 * d;
  o.lLegF = o.rLegF = 0.15 * d;
  o.lArmS = o.rArmS = 1.6 + 0.9 * (1 - d);
  o.lArmF = o.rArmF = 0.35;
  o.lElb = o.rElb = 0.5 + 0.6 * d;
  o.nod = 0.2 * d - 0.08;
  o.lean = 0.05 * d;
}

function spinJump(b, o) {
  const p = ((b % 4) + 4) % 4;
  if (p >= 3) {
    const t = p - 3;
    o.hop = 0.42 * Math.sin(Math.PI * t);
    o.spin = TAU * smooth(t);
    o.lArmS = o.rArmS = 2.5;
    o.lElb = o.rElb = 0.3;
    o.lLegF = o.rLegF = 0.5 * Math.sin(Math.PI * t);
    o.lKnee = o.rKnee = 0.9 * Math.sin(Math.PI * t);
    o.bob = -0.06 * gauss(t - 1, 0.15) - 0.06 * gauss(t, 0.15);
  } else pump(b, o);
}

function kneeKick(b, o) {
  const m = ((b % 4) + 4) % 4;
  const liftL = m < 1 ? Math.sin(Math.PI * m) : 0;
  const liftR = m >= 2 && m < 3 ? Math.sin(Math.PI * (m - 2)) : 0;
  o.lLegF = 1.25 * liftL;
  o.lKnee = 1.75 * liftL;
  o.rLegF = 1.25 * liftR;
  o.rKnee = 1.75 * liftR;
  o.bob = -0.065 * (gauss(m - 1, 0.18) + gauss(m - 3, 0.18) + gauss(m - 4, 0.18)) - 0.02;
  o.lean = -0.07 * (liftL + liftR);
  o.lArmS = o.rArmS = 0.55;
  o.lArmF = 0.4 + 0.5 * liftR;
  o.rArmF = 0.4 + 0.5 * liftL;
  o.lElb = o.rElb = 0.9;
  o.twist = 0.15 * (liftL - liftR);
  o.nod = 0.08 * (gauss(m - 1, 0.2) + gauss(m - 3, 0.2));
}

function ardah(b, o) {
  const d = down(b), sw = Math.sin(Math.PI * b);
  o.rArmF = 2.65 + 0.22 * d;
  o.rArmS = 0.22;
  o.rElb = 0.18;
  o.lArmS = 0.78;
  o.lArmF = 0.12;
  o.lArmT = -0.6;
  o.lElb = 1.75;
  o.hipSway = 0.08 * sw;
  o.lLegS = 0.13 * Math.max(0, sw);
  o.rLegS = 0.13 * Math.max(0, -sw);
  o.bob = -0.05 * d;
  o.lKnee = o.rKnee = 0.18 * d;
  o.lean = -0.04;
  o.nod = -0.08 + 0.12 * d;
  o.side = -0.06 * sw;
}

function flail(b, o) {
  const d = down(b), a = 0.5 + 0.5 * Math.sin(Math.PI * b);
  o.lean = 0.24 * d;
  o.nod = 0.28 * d - 0.05;
  o.lArmS = 0.55 + 2.2 * a;
  o.rArmS = 2.75 - 2.2 * a;
  o.lArmF = o.rArmF = 0.3;
  o.lElb = o.rElb = 0.45;
  o.bob = -0.07 * d;
  o.lKnee = o.rKnee = 0.3 * d;
  o.lLegF = o.rLegF = 0.15 * d;
  o.twist = 0.2 * (a - 0.5);
}

function runningMan(b, o) {
  const m = ((b % 2) + 2) % 2;
  const a = m < 1 ? Math.sin(Math.PI * m) : 0, c = m >= 1 ? Math.sin(Math.PI * (m - 1)) : 0;
  o.lLegF = 0.95 * a - 0.35 * c;
  o.lKnee = 1.25 * a + 0.1;
  o.rLegF = 0.95 * c - 0.35 * a;
  o.rKnee = 1.25 * c + 0.1;
  o.lArmF = 0.6 + 0.4 * c;
  o.rArmF = 0.6 + 0.4 * a;
  o.lArmS = o.rArmS = 0.18;
  o.lElb = o.rElb = 1.45;
  o.bob = -0.05 * down(b);
  o.lean = 0.12;
  o.nod = 0.08 * down(b);
}

function twirl(b, o) {
  const p = ((b % 8) + 8) % 8;
  o.spin = (TAU * p) / 8;
  o.lArmS = o.rArmS = 1.45;
  o.lArmF = o.rArmF = 0.1;
  o.lElb = o.rElb = 0.15 + 0.2 * down(b);
  o.bob = -0.05 * down(b);
  o.lKnee = o.rKnee = 0.2 * down(b);
  o.tilt = 0.12;
  o.nod = -0.15;
}

function dabke(b, o) {
  const m = ((b % 8) + 8) % 8, n = Math.floor(m), u = m - n, d = down(b);
  o.lArmS = o.rArmS = 0.42;
  o.lArmF = o.rArmF = 0.22;
  o.lElb = o.rElb = 0.15;
  o.bob = -0.04 * d;
  if (n === 0 || n === 2) {
    o.rLegF = 0.3 * Math.sin(Math.PI * u);
    o.rLegS = -0.16 * Math.sin(Math.PI * u);
    o.rKnee = 0.3 * Math.sin(Math.PI * u);
  } else if (n === 1 || n === 3) {
    o.lLegS = 0.14 * Math.sin(Math.PI * u);
    o.lKnee = 0.25 * Math.sin(Math.PI * u);
  } else if (n === 4) {
    o.rLegF = 0.95 * Math.sin(Math.PI * u * 0.5 + 0.2);
    o.rKnee = 0.25 * (1 - u);
    o.lean = -0.06;
  } else if (n === 5) {
    o.rLegF = 0.95 * (1 - smooth(u));
    o.bob -= 0.06 * gauss(u - 0.9, 0.15);
  } else if (n === 6) {
    o.hop = 0.08 * Math.sin(Math.PI * u);
    o.lKnee = 0.5 * Math.sin(Math.PI * u);
    o.rKnee = 0.25 * Math.sin(Math.PI * u);
  } else {
    o.lLegF = 0.2 * Math.sin(Math.PI * u);
    o.bob -= 0.07 * gauss(u - 0.95, 0.15);
  }
  o.side = 0.04 * Math.sin((Math.PI * b) / 2);
  o.nod = 0.05 * d;
}

function dabkeLead(b, o) {
  dabke(b, o);
  const a = TAU * b;
  o.rArmF = 2.5;
  o.rArmS = 0.35;
  o.rElb = 0.45 + 0.35 * Math.cos(a);
  o.rArmT = 0.55 * Math.sin(a);
  o.turn = 0.15 * Math.sin(a * 0.25);
}

function roof(b, o) {
  handsUp(b, o);
  o.hop = 0.24 * Math.max(0, Math.sin(Math.PI * b));
  o.lKnee = o.rKnee = 0.25 + 0.3 * down(b);
}

export function seated(b, o, energy) {
  const d = down(b);
  o.lLegF = o.rLegF = 1.52;
  o.lKnee = o.rKnee = 1.5;
  o.bob = -0.05;
  o.nod = 0.2 * d * energy - 0.03;
  o.twist = 0.1 * Math.sin(Math.PI * b) * energy;
  o.side = 0.08 * Math.sin(Math.PI * b) * energy;
  const raise = energy * smooth(clamp(Math.sin((Math.PI * b) / 4) * 1.4, 0, 1));
  o.lArmS = 0.15 + 2.3 * raise;
  o.rArmS = 0.15 + 2.3 * raise;
  o.lArmF = o.rArmF = 0.75 * (1 - raise) + 0.2;
  o.lElb = o.rElb = 0.9 * (1 - raise) + 0.3;
  o.lArmT = o.rArmT = 0.25 * raise * Math.sin(TAU * b);
}

export function driver(t, b, o, waving) {
  o.lLegF = o.rLegF = 1.45;
  o.lKnee = o.rKnee = 1.35;
  o.bob = -0.05;
  o.lArmF = o.rArmF = 1.05;
  o.lElb = o.rElb = 0.5;
  o.lArmS = o.rArmS = 0.05;
  o.nod = 0.12 * down(b);
  if (waving) {
    o.rArmS = 2.35;
    o.rArmF = 0.4;
    o.rElb = 0.6 + 0.35 * Math.sin(t * 9);
    o.rArmT = 0.25 * Math.sin(t * 9);
    o.turn = -0.7;
  }
}

export const MOVES = { bounceClap, handsUp, shimmy, pump, spinJump, kneeKick, ardah, flail, runningMan, twirl, dabke, dabkeLead, roof };
export const RING_MOVES = ['bounceClap', 'handsUp', 'shimmy', 'pump', 'spinJump', 'kneeKick', 'flail', 'runningMan', 'twirl'];

export function dance(name, b, o) {
  MOVES[name](b, o);
  return o;
}

export { fract, down };
