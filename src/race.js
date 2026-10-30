// Режим «На трассу»: чекпоинты, круги, лучший круг, позиция; очки за дрифт и полёты.
import * as THREE from 'three';
import { load } from './config.js';

const gateVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const gateFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uActive;
  varying vec2 vUv;
  void main() {
    // бегущие шевроны и мягкое свечение к краям
    float chev = fract(vUv.x * 6.0 - abs(vUv.y - 0.5) * 2.0 - uTime * 1.6);
    float stripe = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.35, 0.45, chev));
    float edge = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    float a = (0.12 + stripe * 0.55) * edge * uActive;
    gl_FragColor = vec4(uColor * (1.5 + stripe * 2.5), a);
  }`;
const beamFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float a = (1.0 - vUv.y) * 0.35 * (0.8 + 0.2 * sin(uTime * 4.0 + vUv.y * 20.0));
    a *= smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
    gl_FragColor = vec4(uColor * 2.0, a);
  }`;

export class Race {
  constructor(scene, track, terrain) {
    this.track = track;
    this.terrain = terrain;
    this.scene = scene;
    this.active = false;
    this.nGates = 12;
    this.gates = [];
    this.uniforms = { uTime: { value: 0 } };
    const hw = track.width / 2;
    const postGeo = new THREE.CylinderGeometry(0.25, 0.3, 5, 10);
    postGeo.translate(0, 2.5, 0);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x00e5ff, emissiveIntensity: 0.0 });
    for (let g = 0; g < this.nGates; g++) {
      const idx = Math.floor((g / this.nGates) * track.count);
      const p = track.point(idx), d = track.dir(idx);
      const y = terrain.getHeight(p.x, p.z);
      const grp = new THREE.Group();
      grp.position.set(p.x, y, p.z);
      grp.rotation.y = Math.atan2(d.x, d.z);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uniforms.uTime, uColor: { value: new THREE.Color(g === 0 ? 0xffc23d : 0x2ee6ff) }, uActive: { value: 1 } },
        vertexShader: gateVert, fragmentShader: gateFrag,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      // арка-лента
      const arch = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 2, 4.6, 1, 1), mat);
      arch.position.y = 2.6;
      grp.add(arch);
      const pm = postMat.clone();
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, pm);
        post.position.x = sx * (hw + 1.2);
        post.castShadow = true;
        grp.add(post);
      }
      // световой столб над следующим чекпоинтом
      const beamMat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uniforms.uTime, uColor: mat.uniforms.uColor },
        vertexShader: gateVert, fragmentShader: beamFrag,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 120, 16, 1, true), beamMat);
      beam.position.y = 60;
      grp.add(beam);
      grp.visible = false;
      scene.add(grp);
      this.gates.push({ grp, mat, beam, post: pm, idx, x: p.x, z: p.z, dx: d.x, dz: d.z });
    }
    this.lap = 1;
    this.next = 1;
    this.time = 0;
    this.best = Number(load('dd_best', 0)) || 0;
    this.countdown = 0;
    this.laps = [];
    this.lastLap = 0;
  }

  start(car, bots) {
    this.active = true;
    this.lap = 1;
    this.next = 1;
    this.time = 0;
    this.countdown = 3.2;
    this.passed = 0;
    const i = this.track.count - 8;
    const p = this.track.point(i), d = this.track.dir(i);
    car.reset(p.x + d.z * 3, p.z - d.x * 3, Math.atan2(d.x, d.z));
    bots?.forEach((b, k) => b.resetAt(i - 4 - (k >> 1) * 5, k % 2 ? -4 : 4, true));
    for (const g of this.gates) g.grp.visible = true;
    this._refresh();
  }

  stop(bots) {
    this.active = false;
    for (const g of this.gates) g.grp.visible = false;
    bots?.forEach((b) => (b.racing = false));
  }

  _refresh() {
    this.gates.forEach((g, i) => {
      const isNext = i === this.next;
      g.mat.uniforms.uActive.value = isNext ? 1 : 0.18;
      g.beam.visible = isNext;
      g.post.emissiveIntensity = isNext ? 2.5 : 0.2;
      g.post.emissive.set(i === 0 ? 0xffc23d : 0x2ee6ff);
    });
  }

  // Возвращает событие: null | {type:'cp'} | {type:'lap', time, best}
  update(dt, car) {
    this.uniforms.uTime.value += dt;
    if (!this.active) return null;
    if (this.countdown > 0) {
      this.countdown -= dt;
      return null;
    }
    this.time += dt;
    const g = this.gates[this.next];
    const dx = car.pos.x - g.x, dz = car.pos.z - g.z;
    const along = dx * g.dx + dz * g.dz;
    const lat = Math.abs(-dx * g.dz + dz * g.dx);
    if (Math.abs(along) < 3.5 && lat < this.track.width / 2 + 3) {
      if (this.next === 0) {
        const t = this.time;
        this.lastLap = t;
        const isBest = !this.best || t < this.best;
        if (isBest) { this.best = t; try { localStorage.setItem('dd_best', String(t)); } catch (e) { /* приватный режим */ } }
        this.lap++;
        this.time = 0;
        this.next = 1;
        this._refresh();
        return { type: 'lap', time: t, best: isBest };
      }
      this.next = (this.next + 1) % this.nGates;
      this._refresh();
      return { type: 'cp' };
    }
    return null;
  }

  // Прогресс по трассе для расчёта позиции
  progress(car) {
    const cpIdx = (this.next - 1 + this.nGates) % this.nGates;
    const base = this.gates[cpIdx].idx;
    const n = this.track.nearest(car.pos.x, car.pos.z, base + 20, 60).index;
    let rel = n - base;
    if (rel < -this.track.count / 2) rel += this.track.count;
    return (this.lap - 1) * this.track.count + base + Math.max(0, rel);
  }

  nextGate() { return this.gates[this.next]; }
}

export class DriftScore {
  constructor() {
    this.total = Number(load('dd_total', 0)) || 0;
    this.current = 0;
    this.mult = 1;
    this.chain = 0;
    this.grace = 0;
    this.active = false;
    this.events = [];
  }

  update(dt, car) {
    const ang = Math.abs(car.driftAngle);
    const drifting = car.contact > 0.5 && car.speed > 9 && ang > 0.24 && ang < 1.8 && car.vf > 0;
    if (drifting) {
      this.active = true;
      this.grace = 0;
      this.chain += dt;
      this.mult = Math.min(10, 1 + Math.floor(this.chain / 1.6));
      this.current += dt * car.speed * (ang * 57.3) * 0.9;
    } else if (this.active) {
      this.grace += dt;
      if (this.grace > (car.grounded ? 1.0 : 2.5)) this.bank();
    }
  }

  bank() {
    if (this.current > 50) {
      const pts = Math.round(this.current * this.mult);
      this.total += pts;
      this.events.push({ type: 'bank', pts, mult: this.mult });
      try { localStorage.setItem('dd_total', String(this.total)); } catch (e) { /* ignore */ }
    }
    this.reset();
  }

  fail() {
    if (this.current > 50) this.events.push({ type: 'fail', pts: Math.round(this.current * this.mult) });
    this.reset();
  }

  bonus(label, pts) {
    this.total += pts;
    this.events.push({ type: 'bonus', label, pts });
  }

  reset() {
    this.active = false;
    this.current = 0;
    this.chain = 0;
    this.mult = 1;
    this.grace = 0;
  }
}
