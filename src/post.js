// Постобработка: MSAA, блум, тонмаппинг ACES, затем «плёночный» проход:
// марево от жары, радиальное размытие на импульсе, хроматическая аберрация, цветокор, виньетка, зерно.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { QUALITY } from './config.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uBoost: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uWarm: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uSpeed, uBoost, uWarm;
    uniform vec2 uRes;
    varying vec2 vUv;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 uv = vUv;
      // марево над дальним песком (верх кадра)
      float haze = smoothstep(0.5, 1.0, uv.y) * 0.0018;
      uv.x += sin(uv.y * 140.0 + uTime * 7.0) * haze;
      uv.y += cos(uv.x * 110.0 + uTime * 5.3) * haze * 0.5;

      vec2 c = uv - 0.5;
      float blur = uBoost * 0.035 + uSpeed * 0.01;
      vec3 col;
      if (blur > 0.002) {
        col = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          float t = float(i) / 7.0;
          col += texture2D(tDiffuse, 0.5 + c * (1.0 - blur * t * smoothstep(0.05, 0.5, length(c)))).rgb;
        }
        col /= 8.0;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      // хроматическая аберрация к краям
      float ca = (0.0012 + uBoost * 0.004) * length(c) * 2.0;
      col.r = mix(col.r, texture2D(tDiffuse, 0.5 + c * (1.0 + ca)).r, 0.7);
      col.b = mix(col.b, texture2D(tDiffuse, 0.5 + c * (1.0 - ca)).b, 0.7);

      // цветокоррекция: тёплые света, чуть голубоватые тени, контраст
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 warm = col * vec3(1.04, 1.0, 0.93);
      vec3 cool = col * vec3(0.94, 0.99, 1.06);
      col = mix(col, mix(cool, warm, smoothstep(0.15, 0.7, l)), 0.6 * uWarm);
      col = (col - 0.5) * 1.06 + 0.5;
      col = mix(vec3(l), col, 1.08);
      // виньетка
      float v = smoothstep(0.95, 0.3, length(c * vec2(1.0, 0.85)));
      col *= mix(0.72, 1.0, v);
      // зерно
      col += (h12(vUv * uRes + fract(uTime) * 100.0) - 0.5) * 0.025;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: QUALITY.msaa,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 0.88);
    if (QUALITY.bloom) this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * pr, h * pr);
  }

  render(dt, speedK, boostK) {
    const u = this.grade.uniforms;
    u.uTime.value += dt;
    u.uSpeed.value = speedK;
    u.uBoost.value += (boostK - u.uBoost.value) * Math.min(1, dt * 5);
    this.composer.render(dt);
  }
}
