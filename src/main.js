import * as THREE from 'three';
import { buildWorld, ROOM } from './world.js';
import { Player } from './player.js';
import { Balloon } from './balloon.js';
import { pollPlayer, startPressed, endFrame, ONLINE_KEYS } from './input.js';
import { Net } from './net.js';
import { sfx, unlockAudio } from './audio.js';

// ---------- Renderer & scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1530);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x8a6a9a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-12, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const { colliders } = buildWorld(scene);
const players = [new Player(0, scene), new Player(1, scene)];
const balloon = new Balloon(scene);

// ---------- Cameras: third-person rigs that keep the balloon in view ----------
class CamRig {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.1, 200);
    this.dir = new THREE.Vector3(0, 0, -1);
    this.pos = new THREE.Vector3(0, 5, 10);
    this.look = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
  }

  update(dt, player, snap = false) {
    const toB = new THREE.Vector3(balloon.pos.x - player.pos.x, 0, balloon.pos.z - player.pos.z);
    if (toB.length() > 1.5 && balloon.mesh.visible) {
      toB.normalize();
      this.dir.lerp(toB, snap ? 1 : 1 - Math.exp(-dt * 2.5)).normalize();
    }
    const head = player.pos.clone(); head.y += 1.5;
    const rise = THREE.MathUtils.clamp(balloon.pos.y - head.y, -6, 20);
    const desired = head.clone().addScaledVector(this.dir, -7.5);
    desired.y += 2.4 - Math.max(0, rise) * 0.08 + Math.max(0, -rise) * 0.4;
    desired.x = THREE.MathUtils.clamp(desired.x, ROOM.minX + 0.4, ROOM.maxX - 0.4);
    desired.z = THREE.MathUtils.clamp(desired.z, ROOM.minZ + 0.4, ROOM.maxZ - 0.4);
    desired.y = THREE.MathUtils.clamp(desired.y, 0.6, ROOM.height - 0.4);
    const lookAt = balloon.mesh.visible ? head.clone().lerp(balloon.pos, 0.45) : head;
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    this.pos.lerp(desired, k);
    this.look.lerp(lookAt, k);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    this.fwd.set(this.look.x - this.pos.x, 0, this.look.z - this.pos.z);
    if (this.fwd.lengthSq() < 1e-4) this.fwd.copy(this.dir);
    this.fwd.normalize();
  }
}
const rigs = [new CamRig(), new CamRig()];
const attractCam = new THREE.PerspectiveCamera(55, 1, 0.1, 200);

// ---------- Game state ----------
const SPAWNS = [[-3, -3.5], [3, -3.5]];
const BALLOON_SPAWN = [0, 8, -3.5];
const COUNTDOWN = 3;
const SEND_RATE = 1 / 30;

const state = {
  mode: 'menu', // menu | local | host | guest
  phase: 'menu', // menu | lobby | countdown | play | over
  score: 0,
  mult: 1,
  lastToucher: -1,
  time: 0,
  countdown: 0,
};
let net = null;
let sendTimer = 0;
let guestGrace = 0; // after the guest touches the balloon, trust the local prediction for a moment
const hostBalloon = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), fresh: false };
let best = Number(safeGet('dtg-best') || 0);

// players simulated on THIS computer
function localPlayers() {
  if (state.mode === 'local') return [0, 1];
  if (state.mode === 'host') return [0];
  if (state.mode === 'guest') return [1];
  return [];
}
const authoritative = () => state.mode === 'local' || state.mode === 'host';
const online = () => state.mode === 'host' || state.mode === 'guest';

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  overlay: $('overlay'), menu: $('menu'), lobby: $('lobby'), result: $('result'), status: $('status'),
  code: $('code-big'), hint: $('hint'), startBtn: $('btn-start'), score: $('score'), combo: $('combo'),
  timer: $('timer'), toast: $('toast'), best: $('best'), divider: $('divider'), p1: $('p1-stat'), p2: $('p2-stat'),
  netStat: $('net-stat'), scoreBox: $('score-box'),
};

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

function showMenu() {
  ui.overlay.classList.add('show');
  ui.menu.hidden = false;
  ui.lobby.hidden = true;
  ui.best.textContent = best ? `Best score on this computer: ${best}` : '';
}

function showLobby({ result = '', status = '', code = '', hint = '', canStart = false } = {}) {
  ui.overlay.classList.add('show');
  ui.menu.hidden = true;
  ui.lobby.hidden = false;
  ui.result.textContent = result;
  ui.status.textContent = status;
  ui.code.textContent = code;
  ui.hint.textContent = hint;
  ui.startBtn.hidden = !canStart;
  ui.best.textContent = best ? `Best score on this computer: ${best}` : '';
}

function hideOverlay() { ui.overlay.classList.remove('show'); }

