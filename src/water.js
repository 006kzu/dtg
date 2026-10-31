// Water surface motion: a slowly drifting ripple texture plus expanding rings where players wade.
import * as THREE from 'three';

const POOL = 48;           // reusable ring meshes (no allocations while playing)
const SURFACE_Y = 0.08;    // just above the water plane
const WADE_SPACING = 0.9;  // meters walked between wake rings
const RING_LIFE = 1.1;

export class Water {
  constructor(scene, waterMesh) {
    this.map = waterMesh.material.map;
    this.time = 0;
    const geo = new THREE.RingGeometry(0.82, 1, 40);
    geo.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, size: 1, strength: 0 });
    }
    this.next = 0;
    this.trackers = new Map(); // player -> { last: Vector3, dist, wasIn }
  }

  // Spawn one expanding ring at (x, z).
  ring(x, z, size = 1.6, strength = 0.55, life = RING_LIFE) {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % POOL;
    r.mesh.position.set(x, SURFACE_Y, z);
    r.mesh.visible = true;
    r.life = r.max = life;
    r.size = size;
    r.strength = strength;
  }

  // A few staggered rings for landings and pops.
  splash(x, z, big = false) {
    const n = big ? 4 : 2;
    for (let i = 0; i < n; i++) this.ring(x, z, (big ? 3.2 : 2) + i * 0.9, 0.75 - i * 0.12, RING_LIFE + i * 0.25);
  }

  update(dt, players) {
    this.time += dt;
    // gentle drift of the ripple pattern
    this.map.offset.set(Math.sin(this.time * 0.15) * 0.3, this.time * 0.02);

    for (const p of players) {
      let t = this.trackers.get(p);
      if (!t) { t = { last: p.pos.clone(), dist: 0, wasIn: true }; this.trackers.set(p, t); }
      const inWater = p.pos.y <= 0.05;
      const dx = p.pos.x - t.last.x, dz = p.pos.z - t.last.z;
      const moved = Math.hypot(dx, dz);
      if (inWater && !t.wasIn) this.splash(p.pos.x, p.pos.z);
      else if (inWater && moved < 3) {
        // wake: rings trail the player as they move
        t.dist += moved;
        if (t.dist >= WADE_SPACING) { t.dist = 0; this.ring(p.pos.x, p.pos.z); }
      }
      t.wasIn = inWater;
      t.last.copy(p.pos);
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.max; // 0 -> 1 over the ring's life
      const s = 0.3 + r.size * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = r.strength * (1 - k);
      if (r.life <= 0) r.mesh.visible = false;
    }
  }
}
