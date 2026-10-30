// Приложение на телефоне: установка (PWA), офлайн-кэш, полноэкранный режим и горизонтальная ориентация.

let deferredPrompt = null;

const isStandalone = () =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function setupApp() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  const btn = document.getElementById('install');
  const hint = document.getElementById('installHint');
  if (isStandalone()) return;

  // Android / Chrome: системный диалог установки
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.classList.remove('hidden');
  });
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    btn.classList.add('hidden');
  });
  addEventListener('appinstalled', () => {
    btn.classList.add('hidden');
    hint.classList.add('hidden');
  });

  // iPhone: установка только через меню «Поделиться»
  if (isIOS()) {
    hint.innerHTML = 'Установить на iPhone: <b>Поделиться</b> → <b>На экран «Домой»</b>';
    hint.classList.remove('hidden');
  } else {
    // если браузер не прислал событие — подсказка через меню браузера
    setTimeout(() => {
      if (!deferredPrompt && !isStandalone()) {
        hint.innerHTML = 'Установить: меню браузера <b>⋮</b> → <b>Добавить на главный экран</b>';
        hint.classList.remove('hidden');
      }
    }, 2500);
  }
}

// Полный экран + горизонтальная ориентация (там, где браузер разрешает)
export async function enterFullscreen() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) { /* не поддерживается */ }
  try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* iOS не умеет */ }
}
