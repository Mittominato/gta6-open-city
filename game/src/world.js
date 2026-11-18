// Solmar Bay itself: a sun-soaked coastal grid city built once from a seed.
// The ground is a single canvas texture (asphalt, sidewalks, crosswalks,
// park grass, beach sand and sea), the buildings are boxes with procedural
// window textures, and the streets form a graph the traffic and the police
// drive on. Everything is placed from the seed, so the same seed rebuilds
// the same city.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';

/** Draw the whole ground texture: roads, sidewalks, park, beach, sea. */
function paintGroundTexture(rng) {
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const worldToPx = (v) => ((v + CFG.HALF) / (CFG.HALF * 2)) * S;
  const px = (v) => (v / (CFG.HALF * 2)) * S;
  // Base: sidewalk grey everywhere; roads and features paint over it.
  g.fillStyle = '#8a8d90';
  g.fillRect(0, 0, S, S);
  const centres = CFG.streetCentres();
  // Roads.
  g.fillStyle = '#2e3138';
  for (const c of centres) {
    g.fillRect(worldToPx(c) - px(CFG.STREET) / 2, 0, px(CFG.STREET), S);
    g.fillRect(0, worldToPx(c) - px(CFG.STREET) / 2, S, px(CFG.STREET));
  }
  // Lane dashes.
  g.fillStyle = '#d8c95a';
  for (const c of centres) {
    for (let t = -CFG.HALF; t < CFG.HALF; t += 12) {
      g.fillRect(worldToPx(c) - 2, worldToPx(t), 4, 18);
      g.fillRect(worldToPx(t), worldToPx(c) - 2, 18, 4);
    }
  }
  // Crosswalks at every intersection.
  g.fillStyle = '#e8e8e8';
  for (const cx of centres) {
    for (const cz of centres) {
      for (let k = -2; k <= 2; k += 1) {
        g.fillRect(worldToPx(cx + k * 2.2) - 4, worldToPx(cz) - px(CFG.STREET) / 2, 8, px(CFG.STREET) / 2 - 6);
        g.fillRect(worldToPx(cx) - px(CFG.STREET) / 2, worldToPx(cz + k * 2.2) - 4, px(CFG.STREET) / 2 - 6, 8);
      }
    }
  }
  // Park: the block at (-1, -1) from the centre is grass with paths.
  const parkX = -CFG.PITCH;
  const parkZ = -CFG.PITCH;
  g.fillStyle = '#4d7a3a';
  g.fillRect(worldToPx(parkX - CFG.BLOCK / 2), worldToPx(parkZ - CFG.BLOCK / 2), px(CFG.BLOCK), px(CFG.BLOCK));
  g.fillStyle = '#c9b489';
  g.fillRect(worldToPx(parkX) - 6, worldToPx(parkZ - CFG.BLOCK / 2), 12, px(CFG.BLOCK));
  g.fillRect(worldToPx(parkX - CFG.BLOCK / 2), worldToPx(parkZ) - 6, px(CFG.BLOCK), 12);
  // Beach and sea along the south-west edge.
  g.fillStyle = '#dcc48f';
  g.fillRect(0, worldToPx(-CFG.HALF), S, px(26));
  g.fillStyle = '#2e6f8e';
  g.fillRect(0, worldToPx(-CFG.HALF) - px(40), S, px(40));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A building facade texture: lit and unlit windows on a coloured wall. */
function paintFacadeTexture(rng, baseColor, lit) {
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 12;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const isLit = rng.chance(lit ? 0.75 : 0.12);
      g.fillStyle = isLit ? '#ffd27a' : '#2c3e50';
      g.fillRect(8 + c * 20, 10 + r * 20, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build one low-poly car body (used for parked cars in the world). */
export function buildParkedCarMesh(rng, color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.15, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.3), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.34, z);
    group.add(wheel);
  }
  return group;
}

/**
 * Build the city into `scene` and return its data: colliders, the road
 * graph, named spots and the handles the renderer needs for day/night.
 */
