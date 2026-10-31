// Пыль, песчаные шлейфы, дым, брызги песка и пламя — инстансированные билборды с процедурным шейдером.
// Два пула: «пыль» (обычное смешивание, сортировка по глубине корзинами) и «жар» (аддитивное пламя, kind = 2).
import * as THREE from 'three';

const NB = 64;            // корзины сортировки по глубине (от дальних к ближним)
const SORT_RANGE = 400;   // м — дальше всё попадает в последнюю корзину
const STREAK = '0.035';   // с — «выдержка» для вытягивания песчинок и пламени по скорости
const TAU = Math.PI * 2;

const VERT = /* glsl */ `
  attribute vec4 aPos;    // xyz — центр, w — размер
  attribute vec4 aData;   // x — доля жизни, y — тип + зерно, z — поворот, w — высота центра над песком
  attribute vec4 aTint;   // rgb, альфа
  attribute vec3 aVel;    // скорость (м/с) — для вытягивания песчинок и пламени
  uniform vec3 uSunDir;
  varying vec2 vUv;       // [-1, 1]
  varying vec4 vTint;
  varying vec4 vInfo;     // доля жизни, зерно, глубина, высота фрагмента над песком
  varying vec4 vLight;    // солнце в базисе спрайта (xyz), сила контрового света (w)
  varying vec3 vMode;     // тип, детализация шума, 1/ширина мягкого касания песка
  void main() {
    float size = aPos.w;
    float kind = floor(aData.y);
    vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
    vec3 center = mv.xyz;
    vec2 ax, ay;
    vec2 vv = (viewMatrix * vec4(aVel, 0.0)).xy;
    float vl = length(vv);
    if (kind > 0.5 && vl > 0.05) {
      // песчинки и языки пламени вытягиваются вдоль экранной скорости
      vec2 d = vv / vl;
      float len = size + min(vl * ${STREAK}, size * 7.0);
      ay = d * (len * 0.5);
      ax = vec2(d.y, -d.x) * (size * 0.5); // тот же обход вершин, что и у повёрнутого квада (иначе отсечётся как задняя грань)
    } else {
      float c = cos(aData.z), s = sin(aData.z);
      ax = vec2(c, s) * (size * 0.5);
      ay = vec2(-s, c) * (size * 0.5);
    }
    vec2 p = position.xy * 2.0;
    vec2 off = ax * p.x + ay * p.y;
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    vUv = p;
    vTint = aTint;
    // высота фрагмента над песком: смещение в плоскости спрайта, переведённое в мировую вертикаль
    float hag = aData.w + dot(vec3(off, 0.0), viewMatrix[1].xyz);
    vInfo = vec4(aData.x, fract(aData.y), -mv.z, hag);
    vec3 sv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    vec2 bx = normalize(ax), by = normalize(ay);
    // солнце за частицей (смотрим против света) — контровая подсветка тонких краёв
    float back = dot(normalize(center), sv);
    vLight = vec4(dot(sv.xy, bx), dot(sv.xy, by), sv.z, smoothstep(0.05, 0.85, back));
    // доля высоты экрана, которую занимает частица: мелким и дальним — меньше октав шума
    float scr = projectionMatrix[1][1] * size / max(-center.z, 0.5);
    vMode = vec3(kind, smoothstep(0.3, 0.75, scr), kind > 0.5 ? 25.0 : 1.0 / (0.35 + size * 0.08));
  }`;

const NOISE = /* glsl */ `
  float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  // value noise с аналитическими производными: (значение, d/dx, d/dy)
  vec3 vnd(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
  }`;

