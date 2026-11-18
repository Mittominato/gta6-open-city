// Rendering for Solmar Bay: the three.js scene, the chase camera, the HUD
// and the minimap. The HUD is plain DOM over the canvas (health, money,
// wanted stars, objective, speed, toasts) and the minimap is a small 2D
// canvas drawn top-down every frame: roads, the player, cars, police and
// the mission blip.
import * as THREE from 'three';
import { CFG, SKY } from './config.js';

/** Build the renderer, scene, lights and camera. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.day.sky);
  scene.fog = new THREE.Fog(SKY.day.fog, 120, 420);
  const sun = new THREE.DirectionalLight(SKY.day.sun, SKY.day.sunIntensity);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, SKY.day.hemi);
  scene.add(hemi);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  return { renderer, scene, camera, sun, hemi };
}

/** Resize the canvas and camera to the window. */
export function resize(renderer, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/**
 * Set the time of day: 'day' | 'dusk' | 'night'. The sun, sky, fog and
 * the city's windows and lamps follow it.
 */
export function setTimeOfDay(render, city, preset) {
  const s = SKY[preset] || SKY.day;
  render.scene.background = new THREE.Color(s.sky);
  render.scene.fog.color = new THREE.Color(s.fog);
  render.sun.color = new THREE.Color(s.sun);
  render.sun.intensity = s.sunIntensity;
  render.hemi.intensity = s.hemi;
  const night = preset === 'night' ? 1 : (preset === 'dusk' ? 0.45 : 0);
  city.setNight(night);
  render.sun.position.set(preset === 'night' ? -80 : 120, preset === 'night' ? 60 : 180, 60);
}

/** A pulsing beacon cylinder that marks the mission target in the world. */
export function createBeacon(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 20, 1, true), mat);
  mesh.visible = false;
  scene.add(mesh);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  scene.add(ring);
  return {
    mesh, ring,
    show(x, z, t) {
      mesh.visible = true;
      ring.visible = true;
      mesh.position.set(x, 15, z);
      ring.position.set(x, 0.15, z);
      const pulse = 0.6 + 0.4 * Math.sin(t * 3);
      mesh.material.opacity = 0.22 + 0.18 * pulse;
      ring.scale.setScalar(1 + 0.15 * Math.sin(t * 3));
    },
    hide() { mesh.visible = false; ring.visible = false; },
  };
}

/** A short-lived muzzle flash + tracer line for gunshots. */
export function createShotEffects(scene) {
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), flashMat);
  scene.add(flash);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, lineMat);
  scene.add(line);
  let life = 0;
  return {
    fire(from, to) {
      flash.position.copy(from);
      flashMat.opacity = 1;
      lineGeo.setFromPoints([from, to]);
      lineMat.opacity = 0.9;
      life = 0.09;
    },
    update(dt) {
      if (life <= 0) return;
      life -= dt;
      if (life <= 0) {
        flashMat.opacity = 0;
        lineMat.opacity = 0;
      }
    },
  };
}

/**
 * The HUD: cached DOM handles, updated every frame from the game state.
 * The minimap is a 140 px canvas: streets in grey, the park green, the
 * sea blue, the player white, traffic amber, police flashing red/blue and
 * the mission target a gold diamond.
 */
