# Solmar Bay — an open-world crime game

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Mittominato/gta6-open-city/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Mittominato/gta6-open-city/reward.svg)](https://make.fun/c/gta6-01)

**Solmar Bay** is a 3D open-world crime game built for the make.fun **gta6-01** bounty ("Make GTA 6"). You are Rook, new in a sun-soaked coastal city and already in debt to Mara Voss. Steal cars, dodge the Solmar Bay police, and run three jobs across the city: a courier delivery, a corner-shop heist, and a getaway to the pier.

## Play it

Serve `game/` with any static file server and open `index.html` in desktop Chrome:

```sh
cd game && python3 -m http.server 8080
```

No build step, no network requests: every script, library and texture is a file under `game/` (three.js is vendored as `game/vendor/three.module.min.js`).

## Controls

| Keys | Action |
| --- | --- |
| W A S D | Drive / walk |
| Shift | Run on foot |
| Space | Handbrake |
| E | Enter / exit a car |
| F | Punch |
| Mouse click | Shoot the pistol |
| Drag mouse | Look around |
| P / Esc | Pause · M mute · R retry a failed job |

## What's in the city

- **A living grid city** — 8×8 blocks of procedural buildings, street lamps, a park, a beach and a pier, with day, dusk and night lighting.
- **Traffic and pedestrians** — NPC cars follow the street graph and brake for the car ahead; walkers stroll the sidewalks and scatter when shots are fired.
- **Wanted level 0–5** — stealing cars, hitting people and shooting raise the heat; police cars chase, ram and try to bust you on foot.
- **Three chained missions with a story** — courier run, heist, getaway — with markers, a HUD objective, a minimap and a timer.
- **Combat, HUD and save** — punch and pistol, health and money, wanted stars, a live minimap, and progress saved in `localStorage`.
- **Procedural sound** — engine, sirens, gunshots and jingles synthesised with WebAudio; no sound files.

## Layout

- `main.ts` — the make.fun entrypoint: copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `game/index.html` — the page: canvas, HUD and menus.
- `game/src/` — the game's own source, one job per file: `config`, `random`, `input`, `audio`, `world`, `vehicles`, `traffic`, `police`, `missions`, `player`, `render`, `shots`, `main`.
- `game/vendor/three.module.min.js` — three.js 0.187.0, vendored.
- `screenshots/` — four real renders of the game in a browser (cover, police chase, mission, night).

## Screenshots

The game supports a deterministic shot mode, `?shot=cover|chase|mission|night&seed=1`, which stages a scene from the real rules and flags `window.__shotReady` when painted.