const FRAG_DUST = /* glsl */ `
  uniform vec3 uSunColor, uAmbient, uFogColor;
  uniform float uFogNear, uFogFar;
  varying vec2 vUv;
  varying vec4 vTint;
  varying vec4 vInfo;
  varying vec4 vLight;
  varying vec3 vMode;
  ${NOISE}
  void main() {
    vec2 q = vUv;
    float r2 = dot(q, q);
    if (r2 >= 1.0) discard;
    float r = sqrt(r2);
    float life = vInfo.x;
    vec3 col;
    float a;
    if (vMode.x > 0.5) {
      // песчинка или комок: плотная капля без шума, освещённая как шарик
      a = (1.0 - smoothstep(0.25, 1.0, r)) * vTint.a;
      float lit = 0.3 + 0.45 * clamp(dot(vec3(q * 0.8, sqrt(1.0 - r2)), vLight.xyz) * 0.5 + 0.5, 0.0, 1.0);
      col = vTint.rgb * (uAmbient + uSunColor * lit);
    } else {
      // форма клуба: 2 октавы шума, 3-я — только у крупных на экране (не больше 3 октав на фрагмент)
      vec2 p = q * 1.6 + vInfo.y * 17.0 + vec2(0.0, life * 1.5);
      vec3 n1 = vnd(p);
      vec3 n2 = vnd(p * 2.03 + 1.7);
      float n = n1.x * 0.5 + n2.x * 0.25;
      vec2 g = n1.yz * 0.5 + n2.yz * 0.2;   // для света — только крупные «бугры», без мелкой ряби
      if (vMode.y > 0.0) n += (vnd(p * 4.07 + 4.3).x - 0.5) * 0.14 * vMode.y;
      // к концу жизни края клуба «выветриваются» в рваные пряди
      float f = r + (n - 0.375) * 1.1 + life * life * 0.3;
      float dens = (1.0 - smoothstep(0.22, 1.0, f)) * (1.0 - smoothstep(0.78, 1.0, r));
      if (dens <= 0.003) discard;
      // псевдонормаль: полусфера + рельеф шума — свет ложится на «бугры» клуба
      vec3 N = normalize(vec3(q * 0.9 + g * 0.5, sqrt(1.0 - r2) + 0.25));
      // мягкий «обёрнутый» свет от солнца в плоскости спрайта: средняя яркость клуба не зависит
      // от того, светит солнце из-за камеры или навстречу (иначе шлейф сливается с освещённым песком)
      vec3 L = vec3(normalize(vLight.xy + 1e-4), 0.0);
      float diff = 0.5 + 0.5 * dot(N, L);
      float core = dens * dens;
      // плотное ядро затеняет само себя со стороны от солнца
      float sunK = (0.18 + 0.82 * diff) * mix(1.0, 0.72, core * (1.0 - diff)) * (1.0 + 0.06 * vLight.z);
      // против солнца: ядро чуть темнее, тонкие края светятся (рассеяние вперёд)
      float back = vLight.w;
      sunK = sunK * (1.0 - 0.2 * back * core) + back * (1.0 - dens) * exp(-1.6 * dens) * 1.1;
      // цвет: у земли — темнее взбитый песок, выше и позже — светлее и чуть выцветшая дымка
      float hz = clamp(vInfo.w * 0.2 + life * 0.5 - 0.15, 0.0, 1.0);
      vec3 base = vTint.rgb * mix(vec3(0.9, 0.87, 0.84), vec3(1.0), smoothstep(0.0, 0.45, hz));
      float lum = dot(base, vec3(0.3, 0.59, 0.11));
      base = mix(base, vec3(lum) * vec3(1.06, 1.0, 0.94), hz * 0.12) * (1.0 + 0.06 * hz);
      col = base * (uAmbient * (1.0 - 0.15 * core) + uSunColor * sunK);
      a = dens * vTint.a;
    }
    a *= smoothstep(0.0, 0.06, life) * pow(1.0 - life, 1.2);
    a *= smoothstep(0.6, 4.0, vInfo.z);                 // не закрывать камеру
    a *= smoothstep(-0.25, 1.0, vInfo.w * vMode.z);     // мягкое касание песка вместо резкого среза
    if (a < 0.002) discard;
    float fog = smoothstep(uFogNear, uFogFar, vInfo.z);
    gl_FragColor = vec4(mix(col, uFogColor, fog), a);
  }`;

const FRAG_HOT = /* glsl */ `
  uniform float uTime;
  uniform float uFogNear, uFogFar;
  varying vec2 vUv;
  varying vec4 vTint;
  varying vec4 vInfo;
  ${NOISE}
  void main() {
    vec2 q = vUv;
    float r2 = dot(q, q);
    if (r2 >= 1.0) discard;
    float life = vInfo.x;
    // одна октава шума — дрожание языка пламени
    float n = vnd(q * 1.4 + vInfo.y * 23.0 + vec2(0.0, uTime * 9.0)).x;
    float core = 1.0 - smoothstep(0.0, 1.0, sqrt(r2) * (0.8 + 0.4 * n));
    core *= sqrt(core);
    // температура: белое ядро → жёлто-оранжевое → красное к хвосту
    float heat = core * (1.0 - life);
    vec3 col = vTint.rgb * mix(vec3(0.85, 0.5, 0.35), vec3(1.0, 1.25, 1.6), smoothstep(0.3, 0.85, heat));
    float a = core * vTint.a * (1.0 - smoothstep(0.5, 1.0, life)) * smoothstep(0.3, 1.5, vInfo.z);
    float fog = smoothstep(uFogNear, uFogFar, vInfo.z);
    gl_FragColor = vec4(col * (1.0 - fog), a);
  }`;

