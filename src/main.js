// Точка входа: сборка мира, игровой цикл, освещение, время суток, события.
import * as THREE from 'three';
import { QUALITY, QUALITY_NAME, PRESETS, AUTO_RES, save, IS_MOBILE, SEED, WIND } from './config.js';
import { setupApp, enterFullscreen } from './app.js';
import { Simplex2, clamp } from './noise.js';
import { Track } from './track.js';
import { Terrain } from './terrain.js';
import { TireTracks } from './tiretracks.js';
import { createSky } from './sky.js';
import { World } from './world.js';
import { Car, STYLES } from './car.js';
import { Bot } from './ai.js';
import { Particles } from './particles.js';
import { Effects } from './effects.js';
import { CameraRig } from './cameraRig.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { HUD, fmtTime } from './hud.js';
import { Race, DriftScore } from './race.js';

const PALETTES = {
  day: {
    sunDir: new THREE.Vector3(0.5, 0.62, 0.42).normalize(),
    sun: new THREE.Color(0xffeccc), sunI: 3.4,
    hemiSky: new THREE.Color(0xa9c4e2), hemiGround: new THREE.Color(0xc98e55), hemiI: 0.72,
    fog: new THREE.Color(0xe2bf8f), zenith: new THREE.Color(0x4a82c4), horizon: new THREE.Color(0xeacfa6),
    ground: new THREE.Color(0xd2a473), exposure: 0.92,
  },
  sunset: {
    sunDir: new THREE.Vector3(-0.82, 0.2, 0.36).normalize(),
    sun: new THREE.Color(0xffa25a), sunI: 2.8,
    hemiSky: new THREE.Color(0x8f9cc8), hemiGround: new THREE.Color(0xb7774a), hemiI: 0.85,
    fog: new THREE.Color(0xe0a679), zenith: new THREE.Color(0x2f4f8c), horizon: new THREE.Color(0xf5ab6a),
    ground: new THREE.Color(0xc98d62), exposure: 1.05,
  },
};

