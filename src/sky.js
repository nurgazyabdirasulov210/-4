// Небо: градиент, солнце с ореолом, пыльная дымка у горизонта, перистые облака.
import * as THREE from 'three';

export function createSky(sunDir, palette) {
  const uniforms = {
    uSunDir: { value: sunDir },
    uZenith: { value: palette.zenith },
    uHorizon: { value: palette.horizon },
    uGround: { value: palette.ground },
    uSunColor: { value: palette.sun },
    uTime: { value: 0 },
    uNight: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunColor;
      uniform float uTime;
      uniform float uNight;
      varying vec3 vDir;
      float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*vn(p); p = p*2.1 + 3.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        float t = pow(clamp(y, 0.0, 1.0), 0.45);
        vec3 col = mix(uHorizon, uZenith, t);
        // ниже горизонта — пыльная земляная дымка
        col = mix(col, uGround, smoothstep(0.02, -0.12, y));
        // ночь: звёзды с мерцанием и Млечный Путь
        if (uNight > 0.0 && y > -0.05) {
          vec3 sp = d * 320.0;
          vec3 cell = floor(sp);
          float h = h31(cell);
          float star = step(0.986, h) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5));
          float tw = 0.55 + 0.45 * sin(uTime * (2.0 + h * 4.0) + h * 90.0);
          float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.45, 0.82))) * 3.2, 2.0));
          float mw = band * smoothstep(0.35, 0.8, fbm(d.xz / (abs(d.y) + 0.35) * 5.0 + 11.0));
          vec3 night = vec3(1.0, 0.96, 0.9) * star * tw * (1.5 + h * 30.0 * step(0.997, h)) + vec3(0.32, 0.36, 0.52) * mw * 0.35;
          col += night * uNight * smoothstep(-0.03, 0.18, y);
        }
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        // ореол (рассеяние Ми) + диск (ночью — луна с мягким гало)
        col += uSunColor * (pow(sd, 6.0) * 0.25 * (1.0 - 0.85 * uNight) + pow(sd, 64.0) * 0.6 * (1.0 - 0.5 * uNight));
        col += uSunColor * smoothstep(mix(0.9994, 0.99965, uNight), mix(0.99975, 0.99985, uNight), sd) * mix(25.0, 9.0, uNight);
        // перистые облака
        if (y > 0.0) {
          vec2 cp = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
          float c = fbm(cp * vec2(1.0, 3.0));
          c = smoothstep(0.55, 0.85, c) * smoothstep(0.0, 0.25, y);
          vec3 cc = mix(vec3(1.0, 0.96, 0.9), uSunColor, 0.25) * (0.9 + pow(sd, 4.0) * 0.8) * (1.0 - 0.85 * uNight);
          col = mix(col, cc, c * 0.55);
        }
        // пыльная дымка у горизонта
        col = mix(col, uHorizon * 1.05, exp(-abs(y) * 14.0) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.uniforms = uniforms;
  return mesh;
}
