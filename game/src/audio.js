// Procedural sound for Solmar Bay: every effect is synthesised with the
// WebAudio API, so the game ships no sound files at all. All sounds are
// short, quiet and cheap; the engine is a looped oscillator whose pitch
// follows the player's speed, the siren a two-tone wail that only plays
// while police are near.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 660;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenTimer = 0;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* audio is decoration, never fatal */ }
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass || 1200;
      const g = ctx.createGain();
      g.gain.value = vol || 0.3;
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
    } catch { /* audio is decoration, never fatal */ }
  }

  return {
    unlock,
    /** Engine hum follows speed 0..1; call every frame while driving. */
    engine(speed01) {
      if (!ctx || !engineOsc || muted) return;
      try {
        engineOsc.frequency.value = 46 + speed01 * 110;
        engineGain.gain.value = 0.015 + speed01 * 0.05;
      } catch { /* ignore */ }
    },
    engineOff() {
      if (engineGain) engineGain.gain.value = 0;
    },
    /** Siren wail; call every frame with whether any police is close. */
    siren(active, dt) {
      if (!ctx || !sirenOsc) return;
      try {
        if (active && !muted) {
          sirenTimer += dt;
          const phase = (sirenTimer % 0.9) < 0.45 ? 660 : 880;
          sirenOsc.frequency.value = phase;
          sirenGain.gain.value = 0.035;
        } else {
          sirenGain.gain.value = 0;
        }
      } catch { /* ignore */ }
    },
    shot() { noiseBurst(0.12, 0.5, 2800); blip(180, 0.08, 'square', 0.15, 60); },
    punch() { noiseBurst(0.09, 0.3, 500); },
    crash() { noiseBurst(0.35, 0.5, 700); },
    pickup() { blip(660, 0.09, 'sine', 0.2); setTimeout(() => blip(990, 0.12, 'sine', 0.2), 90); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110));
    },
    busted() { blip(220, 0.4, 'sawtooth', 0.2, 110); },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    get muted() { return muted; },
  };
}
