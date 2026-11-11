import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function noise(ctx, w, h, amount, alpha = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    d[i + 3] = Math.min(255, d[i + 3] * alpha);
  }
  ctx.putImageData(img, 0, 0);
}

export function asphaltTexture(renderer) {
  const w = 512, h = 512;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#34373c';
  ctx.fillRect(0, 0, w, h);
  // aggregate
  for (let i = 0; i < 9000; i++) {
    const g = 30 + Math.random() * 60;
    ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.25 + Math.random() * 0.45})`;
    const s = 0.6 + Math.random() * 2.2;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  // faint longitudinal tire bands
  for (const x of [w * 0.28, w * 0.72]) {
    const grad = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
    grad.addColorStop(0, 'rgba(15,15,18,0)');
    grad.addColorStop(0.5, 'rgba(15,15,18,0.28)');
    grad.addColorStop(1, 'rgba(15,15,18,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 30, 0, 60, h);
  }
  // patches & cracks
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(12,12,14,${0.12 + Math.random() * 0.2})`;
    ctx.lineWidth = 0.7 + Math.random() * 1.4;
    ctx.beginPath();
    let x = Math.random() * w, y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let j = 0; j < 5; j++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  noise(ctx, w, h, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function grassTexture(renderer) {
  const w = 512, h = 512;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#33452b';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 12000; i++) {
    const g = 40 + Math.random() * 55;
    ctx.fillStyle = `rgba(${Math.floor(g * 0.62)},${g},${Math.floor(g * 0.55)},${0.18 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 4);
  }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = `rgba(28,38,24,${0.06 + Math.random() * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 70, 20 + Math.random() * 50, Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  noise(ctx, w, h, 12);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function gravelTexture(renderer) {
  const w = 256, h = 256;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#8c7e67';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3500; i++) {
    const g = 90 + Math.random() * 80;
    ctx.fillStyle = `rgba(${g},${g * 0.93},${g * 0.8},${0.5 + Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  noise(ctx, w, h, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function checkerTexture() {
  const s = 256;
  const c = canvas(s, s), ctx = c.getContext('2d');
  const n = 8, q = s / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e9e9e4' : '#16171a';
      ctx.fillRect(x * q, y * q, q, q);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function bannerTexture(text, bg = '#101319', fg = '#ff6b1a', sub = '') {
  const w = 1024, h = 256;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // diagonal stripes
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 26;
  for (let x = -h; x < w + h; x += 110) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.fillStyle = fg;
  ctx.font = '700 150px "Russo One", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + (sub ? -18 : 4));
  if (sub) {
    ctx.fillStyle = '#e8eef8';
    ctx.font = '600 38px "Exo 2", sans-serif';
    ctx.fillText(sub, w / 2, h / 2 + 74);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function glowTexture(color = '#ffffff') {
  const s = 128;
  const c = canvas(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.22, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function smokeTexture() {
  const s = 128;
  const c = canvas(s, s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function nameTexture(text, color) {
  const w = 512, h = 128;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,9,14,0.7)';
  ctx.beginPath();
  ctx.roundRect(8, 30, w - 16, 68, 14);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(26, 44, 8, 40);
  ctx.fillStyle = '#f2f6ff';
  ctx.font = '700 38px "Exo 2", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 52, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function windowTexture() {
  const w = 256, h = 512;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1018';
  ctx.fillRect(0, 0, w, h);
  for (let y = 10; y < h; y += 22) {
    for (let x = 8; x < w; x += 18) {
      const lit = Math.random();
      if (lit > 0.38) {
        const warm = Math.random() > 0.5;
        ctx.fillStyle = warm ? `rgba(255,${180 + Math.random() * 50},110,${0.3 + Math.random() * 0.7})` : `rgba(120,210,255,${0.2 + Math.random() * 0.6})`;
        ctx.fillRect(x, y, 10, 12);
      } else {
        ctx.fillStyle = 'rgba(25,35,50,0.8)';
        ctx.fillRect(x, y, 10, 12);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function stripeTexture(colorA = '#ff6b1a', colorB = '#f2f4f8') {
  const c = canvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = colorB;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = colorA;
  for (let i = 0; i < 4; i++) ctx.fillRect(0, i * 16, 64, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function crowdTexture() {
  const w = 256, h = 128;
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const colors = ['#ff6b1a', '#32e6ff', '#ffe066', '#ff4d7d', '#9dff6b', '#ffffff', '#8a7dff'];
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = 0.5 + Math.random() * 0.5;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
