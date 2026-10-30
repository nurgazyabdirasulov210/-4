// Процедурная модель пикапа-внедорожника: кузов, стёкла, колёса, фары, дуга безопасности.
import * as THREE from 'three';

const shared = {};
function sharedMats() {
  if (shared.ready) return shared;
  shared.glass = new THREE.MeshPhysicalMaterial({
    color: 0x10161b, metalness: 0.1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6,
  });
  shared.trim = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.75, metalness: 0.1 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.18, metalness: 1.0 });
  shared.rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, metalness: 0 });
  shared.rim = new THREE.MeshStandardMaterial({ color: 0x8d939a, roughness: 0.32, metalness: 0.85 });
  shared.rimDark = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.5, metalness: 0.6 });
  shared.liner = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.9 });
  shared.plate = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
  shared.ready = true;
  return shared;
}

function extrudeSide(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildWheel(radius = 0.42, width = 0.33, side = 1) {
  const M = sharedMats();
  const spin = new THREE.Group();
  const prof = [];
  const hw = width / 2;
  const pts = [
    [radius * 0.64, -hw * 0.95], [radius * 0.93, -hw], [radius * 0.99, -hw * 0.75],
    [radius, -hw * 0.3], [radius, hw * 0.3], [radius * 0.99, hw * 0.75], [radius * 0.93, hw], [radius * 0.64, hw * 0.95],
  ];
  for (const [r, y] of pts) prof.push(new THREE.Vector2(r, y));
  const tireGeo = new THREE.LatheGeometry(prof, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, M.rubber);
  tire.castShadow = true;
  spin.add(tire);

  // Протектор: шашки по окружности
  const lugGeo = new THREE.BoxGeometry(width * 0.42, 0.05, 0.11);
  const lugs = new THREE.InstancedMesh(lugGeo, M.rubber, 36);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const off = (i % 2 ? 1 : -1) * width * 0.22;
    p.set(off, Math.cos(a) * (radius + 0.005), Math.sin(a) * (radius + 0.005));
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -a);
    m4.compose(p, q, s);
    lugs.setMatrixAt(i, m4);
  }
  lugs.castShadow = true;
  spin.add(lugs);

  const rimGeo = new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, width * 0.86, 22, 1, true);
  rimGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(rimGeo, M.rimDark));
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.63, 22), M.rimDark);
  face.rotation.y = side * Math.PI / 2;
  face.position.x = side * width * 0.3;
  spin.add(face);
  // Спицы
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, radius * 1.18, 0.07), M.rim);
    sp.rotation.x = (i / 6) * Math.PI;
    sp.position.x = side * width * 0.36;
    spin.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 12), M.chrome);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = side * width * 0.42;
  spin.add(hub);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.63, 0.018, 6, 28), M.rim);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = side * width * 0.4;
  spin.add(lip);
  return spin;
}

