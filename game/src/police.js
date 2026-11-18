// The wanted system and the Solmar Bay police.
// Heat rises with every crime and cools when the player lies low; stars are
// heat in bands of twenty. Police cars spawn at the city edge, chase the
// player with a simple pursuit steer, and try to ram the player's car or,
// on foot, to close in and bust them.
import * as THREE from 'three';
import { CFG } from './config.js';
import { buildCarMesh, createCar, driveCar, carForward } from './vehicles.js';

/** Wanted stars from heat: 0..5. */
export function starsFromHeat(heat) {
  return Math.max(0, Math.min(5, Math.floor(heat / 20)));
}

export function createPolice(city, scene, rng) {
  const units = [];
  let heat = 0;
  let quietTimer = 0;
  let bustTimer = 0;
  let flash = 0;

  function wantedCount() {
    return Math.min(CFG.POLICE_MAX, starsFromHeat(heat) * CFG.POLICE_PER_STAR);
  }

  function spawnUnit() {
    const edge = rng.pick([
      { x: -CFG.HALF + 4, z: rng.range(-CFG.HALF + 20, CFG.HALF - 20) },
      { x: CFG.HALF - 4, z: rng.range(-CFG.HALF + 20, CFG.HALF - 20) },
      { x: rng.range(-CFG.HALF + 20, CFG.HALF - 20), z: -CFG.HALF + 4 },
      { x: rng.range(-CFG.HALF + 20, CFG.HALF - 20), z: CFG.HALF - 4 },
    ]);
    const mesh = buildCarMesh(CFG.police, 'police');
    scene.add(mesh);
    const car = createCar(mesh, edge.x, edge.z, rng.angle(), 'police');
    car.speed = 12;
    units.push(car);
    return car;
  }

  function addHeat(amount, reason) {
    heat = Math.min(CFG.HEAT_MAX, heat + amount);
    quietTimer = 0;
    return reason;
  }

  function update(dt, player, traffic) {
    flash += dt;
    // Cool down when the player has been quiet for a while.
    quietTimer += dt;
    if (quietTimer > CFG.HEAT_QUIET_SECONDS && heat > 0) {
      const rate = 3 - starsFromHeat(heat) * 0.4;
      heat = Math.max(0, heat - rate * dt);
    }
    // Keep the right number of units on the street.
    const want = wantedCount();
    while (units.length < want) spawnUnit();
    while (units.length > want) {
      const car = units.pop();
      scene.remove(car.mesh);
    }
    // Pursuit: steer at the player, ram the player's car, close in on foot.
    let nearest = Infinity;
    let busted = false;
    for (const car of units) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      const wantYaw = Math.atan2(dx, dz);
      let dyaw = wantYaw - car.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dyaw * 2.2));
      const throttle = dist > 4 ? 1 : 0.4;
      driveCar(car, throttle, steer, false, dt);
      const fixed = city.resolveBuildingCollision(car.x, car.z, 1.6);
      car.x = fixed.x; car.z = fixed.z;
      car.mesh.position.set(car.x, 0, car.z);
      // Flash the light bar red/blue, alternating twice a second.
      const bar = car.mesh.userData.lightbar;
      if (bar) {
        const phase = Math.floor(flash * 4) % 2 === 0;
        bar.red.emissiveIntensity = phase ? 2.5 : 0.2;
        bar.blue.emissiveIntensity = phase ? 0.2 : 2.5;
      }
      // Ram the player's car.
      if (player.car && dist < 4.4) {
        player.car.speed *= 0.94;
        player.car.health -= 14 * dt;
        if (player.car.health <= 0) player.car.smoking = true;
      }
      // On foot, a close cop starts the bust.
      if (!player.car && dist < CFG.BUST_DISTANCE && Math.abs(player.speed || 0) < 3) {
        bustTimer += dt;
        if (bustTimer > CFG.BUST_SECONDS) busted = true;
      }
    }
    if (nearest > CFG.BUST_DISTANCE + 4) bustTimer = Math.max(0, bustTimer - dt * 2);
    return { nearest, busted };
  }

  return {
    units,
    update, addHeat,
    get heat() { return heat; },
    set heat(v) { heat = Math.max(0, Math.min(CFG.HEAT_MAX, v)); },
    get stars() { return starsFromHeat(heat); },
    get bustProgress() { return Math.min(1, bustTimer / CFG.BUST_SECONDS); },
    resetBust() { bustTimer = 0; },
  };
}
