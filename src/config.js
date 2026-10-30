// Общие настройки мира и качества графики.

export const WORLD_SIZE = 1600;          // метров по стороне
export const HALF = WORLD_SIZE / 2;
export const SEED = 1337;

export const IS_MOBILE = typeof navigator !== "undefined" &&
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));

export const QUALITY = IS_MOBILE
  ? {
      grid: 256,           // разрешение сетки рельефа
      tracksRes: 2048,     // текстура следов шин
      shadowMap: 1024,
      msaa: 0,
      particles: 1800,
      shrubs: 1800,
      maxPixelRatio: 1.25,
      bloom: true,
    }
  : {
      grid: 400,
      tracksRes: 4096,
      shadowMap: 2048,
      msaa: 4,
      particles: 4000,
      shrubs: 4200,
      maxPixelRatio: 1.75,
      bloom: true,
    };

// Направление ветра (по XZ), влияет на рябь песка, пыль и перекати-поле
export const WIND = { x: 0.86, z: 0.5, strength: 3.2 };
