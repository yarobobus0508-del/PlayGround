import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { glowTexture, nameTexture } from './textures.js';

const BIKE_FILES = [
  { url: './assets/models/sportbike.glb', yaw: -Math.PI / 2, name: 'VIPER R1' },
  { url: './assets/models/sportbike2.glb', yaw: Math.PI, name: 'FALCON M2' },
];

function normalizeBike(scene, yaw) {
  const wrap = new THREE.Group();
  const inner = scene;
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  inner.position.set(-center.x, -box.min.y, -center.z);
  inner.rotation.y = yaw;
  inner.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.envMapIntensity = 0.85;
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      m.roughness = Math.min(0.95, (m.roughness ?? 0.5) * 0.95 + 0.05);
    }
  });
  wrap.add(inner);
  wrap.userData.size = size;
  return wrap;
}

export async function loadBikeTemplates(onProgress) {
  const loader = new GLTFLoader();
  const templates = [];
  for (let i = 0; i < BIKE_FILES.length; i++) {
    const file = BIKE_FILES[i];
    const gltf = await loader.loadAsync(file.url);
    const wrap = normalizeBike(gltf.scene, file.yaw);
    wrap.userData.name = file.name;
    wrap.userData.index = i;
    templates.push(wrap);
    if (onProgress) onProgress((i + 1) / BIKE_FILES.length);
  }
  return templates;
}

function capsuleBetween(a, b, radius, mat, radial = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 5, radial);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function buildRider(accent) {
  const g = new THREE.Group();
  g.name = 'rider';
  const suit = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.52, metalness: 0.12 });
  const suit2 = new THREE.MeshStandardMaterial({ color: 0x242a34, roughness: 0.6, metalness: 0.1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35, metalness: 0.25, emissive: accent, emissiveIntensity: 0.13 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.45, metalness: 0.1 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a1420, roughness: 0.08, metalness: 0.95, emissive: 0x0a2440, emissiveIntensity: 0.5 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.65 });

  const hips = new THREE.Vector3(0, 0.94, 0.16);
  const shoulders = new THREE.Vector3(0, 1.26, -0.15);
  const head = new THREE.Vector3(0, 1.43, -0.35);
  const hipsL = new THREE.Vector3(0.135, 0.93, 0.15);
  const hipsR = new THREE.Vector3(-0.135, 0.93, 0.15);

  // pelvis + torso
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), suit2);
  pelvis.scale.set(1.15, 0.8, 1);
  pelvis.position.copy(hips);
  pelvis.castShadow = true;
  g.add(pelvis);

  g.add(capsuleBetween(new THREE.Vector3(0, 0.99, 0.11), new THREE.Vector3(0, 1.24, -0.14), 0.155, suit, 14));
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 12), suit);
  chest.position.set(0, 1.2, -0.08);
  chest.scale.set(1.15, 0.85, 1.25);
  chest.castShadow = true;
  g.add(chest);
  // racing hump
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), accentMat);
  hump.position.set(0, 1.22, 0.18);
  hump.scale.set(1, 0.9, 1.6);
  hump.castShadow = true;
  g.add(hump);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.02), white);
  stripe.position.set(0, 1.245, -0.205);
  stripe.rotation.x = -0.75;
  g.add(stripe);

  // helmet
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.178, 20, 16), accentMat);
  helmet.position.copy(head);
  helmet.scale.set(0.94, 1.0, 1.06);
  helmet.castShadow = true;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 12), visorMat);
  visor.position.set(0, 1.44, -0.43);
  visor.scale.set(0.86, 0.66, 0.62);
  g.add(visor);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), suit2);
  chin.position.set(0, 1.355, -0.35);
  chin.scale.set(0.9, 0.75, 1.1);
  g.add(chin);

  // arms
  for (const side of [1, -1]) {
    const sh = new THREE.Vector3(side * 0.16, 1.24, -0.14);
    const elbow = new THREE.Vector3(side * 0.3, 1.08, -0.4);
    const hand = new THREE.Vector3(side * 0.28, 0.99, -0.62);
    g.add(capsuleBetween(sh, elbow, 0.065, suit, 8));
    g.add(capsuleBetween(elbow, hand, 0.052, suit2, 8));
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), accentMat);
    glove.position.copy(hand);
    g.add(glove);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), accentMat);
    shoulder.position.copy(sh);
    g.add(shoulder);
    // legs (knee up, boot back)
    const hipP = side > 0 ? hipsL : hipsR;
    const knee = new THREE.Vector3(side * 0.29, 0.77, -0.2);
    const foot = new THREE.Vector3(side * 0.31, 0.46, 0.16);
    g.add(capsuleBetween(hipP, knee, 0.082, suit, 8));
    g.add(capsuleBetween(knee, foot, 0.065, suit2, 8));
    const kneePad = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), accentMat);
    kneePad.position.copy(knee);
    g.add(kneePad);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.24), bootMat);
    boot.position.copy(foot).add(new THREE.Vector3(0, -0.02, -0.04));
    boot.rotation.x = 0.25;
    boot.castShadow = true;
    g.add(boot);
  }

  return g;
}

