// Генерация замкнутой гоночной трассы (Catmull-Rom по контрольным точкам).

export class Track {
  constructor(noise) {
    this.width = 18;
    const N = 16;
    const ctrl = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 370 + 120 * noise.noise(Math.cos(a) * 1.2 + 5.3, Math.sin(a) * 1.2 + 9.1)
        + 35 * noise.noise(Math.cos(a) * 3.1 + 2.0, Math.sin(a) * 3.1 - 4.0);
      ctrl.push({ x: Math.cos(a) * r, z: Math.sin(a) * r * 0.92 });
    }

    // Плотная выборка сплайна
    const dense = [];
    for (let i = 0; i < N; i++) {
      const p0 = ctrl[(i - 1 + N) % N], p1 = ctrl[i], p2 = ctrl[(i + 1) % N], p3 = ctrl[(i + 2) % N];
      for (let s = 0; s < 60; s++) {
        const t = s / 60, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        dense.push({ x: cr(p0.x, p1.x, p2.x, p3.x), z: cr(p0.z, p1.z, p2.z, p3.z) });
      }
    }

    // Равномерная перевыборка с шагом ~2.5 м
    const L = dense.length;
    const cum = [0];
    for (let i = 1; i <= L; i++) {
      const a = dense[i - 1], b = dense[i % L];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    const total = cum[L];
    const count = Math.floor(total / 2.5);
    const step = total / count;
    const pts = [];
    let k = 0;
    for (let s = 0; s < count; s++) {
      const d = s * step;
      while (cum[k + 1] < d) k++;
      const t = (d - cum[k]) / (cum[k + 1] - cum[k]);
      const a = dense[k], b = dense[(k + 1) % L];
      pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }

    this.points = pts;
    this.count = pts.length;
    this.length = pts.length * step;
    this.step = step;
    this.heights = new Float32Array(pts.length); // заполняется рельефом

    // Направления
    this.dirs = pts.map((p, i) => {
      const n = pts[(i + 1) % pts.length], pr = pts[(i - 1 + pts.length) % pts.length];
      const dx = n.x - pr.x, dz = n.z - pr.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    });
  }

  point(i) {
    return this.points[((i % this.count) + this.count) % this.count];
  }
  dir(i) {
    return this.dirs[((i % this.count) + this.count) % this.count];
  }

  // Ближайший индекс точки трассы (с подсказкой для скорости)
  nearest(x, z, hint = -1, window = 40) {
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      for (let k = -window; k <= window; k++) {
        const i = (((hint + k) % this.count) + this.count) % this.count;
        const p = this.points[i];
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return { index: best, dist: Math.sqrt(bd) };
    }
    for (let i = 0; i < this.count; i++) {
      const p = this.points[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { index: best, dist: Math.sqrt(bd) };
  }
}