let toastTimer = 0;
function toast(text, secs = 0.9) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  toastTimer = secs;
}

function updateHud() {
  ui.score.textContent = state.score;
  ui.combo.textContent = state.mult > 1 ? `COMBO x${state.mult}` : '';
  ui.timer.textContent = `${state.time.toFixed(1)}s`;
  const inGame = state.phase !== 'menu';
  ui.scoreBox.style.display = inGame ? '' : 'none';
  ui.divider.style.display = state.mode === 'local' ? '' : 'none';
  if (state.mode === 'host') { ui.p1.lastChild.textContent = 'P1 (you)'; ui.p2.lastChild.textContent = net?.connected ? 'P2 (friend)' : 'P2 (waiting…)'; }
  else if (state.mode === 'guest') { ui.p1.lastChild.textContent = 'P1 (friend)'; ui.p2.lastChild.textContent = 'P2 (you)'; }
  else { ui.p1.lastChild.textContent = 'P1'; ui.p2.lastChild.textContent = 'P2'; }
  ui.p1.style.display = ui.p2.style.display = inGame ? '' : 'none';
  ui.netStat.textContent = online() && net?.connected ? `ping ${Math.round(net.rtt * 1000)} ms` : '';
}

// ---------- Round flow ----------
function resetRound() {
  state.score = 0; state.mult = 1; state.lastToucher = -1; state.time = 0;
  state.countdown = COUNTDOWN;
  state.phase = 'countdown';
  for (const i of localPlayers()) players[i].reset(SPAWNS[i][0], SPAWNS[i][1], Math.PI);
  balloon.reset(...BALLOON_SPAWN);
  for (const i of localPlayers()) rigs[i].update(0, players[i], true);
  hideOverlay();
  lastCount = -1;
}

function startGame() {
  if (state.mode === 'host') {
    if (!net.connected) return;
    net.send({ t: 'start' });
  }
  resetRound();
}

function registerTouch(who, kind, playSound = true) {
  if (state.lastToucher === -1 || state.lastToucher === who) state.mult = 1;
  else state.mult = Math.min(5, state.mult + 1);
  state.lastToucher = who;
  state.score += state.mult;
  ui.score.classList.remove('bump'); void ui.score.offsetWidth; ui.score.classList.add('bump');
  if (playSound) sfx[kind]();
  if (state.mult > 1) sfx.combo(state.mult);
  if (kind === 'kick') toast('KICK!', 0.6);
  else if (kind === 'hit' && state.mult >= 3) toast(`x${state.mult}!`, 0.5);
}

function endRound(reason) {
  if (state.phase !== 'play') return;
  state.phase = 'over';
  balloon.pop();
  sfx.pop();
  toast('POP!', 1.2);
  if (state.score > best) { best = state.score; safeSet('dtg-best', String(best)); }
  if (state.mode === 'host') net.send({ t: 'pop', reason, score: state.score, time: state.time });
  setTimeout(() => {
    if (state.phase !== 'over') return;
    const result = `It touched ${reason}! ${state.score} point${state.score === 1 ? '' : 's'} in ${state.time.toFixed(1)}s`;
    if (state.mode === 'guest') showLobby({ result, status: 'Waiting for the host to start another round…' });
    else showLobby({ result, status: 'Ready for another round?', canStart: true });
  }, 1400);
}

// ---------- Networking ----------
function setupNet(asHost, code) {
  net = new Net();
  net.onStatus = (msg) => {
    if (state.phase !== 'lobby' && state.phase !== 'over') return;
    if (asHost) showLobby({ status: net.connected ? 'Your friend joined!' : 'Send this room code to your friend:', code: net.code && !net.connected ? net.code : '', hint: net.connected ? 'Press Start when you are both ready.' : msg.startsWith('Room code') ? 'Waiting for them to join…' : msg, canStart: net.connected });
    else showLobby({ status: msg, hint: net.connected ? 'Waiting for the host to start the game…' : '' });
  };
  net.onConnected = () => {
    players[asHost ? 1 : 0].mesh.visible = true;
    sfx.combo(3);
  };
  net.onDisconnected = () => {
    players[asHost ? 1 : 0].mesh.visible = false;
    state.phase = 'lobby';
    balloon.reset(...BALLOON_SPAWN);
    if (asHost) showLobby({ status: 'Your friend disconnected. They can rejoin with code:', code: net.code, hint: 'Waiting for them to join…' });
    else showLobby({ status: 'Lost connection to the host.', hint: 'Go back to the menu and join again.' });
  };
  net.onMessage = asHost ? onHostMessage : onGuestMessage;
  state.phase = 'lobby';
  if (asHost) net.host(); else net.join(code);
}