export function createBikeVisual(template, opts = {}) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);

  const model = template.clone(true);
  model.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });
  lean.add(model);

  const accent = new THREE.Color(opts.accent ?? 0xff6b1a);
  const rider = buildRider(accent);
  lean.add(rider);

  // accent strips on the tail
  const stripMat = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.2,
  });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.11, 0.62), stripMat);
    strip.position.set(side * 0.155, 0.79, 0.62);
    strip.rotation.x = -0.08;
    lean.add(strip);
  }

  // soft ground glow, mainly visible at night
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,255,255,0.85)'), color: accent, transparent: true,
    opacity: opts.night ? 0.5 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(2.6, 2.6, 1);
  glow.position.y = 0.09;
  root.add(glow);

  // exhaust flame
  const flame = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.6, 10, 1, true), flameMat);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 0.82;
  flame.add(cone);
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,190,90,1)'), color: 0xffa040, transparent: true,
    opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flameGlow.scale.set(1.3, 1.3, 1);
  flameGlow.position.z = 0.9;
  flame.add(flameGlow);
  flame.position.set(0, 0.62, 0.55);
  flame.visible = false;
  lean.add(flame);

  // headlight for night races
  let headlight = null;
  if (opts.night) {
    headlight = new THREE.SpotLight(0xfff1d0, 55, 65, 0.42, 0.55, 1.3);
    headlight.position.set(0, 0.95, -0.62);
    headlight.target.position.set(0, 0.2, -26);
    lean.add(headlight);
    lean.add(headlight.target);
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xffe4b0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const shaft = new THREE.Mesh(new THREE.ConeGeometry(2.4, 17, 18, 1, true), shaftMat);
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.set(0, 0.82, -8.8);
    shaft.rotation.z = Math.PI;
    lean.add(shaft);
  }

  // name tag overhead
  let tag = null;
  if (opts.name) {
    const tex = nameTexture(opts.name, '#' + accent.getHexString());
    tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.9, fog: false,
    }));
    tag.scale.set(1.9, 0.48, 1);
    tag.position.set(0, 2.15, 0.2);
    root.add(tag);
  }

  return {
    root, lean, model, rider, accent, glow, flame, flameGlow, headlight, tag,
    setPose(leanAngle, pitch, bob) {
      this.lean.rotation.z = leanAngle;
      this.lean.rotation.x = pitch;
      this.lean.position.y = bob;
      this.rider.rotation.z = -leanAngle * 0.12;
      this.rider.rotation.x = Math.max(0, pitch) * 0.6;
    },
    setBoost(on, time) {
      this.flame.visible = on;
      if (on) {
        const s = 0.9 + Math.sin(time * 45) * 0.18 + Math.random() * 0.12;
        this.flame.scale.set(1, s, 1);
        this.flameGlow.material.opacity = 0.55 + Math.random() * 0.35;
      }
    },
    setTagVisible(v) { if (this.tag) this.tag.visible = v; },
    setTagOpacity(v) { if (this.tag) this.tag.material.opacity = v; },
    dispose() {
      this.root.traverse(o => {
        if (o.isMesh && o.geometry && o.userData.shared !== true) {
          // geometry is shared with the template, so only dispose materials we created
        }
      });
    },
  };
}

export function createShowroomBike(template) {
  const root = new THREE.Group();
  const model = template.clone(true);
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  root.add(model);
  return root;
}
