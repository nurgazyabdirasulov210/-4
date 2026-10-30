// Service worker: игра целиком кэшируется и работает без интернета.
// При обновлении игры поменяйте VERSION, чтобы телефоны скачали новые файлы.
const VERSION = 'dd-v3';
const FILES = [
  './',
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./lib/three/LICENSE",
  "./lib/three/addons/postprocessing/EffectComposer.js",
  "./lib/three/addons/postprocessing/MaskPass.js",
  "./lib/three/addons/postprocessing/OutputPass.js",
  "./lib/three/addons/postprocessing/Pass.js",
  "./lib/three/addons/postprocessing/RenderPass.js",
  "./lib/three/addons/postprocessing/ShaderPass.js",
  "./lib/three/addons/postprocessing/UnrealBloomPass.js",
  "./lib/three/addons/shaders/CopyShader.js",
  "./lib/three/addons/shaders/LuminosityHighPassShader.js",
  "./lib/three/addons/shaders/OutputShader.js",
  "./lib/three/addons/utils/BufferGeometryUtils.js",
  "./lib/three/three.module.min.js",
  "./manifest.webmanifest",
  "./src/ai.js",
  "./src/app.js",
  "./src/audio.js",
  "./src/cameraRig.js",
  "./src/car.js",
  "./src/carModel.js",
  "./src/config.js",
  "./src/effects.js",
  "./src/hud.js",
  "./src/input.js",
  "./src/main.js",
  "./src/noise.js",
  "./src/particles.js",
  "./src/post.js",
  "./src/race.js",
  "./src/shaders/sand.js",
  "./src/sky.js",
  "./src/terrain.js",
  "./src/textures.js",
  "./src/tiretracks.js",
  "./src/track.js",
  "./src/world.js",
  "./src/worldExtras.js",
  "./style.css",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Сначала сеть (чтобы сразу видеть обновления), без сети — из кэша
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
