// Синтезированный звук (WebAudio), без аудиофайлов:
// V8 с турбиной (рабочий цикл с неравномерными выхлопами двух рядов, нагрузка/сброс газа,
// отсечка, провал при переключении, хлопки в выхлопе), шины (визг на асфальте, шорох
// и «картечь» песка), ветер, удары, щепки.
// Постоянные узлы создаются один раз в init(); в update() только плавно меняются параметры.
// Разовые звуки (хлопки, сброс давления, удары) собирают несколько короткоживущих узлов,
// которые сами останавливаются и отключаются.

const VOL = 0.55;                          // общая громкость
const TRIM = 0.7;                          // выход после компрессора (громкость как у прежнего звука)
const RATIOS = [0, 9, 16, 24, 33, 43, 70]; // скорости переключения передач, м/с (их показывает HUD)
const IDLE_RPM = 780, MAX_RPM = 5800;
const MAX_VOICES = 28;                     // предел одновременно звучащих разовых звуков

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

// Один рабочий цикл V8 (720° коленвала, вспышки 1-8-4-3-6-5-7-2 через 90°): выхлопные
// импульсы левого и правого ряда с разной силой и задержкой. Неравномерность по рядам
// даёт характерное «бу-бу-бу» крестообразного вала. Спектр цикла → PeriodicWave.
function v8Wave(ctx, o) {
  const N = 1024, K = 160, step = N / 8;
  const x = new Float32Array(N);
  const rightBank = [0, 1, 1, 0, 1, 0, 0, 1];
  let seed = o.seed;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let c = 0; c < 8; c++) {
    const right = rightBank[c];
    const amp = (right ? o.bank : 1) * (1 + (rnd() * 2 - 1) * o.spread);
    const start = (c + (right ? o.lag : 0)) * step;
    for (let n = 0; n < N; n++) {
      let d = (n - start) / step;
      if (d < 0) d += 8;
      const p = (1 - Math.exp(-d / o.rise)) * Math.exp(-d / o.decay);
      const dr = d - o.echoAt;
      const e = dr > 0 ? (1 - Math.exp(-dr / (o.rise * 2))) * Math.exp(-dr / (o.decay * 1.4)) : 0;
      x[n] += amp * (p - o.echo * e);
    }
  }
  const cs = new Float32Array(N), sn = new Float32Array(N);
  for (let n = 0; n < N; n++) { cs[n] = Math.cos((2 * Math.PI * n) / N); sn[n] = Math.sin((2 * Math.PI * n) / N); }
  const re = new Float32Array(K + 1), im = new Float32Array(K + 1);
  const k0 = K * 0.6;
  for (let k = 1; k <= K; k++) {
    let a = 0, b = 0;
    for (let n = 0, j = 0; n < N; n++, j = (j + k) & (N - 1)) { a += x[n] * cs[j]; b += x[n] * sn[j]; }
    const w = k < k0 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (k - k0)) / (K - k0 + 1)); // мягкий спад верхних гармоник
    re[k] = a * w; im[k] = b * w;
  }
  return ctx.createPeriodicWave(re, im);
}

// Плавный случайный сигнал (−1..1) — для «плавания» оборотов, порывов ветра, дрожания визга
function smoothNoiseBuffer(ctx, seconds, perSec) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const n = Math.round(seconds * perSec), pts = new Float32Array(n);
  for (let i = 0; i < n; i++) pts[i] = Math.random() * 2 - 1;
  const step = len / n;
  for (let i = 0; i < len; i++) {
    const x = i / step, k = Math.floor(x), f = x - k;
    const p0 = pts[k % n], p1 = pts[(k + 1) % n];
    d[i] = p0 + (p1 - p0) * (0.5 - 0.5 * Math.cos(f * Math.PI));
  }
  return buf;
}

// Россыпь коротких щелчков: песчинки и камешки бьют по арке колёс и днищу
function gravelBuffer(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.5);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let i = 0;
  for (;;) {
    i += 1 + Math.floor((-Math.log(1 - Math.random()) * sr) / 420);
    if (i >= len) break;
    const L = Math.floor(sr * rand(0.0005, 0.003)), tau = L / 3;
    const A = 0.12 + Math.random() ** 3 * 0.88;
    for (let j = 0; j < L && i + j < len; j++) d[i + j] += A * (Math.random() * 2 - 1) * Math.exp(-j / tau);
  }
  normalize(d, 0.9);
  return buf;
}

