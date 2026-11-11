import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACKS, buildTrack } from './track.js';
import { loadBikeTemplates, createBikeVisual, createShowroomBike } from './bike.js';
import { setupEnvironment, THEMES, makeParticleSystems } from './env.js';
import { AudioSystem } from './audio.js';
import { glowTexture } from './textures.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (v, target, lambda, dt) => lerp(v, target, 1 - Math.exp(-lambda * dt));
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};
const fmtGap = (s) => (s <= 0 ? '—' : `+${s.toFixed(1)}`);
const hex = (n) => '#' + new THREE.Color(n).getHexString();

const ROUNDS = [
  {
    trackId: 'harbor', name: 'HARBOR SPRINT', city: 'PORT AZURE', laps: 2,
    theme: 'day', label: 'ДЕНЬ', difficulty: 0.9,
    intro: 'Тёплый асфальт, широкие дуги и длинная прямая у гавани.',
  },
  {
    trackId: 'ridge', name: 'RIDGE RUN', city: 'SIERRA ALTA', laps: 3,
    theme: 'sunset', label: 'ЗАКАТ', difficulty: 0.98,
    intro: 'Техничная трасса в горах. Тормози раньше — выходи быстрее.',
  },
  {
    trackId: 'bay', name: 'NEON BAY', city: 'NEO HAZE', laps: 3,
    theme: 'night', label: 'НОЧЬ', difficulty: 1.05,
    intro: 'Ночной мегаполис. Неон, свет фар и максимальная скорость.',
  },
];

const RIDER_POOL = [
  { id: 'voss', name: 'KAI VOSS', short: 'VOSS', accent: '#ff4d5e', bike: 1, baseSkill: 1.02 },
  { id: 'tanaka', name: 'MIRA TANAKA', short: 'TANAKA', accent: '#32e6ff', bike: 0, baseSkill: 0.985 },
  { id: 'duarte', name: 'LUCAS DUARTE', short: 'DUARTE', accent: '#ffd166', bike: 1, baseSkill: 0.96 },
  { id: 'reyes', name: 'ANA REYES', short: 'REYES', accent: '#9dff6b', bike: 0, baseSkill: 0.94 },
  { id: 'novak', name: 'SASHA NOVAK', short: 'NOVAK', accent: '#c084fc', bike: 1, baseSkill: 0.92 },
];
const POINTS = [25, 18, 15, 12, 10, 8];
const SAVE_KEY = 'apexgp.v1';

const state = {
  screen: 'loading',
  templates: [],
  save: null,
  audio: new AudioSystem(),
  scene: null,
  menuScene: null,
  camera: null,
  menuCamera: null,
  renderer: null,
  game: null,
  showroomBike: null,
  showroomGroup: null,
  time: 0,
  envMap: null,
  touch: false,
  muted: false,
};

/* ============================================================
   SAVE
============================================================ */
function defaultSave() {
  return { bike: 0, sound: true, rounds: {}, championSeen: false };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || !s.rounds) return defaultSave();
    return { ...defaultSave(), ...s };
  } catch {
    return defaultSave();
  }
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state.save)); } catch {}
}
function playerPoints() {
  return Object.values(state.save.rounds).reduce((sum, r) => sum + (r?.playerPts || 0), 0);
}
function isRoundUnlocked(i) {
  return i === 0 || !!state.save.rounds[i - 1];
}
function nextRoundIndex() {
  for (let i = 0; i < ROUNDS.length; i++) if (!state.save.rounds[i]) return i;
  return ROUNDS.length;
}
function championshipDone() {
  return ROUNDS.every((_, i) => !!state.save.rounds[i]);
}

/* ============================================================
   UI: MENU
============================================================ */
function buildMenu() {
  const list = $('roundList');
  list.innerHTML = '';
  const next = nextRoundIndex();
  ROUNDS.forEach((r, i) => {
    const unlocked = isRoundUnlocked(i);
    const done = !!state.save.rounds[i];
    const card = document.createElement('button');
    card.className = `round-card${i === next ? ' next' : ''}${done ? ' done' : ''}${unlocked ? '' : ' locked'}`;
    card.disabled = !unlocked;
    const best = state.save.rounds[i];
    let stateText;
    if (!unlocked) stateText = '<b>🔒</b>ЗАКРЫТ';
    else if (best) stateText = `<b>P${best.playerPos}</b>${best.playerPts} ОЧК.`;
    else if (i === next) stateText = '<b>ДАЛЕЕ</b>К СТАРТУ';
    else stateText = '<b>—</b>ОТКРЫТ';
    card.innerHTML = `
      <div class="rc-index">${String(i + 1).padStart(2, '0')}</div>
      <div class="rc-main">
        <div class="rc-name">${r.name}</div>
        <div class="rc-meta">${r.city} · ${r.laps} КРУГА · ${r.label}</div>
      </div>
      <div class="rc-state">${stateText}</div>`;
    if (unlocked) card.addEventListener('click', () => { state.audio.blip(520, 0.06); startRound(i); });
    list.appendChild(card);
  });

  const pts = playerPoints();
  $('headerPts').textContent = `${pts} ОЧКОВ`;
  $('seasonPoints').textContent = `${pts} ОЧКОВ`;
  const startBtn = $('startBtn');
  if (championshipDone()) {
    $('startLabel').textContent = 'ИТОГИ ЧЕМПИОНАТА';
  } else if (next === 0) {
    $('startLabel').textContent = 'НАЧАТЬ ЧЕМПИОНАТ';
  } else {
    $('startLabel').textContent = 'ПРОДОЛЖИТЬ ЧЕМПИОНАТ';
  }

  const bestStrip = $('bestStrip');
  const bestItems = [];
  ROUNDS.forEach((r) => {
    const rec = state.save.rounds[ROUNDS.indexOf(r)];
    if (rec?.bestLap) bestItems.push(`<span>ЛУЧШИЙ КРУГ · ${r.city} <b>${fmtTime(rec.bestLap)}</b></span>`);
  });
  bestStrip.innerHTML = bestItems.length
    ? bestItems.join('')
    : '<span>ЛУЧШИХ КРУГОВ ПОКА НЕТ. <i>ПОКАЖИ, НА ЧТО СПОСОБЕН.</i></span>';

  const opts = $('bikeOptions');
  opts.innerHTML = '';
  [
    { name: 'VIPER R1', sub: 'ЗЕЛЁНЫЙ / ОРАНЖ', accent: '#ff6417' },
    { name: 'FALCON M2', sub: 'СИНИЙ / ЦИАН', accent: '#32e6ff' },
  ].forEach((b, i) => {
    const el = document.createElement('button');
    el.className = `bike-opt${state.save.bike === i ? ' active' : ''}`;
    el.style.setProperty('--sw', b.accent);
    el.innerHTML = `<span class="swatch"></span><span>${b.name}<small>${b.sub}</small></span>`;
    el.addEventListener('click', () => {
      if (state.save.bike === i) return;
      state.save.bike = i;
      persist();
      buildMenu();
      swapShowroomBike();
      state.audio.blip(660, 0.07);
    });
    opts.appendChild(el);
  });
}

function showMenu() {
  state.screen = 'menu';
  $('loading').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  $('champion').classList.add('hidden');
  document.body.classList.remove('in-race');
  teardownGame();
  buildMenu();
  state.audio.idle();
  buildShowroom();
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ============================================================
   RENDERER + LOADING + SHOWROOM
============================================================ */
function initRenderer() {
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer = renderer;
  state.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.15, 2400);
  state.menuCamera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 220);
  state.menuCamera.position.set(4.1, 1.85, 5.1);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  state.envMap = pmrem.fromScene(room, 0.04).texture;
  room.dispose?.();
  pmrem.dispose();

  window.addEventListener('resize', onResize);
}

