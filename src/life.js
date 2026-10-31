// Stillvale - birds circling over the valley and a flock that bolts when the party starts.
import * as THREE from 'three';

function birdMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: `
      attribute float aWing;
      attribute vec2 aSeed;
      uniform float uTime;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float flap = sin(uTime * (9.0 + aSeed.x * 4.0) + aSeed.y * 6.28);
        p.y += aWing * flap * abs(p.x) * 0.9;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(vec3(0.07, 0.07, 0.08), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function birdGeometry(n) {
  const g = new THREE.BufferGeometry();
  const pos = [0, 0, 0.12, -0.42, 0.02, -0.05, 0, 0, -0.12, 0, 0, 0.12, 0.42, 0.02, -0.05, 0, 0, -0.12];
  const wing = [0, 1, 0, 0, 1, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  const ig = new THREE.InstancedBufferGeometry().copy(g);
  const seeds = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) seeds[i] = Math.random();
  ig.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 2));
  return ig;
}

export function buildLife(scene) {
  const N = 14, F = 26;
  const mat = birdMaterial();
  const circling = new THREE.InstancedMesh(birdGeometry(N), mat, N);
  circling.frustumCulled = false;
  scene.add(circling);
  const flock = new THREE.InstancedMesh(birdGeometry(F), mat, F);
  flock.frustumCulled = false;
  flock.visible = false;
  scene.add(flock);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const birds = Array.from({ length: N }, (_, i) => ({
    cx: i < 8 ? -40 : 120, cz: i < 8 ? -60 : 30, r: 30 + Math.random() * 40, h: 45 + Math.random() * 35, w: (0.08 + Math.random() * 0.05) * (i % 2 ? 1 : -1), a: Math.random() * 6.28, sc: 1.6 + Math.random() * 0.8,
  }));
  const fl = Array.from({ length: F }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), sc: 1 + Math.random() * 0.6 }));
  let flockT = -1;

  function scatter(x, y, z, awayX, awayZ) {
    flock.visible = true;
    flockT = 0;
    for (const b of fl) {
      b.p.set(x + (Math.random() - 0.5) * 14, y + 4 + Math.random() * 8, z + (Math.random() - 0.5) * 14);
      b.v.set(awayX * (7 + Math.random() * 5) + (Math.random() - 0.5) * 6, 4 + Math.random() * 4, awayZ * (7 + Math.random() * 5) + (Math.random() - 0.5) * 6);
    }
  }

  function update(dt, t) {
    mat.uniforms.uTime.value = t;
    birds.forEach((b, i) => {
      b.a += b.w * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r, y = b.h + Math.sin(t * 0.3 + i) * 3;
      e.set(0, Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w)), Math.sign(b.w) * 0.35);
      m.compose(v.set(x, y, z), q.setFromEuler(e), s.setScalar(b.sc));
      circling.setMatrixAt(i, m);
    });
    circling.instanceMatrix.needsUpdate = true;
    if (flockT >= 0) {
      flockT += dt;
      fl.forEach((b, i) => {
        b.v.y += dt * 1.5;
        b.p.addScaledVector(b.v, dt);
        e.set(0, Math.atan2(b.v.x, b.v.z), 0);
        m.compose(b.p, q.setFromEuler(e), s.setScalar(b.sc));
        flock.setMatrixAt(i, m);
      });
      flock.instanceMatrix.needsUpdate = true;
      if (flockT > 14) {
        flockT = -1;
        flock.visible = false;
      }
    }
  }
  return { update, scatter };
}
