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

/** Nearest road-graph node to a point. */
function nearestNode(city, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < city.nodes.length; i += 1) {
    const d = (city.nodes[i].x - x) ** 2 + (city.nodes[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Drive the player's car to a target along the streets (breadth-first
 * route over the road graph), so the car stays on roads instead of
 * cutting across blocks. Stops after `maxSeconds` of game time.
 */
function driveRoute(game, input, tx, tz, maxSeconds) {
  const city = game.city;
  const start = nearestNode(city, game.player.car.x, game.player.car.z);
  const goal = nearestNode(city, tx, tz);
  // Breadth-first route from start to goal.
  const prev = new Map([[start, -1]]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of city.neighbours[cur]) {
      if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); }
    }
  }
  const path = [];
  let cur = goal;
  while (cur !== -1) { path.unshift(cur); cur = prev.get(cur); }
  const deadline = Math.floor(maxSeconds / CFG.STEP);
  let used = 0;
  for (const nodeIdx of path) {
    const node = city.nodes[nodeIdx];
    let leg = 0;
    while (used < deadline && leg < 600) {
      const car = game.player.car;
      const d = Math.hypot(node.x - car.x, node.z - car.z);
      if (d < 4) break;
      driveToward(game, input, node.x, node.z, CFG.STEP);
      used += 1;
      leg += 1;
    }
    if (used >= deadline) break;
  }
  // Final approach to the exact target.
  while (used < deadline) {
    const car = game.player.car;
    if (Math.hypot(tx - car.x, tz - car.z) < 5) break;
    driveToward(game, input, tx, tz, CFG.STEP);
    used += 1;
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
    game.missions.start(0);
    putPlayerInCar(game);
    game.police.heat = 60;
    game.player.money = 1250;
    driveRoute(game, input, 52, -52, 11);
    // The police are slower than a fleeing car, so pull two units onto the
    // same road just behind the player, offset to either side so they read
    // beside the player's car instead of hiding directly behind it. The
    // shot is captured right away, with the pursuit live.
    const fx = Math.sin(game.player.car.yaw);
    const fz = Math.cos(game.player.car.yaw);
    const rx = Math.cos(game.player.car.yaw);
    const rz = -Math.sin(game.player.car.yaw);
    game.police.units.slice(0, 2).forEach((unit, i) => {
      const back = 14 + i * 12;
      const side = i === 0 ? 5 : -5;
      unit.x = game.player.car.x - fx * back + rx * side;
      unit.z = game.player.car.z - fz * back + rz * side;
      unit.yaw = game.player.car.yaw;
      unit.speed = 22;
      unit.mesh.position.set(unit.x, 0, unit.z);
      unit.mesh.rotation.y = unit.yaw;
    });
    // Front three-quarter view: the camera sits ahead of the player's car
    // (cameraYaw = car yaw + PI) and looks back at it, so the pursuing
    // police show on the road behind.
    game.cameraYaw = game.player.car.yaw + Math.PI - 0.25;
    game.cameraPitch = 0.14;
    game.camDist = 11;
    game.camHeight = 4.2;
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
    game.camDist = 8;
    game.camHeight = 3.6;
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
    game.camDist = 8;
    game.camHeight = 3.6;
    return { screen: 'play' };
  }
  // cover: the player driving down the main avenue in daylight, traffic
  // around, the whole HUD on show.
  game.setTimeOfDay('day');
  game.missions.start(0);
  game.player.money = 450;
  putPlayerInCar(game);
  driveRoute(game, input, 0, -104, 8);
  game.cameraYaw = game.player.car.yaw + Math.PI;
  game.cameraPitch = 0.14;
  game.camDist = 9;
  game.camHeight = 3.4;
  return { screen: 'play' };
}