function onResize() {
  const r = state.renderer;
  if (!r) return;
  r.setSize(window.innerWidth, window.innerHeight);
  state.camera.aspect = window.innerWidth / window.innerHeight;
  state.camera.updateProjectionMatrix();
  state.menuCamera.aspect = window.innerWidth / window.innerHeight;
  state.menuCamera.updateProjectionMatrix();
}

function disposeObject(obj, keepPersistent = true) {
  obj.traverse((o) => {
    if (o.isMesh || o.isPoints || o.isSprite) {
      if (o.geometry && !o.geometry.userData.persistent) o.geometry.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || m.userData.persistent) continue;
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture && !v.userData?.persistent) v.dispose?.();
        }
        m.dispose?.();
      }
    }
  });
}

function teardownGame() {
  if (!state.game) return;
  try { disposeObject(state.game.scene); } catch (e) { console.warn(e); }
  state.game = null;
}

function buildShowroom() {
  if (!state.templates.length) return;
  if (state.menuScene) {
    disposeObject(state.menuScene);
    state.menuScene = null;
    state.showroomBike = null;
  }
  state.renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080e);
  scene.fog = new THREE.Fog(0x05080e, 8, 30);
  scene.environment = state.envMap;
  scene.environmentIntensity = 0.75;

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x090c12, roughness: 0.22, metalness: 0.88 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(24, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.35, 0.24, 64),
    new THREE.MeshStandardMaterial({ color: 0x11161f, roughness: 0.3, metalness: 0.8 })
  );
  podium.position.y = 0.12;
  podium.receiveShadow = true;
  scene.add(podium);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6417, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.12, 0.035, 8, 120), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.26;
  scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.016, 8, 120), new THREE.MeshBasicMaterial({ color: 0x32e6ff, transparent: true, opacity: 0.55 }));
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = 0.27;
  scene.add(ring2);

  // backdrop arc / halo
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(4.5, 10, 64, 1, 0, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x16233a, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  halo.position.set(0, 0.5, -5.5);
  scene.add(halo);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,120,40,0.55)'), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(12, 8, 1);
  glow.position.set(-3.5, 3.2, -6);
  scene.add(glow);
  const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(50,200,255,0.4)'), transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow2.scale.set(9, 7, 1);
  glow2.position.set(4.5, 2.6, -6);
  scene.add(glow2);

  scene.add(new THREE.HemisphereLight(0x6d8fc4, 0x120d0a, 0.7));
  const key = new THREE.SpotLight(0xfff1dd, 340, 30, 0.62, 0.55, 1.4);
  key.position.set(1.5, 8.5, 4.5);
  key.target.position.set(0, 0.7, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rimO = new THREE.SpotLight(0xff5f17, 280, 26, 0.72, 0.7, 1.5);
  rimO.position.set(-6, 3.2, -4.5);
  rimO.target.position.set(0, 0.7, 0);
  scene.add(rimO, rimO.target);
  const rimC = new THREE.SpotLight(0x2ad8ff, 220, 24, 0.75, 0.7, 1.5);
  rimC.position.set(6, 2.6, -3.5);
  rimC.target.position.set(0, 0.8, 0);
  scene.add(rimC, rimC.target);

  // dust motes
  const pos = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({
    color: 0x8fb4d8, size: 0.035, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  const group = new THREE.Group();
  group.position.y = 0.26;
  group.rotation.y = 0.5;
  scene.add(group);
  state.menuScene = scene;
  state.showroomGroup = group;
  state.showroomDust = dust;
  swapShowroomBike();
}

function swapShowroomBike() {
  if (!state.menuScene || !state.templates.length) return;
  if (state.showroomBike) {
    state.showroomGroup.remove(state.showroomBike);
    disposeObject(state.showroomBike);
    state.showroomBike = null;
  }
  const bike = createShowroomBike(state.templates[state.save.bike] || state.templates[0]);
  bike.scale.setScalar(1.12);
  state.showroomGroup.add(bike);
  state.showroomBike = bike;
}

/* ============================================================
   RACE CREATION
============================================================ */
function makeRacer(id, name, accent, bikeIndex, isPlayer, gridSlot, skill) {
  const visual = createBikeVisual(state.templates[bikeIndex], {
    accent, name: isPlayer ? null : name, night: state.game?.theme?.night,
  });
  const racer = {
    id, name, accent, isPlayer,
    visual,
    pos: new THREE.Vector3(),
    yaw: 0,
    vel: new THREE.Vector2(),
    speed: 0,
    lean: 0,
    steerVis: 0,
    pitch: 0,
    lastIdx: 0,
    hintIdx: 0,
    crossings: 0,
    progress: 0,
    lateral: 0,
    lapStart: 0,
    lapTimes: [],
    bestLap: Infinity,
    finished: false,
    finishTime: Infinity,
    position: gridSlot + 1,
    gridSlot,
    skill: skill ?? 1,
    lineOffset: 0,
    phase: Math.random() * 6.28,
    reaction: 0.12 + Math.random() * 0.35,
    offroad: false,
    boost: false,
    nitro: 1,
    particleTimer: 0,
    tagTimer: 0,
  };
  return racer;
}

async function startRound(roundIndex, practice = false) {
  state.audio.init();
  state.audio.resume();
  const round = ROUNDS[roundIndex];
  if (!round) return;
  hideAllScreens();
  $('loading').classList.remove('hidden');
  $('loadText').textContent = 'ПОДГОТОВКА ТРАССЫ…';
  $('loadFill').style.width = '60%';

  // Let the browser paint the loading state once before heavy synchronous work.
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));

  teardownGame();
  const theme = THEMES[round.theme];
  const scene = new THREE.Scene();
  scene.environment = state.envMap;
  scene.environmentIntensity = 0.55;
  const track = buildTrack(TRACKS[round.trackId], state.renderer);
  scene.add(track.group);

  const env = setupEnvironment(scene, theme, state.renderer);
  const particles = makeParticleSystems(scene);
  state.renderer.toneMappingExposure = theme.exposure;

  const game = {
    roundIndex, round, practice, theme, track, env, particles, scene,
    racers: [], player: null, phase: 'countdown', countdown: 4.0,
    goTimer: 0, raceTime: 0, paused: false, resultsTimer: -1,
    msgTimer: 0, lastCount: null, lastPosition: 6, positionFlash: 0,
    finishedOrder: null, shake: 0,
    cameraPos: new THREE.Vector3(), cameraLook: new THREE.Vector3(),
    intro: 0, minimap: null, resultsShown: false, started: false,
    wrongWay: false, lastLapCrossings: 0, skid: 0, time: 0,
    lightsOn: 0,
  };
  state.game = game;

  // player starts P4, with two rivals behind and three ahead
  const accent = state.save.bike === 1 ? '#32e6ff' : '#ff6417';
  const player = makeRacer('player', 'ВЫ', accent, state.save.bike, true, 3, 1);
  game.player = player;
  game.racers.push(player);

  // bots fill the remaining grid slots
  const botSlots = [0, 1, 2, 4, 5];
  RIDER_POOL.forEach((rider, i) => {
    const skill = rider.baseSkill * (0.86 + round.difficulty * 0.18);
    const bot = makeRacer(rider.id, rider.name, rider.accent, rider.bike, false, botSlots[i], skill);
    bot.short = rider.short;
    game.racers.push(bot);
  });

  // place on grid
  game.racers.forEach((r) => {
    const slot = track.gridSlots[r.gridSlot];
    r.pos.copy(slot.p);
    r.yaw = slot.yaw;
    r.hintIdx = track.nearest(r.pos).idx;
    r.lastIdx = r.hintIdx;
    r.lineOffset = (r.gridSlot % 2 === 0 ? 1 : -1) * (1.4 + Math.random() * 1.0);
    r.progress = track.nearest(r.pos).s - track.length;
    r.visual.root.position.copy(r.pos);
    r.visual.root.rotation.y = r.yaw;
    scene.add(r.visual.root);
  });

  // first nearest pass cache
  game.racers.forEach((r) => {
    const n = track.nearest(r.pos, r.hintIdx);
    r.hintIdx = n.idx;
    r.lastIdx = n.idx;
    r.progress = (r.crossings - 1) * track.length + n.s;
  });

  game.minimap = buildMinimap(track, round);
  buildHUD(game);
  updateHUD(game, 0, true);

  // camera intro origin: behind-left, looking down the road at the start gantry
  const p = player.pos;
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  game.cameraPos.copy(p).addScaledVector(f, -6.0).addScaledVector(right, -2.7).add(new THREE.Vector3(0, 2.35, 0));
  game.cameraLook.copy(p).addScaledVector(f, 24).add(new THREE.Vector3(0, 2.2, 0));
  state.camera.position.copy(game.cameraPos);
  state.camera.lookAt(game.cameraLook);

  state.screen = 'race';
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (state.touch) $('touch').classList.remove('hidden');
  document.body.classList.add('in-race');

  game.countdown = 4.0;
  game.lastCount = null;
  showHUDMessage('');
  $('countdown').textContent = '';
  $('countdown').className = 'countdown';
  setTimeout(() => {
    $('banner').textContent = round.name;
    $('banner').classList.remove('show');
    void $('banner').offsetWidth;
    $('banner').classList.add('show');
  }, 350);
  state.audio.blip(320, 0.12, 'sine', 0.1);
}

