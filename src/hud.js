// HUD: скорость/FPS, очки дрифта, гонка, всплывающие сообщения, миникарта.
import { HALF, WORLD_SIZE } from './config.js';

const $ = (id) => document.getElementById(id);

export function fmtTime(t) {
  if (!t) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export class HUD {
  constructor(track) {
    this.el = {
      speed: $('speed'), fps: $('fps'), drift: $('drift'), driftScore: $('driftScore'), driftMult: $('driftMult'),
      driftAngle: $('driftAngle'), total: $('totalScore'), toasts: $('toasts'), race: $('racePanel'),
      lap: $('lap'), lapTime: $('lapTime'), best: $('bestLap'), cp: $('cp'), pos: $('pos'),
      boost: $('boostFill'), big: $('bigText'), btnRace: $('btnRace'), cam: $('btnCam'), arrow: $('cpArrow'),
      gear: $('gear'),
    };
    this.map = $('minimap');
    this.mctx = this.map.getContext('2d');
    this.track = track;
    // фон миникарты рисуется один раз
    const bg = document.createElement('canvas');
    bg.width = bg.height = 300;
    const g = bg.getContext('2d');
    const k = 300 / WORLD_SIZE;
    g.fillStyle = 'rgba(214,170,115,0.85)';
    g.fillRect(0, 0, 300, 300);
    g.strokeStyle = 'rgba(90,60,35,0.9)';
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    track.points.forEach((p, i) => {
      const x = (p.x + HALF) * k, y = (p.z + HALF) * k;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.closePath();
    g.stroke();
    g.strokeStyle = 'rgba(255,240,215,0.9)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(80,55,35,0.8)';
    g.beginPath(); g.arc(HALF * k, HALF * k, 6, 0, 7); g.fill();
    this.mapBg = bg;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsShown = 60;
    this.lastDriftShown = -1;
  }

  toast(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.innerHTML = text;
    this.el.toasts.prepend(d);
    setTimeout(() => d.classList.add('out'), 1800);
    setTimeout(() => d.remove(), 2400);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
  }

  bigText(text, ms = 900) {
    const b = this.el.big;
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.remove('show'), ms);
  }

  update(dt, car, drift, race, bots, rig, camera, extra) {
    const e = this.el;
    // FPS — среднее за 0.5 с
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fpsShown = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; e.fps.textContent = this.fpsShown; }
    e.speed.textContent = String(Math.round(car.speed * 3.6)).padStart(3, '0');
    e.gear.textContent = extra.gear;
    e.boost.style.transform = `scaleX(${car.boost.toFixed(3)})`;
    e.boost.parentElement.classList.toggle('active', car.boosting);

    // Дрифт
    if (drift.active && drift.current > 20) {
      e.drift.classList.add('on');
      const v = Math.round(drift.current);
      if (v !== this.lastDriftShown) { e.driftScore.textContent = v.toLocaleString('ru-RU'); this.lastDriftShown = v; }
      e.driftMult.textContent = 'x' + drift.mult;
      e.driftAngle.textContent = Math.round(Math.abs(car.driftAngle) * 57.3) + '°';
    } else e.drift.classList.remove('on');
    e.total.textContent = 'ОЧКИ ' + Math.round(drift.total).toLocaleString('ru-RU');

    // Гонка
    e.race.classList.toggle('hidden', !race.active);
    e.btnRace.textContent = race.active ? 'СВОБОДНАЯ ЕЗДА' : 'НА ТРАССУ';
    if (race.active) {
      e.lap.textContent = race.lap;
      e.lapTime.textContent = fmtTime(race.time) || '0:00.00';
      e.best.textContent = fmtTime(race.best);
      e.cp.textContent = `${(race.next + race.nGates - 1) % race.nGates}/${race.nGates}`;
      e.pos.textContent = `${extra.position}/${bots.length + 1}`;
      // стрелка к следующему чекпоинту
      const g = race.nextGate();
      const dx = g.x - car.pos.x, dz = g.z - car.pos.z;
      const camYaw = Math.atan2(camera.position.x - car.pos.x, camera.position.z - car.pos.z);
      const a = Math.atan2(dx, dz) - camYaw + Math.PI;
      e.arrow.style.transform = `rotate(${-a}rad)`;
      e.arrow.textContent = '';
      e.arrow.dataset.dist = Math.round(Math.hypot(dx, dz)) + ' м';
    }

    // Миникарта
    const ctx = this.mctx, W = this.map.width;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, 7); ctx.clip();
    ctx.drawImage(this.mapBg, 0, 0, W, W);
    const k = W / WORLD_SIZE;
    const toMap = (x, z) => [(x + HALF) * k, (z + HALF) * k];
    for (const b of bots) {
      const [x, y] = toMap(b.pos.x, b.pos.z);
      ctx.fillStyle = b.hudColor;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    }
    if (race.active) {
      const g = race.nextGate();
      const [x, y] = toMap(g.x, g.z);
      ctx.strokeStyle = '#2ee6ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.stroke();
    }
    const [px, py] = toMap(car.pos.x, car.pos.z);
    ctx.translate(px, py);
    ctx.rotate(-car.heading + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
