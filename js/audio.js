"use strict";
// Procedural audio follows the listener; starts only from the sound checkbox gesture.
window.EvercityAudio = class EvercityAudio {
  constructor() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw Error("Audio unavailable");
    this.context = new Audio();
    this.master = this.context.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.context.destination);
    const buffer = this.context.createBuffer(
        1,
        this.context.sampleRate * 2,
        this.context.sampleRate,
      ),
      data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = (previous + Math.random() * 0.12 - 0.06) / 1.02;
      data[i] = previous;
    }
    this.buffer = buffer;
    this.wind = this.noise(450);
    this.rain = this.noise(2600);
    this.engines = [];
    for (let i = 0; i < 3; i++) {
      const oscillator = this.context.createOscillator(),
        gain = this.context.createGain(),
        pan = this.context.createStereoPanner();
      oscillator.type = "triangle";
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(pan);
      pan.connect(this.master);
      oscillator.start();
      this.engines.push({ oscillator, gain, pan });
    }
    this.stepDistance = 0;
  }
  noise(frequency) {
    const source = this.context.createBufferSource(),
      filter = this.context.createBiquadFilter(),
      gain = this.context.createGain();
    source.buffer = this.buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    return { gain, filter };
  }
  async enabled(value) {
    await (value ? this.context.resume() : this.context.suspend());
  }
  update(dt, { player, vehicles, weather, indoor, distance, paused }) {
    if (this.context.state !== "running") return;
    const now = this.context.currentTime,
      volume = paused ? 0 : indoor ? 0.18 : 1;
    this.wind.gain.gain.setTargetAtTime(0.24 * volume, now, 0.25);
    this.rain.gain.gain.setTargetAtTime(
      weather === "rain" ? 0.9 * (indoor ? 0.28 : 1) : 0,
      now,
      0.3,
    );
    const nearest = vehicles
      .map((v) => ({
        v,
        d: Math.hypot(v.g.position.x - player.x, v.g.position.z - player.z),
      }))
      .sort((a, b) => a.d - b.d);
    this.engines.forEach((engine, i) => {
      const item = nearest[i],
        gain = item ? Math.max(0, 1 - item.d / 45) ** 2 * 0.16 * volume : 0;
      engine.gain.gain.setTargetAtTime(gain, now, 0.1);
      if (item) {
        engine.oscillator.frequency.setTargetAtTime(
          45 + item.v.speed * 6,
          now,
          0.15,
        );
        const dx = item.v.g.position.x - player.x,
          dz = item.v.g.position.z - player.z;
        engine.pan.pan.setTargetAtTime(
          Math.max(
            -1,
            Math.min(
              1,
              (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) /
                Math.max(item.d, 1),
            ),
          ),
          now,
          0.12,
        );
      }
    });
    const traveled = Math.max(0, distance - (this.lastDistance ?? distance));
    this.lastDistance = distance;
    if (!paused && player.velocityY === 0) this.stepDistance += traveled;
    if (this.stepDistance > 0.85) {
      this.stepDistance %= 0.85;
      const source = this.context.createBufferSource(),
        filter = this.context.createBiquadFilter(),
        gain = this.context.createGain();
      source.buffer = this.buffer;
      filter.type = "lowpass";
      filter.frequency.value = indoor ? 1050 : 650;
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + 0.1);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    }
  }
};
