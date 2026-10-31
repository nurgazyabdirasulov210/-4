// Камера: высокая «как в видео», низкая погоня, вид сверху, капот. Тряска и FOV от скорости.
import * as THREE from 'three';
import { damp, clamp } from './noise.js';

const MODES = [
  { name: 'ВЫСОКАЯ', dist: 16, height: 9.5, look: 1.0, fov: 52 },
  { name: 'ПОГОНЯ', dist: 8.5, height: 3.4, look: 1.4, fov: 62 },
  { name: 'ДРОН', dist: 26, height: 30, look: 0.0, fov: 45 },
  { name: 'КАПОТ', dist: -0.6, height: 1.75, look: 1.6, fov: 70 },
];

export class CameraRig {
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;
    this.mode = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.shake = 0;
    this.t = 0;
    this.fov = 55;
    this._v = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookT = new THREE.Vector3();
    this.view = new THREE.Vector3(0, 0, 1); // dir с учётом поворота мышью
    this.orbit = 0; // поворот мышью/пальцем
  }

  get modeName() { return MODES[this.mode].name; }
  next() { this.mode = (this.mode + 1) % MODES.length; }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  snap(car) {
    this.dir.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    this.update(car, 1, true);
  }

  update(car, dt, instant = false) {
    const m = MODES[this.mode];
    this.t += dt;
    const fwd = this._v.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    // направление камеры: смесь курса и вектора скорости (видно занос сбоку)
    const vx = car.vel.x, vz = car.vel.z;
    const sp = Math.hypot(vx, vz);
    const target = this._target.set(0, 0, 0);
    if (this.mode === 3) target.copy(fwd);
    else if (sp > 4) {
      // камера идёт за движением: в заносе, «пончике» и при езде задом наперёд
      target.set(vx / sp, 0, vz / sp);
      if (car.vf > 0) target.lerp(fwd, 0.35);
      target.normalize();
    }
    else target.copy(fwd);
    const k = instant ? 1 : 1 - Math.exp(-(this.mode === 3 ? 20 : 3.2) * dt);
    this.dir.lerp(target, k).normalize();
    // поворот мышью применяется к виду, а не накапливается в dir
    const v = this.view.copy(this.dir);
    if (this.orbit) {
      const c = Math.cos(this.orbit), s = Math.sin(this.orbit);
      v.set(this.dir.x * c + this.dir.z * s, 0, -this.dir.x * s + this.dir.z * c);
    }

    const speedK = clamp(sp / 45, 0, 1);
    const dist = m.dist + (this.mode === 3 ? 0 : speedK * 3.5);
    const desired = this._desired.set(
      car.pos.x - v.x * dist,
      car.pos.y + m.height + speedK * (this.mode === 0 ? 2 : 0.6),
      car.pos.z - v.z * dist,
    );
    if (this.mode === 3) {
      desired.copy(car.mesh.localToWorld(this._v.set(0, 1.75, 0.6)));
    }
    // не уходить под песок
    const gh = this.terrain.getHeight(desired.x, desired.z) + 1.4;
    if (desired.y < gh) desired.y = gh;

    if (instant || this.mode === 3) this.pos.copy(desired);
    else {
      this.pos.x = damp(this.pos.x, desired.x, 7, dt);
      this.pos.z = damp(this.pos.z, desired.z, 7, dt);
      this.pos.y = damp(this.pos.y, desired.y, 4.5, dt);
    }

    const lookAhead = m.look * clamp(sp, 0, 40) * 0.12;
    const lookT = this._lookT.set(
      car.pos.x + v.x * lookAhead,
      car.pos.y + (this.mode === 3 ? 1.4 : 0.8),
      car.pos.z + v.z * lookAhead,
    );
    if (this.mode === 3) lookT.copy(car.mesh.localToWorld(this._v.set(0, 1.4, 12)));
    if (instant) this.look.copy(lookT);
    else this.look.lerp(lookT, 1 - Math.exp(-10 * dt));

    // тряска
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake * 0.6 + (car.contact > 0.5 ? speedK * speedK * 0.025 : 0);
    const n = (a) => Math.sin(this.t * a) * Math.sin(this.t * a * 1.37 + 1.1);
    this.camera.position.set(this.pos.x + n(37) * sh, this.pos.y + n(43) * sh, this.pos.z + n(31) * sh);
    this.camera.lookAt(this.look);

    const fovT = m.fov + speedK * 10 + (car.boosting ? 8 : 0);
    this.fov = damp(this.fov, fovT, 3, dt);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
}
