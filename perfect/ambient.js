/*
 * Generative ambient music, synthesised live with the Web Audio API (no audio
 * files). Slow evolving pad chords, a soft drone and sparse bell notes, all
 * in D major pentatonic so nothing ever clashes. The game can add chimes:
 * apples rise in pitch as the board fills, a win plays an arpeggio.
 */
(function (root) {
  'use strict';

  const CHORDS = [
    [50, 57, 61, 64, 66], // Dmaj9
    [47, 54, 57, 62, 64], // Bm11
    [43, 50, 54, 59, 61], // Gmaj7#11
    [45, 52, 59, 62, 66]  // A6sus
  ];
  const PENTA = [2, 4, 6, 9, 11]; // D E F# A B (pitch classes)
  const CHORD_SECONDS = 11;
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function pentatonic(low, high) {
    const out = [];
    for (let m = low; m <= high; m++) if (PENTA.includes(m % 12)) out.push(m);
    return out;
  }
  const CHIME_NOTES = pentatonic(62, 93);

  const Ambient = {
    ctx: null, master: null, music: null, fx: null, reverb: null, delay: null,
    on: false, volume: 0.6, timer: null, nextChordAt: 0, chordIndex: 0, nextSparkleAt: 0,
    lastChime: 0,

    init() {
      if (this.ctx) return true;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(6.5);
      const wet = ctx.createGain();
      wet.gain.value = 0.85;
      this.reverb.connect(wet).connect(this.master);

      this.delay = ctx.createDelay(2);
      this.delay.delayTime.value = 0.56;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.38;
      const delayTone = ctx.createBiquadFilter();
      delayTone.type = 'lowpass';
      delayTone.frequency.value = 2400;
      this.delay.connect(delayTone).connect(feedback).connect(this.delay);
      delayTone.connect(this.reverb);
      delayTone.connect(this.master);

      this.music = ctx.createGain(); // pads, drone, sparkles
      this.music.gain.value = 1;
      this.music.connect(this.master);
      this.music.connect(this.reverb);
      this.fx = ctx.createGain(); // game chimes
      this.fx.gain.value = 0.9;
      this.fx.connect(this.master);
      this.fx.connect(this.reverb);
      this.fx.connect(this.delay);
      return true;
    },

    impulse(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      return buf;
    },

    start() {
      if (!this.init()) return false;
      this.on = true;
      const ctx = this.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(this.volume * 0.9, t + 2.5);
      this.nextChordAt = Math.max(this.nextChordAt, t + 0.05);
      this.nextSparkleAt = Math.max(this.nextSparkleAt, t + 3);
      clearInterval(this.timer);
      this.timer = setInterval(() => this.schedule(), 400);
      this.schedule();
      return true;
    },

    stop() {
      this.on = false;
      clearInterval(this.timer);
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => { if (!this.on && this.ctx) this.ctx.suspend(); }, 1400);
    },

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.ctx && this.on) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(this.volume * 0.9, t, 0.2);
      }
    },

    // Look ahead and queue chords and sparkles a few seconds in advance.
    schedule() {
      if (!this.on) return;
      const ahead = this.ctx.currentTime + 3;
      while (this.nextChordAt < ahead) {
        this.playChord(CHORDS[this.chordIndex % CHORDS.length], this.nextChordAt);
        this.chordIndex++;
        this.nextChordAt += CHORD_SECONDS;
      }
      while (this.nextSparkleAt < ahead) {
        const notes = pentatonic(74, 90);
        this.bell(notes[(Math.random() * notes.length) | 0], this.nextSparkleAt, 0.05, this.music, 5);
        this.nextSparkleAt += 2.5 + Math.random() * 5;
      }
    },

    playChord(notes, at) {
      const ctx = this.ctx;
      const dur = CHORD_SECONDS + 6;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.6;
      filter.frequency.setValueAtTime(500, at);
      filter.frequency.linearRampToValueAtTime(1300, at + CHORD_SECONDS * 0.55);
      filter.frequency.linearRampToValueAtTime(600, at + dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.linearRampToValueAtTime(0.05, at + 4);
      env.gain.setValueAtTime(0.05, at + CHORD_SECONDS);
      env.gain.linearRampToValueAtTime(0.0001, at + dur);
      filter.connect(env).connect(this.music);
      notes.forEach((m, i) => {
        [-6, 6].forEach((cents, k) => {
          const osc = ctx.createOscillator();
          osc.type = k ? 'triangle' : 'sine';
          osc.frequency.value = midiHz(m);
          osc.detune.value = cents + (Math.random() * 4 - 2);
          const g = ctx.createGain();
          g.gain.value = i === 0 ? 0.9 : 0.55;
          osc.connect(g).connect(filter);
          osc.start(at);
          osc.stop(at + dur + 0.1);
        });
      });
      // Soft drone an octave below the root.
      const drone = ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = midiHz(notes[0] - 12);
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, at);
      dg.gain.linearRampToValueAtTime(0.06, at + 5);
      dg.gain.linearRampToValueAtTime(0.0001, at + dur);
      drone.connect(dg).connect(this.music);
      drone.start(at);
      drone.stop(at + dur + 0.1);
    },

    bell(midi, at, level, dest, decay = 2.4) {
      const ctx = this.ctx;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      env.connect(dest);
      [[1, 1], [2.01, 0.28], [3.98, 0.08]].forEach(([ratio, amp]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = midiHz(midi) * ratio;
        const g = ctx.createGain();
        g.gain.value = amp;
        osc.connect(g).connect(env);
        osc.start(at);
        osc.stop(at + decay + 0.05);
      });
    },

    /* ----------------------------- game chimes ---------------------------- */

    // An apple was eaten; `progress` 0..1 is how full the board is.
    apple(progress) {
      if (!this.on || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastChime < 0.18) return; // keep it musical at high speed
      this.lastChime = now;
      const i = Math.min(CHIME_NOTES.length - 1, Math.floor(progress * CHIME_NOTES.length));
      this.bell(CHIME_NOTES[i], now + 0.01, 0.07, this.fx);
    },

    win() {
      if (!this.on || !this.ctx) return;
      const now = this.ctx.currentTime;
      [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => this.bell(m, now + 0.05 + i * 0.13, 0.08, this.fx, 3.2));
      this.lastChime = now + 1;
    },

    place(rank) {
      if (!this.on || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = [[74, 78, 81], [71, 74], [69]][rank - 1] || [66];
      notes.forEach((m, i) => this.bell(m, now + 0.03 + i * 0.12, 0.075, this.fx, 3));
    },

    loss() {
      if (!this.on || !this.ctx) return;
      const now = this.ctx.currentTime;
      this.bell(45, now + 0.02, 0.07, this.fx, 3.5);
      this.bell(52, now + 0.2, 0.05, this.fx, 3.5);
    }
  };

  root.Ambient = Ambient;
})(typeof self !== 'undefined' ? self : this);
