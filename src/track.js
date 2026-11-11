import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  asphaltTexture, grassTexture, gravelTexture, checkerTexture,
  bannerTexture, crowdTexture, windowTexture, glowTexture,
} from './textures.js';

export const TRACKS = {
  harbor: {
    id: 'harbor',
    name: 'HARBOR SPRINT',
    city: 'PORT AZURE',
    desc: 'Широкие дуги и длинная прямая у воды',
    points: [
      [-140, -210], [20, -240], [170, -200], [260, -100], [280, 20],
      [220, 140], [100, 210], [-40, 220], [-170, 170], [-250, 60],
      [-260, -70], [-220, -160],
    ],
    halfWidth: 8.2,
    theme: 'day',
  },
  ridge: {
    id: 'ridge',
    name: 'RIDGE RUN',
    city: 'SIERRA ALTA',
    desc: 'Техничные связки и слепые повороты',
    points: [
      [-120, -150], [30, -190], [150, -150], [220, -60], [200, 40],
      [120, 60], [60, 120], [120, 190], [30, 230], [-90, 210],
      [-190, 130], [-220, 20], [-200, -80],
    ],
    halfWidth: 7.6,
    theme: 'sunset',
  },
  bay: {
    id: 'bay',
    name: 'NEON BAY',
    city: 'NEO HAZE',
    desc: 'Ночной город, неон и максимальная скорость',
    points: [
      [-260, -120], [-40, -180], [180, -170], [290, -80], [300, 40],
      [220, 150], [80, 200], [-60, 170], [-120, 80], [-210, 100],
      [-300, 50], [-320, -60],
    ],
    halfWidth: 8.4,
    theme: 'night',
  },
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const val = (a, b, t) => a + (b - a) * t;

function makeTrackCurve(def) {
  const pts = def.points.map(([x, z]) => V(x, 0, z));
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
}

function rotateSampleSet(samples, offset) {
  if (!offset) return samples;
  return samples.slice(offset).concat(samples.slice(0, offset));
}

export function buildTrack(def, renderer) {
  const curve = makeTrackCurve(def);
  const length = curve.getLength();
  const count = Math.max(700, Math.round(length / 1.35));
  const step = length / count;

  let samples = [];
  for (let i = 0; i < count; i++) {
    const u = i / count;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).setY(0).normalize();
    samples.push({ p, t, r: V(-t.z, 0, t.x), s: i * step, curv: 0 });
  }
  // curvature + smoothed corner intensity
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 10 + count) % count].t;
    const b = samples[(i + 10) % count].t;
    const angle = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
    const cross = a.x * b.z - a.z * b.x;
    samples[i].curv = angle / (20 * step);
    samples[i].side = Math.sign(cross) || 1;
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = samples.map((s2, i) => {
      let sum = 0;
      for (let k = -4; k <= 4; k++) sum += samples[(i + k + count) % count].curv;
      return { ...s2, curv: sum / 9 };
    });
    samples = next;
  }
  // choose a start on a straight: minimise curvature over 70 m ahead and 25 m behind
  let best = 0, bestScore = Infinity;
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = -20; k <= 48; k++) sum += samples[(i + k + count) % count].curv;
    if (sum < bestScore) { bestScore = sum; best = i; }
  }
  samples = rotateSampleSet(samples, best);
  samples.forEach((s2, i) => { s2.s = i * step; s2.idx = i; });

  const halfWidth = def.halfWidth;
  const group = new THREE.Group();
  group.name = `track-${def.id}`;
  const dummy = new THREE.Object3D();

  const roadTex = asphaltTexture(renderer);
  const edgeTex = null;
  const grassTex = grassTexture(renderer);
  const gravelTex = gravelTexture(renderer);
  const checkerTex = checkerTexture();

  // ---------- ground ----------
  const groundMat = new THREE.MeshStandardMaterial({
    map: grassTex, color: 0x8ea07c, roughness: 1, metalness: 0,
  });
  grassTex.repeat.set(150, 150);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  group.add(ground);

  // subtle colour variation ring under the circuit
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(430, 64),
    new THREE.MeshStandardMaterial({ color: 0x4f6244, roughness: 1, transparent: true, opacity: 0.35, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = -0.02;
  group.add(pad);

  // ---------- road ribbon ----------
  const roadPos = [], roadNorm = [], roadUV = [], roadIdx = [];
  const linePos = [], lineIdx = [];
  const lineInner = halfWidth - 0.62;
  const lineW = 0.26;
  const curbInner = halfWidth - 0.1;
  const curbOuter = halfWidth + 1.12;
  const curbPos = [], curbCol = [], curbIdx = [];
  const gravelPos = [], gravelUV = [], gravelIdx = [];
  const OUT = halfWidth + 5.6;

  const roadUVArr = [];
  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const l = s.p.clone().addScaledVector(s.r, -halfWidth);
    const r = s.p.clone().addScaledVector(s.r, halfWidth);
    roadPos.push(l.x, 0.006, l.z, r.x, 0.006, r.z);
    roadNorm.push(0, 1, 0, 0, 1, 0);
    roadUV.push(0, s.s / 5, halfWidth / 3.4, s.s / 5);
  }
  for (let i = 0; i < count; i++) {
    const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
    roadIdx.push(a, b, c, b, d, c);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNorm, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUV, 2));
  roadGeo.setIndex(roadIdx);
  roadTex.repeat.set(1, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex, color: 0xe4e7eb, roughness: 0.82, metalness: 0.04,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // white edge lines (both sides) as thin ribbons
  const lineGeos = [];
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const c1 = s.p.clone().addScaledVector(s.r, side * lineInner);
      const c2 = s.p.clone().addScaledVector(s.r, side * (lineInner + lineW));
      pos.push(c1.x, 0.018, c1.z, c2.x, 0.018, c2.z);
      uv.push(0, s.s / 4, 1, s.s / 4);
    }
    for (let i = 0; i < count; i++) {
      const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    lineGeos.push(g);
  }
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf0efe6, roughness: 0.55, metalness: 0 });
  lineGeos.forEach(g => {
    const m = new THREE.Mesh(g, lineMat);
    m.receiveShadow = true;
    group.add(m);
  });

  // curbs (alternating red / cream, vertex colours)
  const curbSeg = Math.max(6, Math.round(3.4 / step));
  const red = new THREE.Color(0xd8412e), cream = new THREE.Color(0xf1ede2);
  for (const side of [-1, 1]) {
    let segIdx = 0;
    for (let i = 0; i < count; i++) {
      const s0 = samples[i];
      const s1 = samples[(i + 1) % count];
      const c = (Math.floor(i / curbSeg) % 2 === 0) ? red : cream;
      const a = s0.p.clone().addScaledVector(s0.r, side * curbInner);
      const b = s0.p.clone().addScaledVector(s0.r, side * curbOuter);
      const cc = s1.p.clone().addScaledVector(s1.r, side * curbInner);
      const d = s1.p.clone().addScaledVector(s1.r, side * curbOuter);
      const base = curbPos.length / 3;
      curbPos.push(a.x, 0.05, a.z, b.x, 0.05, b.z, cc.x, 0.05, cc.z, d.x, 0.05, d.z);
      for (let k = 0; k < 4; k++) curbCol.push(c.r, c.g, c.b);
      curbIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      segIdx++;
    }
  }
  const curbGeo = new THREE.BufferGeometry();
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
  curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbCol, 3));
  curbGeo.setIndex(curbIdx);
  curbGeo.computeVertexNormals();
  const curbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, side: THREE.DoubleSide });
  const curbs = new THREE.Mesh(curbGeo, curbMat);
  curbs.receiveShadow = true;
  group.add(curbs);

  // gravel runoff strip
  for (const side of [-1, 1]) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const a = s.p.clone().addScaledVector(s.r, side * curbOuter);
      const b = s.p.clone().addScaledVector(s.r, side * OUT);
      pos.push(a.x, 0.012, a.z, b.x, 0.012, b.z);
      uv.push(0, s.s / 7, 1, s.s / 7);
    }
    for (let i = 0; i < count; i++) {
      const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    gravelTex.repeat.set(1, 1);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: gravelTex, color: 0xb2a68f, roughness: 1 }));
    m.receiveShadow = true;
    group.add(m);
  }

  // start / finish checker
  const sl = samples[0];
  const checker = new THREE.Mesh(
    new THREE.PlaneGeometry(halfWidth * 2, 3.0),
    new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.5, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2 })
  );
  checker.rotation.order = 'YXZ';
  checker.rotation.y = Math.atan2(-sl.t.x, -sl.t.z);
  checker.rotation.x = -Math.PI / 2;
  checker.position.copy(sl.p).setY(0.03);
  group.add(checker);

  // grid slots
  const gridSlots = [];
  for (let i = 0; i < 8; i++) {
    const back = 7 + i * 4.6;
    const ss = (count - Math.round(back / step) + count) % count;
    const s = samples[ss];
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * 2.55;
    const p = s.p.clone().addScaledVector(s.r, lat);
    gridSlots.push({ p, yaw: Math.atan2(-s.t.x, -s.t.z), s: Math.max(0, s.s) });
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xe8e6dc, transparent: true, opacity: 0.7 })
    );
    mark.rotation.order = 'YXZ';
    mark.rotation.y = Math.atan2(-s.t.x, -s.t.z);
    mark.rotation.x = -Math.PI / 2;
    mark.position.copy(p).setY(0.028);
    group.add(mark);
  }

  // ---------- guardrails ----------
  const barrierOffset = halfWidth + 6.55;
  const barrierH = 0.92;
  const barrierPos = [], barrierCol = [], barrierIdx = [], capPos = [], capIdx = [];
  const redB = new THREE.Color(0xd8412e), creamB = new THREE.Color(0xeee9dc);
  const barrierSeg = Math.max(3, Math.round(4.0 / step));
  for (const side of [-1, 1]) {
    const base = barrierPos.length / 3;
    const capBase = capPos.length / 3;
    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const p = s.p.clone().addScaledVector(s.r, side * barrierOffset);
      barrierPos.push(p.x, 0.02, p.z, p.x, barrierH, p.z);
      const c = (Math.floor(i / barrierSeg) % 2 === 0) ? redB : creamB;
      barrierCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
      const ci = p.clone().addScaledVector(s.r, -0.17);
      const co = p.clone().addScaledVector(s.r, 0.17);
      capPos.push(ci.x, barrierH + 0.015, ci.z, co.x, barrierH + 0.015, co.z);
    }
    for (let i = 0; i < count; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      barrierIdx.push(a, b, c, b, d, c);
      const ca = capBase + i * 2, cb = ca + 1, cc = ca + 2, cd = ca + 3;
      capIdx.push(ca, cb, cc, cb, cd, cc);
    }
  }
  const barrierGeo = new THREE.BufferGeometry();
  barrierGeo.setAttribute('position', new THREE.Float32BufferAttribute(barrierPos, 3));
  barrierGeo.setAttribute('color', new THREE.Float32BufferAttribute(barrierCol, 3));
  barrierGeo.setIndex(barrierIdx);
  barrierGeo.computeVertexNormals();
  const barriers = new THREE.Mesh(barrierGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0.04, side: THREE.DoubleSide,
  }));
  barriers.receiveShadow = true;
  group.add(barriers);

  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  capGeo.setIndex(capIdx);
  capGeo.computeVertexNormals();
  const caps = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({
    color: 0x30353d, roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide,
  }));
  caps.receiveShadow = true;
  group.add(caps);

  // guardrail posts
  const postGeo = new THREE.BoxGeometry(0.16, 1.16, 0.3);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.55, metalness: 0.7 });
  const postStep = Math.max(2, Math.round(4.2 / step));
  const postCount = Math.ceil(count / postStep) * 2 + 2;
  const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
  let pi = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += postStep) {
      if (pi >= postCount) break;
      const s = samples[i];
      const p = s.p.clone().addScaledVector(s.r, side * (barrierOffset + 0.12));
      dummy.position.copy(p).setY(0.57);
      dummy.rotation.set(0, Math.atan2(-s.t.x, -s.t.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(pi++, dummy.matrix);
    }
  }
  posts.count = pi;
  posts.receiveShadow = true;
  group.add(posts);

  // tyre stacks at outside of the tightest corners
  const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.95 });
  const tyreTmp = [];
  for (let i = 0; i < count; i += 26) {
    if (samples[i].curv < 0.012) continue;
    const s = samples[i];
    const side = s.side || 1;
    for (let k = 0; k < 3; k++) {
      tyreTmp.push({ p: s.p.clone().addScaledVector(s.r, (halfWidth + 7.7) * side).setY(0.16 + k * 0.32), yaw: Math.atan2(-s.t.x, -s.t.z) });
    }
  }
  if (tyreTmp.length) {
    const tyres = new THREE.InstancedMesh(tyreGeo, tyreMat, tyreTmp.length);
    tyreTmp.forEach((t, idx) => {
      dummy.position.copy(t.p);
      dummy.rotation.set(0, t.yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tyres.setMatrixAt(idx, dummy.matrix);
    });
    group.add(tyres);
  }

  // ---------- start gantry ----------
  const startGantry = new THREE.Group();
  const gantryYaw = Math.atan2(-sl.t.x, -sl.t.z);
  startGantry.position.copy(sl.p);
  startGantry.rotation.y = gantryYaw;
  const steel = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff5d12, roughness: 0.4, metalness: 0.4, emissive: 0x2a0800 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.4, 0.7), steel);
    pillar.position.set(side * (halfWidth + 1.6), 3.7, 0);
    pillar.castShadow = true;
    startGantry.add(pillar);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), accent);
    foot.position.set(side * (halfWidth + 1.6), 0.18, 0);
    startGantry.add(foot);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((halfWidth + 2) * 2, 1.9, 0.9), steel);
  beam.position.set(0, 7.0, 0);
  beam.castShadow = true;
  startGantry.add(beam);
  const bannerTex = bannerTexture('APEX GP', '#0c1018', '#ff6b1a', 'WORLD CHAMPIONSHIP');
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x221005, emissiveMap: bannerTex, emissiveIntensity: 0.35 });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry((halfWidth + 2) * 2 - 1.6, 1.7), bannerMat);
  banner.position.set(0, 7.0, 0.47);
  startGantry.add(banner);
  const bannerBack = banner.clone();
  bannerBack.position.z = -0.47;
  bannerBack.rotation.y = Math.PI;
  startGantry.add(bannerBack);
  const startLights = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x330000, emissiveIntensity: 1, roughness: 0.4 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), mat);
    lamp.position.set(-2.2 + i * 1.1, 5.85, 0.5);
    startGantry.add(lamp);
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture('#ff2b18'), color: 0xff3020, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(1.6, 1.6, 1);
    glow.position.copy(lamp.position);
    startGantry.add(glow);
    startLights.push({ mat, glow });
  }
  group.add(startGantry);

  // ---------- grandstands & pit building ----------
  const makeStand = (sampleIdx, side, name) => {
    const s = samples[(sampleIdx + count) % count];
    const g = new THREE.Group();
    g.position.copy(s.p).addScaledVector(s.r, side * (halfWidth + 17));
    g.rotation.y = Math.atan2(-s.t.x, -s.t.z) + Math.PI / 2;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x6e727a, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x262a31, roughness: 0.9 });
    const standLen = 56;
    const base = new THREE.Mesh(new THREE.BoxGeometry(standLen, 2.2, 15), concrete);
    base.position.set(0, 1.1, 0);
    base.receiveShadow = true;
    g.add(base);
    const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTexture(), transparent: true, roughness: 1, side: THREE.DoubleSide });
    for (let row = 0; row < 5; row++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(standLen - 2, 1.35, 2.35), row % 2 ? concrete : dark);
      tier.position.set(0, 2.4 + row * 1.28, -1.7 + row * 1.55);
      tier.receiveShadow = true;
      g.add(tier);
      const crowd = new THREE.Mesh(new THREE.PlaneGeometry(standLen - 3, 1.15), crowdMat);
      crowd.position.set(0, 2.85 + row * 1.28, 1.32 + row * 1.55);
      g.add(crowd);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(standLen + 2, 0.35, 17), new THREE.MeshStandardMaterial({ color: 0xd8d6ce, roughness: 0.7, metalness: 0.3 }));
    roof.position.set(0, 10.2, 2.2);
    roof.rotation.x = -0.06;
    g.add(roof);
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(standLen + 1, 17),
      new THREE.MeshStandardMaterial({ color: 0x272c34, roughness: 0.92, side: THREE.DoubleSide })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 10.02, 2.2);
    g.add(ceiling);
    for (const x of [-standLen / 2 + 3, -standLen / 6, standLen / 6, standLen / 2 - 3]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, 8.4, 0.45), steel);
      col.position.set(x, 5.9, 8.6);
      g.add(col);
    }
    const signTex = bannerTexture(name, '#111722', '#ff6b1a');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 2.2), new THREE.MeshStandardMaterial({ map: signTex, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x1c0b03, emissiveMap: signTex, emissiveIntensity: 0.4 }));
    sign.position.set(0, 8.9, 9.0);
    g.add(sign);
    return g;
  };
  group.add(makeStand(-52, -1, 'APEX GP'));
  group.add(makeStand(150, 1, 'NITROX'));

  // pit building along the start straight
  {
    const s = samples[(count - Math.round(24 / step) + count) % count];
    const g = new THREE.Group();
    g.position.copy(s.p).addScaledVector(s.r, -(halfWidth + 15));
    g.rotation.y = Math.atan2(-s.t.x, -s.t.z) + Math.PI / 2;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.7, metalness: 0.1 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2b3c, roughness: 0.15, metalness: 0.9, emissive: 0x0a1826, emissiveIntensity: 0.5 });
    const bld = new THREE.Mesh(new THREE.BoxGeometry(72, 9, 15), wallMat);
    bld.position.y = 4.5; bld.receiveShadow = true;
    g.add(bld);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(66, 2.7, 15.3), glassMat);
    glass.position.set(0, 7.4, 0);
    g.add(glass);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(76, 0.5, 19), new THREE.MeshStandardMaterial({ color: 0x343940, roughness: 0.6, metalness: 0.4 }));
    roof.position.set(0, 9.2, 1.2);
    g.add(roof);
    const signTex = bannerTexture('APEX RACING', '#0d141d', '#32e6ff', 'PIT LANE');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.5, emissive: 0x07121a, emissiveMap: signTex, emissiveIntensity: 0.8 }));
    sign.position.set(-18, 6.0, 7.62);
    g.add(sign);
    for (let i = 0; i < 7; i++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x252c36, roughness: 0.6 }));
      door.position.set(-26 + i * 8.5, 2.1, 7.62);
      g.add(door);
      if (i === 3) door.material = new THREE.MeshStandardMaterial({ color: 0xff5d12, emissive: 0x501500, emissiveIntensity: 0.4, roughness: 0.5 });
    }
    // dark glazing above the pit boxes
    for (let i = 0; i < 9; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(5.7, 1.9, 0.22), glassMat);
      win.position.set(-32 + i * 8, 5.0, 7.62);
      g.add(win);
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(71, 0.42, 0.24), new THREE.MeshStandardMaterial({
      color: 0xff5d12, emissive: 0x5c1a00, emissiveIntensity: 0.55, roughness: 0.45,
    }));
    band.position.set(0, 3.55, 7.64);
    g.add(band);
    group.add(g);
  }

  // ---------- billboards ----------
  const ads = [
    ['NITROX', '#0b1119', '#32e6ff'],
    ['VELOCE', '#101418', '#ff6b1a'],
    ['APEX', '#0d1117', '#f5f2e8'],
    ['TURBO', '#141018', '#ff4d7d'],
    ['MOTO', '#0b1410', '#9dff6b'],
    ['GRIP-X', '#111014', '#ffe066'],
  ];
  const billboards = [];
  for (let i = 0; i < 12; i++) {
    const idx = Math.round((i / 12) * count + 37) % count;
    const s = samples[idx];
    if (Math.abs(s.s - samples[0].s) < 30) continue;
    const side = i % 2 ? 1 : -1;
    const tex = bannerTexture(...ads[i % ads.length]);
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x100a04, emissiveMap: tex, emissiveIntensity: 0.35 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.6), mat);
    const g = new THREE.Group();
    const p = s.p.clone().addScaledVector(s.r, side * (halfWidth + 10.6));
    g.position.copy(p).setY(0);
    g.rotation.y = Math.atan2(-s.t.x, -s.t.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    board.position.y = 2.7;
    g.add(board);
    for (const x of [-3.6, 3.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.22), steel);
      post.position.set(x, 1.5, -0.12);
      g.add(post);
    }
    group.add(g);
    billboards.push(board);
  }

  // ---------- flora ----------
  const palmTrunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 6.4, 7, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b543c, roughness: 0.95 });
  const leafGeo = makePalmLeaves();
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x33512f, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
  const positions = [];
  for (let i = 0; i < count; i += 5) {
    if (Math.random() < 0.55) continue;
    const s = samples[i];
    const side = Math.random() > 0.5 ? 1 : -1;
    const lat = side * (halfWidth + 22 + Math.random() * 55);
    const p = s.p.clone().addScaledVector(s.r, lat);
    if (Math.abs(lat) < halfWidth + 16) continue;
    positions.push({ p, rot: Math.random() * Math.PI * 2, scale: 0.7 + Math.random() * 0.8, tilt: (Math.random() - 0.5) * 0.16 });
  }
  const palms = new THREE.InstancedMesh(palmTrunkGeo, trunkMat, positions.length);
  const fronds = new THREE.InstancedMesh(leafGeo, leafMat, positions.length);
  positions.forEach((t, i) => {
    dummy.position.copy(t.p).setY(t.p.y + 3.0 * t.scale);
    dummy.rotation.set(t.tilt, t.rot, t.tilt * 0.7);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    palms.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(t.p).setY(t.p.y + 6.2 * t.scale);
    dummy.rotation.set(t.tilt, t.rot, t.tilt * 0.7);
    dummy.scale.setScalar(t.scale);
    dummy.updateMatrix();
    fronds.setMatrixAt(i, dummy.matrix);
  });
  palms.receiveShadow = true;
  group.add(palms, fronds);

  // bushes
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x2d4429, roughness: 1, flatShading: true });
  const bushPos = [];
  for (let i = 0; i < count; i += 7) {
    if (Math.random() < 0.5) continue;
    const s = samples[i];
    const side = Math.random() > 0.5 ? 1 : -1;
    const lat = side * (halfWidth + 8 + Math.random() * 10);
    bushPos.push({ p: s.p.clone().addScaledVector(s.r, lat), sc: 0.7 + Math.random() * 1.6 });
  }
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushPos.length);
  bushPos.forEach((b, i) => {
    dummy.position.copy(b.p).setY(b.sc * 0.55);
    dummy.rotation.set(0, Math.random() * 6, 0);
    dummy.scale.set(b.sc * 1.2, b.sc * 0.75, b.sc * 1.2);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
  });
  group.add(bushes);

  // ---------- distant mountain ranges ----------
  const hills = new THREE.Group();
  const hillColor = def.theme === 'night' ? 0x0c1422 : def.theme === 'sunset' ? 0x3a3450 : 0x526b7c;
  const hillMat = new THREE.MeshStandardMaterial({ color: hillColor, roughness: 1, flatShading: true });
  const isNight = def.theme === 'night';
  const mountainCount = isNight ? 18 : 30;
  for (let i = 0; i < mountainCount; i++) {
    const a = (i / mountainCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
    const r = (isNight ? 700 : 900) + Math.random() * (isNight ? 220 : 420);
    const cluster = 2 + ((Math.random() * 3) | 0);
    for (let k = 0; k < cluster; k++) {
      const ca = a + (Math.random() - 0.5) * 0.09;
      const cr = r + (Math.random() - 0.5) * 140;
      const h = (isNight ? 35 : 65) + Math.random() * (isNight ? 75 : 150);
      const rad = (isNight ? 90 : 120) + Math.random() * (isNight ? 120 : 210);
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(rad, h, 7 + ((Math.random() * 5) | 0), 1),
        hillMat
      );
      peak.position.set(Math.cos(ca) * cr, h / 2 - 18, Math.sin(ca) * cr);
      peak.rotation.y = Math.random() * 3;
      peak.scale.set(1, 1, 0.55 + Math.random() * 0.55);
      hills.add(peak);
    }
  }
  group.add(hills);

  // midground foothills soften the transition to the horizon
  const footMat = new THREE.MeshStandardMaterial({
    color: def.theme === 'night' ? 0x0a121c : def.theme === 'sunset' ? 0x2c2a33 : 0x47603f,
    roughness: 1, flatShading: true,
  });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    const r = 560 + Math.random() * 190;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), footMat);
    hill.position.set(Math.cos(a) * r, -20, Math.sin(a) * r);
    hill.scale.set(110 + Math.random() * 120, 20 + Math.random() * 26, 90 + Math.random() * 100);
    hill.rotation.y = Math.random() * Math.PI;
    hills.add(hill);
  }
  group.add(hills);

  // city skyline for night
  if (def.theme === 'night') {
    const city = new THREE.Group();
    const winTex = windowTexture();
    winTex.repeat.set(1, 3);
    const cityMat = new THREE.MeshStandardMaterial({
      color: 0x1b2533, map: winTex, roughness: 0.82, metalness: 0.18,
      emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.15,
    });
    const neonCols = [0x19d8ff, 0xff2f8e, 0xffc14a, 0x9d6bff];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
      const r = 390 + Math.random() * 230;
      const w = 16 + Math.random() * 26;
      const h = 26 + Math.random() * 120;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), cityMat);
      b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      city.add(b);
      if (i % 4 === 0) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.8, 0.7, w + 0.8),
          new THREE.MeshBasicMaterial({ color: neonCols[(i / 4) % neonCols.length] })
        );
        band.position.set(b.position.x, h * (0.55 + Math.random() * 0.3), b.position.z);
        city.add(band);
      }
    }
    group.add(city);
  }

  // ---------- night dressing ----------
  const nightExtras = new THREE.Group();
  if (def.theme === 'night') {
    const poolTex = glowTexture('rgba(255,220,160,0.9)');
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    const poolGeo = new THREE.PlaneGeometry(34, 34);
    for (let i = 0; i < count; i += 48) {
      const s = samples[i];
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.copy(s.p).setY(0.06);
      nightExtras.add(pool);
    }
    // neon arches
    const neonMat = new THREE.MeshStandardMaterial({ color: 0x0a1a22, emissive: 0x19d8ff, emissiveIntensity: 2.4, roughness: 0.4 });
    for (let k = 0; k < 4; k++) {
      const idx = Math.round((k / 4) * count + 130) % count;
      const s = samples[idx];
      const arch = new THREE.Group();
      arch.position.copy(s.p);
      arch.rotation.y = Math.atan2(-s.t.x, -s.t.z);
      const colGeo = new THREE.BoxGeometry(0.55, 7.5, 0.55);
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(colGeo, steel);
        c.position.set(side * (halfWidth + 4), 3.7, 0);
        arch.add(c);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 7.2, 0.18), neonMat);
        strip.position.set(side * (halfWidth + 3.65), 3.7, 0.35);
        arch.add(strip);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry((halfWidth + 4) * 2, 0.55, 0.55), steel);
      top.position.y = 7.6;
      arch.add(top);
      const topStrip = new THREE.Mesh(new THREE.BoxGeometry((halfWidth + 3.8) * 2, 0.16, 0.16), neonMat);
      topStrip.position.set(0, 7.35, 0.35);
      arch.add(topStrip);
      nightExtras.add(arch);
    }
    // roadside lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6, metalness: 0.7 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    const glowMat = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,210,150,0.95)'), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const poles = [];
    for (let i = 0; i < count; i += 34) {
      const s = samples[i];
      const side = (i / 34) % 2 ? 1 : -1;
      const g = new THREE.Group();
      g.position.copy(s.p).addScaledVector(s.r, side * (halfWidth + 8.6));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8, 6), lampMat);
      pole.position.y = 4;
      g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.14), lampMat);
      arm.position.set(-side * 0.7, 8, 0);
      g.add(arm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), bulbMat);
      bulb.position.set(-side * 1.4, 7.95, 0);
      g.add(bulb);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(4.2, 4.2, 1);
      glow.position.copy(bulb.position);
      g.add(glow);
      nightExtras.add(g);
      poles.push(g);
    }
    group.add(nightExtras);
  }

  const track = {
    def, curve, samples, count, step, length, halfWidth, group, gridSlots,
    roadMat, roadTex, startLights, startGantry, billboards, grassTex, asphaltTex: roadTex,
    nearest(pos, hint = -1) {
      let bestIdx = 0, bestDist = Infinity;
      if (hint < 0) {
        for (let i = 0; i < count; i++) {
          const d = samples[i].p.distanceToSquared(pos);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
      } else {
        for (let k = -45; k <= 45; k++) {
          const i = (hint + k + count) % count;
          const d = samples[i].p.distanceToSquared(pos);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
      }
      const s = samples[bestIdx];
      const d = pos.clone().sub(s.p);
      const lateral = d.dot(s.r);
      const along = d.dot(s.t);
      let dist = s.s + along;
      if (dist < 0) dist += length;
      if (dist >= length) dist -= length;
      return { idx: bestIdx, lateral, s: dist, u: dist / length };
    },
    pointAt(dist) {
      let d = dist % length;
      if (d < 0) d += length;
      const idx = Math.min(count - 1, Math.floor(d / step));
      const s = samples[idx];
      const next = samples[(idx + 1) % count];
      const f = (d - idx * step) / step;
      return {
        p: s.p.clone().lerp(next.p, f),
        t: s.t.clone().lerp(next.t, f).normalize(),
        r: s.r.clone().lerp(next.r, f).normalize(),
        idx,
      };
    },
  };
  return track;
}

function makePalmLeaves() {
  const geos = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const segs = 5;
    const pos = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const w = 0.42 * (1 - f * 0.85) * (i === 0 ? 0.4 : 1);
      const len = 3.4 * f;
      const y = -0.12 - f * f * 0.85;
      pos.push(len, y, -w, len, y, w);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.rotateY((k / n) * Math.PI * 2 + 0.2);
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeometries(geos);
}
