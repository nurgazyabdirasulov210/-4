// Следы шин: отрезки рисуются в мировую текстуру (render target) с MAX-смешиванием.
import * as THREE from 'three';
import { WORLD_SIZE, HALF, QUALITY } from './config.js';

const MAX_STAMPS = 1024;

export class TireTracks {
  constructor(renderer) {
    this.renderer = renderer;
    this.res = Math.min(QUALITY.tracksRes, renderer.capabilities.maxTextureSize || 4096);
    this.rt = new THREE.WebGLRenderTarget(this.res, this.res, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });
    this.texture = this.rt.texture;

    this.camera = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, -10, 10);
    this.camera.position.set(0, 0, 5);
    this.scene = new THREE.Scene();

    const geo = new THREE.PlaneGeometry(1, 1);
    this.strength = new THREE.InstancedBufferAttribute(new Float32Array(MAX_STAMPS * 2), 2);
    geo.setAttribute('aStrength', this.strength);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec2 aStrength;
        varying vec2 vUv;
        varying vec2 vS;
        void main() {
          vUv = uv;
          vS = aStrength;
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec2 vS;
        void main() {
          float across = abs(vUv.y - 0.5) * 2.0;
          float core = 1.0 - smoothstep(0.35, 1.0, across);
          float rim = smoothstep(0.55, 0.85, across) * (1.0 - smoothstep(0.85, 1.0, across));
          gl_FragColor = vec4(vS.x * core, max(vS.y * (1.0 - across * across), rim * vS.x * 0.6), 0.0, 1.0);
        }`,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_STAMPS);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
    this.count = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1);

    this.clear();
  }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const cc = r.getClearColor(new THREE.Color());
    const ca = r.getClearAlpha();
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
  }

  // Отрезок следа в мировых координатах XZ
  addSegment(x0, z0, x1, z1, width, groove, scuff) {
    if (this.count >= MAX_STAMPS) this.update();
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    // В текстуре: X = мир X, Y = мир Z
    this._p.set((x0 + x1) / 2, (z0 + z1) / 2, 0);
    this._q.setFromAxisAngle(this._z, Math.atan2(dz, dx));
    const minW = WORLD_SIZE / this.res * 1.6;
    this._s.set(len + width * 0.5, Math.max(width, minW), 1);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(this.count, this._m);
    this.strength.setXY(this.count, groove, scuff);
    this.count++;
  }

  // Заранее накатанные колеи вдоль трассы и старые следы по пустыне
  prepaint(track, noise) {
    const hw = track.width / 2;
    for (const lane of [-hw * 0.55, -hw * 0.38, hw * 0.38, hw * 0.55, -hw * 0.1, hw * 0.12]) {
      const strong = Math.abs(lane) > hw * 0.3 ? 0.55 : 0.3;
      for (let i = 0; i < track.count; i++) {
        const a = track.point(i), b = track.point(i + 1), da = track.dir(i), db = track.dir(i + 1);
        const wob = (k) => 0.6 * noise.noise(k * 0.05, lane);
        const ax = a.x + da.z * (lane + wob(i)), az = a.z - da.x * (lane + wob(i));
        const bx = b.x + db.z * (lane + wob(i + 1)), bz = b.z - db.x * (lane + wob(i + 1));
        this.addSegment(ax, az, bx, bz, 0.6, strong * (0.7 + 0.3 * noise.noise(i * 0.1, lane * 3)), 0.15);
      }
    }
    // Петляющие следы джипов из лагеря
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let t = 0; t < 14; t++) {
      let x = (rnd() - 0.5) * 60, z = (rnd() - 0.5) * 60;
      let ang = rnd() * Math.PI * 2;
      const len = 300 + rnd() * 500;
      for (let s = 0; s < len; s += 2) {
        ang += noise.noise(s * 0.01 + t * 10, t) * 0.06;
        const nx = x + Math.sin(ang) * 2, nz = z + Math.cos(ang) * 2;
        if (Math.abs(nx) > HALF - 60 || Math.abs(nz) > HALF - 60) break;
        const c = Math.cos(ang), sn = Math.sin(ang);
        for (const side of [-0.85, 0.85]) {
          this.addSegment(x + c * side, z - sn * side, nx + c * side, nz - sn * side, 0.55, 0.35, 0.05);
        }
        x = nx; z = nz;
      }
    }
    this.update();
  }

  update() {
    if (this.count === 0) return;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.strength.needsUpdate = true;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    r.autoClear = ac;
    this.count = 0;
  }
}
