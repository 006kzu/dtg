// A cartoon lunch-kid: movement, jumping, collisions and hit/kick animation.
import * as THREE from 'three';
import { ROOM, toon } from './world.js';

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.7;
const SPEED = 9;
const GROUND_ACCEL = 70;
const AIR_ACCEL = 28;
const GRAVITY = 28;
const JUMP_VEL = 13.5;
const DOUBLE_JUMP_VEL = 12.5;
const WADE_SPEED = 0.7; // speed multiplier while wading through the floor water
const STEP_UP = 0.6;

export const HIT_WINDOW = 0.22;
export const KICK_WINDOW = 0.28;
const HIT_COOLDOWN = 0.4;
const KICK_COOLDOWN = 0.9;

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.roundRect(8, 6, 112, 46, 20); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 32px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.2, 0.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class Player {
  constructor(index, scene) {
    this.index = index;
    this.color = index === 0 ? 0xff4d5e : 0x3d8bff;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing angle; facing vector = (sin yaw, 0, cos yaw)
    this.grounded = false;
    this.jumps = 0;
    this.coyote = 0;
    this.hitTimer = 0; this.hitUsed = false; this.hitCooldown = 0;
    this.kickTimer = 0; this.kickUsed = false; this.kickCooldown = 0;
    this.bumpCooldown = 0;
    this.walkPhase = 0;
    this.events = []; // 'jump' | 'hit' | 'kick' for sounds
    // remote smoothing target
    this.netPos = new THREE.Vector3();
    this.netVel = new THREE.Vector3();
    this.netYaw = 0;
    this.buildMesh(scene);
  }

  buildMesh(scene) {
    const body = toon(this.color);
    const skin = toon(0xffd2a6);
    const dark = toon(0x2d2440);
    const root = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.5, 6, 14), body);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), skin);
    head.position.y = 1.55;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), body);
    cap.position.y = 1.6;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16, 1, false, 0, Math.PI), body);
    brim.position.set(0, 1.62, 0.18);
    brim.rotation.y = -Math.PI / 2;
    const eyeGeo = new THREE.SphereGeometry(0.06, 10, 8);
    const eyeL = new THREE.Mesh(eyeGeo, dark); eyeL.position.set(-0.12, 1.56, 0.3);
    const eyeR = new THREE.Mesh(eyeGeo, dark); eyeR.position.set(0.12, 1.56, 0.3);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12, Math.PI), dark);
    smile.position.set(0, 1.46, 0.31); smile.rotation.z = Math.PI;

    const limb = (len, r, mat) => {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
      m.position.y = -len / 2 - r * 0.5;
      m.castShadow = true;
      pivot.add(m);
      return pivot;
    };
    this.armL = limb(0.42, 0.1, skin); this.armL.position.set(-0.46, 1.2, 0);
    this.armR = limb(0.42, 0.1, skin); this.armR.position.set(0.46, 1.2, 0);
    this.legL = limb(0.42, 0.13, dark); this.legL.position.set(-0.18, 0.62, 0);
    this.legR = limb(0.42, 0.13, dark); this.legR.position.set(0.18, 0.62, 0);

    for (const m of [torso, head, cap, brim]) { m.castShadow = true; }
    root.add(torso, head, cap, brim, eyeL, eyeR, smile, this.armL, this.armR, this.legL, this.legR);
    this.tag = nameTag(`P${this.index + 1}`, this.index === 0 ? '#ff4d5e' : '#3d8bff');
    this.tag.position.y = 2.35;
    root.add(this.tag);
    this.mesh = root;
    scene.add(root);
  }

  reset(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.netPos.copy(this.pos); this.netVel.set(0, 0, 0); this.netYaw = yaw;
    this.grounded = true; this.jumps = 0;
    this.hitTimer = this.kickTimer = 0;
  }

  get facing() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  // input: {x, y, jump, hit, kick}; camFwd: horizontal unit vector the camera looks along
  update(dt, input, camFwd, colliders) {
    const right = new THREE.Vector3(-camFwd.z, 0, camFwd.x);
    const wish = new THREE.Vector3().addScaledVector(right, input.x).addScaledVector(camFwd, input.y);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.05) {
      wish.normalize();
      const target = Math.atan2(wish.x, wish.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 14);
    }
    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const speed = this.grounded && this.pos.y <= 0.01 ? SPEED * WADE_SPEED : SPEED;
    const tx = wish.x * speed * wishLen, tz = wish.z * speed * wishLen;
    this.vel.x += THREE.MathUtils.clamp(tx - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += THREE.MathUtils.clamp(tz - this.vel.z, -accel * dt, accel * dt);

    // jumping (double jump allowed)
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    if (input.jump) {
      if (this.grounded || this.coyote > 0) {
        this.vel.y = JUMP_VEL; this.jumps = 1; this.coyote = 0; this.events.push('jump');
      } else if (this.jumps < 2) {
        this.vel.y = DOUBLE_JUMP_VEL; this.jumps = 2; this.events.push('jump');
      }
    }
    this.vel.y -= GRAVITY * dt;

    // actions
    this.hitCooldown -= dt; this.kickCooldown -= dt; this.bumpCooldown -= dt;
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.kickTimer = Math.max(0, this.kickTimer - dt);
    if (input.hit && this.hitCooldown <= 0) this.startHit();
    if (input.kick && this.kickCooldown <= 0) this.startKick();

    this.move(dt, colliders);
    this.animate(dt);
  }

  startHit() {
    this.hitTimer = HIT_WINDOW; this.hitUsed = false; this.hitCooldown = HIT_COOLDOWN; this.events.push('hit');
  }

  startKick() {
    this.kickTimer = KICK_WINDOW; this.kickUsed = false; this.kickCooldown = KICK_COOLDOWN; this.events.push('kick');
  }

  overlaps(c, p) {
    return p.x + PLAYER_RADIUS > c.min.x && p.x - PLAYER_RADIUS < c.max.x &&
      p.z + PLAYER_RADIUS > c.min.z && p.z - PLAYER_RADIUS < c.max.z &&
      p.y + PLAYER_HEIGHT > c.min.y && p.y < c.max.y;
  }

  move(dt, colliders) {
    const p = this.pos;
    // horizontal axes, with automatic step-up onto low ledges (stairs, benches)
    for (const axis of ['x', 'z']) {
      const delta = this.vel[axis] * dt;
      if (!delta) continue;
      p[axis] += delta;
      for (const c of colliders) {
        if (!this.overlaps(c, p)) continue;
        const stepH = c.max.y - p.y;
        if (stepH <= STEP_UP && (this.grounded || this.vel.y <= 0)) {
          const test = p.clone(); test.y = c.max.y + 0.001;
          if (!colliders.some((o) => o !== c && this.overlaps(o, test))) { p.y = test.y; continue; }
        }
        if (delta > 0) p[axis] = c.min[axis] - PLAYER_RADIUS - 0.001;
        else p[axis] = c.max[axis] + PLAYER_RADIUS + 0.001;
        this.vel[axis] = 0;
      }
    }
    // vertical
    const wasGrounded = this.grounded;
    this.grounded = false;
    p.y += this.vel.y * dt;
    for (const c of colliders) {
      if (!this.overlaps(c, p)) continue;
      if (this.vel.y <= 0) { p.y = c.max.y; this.grounded = true; this.jumps = 0; }
      else p.y = c.min.y - PLAYER_HEIGHT - 0.001;
      this.vel.y = 0;
    }
    if (p.y <= 0) { p.y = 0; this.vel.y = 0; this.grounded = true; this.jumps = 0; }
    // stay glued when walking down small steps
    if (!this.grounded && wasGrounded && this.vel.y <= 0) {
      const test = p.clone(); test.y -= STEP_UP;
      for (const c of colliders) {
        if (this.overlaps(c, test) && c.max.y <= p.y + 0.001) { p.y = c.max.y; this.grounded = true; this.vel.y = 0; break; }
      }
    }
    // room walls & ceiling
    p.x = THREE.MathUtils.clamp(p.x, ROOM.minX + PLAYER_RADIUS, ROOM.maxX - PLAYER_RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.minZ + PLAYER_RADIUS, ROOM.maxZ - PLAYER_RADIUS);
    if (p.y + PLAYER_HEIGHT > ROOM.height) { p.y = ROOM.height - PLAYER_HEIGHT; this.vel.y = Math.min(0, this.vel.y); }
  }

  // Smoothly follow state received from the network.
  updateRemote(dt) {
    this.netPos.addScaledVector(this.netVel, dt);
    if (this.netPos.y < 0) this.netPos.y = 0;
    const k = 1 - Math.exp(-dt * 15);
    if (this.pos.distanceTo(this.netPos) > 6) this.pos.copy(this.netPos);
    else this.pos.lerp(this.netPos, k);
    this.vel.copy(this.netVel);
    let d = this.netYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * k;
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.kickTimer = Math.max(0, this.kickTimer - dt);
    this.bumpCooldown -= dt;
    this.animate(dt);
  }

  animate(dt) {
    const m = this.mesh;
    m.position.copy(this.pos);
    m.rotation.y = this.yaw;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded) this.walkPhase += dt * speed * 1.6;
    const swing = this.grounded ? Math.sin(this.walkPhase) * Math.min(1, speed / SPEED) * 0.8 : 0.3;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    if (!this.grounded) { this.armL.rotation.z = -0.9; this.armR.rotation.z = 0.9; }
    else { this.armL.rotation.z = 0; this.armR.rotation.z = 0; }
    if (this.hitTimer > 0) {
      const t = 1 - this.hitTimer / HIT_WINDOW;
      // both arms swing up overhead
      const a = -Math.PI * (0.4 + 0.6 * Math.sin(t * Math.PI));
      this.armL.rotation.x = a; this.armR.rotation.x = a;
      this.armL.rotation.z = 0; this.armR.rotation.z = 0;
    }
    if (this.kickTimer > 0) {
      const t = 1 - this.kickTimer / KICK_WINDOW;
      this.legR.rotation.x = -Math.PI * 0.75 * Math.sin(t * Math.PI);
      this.legL.rotation.x = 0.3;
    }
    // squash on landing / stretch in air
    const sy = this.grounded ? 1 : 1 + THREE.MathUtils.clamp(this.vel.y * 0.01, -0.08, 0.08);
    m.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  }

  // compact network state
  serialize() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return [r(this.pos.x), r(this.pos.y), r(this.pos.z), r(this.vel.x), r(this.vel.y), r(this.vel.z), r(this.yaw), this.grounded ? 1 : 0];
  }

  applyNet(s) {
    this.netPos.set(s[0], s[1], s[2]);
    this.netVel.set(s[3], s[4], s[5]);
    this.netYaw = s[6];
    this.grounded = !!s[7];
  }
}