export function createHUD() {
  const el = (id) => document.getElementById(id);
  const hud = {
    health: el('health-fill'),
    healthText: el('health-text'),
    money: el('money'),
    stars: el('stars'),
    objective: el('objective'),
    objectiveDist: el('objective-dist'),
    speed: el('speed'),
    speedLabel: el('speed-label'),
    minimap: el('minimap'),
    toast: el('toast'),
    bust: el('bust-fill'),
    bustWrap: el('bust-wrap'),
    timer: el('timer'),
  };
  const mapCtx = hud.minimap.getContext('2d');
  let toastTimer = 0;

  function showToast(text, seconds) {
    hud.toast.textContent = text;
    hud.toast.style.opacity = '1';
    toastTimer = seconds || 3.5;
  }

  function drawMinimap(state) {
    const S = 140;
    const c = mapCtx;
    const scale = S / (CFG.HALF * 2 + 40);
    const toMap = (v) => (v + CFG.HALF + 20) * scale;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#20242c';
    c.fillRect(0, 0, S, S);
    // Sea and beach along the south-west edge.
    c.fillStyle = '#2e6f8e';
    c.fillRect(0, 0, S, toMap(-CFG.HALF));
    c.fillStyle = '#dcc48f';
    c.fillRect(0, toMap(-CFG.HALF), S, 4);
    // Park.
    c.fillStyle = '#4d7a3a';
    c.fillRect(toMap(-CFG.PITCH - CFG.BLOCK / 2), toMap(-CFG.PITCH - CFG.BLOCK / 2), CFG.BLOCK * scale, CFG.BLOCK * scale);
    // Streets.
    c.fillStyle = '#565b64';
    for (const s of CFG.streetCentres()) {
      c.fillRect(toMap(s) - CFG.STREET * scale / 2, 0, CFG.STREET * scale, S);
      c.fillRect(0, toMap(s) - CFG.STREET * scale / 2, S, CFG.STREET * scale);
    }
    // Mission blip.
    const target = state.missions.targetPos();
    if (target) {
      const bx = toMap(target.x);
      const by = toMap(target.z);
      c.fillStyle = '#ffc233';
      c.save();
      c.translate(bx, by);
      c.rotate(Math.PI / 4);
      const pulse = 4 + Math.sin(state.time * 4) * 1.5;
      c.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      c.restore();
    }
    // Traffic cars.
    c.fillStyle = '#f7c600';
    for (const car of state.traffic.cars) c.fillRect(toMap(car.x) - 1.5, toMap(car.z) - 1.5, 3, 3);
    // Police, flashing.
    c.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#ff2222' : '#2266ff';
    for (const car of state.police.units) c.fillRect(toMap(car.x) - 2, toMap(car.z) - 2, 4, 4);
    // Player.
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(toMap(state.player.x), toMap(state.player.z), 3.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    c.beginPath();
    c.moveTo(toMap(state.player.x), toMap(state.player.z));
    c.lineTo(toMap(state.player.x) + Math.sin(state.player.yaw) * 8, toMap(state.player.z) + Math.cos(state.player.yaw) * 8);
    c.stroke();
  }

  function update(state, dt) {
    const p = state.player;
    hud.health.style.width = `${Math.max(0, p.health)}%`;
    hud.healthText.textContent = `HP ${Math.ceil(p.health)}`;
    hud.money.textContent = `$${p.money.toLocaleString('en-US')}`;
    const stars = state.police.stars;
    hud.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    hud.stars.className = stars > 0 ? 'wanted-hot' : '';
    hud.objective.textContent = state.missions.objectiveText();
    const target = state.missions.targetPos();
    if (target) {
      const d = Math.hypot(p.x - target.x, p.z - target.z);
      hud.objectiveDist.textContent = `${Math.round(d)} m`;
    } else {
      hud.objectiveDist.textContent = '';
    }
    if (p.car) {
      hud.speed.textContent = `${Math.round(Math.abs(p.car.speed) * 3.6)}`;
      hud.speedLabel.textContent = 'km/h';
    } else {
      hud.speed.textContent = `${Math.round(p.speed * 3.6)}`;
      hud.speedLabel.textContent = 'km/h';
    }
    const bust = state.police.bustProgress;
    hud.bustWrap.style.opacity = bust > 0 ? '1' : '0';
    hud.bust.style.width = `${bust * 100}%`;
    const t = state.missions.timer;
    hud.timer.textContent = t > 0 ? `⏱ ${Math.ceil(t)}s` : '';
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) hud.toast.style.opacity = '0';
    }
    drawMinimap(state);
  }

  return { update, showToast };
}

/**
 * Chase camera: behind the player on foot, further back and higher in a
 * car, smoothed so it never snaps. Mouse drag orbits around the player.
 */
export function updateCamera(camera, state, input, dt) {
  const p = state.player;
  const delta = input.takeMouseDelta();
  state.cameraYaw -= delta.x * 0.004;
  state.cameraPitch = Math.max(-0.15, Math.min(0.55, state.cameraPitch + delta.y * 0.003));
  if (p.car) state.cameraYaw = THREE.MathUtils.lerp(state.cameraYaw, p.car.yaw + Math.PI, Math.min(1, dt * 1.2));
  const inCar = !!p.car;
  const dist = inCar ? CFG.CAMERA_DISTANCE_CAR : CFG.CAMERA_DISTANCE;
  const height = inCar ? CFG.CAMERA_HEIGHT_CAR : CFG.CAMERA_HEIGHT;
  const cx = p.x - Math.sin(state.cameraYaw) * Math.cos(state.cameraPitch) * dist;
  const cz = p.z - Math.cos(state.cameraYaw) * Math.cos(state.cameraPitch) * dist;
  const cy = height + Math.sin(state.cameraPitch) * dist * 0.6;
  camera.position.set(
    THREE.MathUtils.lerp(camera.position.x, cx, Math.min(1, dt * 8)),
    THREE.MathUtils.lerp(camera.position.y, cy, Math.min(1, dt * 8)),
    THREE.MathUtils.lerp(camera.position.z, cz, Math.min(1, dt * 8)),
  );
  const lookY = inCar ? 1.6 : 1.5;
  camera.lookAt(p.x, lookY, p.z);
}
