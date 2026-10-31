// Гараж и карты: каталог, кошелёк (очки дрифта = монеты), покупки и выбор.
// Всё хранится в localStorage; оплату реальными деньгами подключим позже на сервере.
import { load, save } from './config.js';

// power/force — мощность и тяга, mass — масса, grip — сцепление, boost — запас импульса, scale — размер модели
export const CARS = [
  { id: 'jeep', name: 'Пустынный джип', price: 0, desc: 'Сбалансированный, как раньше',
    paint: 0xf2f2ee, power: 1, force: 1, mass: 1, grip: 1, boost: 1, scale: 1 },
  { id: 'buggy', name: 'Багги', price: 1500, desc: 'Лёгкий и юркий, быстро разгоняется, но слабее держит дорогу',
    paint: 0xe8a628, power: 1.12, force: 1.18, mass: 0.78, grip: 0.97, boost: 1.1, scale: 0.9 },
  { id: 'pickup', name: 'Тяжёлый пикап', price: 3500, desc: 'Тяжёлый и мощный, держит скорость, зато неповоротлив',
    paint: 0x3f7a4a, power: 1.3, force: 1.12, mass: 1.25, grip: 1.04, boost: 0.9, scale: 1.08 },
  { id: 'rally', name: 'Ралли-монстр', price: 7000, desc: 'Мощный и цепкий, большой запас импульса',
    paint: 0xc8312a, power: 1.45, force: 1.35, mass: 1.0, grip: 1.1, boost: 1.4, scale: 1.0 },
  { id: 'phantom', name: 'Фантом', price: 15000, desc: 'Топ: максимум мощности и скорости',
    paint: 0x1b1d21, power: 1.75, force: 1.5, mass: 0.95, grip: 1.12, boost: 1.6, scale: 0.97 },
];

// tint — оттенок песка и неба (0 — без изменений, 1 — полностью цвет)
export const MAPS = [
  { id: 'dunes', name: 'Золотые дюны', price: 0, seed: 1337, desc: 'Классическая пустыня',
    sand: [0xd9a064, 0xe9b679, 0xb7773f], tint: 0xd2a473, k: 0 },
  { id: 'red', name: 'Красный каньон', price: 2500, seed: 4242, desc: 'Красный песок, другие барханы и другая трасса',
    sand: [0xc0613e, 0xd57a52, 0x8e3b25], tint: 0xc4694a, k: 0.45 },
  { id: 'white', name: 'Белые пески', price: 5000, seed: 90210, desc: 'Светлые барханы и холодное небо',
    sand: [0xe9e2d0, 0xf6f0e0, 0xbfb59a], tint: 0xe6e0d2, k: 0.5 },
  { id: 'night', name: 'Тёмная равнина', price: 9000, seed: 777, desc: 'Тёмный вулканический песок',
    sand: [0x5b5148, 0x7a6d60, 0x383029], tint: 0x6b5f55, k: 0.5 },
];

const getList = (key) => { try { return JSON.parse(load(key, '[]')) || []; } catch (e) { return []; } };

export const Wallet = {
  get earned() { return Number(load('dd_total', 0)) || 0; },
  get spent() { return Number(load('dd_spent', 0)) || 0; },
  get balance() { return Math.max(0, this.earned - this.spent); },
  spend(n) {
    if (this.balance < n) return false;
    save('dd_spent', String(this.spent + n));
    return true;
  },
};

export const owned = { cars: new Set(['jeep', ...getList('dd_cars')]), maps: new Set(['dunes', ...getList('dd_maps')]) };

export function buy(kind, item) {
  const set = owned[kind];
  if (set.has(item.id)) return true;
  if (!Wallet.spend(item.price)) return false;
  set.add(item.id);
  save(kind === 'cars' ? 'dd_cars' : 'dd_maps', JSON.stringify([...set]));
  return true;
}

export function selectedMap() {
  const id = load('dd_map', 'dunes');
  const m = MAPS.find((x) => x.id === id);
  return m && owned.maps.has(m.id) ? m : MAPS[0];
}
export function selectedCar() {
  const id = load('dd_car', 'jeep');
  const c = CARS.find((x) => x.id === id);
  return c && owned.cars.has(c.id) ? c : CARS[0];
}