function hideAllScreens() {
  ['loading', 'menu', 'hud', 'pause', 'results', 'champion'].forEach(id => $(id).classList.add('hidden'));
  $('touch').classList.add('hidden');
  document.body.classList.remove('in-race');
}

/* ============================================================
   RACE HUD
============================================================ */
function buildHUD(game) {
  $('roundLabel').textContent = game.round.name;
  $('miniTag').textContent = game.round.city;
  $('lapText').textContent = `КРУГ 1 / ${game.round.laps}`;
  $('raceTime').textContent = '00:00.0';
  $('lastLap').textContent = 'ПОСЛ. —';
  $('bestLap').textContent = 'ЛУЧШ. —';
  $('posNum').textContent = '6';
  $('posOf').textContent = `/ ${game.racers.length}`;
  $('message').textContent = '';
  $('message').classList.remove('show');
  $('wrongWay').classList.remove('show');
  $('speedVal').textContent = '0';
  $('nitroFill').style.height = '100%';
  $('banner').classList.remove('show');
  $('countdown').className = 'countdown';
  $('speedoArc').style.strokeDasharray = '2 578';
  buildSpeedTicks();
  $('leaderboard').innerHTML = '';
}

function buildSpeedTicks() {
  const g = $('speedoTicks');
  g.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i <= 10; i++) {
    const a = (135 + (270 * i) / 10) * Math.PI / 180;
    const r1 = 82, r2 = i % 5 === 0 ? 73 : 77;
    const x1 = 110 + Math.cos(a) * r1, y1 = 110 + Math.sin(a) * r1;
    const x2 = 110 + Math.cos(a) * r2, y2 = 110 + Math.sin(a) * r2;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', i % 5 === 0 ? 'rgba(220,235,255,0.55)' : 'rgba(180,205,235,0.22)');
    line.setAttribute('stroke-width', i % 5 === 0 ? '2' : '1');
    g.appendChild(line);
  }
}

function buildMinimap(track, round) {
  const canvas = $('minimap');
  const w = canvas.width, h = canvas.height;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  track.samples.forEach(s => {
    minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x);
    minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z);
  });
  const pad = 34;
  const span = Math.max(maxX - minX, maxZ - minZ);
  const scale = (Math.min(w, h) - pad * 2) / span;
  const ox = w / 2 - ((minX + maxX) / 2) * scale;
  const oz = h / 2 - ((minZ + maxZ) / 2) * scale;
  const tx = (x) => ox + x * scale;
  const tz = (z) => oz + z * scale;

  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  track.samples.forEach((s, i) => {
    const x = tx(s.p.x), z = tz(s.p.z);
    if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z);
  });
  ctx.closePath();
  ctx.strokeStyle = 'rgba(6, 10, 18, 0.9)';
  ctx.lineWidth = 19;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190, 215, 240, 0.42)';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // start line
  const s0 = track.samples[0];
  const sx = tx(s0.p.x), sz = tz(s0.p.z);
  ctx.fillStyle = '#ff6417';
  ctx.beginPath();
  ctx.arc(sx, sz, 5.5, 0, Math.PI * 2);
  ctx.fill();

  const minimap = { off, tx, tz, w, h, track, canvas, ctx: canvas.getContext('2d') };
  minimap.ctx.clearRect(0, 0, w, h);
  minimap.ctx.drawImage(off, 0, 0);
  drawMinimap(minimap, []);
  return minimap;
}

function drawMinimap(minimap, racers) {
  if (!minimap) return;
  const ctx = minimap.ctx;
  ctx.clearRect(0, 0, minimap.w, minimap.h);
  ctx.drawImage(minimap.off, 0, 0);
  for (const r of racers) {
    if (!r) continue;
    const x = minimap.tx(r.pos.x), z = minimap.tz(r.pos.z);
    if (r.isPlayer) {
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-r.yaw);
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6.5, 6);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6.5, 6);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ff6417';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ff6417';
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = r.accent;
      ctx.beginPath();
      ctx.arc(x, z, 4.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function showHUDMessage(text, duration = 1.6) {
  const el = $('message');
  if (!text) { el.classList.remove('show'); return; }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration * 1000);
}

function countdownDisplay(game) {
  const n = Math.ceil(game.countdown - 1);
  const val = n >= 1 && n <= 3 ? String(n) : null;
  if (val !== game.lastCount) {
    game.lastCount = val;
    if (val) {
      const el = $('countdown');
      el.textContent = val;
      el.className = 'countdown';
      void el.offsetWidth;
      el.className = 'countdown tick';
      state.audio.countdown(parseInt(val, 10));
    }
  }
}

function updateStartLights(game) {
  const lights = game.track.startLights;
  const cd = game.countdown;
  // 5 lights, one every 0.6s while counting down from 4.0 to 1.0
  const lit = game.phase === 'countdown' ? clamp(Math.floor((4.0 - cd) / 0.58) + 1, 0, 5) : 5;
  const green = game.phase !== 'countdown';
  lights.forEach((l, i) => {
    const on = green || i < lit;
    const c = green ? 0x2dff7a : 0xff2b18;
    l.mat.emissive.setHex(on ? c : 0x220000);
    l.mat.emissiveIntensity = on ? 3 : 0.4;
    l.mat.color.setHex(on ? c : 0x151515);
    l.glow.material.opacity = on ? (green ? 0.85 : 0.6) : 0;
    l.glow.material.color.setHex(c);
  });
  if (green && game.phase === 'racing') {
    game.goTimer += 1 / 60;
    if (game.goTimer > 1.3) {
      lights.forEach((l) => { l.glow.material.opacity = 0; });
    }
  }
}

/* ============================================================
   INPUT
============================================================ */
const keys = {};
const virtual = { left: false, right: false, throttle: false, brake: false, nitro: false };

