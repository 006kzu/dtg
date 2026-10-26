// Peer-to-peer online play over WebRTC (PeerJS). The free PeerJS cloud server is only
// used to introduce the two browsers; game data then flows directly between them.
import Peer from 'peerjs';

const PREFIX = 'dtg-balloon-lunchroom-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};
// Optional relay for networks that block direct connections (set in a .env file, see README).
if (import.meta.env.VITE_TURN_URL) {
  ICE.iceServers.push({
    urls: import.meta.env.VITE_TURN_URL.split(','),
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  });
}

// Dev/testing: open the game with ?local-net to connect two tabs on the same computer
// without WebRTC.
const LOCAL_NET = new URLSearchParams(location.search).has('local-net');

class TabPeer {
  constructor(id) {
    this.id = id || `tab-${Math.random().toString(36).slice(2)}`;
    this.handlers = {};
    this.bc = new BroadcastChannel('dtg-local-net');
    this.bc.onmessage = (e) => this.receive(e.data);
    setTimeout(() => this.emit('open', this.id), 50);
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...a) { this.handlers[ev] && this.handlers[ev](...a); }
  receive(m) {
    if (m.to !== this.id) return;
    if (m.kind === 'hello') {
      const conn = new TabConn(this, m.from);
      this.emit('connection', conn);
      this.bc.postMessage({ to: m.from, from: this.id, kind: 'welcome' });
      setTimeout(() => conn.emit('open'), 0);
    } else if (m.kind === 'welcome') {
      this.pending?.emit('open');
    } else if (m.kind === 'data') {
      this.conns?.[m.from]?.emit('data', m.msg);
    }
  }
  connect(remoteId) {
    const conn = new TabConn(this, remoteId);
    this.pending = conn;
    this.bc.postMessage({ to: remoteId, from: this.id, kind: 'hello' });
    setTimeout(() => { if (!conn.open) this.emit('error', { type: 'peer-unavailable' }); }, 3000);
    return conn;
  }
  destroy() { this.bc.close(); }
}

class TabConn {
  constructor(peer, remote) {
    this.peer = peer; this.remote = remote; this.open = false; this.handlers = {};
    peer.conns = peer.conns || {};
    peer.conns[remote] = this;
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...a) { if (ev === 'open') this.open = true; this.handlers[ev] && this.handlers[ev](...a); }
  send(msg) { this.peer.bc.postMessage({ to: this.remote, from: this.peer.id, kind: 'data', msg }); }
  close() { this.open = false; }
}

function makePeer(id) {
  if (LOCAL_NET) return new TabPeer(id);
  return id ? new Peer(id, { config: ICE }) : new Peer({ config: ICE });
}

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.code = '';
    this.onMessage = () => {};
    this.onStatus = () => {};
    this.onConnected = () => {};
    this.onDisconnected = () => {};
    this.rtt = 0.1;
  }

  get connected() { return !!(this.conn && this.conn.open); }

  host(attempt = 0) {
    this.isHost = true;
    this.code = randomCode();
    this.onStatus('Opening a room…');
    this.peer = makePeer(PREFIX + this.code);
    this.peer.on('open', () => this.onStatus(`Room code: ${this.code}`, this.code));
    this.peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) { conn.on('open', () => conn.close()); return; }
      this.attach(conn);
    });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 5) { this.peer.destroy(); this.host(attempt + 1); return; }
      this.onStatus(`Network error: ${err.type || err.message}`);
    });
  }

  join(code) {
    this.isHost = false;
    this.code = code.trim().toUpperCase();
    this.onStatus('Connecting…');
    this.peer = makePeer();
    this.peer.on('open', () => {
      this.attach(this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' }));
      setTimeout(() => {
        if (!this.connected && this.peer) this.onStatus('Still connecting… if this never finishes, one of your networks is blocking direct connections (see README: TURN relay).');
      }, 12000);
    });
    this.peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') this.onStatus(`No room found with code ${this.code}`);
      else this.onStatus(`Network error: ${err.type || err.message}`);
    });
  }

  attach(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.onStatus('Connected!');
      this.onConnected();
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', at: performance.now() }), 1000);
    });
    conn.on('data', (msg) => {
      if (msg.t === 'ping') { this.send({ t: 'pong', at: msg.at }); return; }
      if (msg.t === 'pong') { const r = (performance.now() - msg.at) / 1000; this.rtt = this.rtt * 0.7 + r * 0.3; return; }
      this.onMessage(msg);
    });
    const lost = () => {
      clearInterval(this.pingTimer);
      if (this.conn !== conn) return;
      this.conn = null;
      this.onStatus('Your friend disconnected.');
      this.onDisconnected();
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  send(msg) {
    if (this.connected) this.conn.send(msg);
  }

  close() {
    clearInterval(this.pingTimer);
    if (this.peer) this.peer.destroy();
    this.peer = null; this.conn = null;
  }
}
