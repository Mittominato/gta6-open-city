// Vehicles: how a car looks and how it drives.
// Cars are built from boxes (body, cabin, wheels, lights) so they cost
// almost nothing to render, and they drive on simple arcade physics:
// throttle, brake, reverse and steering that bites harder at low speed.
// The same mesh builder serves the player's car, traffic and the police.
import * as THREE from 'three';
import { CFG } from './config.js';

/** Build a car mesh. `kind` is 'sedan' | 'taxi' | 'police' | 'sport'. */
export function buildCarMesh(color, kind) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.12, metalness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.08, -0.25);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.34, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  // Headlights and tail lights, so cars read at night.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    lamp.position.set(x, 0.62, 2.16);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xcc0000, emissiveIntensity: 0.7 });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    lamp.position.set(x, 0.62, -2.16);
    group.add(lamp);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf7c600, emissive: 0xaa8800, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.5, -0.25);
    group.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
    bar.position.set(0, 1.48, -0.25);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 }));
    red.position.set(-0.28, 1.58, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x0044ff, emissive: 0x0044ff, emissiveIntensity: 2 }));
    blue.position.set(0.28, 1.58, -0.25);
    group.add(blue);
    group.userData.lightbar = { red: red.material, blue: blue.material };
  }
  if (kind === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), darkMat);
    spoiler.position.set(0, 1.05, -2.05);
    group.add(spoiler);
  }
  group.userData.wheels = wheels;
  return group;
}

/** A car in the world: mesh, position, heading and arcade speed. */
export function createCar(mesh, x, z, yaw, kind) {
  return {
    mesh, kind: kind || 'sedan', x, z, yaw, speed: 0, steer: 0,
    health: 100, smoking: false, driver: null, brakeLight: false,
  };
}

/** Forward unit vector of a car, in world space. */
export function carForward(car) {
  return { x: Math.sin(car.yaw), z: Math.cos(car.yaw) };
}

/**
 * Arcade drive step: throttle -1..1, steer -1..1. The car turns more at
 * low speed and slides a little when the handbrake is held.
 */
export function driveCar(car, throttle, steer, handbrake, dt) {
  const maxSpeed = car.kind === 'police' ? CFG.POLICE_SPEED + 4 : CFG.CAR_MAX_SPEED;
  if (throttle > 0) car.speed += CFG.CAR_ACCEL * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed -= CFG.CAR_BRAKE * dt;
    else car.speed -= CFG.CAR_REVERSE * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 20 * dt);
  car.speed = Math.max(-CFG.CAR_MAX_REVERSE, Math.min(maxSpeed, car.speed));
  const turnRate = CFG.CAR_TURN * (1 - Math.min(0.55, Math.abs(car.speed) / maxSpeed * 0.55));
  car.yaw += steer * turnRate * dt * Math.sign(car.speed || 1) * (handbrake ? 1.5 : 1);
  const f = carForward(car);
  car.x += f.x * car.speed * dt;
  car.z += f.z * car.speed * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.yaw;
  const spin = car.speed * dt / 0.34;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  const front = car.mesh.userData.wheels.slice(0, 2);
  for (const w of front) w.rotation.y = steer * 0.35;
  car.brakeLight = throttle < 0;
}