// Пул частиц: CPU-симуляция, компактизация живых, запись в инстансные буферы (при необходимости — с сортировкой)
class Pool {
  constructor(max, material, terrain, sorted) {
    this.max = max;
    this.terrain = terrain;
    this.sorted = sorted;
    this.count = 0;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.age = F(); this.life = F();
    this.size0 = F(); this.grow = F();
    this.alpha = F(); this.drag = F(); this.grav = F();
    this.rot = F(); this.spin = F(); this.seed = F();
    this.tr = F(); this.tg = F(); this.tb = F();
    this.swA = F(); this.swF = F(); this.swP = F(); // завихрение: сила, частота, фаза
    this.sz = F(); this.hg = F();                    // текущий размер и высота над песком
    this.kind = new Uint8Array(max);                 // 0 — пыль, 1 — песчинки, 2 — жар
    this.key = new Uint8Array(max);
    this.cnt = new Int32Array(NB);

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(4); this.aData = mk(4); this.aTint = mk(4); this.aVel = mk(3);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aData', this.aData);
    geo.setAttribute('aTint', this.aTint);
    geo.setAttribute('aVel', this.aVel);
    this.attrs = [this.aPos, this.aData, this.aTint, this.aVel];
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
  }

  emit(x, y, z, vx, vy, vz, size, grow, life, alpha, r, g, b, opts) {
    let i;
    if (this.count < this.max) i = this.count++;
    else {
      // пул полон: заменяем самую «отжившую» из нескольких случайных — меньше заметных исчезновений
      i = (Math.random() * this.max) | 0;
      let best = this.age[i] / this.life[i];
      for (let k = 0; k < 3; k++) {
        const j = (Math.random() * this.max) | 0;
        const f = this.age[j] / this.life[j];
        if (f > best) { best = f; i = j; }
      }
    }
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life;
    this.size0[i] = size; this.grow[i] = grow;
    this.alpha[i] = alpha;
    this.drag[i] = opts?.drag ?? 1.6;
    this.grav[i] = opts?.grav ?? -0.25;
    const kind = opts?.kind ?? 0;
    this.kind[i] = kind;
    this.rot[i] = Math.random() * TAU;
    this.spin[i] = (Math.random() - 0.5) * 0.8;
    this.seed[i] = Math.random() * 0.999;
    this.tr[i] = r; this.tg[i] = g; this.tb[i] = b;
    // мягкое завихрение у пыли: каждый клуб медленно «гуляет» по своей петле
    this.swA[i] = kind === 0 ? (0.35 + Math.random() * 0.75) * (opts?.swirl ?? 1) : 0;
    this.swF[i] = (0.5 + Math.random() * 1.1) * (Math.random() < 0.5 ? -1 : 1);
    this.swP[i] = Math.random() * TAU;
    this.sz[i] = size;
    this.hg[i] = 0.5;
  }

