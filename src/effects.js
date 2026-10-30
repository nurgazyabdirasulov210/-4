// Эффекты колёс: следы, пылевые шлейфы, «петушиный хвост» песка в заносе, дым на трассе, пламя импульса.
import * as THREE from 'three';
import { clamp } from './noise.js';
import { WIND } from './config.js';

// Цвета в линейном пространстве
const SAND = [0.74, 0.5, 0.29];
const SAND_LIGHT = [0.86, 0.66, 0.43];
const SMOKE = [0.78, 0.74, 0.7];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Effects {
  constructor(particles, tracks, terrain) {
    this.p = particles;
    this.tracks = tracks;
    this.terrain = terrain;
    this.acc = new Float32Array(64);
    this.prev = new Map();
    this.ambientAcc = 0;
  }

  _emitDust(key, rate, dt, fn) {
    this.acc[key] += rate * dt;
    while (this.acc[key] >= 1) { this.acc[key] -= 1; fn(); }
  }

  car(car, dt) {
    const P = this.p;
    const s = Math.sin(car.heading), c = Math.cos(car.heading);
    const road = car.surfaceRoad;
    for (let i = 0; i < 4; i++) {
      const w = car.wheels[i];
      const x = w.world.x, z = w.world.z, y = w.ground;
      let pv = this.prev.get(w);
      if (!pv) { pv = { x, z, on: false }; this.prev.set(w, pv); }
      const on = car.contact > 0.4;
      const slip = w.slipLat + w.slipLong;
      if (on && pv.on) {
        const groove = (0.45 + 0.4 * (1 - road)) * clamp(0.4 + car.speed / 20, 0.4, 1);
        const scuff = clamp((slip - 1.5) / 9, 0, 1) * (1 - road * 0.5);
        this.tracks.addSegment(pv.x, pv.z, x, z, 0.5 + scuff * 0.35, groove, scuff);
      }
      pv.x = x; pv.z = z; pv.on = on;
      if (!on) continue;

      const rear = i >= 2;
      const sp = car.speed;
      const slipK = clamp((slip - 2) / 10, 0, 1.5);
      // Пыль позади колёс
      const rate = ((sp > 1.5 ? sp * 0.45 : 0) + slipK * 38) * (rear ? 1 : 0.45) * (1 - road * 0.55);
      this._emitDust(i, rate, dt, () => {
        const big = slipK > 0.3;
        const life = big ? 2.6 + Math.random() * 2.2 : 1.4 + Math.random() * 1.6;
        const col = Math.random() < 0.5 ? SAND : SAND_LIGHT;
        P.emit(
          x + (Math.random() - 0.5) * 0.6, y + 0.25, z + (Math.random() - 0.5) * 0.6,
          -car.vel.x * 0.12 + (Math.random() - 0.5) * 2.5,
          0.6 + Math.random() * (1.5 + slipK * 2.5),
          -car.vel.z * 0.12 + (Math.random() - 0.5) * 2.5,
          0.7 + Math.random() * 0.6, big ? 5 + Math.random() * 5 : 2.2 + Math.random() * 2.5,
          life, big ? 0.55 : 0.32,
          col[0], col[1], col[2],
          { drag: 1.3, grav: -0.06 },
        );
      });
      // Брызги песка («петушиный хвост») при заносе/пробуксовке
      if (slipK > 0.15 && road < 0.6) {
        this._emitDust(8 + i, slipK * 70 * (rear ? 1 : 0.3), dt, () => {
          // назад и наружу относительно скорости скольжения
          const vx = -car.vel.x * 0.25 + (Math.random() - 0.5) * 4 - s * w.slipLong * 0.4;
          const vz = -car.vel.z * 0.25 + (Math.random() - 0.5) * 4 - c * w.slipLong * 0.4;
          P.emit(x, y + 0.2, z, vx, 2.5 + Math.random() * 4.5, vz,
            0.12 + Math.random() * 0.12, 0.25, 0.7 + Math.random() * 0.5, 0.85,
            SAND[0] * 0.8, SAND[1] * 0.8, SAND[2] * 0.8, { drag: 0.6, grav: 1, kind: 1 });
        });
      }
      // Шинный дым на укатанной трассе
      if (road > 0.5 && slipK > 0.25) {
        this._emitDust(16 + i, slipK * 30, dt, () => {
          P.emit(x, y + 0.3, z, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5,
            0.8, 4 + Math.random() * 3, 2.5 + Math.random() * 1.5, 0.35, SMOKE[0], SMOKE[1], SMOKE[2], { drag: 1.6, grav: -0.1 });
        });
      }
    }
    // Пламя и дым из выхлопа при импульсе
    if (car.boosting) {
      this._emitDust(30, 90, dt, () => {
        const ex = car.pos.x - s * 2.45 + c * 0.55, ez = car.pos.z - c * 2.45 - s * 0.55;
        P.emit(ex, car.pos.y + 0.5, ez,
          -s * 8 + car.vel.x * 0.8 + (Math.random() - 0.5), 0.3, -c * 8 + car.vel.z * 0.8 + (Math.random() - 0.5),
          0.35, 0.7, 0.18 + Math.random() * 0.1, 0.9, 4.0, 1.6, 0.5, { drag: 4, grav: -0.2 });
      });
    }
  }

  bot(bot, dt, k) {
    const P = this.p;
    bot.rearWheels(_a, _b);
    const key = 40 + k * 2;
    const slide = Math.abs(bot.slide);
    [_a, _b].forEach((w, j) => {
      const y = this.terrain.getHeight(w.x, w.z);
      const pk = `${k}_${j}`;
      let pv = this.prev.get(pk);
      if (!pv) { pv = { x: w.x, z: w.z }; this.prev.set(pk, pv); }
      if (bot.grounded) this.tracks.addSegment(pv.x, pv.z, w.x, w.z, 0.55, 0.5, clamp(slide * 1.5, 0, 1));
      pv.x = w.x; pv.z = w.z;
      if (!bot.grounded) return;
      this._emitDust(key + j, bot.speed * 0.4 + slide * 40, dt, () => {
        const big = slide > 0.25;
        P.emit(w.x, y + 0.25, w.z,
          -bot.vel.x * 0.1 + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 1.5, -bot.vel.z * 0.1 + (Math.random() - 0.5) * 2,
          0.8, big ? 6 : 2.5, big ? 3.5 : 1.8, big ? 0.5 : 0.3, SAND[0], SAND[1], SAND[2], { drag: 1.3, grav: -0.06 });
      });
    });
  }

  burst(x, y, z, n, power, color = SAND, chips = 0, chipColor = [0.3, 0.2, 0.12]) {
    const P = this.p;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = power * (0.4 + Math.random() * 0.6);
      P.emit(x + Math.cos(a) * 0.8, y + 0.3, z + Math.sin(a) * 0.8,
        Math.cos(a) * r, 0.8 + Math.random() * power * 0.4, Math.sin(a) * r,
        1.0 + Math.random(), 5 + Math.random() * 5, 2.5 + Math.random() * 2.5, 0.5, color[0], color[1], color[2],
        { drag: 1.5, grav: -0.05 });
    }
    for (let i = 0; i < chips; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * power;
      P.emit(x, y + 0.5, z, Math.cos(a) * r, 3 + Math.random() * 5, Math.sin(a) * r,
        0.12 + Math.random() * 0.14, 0, 1.2 + Math.random(), 1, chipColor[0], chipColor[1], chipColor[2],
        { drag: 0.4, grav: 1, kind: 1 });
    }
  }

  // Сдуваемые ветром песчаные вихри вокруг игрока
  ambient(center, dt) {
    this.ambientAcc += dt * 7;
    while (this.ambientAcc >= 1) {
      this.ambientAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 70;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      const y = this.terrain.gridHeight(x, z);
      this.p.emit(x, y + 0.2, z, WIND.x * WIND.strength * 2, 0.2, WIND.z * WIND.strength * 2,
        2.5, 8 + Math.random() * 6, 4 + Math.random() * 3, 0.12, SAND_LIGHT[0], SAND_LIGHT[1], SAND_LIGHT[2],
        { drag: 0.5, grav: -0.02 });
    }
  }
}
