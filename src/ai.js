// Боты-соперники: едут по трассе, срезают с заносом, прыгают с трамплинов, пылят.
import * as THREE from 'three';
import { buildCarModel } from './carModel.js';
import { clamp, damp, lerp } from './noise.js';

const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _n = new THREE.Vector3();

export class Bot {
  constructor(track, terrain, color, skill, offset) {
    this.track = track;
    this.terrain = terrain;
    this.model = buildCarModel(color);
    this.mesh = this.model.root;
    this.skill = skill;
    this.s = offset;              // позиция вдоль трассы (индекс, дробный)
    this.lane = 0;
    this.speed = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.slide = 0;
    this.vy = 0;
    this.grounded = true;
    this.groundH = 0;
    this.up = new THREE.Vector3(0, 1, 0);
    this.lap = 0;
    this.racing = false;
    this.wait = 0;
    this.spin = 0;
    this.prevWheels = [new THREE.Vector3(), new THREE.Vector3()];
    this.driftAngle = 0;
    this.resetAt(offset, (Math.random() - 0.5) * 6, false);
  }

  resetAt(index, lane, racing) {
    this.s = ((index % this.track.count) + this.track.count) % this.track.count;
    this.lane = lane;
    this.laneTarget = lane;
    this.speed = 0;
    this.racing = racing;
    this.wait = racing ? 3.2 : 0;
    this.lap = 0;
    const p = this._sample(this.s);
    this.pos.set(p.x, this.terrain.getHeight(p.x, p.z), p.z);
    this.groundH = this.pos.y;
    this.heading = Math.atan2(p.dx, p.dz);
    this.vy = 0;
    this.grounded = true;
    this.vel.set(0, 0, 0);
  }

  _sample(s) {
    const tr = this.track;
    const i = Math.floor(s), t = s - i;
    const a = tr.point(i), b = tr.point(i + 1);
    const da = tr.dir(i), db = tr.dir(i + 1);
    const dx = da.x + (db.x - da.x) * t, dz = da.z + (db.z - da.z) * t;
    const l = Math.hypot(dx, dz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: dx / l, dz: dz / l };
  }

  curvature(ahead) {
    const i = Math.floor(this.s);
    const a = this.track.dir(i + ahead), b = this.track.dir(i + ahead + 14);
    return a.x * b.z - a.z * b.x; // знак — направление поворота
  }

  update(dt, player) {
    const tr = this.track;
    if (this.wait > 0) { this.wait -= dt; this._pose(dt); return; }
    // целевая скорость по кривизне впереди
    let maxC = 0;
    for (const k of [4, 10, 18]) maxC = Math.max(maxC, Math.abs(this.curvature(k)));
    const vmax = lerp(44, 19, clamp(maxC / 0.45, 0, 1)) * this.skill;
    const acc = this.speed < vmax ? 7.5 : -11;
    if (this.grounded) this.speed = clamp(this.speed + acc * dt, 0, vmax + 2);
    // объезд игрока
    const dxp = player.pos.x - this.pos.x, dzp = player.pos.z - this.pos.z;
    const p0 = this._sample(this.s);
    const ahead = dxp * p0.dx + dzp * p0.dz;
    const side = -dxp * p0.dz + dzp * p0.dx;
    if (ahead > 0 && ahead < 18 && Math.abs(side) < 3.5) {
      this.laneTarget = side > 0 ? -5 : 5;
      if (ahead < 7) this.speed *= Math.exp(-1.5 * dt);
    } else if (Math.random() < dt * 0.15) {
      this.laneTarget = (Math.random() - 0.5) * 9;
    }
    this.lane = damp(this.lane, this.laneTarget, 1.2, dt);

    const prevS = this.s;
    this.s += (this.speed * dt) / tr.step;
    if (this.s >= tr.count) { this.s -= tr.count; this.lap++; }
    if (prevS > this.s + tr.count / 2) { /* перескок через 0 уже учтён */ }

    const p = this._sample(this.s);
    const nx = p.dz, nz = -p.dx; // нормаль влево
    const tx = p.x + nx * this.lane, tz = p.z + nz * this.lane;
    const oldX = this.pos.x, oldZ = this.pos.z;
    this.pos.x = tx; this.pos.z = tz;
    this.vel.set((tx - oldX) / dt, 0, (tz - oldZ) / dt);

    // визуальный занос: корма наружу в поворотах
    const c = this.curvature(2);
    const slideT = clamp(-c * this.speed * 0.09, -0.75, 0.75);
    this.slide = damp(this.slide, slideT, 3, dt);
    this.driftAngle = this.slide;
    this.heading = Math.atan2(p.dx, p.dz) + this.slide;

    // вертикаль с отрывом (трамплины и гребни)
    const g = this.terrain.getHeight(this.pos.x, this.pos.z);
    const gVy = (g - this.groundH) / dt;
    this.groundH = g;
    if (this.grounded) {
      const vyFree = this.vy - 14.7 * dt;
      if (vyFree > gVy + 2.6) { this.grounded = false; this.vy = vyFree; this.pos.y += this.vy * dt; }
      else { this.pos.y = g; this.vy = gVy; }
    } else {
      this.vy -= 14.7 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) { this.pos.y = g; this.landed = Math.max(0, gVy - this.vy); this.vy = gVy; this.grounded = true; }
    }
    this.vel.y = this.vy;

    // столкновение с игроком
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.6 && d > 1e-3 && Math.abs(player.pos.y - this.pos.y) < 1.8) {
      const nx2 = dx / d, nz2 = dz / d, pen = 2.6 - d;
      player.pos.x += nx2 * pen; player.pos.z += nz2 * pen;
      const rel = (player.vel.x - this.vel.x) * nx2 + (player.vel.z - this.vel.z) * nz2;
      if (rel < 0) {
        player.vel.x -= nx2 * rel * 1.3; player.vel.z -= nz2 * rel * 1.3;
        player.yawRate += (Math.random() - 0.5) * 0.8;
        player.events.push({ type: 'hit', strength: -rel * 1.3, x: this.pos.x + nx2 * 1.3, z: this.pos.z + nz2 * 1.3 });
        this.speed *= 0.85;
      }
    }
    this._pose(dt);
  }

  _pose(dt) {
    const t = this.terrain;
    if (this.grounded) {
      t.getNormal(this.pos.x, this.pos.z, _n, 1.4);
      this.up.lerp(_n, 1 - Math.exp(-10 * dt)).normalize();
    } else {
      this.up.lerp(_n.set(0, 1, 0), 1 - Math.exp(-1 * dt)).normalize();
    }
    _z.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    _z.addScaledVector(this.up, -_z.dot(this.up)).normalize();
    _x.crossVectors(this.up, _z).normalize();
    _m.makeBasis(_x, this.up, _z);
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.spin += (this.speed / 0.42) * dt;
    const roll = clamp(this.slide * 0.08, -0.06, 0.06);
    this.model.body.rotation.z = roll;
    for (const w of this.model.wheels) {
      w.spin.rotation.x = this.spin;
      w.pivot.position.y = this.grounded ? 0.42 : 0.28;
      if (w.front) w.pivot.rotation.y = -this.slide * 0.8;
    }
  }

  rearWheels(outA, outB) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    outA.set(this.pos.x - s * 1.4 + c * 0.9, this.pos.y, this.pos.z - c * 1.4 - s * 0.9);
    outB.set(this.pos.x - s * 1.4 - c * 0.9, this.pos.y, this.pos.z - c * 1.4 + s * 0.9);
  }

  progress() {
    return this.lap * this.track.count + this.s;
  }
}
