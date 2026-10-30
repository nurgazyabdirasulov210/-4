// Управление: клавиатура, геймпад и сенсорный интерфейс (слайдер руля + педали).
import { clamp, damp } from './noise.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, jump: false };
    this.touch = { steer: 0, gas: false, brake: false, hand: false, boost: false, jump: false, active: false };
    this.pressed = new Set(); // одноразовые нажатия
    this.steerSmooth = 0;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(el) {
    const track = el.querySelector('#steerTrack');
    const knob = el.querySelector('#steerKnob');
    let steerId = null, sx = 0, sy = 0;
    const setKnob = (v) => {
      knob.style.transform = `translateX(${v * (track.clientWidth / 2 - 22)}px)`;
    };
    const steerFrom = (x) => {
      const r = track.getBoundingClientRect();
      return clamp(((x - (r.left + r.width / 2)) / (r.width / 2)) * 1.15, -1, 1);
    };
    const zone = el.querySelector('#steerZone');
    zone.addEventListener('pointerdown', (e) => {
      steerId = e.pointerId; sx = e.clientX; sy = e.clientY;
      zone.setPointerCapture(e.pointerId);
      this.touch.steer = steerFrom(e.clientX);
      this.touch.active = true;
      setKnob(this.touch.steer);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== steerId) return;
      this.touch.steer = steerFrom(e.clientX);
      setKnob(this.touch.steer);
      // свайп вверх — прыжок, вниз — импульс
      const dy = e.clientY - sy;
      if (dy < -55) { this.touch.jump = true; sy = e.clientY; }
      this.touch.boost = dy > 45;
    });
    const end = (e) => {
      if (e.pointerId !== steerId) return;
      steerId = null;
      this.touch.steer = 0;
      this.touch.boost = false;
      setKnob(0);
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const hold = (id, key) => {
      const b = el.querySelector(id);
      const on = (e) => { this.touch[key] = true; this.touch.active = true; b.classList.add('on'); b.setPointerCapture?.(e.pointerId); e.preventDefault(); };
      const off = () => { this.touch[key] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    };
    hold('#tGas', 'gas');
    hold('#tBrake', 'brake');
    hold('#tHand', 'hand');
    hold('#tBoost', 'boost');
    const jb = el.querySelector('#tJump');
    jb?.addEventListener('pointerdown', (e) => { this.touch.jump = true; e.preventDefault(); });
  }

  consume(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  update(dt) {
    const k = this.keys;
    const s = this.state;
    let thr = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brk = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    let st = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let hb = k.has('Space');
    let boost = k.has('ShiftLeft') || k.has('ShiftRight');
    let jump = this.pressed.has('KeyJ') || this.pressed.has('KeyE');
    this.pressed.delete('KeyJ'); this.pressed.delete('KeyE');

    // клавиатурный руль — плавно
    this.steerSmooth = damp(this.steerSmooth, st, st === 0 ? 10 : 6, dt);
    st = this.steerSmooth;

    // геймпад
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) st = ax;
      const rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
      if (rt > 0.05) thr = Math.max(thr, rt);
      if (lt > 0.05) brk = Math.max(brk, lt);
      if (p.buttons[0]?.pressed || p.buttons[5]?.pressed) hb = true;
      if (p.buttons[2]?.pressed || p.buttons[4]?.pressed) boost = true;
      if (p.buttons[3]?.pressed && !this._padJump) jump = true;
      this._padJump = !!p.buttons[3]?.pressed;
      if (p.buttons[1]?.pressed && !this._padCam) this.pressed.add('KeyC');
      this._padCam = !!p.buttons[1]?.pressed;
    }

    // сенсор
    const t = this.touch;
    if (t.active) {
      if (Math.abs(t.steer) > 0.02) st = t.steer;
      if (t.gas) thr = 1;
      if (t.brake) brk = 1;
      if (t.hand) hb = true;
      if (t.boost) boost = true;
      if (t.jump) { jump = true; t.jump = false; }
    }

    s.throttle = thr;
    s.brake = brk;
    s.steer = clamp(st, -1, 1);
    s.handbrake = hb;
    s.boost = boost;
    s.jump = jump;
    return s;
  }
}