// Ломающаяся доска: резкий треск, затем быстро редеющие щелчки волокон
function splinterBuffer(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * 0.5);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  const crack = Math.floor(sr * 0.004);
  for (let j = 0; j < crack; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / (crack / 3));
  let i = crack;
  while (i < len) {
    const tt = i / sr;
    const rate = 1600 * Math.exp(-tt / 0.05) + 140 * Math.exp(-tt / 0.18) + 8;
    i += 1 + Math.floor((-Math.log(1 - Math.random()) * sr) / rate);
    if (i >= len) break;
    const A = Math.exp(-tt / 0.14) * (0.15 + Math.random() ** 1.5 * 0.85);
    if (Math.random() < 0.4) {
      // звонкий «щелчок» волокна: затухающий синус
      const f = rand(1500, 5200), L = Math.floor(sr * rand(0.002, 0.005)), tau = L / 3;
      for (let j = 0; j < L && i + j < len; j++) d[i + j] += A * Math.sin((2 * Math.PI * f * j) / sr) * Math.exp(-j / tau);
    } else {
      const L = Math.floor(sr * rand(0.0005, 0.003)), tau = L / 3;
      for (let j = 0; j < L && i + j < len; j++) d[i + j] += A * (Math.random() * 2 - 1) * Math.exp(-j / tau);
    }
  }
  normalize(d, 0.95);
  return buf;
}

