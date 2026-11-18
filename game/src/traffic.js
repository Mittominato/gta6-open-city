// Traffic and pedestrians: the city alive around the player.
// Traffic cars follow the street graph, slowing for the car ahead; parked
// cars wait to be stolen; pedestrians walk the sidewalks and scatter when
// a shot is fired or a car comes at them.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';
import { buildCarMesh, createCar, driveCar, carForward } from './vehicles.js';

/** A pedestrian: a small low-poly figure with a walking bob. */
function buildPedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: rng.pick([0xd94f30, 0x3f7fbf, 0x57a773, 0xe0a030, 0x7a5fb0, 0xdde0e3]), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: rng.pick([0xe8b88a, 0xc98d64, 0x8a5a3b, 0xf0c8a0]), roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: rng.pick([0x2c3e50, 0x4a4a4a, 0x5b3a29]), roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.6;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.22), pants);
  legL.position.set(-0.14, 0.34, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.6, 0.16), shirt);
  armL.position.set(-0.34, 1.05, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.34;
  group.add(armR);
  group.userData = { legL, legR, armL, armR, phase: rng.angle() };
  return group;
}

/** Create the traffic system: cars on the graph, walkers on the sidewalks. */
export function createTraffic(city, scene, rng) {
  const cars = [];
  const peds = [];
  const parked = [];

  function spawnTrafficCar() {
    const node = rng.pick(city.nodes);
    const kind = rng.chance(0.12) ? 'taxi' : (rng.chance(0.08) ? 'sport' : 'sedan');
    const color = kind === 'taxi' ? PALETTE.taxi : rng.pick(PALETTE.car);
    const mesh = buildCarMesh(color, kind);
    scene.add(mesh);
    const car = createCar(mesh, node.x, node.z, rng.angle(), kind);
    car.speed = rng.range(CFG.TRAFFIC_SPEED_MIN, CFG.TRAFFIC_SPEED_MAX);
    car.targetNode = rng.pick(city.neighbours[city.nodes.indexOf(node)]);
    car.wait = 0;
    cars.push(car);
    return car;
  }

  for (let i = 0; i < CFG.TRAFFIC_CARS; i += 1) spawnTrafficCar();

  // Parked cars from the city become stealable traffic cars with no driver.
  for (const spot of city.parked) {
    const car = createCar(spot.mesh, spot.x, spot.z, spot.yaw, 'parked');
    car.parked = true;
    parked.push(car);
  }

  function spawnPed() {
    const centres = CFG.streetCentres();
    const vertical = rng.chance(0.5);
    const street = rng.pick(centres);
    const along = rng.range(-CFG.HALF + 10, CFG.HALF - 10);
    const x = vertical ? street + CFG.STREET / 2 + 1.2 : along;
    const z = vertical ? along : street + CFG.STREET / 2 + 1.2;
    const mesh = buildPedMesh(rng);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    const ped = {
      mesh, x, z, yaw: rng.angle(), speed: rng.range(CFG.PED_SPEED_MIN, CFG.PED_SPEED_MAX),
      walkPhase: rng.angle(), fleeing: 0, alive: true, vertical,
    };
    peds.push(ped);
    return ped;
  }
  for (let i = 0; i < CFG.PEDESTRIANS; i += 1) spawnPed();

  function nearestCar(x, z, maxDist, includeParked) {
    let best = null;
    let bestD = maxDist;
    const list = includeParked ? cars.concat(parked) : cars;
    for (const car of list) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function nearestPed(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const ped of peds) {
      if (!ped.alive) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  /** Pedestrians near (x, z) run away from it for a few seconds. */
  function scarePeds(x, z, radius) {
    for (const ped of peds) {
      if (!ped.alive) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius) {
        ped.fleeing = 4;
        ped.yaw = Math.atan2(ped.x - x, ped.z - z);
      }
    }
  }

  function update(dt, playerPos, playerSpeed) {
    // Traffic cars: drive toward their target node, turn at intersections,
    // and brake for the car ahead.
    for (const car of cars) {
      const target = city.nodes[car.targetNode];
      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3) {
        const idx = city.nodes.indexOf(target);
        car.targetNode = rng.pick(city.neighbours[idx]);
        continue;
      }
      const wantYaw = Math.atan2(dx, dz);
      let dyaw = wantYaw - car.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, dyaw * 2));
      // Brake for a car ahead.
      let blocked = false;
      const f = carForward(car);
      for (const other of cars) {
        if (other === car) continue;
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const ahead = ox * f.x + oz * f.z;
        const side = Math.abs(ox * f.z - oz * f.x);
        if (ahead > 0 && ahead < 9 && side < 2.4) { blocked = true; break; }
      }
      const throttle = blocked ? (car.speed > 0.3 ? -0.8 : 0) : 0.55;
      driveCar(car, throttle, steer, false, dt);
      const fixed = city.resolveBuildingCollision(car.x, car.z, 1.6);
      car.x = fixed.x; car.z = fixed.z;
      car.mesh.position.set(car.x, 0, car.z);
    }
    // Pedestrians: stroll the sidewalks, flee when scared.
    for (const ped of peds) {
      if (!ped.alive) continue;
      if (ped.fleeing > 0) {
        ped.fleeing -= dt;
        ped.speed = 3.4;
      } else {
        ped.speed = THREE.MathUtils.lerp(ped.speed, rng.range(CFG.PED_SPEED_MIN, CFG.PED_SPEED_MAX), dt * 0.2);
      }
      ped.x += Math.sin(ped.yaw) * ped.speed * dt;
      ped.z += Math.cos(ped.yaw) * ped.speed * dt;
      if (Math.abs(ped.x) > CFG.HALF - 6 || Math.abs(ped.z) > CFG.HALF - 6 || rng.chance(dt * 0.05)) {
        ped.yaw += Math.PI / 2 * (rng.chance(0.5) ? 1 : -1);
        ped.x = Math.max(-CFG.HALF + 6, Math.min(CFG.HALF - 6, ped.x));
        ped.z = Math.max(-CFG.HALF + 6, Math.min(CFG.HALF - 6, ped.z));
      }
      const fixed = city.resolveBuildingCollision(ped.x, ped.z, 0.4);
      ped.x = fixed.x; ped.z = fixed.z;
      ped.walkPhase += dt * ped.speed * 2.4;
      const swing = Math.sin(ped.walkPhase) * 0.45;
      ped.mesh.userData.legL.rotation.x = swing;
      ped.mesh.userData.legR.rotation.x = -swing;
      ped.mesh.userData.armL.rotation.x = -swing * 0.7;
      ped.mesh.userData.armR.rotation.x = swing * 0.7;
      ped.mesh.position.set(ped.x, 0, ped.z);
      ped.mesh.rotation.y = ped.yaw;
    }
  }

  return {
    cars, peds, parked, update, nearestCar, nearestPed, scarePeds,
    spawnTrafficCar,
    /** Remove a traffic car from the world (used when the player steals it). */
    takeCar(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      const j = parked.indexOf(car);
      if (j >= 0) parked.splice(j, 1);
    },
  };
}