function bindInput() {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (state.screen === 'race' && state.game && !state.game.paused) {
      if (k === 'escape') togglePause();
      if (k === 'r') restartRace();
      if (k === 'm') toggleSound();
    } else if (state.screen === 'pause' || (state.game && state.game.paused)) {
      if (k === 'escape') togglePause();
    }
    if (k === 'enter' && state.screen === 'menu') $('startBtn').click();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    for (const k of Object.keys(virtual)) virtual[k] = false;
  });

  document.querySelectorAll('#touch .tbtn').forEach((btn) => {
    const act = btn.dataset.act;
    const on = (e) => { e.preventDefault(); virtual[act] = true; btn.classList.add('on'); };
    const off = (e) => { e.preventDefault(); virtual[act] = false; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });

  $('soundBtn').addEventListener('click', toggleSound);
  $('pauseBtn').addEventListener('click', togglePause);
  $('startBtn').addEventListener('click', () => {
    state.audio.init();
    if (championshipDone()) showChampion();
    else startRound(nextRoundIndex());
  });
  $('quickBtn').addEventListener('click', () => {
    state.audio.init();
    startRound(Math.min(2, nextRoundIndex()), true);
  });
  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Сбросить прогресс чемпионата?')) return;
    state.save = defaultSave();
    state.save.bike = state.save.bike ?? 0;
    state.save.sound = state.audio.enabled;
    persist();
    buildMenu();
    swapShowroomBike();
    toast('СЕЗОН СБРОШЕН');
  });
  $('resumeBtn').addEventListener('click', togglePause);
  $('restartBtn').addEventListener('click', restartRace);
  $('quitBtn').addEventListener('click', () => { state.game && state.audio.idle(); showMenu(); });
  $('nextBtn').addEventListener('click', () => {
    const g = state.game;
    if (!g) return;
    if (g.practice) { startRound(g.roundIndex, true); return; }
    if (championshipDone()) showChampion();
    else startRound(Math.min(ROUNDS.length - 1, g.roundIndex + 1));
  });
  $('retryBtn').addEventListener('click', restartRace);
  $('menuBtn').addEventListener('click', showMenu);
  $('newSeasonBtn').addEventListener('click', () => {
    state.save = defaultSave();
    state.save.bike = state.save.bike ?? 0;
    state.save.sound = state.audio.enabled;
    persist();
    showMenu();
  });
  $('champMenuBtn').addEventListener('click', showMenu);
}

function toggleSound() {
  state.audio.init();
  state.audio.setEnabled(!state.audio.enabled);
  state.save.sound = state.audio.enabled;
  persist();
  document.body.classList.toggle('muted', !state.audio.enabled);
  if (!state.audio.enabled) toast('ЗВУК ВЫКЛЮЧЕН');
  else { toast('ЗВУК ВКЛЮЧЁН'); state.audio.blip(740, 0.08); }
}

function togglePause() {
  const g = state.game;
  if (!g || state.screen !== 'race' && state.screen !== 'pause') return;
  if (state.screen === 'race') {
    g.paused = true;
    state.screen = 'pause';
    $('pause').classList.remove('hidden');
    $('touch').classList.add('hidden');
    state.audio.idle();
  } else {
    g.paused = false;
    state.screen = 'race';
    $('pause').classList.add('hidden');
    if (state.touch) $('touch').classList.remove('hidden');
    state.audio.resume();
  }
}

function restartRace() {
  const g = state.game;
  if (!g) return;
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  startRound(g.roundIndex, g.practice);
}

/* ============================================================
   PHYSICS
============================================================ */
function controls() {
  return {
    throttle: !!(keys['w'] || keys['arrowup'] || virtual.throttle),
    brake: !!(keys['s'] || keys['arrowdown'] || virtual.brake || keys[' ']),
    steer: (keys['a'] || keys['arrowleft'] || virtual.left ? 1 : 0) - (keys['d'] || keys['arrowright'] || virtual.right ? 1 : 0),
    nitro: !!(keys['shift'] || virtual.nitro),
  };
}

function updatePlayer(game, dt) {
  const p = game.player;
  const c = controls();
  const track = game.track;
  const halfW = track.halfWidth;
  const n = track.nearest(p.pos, p.hintIdx);
  p.hintIdx = n.idx;
  p.lateral = n.lateral;
  p.offroad = Math.abs(n.lateral) > halfW - 0.2;

  // steering smoothing
  const steerTarget = c.steer;
  p.steerVis = damp(p.steerVis, steerTarget, steerTarget !== 0 ? 8 : 11, dt);

  const speed = p.vel.length();
  const fwd = new THREE.Vector2(-Math.sin(p.yaw), -Math.cos(p.yaw));
  const right = new THREE.Vector2(Math.cos(p.yaw), -Math.sin(p.yaw));
  let vf = p.vel.dot(fwd);
  let vl = p.vel.dot(right);

  // engine
  const maxSpeed = c.nitro && p.nitro > 0.01 && vf > 4 ? 76 : 63;
  const speedRatio = clamp(vf / maxSpeed, 0, 1);
  let accel = 0;
  if (c.throttle) {
    accel = 23.5 * Math.pow(1 - speedRatio, 0.55) + 4.2;
    if (p.offroad) accel *= 0.34;
  }
  if (c.nitro && p.nitro > 0.01 && vf > 4) {
    accel += 15.5 * Math.pow(1 - speedRatio * 0.7, 0.8);
    p.nitro = Math.max(0, p.nitro - dt * 0.27);
    p.boost = true;
  } else {
    p.boost = false;
    p.nitro = Math.min(1, p.nitro + dt * 0.055);
  }
  if (c.brake) {
    if (vf > 0.5) accel -= 42;
    else if (!c.throttle) accel -= 7;
  }
  // coast / drag
  accel -= vf * Math.abs(vf) * 0.0022 + Math.sign(vf) * 0.55;
  if (p.offroad) accel -= vf * 0.55;

  vf += accel * dt;
  vf = clamp(vf, -9, maxSpeed);

  // lateral grip (drift feel off-road and at speed)
  const grip = p.offroad ? 2.2 : 7.2;
  vl *= Math.exp(-grip * dt);

  // steering
  const steerAuthority = lerp(2.25, 0.92, clamp(Math.abs(vf) / 68, 0, 1));
  const turn = p.steerVis * steerAuthority * (p.offroad ? 0.7 : 1);
  if (Math.abs(vf) > 0.6) p.yaw += turn * dt * Math.sign(vf);
  // cornering scrub
  vf *= 1 - Math.min(0.5, Math.abs(p.steerVis) * clamp(Math.abs(vf) / 63, 0, 1) * 0.42) * dt;

  // rebuild velocity
  p.vel.set(fwd.x * vf + right.x * vl, fwd.y * vf + right.y * vl);
  p.speed = p.vel.length();
  p.lean = damp(p.lean, clamp(p.steerVis * 0.52 * clamp(p.speed / 22, 0, 1), -0.62, 0.62), 8, dt);
  const targetPitch = c.brake && p.speed > 4 ? -0.035 : (p.boost ? 0.055 : 0.005 * Math.sin(game.raceTime * 9));
  p.pitch = damp(p.pitch, targetPitch, 6, dt);

  // move
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.y * dt;

  // barrier / edge containment
  if (Math.abs(n.lateral) > halfW + 6.1) {
    const push = Math.abs(n.lateral) - (halfW + 6.1);
    const dir = -Math.sign(n.lateral);
    p.pos.addScaledVector(new THREE.Vector3(n.idx >= 0 ? track.samples[n.idx].r.x : 0, 0, n.idx >= 0 ? track.samples[n.idx].r.z : 0), dir * push);
    const impact = Math.min(1, p.speed / 28);
    if (impact > 0.15 && p.speed > 6) {
      p.vel.multiplyScalar(0.72);
      p.speed *= 0.72;
      game.shake = Math.min(0.9, impact * 0.8);
      state.audio.crash();
      spawnSparks(game, p.pos, 10);
    }
  }
  p.skid = Math.abs(p.steerVis) * clamp(p.speed / 55, 0, 1) * 0.8;
}

