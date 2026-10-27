# Underworld Gambit

A two-board chess variant for Android, with a free web build. Chess on two stacked boards: a piece captured on the **Overworld** *falls* to the same square on the **Underworld**; a piece that captures *below* destroys its victim and *rises* back up. You win by checkmating the enemy king on the Overworld.

Stack: TypeScript, Vite, Three.js, Capacitor 8 (Android target API 36, not wired up yet). The game is rendered as a low-poly isometric diorama with cinematic, piece-specific moves and captures.

> **Read this file before touching anything.** It is the handoff for the next agent.

## Golden rules

1. **Never change a game rule without asking the user.** The 13 rules below are a contract. Edge cases the user has already confirmed are listed under *Rule interpretations*.
2. Keep all tests green (`npm test`) and `npx tsc --noEmit` clean before every commit. Commit after each meaningful step.
3. **Git:** do not add yourself (or any AI) as a co-author. No `Co-Authored-By` trailers, no "generated with" lines in commits or PRs.
4. Licenses matter: only CC0 / MIT / OFL assets, listed in `CREDITS.md` with author, license and URL. Never use the cburnett piece set or GSAP.
5. Ask before downloading new third-party files or publishing anything.

## The rules (implement exactly)

1. Two 8×8 boards, Overworld (top) and Underworld (bottom). Squares map 1:1 (e4 sits above e4). Overworld starts in the standard setup; Underworld starts empty.
2. White moves first. Each turn is exactly one legal move on either board.
3. Pieces move and capture by standard chess rules, only against pieces on the same board.
4. **Fall:** a piece captured on the Overworld moves to the same square on the Underworld. After en passant it falls from the square the captured pawn stood on.
5. **Rise:** when a piece captures on the Underworld, the victim is destroyed permanently and the capturer moves up to the same square (its destination) on the Overworld.
6. **One second chance** (setting, default on): a risen piece is marked. If captured again it is destroyed instead of falling.
7. Kings never fall. Checkmate on the Overworld wins. Resigning is allowed.
8. **Legality:** a move is legal only if the mover's king is not in check after the move, fall and rise are fully resolved. Checkmate and stalemate count legal moves on **both** boards (an Underworld capture whose rising piece blocks a check is a legal escape).
9. **Landing:** if the target square is occupied, use the nearest empty square sorted by king-step distance, then orthogonal-step distance, then closeness to the owner's back rank, then file a→h. Never place a pawn on rank 1 or 8. Bishops keep their square color. Deterministic.
10. **Pawns:** move in their color's direction on both boards; double step from their start rank; en passant on both boards. Promotion works on both boards, but a pawn that captures in the Underworld rises as a pawn instead of promoting.
11. Promoted pieces turn back into pawns whenever they fall or rise.
12. A rook that has fallen loses its castling right (rights are tracked per piece).
13. **Draws:** stalemate; threefold repetition of the full state (both boards, side to move, castling and en passant rights, risen marks); 100 plies with no capture or pawn move on either board; bare kings on the Overworld while the Underworld is empty or one color only.

There is a `classic` option that disables falls and rises (used for perft).

### Rule interpretations the engine uses (flagged to the user in phase 1)
- A pawn rising onto an empty rank-1/8 square is still displaced by rule 9 (a pawn rising from a rank-8 capture lands on e7, not e8).
- "Orthogonal-step distance" = Manhattan distance. Bishop color = the color of the capture square.
- Quiet Underworld moves are illegal while in check (they leave the king in check); only an Underworld capture that rises into the line can answer check.
- En passant counts toward repetition only if a capture is actually possible.
- With the second-chance setting off, the risen mark is not set at all.

## Commands

```bash
npm ci
npm run dev          # Vite dev server, http://127.0.0.1:5173
npm test             # rules + perft + AI tests (about 4 s). Self-play is excluded.
npx tsc --noEmit     # type check
npm run build        # tsc + production bundle in dist/
npm run selfplay     # 200 lowest-level AI-vs-AI games in 8 parallel shards (about 11 min)
node scripts/gen-audio.mjs   # regenerates the placeholder sounds in public/audio
```

Dev tools: `/models.html?yaw=30` shows a model sheet of all twelve pieces (`&under=1` for the Underworld look).

## Docker / VPS

```bash
docker compose up -d --build        # serves the game on http://<host>:8080
# or
docker build -t underworld-gambit . && docker run -d -p 8080:80 --restart unless-stopped underworld-gambit
```

The image is a two-stage build (`node:latest` builds, `nginx:1.27-alpine` serves `dist/`; `node:latest` is unpinned on purpose, so pin a major version if a Node upgrade ever breaks the build) with a `/healthz` endpoint and long cache headers on fingerprinted assets. For HTTPS put a reverse proxy in front (Caddy is the simplest: `game.example.com { reverse_proxy localhost:8080 }`). Audio needs HTTPS or localhost to start in some browsers.

