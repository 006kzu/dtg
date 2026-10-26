// The balloon: floaty physics, player contacts (bump / hit / kick) and hazard detection.
import * as THREE from 'three';
import { ROOM, toon } from './world.js';
import { PLAYER_RADIUS } from './player.js';

export const BALLOON_RADIUS = 0.65;
const GRAVITY = 3.2;
const DRAG = 0.55;
const MAX_SPEED = 32;

// Launch strengths
const BUMP_UP = 4.5;
const HIT_FWD = 7, HIT_UP = 10;
const KICK_FWD = 10, KICK_UP = 17;
const HIT_REACH = 1.8;
const KICK_REACH = 1.7;

export class Balloon {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 6, 0);
    this.vel = new THREE.Vector3();
    this.time = 0;
    this.frozen = true;
    this.buildMesh(scene);
  }

  buildMesh(scene) {
    const g = new THREE.Group();
    const skin = toon(0xff5cc8);
    const body = new THREE.Mesh(new THREE.SphereGeometry(BALLOON_RADIUS, 28, 20), skin);
    body.scale.set(1, 1.12, 1);
    body.castShadow = true;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    shine.position.set(-0.25, 0.32, 0.4);
    shine.scale.set(1, 1.5, 0.5);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 10), skin);
    knot.position.y = -BALLOON_RADIUS * 1.12 - 0.04;
    knot.rotation.x = Math.PI;
    g.add(body, shine, knot);
    this.stringPts = Array.from({ length: 8 }, () => new THREE.Vector3());
    this.string = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.stringPts), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.string.frustumCulled = false;
    this.mesh = g;
    scene.add(g, this.string);

    // landing marker so players can judge where the balloon is falling
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xff5cc8, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x3a2a5c, transparent: true, opacity: 0.35, depthWrite: false }));
    dot.rotation.x = -Math.PI / 2;
    this.marker = new THREE.Group();
    this.marker.add(ring, dot);
    this.markerRing = ring;
    scene.add(this.marker);

    // pop particles
    this.particles = [];
    const pgeo = new THREE.SphereGeometry(0.12, 6, 4);
    for (let i = 0; i < 30; i++) {
      const p = new THREE.Mesh(pgeo, toon(i % 3 ? 0xff5cc8 : 0xffde3b));
      p.visible = false;
      scene.add(p);
      this.particles.push({ mesh: p, vel: new THREE.Vector3(), life: 0 });
    }
  }

  reset(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.frozen = true;
    this.mesh.visible = this.string.visible = this.marker.visible = true;
  }

  release() {
    this.frozen = false;
    this.vel.set(0, 3, 0);
  }

  // Physics integration. Returns the name of whatever hazard it touched, or null.
  step(dt, colliders, detectHazards = true) {
    this.time += dt;
    if (this.frozen) return null;
    // gentle wandering breeze from the cafeteria vents
    const t = this.time;
    this.vel.x += (Math.sin(t * 0.37) + Math.sin(t * 0.91 + 1.3) * 0.5) * 0.45 * dt;
    this.vel.z += (Math.cos(t * 0.29 + 0.7) + Math.sin(t * 0.83) * 0.5) * 0.45 * dt;
    this.vel.y -= GRAVITY * dt;
    this.vel.multiplyScalar(Math.exp(-DRAG * dt));
    if (this.vel.length() > MAX_SPEED) this.vel.setLength(MAX_SPEED);
    this.pos.addScaledVector(this.vel, dt);
    if (!detectHazards) {
      // keep a non-authoritative copy inside the room
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, ROOM.minX + BALLOON_RADIUS, ROOM.maxX - BALLOON_RADIUS);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, ROOM.minZ + BALLOON_RADIUS, ROOM.maxZ - BALLOON_RADIUS);
      this.pos.y = THREE.MathUtils.clamp(this.pos.y, BALLOON_RADIUS, ROOM.height - BALLOON_RADIUS);
      return null;
    }
    return this.hazardAt(this.pos, colliders);
  }

  hazardAt(p, colliders) {
    const r = BALLOON_RADIUS;
    if (p.y - r <= 0) return 'the floor';
    if (p.y + r >= ROOM.height) return 'the ceiling';
    if (p.x - r <= ROOM.minX || p.x + r >= ROOM.maxX || p.z - r <= ROOM.minZ || p.z + r >= ROOM.maxZ) return 'the wall';
    for (const c of colliders) {
      const cx = THREE.MathUtils.clamp(p.x, c.min.x, c.max.x);
      const cy = THREE.MathUtils.clamp(p.y, c.min.y, c.max.y);
      const cz = THREE.MathUtils.clamp(p.z, c.min.z, c.max.z);
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      if (dx * dx + dy * dy + dz * dz < r * r * 0.85) return `a ${c.name}`;
    }
    return null;
  }

  // Check contact with a player. Returns {kind, vel} if the player touched the balloon (does not apply it).
  contact(player) {
    const b = this.pos;
    const facing = player.facing;

    if (player.kickTimer > 0 && !player.kickUsed) {
      // reach from foot up to hip, in front of the player
      const foot = player.pos.clone().addScaledVector(facing, 0.6); foot.y += 0.35;
      const hip = player.pos.clone().addScaledVector(facing, 0.3); hip.y += 1.0;
      if (distToSegment(b, foot, hip) < KICK_REACH) {
        player.kickUsed = true;
        const v = facing.clone().multiplyScalar(KICK_FWD);
        v.y = KICK_UP;
        v.x += player.vel.x * 0.3; v.z += player.vel.z * 0.3;
        return { kind: 'kick', vel: v };
      }
    }
    if (player.hitTimer > 0 && !player.hitUsed) {
      const hand = player.pos.clone().addScaledVector(facing, 0.5); hand.y += 1.6;
      const chest = player.pos.clone(); chest.y += 1.0;
      if (distToSegment(b, chest, hand) < HIT_REACH) {
        player.hitUsed = true;
        const v = facing.clone().multiplyScalar(HIT_FWD);
        v.y = HIT_UP;
        v.x += player.vel.x * 0.3; v.z += player.vel.z * 0.3;
        return { kind: 'hit', vel: v };
      }
    }
    // passive bump: balloon touching the body
    const a = player.pos.clone(); a.y += 0.4;
    const top = player.pos.clone(); top.y += 1.55;
    const closest = closestOnSegment(b, a, top);
    const d = b.distanceTo(closest);
    if (d < BALLOON_RADIUS + PLAYER_RADIUS && player.bumpCooldown <= 0) {
      const n = b.clone().sub(closest).normalize();
      if (!isFinite(n.x)) n.set(0, 1, 0);
      const rel = this.vel.clone().sub(player.vel);
      const v = this.vel.clone();
      const along = rel.dot(n);
      if (along < 0) v.addScaledVector(n, -1.6 * along);
      v.addScaledVector(n, 1.5);
      if (n.y > -0.2) v.y = Math.max(v.y, BUMP_UP + Math.max(0, player.vel.y) * 0.5);
      player.bumpCooldown = 0.3;
      return { kind: 'bump', vel: v, push: closest.addScaledVector(n, BALLOON_RADIUS + PLAYER_RADIUS + 0.02) };
    }
    return null;
  }

  applyTouch(t) {
    this.vel.copy(t.vel);
    if (t.push) this.pos.copy(t.push);
  }

  pop() {
    this.frozen = true;
    this.mesh.visible = this.string.visible = this.marker.visible = false;
    for (const p of this.particles) {
      p.mesh.visible = true;
      p.mesh.position.copy(this.pos);
      p.vel.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 8);
      p.life = 0.8 + Math.random() * 0.6;
    }
  }

  // Visual update: mesh, string, marker, particles.
  render(dt, colliders) {
    const wob = Math.sin(this.time * 3) * 0.04;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.z = THREE.MathUtils.clamp(-this.vel.x * 0.04, -0.4, 0.4) + wob;
    this.mesh.rotation.x = THREE.MathUtils.clamp(this.vel.z * 0.04, -0.4, 0.4);
    // dangling string trailing behind the motion
    const base = this.pos.clone(); base.y -= BALLOON_RADIUS * 1.12 + 0.1;
    for (let i = 0; i < this.stringPts.length; i++) {
      const f = i / (this.stringPts.length - 1);
      this.stringPts[i].set(
        base.x - this.vel.x * 0.06 * f * f + Math.sin(this.time * 4 + f * 5) * 0.06 * f,
        base.y - f * 1.3 + Math.max(0, -this.vel.y) * 0.05 * f * f,
        base.z - this.vel.z * 0.06 * f * f + Math.cos(this.time * 3.3 + f * 5) * 0.06 * f,
      );
    }
    this.string.geometry.setFromPoints(this.stringPts);

    // marker on the highest surface under the balloon
    let ground = 0;
    for (const c of colliders) {
      if (this.pos.x >= c.min.x && this.pos.x <= c.max.x && this.pos.z >= c.min.z && this.pos.z <= c.max.z && c.max.y <= this.pos.y && c.max.y > ground) ground = c.max.y;
    }
    this.marker.position.set(this.pos.x, ground + 0.03, this.pos.z);
    const h = this.pos.y - ground;
    const s = THREE.MathUtils.clamp(0.6 + h * 0.08, 0.6, 2.2);
    this.marker.scale.set(s, s, s);
    this.markerRing.material.color.set(h < 3 ? 0xff3030 : 0xff5cc8);

    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  serialize() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return [r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.vel.x), r(this.vel.y), r(this.vel.z), this.frozen ? 1 : 0, r(this.time)];
  }
}

function closestOnSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t);
}

function distToSegment(p, a, b) {
  return p.distanceTo(closestOnSegment(p, a, b));
}