export function buildCarModel(color = 0xf4f4f2) {
  const M = sharedMats();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06,
  });

  // --- Нижняя часть кузова (боковой профиль) ---
  const s = new THREE.Shape();
  s.moveTo(-2.25, 0.52);
  s.lineTo(-2.25, 1.1);
  s.lineTo(1.18, 1.12);
  s.lineTo(2.08, 1.0);
  s.quadraticCurveTo(2.3, 0.97, 2.31, 0.78);
  s.lineTo(2.3, 0.48);
  s.lineTo(1.98, 0.42);
  s.absarc(1.4, 0.44, 0.57, 0, Math.PI, false);
  s.lineTo(-0.83, 0.42);
  s.absarc(-1.4, 0.44, 0.57, 0, Math.PI, false);
  s.lineTo(-2.25, 0.52);
  const lower = new THREE.Mesh(extrudeSide(s, 1.84, 0.06), paint);
  lower.castShadow = true;
  lower.receiveShadow = true;
  body.add(lower);

  // --- Кабина-стекло ---
  const g = new THREE.Shape();
  g.moveTo(-0.62, 1.12);
  g.lineTo(-0.55, 1.7);
  g.quadraticCurveTo(-0.5, 1.76, -0.4, 1.76);
  g.lineTo(0.42, 1.76);
  g.quadraticCurveTo(0.56, 1.75, 0.62, 1.68);
  g.lineTo(1.2, 1.12);
  g.lineTo(-0.62, 1.12);
  const glass = new THREE.Mesh(extrudeSide(g, 1.6, 0.04), M.glass);
  glass.castShadow = true;
  body.add(glass);
  // Крыша (окрашенная)
  const r = new THREE.Shape();
  r.moveTo(-0.6, 1.72);
  r.quadraticCurveTo(-0.55, 1.8, -0.42, 1.8);
  r.lineTo(0.44, 1.8);
  r.quadraticCurveTo(0.58, 1.79, 0.64, 1.71);
  r.lineTo(-0.6, 1.72);
  const roof = new THREE.Mesh(extrudeSide(r, 1.66, 0.03), paint);
  roof.castShadow = true;
  body.add(roof);
  // Стойки
  for (const sx of [-1, 1]) {
    const a = box(0.06, 0.66, 0.1, paint, sx * 0.83, 1.43, 0.93, body); a.rotation.x = -0.86;
    const b = box(0.06, 0.62, 0.12, paint, sx * 0.83, 1.42, -0.59, body); b.rotation.x = 0.12;
  }

  // Кузов-платформа: тёмное покрытие, борта
  box(1.72, 0.06, 1.55, M.liner, 0, 1.16, -1.43, body);
  for (const sx of [-1, 1]) box(0.08, 0.06, 1.62, M.trim, sx * 0.9, 1.2, -1.43, body);
  // Запаска в кузове
  const spare = buildWheel(0.36, 0.26, 1);
  spare.rotation.z = Math.PI / 2;
  spare.position.set(0, 1.3, -1.55);
  body.add(spare);

  // Дуга безопасности
  const barPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.85, 1.15, -0.7), new THREE.Vector3(-0.8, 1.9, -0.72),
    new THREE.Vector3(0, 1.97, -0.72), new THREE.Vector3(0.8, 1.9, -0.72), new THREE.Vector3(0.85, 1.15, -0.7),
  ]);
  const bar = new THREE.Mesh(new THREE.TubeGeometry(barPath, 24, 0.045, 8), M.trim);
  bar.castShadow = true;
  body.add(bar);

  // Люстра на крыше
  box(1.3, 0.09, 0.14, M.trim, 0, 1.86, 0.3, body);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 1.2 });
  for (let i = 0; i < 4; i++) box(0.2, 0.07, 0.03, lightMat, -0.45 + i * 0.3, 1.86, 0.38, body);

  // Бамперы, решётка, подножки
  box(2.02, 0.26, 0.26, M.trim, 0, 0.52, 2.3, body);
  box(2.0, 0.24, 0.22, M.trim, 0, 0.55, -2.3, body);
  box(1.18, 0.22, 0.05, M.trim, 0, 0.83, 2.33, body);
  for (let i = 0; i < 5; i++) box(1.1, 0.012, 0.02, M.chrome, 0, 0.75 + i * 0.04, 2.36, body);
  for (const sx of [-1, 1]) box(0.16, 0.05, 1.6, M.trim, sx * 1.02, 0.42, 0, body);
  // Защита днища / лебёдка
  box(0.9, 0.08, 0.3, M.chrome, 0, 0.4, 2.33, body);

  // Фары и фонари
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 2.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0.6 });
  for (const sx of [-1, 1]) {
    box(0.36, 0.15, 0.05, headMat, sx * 0.7, 0.86, 2.33, body);
    box(0.12, 0.3, 0.05, tailMat, sx * 0.84, 0.92, -2.33, body);
    // Зеркала
    box(0.2, 0.13, 0.08, paint, sx * 1.04, 1.25, 0.95, body);
    // Брызговики
    box(0.3, 0.26, 0.02, M.trim, sx * 0.86, 0.32, -1.98, body);
    // Расширители арок
    for (const az of [1.4, -1.4]) {
      const fl = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 18, Math.PI), M.trim);
      fl.rotation.y = Math.PI / 2;
      fl.position.set(sx * 0.98, 0.44, az);
      fl.castShadow = true;
      body.add(fl);
    }
  }
  box(0.5, 0.12, 0.02, M.plate, 0, 0.62, -2.42, body);

  // Колёса
  const wheelPos = [
    [0.9, 1.4], [-0.9, 1.4], // передние (лево, право)
    [0.9, -1.4], [-0.9, -1.4],
  ];
  const wheels = wheelPos.map(([x, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    const spin = buildWheel(0.42, 0.33, Math.sign(x));
    pivot.add(spin);
    root.add(pivot);
    return { pivot, spin, x, z, front: i < 2 };
  });

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, wheels, tailMat, headMat, paint };
}
