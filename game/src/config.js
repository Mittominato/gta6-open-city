// Solmar Bay — shared constants for the whole game.
// One place for every number the other modules tune against, so a balance
// change never means hunting through files.
export const CFG = {
  // City layout: 8 x 8 blocks, 40 m blocks, 12 m streets.
  BLOCKS: 8,
  BLOCK: 40,
  STREET: 12,
  // Pitch between neighbouring street centrelines.
  get PITCH() { return this.BLOCK + this.STREET; },
  // Half the city span, in metres, from the centre to the outer street edge.
  get HALF() { return (this.BLOCKS * this.BLOCK + (this.BLOCKS + 1) * this.STREET) / 2; },
  // Street centreline coordinates, one per street, in both axes.
  streetCentres() {
    const list = [];
    for (let i = 0; i <= this.BLOCKS; i += 1) {
      list.push(-this.HALF + this.STREET / 2 + i * this.PITCH);
    }
    return list;
  },
  // Player on foot.
  WALK_SPEED: 5.2,
  RUN_SPEED: 8.5,
  PLAYER_RADIUS: 0.55,
  PLAYER_HEALTH: 100,
  // Arcade car physics.
  CAR_ACCEL: 16,
  CAR_BRAKE: 30,
  CAR_REVERSE: 10,
  CAR_MAX_SPEED: 34,
  CAR_MAX_REVERSE: 10,
  CAR_TURN: 1.9,
  CAR_GRIP: 6.5,
  // Traffic.
  TRAFFIC_CARS: 14,
  TRAFFIC_SPEED_MIN: 7,
  TRAFFIC_SPEED_MAX: 11,
  PEDESTRIANS: 22,
  PED_SPEED_MIN: 1.1,
  PED_SPEED_MAX: 1.9,
  PARKED_CARS: 10,
  // Wanted level.
  HEAT_STEAL_CAR: 25,
  HEAT_HIT_PED: 15,
  HEAT_SHOT: 10,
  HEAT_KILL_COP: 40,
  HEAT_MAX: 100,
  HEAT_QUIET_SECONDS: 15,
  POLICE_PER_STAR: 1,
  POLICE_MAX: 6,
  POLICE_SPEED: 24,
  BUST_DISTANCE: 3.2,
  BUST_SECONDS: 2.5,
  // Combat.
  PUNCH_DAMAGE: 12,
  PUNCH_RANGE: 2.2,
  PUNCH_COOLDOWN: 0.45,
  PISTOL_DAMAGE: 34,
  PISTOL_RANGE: 60,
  PISTOL_COOLDOWN: 0.35,
  PISTOL_AMMO_START: 24,
  PISTOL_AMMO_MAX: 120,
  // Missions: rewards in dollars.
  MISSION_REWARDS: [300, 800, 1500],
  MISSION_1_TIMER: 150,
  ROBBERY_HOLD_SECONDS: 4,
  // Camera.
  CAMERA_DISTANCE: 9,
  CAMERA_HEIGHT: 4.2,
  CAMERA_DISTANCE_CAR: 12,
  CAMERA_HEIGHT_CAR: 5,
  // Fixed simulation step (seconds).
  STEP: 1 / 60,
  // Shot scenes.
  SHOT_NAMES: ['cover', 'chase', 'mission', 'night'],
};

// Story beats, in the order the player plays them. Each mission is a small
// chain of steps; a step is done when the player reaches its marker (or,
// for the robbery, stands in it for ROBBERY_HOLD_SECONDS).
export const MISSIONS = [
  {
    id: 1,
    title: 'First Delivery',
    giver: 'Mara Voss',
    intro: 'Mara needs a package moved across town. Pick it up at the pier warehouse, then drop it at the Marisol Hotel. No cops, no questions.',
    steps: [
      { label: 'Pick up the package at the pier warehouse', spot: 'pierWarehouse', radius: 4 },
      { label: 'Deliver the package to the Marisol Hotel', spot: 'hotel', radius: 4 },
    ],
  },
  {
    id: 2,
    title: 'The Corner Shop',
    giver: 'Mara Voss',
    intro: 'Rent is due and the corner shop keeps its cash in a till, not a vault. Walk in, hold the till, and get out before the sirens find you.',
    steps: [
      { label: 'Go to the corner shop on Bay Street', spot: 'cornerShop', radius: 4 },
      { label: 'Hold the till — stay inside the shop', spot: 'cornerShop', radius: 4, hold: true },
      { label: 'Lose the heat — reach the hideout garage', spot: 'hideout', radius: 5 },
    ],
  },
  {
    id: 3,
    title: 'Harbor Lights',
    giver: 'Mara Voss',
    intro: 'The job is done and the whole city is looking for you. Get to the boat at the end of the pier and Solmar Bay is behind you.',
    steps: [
      { label: 'Reach the boat at the end of the pier', spot: 'pierEnd', radius: 5 },
    ],
  },
];

// Named places on the map. Spots are { x, z } in world metres.
export const SPOTS = {
  playerStart: { x: -104, z: 130 },
  pierWarehouse: { x: -195, z: -195 },
  pierEnd: { x: -208, z: -208 },
  hotel: { x: 104, z: 52 },
  cornerShop: { x: 0, z: -52 },
  hideout: { x: 156, z: 156 },
  downtown: { x: 0, z: 0 },
};

// Keyboard bindings. Codes are KeyboardEvent.code values.
export const KEYS = {
  FORWARD: ['KeyW', 'ArrowUp'],
  BACK: ['KeyS', 'ArrowDown'],
  LEFT: ['KeyA', 'ArrowLeft'],
  RIGHT: ['KeyD', 'ArrowRight'],
  RUN: ['ShiftLeft', 'ShiftRight'],
  HANDBRAKE: ['Space'],
  ENTER_CAR: ['KeyE'],
  PUNCH: ['KeyF'],
  SHOOT: ['Mouse0'],
  PAUSE: ['KeyP', 'Escape'],
  MUTE: ['KeyM'],
  RESTART: ['KeyR'],
  CONFIRM: ['Enter', 'Space'],
};

// Colours of the city, as hex numbers for three.js materials.
export const PALETTE = {
  asphalt: 0x2e3138,
  sidewalk: 0x8a8d90,
  building: [0xd8c9a3, 0xb8a88e, 0xc4b49a, 0x9fb4c0, 0xd0a58a, 0xa8b89a],
  glassDay: 0x7fb2d9,
  glassNight: 0xffd27a,
  parkGrass: 0x4d7a3a,
  sand: 0xdcc48f,
  sea: 0x2e6f8e,
  lamp: 0x3a3f46,
  car: [0xc0392b, 0x2980b9, 0xf1c40f, 0xecf0f1, 0x1abc9c, 0x8e44ad, 0xe67e22, 0x34495e],
  police: 0x1a1a2e,
  taxi: 0xf7c600,
};

// Day and night lighting presets, lerped by the renderer.
export const SKY = {
  day: { sky: 0x87b5e0, fog: 0x9fc4e4, sun: 0xfff2d8, sunIntensity: 2.6, hemi: 0.9, ambient: 0.55 },
  dusk: { sky: 0xe8905a, fog: 0xd99a6c, sun: 0xffb36b, sunIntensity: 1.7, hemi: 0.6, ambient: 0.4 },
  night: { sky: 0x0d1526, fog: 0x101a2e, sun: 0x8fa8ff, sunIntensity: 0.35, hemi: 0.25, ambient: 0.18 },
};