function updateAI(game, r, dt) {
  const track = game.track;
  const n = track.nearest(r.pos, r.hintIdx);
  r.hintIdx = n.idx;
  r.lateral = n.lateral;

  if (game.raceTime < r.reaction) return;

  const speed = r.speed;
  const halfW = track.halfWidth;
  const look = 15 + speed * 0.62;
  const ahead = track.pointAt(n.s + look);

  // lane offset drifts gently, bots take slightly different lines
  const lane = r.lineOffset + Math.sin(game.raceTime * 0.35 + r.phase) * 0.85;

  // avoid the bike in front
  let avoid = 0;
  let closest = Infinity;
  for (const o of game.racers) {
    if (o === r) continue;
    const dx = o.pos.x - r.pos.x, dz = o.pos.z - r.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 220 && d2 > 0.01) {
      const fwd = new THREE.Vector3(-Math.sin(r.yaw), 0, -Math.cos(r.yaw));
      const dot = (dx * fwd.x + dz * fwd.z) / Math.sqrt(d2);
      if (dot > 0.55) {
        const lat = dx * Math.cos(r.yaw) - dz * Math.sin(r.yaw);
        if (Math.abs(lat) < 2.4) {
          avoid -= Math.sign(lat || 1) * (2.6 - Math.abs(lat)) * 1.2;
        }
        if (d2 < closest) closest = d2;
      }
    }
  }
  avoid = clamp(avoid, -3.2, 3.2);
  const target = ahead.p.clone().addScaledVector(ahead.r, clamp(lane + avoid, -halfW + 1.6, halfW - 1.6));

  let dx = target.x - r.pos.x;
  let dz = target.z - r.pos.z;
  let desired = Math.atan2(-dx, -dz);
  let diff = desired - r.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const maxTurn = Math.min(2.0, 22 / Math.max(8, speed));
  r.yaw += clamp(diff * 5.5, -maxTurn, maxTurn) * dt;

  // corner speed from lookahead
  let cornerLimit = 999;
  const skill = r.skill;
  const latAccel = 21.8 * skill;
  const N = track.count;
  const baseIdx = n.idx;
  for (let m = 14; m < 150; m += 10) {
    const idx = (baseIdx + m) % N;
    const curv = Math.max(track.samples[idx].curv, 0.0007);
    const lim = Math.sqrt(latAccel / curv) * 0.94;
    if (lim < cornerLimit) cornerLimit = lim;
  }
  const vmax = (52.5 + skill * 5.4) * (0.975 + Math.min(0.05, Math.max(0, (game.raceTime - 3) * 0.004)));
  // mild rubber-band
  let band = 1;
  const gap = r.progress - game.player.progress;
  if (gap < -120) band = 1.035;
  else if (gap > 110) band = 0.975;
  let targetSpeed = Math.min(vmax * band, Math.max(14, cornerLimit));
  if (closest < 55) targetSpeed *= 0.96;
  if (r.finished) targetSpeed = Math.min(targetSpeed, 26);

  // accelerate / brake
  const accel = targetSpeed > speed ? 19 * (1 - speed / 85) + 4 : -24;
  r.speed = clamp(speed + accel * dt, 0, 82);

  // move
  const fwd = new THREE.Vector2(-Math.sin(r.yaw), -Math.cos(r.yaw));
  r.pos.x += fwd.x * r.speed * dt;
  r.pos.z += fwd.y * r.speed * dt;
  r.vel.set(fwd.x * r.speed, fwd.y * r.speed);

  // hard track bounds
  if (Math.abs(n.lateral) > halfW + 5.5) {
    const dir = -Math.sign(n.lateral);
    const smp = track.samples[n.idx];
    r.pos.x += smp.r.x * dir * (Math.abs(n.lateral) - (halfW + 5.5));
    r.pos.z += smp.r.z * dir * (Math.abs(n.lateral) - (halfW + 5.5));
    r.speed *= 0.7;
  }
  r.lean = damp(r.lean, clamp(-diff * 0.9, -0.55, 0.55) * clamp(r.speed / 30, 0, 1), 7, dt);
  r.pitch = damp(r.pitch, accel > 0 ? 0.03 : -0.03, 5, dt);
}

function updateRacerState(game, r, dt) {
  const track = game.track;
  const near = track.nearest(r.pos, r.hintIdx);
  const prevIdx = r.lastIdx;
  const N = track.count;
  // detect crossing the start line
  if (game.phase === 'racing') {
    if (prevIdx > N * 0.72 && near.idx < N * 0.28) {
      r.crossings++;
      onLapCross(game, r);
    } else if (prevIdx < N * 0.28 && near.idx > N * 0.72) {
      r.crossings--;
    }
  }
  r.hintIdx = near.idx;
  r.lastIdx = near.idx;
  r.lateral = near.lateral;
  r.progress = (r.crossings - 1) * track.length + near.s;
  r.offroad = Math.abs(near.lateral) > track.halfWidth;
  r.visual.root.position.set(r.pos.x, 0.02, r.pos.z);
  r.visual.root.rotation.y = r.yaw;
  const bob = Math.sin(game.time * 24 + r.phase) * 0.004 * clamp(r.speed / 40, 0, 1);
  r.visual.setPose(r.lean, r.pitch, bob);
  r.visual.setBoost(!!r.boost || (r.isPlayer && game.player.boost), game.time);
  // name tags
  if (r.visual.tag) {
    const d = r.pos.distanceTo(game.player.pos);
    const camD = r.pos.distanceTo(state.camera.position);
    const vis = d < 52 && camD > 7.5 && !r.isPlayer;
    r.visual.setTagVisible(vis);
    if (vis) {
      const near = clamp((camD - 7.5) / 6, 0, 1);
      r.visual.setTagOpacity(clamp((52 - d) / 24, 0, 0.72) * near);
    }
  }
}

function onLapCross(game, r) {
  const track = game.track;
  if (r.crossings <= 0) return;
  if (r.isPlayer) {
    if (r.crossings === 1) {
      r.lapStart = game.raceTime;
    } else {
      const lap = game.raceTime - r.lapStart;
      r.lapStart = game.raceTime;
      r.lapTimes.push(lap);
      if (lap < r.bestLap) r.bestLap = lap;
      $('lastLap').textContent = `ПОСЛ. ${fmtTime(lap)}`;
      $('bestLap').textContent = `ЛУЧШ. ${fmtTime(r.bestLap)}`;
      state.audio.blip(820, 0.08, 'square', 0.09);
    }
    if (r.crossings >= 2 && r.crossings === game.round.laps) {
      triggerBanner('ПОСЛЕДНИЙ КРУГ');
      state.audio.blip(500, 0.18, 'sawtooth', 0.12);
    } else if (r.crossings >= 2 && r.crossings < game.round.laps) {
      triggerBanner(`КРУГ ${r.crossings}`);
      state.audio.blip(620, 0.12, 'square', 0.1);
    }
    if (r.crossings === game.round.laps + 1) {
      r.finished = true;
      r.finishTime = game.raceTime;
      r.boost = false;
      game.player.boost = false;
      triggerBanner('ФИНИШ');
      state.audio.blip(1000, 0.4, 'sawtooth', 0.15);
      game.resultsTimer = 2.2;
    }
  } else {
    if (r.crossings === 1) r.lapStart = game.raceTime;
    if (r.crossings === game.round.laps + 1 && !r.finished) {
      r.finished = true;
      r.finishTime = game.raceTime;
    }
  }
}

function triggerBanner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

/* ============================================================
   COLLISIONS / PARTICLES
============================================================ */
function updateCollisions(game) {
  const racers = game.racers;
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = 1.55;
      if (d2 > min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const push = (min - d) * 0.5 + 0.01;
      a.pos.x -= nx * push; a.pos.z -= nz * push;
      b.pos.x += nx * push; b.pos.z += nz * push;
      const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * nz;
      if (a.isPlayer || b.isPlayer) {
        game.shake = Math.min(0.8, 0.25 + Math.abs(rel) * 0.02);
        if (Math.abs(rel) > 4) state.audio.blip(120, 0.12, 'sawtooth', 0.1);
      }
      if (rel < 0) {
        if (a.isPlayer) { a.vel.multiplyScalar(0.97); }
        if (b.isPlayer) { b.vel.multiplyScalar(0.97); }
      }
    }
  }
}