> Status: the Dockerfile, nginx.conf and compose file were written but **not yet built or run** (no Docker daemon was available where they were authored). First thing to do on a machine with Docker: build, run, and open the game, and fix anything that breaks.

## CI/CD (GitHub Actions)

- `.github/workflows/docker.yml` builds the Docker image on every push and pull request, and publishes it to GHCR as `ghcr.io/defhex/underworld-gambit` (tags: `latest` on the default branch, the commit sha, and `v*` release tags). Pull on the VPS with `docker pull ghcr.io/defhex/underworld-gambit:latest`. The package is private; log in first with a personal access token that has `read:packages`.
- `.github/workflows/pages.yml` runs the tests, builds the site and deploys `dist/` to GitHub Pages. Pages serves static files, so it publishes the web build, not the Docker image. One-time setup: repository Settings, then Pages, then Source: **GitHub Actions**. Pages for a private repository needs a paid GitHub plan.
- Both run on pushes to `master` or `main` and can be started by hand from the Actions tab.

## Architecture

```
src/rules      Pure TypeScript, no DOM. The source of truth.
  position.ts    Position: both boards, make/unmake (journaled), legality, landing search, draws, position key
  game.ts        Game: history, repetition, resign, undo (by replay), save/load (JSON)
  notation.ts    SAN, "u:" prefix for Underworld moves, "↓f7" fall / "↑e5" rise suffixes
  setup.ts       setup({over:["wKe1",...], under:[...]}) and fromFen (tests, tutorial lessons)
src/ai         Negamax alpha-beta, iterative deepening, quiescence, Zobrist TT over both boards and marks
  search.ts eval.ts zobrist.ts levels.ts  worker.ts (Web Worker)  client.ts (main-thread wrapper)
src/render     Three.js
  world.ts       Scene, isometric camera, portal inset, picking, markers, playMove() sequencer
  pieces.ts      Low-poly vertex-colored piece models + modelling helpers
  terrain.ts     Biome tiles and 3D terrain features for both boards (OVER_MAP / HELL_MAP)
  decor.ts       Frames and floors
  fx.ts          three.quarks particles, cracks, light columns, flashes
  models.ts      glTF loader for the KayKit props (skulls, ribs on the bone fields)
  tween.ts       Our own tween Group on a virtual clock (see gotchas)
  exec/          The cinematic animation system (see below)
src/ui         controller.ts (taps, drags, swipes, previews, AI hookup)  style.css
src/audio      howler.js wrapper (SFX + music cross-fade between boards)
src/platform   settings.ts (localStorage), haptics.ts (Capacitor or navigator.vibrate)
src/main.ts    Wiring, HUD, toolbar. Exposes window.__uw for debugging.
tests/         rules.test.ts perft.test.ts ai.test.ts invariants.test.ts, selfplay/ (excluded by default)
scripts/       gen-audio.mjs, selfplay.ts, run-selfplay.mjs
```

### Move pipeline
`Controller.play()` → `Game.play()` (rules, returns `MoveInfo` with `fell` / `rose` / `destroyed`) → `World.playMove(move, info, pos)`. `playMove` picks a style, runs it, then plays the victim's fate (crack and pop in below, destruction, or the attacker's rise with a column of light) and finally reconciles the scene with the position via `syncPieces`. `world.pending > 0` while it runs; the controller ignores input and the AI waits.

