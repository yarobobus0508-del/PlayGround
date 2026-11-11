export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.master = null;
    this.engineGain = null;
    this.windGain = null;
    this.skidGain = null;
    this.musicGain = null;
    this.nextNote = 0;
    this.step = 0;
    this.musicTimer = null;
    this.lastSkid = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.75 : 0;
    this.master.connect(this.ctx.destination);

    // engine
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 3;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.master);

    this.oscA = this.ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscA.frequency.value = 60;
    this.oscB = this.ctx.createOscillator();
    this.oscB.type = 'square';
    this.oscB.frequency.value = 30;
    this.oscC = this.ctx.createOscillator();
    this.oscC.type = 'sawtooth';
    this.oscC.frequency.value = 121;
    const gA = this.ctx.createGain(); gA.gain.value = 0.55;
    const gB = this.ctx.createGain(); gB.gain.value = 0.28;
    const gC = this.ctx.createGain(); gC.gain.value = 0.18;
    this.oscA.connect(gA); gA.connect(this.engineGain);
    this.oscB.connect(gB); gB.connect(this.engineGain);
    this.oscC.connect(gC); gC.connect(this.engineGain);
    this.oscA.start(); this.oscB.start(); this.oscC.start();

    // wind
    const windBuf = this.noiseBuffer(2.5);
    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = windBuf; windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.master);
    windSrc.start();

    // skid
    const skidSrc = this.ctx.createBufferSource();
    skidSrc.buffer = windBuf; skidSrc.loop = true;
    const skidFilter = this.ctx.createBiquadFilter();
    skidFilter.type = 'bandpass'; skidFilter.frequency.value = 2300; skidFilter.Q.value = 4;
    this.skidGain = this.ctx.createGain(); this.skidGain.gain.value = 0;
    skidSrc.connect(skidFilter); skidFilter.connect(this.skidGain); this.skidGain.connect(this.master);
    skidSrc.start();

    // music bus
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.18;
    this.musicGain.connect(this.master);

    this.started = true;
    this.scheduleMusic();
  }

  noiseBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + white * 0.04) * 0.995;
      d[i] = last * 8 + white * 0.4;
    }
    return buf;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.75 : 0, this.ctx.currentTime, 0.05);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEngine(speed, throttle, boost) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + speed * 2.15 + (boost ? 22 : 0);
    this.oscA.frequency.setTargetAtTime(f, t, 0.06);
    this.oscB.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.oscC.frequency.setTargetAtTime(f * 2.02, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(420 + speed * 32 + throttle * 450, t, 0.08);
    const vol = 0.035 + throttle * 0.04 + Math.min(0.03, speed * 0.0004);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.09);
    this.windGain.gain.setTargetAtTime(Math.min(0.13, speed * 0.0022), t, 0.2);
    this.windFilter.frequency.setTargetAtTime(500 + speed * 22, t, 0.2);
  }

  setSkid(amount) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(Math.min(0.09, amount * 0.09), this.ctx.currentTime, 0.06);
  }

  idle() {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  blip(freq = 620, dur = 0.09, type = 'square', vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  countdown(n) {
    if (n > 0) this.blip(420 + (3 - n) * 120, 0.16, 'square', 0.16);
    else this.blip(960, 0.55, 'sawtooth', 0.16);
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.8);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.55);
    this.blip(90, 0.25, 'sawtooth', 0.18);
  }

  scheduleMusic() {
    if (!this.ctx) return;
    const chords = [
      [110.0, 130.81, 164.81],
      [87.31, 110.0, 130.81],
      [98.0, 123.47, 146.83],
      [82.41, 103.83, 123.47],
    ];
    const arp = [
      [0, 2, 1, 2, 0, 2, 1, 2],
      [0, 3, 2, 3, 0, 3, 2, 3],
      [0, 2, 1, 2, 0, 2, 1, 2],
      [0, 3, 2, 3, 0, 3, 2, 3],
    ];
    const bpm = 104;
    const beat = 60 / bpm;
    const lookahead = 0.18;
    const tick = () => {
      if (!this.ctx) return;
      while (this.nextNote < this.ctx.currentTime + lookahead) {
        const t = this.nextNote;
        const bar = Math.floor(this.step / 8) % 4;
        const s8 = this.step % 8;
        const chord = chords[bar];
        // pad on bar start
        if (s8 === 0) {
          for (const f of chord) this.pad(f, t, beat * 8, 0.028);
          this.kick(t, 0.5);
          this.kick(t + beat * 4, 0.38);
        }
        // bass
        if (s8 % 2 === 0) this.bass(chord[0] / 2, t, beat * 0.85, 0.09);
        // arp
        const note = chord[arp[bar][s8] % chord.length] * 4;
        this.pluck(note, t, beat * 0.5, 0.035);
        if (s8 === 4 || s8 === 7) this.hat(t, 0.02);
        this.nextNote += beat / 2;
        this.step++;
      }
    };
    this.nextNote = this.ctx.currentTime + 0.1;
    tick();
    this.musicTimer = setInterval(tick, 90);
  }

  pad(freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    o2.type = 'sawtooth'; o2.frequency.value = freq * 1.006;
    f.type = 'lowpass'; f.frequency.value = 850; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.6);
    g.gain.setValueAtTime(vol, t + dur - 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  bass(freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(110, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  pluck(freq, t, dur, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 2600;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  kick(t, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + 0.2);
  }

  hat(t, vol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.1);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(t); src.stop(t + 0.1);
  }
}
