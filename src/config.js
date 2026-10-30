// Общие настройки мира и качества графики.

export const WORLD_SIZE = 1600;          // метров по стороне
export const HALF = WORLD_SIZE / 2;
export const SEED = 1337;

export const IS_MOBILE = typeof navigator !== "undefined" &&
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));

// Пресеты качества. «ПК» — ровно те настройки, что на компьютере.
export const PRESETS = {
  ultra: { label: 'ПК (макс.)', grid: 400, tracksRes: 4096, shadowMap: 2048, msaa: 4, particles: 4000, shrubs: 4200, maxPixelRatio: 1.75, bloom: true, sandLow: false },
  high: { label: 'Высокое', grid: 320, tracksRes: 4096, shadowMap: 2048, msaa: 2, particles: 3000, shrubs: 3000, maxPixelRatio: 1.5, bloom: true, sandLow: false },
  medium: { label: 'Среднее', grid: 256, tracksRes: 2048, shadowMap: 1024, msaa: 0, particles: 1800, shrubs: 1800, maxPixelRatio: 1.25, bloom: true, sandLow: true },
  low: { label: 'Низкое', grid: 200, tracksRes: 2048, shadowMap: 1024, msaa: 0, particles: 1000, shrubs: 900, maxPixelRatio: 0.9, bloom: false, sandLow: true },
};

export function load(key, def) {
  try { return localStorage.getItem(key) ?? def; } catch (e) { return def; }
}
export function save(key, v) {
  try { localStorage.setItem(key, v); } catch (e) { /* приватный режим */ }
}

// По умолчанию везде максимальное качество; на слабом устройстве его можно понизить в меню
export const QUALITY_NAME = PRESETS[load('dd_quality', 'ultra')] ? load('dd_quality', 'ultra') : 'ultra';
export const QUALITY = PRESETS[QUALITY_NAME];
// Автоснижение разрешения при низком FPS (по умолчанию выключено — картинка как на ПК)
export const AUTO_RES = load('dd_autores', '0') === '1';

// Направление ветра (по XZ), влияет на рябь песка, пыль и перекати-поле
export const WIND = { x: 0.86, z: 0.5, strength: 3.2 };