function onHostMessage(msg) {
  const remote = players[1];
  if (msg.t === 'p') remote.applyNet(msg.p);
  else if (msg.t === 'act') { if (msg.kind === 'hit') remote.startHit(); else if (msg.kind === 'kick') remote.startKick(); remote.events.length = 0; }
  else if (msg.t === 'touch' && state.phase === 'play' && !balloon.frozen) {
    // trust the guest's view of the touch so it feels instant for them
    balloon.vel.fromArray(msg.vel);
    if (msg.push) balloon.pos.fromArray(msg.push);
    registerTouch(1, msg.kind);
  }
}

function onGuestMessage(msg) {
  if (msg.t === 's') {
    players[0].applyNet(msg.p);
    const b = msg.b;
    hostBalloon.pos.set(b[0], b[1], b[2]).addScaledVector(new THREE.Vector3(b[3], b[4], b[5]), net.rtt / 2);
    hostBalloon.vel.set(b[3], b[4], b[5]);
    hostBalloon.fresh = true;
    balloon.time = b[7] + net.rtt / 2;
    if (b[6] && !balloon.frozen && state.phase !== 'over') { balloon.frozen = true; }
    if (b[6]) balloon.pos.set(b[0], b[1], b[2]);
    if (msg.ph === 'play' && state.phase === 'countdown') { balloon.frozen = false; state.phase = 'play'; }
    if (state.phase === 'play' || state.phase === 'countdown') { state.time = msg.tm; state.countdown = msg.cd; }
    if (msg.sc !== state.score) { if (msg.sc > state.score) { ui.score.classList.remove('bump'); void ui.score.offsetWidth; ui.score.classList.add('bump'); } state.score = msg.sc; }
    state.mult = msg.m;
  } else if (msg.t === 'act') {
    if (msg.kind === 'hit') players[0].startHit(); else if (msg.kind === 'kick') players[0].startKick();
    players[0].events.length = 0;
  } else if (msg.t === 'ev') {
    if (msg.who === 0) { sfx[msg.kind](); if (msg.mult > 1) sfx.combo(msg.mult); if (msg.kind === 'kick') toast('KICK!', 0.6); }
  } else if (msg.t === 'start') {
    resetRound();
  } else if (msg.t === 'pop') {
    state.phase = 'play';
    state.score = msg.score; state.time = msg.time;
    balloon.pos.copy(hostBalloon.pos);
    endRound(msg.reason);
  }
}

function sendSnapshots() {
  if (!net?.connected) return;
  if (state.mode === 'host') {
    net.send({ t: 's', p: players[0].serialize(), b: balloon.serialize(), sc: state.score, m: state.mult, tm: state.time, ph: state.phase, cd: state.countdown });
  } else {
    net.send({ t: 'p', p: players[1].serialize() });
  }
}

// ---------- Menu wiring ----------
$('btn-host').onclick = () => { unlockAudio(); state.mode = 'host'; players[1].mesh.visible = false; setupNet(true); };
$('btn-join').onclick = () => {
  const code = $('join-code').value.trim();
  if (code.length < 4) { $('join-code').focus(); return; }
  unlockAudio(); state.mode = 'guest'; players[0].mesh.visible = false; setupNet(false, code);
};
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });
$('btn-local').onclick = () => { unlockAudio(); state.mode = 'local'; players[0].mesh.visible = players[1].mesh.visible = true; startGame(); };
$('btn-start').onclick = () => { unlockAudio(); startGame(); };
$('btn-leave').onclick = () => {
  if (net) net.close();
  net = null;
  state.mode = 'menu'; state.phase = 'menu';
  players[0].mesh.visible = players[1].mesh.visible = true;
  balloon.reset(...BALLOON_SPAWN);
  showMenu();
};
showMenu();
if (import.meta.env.DEV) window.__dtg = { players, balloon, state, colliders };

// ---------- Main loop ----------
let last = performance.now();
let lastCount = -1;
const SUBSTEP = 1 / 120;

