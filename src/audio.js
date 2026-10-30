// Синтезированный звук (WebAudio): двигатель с передачами, визг/шорох шин по песку, ветер, удары.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.gear = 1;
    this.rpm = 0.2;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // Двигатель
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const g3 = ctx.createGain(); g3.gain.value = 0.6;
    this.o1.connect(g1).connect(shaper);
    this.o2.connect(g2).connect(shaper);
    this.o3.connect(g3).connect(shaper);
    shaper.connect(this.eFilter).connect(this.eGain).connect(this.master);
    this.o1.start(); this.o2.start(); this.o3.start();

    // Турбо-свист для импульса
    this.whine = ctx.createOscillator(); this.whine.type = 'sine';
    this.wGain = ctx.createGain(); this.wGain.gain.value = 0;
    this.whine.connect(this.wGain).connect(this.master);
    this.whine.start();

    // Шум
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2; }
    this.noiseBuf = buf;
    const mkNoise = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start(0, Math.random() * 2);
      return { f, g };
    };
    this.skid = mkNoise('bandpass', 1100, 1.4);
    this.sand = mkNoise('lowpass', 520, 0.7);
    this.wind = mkNoise('bandpass', 380, 0.6);
    this.ambient = mkNoise('bandpass', 250, 0.3);
    this.ambient.g.gain.value = 0.04;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.55 : 0, this.ctx.currentTime, 0.05);
  }

  update(car, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speed = Math.abs(car.vf);
    // передачи
    const ratios = [0, 9, 16, 24, 33, 43, 70];
    while (this.gear < 6 && speed > ratios[this.gear] * 1.02) this.gear++;
    while (this.gear > 1 && speed < ratios[this.gear - 1] * 0.82) this.gear--;
    const lo = ratios[this.gear - 1] * 0.7, hi = ratios[this.gear];
    let rpm = 0.18 + 0.82 * Math.min(1, Math.max(0, (speed - lo) / (hi - lo)));
    const spinning = car.wheels[2].slipLong > 2 || !car.grounded;
    if (spinning && car.throttle > 0) rpm = Math.max(rpm, 0.85);
    if (car.speed < 1 && car.throttle > 0) rpm = 0.6;
    this.rpm += (rpm - this.rpm) * Math.min(1, dt * 8);
    const f = 38 + this.rpm * 150;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 0.25, t, 0.03);
    this.eFilter.frequency.setTargetAtTime(300 + this.rpm * 1800 + car.throttle * 600, t, 0.05);
    this.eGain.gain.setTargetAtTime(0.11 + car.throttle * 0.1 + this.rpm * 0.05, t, 0.05);
    this.wGain.gain.setTargetAtTime(car.boosting ? 0.035 : 0, t, 0.08);
    this.whine.frequency.setTargetAtTime(1800 + speed * 30, t, 0.1);

    let slip = 0;
    for (const w of car.wheels) slip = Math.max(slip, w.slipLat + w.slipLong * 0.6);
    const skid = Math.min(1, Math.max(0, (slip - 2.5) / 12)) * car.contact;
    this.skid.g.gain.setTargetAtTime(skid * (0.08 + 0.12 * car.surfaceRoad), t, 0.04);
    this.skid.f.frequency.setTargetAtTime(700 + car.surfaceRoad * 700 + skid * 200, t, 0.1);
    this.sand.g.gain.setTargetAtTime(Math.min(0.32, speed / 60) * car.contact * (1 - car.surfaceRoad * 0.5) + skid * 0.15, t, 0.06);
    this.wind.g.gain.setTargetAtTime(Math.min(0.25, (car.speed / 55) ** 2 * 0.25) + (car.grounded ? 0 : 0.06), t, 0.1);
    this.wind.f.frequency.setTargetAtTime(300 + car.speed * 12, t, 0.1);
  }

  impact(strength, kind = 'hit') {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.value = kind === 'land' ? 260 : kind === 'wood' ? 1600 : 900;
    const g = ctx.createGain();
    const a = Math.min(0.9, 0.15 + strength * 0.04);
    g.gain.setValueAtTime(a, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'land' ? 0.5 : 0.3));
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.6);
    // низкий удар
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(kind === 'wood' ? 140 : 70, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
    const og = ctx.createGain();
    og.gain.setValueAtTime(a * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.35);
  }

  blip(freq = 880, dur = 0.12, vol = 0.12) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
}