export function createCity(scene, rng) {
  const group = new THREE.Group();
  group.name = 'solmar-bay';
  scene.add(group);
  const centres = CFG.streetCentres();
  const colliders = [];
  const lamps = [];
  const windowMats = [];
  const HALF = CFG.HALF;

  // Ground: one textured plane, slightly below y=0 so curbs read.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + 80, HALF * 2 + 80),
    new THREE.MeshStandardMaterial({ map: paintGroundTexture(rng), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 20);
  ground.receiveShadow = false;
  group.add(ground);

  // Buildings: one or two boxes per block, skipping the park block and the
  // beach strip. Each gets a procedural facade; taller towers downtown.
  const parkBlock = { bx: -1, bz: -1 };
  const facadeCache = new Map();
  function facadeFor(color, lit) {
    const key = `${color}|${lit}`;
    if (!facadeCache.has(key)) facadeCache.set(key, paintFacadeTexture(rng, color, lit));
    return facadeCache.get(key);
  }
  const buildingSpots = [];
  for (let bx = 0; bx < CFG.BLOCKS; bx += 1) {
    for (let bz = 0; bz < CFG.BLOCKS; bz += 1) {
      if (bx === 3 && bz === 7) continue; // beach strip stays open
      if (bx === parkBlock.bx + 4 && bz === parkBlock.bz + 4) continue; // park
      const cx = -HALF + CFG.STREET + CFG.BLOCK / 2 + bx * CFG.PITCH;
      const cz = -HALF + CFG.STREET + CFG.BLOCK / 2 + bz * CFG.PITCH;
      const downtown = Math.abs(cx) < 110 && Math.abs(cz) < 110;
      const count = rng.chance(downtown ? 0.45 : 0.2) ? 2 : 1;
      for (let k = 0; k < count; k += 1) {
        const w = count === 2 ? CFG.BLOCK / 2 - 4 : CFG.BLOCK - 6;
        const d = CFG.BLOCK - 6;
        const h = downtown ? rng.range(18, 55) : rng.range(8, 22);
        const ox = count === 2 ? (k === 0 ? -CFG.BLOCK / 4 : CFG.BLOCK / 4) : 0;
        const color = rng.pick(PALETTE.building);
        const hex = `#${color.toString(16).padStart(6, '0')}`;
        const mat = new THREE.MeshStandardMaterial({
          map: facadeFor(hex, false),
          emissiveMap: facadeFor(hex, true),
          emissive: 0xffffff,
          emissiveIntensity: 0,
          roughness: 0.85,
        });
        windowMats.push(mat);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(cx + ox, h / 2, cz);
        group.add(mesh);
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        buildingSpots.push({ x: cx + ox, z: cz, w, d, h });
      }
    }
  }

  // Street lamps at every intersection corner.
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: PALETTE.lamp, roughness: 0.6, metalness: 0.5 });
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffdf80, emissiveIntensity: 0 });
  lamps.push(lampHeadMat);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
  const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
  for (const cx of centres) {
    for (const cz of centres) {
      const pole = new THREE.Mesh(poleGeo, lampPoleMat);
      pole.position.set(cx + CFG.STREET / 2 - 0.8, 2.7, cz + CFG.STREET / 2 - 0.8);
      group.add(pole);
      const head = new THREE.Mesh(headGeo, lampHeadMat);
      head.position.set(cx + CFG.STREET / 2 - 0.8, 5.5, cz + CFG.STREET / 2 - 0.8);
      group.add(head);
    }
  }

  // Park trees: cones on cylinders, plus a few palms near the beach.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d6b2f, roughness: 0.9 });
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 0.9 });
  for (let i = 0; i < 26; i += 1) {
    const x = -CFG.PITCH + rng.range(-16, 16);
    const z = -CFG.PITCH + rng.range(-16, 16);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 6), trunkMat);
    trunk.position.set(x, 1.1, z);
    group.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(rng.range(1.4, 2.2), rng.range(3, 4.6), 7), leafMat);
    leaves.position.set(x, 3.6, z);
    group.add(leaves);
  }
  for (let i = 0; i < 10; i += 1) {
    const x = -HALF + 14 + i * 44 + rng.range(-6, 6);
    const z = -HALF + 8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 4.5, 6), trunkMat);
    trunk.position.set(x, 2.25, z);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 2.4, 7), palmMat);
    top.position.set(x, 5.2, z);
    group.add(top);
  }

  // The pier: a wooden walkway out over the sea at the south-west corner,
  // where the story ends.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 46), pierMat);
  pier.position.set(-208, 0.4, -HALF - 20);
  group.add(pier);
  for (let i = 0; i < 5; i += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6), pierMat);
    post.position.set(-210.5, 0.2, -HALF - 4 - i * 9);
    group.add(post);
    const post2 = post.clone();
    post2.position.x = -205.5;
    group.add(post2);
  }

  // Parked cars along the kerbs, ready to steal.
  const parked = [];
  for (let i = 0; i < CFG.PARKED_CARS; i += 1) {
    const along = rng.pick(centres);
    const across = rng.pick(centres);
    const vertical = rng.chance(0.5);
    const x = vertical ? along + CFG.STREET / 2 - 1.6 : across + rng.range(-CFG.BLOCK / 2, CFG.BLOCK / 2);
    const z = vertical ? across + rng.range(-CFG.BLOCK / 2, CFG.BLOCK / 2) : along + CFG.STREET / 2 - 1.6;
    if (Math.abs(x) > HALF - 8 || Math.abs(z) > HALF - 8) continue;
    const mesh = buildParkedCarMesh(rng, rng.pick(PALETTE.car));
    mesh.position.set(x, 0, z);
    mesh.rotation.y = vertical ? 0 : Math.PI / 2;
    group.add(mesh);
    parked.push({ x, z, yaw: mesh.rotation.y, color: mesh.children[0].material.color.getHex(), mesh });
  }

  // Road graph: intersections are nodes; neighbours are one street away.
  const nodes = [];
  const nodeIndex = new Map();
  for (const cx of centres) {
    for (const cz of centres) {
      nodeIndex.set(`${cx},${cz}`, nodes.length);
      nodes.push({ x: cx, z: cz });
    }
  }
  const neighbours = nodes.map((n, i) => {
    const list = [];
    const ix = centres.indexOf(n.x);
    const iz = centres.indexOf(n.z);
    if (ix > 0) list.push(nodeIndex.get(`${centres[ix - 1]},${n.z}`));
    if (ix < centres.length - 1) list.push(nodeIndex.get(`${centres[ix + 1]},${n.z}`));
    if (iz > 0) list.push(nodeIndex.get(`${n.x},${centres[iz - 1]}`));
    if (iz < centres.length - 1) list.push(nodeIndex.get(`${n.x},${centres[iz + 1]}`));
    return list;
  });

  /** True when the circle at (x, z) with radius r overlaps a building. */
  function hitsBuilding(x, z, r) {
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return c;
    }
    return null;
  }

  /** Push a circle out of any building it overlaps; returns the fixed position. */
  function resolveBuildingCollision(x, z, r) {
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        const pushLeft = (x + r) - c.minX;
        const pushRight = c.maxX - (x - r);
        const pushUp = (z + r) - c.minZ;
        const pushDown = c.maxZ - (z - r);
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) x = c.minX - r;
        else if (m === pushRight) x = c.maxX + r;
        else if (m === pushUp) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
    return { x, z };
  }

  return {
    group, colliders, nodes, neighbours, parked, windowMats, lampHeadMat,
    hitsBuilding, resolveBuildingCollision,
    /** Night factor 0 (day) to 1 (night): windows glow, lamps light up. */
    setNight(factor) {
      for (const m of windowMats) m.emissiveIntensity = factor * 0.9;
      lampHeadMat.emissiveIntensity = factor * 2.2;
    },
  };
}
