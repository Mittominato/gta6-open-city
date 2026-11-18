// Solmar Bay — boot and the one loop.
// The game moves between screens (title, play, paused, wasted, busted,
// complete). Play advances in fixed 1/60 s steps so the deterministic
// shots replay exactly. ?shot=<name>&seed=1 stages a screenshot scene
// instead of running the loop, paints it twice and sets window.__shotReady.
// ?selftest=1 runs a scripted drive/steal/shoot/mission check headlessly
// and reports the result in window.__selftest.
import * as THREE from 'three';
import { CFG, KEYS, SPOTS } from './config.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createCity } from './world.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createPlayer, updatePlayer, exitCar, damagePlayer } from './player.js';
import { driveCar, carForward } from './vehicles.js';
import { createRenderer, resize, setTimeOfDay, createBeacon, createShotEffects, createHUD, updateCamera } from './render.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmar-bay-save-v1';
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;
const selftest = params.get('selftest') === '1';

const canvas = document.getElementById('game');
const render = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);
const hud = createHUD();
const beacon = createBeacon(render.scene);
const shotFx = createShotEffects(render.scene);

const city = createCity(render.scene, createRandom(seed));
const traffic = createTraffic(city, render.scene, createRandom(seed + 7));
const police = createPolice(city, render.scene, createRandom(seed + 13));

const game = {
  time: 0,
  screen: 'title',
  timeOfDay: 'day',
  cameraYaw: Math.PI,
  cameraPitch: 0.18,
  player: null,
  traffic,
  police,
  missions: null,
  city,
  wreckToastShown: false,
  lastDamageAt: -100,
  crashCooldown: 0,
};

game.player = createPlayer(render.scene, SPOTS.playerStart);
game.missions = createMissions((event) => onMissionEvent(event));

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: game.player.money,
      done: game.missions.done,
      best: Math.max(game.player.money, loadSave()?.best || 0),
    }));
  } catch { /* storage can be off; the game still plays */ }
}

function onMissionEvent(event) {
  if (event.type === 'mission-start') {
    hud.showToast(`${event.mission.title} — ${event.mission.giver}: ${event.mission.intro}`, 6);
    game.player.ammo = CFG.PISTOL_AMMO_MAX;
  }
  if (event.type === 'step-done') {
    hud.showToast('Objective complete', 2.5);
    audio.pickup();
  }
  if (event.type === 'mission-done') {
    game.player.money += event.reward;
    game.player.ammo = CFG.PISTOL_AMMO_MAX;
    audio.jingle();
    hud.showToast(`Job done — $${event.reward}. ${event.next ? `Next: ${event.next.title}` : ''}`, 5);
    saveGame();
  }
  if (event.type === 'story-done') {
    game.player.money += event.reward;
    audio.jingle();
    saveGame();
    game.screen = 'complete';
    showEndScreen('STORY COMPLETE', 'Rook made it out of Solmar Bay — $1,500 richer and a legend on the pier. The city is yours now.');
  }
  if (event.type === 'mission-failed') {
    hud.showToast(`Mission failed — ${event.reason}. Press R to retry.`, 5);
  }
}

function showEndScreen(title, text) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-text').textContent = text;
  document.getElementById('end-screen').style.display = 'flex';
}

function hideScreens() {
  for (const id of ['title-screen', 'pause-screen', 'end-screen', 'howto']) {
    document.getElementById(id).style.display = 'none';
  }
}

function startGame(story) {
  hideScreens();
  game.screen = 'play';
  if (story) game.missions.start(0);
  audio.unlock();
}