### Cinematic animations (`src/render/exec`)
- `kit.ts` — `Kit`: the toolbox each style gets (`tw`, `wait`, `glide`, `proj`, `every`, `burst`, `ring`, `flash`, `hit(reaction)`) plus the eight victim **reactions** (squash, launch, topple, explode, burn, zap, hoist, spin).
- `props.ts` — rocket, parachute, tank, lance, sword, whip, bolt, hammer, throne, etc.
- `bishop.ts rook.ts knight.ts queen.ts king.ts pawn.ts` — each exports `{ moves: Style[2], kills: Style[10] }`. A `Style` is `{ name, run(k): Promise<void>, zoom? }`; styles are async functions that await steps and must call `k.hit(...)` exactly when contact happens (it plays the sound, shake and the victim's reaction).
- `index.ts` — `pickStyle()` picks randomly, never the same one twice in a row. The 🎬 button (`settings.cinematic`) switches to plain slides.
- To add a style: write it in the piece's file, add it to the `kills`/`moves` array, run it (see Testing the animations).

### Views
Isometric (landscape) shows one board plus a corner portal. Portrait phones use a square-on camera fitted by width. **Top view** (the ▦ button) is a dual view: both boards on screen at once, side by side on wide screens and stacked on tall ones, both playable (`World.dual`, `dualRects()`, `pick()` returns the board and square under a tap). Each top-view camera is clipped to its own slab so the other board's particles never show through.

### Terrain
`terrain.ts` has two 8×8 character maps. Overworld: `g` grass, `f` forest, `m` mountain, `h` hills, `r` river. Underworld: `a` ash, `l` lava, `m` obsidian ridge, `f` dead forest, `b` bone field. Light/dark squares get a contrast overlay so the checker stays readable. Features are small and at tile corners; every tile top is at y = 0 so animations can assume one ground height.

## Testing

- `npm test` covers classic-mode perft (start position to depth 4 = 197,281; Kiwipete to depth 3 = 97,862), unit tests for every rule, AI tactics, and random-playout invariants (unmake restores the position exactly, no piece is created, kings never fall, no pawn on rank 1/8).
- Self-play result at the lowest level: 200 games, 0 crashes or illegal states (92 checkmates, 108 repetition draws).

### Testing the animations in a browser (important gotchas)
- The in-app browser pane **does not fire `requestAnimationFrame` while idle**, so animations stall between tool calls. Use the deterministic hook: `window.__uw.world.advance(ms)` steps tweens and particles and re-renders. **Yield between steps** (`await new Promise(r => setTimeout(r, 0))`) or the async style promises never get a turn.
- Force a style: `__uw.styleDebug.idx = 3` (index into the moves/kills list). `__uw.world.lastStyle` names the last one played. `__uw.world.pending` is 0 when done.
- Stage a position: `const R = await import('/src/rules/index.ts'); ctl.setGame(new R.Game(R.setup({over:['wKe1','bKe8','wBc1','bPf4'], under:[...]})))`. Taps act on the *active* board, so `ctl.goTo(0)` first.
- Dynamic `import('/src/...')` can return a different module instance than the app after HMR edits. Use the handles on `window.__uw` (`world`, `ctl`, `settings`, `styleDebug`) instead of importing app modules to poke their state.
- Stray clicks in the preview pane can press toolbar buttons (the camera may end up rotated). Reload to reset.
- Navigate the pane with `preview_start`; `navigate` is blocked for localhost.

## Gotchas learned the hard way
- **tween.js 25's default group does not register tweens in the Vite bundle.** Use `src/render/tween.ts` (`tween`, `start`, `tickTweens`, own `Group`, virtual clock with `scale` for slow motion). Finished tweens linger in the group; use `animating()` (checks `isPlaying`) to decide whether to keep rendering.
- The renderer only draws while something animates (`World.invalidate()`); call it after changing the scene by hand.
- `Controller.refresh()` previews captures by calling `pos.make()` then `pos.unmake()` on the live game position; never `commit()` there.
- `Position.commit()` clears undo history; `Game` undo works by replaying from the start.
- Node-only tools: this repo's heredoc-heavy shell commands break on some quote patterns in Git Bash; prefer writing files with the editor tools.

## Roadmap (phases from the original build pack)

| Phase | State |
|---|---|
| 1 Rules engine and tests | Done |
| 2 Rendering, isometric camera, touch input, portal | Done |
| 3 Animations, particles, audio, haptics | Done (audio is **procedural placeholders**; swap in CC0 Kenney/OpenGameArt files of the same name in `public/audio`, `.ogg` is tried first) |
| 4 AI and difficulty levels | Done. L1 Apprentice (depth 1, 260 cp noise, 40% random moves) is meant to be easy; L2 depth 2 with noise; L3 depth 6; L4 depth 12 for 3 s. Measured: L1 beat a random mover 7-0-1, L2 beat L1 8-0, L3 beat L2 3-1. The AI shuffles into repetition draws a lot, improve its plan-making |
| 5 Welcome screen (single player with difficulty picker, or two players on one device) is done. The tutorial is done too (a tour of every button, then a fixed mate-in-three: sacrifice the queen, take her back from the Underworld, mate; see src/tutorial/script.ts, src/ui/tutorial.ts and tests/tutorial.test.ts, which replays the line against the real rules). Still to do: settings screen, credits screen, pause menu | **In progress** |
| 6 Capacitor Android build: icon, splash, signed release AAB, Play upload instructions; Preferences for settings and the game in progress; lock landscape, back gesture opens pause menu, safe areas | Not started (`@capacitor/core` and `haptics` are installed; no `capacitor.config` or `android/` yet) |
| 7 Online play with a server running the same `src/rules` package | Later |

Also pending: the checkmate banner shows immediately instead of after the slow-motion; a script to convert models to meshopt glTF and audio to OGG; Playwright test (844×390 landscape, scripted fall and rise, screenshots, fps log) was specified but not written; more KayKit/Kenney/Quaternius props are available (see `CREDITS.md`, `assets/raw` is git-ignored and holds a local clone of the KayKit packs).

## Performance targets
60 fps on mid-range phones, download under 50 MB (currently about 3 MB), pixel ratio capped at 2, render only while something moves, no real-time shadows (blob shadows), bloom only on high-end devices (not implemented yet).

## Credits
See `CREDITS.md`. All art is generated in code except the CC0 KayKit props in `public/models`.