function spawnSparks(game, pos, count) {
  for (let i = 0; i < count; i++) {
    game.particles.sparks.spawn(
      new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.5, 0.4 + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.5),
      new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5),
      { color: 0xffb050, size: 0.7, life: 0.35 + Math.random() * 0.3 }
    );
  }
}

function updateParticles(game, dt) {
  const p = game.player;
  const smoke = game.particles.smoke;
  const flames = game.particles.flames;
  p.particleTimer -= dt;
  const speed = p.speed;
  const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  const rear = p.pos.clone().addScaledVector(fwd, 0.75).setY(0.16);
  if (p.offroad && speed > 5 && p.particleTimer <= 0) {
    p.particleTimer = 0.035;
    for (let i = 0; i < 2; i++) {
      smoke.spawn(
        rear.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7)),
        new THREE.Vector3((Math.random() - 0.5) * 2.2, 1 + Math.random(), (Math.random() - 0.5) * 2.2),
        { color: 0xcdbfa6, size: 1.2 + Math.random(), life: 0.9 + Math.random() * 0.6, alpha: 0.5 }
      );
    }
  }
  if (p.boost) {
    p.particleTimer = Math.max(p.particleTimer, 0);
    for (let i = 0; i < 2; i++) {
      const back = p.pos.clone().addScaledVector(fwd, -0.85).setY(0.62 + Math.random() * 0.12);
      flames.spawn(back, new THREE.Vector3(-fwd.x * (5 + Math.random() * 5) + (Math.random() - 0.5), 0.3, -fwd.z * (5 + Math.random() * 5) + (Math.random() - 0.5)), {
        color: Math.random() > 0.5 ? 0xffb04a : 0x4ad8ff, size: 0.7, life: 0.14,
      });
    }
    if (Math.random() < 0.4) {
      game.particles.sparks.spawn(rear, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), { color: 0xffa030, size: 0.5, life: 0.18 });
    }
  }
  if (p.skid > 0.35 && Math.abs(p.lateral) < 20) {
    if (Math.random() < 0.5) {
      smoke.spawn(rear, new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5), {
        color: 0x9aa0a8, size: 0.7, life: 0.45, alpha: 0.22,
      });
    }
  }
  smoke.update(dt);
  flames.update(dt);
  game.particles.sparks.update(dt);
}

/* ============================================================
   CAMERA
============================================================ */
function updateCamera(game, dt) {
  const p = game.player;
  const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
  const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const speedNorm = clamp(p.speed / 63, 0, 1.25);

  const chaseDist = 5.0 + speedNorm * 0.8;
  const chaseHeight = 1.85 + speedNorm * 0.18;
  const desired = p.pos.clone()
    .addScaledVector(fwd, -chaseDist)
    .addScaledVector(right, -p.lean * 0.7)
    .add(new THREE.Vector3(0, chaseHeight, 0));

  const look = p.pos.clone()
    .addScaledVector(fwd, 6.6 + speedNorm * 7)
    .add(new THREE.Vector3(0, 1.0, 0));

  let posTarget = desired;
  let lookTarget = look;

  if (game.phase === 'countdown') {
    game.intro = clamp(game.intro + dt / 3.4, 0, 1);
    const t = game.intro;
    const e = t * t * (3 - 2 * t);
    const introPos = p.pos.clone().addScaledVector(fwd, -6.0).addScaledVector(right, -2.7).add(new THREE.Vector3(0, 2.35, 0));
    const introLook = p.pos.clone().addScaledVector(fwd, 24).add(new THREE.Vector3(0, 2.2, 0));
    posTarget = introPos.lerp(desired, e);
    lookTarget = introLook.lerp(look, e);
  } else if (game.phase === 'finishing' || game.phase === 'done') {
    const t = game.time * 0.4;
    posTarget = p.pos.clone().add(new THREE.Vector3(Math.cos(t) * 6.5, 2.6, Math.sin(t) * 6.5));
    lookTarget = p.pos.clone().add(new THREE.Vector3(0, 0.9, 0));
  }

  const lambda = game.phase === 'countdown' ? 3.2 : 22;
  game.cameraPos.x = damp(game.cameraPos.x, posTarget.x, lambda, dt);
  game.cameraPos.y = damp(game.cameraPos.y, posTarget.y, lambda, dt);
  game.cameraPos.z = damp(game.cameraPos.z, posTarget.z, lambda, dt);
  game.cameraLook.x = damp(game.cameraLook.x, lookTarget.x, 16, dt);
  game.cameraLook.y = damp(game.cameraLook.y, lookTarget.y, 16, dt);
  game.cameraLook.z = damp(game.cameraLook.z, lookTarget.z, 16, dt);

  // shake
  game.shake = Math.max(0, game.shake - dt * 2.4);
  const shakeAmt = game.shake * 0.16 + (p.boost ? 0.025 : 0) + speedNorm * 0.006;
  const sx = (Math.random() - 0.5) * shakeAmt;
  const sy = (Math.random() - 0.5) * shakeAmt;

  state.camera.position.set(game.cameraPos.x + sx, game.cameraPos.y + sy, game.cameraPos.z);
  state.camera.lookAt(game.cameraLook);
  state.camera.rotation.z += p.lean * 0.035;

  const targetFov = 58 + speedNorm * 8 + (p.boost ? 5 : 0);
  state.camera.fov = damp(state.camera.fov, targetFov, 4, dt);
  state.camera.updateProjectionMatrix();

  // shadow follows player
  const env = game.env;
  env.sun.position.copy(p.pos).addScaledVector(env.sunDir, 150);
  env.sun.target.position.copy(p.pos);
  env.sun.target.updateMatrixWorld();
}

/* ============================================================
   HUD UPDATE
============================================================ */
let hudTimer = 0;
function updateHUD(game, dt, force = false) {
  const p = game.player;
  const kmh = Math.round(p.speed * 3.6);
  $('speedVal').textContent = kmh;
  const pct = clamp(p.speed / 76, 0, 1);
  $('speedoArc').style.strokeDasharray = `${Math.max(2, 433 * pct)} 578`;
  $('nitroFill').style.height = `${clamp(p.nitro, 0, 1) * 100}%`;
  $('gearVal').textContent = String(clamp(1 + Math.floor(p.speed / 12.5), 1, 6));
  const fx = (clamp((p.speed - 40) / 32, 0, 1) * 0.7 + (p.boost ? 0.25 : 0));
  $('speedfx').style.opacity = fx.toFixed(2);

  // positions
  const order = game.racers.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  order.forEach((r, i) => { r.position = i + 1; });

  const positionChanged = p.position !== game.lastPosition;
  if (positionChanged && game.phase === 'racing') {
    const delta = game.lastPosition - p.position;
    if (delta > 0 && game.raceTime > 1.5) {
      triggerBanner(`+${delta} ${delta === 1 ? 'МЕСТО' : 'МЕСТА'}`);
      state.audio.blip(760, 0.08, 'square', 0.08);
    }
    game.lastPosition = p.position;
  }
  $('posNum').textContent = p.position;
  $('posOf').textContent = `/ ${game.racers.length}`;
  const lapNum = clamp(p.crossings, 1, game.round.laps);
  $('lapText').textContent = `КРУГ ${lapNum} / ${game.round.laps}`;
  $('raceTime').textContent = fmtTime(game.raceTime);

  // leaderboard
  hudTimer -= dt;
  if (hudTimer <= 0 || force) {
    hudTimer = 0.2;
    const board = $('leaderboard');
    const leader = order[0];
    const rows = order.map((r, idx) => {
      let gap = '—';
      if (idx > 0) {
        if (r.finished && leader.finished) gap = fmtGap(r.finishTime - leader.finishTime);
        else {
          const dist = Math.max(0, leader.progress - r.progress);
          gap = fmtGap(dist / 38);
        }
      }
      const nm = r.isPlayer ? 'ВЫ' : (r.short || r.name.split(' ')[0]);
      return `<div class="board-row${r.isPlayer ? ' player' : ''}" style="--c:${r.accent}">
        <span class="br-pos">${idx + 1}</span><span class="br-dot"></span>
        <span class="br-name">${nm}</span><span class="br-gap">${gap}</span>
      </div>`;
    }).join('');
    if (board.innerHTML !== rows) board.innerHTML = rows;
    drawMinimap(game.minimap, order);
  }

  // wrong way
  const near = game.track.samples[p.lastIdx] || game.track.samples[0];
  const along = p.vel.x * near.t.x + p.vel.y * near.t.z;
  const wrong = game.phase === 'racing' && p.speed > 4 && along < -3;
  if (wrong !== game.wrongWay) {
    game.wrongWay = wrong;
    $('wrongWay').classList.toggle('show', wrong);
  }

  // sound
  state.audio.setEngine(p.speed, controls().throttle ? 1 : 0, p.boost);
  state.audio.setSkid(p.skid || 0);

  // messages
  if (p.offroad && p.speed > 6 && game.phase === 'racing') {
    game.offroadTimer = (game.offroadTimer || 0) + dt;
    if (game.offroadTimer > 0.8) {
      game.offroadTimer = -3;
      showHUDMessage('СЪЕЗД С ТРАССЫ · -50% СКОРОСТИ', 1.4);
    }
  } else {
    game.offroadTimer = 0;
  }
}