const loadingEl = document.getElementById('loading');
const playBtn = document.getElementById('play');
if (IS_MOBILE) document.body.classList.add('touch');
setupApp();

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  let pixelRatio = Math.min(devicePixelRatio, QUALITY.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 3500);

  loadingEl.textContent = 'Насыпаем барханы…';
  await nextFrame();
  const noise = new Simplex2(SEED);
  const track = new Track(noise);
  const terrain = new Terrain(noise, track);

  loadingEl.textContent = 'Рисуем песок и небо…';
  await nextFrame();
  const tireTracks = new TireTracks(renderer);
  tireTracks.prepaint(track, noise);
  scene.add(terrain.buildMesh(tireTracks));

  let pal = PALETTES.day;
  const sunDir = pal.sunDir.clone();
  const skyPal = { zenith: pal.zenith.clone(), horizon: pal.horizon.clone(), ground: pal.ground.clone(), sun: pal.sun.clone() };
  const sky = createSky(sunDir, skyPal);
  scene.add(sky);
  scene.fog = new THREE.Fog(pal.fog.clone(), 140, 1000);
  scene.background = pal.fog.clone();

  const hemi = new THREE.HemisphereLight(pal.hemiSky.clone(), pal.hemiGround.clone(), pal.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(pal.sun.clone(), pal.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 500;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // Карта окружения для отражений (металл, лак, стекло)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), sky.material);
  envScene.add(envSky);
  const groundDisk = new THREE.Mesh(new THREE.CircleGeometry(39, 24), new THREE.MeshBasicMaterial({ color: pal.ground }));
  groundDisk.rotation.x = -Math.PI / 2;
  groundDisk.position.y = -2;
  envScene.add(groundDisk);
  const rebuildEnv = () => {
    if (scene.environment) scene.environment.dispose();
    scene.environment = pmrem.fromScene(envScene, 0.02, 0.1, 100).texture;
  };
  rebuildEnv();

  loadingEl.textContent = 'Расставляем ветряки и трейлеры…';
  await nextFrame();
  const world = new World(scene, terrain, track, noise);

  const car = new Car(terrain, 0xf2f2ee);
  scene.add(car.mesh);
  car.reset(0, -12, Math.PI);
  let styleName = STYLES[localStorage.getItem('dd_style')] ? localStorage.getItem('dd_style') : 'arcade';
  car.tune = STYLES[styleName];

  const botDefs = [
    { color: 0x1f5fbf, hud: '#3b8cff', skill: 0.97 },
    { color: 0xd23a2a, hud: '#ff5a45', skill: 1.0 },
    { color: 0x2a2a2e, hud: '#bbbbbb', skill: 0.94 },
  ];
  const bots = botDefs.map((d, i) => {
    const b = new Bot(track, terrain, d.color, d.skill, Math.floor((i / botDefs.length) * track.count));
    b.hudColor = d.hud;
    scene.add(b.mesh);
    return b;
  });

  const particles = new Particles(QUALITY.particles, terrain);
  scene.add(particles.mesh);
  const effects = new Effects(particles, tireTracks, terrain);
  const race = new Race(scene, track, terrain);
  const drift = new DriftScore();
  const rig = new CameraRig(camera, terrain);
  rig.snap(car);
  const input = new Input();
  input.bindTouch(document.getElementById('touch'));
  const audio = new Audio();
  const post = new Post(renderer, scene, camera);
  post.setSize(innerWidth, innerHeight, pixelRatio);
  const hud = new HUD(track, [...terrain.sites, ...world.landmarks]);

  // Применение палитры времени суток
  let palName = 'day';
  const applyPalette = (p) => {
    sunDir.copy(p.sunDir);
    skyPal.zenith.copy(p.zenith); skyPal.horizon.copy(p.horizon); skyPal.ground.copy(p.ground); skyPal.sun.copy(p.sun);
    sun.color.copy(p.sun); sun.intensity = p.sunI;
    hemi.color.copy(p.hemiSky); hemi.groundColor.copy(p.hemiGround); hemi.intensity = p.hemiI;
    scene.fog.color.copy(p.fog);
    scene.background.copy(p.fog);
    groundDisk.material.color.copy(p.ground);
    renderer.toneMappingExposure = p.exposure;
    terrain.uniforms.uSunDir.value.copy(p.sunDir);
    particles.uniforms.uSunDir.value.copy(p.sunDir);
    particles.uniforms.uSunColor.value.copy(p.sun).multiplyScalar(p.sunI / 3.4);
    particles.uniforms.uAmbient.value.copy(p.hemiSky).lerp(p.hemiGround, 0.5).multiplyScalar(0.62 * p.hemiI);
    particles.uniforms.uFogColor.value.copy(p.fog);
    rebuildEnv();
  };
  applyPalette(pal);

  // Окно/ресайз
  const onResize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight, pixelRatio);
  };
  addEventListener('resize', onResize);

  // Обзор мышью
  let dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { dragging = true; lastX = e.clientX; } });
  addEventListener('pointerup', () => { dragging = false; });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    rig.orbit = clamp(rig.orbit - (e.clientX - lastX) * 0.006, -Math.PI, Math.PI);
    lastX = e.clientX;
  });

  // Прогресс игрока по трассе (для позиции в гонке)
  const prog = { idx: 0, laps: 0, reset: true };

  // Кнопки HUD
  const startRace = () => {
    if (race.active) { race.stop(bots); hud.toast('Свободная езда'); return; }
    race.start(car, bots);
    prog.reset = true;
    rig.snap(car);
    drift.reset();
    hud.toast('Гонка: 12 чекпоинтов, круги без конца', 'cyan');
  };
  const resetCar = () => {
    const h = car.heading;
    car.reset(car.pos.x, car.pos.z, h);
    drift.reset();
  };
  const toggleTime = () => {
    palName = palName === 'day' ? 'sunset' : 'day';
    pal = PALETTES[palName];
    applyPalette(pal);
    hud.toast(palName === 'day' ? 'День' : 'Закат');
  };
  const toggleSound = () => {
    audio.setEnabled(!audio.enabled);
    hud.toast(audio.enabled ? 'Звук включён' : 'Звук выключен');
  };
  const styleBtn = document.getElementById('btnStyle');
  const showStyle = () => { styleBtn.textContent = 'СТИЛЬ: ' + STYLES[styleName].label; };
  showStyle();
  const toggleStyle = () => {
    styleName = styleName === 'arcade' ? 'drift' : 'arcade';
    car.tune = STYLES[styleName];
    save('dd_style', styleName);
    showStyle();
    hud.toast(styleName === 'drift' ? 'ДРИФТ: задний привод, корма скользит — держи угол газом и рулём' : 'АРКАДА: устойчивое управление', 'cyan');
  };
  const nextCam = () => { rig.next(); hud.toast('Камера: ' + rig.modeName); };
  const bindBtn = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { fn(); e.currentTarget.blur(); });
  bindBtn('btnRace', startRace);
  bindBtn('btnStyle', toggleStyle);
  bindBtn('btnCam', nextCam);
  bindBtn('btnTime', toggleTime);
  bindBtn('btnSound', toggleSound);
  bindBtn('btnReset', resetCar);

  // Меню
  loadingEl.classList.add('hidden');
  playBtn.classList.remove('hidden');
  let running = false;
  let started = false;
  const menuEl = document.getElementById('menu');
  const start = () => {
    menuEl.classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    audio.init();
    if (IS_MOBILE) enterFullscreen();
    running = true;
    if (!started) hud.bigText('ПОЕХАЛИ!', 1000);
    started = true;
    clock.getDelta();
  };
  const openMenu = () => {
    running = false;
    playBtn.textContent = 'ПРОДОЛЖИТЬ';
    menuEl.classList.remove('hidden');
  };
  playBtn.addEventListener('click', start);
  addEventListener('keydown', (e) => {
    if (!running && (e.code === 'Enter' || e.code === 'Space')) start();
    else if (running && (e.code === 'Escape' || e.code === 'KeyP')) openMenu();
  });
  bindBtn('btnMenu', openMenu);

  // Настройки графики: смена пресета требует перезапуска (пересоздаются рельеф и текстуры)
  const qWrap = document.getElementById('quality');
  for (const [key, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'qbtn' + (key === QUALITY_NAME ? ' on' : '');
    b.textContent = p.label;
    b.addEventListener('click', () => {
      if (key === QUALITY_NAME) return;
      save('dd_quality', key);
      location.reload();
    });
    qWrap.appendChild(b);
  }
  const autoRes = document.getElementById('autoRes');
  autoRes.checked = AUTO_RES;
  let autoResOn = AUTO_RES;
  autoRes.addEventListener('change', () => {
    autoResOn = autoRes.checked;
    save('dd_autores', autoResOn ? '1' : '0');
    if (!autoResOn) { pixelRatio = Math.min(devicePixelRatio, QUALITY.maxPixelRatio); renderer.setPixelRatio(pixelRatio); onResize(); }
  });

  // Позиция в гонке: считаем пересечения линии старта
  const playerProgress = () => {
    if (prog.reset) { prog.idx = track.nearest(car.pos.x, car.pos.z).index; prog.laps = 0; prog.reset = false; }
    const n = track.nearest(car.pos.x, car.pos.z, prog.idx, 30).index;
    if (prog.idx > track.count * 0.8 && n < track.count * 0.2) prog.laps++;
    else if (prog.idx < track.count * 0.2 && n > track.count * 0.8) prog.laps--;
    prog.idx = n;
    return prog.laps * track.count + n;
  };

  // Игровой цикл
  const clock = new THREE.Clock();
  const STEP = 1 / 120;
  let acc = 0;
  let fpsT = 0, fpsN = 0;
  const windVel = { x: WIND.x * WIND.strength, z: WIND.z * WIND.strength };
  const zeroInput = { throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false, jump: false };
  let lastCount = -1;

  const frame = () => {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 20);

    // горячие клавиши
    if (input.consume('KeyC')) nextCam();
    if (input.consume('KeyV')) toggleStyle();
    if (input.consume('KeyT')) startRace();
    if (input.consume('KeyN')) toggleTime();
    if (input.consume('KeyM')) toggleSound();
    if (input.consume('KeyR')) resetCar();

    let inp = input.update(dt);
    if (!running || (race.active && race.countdown > 0)) inp = zeroInput;

    // Физика с фиксированным шагом
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 8) {
      car.step(STEP, inp);
      world.collideCar(car);
      inp.jump = false;
      acc -= STEP;
      steps++;
    }
    car.updateVisual();
    for (const b of bots) b.update(dt, car);

    // События машины
    for (const ev of car.events) {
      if (ev.type === 'land') {
        rig.addShake(Math.min(0.9, ev.strength * 0.05));
        audio.impact(ev.strength, 'land');
        effects.burst(car.pos.x, car.pos.y, car.pos.z, Math.min(40, 8 + ev.strength * 2), 3 + ev.strength * 0.3);
        if (ev.spin > 300) {
          const turns = Math.round(ev.spin / 180) * 180;
          drift.bonus(`ВРАЩЕНИЕ ${turns}°`, Math.round(turns * 2));
          hud.bigText(`${turns}°`, 900);
        }
        if (ev.air > 0.7) {
          const pts = Math.round(ev.air * 450);
          drift.bonus('ПОЛЁТ', pts);
          car.boost = Math.min(1, car.boost + 0.15);
        }
      } else if (ev.type === 'hit') {
        rig.addShake(Math.min(1, ev.strength * 0.06));
        audio.impact(ev.strength, 'hit');
        effects.burst(ev.x, car.pos.y, ev.z, 10, 3, [0.7, 0.5, 0.32], 8, [0.35, 0.28, 0.2]);
        if (ev.strength > 5) drift.fail();
      } else if (ev.type === 'jump') {
        audio.blip(320, 0.15, 0.08);
        effects.burst(car.pos.x, car.pos.y, car.pos.z, 12, 3);
      }
    }
    car.events.length = 0;
    for (const ev of world.events) {
      if (ev.type === 'smash') {
        audio.impact(ev.strength * 0.5, ev.obj === 'barrel' ? 'hit' : 'wood');
        const chip = ev.obj === 'barrel' ? [0.5, 0.15, 0.1] : ev.obj === 'tires' ? [0.05, 0.05, 0.05] : [0.35, 0.24, 0.14];
        effects.burst(ev.x, ev.y - 0.4, ev.z, 6, 2.5, [0.74, 0.52, 0.32], 10, chip);
        rig.addShake(0.12);
        if (ev.obj !== 'tumbleweed') drift.bonus('РАЗНОС', 25);
      }
    }
    world.events.length = 0;

    world.update(dt, car.pos);

    // Дрифт и гонка
    drift.update(dt, car);
    if (drift.active) car.boost = Math.min(1, car.boost + dt * 0.05 * drift.mult);
    for (const ev of drift.events) {
      if (ev.type === 'bank') hud.toast(`+${ev.pts.toLocaleString('ru-RU')} ДРИФТ <small>x${ev.mult}</small>`, 'good');
      else if (ev.type === 'fail') hud.toast(`ДРИФТ СОРВАН −${ev.pts.toLocaleString('ru-RU')}`, 'bad');
      else if (ev.type === 'bonus') hud.toast(`${ev.label} +${ev.pts}`, 'cyan');
    }
    drift.events.length = 0;

    if (race.active && race.countdown > 0) {
      const c = Math.ceil(race.countdown);
      if (c !== lastCount && c <= 3) { lastCount = c; hud.bigText(String(c), 800); audio.blip(520, 0.15); }
    }
    const rev = race.update(dt, car);
    if (race.active && race.countdown <= 0 && lastCount > 0) { lastCount = 0; hud.bigText('СТАРТ!', 900); audio.blip(1040, 0.3); }
    if (rev?.type === 'cp') { audio.blip(1180, 0.1); hud.toast('ЧЕКПОИНТ ' + fmtTime(race.time), 'cyan'); }
    if (rev?.type === 'lap') {
      audio.blip(880, 0.4);
      hud.bigText(rev.best ? 'РЕКОРД!' : 'КРУГ!', 1200);
      hud.toast(`Круг ${fmtTime(rev.time)}${rev.best ? ' — лучший!' : ''}`, 'good');
    }
    if (!race.active) lastCount = -1;
    let position = 1;
    if (race.active) {
      const pp = playerProgress();
      for (const b of bots) if (b.progress() > pp) position++;
    } else playerProgress();

    // Эффекты
    effects.car(car, dt);
    bots.forEach((b, i) => effects.bot(b, dt, i));
    effects.ambient(car.pos, dt);
    particles.uniforms.uTime.value += dt;
    particles.update(dt, windVel);
    tireTracks.update();
    terrain.uniforms.uTime.value += dt;
    sky.userData.uniforms.uTime.value += dt;

    // Камера, солнце следует за машиной (снап к текселю — без мерцания теней)
    rig.update(car, dt);
    if (!dragging) rig.orbit *= Math.exp(-2.5 * dt);
    sky.position.copy(camera.position);
    const texel = (sc.right - sc.left) / QUALITY.shadowMap;
    const tx = Math.round(car.pos.x / texel) * texel, tz = Math.round(car.pos.z / texel) * texel;
    sun.target.position.set(tx, car.pos.y, tz);
    sun.position.set(tx + sunDir.x * 250, car.pos.y + sunDir.y * 250, tz + sunDir.z * 250);

    audio.update(car, dt);
    hud.update(dt, car, drift, race, bots, rig, camera, { gear: audio.gear, position });

    post.render(dt, clamp(car.speed / 50, 0, 1), car.boosting ? 1 : 0);

    // Динамическое разрешение: держим ~60 FPS
    fpsT += dt; fpsN++;
    if (fpsT > 2 && !autoResOn) { fpsT = 0; fpsN = 0; }
    if (fpsT > 2) {
      const fps = fpsN / fpsT;
      let pr = pixelRatio;
      if (fps < 48) pr = Math.max(0.6, pixelRatio - 0.15);
      else if (fps > 58 && pixelRatio < Math.min(devicePixelRatio, QUALITY.maxPixelRatio)) pr = Math.min(Math.min(devicePixelRatio, QUALITY.maxPixelRatio), pixelRatio + 0.1);
      if (Math.abs(pr - pixelRatio) > 0.01) {
        pixelRatio = pr;
        renderer.setPixelRatio(pr);
        onResize();
      }
      fpsT = 0; fpsN = 0;
    }
  };
  frame();

  // для отладки из консоли
  window.__game = { car, world, terrain, race, drift, bots, rig, renderer, scene, camera, start, startRace, toggleTime, input };
}

boot().catch((e) => {
  console.error(e);
  loadingEl.textContent = 'Ошибка запуска: ' + e.message;
});
