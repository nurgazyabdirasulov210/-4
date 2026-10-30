// Пыль, песчаные шлейфы, дым и брызги песка — инстансированные билборды с процедурным шейдером.
import * as THREE from 'three';

export class Particles {
  constructor(max, terrain) {
    this.max = max;
    this.terrain = terrain;
    this.count = 0;
    // CPU-состояние
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.size0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.alpha = new Float32Array(max); this.drag = new Float32Array(max);
    this.grav = new Float32Array(max); this.rot = new Float32Array(max); this.spin = new Float32Array(max);
    this.seed = new Float32Array(max);
    this.tr = new Float32Array(max); this.tg = new Float32Array(max); this.tb = new Float32Array(max);
    this.kind = new Uint8Array(max); // 0 — пыль, 1 — песчинки

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aData', this.aData);
    geo.setAttribute('aTint', this.aTint);
    geo.instanceCount = 0;
    this.geo = geo;

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3) },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.8) },
      uAmbient: { value: new THREE.Color(0.55, 0.5, 0.48) },
      uFogColor: { value: new THREE.Color() },
      uFogNear: { value: 100 },
      uFogFar: { value: 900 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 aPos;
        attribute vec4 aData;   // size, life01, seed, rot
        attribute vec4 aTint;   // rgb, alpha
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec4 vTint;
        varying float vLife;
        varying float vSeed;
        varying float vDepth;
        varying vec2 vSunUv;
        void main() {
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float c = cos(aData.w), s = sin(aData.w);
          vec2 p = position.xy;
          mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y) * aData.x;
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          vTint = aTint;
          vLife = aData.y;
          vSeed = aData.z;
          vDepth = -mv.z;
          // направление на солнце в экранной плоскости частицы (с учётом поворота)
          vec3 sv = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
          vec2 sd = normalize(sv.xy + 1e-4);
          vSunUv = vec2(c * sd.x + s * sd.y, -s * sd.x + c * sd.y);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunColor, uAmbient, uFogColor;
        uniform float uFogNear, uFogFar;
        varying vec2 vUv;
        varying vec4 vTint;
        varying float vLife;
        varying float vSeed;
        varying float vDepth;
        varying vec2 vSunUv;
        float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*vn(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
        void main() {
          vec2 q = vUv - 0.5;
          float d = length(q) * 2.0;
          float n = fbm(vUv * 3.2 + vSeed * 17.0 + vec2(0.0, vLife * 1.5));
          float n2 = fbm(vUv * 7.0 - vSeed * 9.0);
          float shape = 1.0 - smoothstep(0.25, 1.0, d + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.3);
          if (shape <= 0.002) discard;
          // объёмное освещение: сторона к солнцу светлее, плотные места темнее
          float lit = 0.62 + 0.38 * dot(normalize(q + 1e-4), vSunUv) * smoothstep(0.0, 0.8, d);
          lit *= mix(1.0, 0.82, shape * n);
          vec3 col = vTint.rgb * (uAmbient + uSunColor * lit);
          float a = shape * vTint.a;
          a *= smoothstep(0.0, 0.06, vLife) * pow(1.0 - vLife, 1.3);
          a *= smoothstep(0.6, 4.0, vDepth); // не закрывать камеру
          float fog = smoothstep(uFogNear, uFogFar, vDepth);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  emit(x, y, z, vx, vy, vz, size, grow, life, alpha, r, g, b, opts) {
    let i;
    if (this.count < this.max) i = this.count++;
    else i = Math.floor(Math.random() * this.max); // переиспользуем случайную
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.age[i] = 0; this.life[i] = life;
    this.size0[i] = size; this.grow[i] = grow;
    this.alpha[i] = alpha;
    this.drag[i] = opts?.drag ?? 1.6;
    this.grav[i] = opts?.grav ?? -0.25;
    this.kind[i] = opts?.kind ?? 0;
    this.rot[i] = Math.random() * Math.PI * 2;
    this.spin[i] = (Math.random() - 0.5) * 0.8;
    this.seed[i] = Math.random();
    this.tr[i] = r; this.tg[i] = g; this.tb[i] = b;
  }

  update(dt, wind) {
    const n = this.count;
    const P = this.aPos.array, D = this.aData.array, T = this.aTint.array;
    let w = 0;
    for (let i = 0; i < n; i++) {
      const age = this.age[i] + dt;
      if (age >= this.life[i]) continue;
      // компактизация: перенос в позицию w
      if (w !== i) this._move(i, w);
      this.age[w] = age;
      const k = Math.exp(-this.drag[w] * dt);
      this.vx[w] = this.vx[w] * k + wind.x * (1 - k);
      this.vz[w] = this.vz[w] * k + wind.z * (1 - k);
      this.vy[w] = this.vy[w] * k - this.grav[w] * 9.81 * dt;
      this.px[w] += this.vx[w] * dt;
      this.py[w] += this.vy[w] * dt;
      this.pz[w] += this.vz[w] * dt;
      const t = age / this.life[w];
      const size = this.size0[w] + this.grow[w] * Math.sqrt(t);
      const gy = this.terrain.gridHeight(this.px[w], this.pz[w]) + size * 0.22;
      if (this.py[w] < gy) {
        this.py[w] = gy;
        if (this.vy[w] < 0) this.vy[w] *= this.kind[w] === 1 ? -0.2 : 0;
      }
      this.rot[w] += this.spin[w] * dt;
      P[w * 3] = this.px[w]; P[w * 3 + 1] = this.py[w]; P[w * 3 + 2] = this.pz[w];
      D[w * 4] = size; D[w * 4 + 1] = t; D[w * 4 + 2] = this.seed[w]; D[w * 4 + 3] = this.rot[w];
      T[w * 4] = this.tr[w]; T[w * 4 + 1] = this.tg[w]; T[w * 4 + 2] = this.tb[w]; T[w * 4 + 3] = this.alpha[w];
      w++;
    }
    this.count = w;
    this.geo.instanceCount = w;
    this.aPos.needsUpdate = true;
    this.aData.needsUpdate = true;
    this.aTint.needsUpdate = true;
    this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, w * 3);
    this.aData.clearUpdateRanges(); this.aData.addUpdateRange(0, w * 4);
    this.aTint.clearUpdateRanges(); this.aTint.addUpdateRange(0, w * 4);
  }

  _move(i, w) {
    this.px[w] = this.px[i]; this.py[w] = this.py[i]; this.pz[w] = this.pz[i];
    this.vx[w] = this.vx[i]; this.vy[w] = this.vy[i]; this.vz[w] = this.vz[i];
    this.life[w] = this.life[i]; this.size0[w] = this.size0[i]; this.grow[w] = this.grow[i];
    this.alpha[w] = this.alpha[i]; this.drag[w] = this.drag[i]; this.grav[w] = this.grav[i];
    this.rot[w] = this.rot[i]; this.spin[w] = this.spin[i]; this.seed[w] = this.seed[i];
    this.tr[w] = this.tr[i]; this.tg[w] = this.tg[i]; this.tb[w] = this.tb[i];
    this.kind[w] = this.kind[i];
  }
}