/* ============================================================
   RACE LOOP
============================================================ */
function updateRace(dt) {
  const game = state.game;
  if (!game || game.paused) return;
  game.time += dt;

  if (game.phase === 'countdown') {
    game.countdown -= dt;
    countdownDisplay(game);
    updateStartLights(game);
    state.audio.setEngine(8, 0.2, false);
    // idle engine blips
    if (game.countdown <= 1.02) {
      game.phase = 'racing';
      game.lightsOn = 0;
      game.countdown = 1;
      game.player.crossings = 0;
      game.racers.forEach((r) => { r.crossings = 0; r.lastIdx = game.track.nearest(r.pos).idx; });
      const el = $('countdown');
      el.textContent = 'GO!';
      el.className = 'countdown go';
      state.audio.countdown(0);
      setTimeout(() => { if (state.game === game && game.phase === 'racing') { el.className = 'countdown'; el.textContent = ''; } }, 1050);
      game.phase = 'racing';
      game.raceTime = 0;
    }
    updateStartLights(game);
    updateCamera(game, dt);
    updateHUD(game, dt, true);
    return;
  }

  if (game.phase === 'racing' || game.phase === 'finishing') {
    game.raceTime += dt;
  }

  // player
  if (game.phase === 'racing' && !game.player.finished) {
    updatePlayer(game, dt);
  } else if (game.player.finished) {
    // coast to a stop
    game.player.vel.multiplyScalar(Math.exp(-1.6 * dt));
    game.player.speed *= Math.exp(-1.6 * dt);
    game.player.pos.x += game.player.vel.x * dt;
    game.player.pos.z += game.player.vel.y * dt;
  }

  // AI
  game.racers.forEach((r) => {
    if (r.isPlayer) return;
    updateAI(game, r, dt);
  });

  // collisions
  updateCollisions(game);

  // state/progress
  game.racers.forEach((r) => updateRacerState(game, r, dt));

  // particles & camera
  updateParticles(game, dt);
  updateCamera(game, dt);
  updateStartLights(game);
  updateHUD(game, dt);

  // engine sound
  state.audio.setEngine(game.player.speed, controls().throttle ? 1 : 0, game.player.boost);

  // results
  if (game.resultsTimer > 0) {
    game.resultsTimer -= dt;
    if (game.resultsTimer <= 0 && !game.resultsShown) {
      game.resultsShown = true;
      game.phase = 'done';
      showResults();
    }
  }
}

/* ============================================================
   RESULTS + CHAMPIONSHIP
============================================================ */
function showResults() {
  const game = state.game;
  if (!game) return;
  const order = game.racers.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
  order.forEach((r, i) => { r.position = i + 1; });
  const player = game.player;
  const pPos = player.position;
  const pts = game.practice ? 0 : (POINTS[pPos - 1] ?? 0);
  const bestLap = player.bestLap === Infinity ? null : player.bestLap;

  // finish time / estimated gap for incomplete racers
  const winner = order[0];
  const rows = order.map((r) => {
    let time = null, gap = null;
    if (r.finished) {
      time = r.finishTime;
      gap = r === winner ? 0 : r.finishTime - (winner.finished ? winner.finishTime : game.raceTime);
    } else {
      gap = (winner.progress - r.progress) / 40;
    }
    return {
      id: r.id, name: r.name, short: r.short, accent: r.accent,
      pos: r.position, time, gap, isPlayer: r.isPlayer,
      points: game.practice ? 0 : (POINTS[r.position - 1] ?? 0),
      finished: r.finished,
    };
  });

  // save season record (best replay replaces the round)
  let savedResult = true;
  if (!game.practice) {
    const prev = state.save.rounds[game.roundIndex];
    if (prev && (prev.playerPts > pts || (prev.playerPts === pts && prev.playerPos <= pPos))) {
      savedResult = false;
    } else {
      state.save.rounds[game.roundIndex] = {
        playerPos: pPos,
        playerPts: pts,
        playerTime: player.finished ? player.finishTime : null,
        bestLap,
        laps: player.lapTimes.slice(),
        order: rows,
        date: Date.now(),
      };
      persist();
    }
    buildMenu();
  }

  const titles = ['ПОБЕДА', 'ВТОРОЕ МЕСТО', 'ТРЕТЬЕ МЕСТО', 'ФИНИШ', 'ФИНИШ', 'ФИНИШ'];
  $('resultKicker').textContent = game.practice
    ? `ТРЕНИРОВКА · ${game.round.city} · ${game.round.laps} КРУГА`
    : `РАУНД ${game.roundIndex + 1} / ${ROUNDS.length} · ФИНИШ`;
  $('resultPlace').textContent = `P${pPos}`;
  $('resultTitle').textContent = game.practice ? 'ТРЕНИРОВКА' : (pPos <= 3 ? titles[pPos - 1] : 'ФИНИШ');
  $('resultSub').textContent = `${game.round.name} · ${game.round.city.toUpperCase()}`;
  $('resultPts').textContent = game.practice ? '—' : `+${pts}`;
  $('resultStats').innerHTML = `
    <span>ВРЕМЯ <b>${player.finished ? fmtTime(player.finishTime) : '—'}</b></span>
    <span>ЛУЧШИЙ КРУГ <b>${bestLap ? fmtTime(bestLap) : '—'}</b></span>
    <span>КРУГИ <b>${player.lapTimes.length}/${game.round.laps}</b></span>
    <span>МЕСТО <b>P${pPos} / ${game.racers.length}</b></span>`;

  $('resultTable').innerHTML = rows.map((r) => {
    const time = r.finished && r.time ? fmtTime(r.time) : (r.gap != null ? `+${Math.max(0, r.gap).toFixed(1)}` : '—');
    return `<div class="res-row${r.isPlayer ? ' player' : ''}" style="--c:${r.accent}">
      <span class="rp">${r.pos}</span><span class="rd"></span>
      <span class="rn">${r.isPlayer ? 'ВЫ' : r.name}</span>
      <span class="rt">${time}</span>
      <span class="rpts">${game.practice ? '' : `+${r.points}`}</span>
    </div>`;
  }).join('');

  const next = game.roundIndex + 1;
  const nextBtn = $('nextBtn');
  if (game.practice) {
    nextBtn.innerHTML = 'ЕЩЁ ЗАЕЗД';
    $('champNote').textContent = 'ТРЕНИРОВКА НЕ ВЛИЯЕТ НА ОЧКИ ЧЕМПИОНАТА';
  } else if (next < ROUNDS.length) {
    nextBtn.innerHTML = `СЛЕДУЮЩИЙ РАУНД · ${ROUNDS[next].name} <i>→</i>`;
    $('champNote').textContent = savedResult
      ? `РЕЗУЛЬТАТ ЗАПИСАН · ВСЕГО ОЧКОВ: ${playerPoints()}`
      : `ПРЕДЫДУЩИЙ РЕЗУЛЬТАТ ЛУЧШЕ · ВСЕГО ОЧКОВ: ${playerPoints()}`;
  } else {
    nextBtn.innerHTML = 'ИТОГИ ЧЕМПИОНАТА <i>→</i>';
    $('champNote').textContent = savedResult
      ? `РЕЗУЛЬТАТ ЗАПИСАН · ВСЕГО ОЧКОВ: ${playerPoints()}`
      : `ПРЕДЫДУЩИЙ РЕЗУЛЬТАТ ЛУЧШЕ · ВСЕГО ОЧКОВ: ${playerPoints()}`;
  }
  $('results').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  state.screen = 'results';
  state.audio.idle();
  // victory beeps
  setTimeout(() => state.audio.blip(660, 0.12, 'square', 0.1), 200);
  setTimeout(() => state.audio.blip(880, 0.16, 'square', 0.1), 340);
  if (pPos === 1) setTimeout(() => state.audio.blip(1180, 0.3, 'sawtooth', 0.1), 500);
}

