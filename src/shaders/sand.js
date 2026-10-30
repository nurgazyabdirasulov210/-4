// Фрагменты GLSL, встраиваемые в MeshStandardMaterial рельефа.
// Рябь от ветра, сыпучие полосы песка, блёстки, укатанная трасса и следы шин.

export const SAND_COMMON = /* glsl */ `
uniform sampler2D uMask;
uniform sampler2D uTire;
uniform float uTime;
uniform float uWorld;
uniform float uMaskScale;
uniform float uMaskOffset;
uniform float uTireTexel;
uniform vec2 uWind;
uniform vec3 uSunDir;
uniform vec3 uSandA;
uniform vec3 uSandB;
uniform vec3 uSandC;
uniform vec3 uRoad;
varying vec3 vWPos;
varying vec3 vWNormal;

float sHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float sNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x),
             mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#ifdef SAND_LOW
#define SAND_OCT 3
#else
#define SAND_OCT 4
#endif
float sFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < SAND_OCT; i++) {
    s += a * sNoise(p);
    p = p * 2.07 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return s;
}
// Высота ряби: два масштаба волн поперёк ветра, искривлённые шумом
float rippleH(vec2 p, vec2 wd) {
  float a = dot(p, wd);
  float b = dot(p, vec2(-wd.y, wd.x));
  float warp = sNoise(p * 0.07) * 6.0 + sNoise(p * 0.23) * 1.6;
  float r1 = sin(a * 6.8 + b * 0.35 + warp * 2.2);
  float r2 = sin(a * 2.2 - b * 0.5 + warp);
  r1 = r1 * 0.5 + 0.5;
  r1 = r1 * r1;               // острые гребни, плоские впадины
  return r1 * 0.03 + (r2 * 0.5 + 0.5) * 0.055;
}
`;

export const SAND_FRAGMENT_COLOR = /* glsl */ `
vec2 sP = vWPos.xz;
float sDist = length(vWPos - cameraPosition);
vec4 sMask = texture2D(uMask, sP * uMaskScale + uMaskOffset);
vec2 sTuv = (sP + 0.5 * uWorld) / uWorld;
vec4 sTire = texture2D(uTire, sTuv);
float sSlope = 1.0 - clamp(normalize(vWNormal).y, 0.0, 1.0);
vec2 sWd = normalize(uWind);

float sBig = sFbm(sP * 0.011);
float sMid = sFbm(sP * 0.075);
vec3 sand = mix(uSandA, uSandB, smoothstep(0.32, 0.72, sBig));
sand = mix(sand, uSandC, smoothstep(0.04, 0.32, sSlope) * 0.5);
sand = mix(sand, uSandC, smoothstep(0.55, 0.8, sMid) * 0.22);
sand *= 0.93 + 0.14 * sMid;
sand *= mix(0.9, 1.05, smoothstep(-6.0, 20.0, vWPos.y));

// Сдуваемый ветром песок: светлые полосы, ползущие по поверхности
vec2 sSp = vec2(dot(sP, sWd), dot(sP, vec2(-sWd.y, sWd.x)));
float sStreak = sNoise(vec2(sSp.x * 0.045 - uTime * 0.55, sSp.y * 0.42))
              * sNoise(vec2(sSp.x * 0.12 - uTime * 1.2, sSp.y * 0.85 + 3.0));
float sRoad = sMask.r;
sand = mix(sand, uSandB * 1.1, smoothstep(0.3, 0.68, sStreak) * 0.25 * (1.0 - sRoad));

// Укатанная трасса и колеи
vec3 roadCol = uRoad * (0.86 + 0.22 * sNoise(sP * 0.55) + 0.08 * sNoise(sP * 3.0));
sand = mix(sand, roadCol, sRoad * 0.82);
sand = mix(sand, uSandC * 0.92, sMask.b * 0.3);
// Утоптанная площадка лагеря
sand = mix(sand, uRoad * 1.06 * (0.9 + 0.2 * sNoise(sP * 0.3)), sMask.g * 0.5);

// Следы шин: R — колея, G — взрыхлённый песок
float sGroove = sTire.r;
float sScuff = sTire.g;
sand = mix(sand, sand * vec3(0.84, 0.77, 0.7), clamp(sScuff * 0.7, 0.0, 1.0));
sand *= 1.0 - sGroove * 0.32;

diffuseColor.rgb = sand;
float sandRough = mix(0.96, 0.84, sRoad) - sGroove * 0.08;
float sRipAmt = (1.0 - smoothstep(45.0, 240.0, sDist))
  * (1.0 - sRoad * 0.92)
  * (1.0 - clamp(sGroove + sScuff, 0.0, 1.0) * 0.9)
  * (1.0 - smoothstep(0.22, 0.6, sSlope) * 0.75)
  * (1.0 - sMask.g * 0.75);
`;

export const SAND_FRAGMENT_NORMAL = /* glsl */ `
vec3 sNW = normalize(vWNormal);
{
  vec2 g = vec2(0.0);
  if (sRipAmt > 0.01) {
    float e = 0.05;
    float h0 = rippleH(sP, sWd);
    g += vec2(rippleH(sP + vec2(e, 0.0), sWd) - h0, rippleH(sP + vec2(0.0, e), sWd) - h0) / e * sRipAmt;
  }
  // Углубление колеи
  float tx = uTireTexel;
  float gx = texture2D(uTire, sTuv + vec2(tx, 0.0)).r - texture2D(uTire, sTuv - vec2(tx, 0.0)).r;
  float gz = texture2D(uTire, sTuv + vec2(0.0, tx)).r - texture2D(uTire, sTuv - vec2(0.0, tx)).r;
  float tw = uWorld * tx;
  g += -vec2(gx, gz) / (2.0 * tw) * 0.09;
  #ifndef SAND_LOW
  // Мелкие бугорки
  float e2 = 0.5;
  float m0 = sNoise(sP * 0.33);
  g += vec2(sNoise((sP + vec2(e2, 0.0)) * 0.33) - m0, sNoise((sP + vec2(0.0, e2)) * 0.33) - m0) / e2 * 0.22 * (1.0 - sRoad * 0.6);
  #endif
  sNW = normalize(sNW - vec3(g.x, 0.0, g.y));
}
normal = normalize((viewMatrix * vec4(sNW, 0.0)).xyz);
`;

export const SAND_FRAGMENT_EMISSIVE = /* glsl */ `
{
  // Блёстки кварца на солнце
  vec2 cellP = floor(sP * 26.0);
  float h = sHash(cellP);
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 Hh = normalize(V + uSunDir);
  float spec = pow(max(dot(sNW, Hh), 0.0), 90.0);
  float flick = step(0.5, fract(h * 91.7 + dot(V.xz, vec2(3.1, 2.7)) * 3.0));
  float glint = step(0.993, h) * flick * spec * smoothstep(4.0, 10.0, sDist) * (1.0 - smoothstep(15.0, 45.0, sDist)) * (1.0 - sRoad);
  totalEmissiveRadiance += vec3(1.0, 0.92, 0.78) * glint * 2.2;
}
`;
