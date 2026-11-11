import * as THREE from 'three';
import { glowTexture, smokeTexture } from './textures.js';

export const THEMES = {
  day: {
    id: 'day',
    skyTop: 0x1f60b6, skyHorizon: 0xa8d2ec, skyGround: 0x708a78,
    fog: 0xaed0e6, fogNear: 180, fogFar: 1500,
    sunDir: [0.42, 0.6, 0.38], sunColor: 0xfff1d6, sunIntensity: 3.25,
    hemiSky: 0xbddcff, hemiGround: 0x3f4f36, hemiIntensity: 0.85,
    exposure: 1.07, ambient: 0.1, night: false,
    lightColor: 0xfff0d0,
  },
  sunset: {
    id: 'sunset',
    skyTop: 0x1a2256, skyHorizon: 0xff8d4e, skyGround: 0xa05d4b,
    fog: 0xc07a60, fogNear: 150, fogFar: 1400,
    sunDir: [-0.32, 0.12, -0.94], sunColor: 0xffab62, sunIntensity: 2.9,
    hemiSky: 0xffb286, hemiGround: 0x2f3148, hemiIntensity: 0.72,
    exposure: 1.15, ambient: 0.08, night: false,
    lightColor: 0xffb887,
  },
  night: {
    id: 'night',
    skyTop: 0x030611, skyHorizon: 0x0c1a38, skyGround: 0x04070d,
    fog: 0x091326, fogNear: 90, fogFar: 780,
    sunDir: [-0.35, 0.55, -0.7], sunColor: 0xa9c6ff, sunIntensity: 0.6,
    hemiSky: 0x4c6ea8, hemiGround: 0x10131c, hemiIntensity: 0.5,
    exposure: 1.28, ambient: 0.06, night: true,
    lightColor: 0xbcd4ff,
  },
};

function skyMaterial(theme) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(theme.skyTop) },
      uHorizon: { value: new THREE.Color(theme.skyHorizon) },
      uGround: { value: new THREE.Color(theme.skyGround) },
      uSunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
      uSunColor: { value: new THREE.Color(theme.sunColor) },
      uSunPower: { value: theme.night ? 900 : 420 },
      uSunGlow: { value: theme.night ? 0.25 : 0.7 },
      uNight: { value: theme.night ? 1 : 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunColor;
      uniform float uSunPower, uSunGlow, uNight;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.8));
        col = mix(col, uGround, smoothstep(0.0, -0.18, h));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunColor * pow(sd, uSunPower) * (uNight > 0.5 ? 0.4 : 1.4);
        col += uSunColor * pow(sd, 7.0) * uSunGlow * (1.0 - uNight * 0.5);
        // faint haze band on the horizon
        col += uHorizon * 0.16 * exp(-abs(h) * 14.0);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

function cloudTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  for (let i = 0; i < 16; i++) {
    const x = s * 0.5 + (Math.random() - 0.5) * s * 0.55;
    const y = s * 0.55 + (Math.random() - 0.5) * s * 0.2;
    const r = s * (0.12 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function setupEnvironment(scene, theme, renderer) {
  scene.background = new THREE.Color(theme.skyHorizon);
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1700, 48, 32), skyMaterial(theme));
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(theme.lightColor, theme.ambient);
  scene.add(amb);

  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 55;
  sun.shadow.camera.bottom = -55;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // sun / moon disc
  const sunGlowTex = glowTexture(theme.night ? 'rgba(215,232,255,0.95)' : 'rgba(255,230,180,0.95)');
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunGlowTex, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, opacity: theme.night ? 0.55 : 0.9, fog: false,
  }));
  flare.scale.setScalar(theme.night ? 130 : 260);
  flare.position.copy(sunDir).multiplyScalar(1100);
  flare.renderOrder = -2;
  scene.add(flare);

  // stars at night
  let stars = null;
  if (theme.night) {
    const pos = [];
    for (let i = 0; i < 1400; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.1, Math.random() * 2 - 1).normalize().multiplyScalar(1500);
      if (v.y < 25) continue;
      pos.push(v.x, v.y, v.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const starsMat = new THREE.PointsMaterial({
      color: 0xdce9ff, size: 3.4, sizeAttenuation: true, transparent: true,
      opacity: 0.9, depthWrite: false, fog: false,
    });
    stars = new THREE.Points(g, starsMat);
    stars.renderOrder = -1;
    scene.add(stars);
  }

  // clouds for day / sunset
  let clouds = null;
  if (!theme.night) {
    clouds = new THREE.Group();
    const tex = cloudTexture();
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: theme.id === 'sunset' ? 0.42 : 0.5,
      depthWrite: false, color: theme.id === 'sunset' ? 0xffb39a : 0xffffff, fog: false,
    });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 650 + Math.random() * 650;
      const sp = new THREE.Sprite(mat);
      sp.position.set(Math.cos(a) * r, 130 + Math.random() * 220, Math.sin(a) * r);
      const sc = 220 + Math.random() * 380;
      sp.scale.set(sc, sc * 0.42, 1);
      sp.renderOrder = -1;
      clouds.add(sp);
    }
    scene.add(clouds);
  }

  return { sun, sunDir, hemi, amb, sky, flare, stars, clouds, theme };
}

export class Particles {
  constructor(scene, { count = 220, texture, color = 0xffffff, additive = true, size = 2 }) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture } },
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (280.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, t.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geometry = g;
    this.baseColor = new THREE.Color(color);
  }

  spawn(pos, vel, opts = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.vel[i * 3] = vel.x;
    this.vel[i * 3 + 1] = vel.y;
    this.vel[i * 3 + 2] = vel.z;
    const c = new THREE.Color(opts.color ?? this.baseColor);
    this.colors[i * 3] = c.r; this.colors[i * 3 + 1] = c.g; this.colors[i * 3 + 2] = c.b;
    this.sizes[i] = opts.size ?? 1;
    this.life[i] = this.maxLife[i] = opts.life ?? 0.8;
    this.alphas[i] = opts.alpha ?? 0.7;
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.alphas[i] = 0; continue; }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alphas[i] = f * 0.7;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] += 1.6 * dt;
      this.sizes[i] *= 1 + dt * 1.4;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aColor.needsUpdate = true;
  }
}

export function makeParticleSystems(scene) {
  const smoke = new Particles(scene, { count: 240, texture: smokeTexture(), color: 0xd8cdb8, additive: false, size: 2.6 });
  const sparks = new Particles(scene, { count: 90, texture: glowTexture('rgba(255,220,160,1)'), color: 0xffc46a, additive: true, size: 0.7 });
  const flames = new Particles(scene, { count: 80, texture: glowTexture('rgba(255,190,90,1)'), color: 0xff8a2a, additive: true, size: 1.1 });
  return { smoke, sparks, flames };
}