  update(dt, wind, cam) {
    const n = this.count;
    const T = this.terrain;
    const sort = this.sorted && cam.ok;
    const cnt = this.cnt;
    if (sort) cnt.fill(0);
    const cx = cam.x, cy = cam.y, cz = cam.z, fx = cam.fx, fy = cam.fy, fz = cam.fz;
    const kb = NB / Math.sqrt(SORT_RANGE);
    let w = 0;
    for (let i = 0; i < n; i++) {
      const age0 = this.age[i];
      const age = age0 + dt;
      if (age >= this.life[i]) continue;
      // компактизация: перенос в позицию w
      if (w !== i) this._move(i, w);
      this.age[w] = age;
      // в кадре рождения частица остаётся в точке выброса (иначе пламя «влезает» в машину)
      if (age0 > 0) {
        const k = Math.exp(-this.drag[w] * dt);
        // сдвиг ветра: у самой земли слабее, выше — сильнее
        const shear = 0.55 + 0.45 * Math.min(Math.max(this.hg[w], 0) * 0.25, 1.5);
        let vx = this.vx[w] * k + wind.x * shear * (1 - k);
        let vz = this.vz[w] * k + wind.z * shear * (1 - k);
        const sa = this.swA[w];
        if (sa !== 0) {
          const ph = age * this.swF[w] + this.swP[w];
          vx += Math.cos(ph) * sa * dt;
          vz += Math.sin(ph) * sa * dt;
        }
        this.vx[w] = vx; this.vz[w] = vz;
        this.vy[w] = this.vy[w] * k - this.grav[w] * 9.81 * dt;
        this.px[w] += vx * dt;
        this.py[w] += this.vy[w] * dt;
        this.pz[w] += vz * dt;
        this.rot[w] += this.spin[w] * dt;
      }
      const t = age / this.life[w];
      const size = this.size0[w] + this.grow[w] * Math.sqrt(t);
      const ground = T.gridHeight(this.px[w], this.pz[w]);
      const gy = ground + size * 0.22;
      if (this.py[w] < gy) {
        this.py[w] = gy;
        if (this.vy[w] < 0) this.vy[w] *= this.kind[w] === 1 ? -0.2 : 0;
      }
      this.sz[w] = size;
      this.hg[w] = this.py[w] - ground;
      if (sort) {
        // песчинки рисуем поверх пыли на той же глубине — иначе «хвост» тонет в клубах
        const d = (this.px[w] - cx) * fx + (this.py[w] - cy) * fy + (this.pz[w] - cz) * fz - (this.kind[w] === 1 ? 5 : 0);
        const b = d > 0 ? Math.min(NB - 1, (Math.sqrt(d) * kb) | 0) : 0;
        this.key[w] = b;
        cnt[b]++;
      }
      w++;
    }
    this.count = w;
    // запись в GPU-буферы: при сортировке — от дальних корзин к ближним
    if (sort) {
      let acc = 0;
      for (let b = NB - 1; b >= 0; b--) { const c = cnt[b]; cnt[b] = acc; acc += c; }
      for (let j = 0; j < w; j++) this._write(j, cnt[this.key[j]]++);
    } else {
      for (let j = 0; j < w; j++) this._write(j, j);
    }
    this.geo.instanceCount = w;
    for (let k = 0; k < 4; k++) {
      const a = this.attrs[k];
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, w * a.itemSize);
    }
  }

  _write(j, s) {
    const P = this.aPos.array, D = this.aData.array, C = this.aTint.array, V = this.aVel.array;
    let o = s * 4;
    P[o] = this.px[j]; P[o + 1] = this.py[j]; P[o + 2] = this.pz[j]; P[o + 3] = this.sz[j];
    D[o] = this.age[j] / this.life[j]; D[o + 1] = this.kind[j] + this.seed[j]; D[o + 2] = this.rot[j]; D[o + 3] = this.hg[j];
    C[o] = this.tr[j]; C[o + 1] = this.tg[j]; C[o + 2] = this.tb[j]; C[o + 3] = this.alpha[j];
    o = s * 3;
    V[o] = this.vx[j]; V[o + 1] = this.vy[j]; V[o + 2] = this.vz[j];
  }

  _move(i, w) {
    this.px[w] = this.px[i]; this.py[w] = this.py[i]; this.pz[w] = this.pz[i];
    this.vx[w] = this.vx[i]; this.vy[w] = this.vy[i]; this.vz[w] = this.vz[i];
    this.life[w] = this.life[i]; this.size0[w] = this.size0[i]; this.grow[w] = this.grow[i];
    this.alpha[w] = this.alpha[i]; this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i];
    this.rot[w] = this.rot[i]; this.spin[w] = this.spin[i]; this.seed[w] = this.seed[i];
    this.tr[w] = this.tr[i]; this.tg[w] = this.tg[i]; this.tb[w] = this.tb[i];
    this.swA[w] = this.swA[i]; this.swF[w] = this.swF[i]; this.swP[w] = this.swP[i];
    this.hg[w] = this.hg[i];
    this.kind[w] = this.kind[i];
  }
}

export class Particles {
  constructor(max, terrain) {
    this.max = max;
    this.terrain = terrain;
    this._cam = { ok: false, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3) },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.8) },
      uAmbient: { value: new THREE.Color(0.55, 0.5, 0.48) },
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 100 },
      uFogFar: { value: 900 },
    };

    const dustMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG_DUST,
      transparent: true,
      depthWrite: false,
    });
    const hotMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG_HOT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // общий бюджет частиц сохраняется: небольшая доля отдана под пламя
    const hotMax = Math.max(32, Math.min(160, Math.round(max * 0.04)));
    this.dust = new Pool(max - hotMax, dustMat, terrain, true);
    this.hot = new Pool(hotMax, hotMat, terrain, false);
    this.dust.mesh.renderOrder = 5;
    this.hot.mesh.renderOrder = 6;
    // камера последнего кадра — для сортировки пыли по глубине
    const cam = this._cam;
    this.dust.mesh.onBeforeRender = (renderer, scene, camera) => {
      const e = camera.matrixWorld.elements;
      cam.x = e[12]; cam.y = e[13]; cam.z = e[14];
      cam.fx = -e[8]; cam.fy = -e[9]; cam.fz = -e[10];
      cam.ok = true;
    };
    this.mesh = new THREE.Group();
    this.mesh.add(this.dust.mesh, this.hot.mesh);
  }

  get count() { return this.dust.count + this.hot.count; }

  emit(x, y, z, vx, vy, vz, size, grow, life, alpha, r, g, b, opts) {
    (opts?.kind === 2 ? this.hot : this.dust).emit(x, y, z, vx, vy, vz, size, grow, life, alpha, r, g, b, opts);
  }

  update(dt, wind) {
    this.dust.update(dt, wind, this._cam);
    this.hot.update(dt, wind, this._cam);
  }
}
