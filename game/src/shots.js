// Deterministic screenshot scenes for Solmar Bay.
// Each shot plays the real rules forward from a fresh world for a fixed
// number of steps with a scripted driver, so the frame is what a short
// game really looks like — and the same seed always gives the same frame.
// ?shot=cover|chase|mission|night&seed=1 stages one, paints it twice and
// sets window.__shotReady for a screenshot.
import { CFG, SPOTS } from './config.js';

/** A fake input object the scripted driver steers with. */
function scriptInput() {
  const keys = new Set();
  return {
    keys,
    anyDown(codes) { return codes.some((c) => keys.has(c)); },
    justPressed() { return false; },
    takeMouseDelta() { return { x: 0, y: 0 }; },
    endFrame() {},
  };
}

/** Put the player in the nearest parked car, as if they had stolen it. */
function putPlayerInCar(game) {
  const car = game.traffic.nearestCar(game.player.x, game.player.z, 400, true);
  if (!car) return null;
  game.traffic.takeCar(car);
  game.player.car = car;
  car.parked = false;
  game.player.mesh.visible = false;
  game.player.x = car.x;
  game.player.z = car.z;
  game.player.yaw = car.yaw;
  return car;
}

/** Drive the player's car toward a waypoint for `seconds` of game time. */
function driveToward(game, input, tx, tz, seconds) {
  const steps = Math.floor(seconds / CFG.STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = game.player.car;
    const dx = tx - car.x;
    const dz = tz - car.z;
    const wantYaw = Math.atan2(dx, dz);
    let dyaw = wantYaw - car.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    input.keys.clear();
    input.keys.add('KeyW');
    if (dyaw > 0.25) input.keys.add('KeyD');
    else if (dyaw < -0.25) input.keys.add('KeyA');
    game.step(input, CFG.STEP);
  }
}

/** Walk the player toward a point for `seconds` of game time. */
function walkToward(game, input, tx, tz, seconds) {
  const steps = Math.floor(seconds / CFG.STEP);
  for (let i = 0; i < steps; i += 1) {
    const dx = tx - game.player.x;
    const dz = tz - game.player.z;
    const wantYaw = Math.atan2(dx, dz);
    let dyaw = wantYaw - game.player.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    game.cameraYaw = wantYaw + Math.PI;
    input.keys.clear();
    input.keys.add('KeyW');
    if (Math.abs(dyaw) > 0.6) input.keys.add(dyaw > 0 ? 'KeyD' : 'KeyA');
    game.step(input, CFG.STEP);
  }
}

/**
 * Stage a shot scene on `game` and return the screen to show.
 * `game` is the live game object from main.js (reset/step/renderFrame).
 */
export function stageShot(name, game) {
  const input = scriptInput();
  game.reset(1);
  if (name === 'chase') {
    // Wanted 3, police on the tail, the player fleeing downtown in a car.
    game.setTimeOfDay('day');
    putPlayerInCar(game);
    game.police.heat = 60;
    game.player.money = 1250;
    driveToward(game, input, 52, -52, 9);
    game.cameraYaw = game.player.car.yaw + Math.PI;
    game.cameraPitch = 0.18;
    return { screen: 'play' };
  }
  if (name === 'mission') {
    // Mission 2 in progress: Rook on foot at the corner shop, till half
    // held, one star already on him.
    game.setTimeOfDay('dusk');
    game.missions.start(1);
    game.player.x = SPOTS.cornerShop.x - 3;
    game.player.z = SPOTS.cornerShop.z + 6;
    game.player.money = 300;
    game.police.heat = 25;
    walkToward(game, input, SPOTS.cornerShop.x, SPOTS.cornerShop.z, 3.2);
    game.cameraYaw = game.player.yaw + Math.PI;
    game.cameraPitch = 0.22;
    return { screen: 'play' };
  }
  if (name === 'night') {
    // On foot downtown at night: lamps on, windows lit, traffic passing.
    game.setTimeOfDay('night');
    game.player.x = SPOTS.downtown.x + 8;
    game.player.z = SPOTS.downtown.z + 20;
    game.player.money = 2150;
    game.missions.start(2);
    walkToward(game, input, SPOTS.downtown.x, SPOTS.downtown.z - 30, 4);
    game.cameraYaw = game.player.yaw + Math.PI;
    game.cameraPitch = 0.2;
    return { screen: 'play' };
  }
  // cover: the player driving down the main avenue in daylight, traffic
  // around, the whole HUD on show.
  game.setTimeOfDay('day');
  game.missions.start(0);
  game.player.money = 450;
  putPlayerInCar(game);
  driveToward(game, input, 0, -104, 7);
  game.cameraYaw = game.player.car.yaw + Math.PI;
  game.cameraPitch = 0.16;
  return { screen: 'play' };
}
