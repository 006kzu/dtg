// Keyboard + gamepad input, normalized per player.

const KEYMAPS = [
  {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], hit: ['KeyQ'], kick: ['KeyE'], sprint: ['ShiftLeft'],
  },
  {
    up: ['KeyI', 'ArrowUp'], down: ['KeyK', 'ArrowDown'], left: ['KeyJ', 'ArrowLeft'], right: ['KeyL', 'ArrowRight'],
    jump: ['Semicolon', 'Enter', 'NumpadEnter'], hit: ['KeyU'], kick: ['KeyO'], sprint: ['ShiftRight'],
  },
  // online: one player per computer, so they get the comfiest keys from both layouts
  {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    jump: ['Space'], hit: ['KeyQ', 'KeyJ'], kick: ['KeyE', 'KeyK'], sprint: ['ShiftLeft', 'ShiftRight'],
  },
];
export const ONLINE_KEYS = 2;

const down = new Set();
const pressedThisFrame = new Set();

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (!down.has(e.code)) pressedThisFrame.add(e.code);
  down.add(e.code);
});
window.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => down.clear());

const anyDown = (codes) => codes.some((c) => down.has(c));
const anyPressed = (codes) => codes.some((c) => pressedThisFrame.has(c));

// Gamepad button indices (standard mapping)
const PAD = { A: 0, B: 1, X: 2, Y: 3, START: 9 };
const prevPad = [{}, {}];

function readPad(index) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const connected = [...pads].filter(Boolean);
  return connected[index] || null;
}

// keymap: index into KEYMAPS; padIndex: which connected gamepad drives this player
export function pollPlayer(keymap, padIndex) {
  const km = KEYMAPS[keymap];
  const i = padIndex;
  let x = (anyDown(km.right) ? 1 : 0) - (anyDown(km.left) ? 1 : 0);
  let y = (anyDown(km.up) ? 1 : 0) - (anyDown(km.down) ? 1 : 0);
  let jump = anyPressed(km.jump);
  let jumpHeld = anyDown(km.jump);
  let hit = anyPressed(km.hit);
  let kick = anyPressed(km.kick);
  let sprint = anyPressed(km.sprint);

  const pad = readPad(i);
  if (pad) {
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    if (Math.hypot(ax, ay) > 0.2) { x = ax; y = -ay; }
    const btn = (b) => !!(pad.buttons[b] && pad.buttons[b].pressed);
    const edge = (b) => btn(b) && !prevPad[i][b];
    jump = jump || edge(PAD.A);
    jumpHeld = jumpHeld || btn(PAD.A);
    hit = hit || edge(PAD.X);
    sprint = sprint || edge(PAD.Y) || edge(10); // Y or left-stick click
    kick = kick || edge(PAD.B);
    // also allow right trigger / bumper for kick
    kick = kick || edge(5) || edge(7);
    hit = hit || edge(4) || edge(6);
  }

  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y, jump, jumpHeld, hit, kick, sprint };
}

export function startPressed() {
  if (pressedThisFrame.has('Enter') || pressedThisFrame.has('NumpadEnter')) return true;
  for (let i = 0; i < 2; i++) {
    const pad = readPad(i);
    if (pad && pad.buttons[PAD.START] && pad.buttons[PAD.START].pressed && !prevPad[i][PAD.START]) return true;
  }
  return false;
}

// Call once at the end of every frame.
export function endFrame() {
  pressedThisFrame.clear();
  for (let i = 0; i < 2; i++) {
    const pad = readPad(i);
    prevPad[i] = {};
    if (pad) pad.buttons.forEach((b, j) => { prevPad[i][j] = b.pressed; });
  }
}
