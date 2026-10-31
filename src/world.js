// Builds the giant cartoon lunch room and returns its collision boxes.
import * as THREE from 'three';

export const ROOM = { minX: -30, maxX: 30, minZ: -22, maxZ: 22, height: 24 };

let gradientMap;
export function toon(color, extra = {}) {
  if (!gradientMap) {
    const data = new Uint8Array([90, 160, 225, 255]);
    gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradientMap.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildWorld(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Adds a box mesh. (x, z) is the center of the footprint, y is the BOTTOM.
  function box(x, y, z, sx, sy, sz, color, { collide = true, name = 'thing', shadow = true, mat } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat || toon(color));
    mesh.position.set(x, y + sy / 2, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push({
        min: new THREE.Vector3(x - sx / 2, y, z - sz / 2),
        max: new THREE.Vector3(x + sx / 2, y + sy, z + sz / 2),
        name,
      });
    }
    return mesh;
  }

  function cylinder(x, y, z, r, h, color, { collide = true, name = 'thing', segments = 20 } = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, segments), toon(color));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push({ min: new THREE.Vector3(x - r, y, z - r), max: new THREE.Vector3(x + r, y + h, z + r), name });
    }
    return mesh;
  }

  // ---------- Floor (flooded! the water is the only thing that pops the balloon) ----------
  const W = ROOM.maxX - ROOM.minX, D = ROOM.maxZ - ROOM.minZ, H = ROOM.height;
  const floorTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f4ead2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7fc8c0'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
    g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon(0xffffff, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const waterTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,170,255,.55)'; g.lineWidth = 6; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const x = (i * 97) % w, y = (i * 61) % h;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 18, y - 10, x + 36, y); g.stroke();
    }
  });
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(W / 8, D / 8);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon(0x5fc8ff, { map: waterTex, transparent: true, opacity: 0.72, emissive: 0x1a6fb0, emissiveIntensity: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  water.receiveShadow = true;
  group.add(water);

  // ---------- Walls & ceiling (the balloon bounces off them) ----------
  const wallTex = canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#ffd98a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffcb5c'; g.fillRect(0, h * 0.82, w, h * 0.18);
    g.fillStyle = '#e8a93a'; g.fillRect(0, h * 0.8, w, 8);
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  const wallMat = (rep) => { const t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(rep, 1); return toon(0xffffff, { map: t, side: THREE.BackSide }); };
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [
    wallMat(D / 8), wallMat(D / 8), toon(0xfff6e4, { side: THREE.BackSide }), toon(0x7a5a3a, { side: THREE.BackSide, visible: false }), wallMat(W / 8), wallMat(W / 8),
  ]);
  walls.position.y = H / 2;
  walls.receiveShadow = true;
  group.add(walls);

  // Windows on the left wall (decor)
  for (let z = -15; z <= 15; z += 10) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(6, 7), toon(0x9fe3ff, { emissive: 0x4fb0e0, emissiveIntensity: 0.5 }));
    win.position.set(ROOM.minX + 0.02, 12, z);
    win.rotation.y = Math.PI / 2;
    group.add(win);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 7.6), toon(0xffffff));
    frame.position.set(ROOM.minX + 0.01, 12, z);
    frame.rotation.y = Math.PI / 2;
    group.add(frame);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 7), toon(0xffffff));
    bar.position.set(ROOM.minX + 0.03, 12, z);
    bar.rotation.y = Math.PI / 2;
    group.add(bar);
  }

  // Posters on the front wall (decor)
  const posters = [
    ['TACO', 'TUESDAY!', '#ff7a2f'], ['NO', 'RUNNING', '#ff4d5e'], ['EAT YOUR', 'VEGGIES', '#4fbf5a'], ['PIZZA', 'FRIDAY', '#b45cff'],
  ];
  posters.forEach(([a, b, color], i) => {
    const tex = canvasTexture(256, 320, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.fillRect(12, 12, w - 24, h - 24);
      g.fillStyle = color; g.font = 'bold 54px Fredoka, sans-serif'; g.textAlign = 'center';
      g.fillText(a, w / 2, h * 0.42); g.fillText(b, w / 2, h * 0.68);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), toon(0xffffff, { map: tex }));
    p.position.set(-21 + i * 11, 10, ROOM.maxZ - 0.02);
    p.rotation.y = Math.PI;
    group.add(p);
  });

  // Big wall clock (decor) on the back wall
  const clockTex = canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 12; g.strokeStyle = '#3a2a5c'; g.stroke();
    g.fillStyle = '#3a2a5c';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(w / 2 + Math.cos(a) * 100 - 5, w / 2 + Math.sin(a) * 100 - 5, 10, 10); }
    g.lineCap = 'round'; g.lineWidth = 10; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2, 60); g.stroke();
    g.lineWidth = 14; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + 60, w / 2 + 10); g.stroke();
  });
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), toon(0xffffff, { map: clockTex, transparent: true }));
  clock.position.set(-4, 16, ROOM.minZ + 0.03);
  group.add(clock);

  // ---------- Lunch tables + benches ----------
  const tableColors = [0xff8fa3, 0x8fd3ff, 0xb6f08a, 0xffd36b];
  let ci = 0;
  for (const tz of [-8, 1, 10]) {
    for (const tx of [-17, -5, 7]) {
      const color = tableColors[ci++ % tableColors.length];
      box(tx, 0.82, tz, 6, 0.14, 2.2, color, { name: 'table' });
      // pedestal legs (visual) + one solid collider underneath so players can't walk "inside" the table
      box(tx - 2.3, 0, tz, 0.25, 0.82, 1.6, 0x666a80, { collide: false });
      box(tx + 2.3, 0, tz, 0.25, 0.82, 1.6, 0x666a80, { collide: false });
      colliders.push({ min: new THREE.Vector3(tx - 3, 0, tz - 1.1), max: new THREE.Vector3(tx + 3, 0.82, tz + 1.1), name: 'table' });
      for (const s of [-1, 1]) box(tx, 0, tz + s * 1.75, 6, 0.48, 0.6, 0x5b4a8a, { name: 'bench' });
      // lunch trays + food on top (visual)
      for (let k = -1; k <= 1; k += 2) {
        const tray = box(tx + k * 1.4, 0.96, tz + (k > 0 ? 0.4 : -0.4), 1.4, 0.06, 0.9, 0x6fa8dc, { collide: false });
        tray.castShadow = false;
        const food = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), toon([0xffb347, 0xff6961, 0x77dd77][(ci + k + 3) % 3]));
        food.position.set(tx + k * 1.4 - 0.3, 1.12, tz + (k > 0 ? 0.4 : -0.4));
        food.scale.y = 0.6;
        group.add(food);
        const milk = box(tx + k * 1.4 + 0.4, 0.99, tz + (k > 0 ? 0.4 : -0.4), 0.22, 0.32, 0.22, 0xffffff, { collide: false });
        milk.castShadow = false;
      }
    }
  }

  // ---------- Serving counter + kitchen shelves on the back wall ----------
  box(-6, 0, -19.5, 30, 1.15, 2.2, 0xc0c6d8, { name: 'serving counter' });
  box(-6, 1.15, -19.5, 30, 0.12, 2.3, 0x8a90a8, { name: 'serving counter' });
  // sneeze guard posts (visual)
  for (let x = -20; x <= 8; x += 7) box(x, 1.27, -18.6, 0.12, 1.2, 0.12, 0xd8dde8, { collide: false });
  // food pans (visual color pops)
  [0xffb347, 0x77dd77, 0xff6961, 0xfdfd96, 0xc69c6d, 0xff9ad5].forEach((c, i) => {
    const pan = box(-19 + i * 5, 1.27, -19.7, 3.4, 0.12, 1.4, c, { collide: false });
    pan.castShadow = false;
  });
  box(-15, 4, -21, 10, 0.4, 2, 0xa0714f, { name: 'kitchen shelf' });
  box(-2, 6.5, -21, 8, 0.4, 2, 0xa0714f, { name: 'kitchen shelf' });
  box(9, 9, -21, 6, 0.4, 2, 0xa0714f, { name: 'kitchen shelf' });
  // pots & cans on the shelves
  cylinder(-18, 4.4, -21.2, 0.7, 1.1, 0xb0b8c8, { name: 'giant pot' });
  cylinder(-1, 6.9, -21.2, 0.45, 0.9, 0xff4d5e, { name: 'soup can' });

  // ---------- Mezzanine balcony on the right side, with stairs ----------
  const balcY = 7;
  box(26, balcY - 0.6, 0, 8, 0.6, 44, 0xb98a5e, { name: 'balcony' });
  for (const z of [-18, -9, 0, 9]) box(22.6, 0, z, 0.8, balcY - 0.6, 0.8, 0xf2f2f2, { name: 'pillar' });
  // railing along balcony edge (low, players can hop it)
  box(22.15, balcY, -6, 0.15, 0.7, 32, 0xff7a2f, { name: 'railing' });
  // stairs up along the front wall, from x=9 to 22
  const steps = 13;
  for (let i = 0; i < steps; i++) {
    const h = ((i + 1) / steps) * balcY;
    box(9.5 + i, 0, 19.5, 1, h, 3, i % 2 ? 0xffd36b : 0xffc44d, { name: 'stairs' });
  }
  // vending machines on the balcony
  box(28.5, balcY, -14, 2, 3.4, 1.8, 0xff4d5e, { name: 'vending machine' });
  box(28.5, balcY, -10, 2, 3.4, 1.8, 0x3d8bff, { name: 'vending machine' });

  // ---------- Vending machines + trash cans on the floor ----------
  box(-28.6, 0, -16, 1.8, 3.6, 2.2, 0x4fbf5a, { name: 'vending machine' });
  box(-28.6, 0, 16, 1.8, 3.6, 2.2, 0xb45cff, { name: 'vending machine' });
  for (const [x, z] of [[-11, -4], [1, 5.5], [13, -3], [-23, 5], [16, 14]]) {
    cylinder(x, 0, z, 0.75, 1.4, 0x5d6b7a, { name: 'trash can' });
    cylinder(x, 1.4, z, 0.82, 0.12, 0x46525e, { name: 'trash can' });
  }

  // ---------- Giant juice boxes (pillars to climb) ----------
  function juiceBox(x, z, h, color, label) {
    const tex = canvasTexture(256, 256, (g, w, hh) => {
      g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, hh);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, hh / 2, 80, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a2a5c'; g.font = 'bold 44px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, w / 2, hh / 2);
    });
    const side = toon(0xffffff, { map: tex });
    const plain = toon(color);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, h, 2.2), [plain, plain, plain, plain, side, side]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push({ min: new THREE.Vector3(x - 1.5, 0, z - 1.1), max: new THREE.Vector3(x + 1.5, h, z + 1.1), name: 'juice box' });
    // little straw (visual only; short so it doesn't feel unfair)
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), toon(0xffffff));
    straw.position.set(x + 1, h + 0.3, z);
    group.add(straw);
  }
  juiceBox(-23, -6, 3, 0xff8a3d, 'OJ');
  juiceBox(-23, -12, 5.5, 0xb45cff, 'GRAPE');
  juiceBox(-16, -15, 8, 0xff4d5e, 'APPLE');
  juiceBox(15, 5, 4.5, 0x4fbf5a, 'LIME');
  juiceBox(-1, -14, 2.4, 0x3dc4ff, 'H2O');

  // ---------- Tray tower: spiral staircase of giant lunch trays ----------
  const tower = { x: 0, z: 15 };
  cylinder(tower.x, 0, tower.z, 0.6, 15, 0xd8dde8, { name: 'tray tower pole' });
  for (let i = 0; i < 11; i++) {
    const a = i * 1.05;
    const r = 2.6;
    const tx = tower.x + Math.cos(a) * r;
    const tz = tower.z + Math.sin(a) * r * 0.8;
    const y = 1.3 + i * 1.3;
    box(tx, y, tz, 2.6, 0.25, 2, [0x6fa8dc, 0xff8fa3, 0xb6f08a, 0xffd36b][i % 4], { name: 'giant tray' });
  }

  // ---------- Floating giant sandwiches (high-level stepping stones) ----------
  function sandwich(x, y, z, s = 1) {
    const sx = 3.2 * s, sz = 3.2 * s;
    box(x, y, z, sx, 0.35, sz, 0xe0a85a, { collide: false });
    box(x, y + 0.35, z, sx * 1.08, 0.12, sz * 1.08, 0x6cd36c, { name: 'floating sandwich', collide: false });
    box(x, y + 0.47, z, sx * 0.96, 0.18, sz * 0.96, 0xff6f61, { name: 'floating sandwich', collide: false });
    box(x, y + 0.65, z, sx * 1.02, 0.1, sz * 1.02, 0xffd84d, { name: 'floating sandwich', collide: false });
    box(x, y + 0.75, z, sx, 0.4, sz, 0xf2c178, { collide: false });
    colliders.push({ min: new THREE.Vector3(x - sx * 0.54, y, z - sz * 0.54), max: new THREE.Vector3(x + sx * 0.54, y + 1.15, z + sz * 0.54), name: 'floating sandwich' });
  }
  sandwich(-5, 14.5, 9);
  sandwich(-12, 12.5, 2);
  sandwich(-18, 10.5, -6);
  sandwich(6, 13, 4);
  sandwich(14, 11, -4);
  sandwich(20, 9.5, -14, 0.9);
  sandwich(-9, 9.5, -15, 0.9);

  // ---------- Floating pizza slices (thin, wide platforms) ----------
  function pizza(x, y, z, rot) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(-2.2, 4.4); shape.quadraticCurveTo(0, 5.2, 2.2, 4.4); shape.lineTo(0, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.3, -2.4);
    const mesh = new THREE.Mesh(geo, toon(0xffc94d));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    for (let k = 0; k < 3; k++) {
      const pep = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), toon(0xd9412b));
      pep.position.set(x + Math.cos(rot + k * 2) * 0.6, y + 0.33, z + Math.sin(rot + k * 2) * 0.6);
      group.add(pep);
    }
    colliders.push({ min: new THREE.Vector3(x - 1.6, y, z - 1.6), max: new THREE.Vector3(x + 1.6, y + 0.3, z + 1.6), name: 'floating pizza' });
  }
  pizza(-10, 5, -9, 0.3);
  pizza(10, 4.2, 12, 1.4);
  pizza(18, 6.5, 6, 2.2);
  pizza(-20, 7, 11, 0.8);

  // ---------- Left loft (y=10) with a long staircase along the front wall ----------
  const loftY = 10;
  box(-26, loftY - 0.6, 14, 8, 0.6, 16, 0x8fd3ff, { name: 'loft' });
  for (const z of [7, 13, 20]) box(-22.4, 0, z, 0.8, loftY - 0.6, 0.8, 0xf2f2f2, { name: 'pillar' });
  box(-21.85, loftY, 11, 0.15, 0.7, 10, 0x4fbf5a, { name: 'railing' });
  const leftSteps = 18;
  for (let i = 0; i < leftSteps; i++) {
    box(-4.5 - i, 0, 19.5, 1, ((i + 1) / leftSteps) * loftY, 3, i % 2 ? 0x8fd3ff : 0x6fc0f5, { name: 'stairs' });
  }

  // ---------- Upper deck above the right balcony (y=13) with stairs from the balcony ----------
  const deckY = 13;
  box(26.5, deckY - 0.5, 15, 7, 0.5, 14, 0xff8fa3, { name: 'upper deck' });
  for (const z of [9, 21]) box(23.4, balcY, z, 0.6, deckY - balcY - 0.5, 0.6, 0xf2f2f2, { name: 'pillar' });
  const deckSteps = 14;
  for (let i = 0; i < deckSteps; i++) {
    const h = ((i + 1) / deckSteps) * (deckY - balcY);
    box(28.6, balcY, -6 + i, 2.6, h, 1, i % 2 ? 0xff8fa3 : 0xff7a93, { name: 'stairs' });
  }

  // ---------- Milk crates: stepping stones out of the water ----------
  for (const [x, z, h] of [[1, -4.5, 1.2], [-11, 5.5, 1.2], [11.5, 6, 1.2], [-26, 0, 1.2], [1.5, 9, 2.4], [-13, -11.5, 1.2]]) {
    box(x, 0, z, 1.8, h, 1.8, 0x3d8bff, { name: 'milk crate' });
    box(x, h, z, 1.9, 0.1, 1.9, 0x2a6fd6, { name: 'milk crate', collide: false });
  }

  // ---------- Floating cookies: mid-level platforms linking the floor to the high spots ----------
  function cookie(x, y, z, r = 1.4) {
    cylinder(x, y, z, r, 0.4, 0xd9a35a, { name: 'floating cookie', segments: 24 });
    for (let k = 0; k < 4; k++) {
      const chip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0x5a3a22));
      chip.position.set(x + Math.cos(k * 1.7) * r * 0.55, y + 0.42, z + Math.sin(k * 1.7) * r * 0.55);
      chip.scale.y = 0.5;
      group.add(chip);
    }
  }
  cookie(-2, 4, 4);
  cookie(3, 7, -3);
  cookie(-6, 9.5, -5);
  cookie(9, 7.5, -10);
  cookie(-15, 6.5, 6);
  cookie(-21, 10, 1);
  cookie(12, 9.5, 14);
  cookie(-14, 15.5, 14, 1.6);
  cookie(4, 16, 12, 1.6);
  cookie(18, 15, 10);

  // ---------- Hanging ceiling lights (the balloon bounces off these too) ----------
  const lights = [];
  for (const x of [-18, -6, 6, 18]) {
    for (const z of [-11, 0, 11]) {
      const y = 19.5;
      const shade = box(x, y, z, 4, 0.5, 1.2, 0xffffff, { name: 'ceiling light', shadow: false, mat: toon(0xfffbe0, { emissive: 0xfff2a8, emissiveIntensity: 0.7 }) });
      lights.push(shade);
      box(x, y + 0.5, z, 0.08, H - y - 0.5, 0.08, 0x333333, { name: 'light cord', collide: false, shadow: false });
    }
  }

  return { colliders, group };
}
