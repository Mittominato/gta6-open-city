// The player on foot: Rook, new in Solmar Bay.
// WASD moves relative to the camera, Shift runs, E gets in and out of
// cars, F throws a punch and a mouse click fires the pistol. Combat is a
// short hitscan: the nearest pedestrian, cop car or traffic car in front
// of the player inside the weapon's range takes the hit.
import * as THREE from 'three';
import { CFG, KEYS } from './config.js';

/** Build Rook's low-poly figure: jacket, head, limbs that swing as he walks. */
function buildPlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e5e8c, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b88a, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2c2c34, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.78, 0.32), jacket);
  body.position.y = 1.08;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.66;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.38),
    new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }));
  cap.position.y = 1.86;
  group.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.22), pants);
  legL.position.set(-0.15, 0.36, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.64, 0.17), jacket);
  armL.position.set(-0.37, 1.08, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.37;
  group.add(armR);
  group.userData = { legL, legR, armL, armR, phase: 0 };
  return group;
}

/**
 * Create the player. `start` is a { x, z } spot. The player object is the
 * single source of truth the renderer, police and missions read.
 */
export function createPlayer(scene, start) {
  const mesh = buildPlayerMesh();
  mesh.position.set(start.x, 0, start.z);
  scene.add(mesh);
  return {
    mesh, x: start.x, z: start.z, yaw: Math.PI,
    speed: 0, health: CFG.PLAYER_HEALTH, money: 0,
    car: null, weapon: 'pistol', ammo: CFG.PISTOL_AMMO_START,
    punchCooldown: 0, shootCooldown: 0, walkPhase: 0,
    stats: { carsStolen: 0, shotsFired: 0, pedsHit: 0, copsDown: 0 },
  };
}

/** Damage the player; returns true when the player is wasted. */
export function damagePlayer(player, amount) {
  player.health = Math.max(0, player.health - amount);
  return player.health <= 0;
}

/**
 * One on-foot step. Returns an event object for notable moments (a car
 * stolen, a shot fired, a punch landing) or null.
 */
export function updatePlayer(player, input, cameraYaw, dt, ctx) {
  const { city, traffic, police, audio } = ctx;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);

  // Movement relative to the camera.
  const fwd = input.anyDown(KEYS.FORWARD) ? 1 : 0;
  const back = input.anyDown(KEYS.BACK) ? 1 : 0;
  const left = input.anyDown(KEYS.LEFT) ? 1 : 0;
  const right = input.anyDown(KEYS.RIGHT) ? 1 : 0;
  const run = input.anyDown(KEYS.RUN);
  const mx = right - left;
  const mz = fwd - back;
  const moving = mx !== 0 || mz !== 0;
  const targetSpeed = moving ? (run ? CFG.RUN_SPEED : CFG.WALK_SPEED) : 0;
  player.speed = THREE.MathUtils.lerp(player.speed, targetSpeed, Math.min(1, dt * 10));
  if (moving) {
    const wish = Math.atan2(
      Math.sin(cameraYaw) * mz + Math.cos(cameraYaw) * mx,
      Math.cos(cameraYaw) * mz - Math.sin(cameraYaw) * mx,
    );
    let dyaw = wish - player.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    player.yaw += Math.max(-10 * dt, Math.min(10 * dt, dyaw));
    const nx = player.x + Math.sin(player.yaw) * player.speed * dt;
    const nz = player.z + Math.cos(player.yaw) * player.speed * dt;
    const fixed = city.resolveBuildingCollision(nx, nz, CFG.PLAYER_RADIUS);
    player.x = Math.max(-CFG.HALF + 2, Math.min(CFG.HALF - 2, fixed.x));
    player.z = Math.max(-CFG.HALF + 2, Math.min(CFG.HALF - 2, fixed.z));
    player.walkPhase += dt * player.speed * 1.6;
  }
  const swing = Math.sin(player.walkPhase) * (player.speed > 0.5 ? 0.55 : 0);
  player.mesh.userData.legL.rotation.x = swing;
  player.mesh.userData.legR.rotation.x = -swing;
  player.mesh.userData.armL.rotation.x = -swing * 0.7;
  player.mesh.userData.armR.rotation.x = swing * 0.7;
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.yaw;

  // Enter the nearest car (parked or traffic) with E.
  if (input.justPressed('KeyE')) {
    const car = traffic.nearestCar(player.x, player.z, 4, true);
    if (car) {
      const stolen = car.parked || car.kind !== 'parked';
      traffic.takeCar(car);
      player.car = car;
      player.car.parked = false;
      player.mesh.visible = false;
      player.stats.carsStolen += 1;
      police.addHeat(CFG.HEAT_STEAL_CAR, 'stole a car');
      traffic.scarePeds(player.x, player.z, 12);
      return { type: 'stole-car', car };
    }
  }

  // Punch with F: the nearest pedestrian in front, inside range.
  if (input.justPressed('KeyF') && player.punchCooldown <= 0) {
    player.punchCooldown = CFG.PUNCH_COOLDOWN;
    audio.punch();
    const ped = traffic.nearestPed(player.x, player.z, CFG.PUNCH_RANGE);
    if (ped) {
      ped.alive = false;
      ped.mesh.visible = false;
      player.stats.pedsHit += 1;
      police.addHeat(CFG.HEAT_HIT_PED, 'hit a pedestrian');
      traffic.scarePeds(player.x, player.z, 16);
      return { type: 'punched-ped', ped };
    }
  }

  // Shoot with a mouse click: hitscan against the nearest ped or car in
  // front of the player, inside pistol range.
  if (input.justPressed('Mouse0') && player.shootCooldown <= 0 && player.ammo > 0) {
    player.shootCooldown = CFG.PISTOL_COOLDOWN;
    player.ammo -= 1;
    player.stats.shotsFired += 1;
    audio.shot();
    traffic.scarePeds(player.x, player.z, 24);
    police.addHeat(CFG.HEAT_SHOT, 'fired a shot');
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    let best = null;
    let bestD = CFG.PISTOL_RANGE;
    for (const ped of traffic.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < bestD && side < 1.2) { bestD = ahead; best = { kind: 'ped', target: ped }; }
    }
    for (const car of traffic.cars.concat(police.units)) {
      const dx = car.x - player.x;
      const dz = car.z - player.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < bestD && side < 2) { bestD = ahead; best = { kind: 'car', target: car }; }
    }
    if (best) {
      if (best.kind === 'ped') {
        best.target.alive = false;
        best.target.mesh.visible = false;
        player.stats.pedsHit += 1;
        police.addHeat(CFG.HEAT_HIT_PED, 'hit a pedestrian');
      } else {
        best.target.health -= CFG.PISTOL_DAMAGE;
        if (best.target.kind === 'police' && best.target.health <= 0) {
          best.target.health = 100;
          player.stats.copsDown += 1;
          police.addHeat(CFG.HEAT_KILL_COP, 'took down a cop car');
        }
      }
      return { type: 'shot-hit', hit: best.kind, dist: bestD };
    }
    return { type: 'shot-miss' };
  }
  return null;
}

/** Step out of the car next to it. */
export function exitCar(player, city) {
  const car = player.car;
  if (!car) return;
  player.car = null;
  const side = { x: Math.cos(car.yaw), z: -Math.sin(car.yaw) };
  player.x = car.x + side.x * 2.2;
  player.z = car.z + side.z * 2.2;
  const fixed = city.resolveBuildingCollision(player.x, player.z, CFG.PLAYER_RADIUS);
  player.x = fixed.x;
  player.z = fixed.z;
  player.yaw = car.yaw;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
}