function normalize(d, peak) {
  let m = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; }
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.gear = 1;
    this.rpm = 0.2;
    this.load = 0;        // сглаженная нагрузка (газ)
    this.spool = 0;       // давление турбины 0..~1.15
    this._ok = false;     // граф собран
    this._lastT = -1;
    this._live = 0;       // активные разовые звуки
    this._prevThr = 0;
    this._thrHeld = 0;    // сколько секунд газ держат нажатым
    this._airT = 0;
    this._burnT = 0;
    this._shiftT = 0;
    this._crackle = 0;
    this._crackle0 = 1;
    this._cutNext = 0;
    this._popNext = 0;
    this._suspendTimer = 0;
  }

  init() {
    if (this.ctx) { if (this.enabled) this._resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    let ctx;
    try { ctx = new AC(); } catch (e) { return; }
    this.ctx = ctx;
    try {
      this._build(ctx);
      this._ok = true;
    } catch (e) {
      // браузер не умеет что-то из нужного — тихо остаёмся без звука
      console.warn('Audio: синтез недоступен', e);
      this._ok = false;
      try { ctx.close(); } catch (_) { /* ignore */ }
      this.ctx = null;
      return;
    }
    if (!this.enabled) this._scheduleSuspend();
  }

  _build(ctx) {
    const sr = ctx.sampleRate;
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    // k-rate: коэффициенты фильтров и шаг генераторов считаются раз в блок, а не на каждый сэмпл
    const kr = (p) => { try { p.automationRate = 'k-rate'; } catch (e) { /* старые браузеры */ } };
    const filt = (type, f, q, to) => {
      const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      kr(b.frequency); kr(b.Q); kr(b.gain); kr(b.detune);
      if (to) b.connect(to);
      return b;
    };
    const loop = (buffer, rate = 1) => {
      const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = rate;
      s.start(0, Math.random() * buffer.duration * 0.9);
      return s;
    };

    // --- Мастер: компрессор + мягкий ограничитель (ничего не клиппует) ---
    this.master = gain(this.enabled ? VOL : 0);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    const pre = gain(0.5 * TRIM);
    const clip = ctx.createWaveShaper();
    const cc = new Float32Array(2048);
    for (let i = 0; i < cc.length; i++) {
      const x = ((i / (cc.length - 1)) * 2 - 1) * 2;        // вход ±2 (кривая читается после ×0.5)
      const ax = Math.abs(x);
      cc[i] = Math.sign(x) * (ax < 0.7 ? ax : 0.7 + 0.28 * Math.tanh((ax - 0.7) / 0.28)); // потолок 0.98
    }
    clip.curve = cc;
    this.master.connect(comp).connect(pre).connect(clip).connect(ctx.destination);
    const out = this.master;

    // --- Общие источники ---
    const nb = ctx.createBuffer(1, sr * 2, sr), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.gravelBuf = gravelBuffer(ctx);
    this.splinterBuf = splinterBuffer(ctx);
    const slow = smoothNoiseBuffer(ctx, 3, 12);
    const noise = loop(nb);

    // --- Двигатель ---
    // два генератора одного цикла: «под нагрузкой» (резкие импульсы) и «сброс» (мягкое неровное бурление)
    this.oOn = ctx.createOscillator();
    this.oOn.setPeriodicWave(v8Wave(ctx, { seed: 7, rise: 0.02, decay: 0.21, bank: 0.7, lag: 0.14, spread: 0.12, echo: 0.3, echoAt: 0.5 }));
    this.oOff = ctx.createOscillator();
    this.oOff.setPeriodicWave(v8Wave(ctx, { seed: 31, rise: 0.05, decay: 0.28, bank: 0.55, lag: 0.14, spread: 0.4, echo: 0.2, echoAt: 0.6 }));
    for (const o of [this.oOn, this.oOff]) { kr(o.frequency); kr(o.detune); }
    const f0 = IDLE_RPM / 120;
    this.oOn.frequency.value = f0; this.oOff.frequency.value = f0;
    this.eG = gain(0);
    this.cutG = gain(1, out);              // провалы: отсечка и переключение передач
    this.eG.connect(this.cutG);
    const eHP = filt('highpass', 32, 0.7, this.eG);
    const ePeak = filt('peaking', 125, 0.9, eHP); ePeak.gain.value = 4;   // «грудь» выхлопа
    this.eLP = filt('lowpass', 900, 1.0, ePeak);                           // глушитель: ярче под нагрузкой
    const shaper = ctx.createWaveShaper();
    const sc = new Float32Array(1024), kd = Math.tanh(3);
    for (let i = 0; i < sc.length; i++) { const x = (i / (sc.length - 1)) * 2 - 1; sc[i] = Math.tanh(3 * x) / kd; }
    shaper.curve = sc;
    shaper.connect(this.eLP);
    this.drive = gain(0.5, shaper);
    this.onG = gain(0.3, this.drive);
    this.offG = gain(0.6, this.drive);
    this.oOn.connect(this.onG);
    this.oOff.connect(this.offG);
    // рокот: шум, промодулированный выхлопными импульсами
    this.rumbleLP = filt('lowpass', 250, 0.7);
    this.rumbleG = gain(0, this.drive);
    noise.connect(this.rumbleLP).connect(this.rumbleG);
    this.rumbleAM = gain(0, this.rumbleG.gain);
    this.oOff.connect(this.rumbleAM);
    // неровная работа: обороты чуть «плавают» (в центах), сильнее на холостых
    this.jitG = gain(15);
    loop(slow, 1).connect(this.jitG);
    this.jitG.connect(this.oOn.detune);
    this.jitG.connect(this.oOff.detune);
    this.oOn.start(); this.oOff.start();

    // --- Турбина: свист раскрутки + шипение впуска; отдельный рёв импульса ---
    this.turbo = ctx.createOscillator(); this.turbo.type = 'sine'; this.turbo.frequency.value = 2300;
    kr(this.turbo.frequency); kr(this.turbo.detune);
    this.turboG = gain(0, out);
    this.turbo.connect(this.turboG);
    this.turbo.start();
    this.hissG = gain(0, out);
    noise.connect(filt('highpass', 3800, 0.7, this.hissG));
    this.boostG = gain(0, out);
    noise.connect(filt('bandpass', 520, 0.8, this.boostG));

    // --- Шины ---
    // визг по твёрдому: узкие полосы шума (основная + обертон), частота и громкость дрожат
    this.sqG = gain(0, out);
    this.sqBP1 = filt('bandpass', 1050, 11, this.sqG);
    this.sqBP2 = filt('bandpass', 2150, 9);
    this.sqBP2.connect(gain(0.45, this.sqG));
    noise.connect(this.sqBP1); noise.connect(this.sqBP2);
    const wob = gain(45);
    loop(slow, 2.3).connect(wob);
    wob.connect(this.sqBP1.frequency); wob.connect(this.sqBP2.frequency);
    this.sqAM = gain(0, this.sqG.gain);
    loop(slow, 6).connect(this.sqAM);
    // шорох скольжения: асфальт — светлее, песок — ниже и гуще
    this.hissT = gain(0, out);
    this.hissBP = filt('bandpass', 2200, 0.6, this.hissT);
    noise.connect(this.hissBP);
    // «картечь» песка и камешков
    this.gravel = loop(this.gravelBuf, 1);
    this.gravelG = gain(0, out);
    this.gravel.connect(filt('bandpass', 2600, 0.7, this.gravelG));
    // гул качения: на песке — глухой и громкий
    this.rollG = gain(0, out);
    this.rollLP = filt('lowpass', 400, 0.6, this.rollG);
    noise.connect(this.rollLP);

    // --- Ветер (вместе с фоновым ветром пустыни) с медленными порывами ---
    this.windG = gain(0.04, out);
    this.windBP = filt('bandpass', 260, 0.45, this.windG);
    noise.connect(this.windBP);
    this.gustG = gain(0.012, this.windG.gain);
    loop(slow, 0.09).connect(this.gustG);
  }

  _resume() {
    const c = this.ctx;
    if (!c || !c.resume) return;
    try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  _scheduleSuspend() {
    clearTimeout(this._suspendTimer);
    // после затухания усыпляем контекст: без звука граф не тратит процессор
    this._suspendTimer = setTimeout(() => {
      const c = this.ctx;
      if (this.enabled || !c || !c.suspend || c.state !== 'running') return;
      try { const p = c.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }, 400);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!this.ctx || !this.master) return;
    if (v) { clearTimeout(this._suspendTimer); this._resume(); }
    this.master.gain.setTargetAtTime(v ? VOL : 0, this.ctx.currentTime, 0.05);
    if (!v) this._scheduleSuspend();
  }

  update(car, dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    const speed = Math.abs(car.vf || 0);
    // передачи (HUD читает this.gear)
    const prevGear = this.gear;
    while (this.gear < 6 && speed > RATIOS[this.gear] * 1.02) this.gear++;
    while (this.gear > 1 && speed < RATIOS[this.gear - 1] * 0.82) this.gear--;
    if (!this.ctx || !this._ok) return;
    const t = this.ctx.currentTime;

    const W = car.wheels;
    const boosting = !!car.boosting;
    const thr = boosting ? 1 : clamp(car.throttle || 0, 0, 1);
    const grounded = car.grounded !== false;
    const air = !grounded;
    const contact = clamp(car.contact ?? 1, 0, 1);
    const road = clamp(car.surfaceRoad || 0, 0, 1), sand = 1 - road;
    const carSpeed = car.speed || 0;

    // --- Обороты ---
    const lo = RATIOS[this.gear - 1] * 0.7, hi = RATIOS[this.gear];
    let rpmT = 0.18 + 0.82 * clamp((speed - lo) / (hi - lo), 0, 1);
    const spinning = (W[2].slipLong || 0) > 2 || air;
    this._airT = air ? this._airT + dt : 0;
    const burn = thr > 0.05 && grounded && !!(car.donut || car.reverseSliding);
    this._burnT = burn ? this._burnT + dt : 0;
    if (thr > 0) {
      if (spinning) rpmT = Math.max(rpmT, 0.85);
      if (carSpeed < 1) rpmT = Math.max(rpmT, 0.5 + 0.3 * thr);
      if (car.handbrake && grounded) rpmT = Math.max(rpmT, 0.78 + 0.1 * thr);
      if (burn) rpmT = Math.max(rpmT, 0.88 + 0.06 * thr);
      if (air) rpmT = Math.max(rpmT, 0.62 + 0.4 * thr);
    }
    // отсечка: полный газ в полёте или долгая пробуксовка (пончик, езда задом)
    // (в пончике — волнами: сцепление то появляется, то пропадает)
    const bt = this._burnT;
    const limiter = thr > 0.85 && ((air && this._airT > 0.25) || (bt > 0.8 && Math.sin(bt * 2.1) + 0.6 * Math.sin(bt * 5.3) > 0.2));
    if (limiter) rpmT = 1.04;
    this._shiftT = Math.max(0, this._shiftT - dt);
    let k = 8;
    if (this._shiftT > 0) k = 18;
    else if (rpmT > this.rpm && spinning) k = 6;
    else if (air && thr <= 0) k = 2.5;
    this.rpm = clamp(this.rpm + (rpmT - this.rpm) * Math.min(1, dt * k), 0.15, 1);
    this.load += (thr - this.load) * Math.min(1, dt * (thr > this.load ? 14 : 9));
    const spT = boosting ? 1.15 : thr * clamp((this.rpm - 0.3) / 0.5, 0, 1);
    this.spool += (spT - this.spool) * Math.min(1, dt * (spT > this.spool ? 1.6 : 6));

    // --- События: переключение, отсечка, сброс газа ---
    const on = this.enabled;
    if (this.gear > prevGear && grounded && thr > 0.3) this._shift(t);
    if (limiter && this.rpm > 0.975 && t >= this._cutNext) {
      if (on) this._cut(t, 0.2, 0.04, -120);
      this.rpm -= 0.035;
      this._cutNext = t + rand(0.08, 0.115);
      if (Math.random() < 0.25) this._pop(t + 0.012, 0.3);
    }
    if (this._prevThr > 0.5 && thr < 0.1) {
      // «пшш» турбины и очередь хлопков — только после того, как газ подержали
      if (this.spool > 0.5) this._bov(t, this.spool);
      if (this.rpm > 0.65 && this._thrHeld > 0.4 && Math.random() < 0.75) {
        this._crackle = this._crackle0 = 0.3 + 1.2 * (this.rpm - 0.6);
        if (this.rpm > 0.85 && Math.random() < 0.5) this._pop(t + rand(0.03, 0.09), 1);
      }
    }
    this._thrHeld = thr > 0.5 ? this._thrHeld + dt : 0;
    this._prevThr = thr;
    if (thr < 0.1) {
      if (this._crackle > 0) {
        const r = 11 * this.rpm * (this._crackle / this._crackle0);
        this._crackle -= dt;
        if (Math.random() < r * dt) this._pop(t + Math.random() * dt, rand(0.2, 0.75));
      } else if (this.rpm > 0.65 && grounded && speed > 10 && Math.random() < 1.6 * (this.rpm - 0.6) * dt) {
        this._pop(t + Math.random() * dt, rand(0.15, 0.45));
      }
    } else this._crackle = 0;

    // параметры не трогаем, если звук выключен или время контекста стоит (не копим события)
    if (!on || t <= this._lastT) return;
    this._lastT = t;

    // --- Двигатель ---
    const R = this.rpm, L = this.load;
    const f = (IDLE_RPM + (MAX_RPM - IDLE_RPM) * clamp((R - 0.18) / 0.82, 0, 1)) / 120;
    this.oOn.frequency.setTargetAtTime(f, t, 0.03);
    this.oOff.frequency.setTargetAtTime(f, t, 0.03);
    this.onG.gain.setTargetAtTime(0.25 + 0.75 * L, t, 0.04);
    this.offG.gain.setTargetAtTime(0.1 + (1 - L) * (0.55 + 0.45 * R), t, 0.04);
    this.drive.gain.setTargetAtTime(0.4 + 0.25 * L + 0.15 * R, t, 0.04);
    this.eLP.frequency.setTargetAtTime(340 + R * 1000 + L * (250 + R * 1400), t, 0.05);
    const rb = 0.05 + 0.12 * L * (0.4 + R);
    this.rumbleLP.frequency.setTargetAtTime(150 + R * 450, t, 0.05);
    this.rumbleG.gain.setTargetAtTime(rb, t, 0.05);
    this.rumbleAM.gain.setTargetAtTime(rb * 0.85, t, 0.05);
    this.eG.gain.setTargetAtTime(0.125 + 0.05 * L + 0.04 * R, t, 0.05);
    this.jitG.gain.setTargetAtTime(6 + 26 * (1 - R) * (1 - 0.6 * L), t, 0.1);

    // --- Турбина и импульс ---
    const sp = this.spool;
    this.turbo.frequency.setTargetAtTime(2300 + 4300 * Math.min(sp, 1.15) + (boosting ? 500 : 0), t, 0.08);
    this.turboG.gain.setTargetAtTime(0.022 * sp * sp + (boosting ? 0.02 : 0), t, 0.06);
    this.hissG.gain.setTargetAtTime(0.03 * sp * sp, t, 0.06);
    this.boostG.gain.setTargetAtTime(boosting ? 0.1 : 0, t, 0.08);

    // --- Шины ---
    let slip = 0;
    for (let i = 0; i < W.length; i++) {
      const s = (W[i].slipLat || 0) + (W[i].slipLong || 0) * 0.6;
      if (s > slip) slip = s;
    }
    let skid = clamp((slip - 2.5) / 12, 0, 1) * contact;
    if (car.donut) skid = Math.max(skid, 0.75 * contact);
    if (car.reverseSliding && thr > 0) skid = Math.max(skid, 0.5 * contact);
    const sq = skid * road;
    const sqLvl = sq > 0 ? 1.8 * sq ** 1.2 : 0;
    this.sqG.gain.setTargetAtTime(sqLvl, t, 0.04);
    this.sqAM.gain.setTargetAtTime(sqLvl * 0.5, t, 0.04);
    const sqF = 950 + 300 * skid + Math.min(150, speed * 4);
    this.sqBP1.frequency.setTargetAtTime(sqF, t, 0.08);
    this.sqBP2.frequency.setTargetAtTime(sqF * 2.04, t, 0.08);
    const roll = contact * clamp(speed / 45, 0, 1) ** 0.9;
    this.hissT.gain.setTargetAtTime(skid * (0.3 * sand + 0.07 * road) + roll * sand * 0.03, t, 0.05);
    this.hissBP.frequency.setTargetAtTime(1500 + 1500 * road + skid * 400, t, 0.1);
    this.gravelG.gain.setTargetAtTime(sand * contact * (clamp(speed / 35, 0, 1) * 0.07 + skid * 0.5), t, 0.05);
    this.gravel.playbackRate.setTargetAtTime(0.6 + clamp(speed / 30, 0, 1) * 0.8 + skid * 0.4, t, 0.1);
    this.rollG.gain.setTargetAtTime(roll * (0.1 * road + 0.3 * sand) + skid * sand * 0.35, t, 0.06);
    this.rollLP.frequency.setTargetAtTime(180 + 380 * sand + speed * 3, t, 0.1);

    // --- Ветер: растёт со скоростью, в полёте сильнее ---
    const wv = 0.04 + 0.11 * Math.min(1, (carSpeed / 55) ** 2) + (air ? 0.03 + 0.06 * clamp(carSpeed / 40, 0, 1) : 0);
    this.windG.gain.setTargetAtTime(wv, t, 0.1);
    this.gustG.gain.setTargetAtTime(wv * 0.35, t, 0.2);
    this.windBP.frequency.setTargetAtTime(250 + carSpeed * 13 + (air ? 180 : 0), t, 0.1);
  }

  // Провал мощности: отсечка (с проседанием тона) или выжатое сцепление при переключении
  _cut(t, depth, hold, cents) {
    const g = this.cutG.gain;
    g.setTargetAtTime(depth, t, 0.006);
    g.setTargetAtTime(1, t + hold, 0.018);
    if (cents) {
      this.oOn.detune.setTargetAtTime(cents, t, 0.02);
      this.oOff.detune.setTargetAtTime(cents, t, 0.02);
      this.oOn.detune.setTargetAtTime(0, t + hold, 0.035);
      this.oOff.detune.setTargetAtTime(0, t + hold, 0.035);
    }
  }

  _shift(t) {
    this._shiftT = 0.16;
    const sp = this.spool;
    this.spool *= 0.55;
    if (!this.enabled) return;
    this._cut(t, 0.18, 0.1, 0);
    if (this.rpm > 0.72 && Math.random() < 0.7) this._pop(t + 0.025, 0.45);
    if (sp > 0.6) this._bov(t, sp * 0.5);
  }

  _canPlay() {
    return !!(this.ctx && this._ok && this.enabled && this._live < MAX_VOICES);
  }

  // Узлы разового звука отключаются, когда доиграет последний источник
  _voice(last, nodes) {
    this._live++;
    last.onended = () => {
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
      this._live--;
    };
  }

  _noise(t, dur, buf = this.noiseBuf, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const maxOff = Math.max(0, buf.duration - dur * rate - 0.01);
    s.start(t, buf === this.noiseBuf ? Math.random() * maxOff : 0);
    s.stop(t + dur);
    return s;
  }

  // Хлопок в выхлопе (size 1 — выстрел)
  _pop(t, size) {
    if (!this._canPlay() || t < this._popNext) return;
    this._popNext = t + 0.035;
    const ctx = this.ctx;
    const big = size > 0.8;
    const a = 0.18 + 0.32 * size;
    const end = t + (big ? 0.3 : 0.12);
    const src = this._noise(t, end - t);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = big ? 420 : rand(600, 1300); bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a * 2.4, t + 0.0015);
    g.gain.setTargetAtTime(0, t + 0.0015, big ? 0.035 : rand(0.008, 0.02));
    src.connect(bp).connect(g).connect(this.master);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(big ? 80 : rand(105, 150), t);
    o.frequency.exponentialRampToValueAtTime(big ? 38 : 60, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(a * (big ? 1.3 : 0.6), t + 0.002);
    og.gain.setTargetAtTime(0, t + 0.002, big ? 0.05 : 0.018);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(end);
    this._voice(o, [src, bp, g, o, og]);
  }

  // Сброс давления турбины: «пшш» с опускающейся полосой
  _bov(t, amt) {
    if (!this._canPlay()) return;
    const ctx = this.ctx;
    const a = 0.1 * clamp(amt, 0, 1.15);
    const src = this._noise(t, 0.6);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(rand(3200, 3800), t);
    bp.frequency.setTargetAtTime(1500, t + 0.02, 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(a * 3, t + 0.012);
    g.gain.setTargetAtTime(a * 1.6, t + 0.012, 0.03);
    g.gain.setTargetAtTime(0, t + 0.06, 0.12);
    src.connect(bp).connect(g).connect(this.master);
    this._voice(src, [src, bp, g]);
  }

  impact(strength, kind = 'hit') {
    if (!this._canPlay()) return;
    const s = clamp(Number(strength) || 0, 0, 60);
    const a = Math.min(0.9, 0.15 + s * 0.04);
    const t = this.ctx.currentTime;
    if (kind === 'land') this._land(t, a, s);
    else if (kind === 'wood') this._wood(t, a, s);
    else this._hit(t, a, s);
  }

  // Приземление: глухой удар в песок, стук подвески в отбойник и отскок, брызги песка
  _land(t, a, s) {
    const ctx = this.ctx, end = t + 0.7;
    const src = this._noise(t, 0.7);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
    const gW = ctx.createGain();
    gW.gain.setValueAtTime(0, t);
    gW.gain.linearRampToValueAtTime(a * 1.6, t + 0.006);
    gW.gain.setTargetAtTime(0, t + 0.006, 0.08);
    src.connect(lp).connect(gW).connect(this.master);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(1100, 1500); bp.Q.value = 2.5;
    const gC = ctx.createGain();
    const t2 = t + rand(0.09, 0.14);
    gC.gain.setValueAtTime(0, t);
    gC.gain.setTargetAtTime(a * 1.1, t + 0.01, 0.001);
    gC.gain.setTargetAtTime(0, t + 0.014, 0.012);
    gC.gain.setTargetAtTime(a * 0.55, t2, 0.001);
    gC.gain.setTargetAtTime(0, t2 + 0.004, 0.01);
    src.connect(bp).connect(gC).connect(this.master);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; hp.Q.value = 0.7;
    const gS = ctx.createGain();
    const spray = a * 0.35 * clamp(s / 10, 0.2, 1);
    gS.gain.setValueAtTime(0, t);
    gS.gain.linearRampToValueAtTime(spray, t + 0.03);
    gS.gain.setTargetAtTime(0, t + 0.03, 0.14);
    src.connect(hp).connect(gS).connect(this.master);
    // низкий удар
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(66, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    const gT = ctx.createGain();
    gT.gain.setValueAtTime(0, t);
    gT.gain.linearRampToValueAtTime(a * 1.1, t + 0.004);
    gT.gain.setTargetAtTime(0, t + 0.02, 0.1);
    o.connect(gT).connect(this.master);
    // металлический «клац» подвески
    const k = ctx.createOscillator(); k.type = 'triangle';
    k.frequency.setValueAtTime(rand(150, 190), t);
    k.frequency.exponentialRampToValueAtTime(110, t + 0.2);
    const gK = ctx.createGain();
    gK.gain.setValueAtTime(0, t);
    gK.gain.setTargetAtTime(a * 0.5, t + 0.01, 0.002);
    gK.gain.setTargetAtTime(0, t + 0.018, 0.03);
    gK.gain.setTargetAtTime(a * 0.25, t2, 0.002);
    gK.gain.setTargetAtTime(0, t2 + 0.008, 0.025);
    k.connect(gK).connect(this.master);
    o.start(t); o.stop(end);
    k.start(t); k.stop(end);
    this._voice(o, [src, lp, gW, bp, gC, hp, gS, o, gT, k, gK]);
  }

  // Удар о препятствие: тупой удар, хруст и короткий звон кузова
  _hit(t, a, s) {
    const ctx = this.ctx, end = t + 0.5;
    const src = this._noise(t, 0.4);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(800, 1200); bp.Q.value = 0.7;
    const gN = ctx.createGain();
    gN.gain.setValueAtTime(0, t);
    gN.gain.linearRampToValueAtTime(a * 1.8, t + 0.003);
    gN.gain.setTargetAtTime(0, t + 0.003, 0.045);
    src.connect(bp).connect(gN).connect(this.master);
    const deb = this._noise(t, 0.35, this.gravelBuf, rand(1.1, 1.5));
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500; hp.Q.value = 0.7;
    const gD = ctx.createGain();
    gD.gain.setValueAtTime(a * 0.5, t);
    gD.gain.setTargetAtTime(0, t + 0.02, 0.07);
    deb.connect(hp).connect(gD).connect(this.master);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const gT = ctx.createGain();
    gT.gain.setValueAtTime(0, t);
    gT.gain.linearRampToValueAtTime(a * 1.0, t + 0.003);
    gT.gain.setTargetAtTime(0, t + 0.015, 0.07);
    o.connect(gT).connect(this.master);
    // звон кузова: две негармонические частоты
    const m = clamp((s - 3) / 12, 0, 1) * a * 0.14;
    const r = rand(0.9, 1.1);
    const m1 = ctx.createOscillator(); m1.frequency.value = 410 * r;
    const m2 = ctx.createOscillator(); m2.frequency.value = 1130 * r;
    const gM = ctx.createGain();
    gM.gain.setValueAtTime(0, t);
    gM.gain.linearRampToValueAtTime(m, t + 0.004);
    gM.gain.setTargetAtTime(0, t + 0.004, 0.09);
    m1.connect(gM); m2.connect(gM); gM.connect(this.master);
    o.start(t); o.stop(end);
    m1.start(t); m1.stop(end); m2.start(t); m2.stop(end);
    this._voice(o, [src, bp, gN, deb, hp, gD, o, gT, m1, m2, gM]);
  }

  // Дерево: треск ломающихся досок + глухой деревянный стук
  _wood(t, a, s) {
    const ctx = this.ctx, end = t + 0.55;
    const sp = this._noise(t, 0.5, this.splinterBuf, rand(0.85, 1.2));
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700; hp.Q.value = 0.7;
    const gS = ctx.createGain(); gS.gain.value = a * 1.2;
    sp.connect(hp).connect(gS).connect(this.master);
    const src = this._noise(t, 0.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(380, 480); bp.Q.value = 4;
    const gK = ctx.createGain();
    gK.gain.setValueAtTime(0, t);
    gK.gain.linearRampToValueAtTime(a * 3, t + 0.002);
    gK.gain.setTargetAtTime(0, t + 0.002, 0.035);
    src.connect(bp).connect(gK).connect(this.master);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    const gT = ctx.createGain();
    gT.gain.setValueAtTime(0, t);
    gT.gain.linearRampToValueAtTime(a * 0.5 * clamp(s / 8, 0.3, 1), t + 0.003);
    gT.gain.setTargetAtTime(0, t + 0.003, 0.05);
    o.connect(gT).connect(this.master);
    o.start(t); o.stop(end);
    this._voice(o, [sp, hp, gS, src, bp, gK, o, gT]);
  }

  blip(freq = 880, dur = 0.12, vol = 0.12) {
    if (!this._canPlay()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this._voice(o, [o, g]);
  }
}