document.getElementById('btn-story').addEventListener('click', () => startGame(true));
document.getElementById('btn-free').addEventListener('click', () => startGame(false));
document.getElementById('btn-how').addEventListener('click', () => {
  const el = document.getElementById('howto');
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('btn-resume').addEventListener('click', () => {
  document.getElementById('pause-screen').style.display = 'none';
  game.screen = 'play';
});
document.getElementById('btn-restart').addEventListener('click', () => window.location.reload());
document.getElementById('btn-title').addEventListener('click', () => window.location.reload());
input.onFirstGesture(() => audio.unlock());

// Restore a save, if there is one.
const saved = loadSave();
if (saved) {
  game.player.money = saved.money || 0;
  document.getElementById('save-line').textContent =
    `Save found: $${(saved.money || 0).toLocaleString('en-US')} — ${((saved.done || []).length)}/3 jobs done.`;
}

/** Reset the dynamic world for a fresh run (used by shots and restarts). */
game.reset = function reset(nextSeed) {
  const rng = createRandom(nextSeed);
  game.time = 0;
  game.screen = 'play';
  game.player.x = SPOTS.playerStart.x;
  game.player.z = SPOTS.playerStart.z;
  game.player.yaw = Math.PI;
  game.player.speed = 0;
  game.player.health = CFG.PLAYER_HEALTH;
  game.player.car = null;
  game.player.mesh.visible = true;
  game.player.ammo = CFG.PISTOL_AMMO_START;
  game.player.money = 0;
  game.police.heat = 0;
  game.police.resetBust();
  for (const car of [...game.police.units]) render.scene.remove(car.mesh);
  game.police.units.length = 0;
  game.missions = createMissions((event) => onMissionEvent(event));
  game.cameraYaw = Math.PI;
  game.cameraPitch = 0.18;
  game.wreckToastShown = false;
};

/** Set the time of day: 'day' | 'dusk' | 'night'. */
game.setTimeOfDay = function setTimeOfDayPreset(preset) {
  game.timeOfDay = preset;
  setTimeOfDay(render, city, preset);
};

/** One fixed step of gameplay. */
game.step = function step(inputState, dt) {
  game.time += dt;
  const p = game.player;
  const ctx = { city, traffic, police, audio };

  if (p.car) {
    // Driving.
    const car = p.car;
    const throttle = (inputState.anyDown(KEYS.FORWARD) ? 1 : 0) + (inputState.anyDown(KEYS.BACK) ? -1 : 0);
    const steer = (inputState.anyDown(KEYS.RIGHT) ? 1 : 0) - (inputState.anyDown(KEYS.LEFT) ? 1 : 0);
    const handbrake = inputState.anyDown(KEYS.HANDBRAKE);
    if (car.health > 0) driveCar(car, throttle, steer, handbrake, dt);
    else car.speed = THREE.MathUtils.lerp(car.speed, 0, Math.min(1, dt * 3));
    p.x = car.x;
    p.z = car.z;
    p.yaw = car.yaw;
    p.speed = car.speed;
    audio.engine(Math.abs(car.speed) / CFG.CAR_MAX_SPEED);
    if (car.health <= 0 && !game.wreckToastShown) {
      game.wreckToastShown = true;
      hud.showToast('Your car is wrecked — press E to get out!', 4);
    }
    // Bumping traffic cars and running over pedestrians.
    game.crashCooldown = Math.max(0, game.crashCooldown - dt);
    for (const other of traffic.cars) {
      const d = Math.hypot(other.x - car.x, other.z - car.z);
      if (d < 4 && d > 0.01) {
        const push = (4 - d) / 2;
        const nx = (car.x - other.x) / d;
        const nz = (car.z - other.z) / d;
        car.x += nx * push;
        car.z += nz * push;
        car.speed *= 0.86;
        other.speed *= 0.7;
        if (game.crashCooldown <= 0) {
          game.crashCooldown = 0.6;
          audio.crash();
          car.health -= 4;
        }
      }
    }
    for (const ped of traffic.peds) {
      if (!ped.alive) continue;
      const d = Math.hypot(ped.x - car.x, ped.z - car.z);
      if (d < 2.4 && Math.abs(car.speed) > 3) {
        ped.alive = false;
        ped.mesh.visible = false;
        p.stats.pedsHit += 1;
        police.addHeat(CFG.HEAT_HIT_PED, 'ran over a pedestrian');
        traffic.scarePeds(car.x, car.z, 16);
        car.speed *= 0.9;
        audio.crash();
      }
    }
    const fixed = city.resolveBuildingCollision(car.x, car.z, 1.7);
    car.x = fixed.x;
    car.z = fixed.z;
    car.mesh.position.set(car.x, 0, car.z);
    if (inputState.justPressed('KeyE')) {
      exitCar(p, city);
      audio.engineOff();
    }
  } else {
    // On foot.
    const event = updatePlayer(p, inputState, game.cameraYaw, dt, ctx);
    if (event) {
      if (event.type === 'shot-hit' || event.type === 'shot-miss') {
        const from = new THREE.Vector3(p.x, 1.5, p.z);
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        const to = new THREE.Vector3(p.x + fx * (event.dist || CFG.PISTOL_RANGE), 1.4, p.z + fz * (event.dist || CFG.PISTOL_RANGE));
        shotFx.fire(from, to);
      }
      if (event.type === 'stole-car') {
        hud.showToast('Nice ride. The cops noticed.', 3);
        audio.engine(0.2);
      }
    }
    audio.engineOff();
    // Traffic can hit the player on foot.
    for (const car of traffic.cars) {
      const d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < 1.6 && Math.abs(car.speed) > 2) {
        if (damagePlayer(p, 12)) {
          game.screen = 'over';
          showEndScreen('WASTED', 'Rook got run down in traffic. Solmar Bay is not a safe place to jaywalk.');
        } else {
          game.lastDamageAt = game.time;
          hud.showToast('Watch the traffic!', 2);
        }
        p.x += (p.x - car.x) / Math.max(d, 0.1) * 2;
        p.z += (p.z - car.z) / Math.max(d, 0.1) * 2;
      }
    }
    // Slow health regen after ten quiet seconds.
    if (game.time - game.lastDamageAt > 10 && p.health > 0 && p.health < CFG.PLAYER_HEALTH) {
      p.health = Math.min(CFG.PLAYER_HEALTH, p.health + 2 * dt);
    }
  }

  traffic.update(dt, { x: p.x, z: p.z }, p.speed);
  const policeResult = police.update(dt, p, traffic);
  audio.siren(policeResult.nearest < 60 && police.stars > 0, dt);
  if (policeResult.busted) {
    game.screen = 'busted';
    audio.busted();
    showEndScreen('BUSTED', 'The Solmar Bay police caught up with Rook. The story ends in a cell — unless you try again.');
  }
  if (p.health <= 0 && game.screen === 'play') {
    game.screen = 'over';
    showEndScreen('WASTED', 'Rook went down in Solmar Bay. The city keeps moving without him.');
  }

  // Missions.
  const missionEvent = game.missions.update(dt, { x: p.x, z: p.z }, !p.car);
  if (missionEvent && missionEvent.type === 'mission-failed') {
    // The player retries with R; the mission stays failed until then.
  }
  if (inputState.justPressed('KeyR') && game.missions.failed) {
    game.missions.retry();
    hud.showToast('Mission restarted', 2.5);
  }

  // Beacon over the mission target.
  const target = game.missions.targetPos();
  if (target && game.screen === 'play') beacon.show(target.x, target.z, game.time);
  else beacon.hide();
  shotFx.update(dt);
};

/** One rendered frame: camera, scene, HUD. `snap` jumps the camera to its
 * chase position at once (used by the shot mode, which paints twice). */
game.renderFrame = function renderFrame(snap) {
  updateCamera(render.camera, game, input, 1 / 60, snap);
  hud.update(game, 1 / 60);
  render.renderer.render(render.scene, render.camera);
};

resize(render.renderer, render.camera);
window.addEventListener('resize', () => resize(render.renderer, render.camera));
input.onFirstGesture(() => audio.unlock());

// Mute toggle and pause, handled outside the fixed step.
function handleMetaKeys() {
  if (input.justPressed('KeyM')) {
    audio.setMuted(!audio.muted);
    hud.showToast(audio.muted ? 'Sound off' : 'Sound on', 1.5);
  }
  if (input.justPressed('KeyP') || input.justPressed('Escape')) {
    if (game.screen === 'play') {
      game.screen = 'paused';
      document.getElementById('pause-screen').style.display = 'flex';
    } else if (game.screen === 'paused') {
      document.getElementById('pause-screen').style.display = 'none';
      game.screen = 'play';
    }
  }
}

// Shot mode: hide every menu overlay and the toast (they are DOM, not the
// game), stage the scene, paint it twice, flag readiness.
if (shotName) {
  hideScreens();
  document.getElementById('toast').style.display = 'none';
  const scene = stageShot(shotName, game);
  game.screen = 'play';
  let painted = 0;
  function paintShot() {
    game.renderFrame(true);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintShot);
} else if (selftest) {
  // Headless self-test: drive, steal, shoot, advance a mission, report.
  game.reset(1);
  game.screen = 'play';
  const results = { steps: 0, errors: [] };
  const fake = {
    keys: new Set(['KeyW']),
    anyDown(codes) { return codes.some((c) => this.keys.has(c)); },
    justPressed() { return false; },
    takeMouseDelta() { return { x: 0, y: 0 }; },
    endFrame() {},
  };
  try {
    // Drive forward for 10 seconds.
    for (let i = 0; i < 600; i += 1) { game.step(fake, CFG.STEP); results.steps += 1; }
    results.drove = { x: +game.player.x.toFixed(1), z: +game.player.z.toFixed(1) };
    // Steal the nearest car and drive 5 more seconds.
    const car = traffic.nearestCar(game.player.x, game.player.z, 400, true);
    results.carNearby = !!car;
    if (car) {
      traffic.takeCar(car);
      game.player.car = car;
      game.player.mesh.visible = false;
      for (let i = 0; i < 300; i += 1) { game.step(fake, CFG.STEP); results.steps += 1; }
      results.droveCar = { speed: +game.player.car.speed.toFixed(1) };
    }
    // Wanted: add heat and check police spawn and chase.
    police.addHeat(60, 'selftest');
    for (let i = 0; i < 300; i += 1) { game.step(fake, CFG.STEP); results.steps += 1; }
    results.wanted = { stars: police.stars, units: police.units.length };
    // Mission: start mission 1 and teleport-walk to its first marker.
    game.missions.start(0);
    const t = game.missions.targetPos();
    game.player.x = t.x;
    game.player.z = t.z;
    if (game.player.car) { game.player.car.x = t.x; game.player.car.z = t.z; }
    game.step(fake, CFG.STEP);
    results.mission = { index: game.missions.index, step: game.missions.step };
    game.renderFrame();
    results.rendered = true;
  } catch (err) {
    results.errors.push(String(err && err.message ? err.message : err));
  }
  window.__selftest = JSON.stringify(results);
  document.title = `SELFTEST ${results.errors.length ? 'FAIL' : 'OK'}`;
} else {
  // The live game loop.
  let last = performance.now();
  let accumulator = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const frame = Math.min(0.25, (now - last) / 1000);
    last = now;
    handleMetaKeys();
    if (game.screen === 'play') {
      accumulator += frame;
      while (accumulator >= CFG.STEP) {
        game.step(input, CFG.STEP);
        accumulator -= CFG.STEP;
        if (game.screen !== 'play') break;
      }
      input.endFrame();
      if (game.screen === 'play') game.renderFrame();
    } else if (game.screen === 'title') {
      // Idle backdrop: slow orbit over the city behind the menu.
      game.time += frame;
      render.camera.position.set(Math.sin(game.time * 0.05) * 160, 90, Math.cos(game.time * 0.05) * 160);
      render.camera.lookAt(0, 0, 0);
      hud.update(game, frame);
      render.renderer.render(render.scene, render.camera);
      input.endFrame();
    }
  }
  requestAnimationFrame(loop);
}