function showChampion() {
  const standings = buildStandings();
  const playerRow = standings.find(s => s.id === 'player');
  const title = $('champTitle');
  const sub = $('champSub');
  if (playerRow && playerRow.rank === 1) {
    title.textContent = 'ЧЕМПИОН';
    sub.textContent = `Вы выиграли титул APEX GP с ${playerRow.points} очками`;
  } else {
    title.textContent = 'СЕЗОН ЗАВЕРШЁН';
    sub.textContent = `Ваше итоговое место — P${playerRow ? playerRow.rank : '—'} · ${playerRow ? playerRow.points : 0} очков`;
  }
  $('champTable').innerHTML = standings.map((s) => `
    <div class="res-row${s.id === 'player' ? ' player' : ''}${s.rank === 1 ? ' champ' : ''}" style="--c:${s.accent}">
      <span class="rp">${s.rank}</span><span class="rd"></span>
      <span class="rn">${s.id === 'player' ? 'ВЫ' : s.name}</span>
      <span class="rpts">${s.points} ОЧК.</span>
    </div>`).join('');
  hideAllScreens();
  $('champion').classList.remove('hidden');
  state.screen = 'champion';
  state.audio.idle();
  if (playerRow && playerRow.rank === 1) {
    for (let i = 0; i < 4; i++) setTimeout(() => state.audio.blip(520 + i * 160, 0.18, 'square', 0.1), i * 180);
  }
}

function buildStandings() {
  const totals = new Map();
  for (let i = 0; i < ROUNDS.length; i++) {
    const rec = state.save.rounds[i];
    if (!rec) continue;
    for (const r of rec.order) {
      const key = r.id;
      if (!totals.has(key)) totals.set(key, { id: r.id, name: r.name, accent: r.accent, points: 0 });
      totals.get(key).points += r.points;
    }
  }
  const arr = [...totals.values()].sort((a, b) => b.points - a.points);
  arr.forEach((v, i) => { v.rank = i + 1; });
  return arr;
}

/* ============================================================
   MAIN LOOP
============================================================ */
let lastT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const now = t / 1000;
  let dt = Math.min(0.05, now - lastT || 0.016);
  lastT = now;
  if (!state.renderer) return;

  if (state.screen === 'menu' || state.screen === 'loading') {
    animateShowroom(dt, now);
    state.renderer.render(state.menuScene || new THREE.Scene(), state.menuCamera);
    return;
  }

  if (state.screen === 'pause' || state.screen === 'results' || state.screen === 'champion') {
    if (state.game && state.screen === 'pause') {
      // frozen frame
      state.renderer.render(state.game.scene, state.camera);
      return;
    }
    if (state.screen === 'results' || state.screen === 'champion') {
      if (state.game) {
        // subtle slow camera while results are open
        state.game.time += dt * 0.15;
        updateCameraFrozen(state.game, dt);
        state.renderer.render(state.game.scene, state.camera);
      } else {
        animateShowroom(dt, now);
        state.renderer.render(state.menuScene || new THREE.Scene(), state.menuCamera);
      }
      return;
    }
  }

  if (state.screen === 'race' && state.game) {
    updateRace(dt);
    state.renderer.render(state.game.scene, state.camera);
  }
}

function updateCameraFrozen(game, dt) {
  const p = game.player;
  const t = game.time * 0.35;
  const pos = p.pos.clone().add(new THREE.Vector3(Math.cos(t) * 6.2, 2.4, Math.sin(t) * 6.2));
  game.cameraPos.lerp(pos, 1 - Math.exp(-2 * dt));
  game.cameraLook.lerp(p.pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 1 - Math.exp(-3 * dt));
  state.camera.position.copy(game.cameraPos);
  state.camera.lookAt(game.cameraLook);
}

function animateShowroom(dt, now) {
  if (!state.menuScene) return;
  state.time += dt;
  state.menuCamera.position.x = 4.1 + Math.cos(now * 0.18) * 0.35;
  state.menuCamera.position.z = 5.1 + Math.sin(now * 0.18) * 0.35;
  state.menuCamera.position.y = 1.85 + Math.sin(now * 0.4) * 0.05;
  state.menuCamera.lookAt(0, 0.8, 0);
  if (state.showroomGroup) {
    state.showroomGroup.rotation.y = 0.62 + Math.sin(now * 0.16) * 0.42;
    state.showroomGroup.position.y = 0.26 + Math.sin(now * 0.8) * 0.015;
  }
  if (state.showroomDust) state.showroomDust.rotation.y += dt * 0.02;
}

/* ============================================================
   BOOT
============================================================ */
async function boot() {
  state.save = loadSave();
  state.audio.enabled = state.save.sound !== false;
  document.body.classList.toggle('muted', !state.audio.enabled);
  state.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (state.touch) document.body.classList.add('touch-mode');

  initRenderer();
  bindInput();

  $('loading').classList.remove('hidden');
  $('loadFill').style.width = '12%';
  try {
    await document.fonts.ready;
  } catch {}
  $('loadText').textContent = 'ЗАГРУЗКА 3D-МОДЕЛЕЙ…';
  const templates = await loadBikeTemplates((p) => {
    $('loadFill').style.width = `${12 + p * 68}%`;
  });
  // mark assets as persistent for later disposal
  templates.forEach((t) => t.traverse((o) => {
    if (o.geometry) o.geometry.userData.persistent = true;
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        m.userData.persistent = true;
        if (m.map) m.map.userData.persistent = true;
      });
    }
  }));
  state.templates = templates;
  $('loadText').textContent = 'СБОРКА ГАРАЖА…';
  $('loadFill').style.width = '90%';
  buildShowroom();
  $('loadFill').style.width = '100%';
  await new Promise(r => setTimeout(r, 260));
  state.audio.enabled = state.save.sound !== false;
  state.audio.setEnabled(state.audio.enabled);
  showMenu();

  // handle an initial resize after fonts/layout
  onResize();
  // small debug/automation hook used by the project's smoke tests
  window.APEX = { state, startRound, showResults, showChampion, showMenu, ROUNDS, updateRace, updateHUD, updateCamera, get game() { return state.game; } };
  requestAnimationFrame(loop);
}

boot().catch((err) => {
  console.error(err);
  $('loadText').textContent = 'ОШИБКА ЗАГРУЗКИ — ПЕРЕЗАГРУЗИТЕ СТРАНИЦУ';
});
