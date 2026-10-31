# Don't Let the Balloon Touch! — Lunch Room Edition

A 3rd-person, 2-player co-op game: keep the balloon in the air inside a giant cartoon
cafeteria. The balloon pops if it touches the floor, tables or ceiling lights. It
bounces safely off the walls and ceiling.

Runs in any modern browser (Chrome, Edge, Firefox, Safari), so it works on **Windows and macOS**.

## Moves
| Move | What it does |
|------|--------------|
| **Bump**: just be under or against it | small pop upward (~2 m) |
| **Hit** | bigger boost up and forward (~6 m) |
| **Kick** | MASSIVE launch (~15 m). Watch out for the ceiling lights! |

Where you stand matters: a balloon off to your side gets sent that way, running carries
your momentum into it, low hits pop it up and high hits drive it forward.

Jump twice (double jump) to climb tables, juice boxes, the tray tower, the balcony and the
floating sandwiches. The pink ring on the ground shows where the balloon will land, and it
turns red when the balloon gets low. Taking turns touching the balloon builds a combo multiplier (up to x5).

## Controls
**Online (one player per computer):** `WASD`/arrows move · `Space` jump · `Q`/`J` hit · `E`/`K` kick

**Local split-screen:** P1 `WASD` · `Space` · `Q` hit · `E` kick. P2 `IJKL`/arrows · `;`/`Enter` jump · `U` hit · `O` kick

**Gamepad:** left stick · A jump · X hit · B kick · Start

## Playing online with a friend
1. Both of you open the game (see *Running it* below).
2. One player clicks **Host online game** and gets a 5-letter room code.
3. The other types the code and clicks **Join**.
4. The host presses **Start**.

The connection is peer-to-peer (WebRTC via PeerJS). PeerJS's free public server only introduces
the two browsers to each other; there is no game server to run. The host's computer runs the
balloon and the scoring, and each player's own movement runs on their own machine, so it stays responsive.

### If "Connecting…" never finishes
Some routers and firewalls (school or work networks, some mobile hotspots) block direct
peer-to-peer connections. Fix it with a TURN relay: create a free account at
https://www.metered.ca/tools/openrelay/ (or use any TURN provider), then add a `.env` file
next to `package.json` and rebuild:
```
VITE_TURN_URL=turn:your-turn-host:80,turn:your-turn-host:443
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

## Running it
Requires Node.js 18+.
```
npm install
npm run dev        # play locally at http://localhost:5173
npm run build      # outputs a static site in dist/
```
To play with a friend who's far away, put `dist/` somewhere you can both open it, for
example Vercel (`npx vercel deploy dist`), Netlify Drop, GitHub Pages, or an itch.io HTML5 game
(zip the contents of `dist/`). Alternatively you can each run `npm run dev` from your own copy of
the project; online play works the same way.

**Dev tip:** open `http://localhost:5173/?local-net` in two tabs to test online play on one
computer without WebRTC.