function frame(now, fromWorker = false) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (startPressed() && ui.overlay.classList.contains('show') && !ui.startBtn.hidden && !ui.lobby.hidden) { unlockAudio(); startGame(); }

  const mine = localPlayers();
  const active = state.phase === 'countdown' || state.phase === 'play' || state.phase === 'over';
  const inputs = {};
  for (const i of mine) {
    inputs[i] = state.mode === 'local' ? pollPlayer(i, i) : pollPlayer(ONLINE_KEYS, 0);
  }

  if (active) {
    // countdown
    if (state.phase === 'countdown') {
      if (authoritative()) state.countdown -= dt;
      const n = Math.ceil(state.countdown);
      if (n !== lastCount && n > 0) { toast(String(n), 0.8); sfx.count(false); lastCount = n; }
      if (authoritative() && state.countdown <= 0) {
        state.phase = 'play';
        balloon.release();
        toast('GO!', 0.7); sfx.count(true);
      }
    }
    if (state.mode === 'guest' && state.phase === 'play' && lastCount !== 0) { toast('GO!', 0.7); sfx.count(true); lastCount = 0; }
    if (state.phase === 'play' && authoritative()) state.time += dt;

    // physics in small substeps so nothing tunnels through thin platforms
    const steps = Math.ceil(dt / SUBSTEP);
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (const i of mine) {
        const inp = s === 0 ? inputs[i] : { ...inputs[i], jump: false, hit: false, kick: false };
        players[i].update(h, inp, rigs[i].fwd, colliders);
      }
      const hazard = balloon.step(h, colliders, authoritative() && state.phase === 'play');
      if (hazard) { endRound(hazard); break; }

      if (state.phase === 'play' && !balloon.frozen) {
        for (const i of mine) {
          const touch = balloon.contact(players[i]);
          if (!touch) continue;
          balloon.applyTouch(touch);
          if (authoritative()) {
            registerTouch(i, touch.kind);
            if (state.mode === 'host') net.send({ t: 'ev', who: 0, kind: touch.kind, mult: state.mult });
          } else {
            sfx[touch.kind]();
            if (touch.kind === 'kick') toast('KICK!', 0.6);
            guestGrace = 0.35 + net.rtt;
            net.send({ t: 'touch', kind: touch.kind, vel: touch.vel.toArray(), push: touch.push ? touch.push.toArray() : null });
          }
        }
      }
    }

    // guest: steer the local balloon toward the host's authoritative one
    if (state.mode === 'guest') {
      guestGrace -= dt;
      hostBalloon.pos.addScaledVector(hostBalloon.vel, dt);
      if (guestGrace <= 0 && hostBalloon.fresh && !balloon.frozen) {
        balloon.vel.copy(hostBalloon.vel);
        if (balloon.pos.distanceTo(hostBalloon.pos) > 5) balloon.pos.copy(hostBalloon.pos);
        else balloon.pos.lerp(hostBalloon.pos, 1 - Math.exp(-dt * 8));
      }
    }

    // sounds + action broadcasts for players on this computer
    for (const i of mine) {
      for (const ev of players[i].events) {
        if (ev === 'jump') sfx.jump();
        if (online() && (ev === 'hit' || ev === 'kick')) net.send({ t: 'act', kind: ev });
      }
      players[i].events.length = 0;
    }
  }

  // remote player smoothing
  if (online()) {
    const r = state.mode === 'host' ? 1 : 0;
    players[r].updateRemote(dt);
    players[r].events.length = 0;
  }

  balloon.render(dt, colliders);

  // network send
  sendTimer += dt;
  if (online() && sendTimer >= SEND_RATE) { sendTimer = 0; sendSnapshots(); }

  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }
  updateHud();
  render(dt, now);
  endFrame();
  if (!fromWorker) requestAnimationFrame(frame);
}

// Browsers pause requestAnimationFrame in background tabs. In online games keep simulating
// from a worker timer so your friend's game doesn't freeze when you alt-tab.
const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'], { type: 'text/javascript' })));
ticker.onmessage = () => { if (document.hidden && online()) frame(performance.now(), true); };

function render(dt, now) {
  const w = window.innerWidth, h = window.innerHeight;
  const views = [];
  if (state.mode === 'local' && state.phase !== 'menu') {
    views.push({ rig: 0, x: 0, w: Math.floor(w / 2) }, { rig: 1, x: Math.ceil(w / 2), w: Math.floor(w / 2) });
  } else if (online() && state.phase !== 'lobby' && state.phase !== 'menu') {
    views.push({ rig: state.mode === 'host' ? 0 : 1, x: 0, w });
  }
  if (!views.length) {
    // attract mode: slow orbit around the lunch room
    const t = now * 0.00006;
    attractCam.position.set(Math.cos(t) * 24, 13, Math.sin(t) * 16);
    attractCam.lookAt(0, 5, 0);
    attractCam.aspect = w / h;
    attractCam.updateProjectionMatrix();
    renderer.setViewport(0, 0, w, h);
    renderer.setScissor(0, 0, w, h);
    renderer.render(scene, attractCam);
    return;
  }
  for (const v of views) {
    const rig = rigs[v.rig];
    rig.update(dt, players[v.rig]);
    // your own name tag would just block your view
    players.forEach((p, i) => { p.tag.visible = i !== v.rig; });
    rig.cam.aspect = v.w / h;
    rig.cam.updateProjectionMatrix();
    renderer.setViewport(v.x, 0, v.w, h);
    renderer.setScissor(v.x, 0, v.w, h);
    renderer.render(scene, rig.cam);
  }
}

function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); }
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
