// Процедурные текстуры на canvas: доски, гофрометалл, ржавчина, травяные кусты, баннеры.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function tex(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

function grain(ctx, w, h, amount, rnd) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function planksTexture(seed = 3, base = [138, 104, 72]) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const k = 0.75 + rnd() * 0.4;
    g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
    g.fillRect(0, r * 32, 256, 32);
    // волокна
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(40,25,15,${0.08 + rnd() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      const y = r * 32 + rnd() * 32;
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + rnd() * 4 - 2, 170, y + rnd() * 4 - 2, 256, y + rnd() * 2 - 1);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,18,10,0.65)';
    g.fillRect(0, r * 32, 256, 2);
    // гвозди
    g.fillStyle = 'rgba(40,40,40,0.8)';
    for (const x of [12, 244]) { g.beginPath(); g.arc(x, r * 32 + 16, 2, 0, 7); g.fill(); }
  }
  // выгоревшие пятна
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(230,210,180,${rnd() * 0.12})`;
    g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, 20 + rnd() * 40, 8 + rnd() * 20, 0, 0, 7); g.fill();
  }
  grain(g, 256, 256, 22, rnd);
  return tex(c);
}

export function corrugatedTexture(seed = 5, rgb = [70, 120, 130], rust = 0.4) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.28)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.18)');
    grd.addColorStop(0.65, 'rgba(255,255,255,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 16, 256);
  }
  // ржавые потёки
  for (let i = 0; i < 40 * rust; i++) {
    const x = rnd() * 256, y = rnd() * 256;
    const grd = g.createLinearGradient(x, y, x, y + 40 + rnd() * 80);
    grd.addColorStop(0, `rgba(120,60,25,${0.5 * rnd() + 0.2})`);
    grd.addColorStop(1, 'rgba(120,60,25,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, 3 + rnd() * 8, 120);
  }
  // пыль снизу
  const dust = g.createLinearGradient(0, 180, 0, 256);
  dust.addColorStop(0, 'rgba(210,170,120,0)');
  dust.addColorStop(1, 'rgba(210,170,120,0.55)');
  g.fillStyle = dust;
  g.fillRect(0, 0, 256, 256);
  grain(g, 256, 256, 18, rnd);
  return tex(c);
}

export function shrubTexture(seed = 9) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x0 = 64 + (rnd() - 0.5) * 30;
    const ang = (rnd() - 0.5) * 1.9;
    const len = 40 + rnd() * 75;
    const x1 = x0 + Math.sin(ang) * len, y1 = 128 - Math.cos(ang) * len;
    const tone = 0.6 + rnd() * 0.5;
    const dry = rnd() < 0.6;
    g.strokeStyle = dry
      ? `rgb(${150 * tone | 0},${120 * tone | 0},${80 * tone | 0})`
      : `rgb(${120 * tone | 0},${118 * tone | 0},${70 * tone | 0})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(x0, 128);
    g.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 20, (128 + y1) / 2, x1, y1);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bannerTexture(text, bg = '#d8382b', fg = '#fff') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 128);
  // шахматка по краям
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      g.fillRect(i * 16, j * 32, 16, 32);
      g.fillRect(1024 - 128 + i * 16, j * 32, 16, 32);
    }
  }
  g.fillStyle = fg;
  g.font = 'bold 84px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function stripesTexture(a = '#e23b2e', b = '#f4f1ea', n = 6) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(0, (i * 64) / n, 64, 64 / n + 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
