import { AUDIO_CONFIG } from './audio-config.js';

const DEFAULTS = AUDIO_CONFIG.defaults;

export class SfxPlayer {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.pendingLoads = new Map();
    // Descargados pero sin decodificar: el contexto de audio recién se crea con el primer gesto.
    this.encoded = new Map();
    this.lastPlayTimes = new Map();
    this.activeLoops = new Map();
    this.unlockBound = false;
    this.muted = false;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) this.context?.suspend?.();
    else this.context?.resume?.();
  }

  attachUnlockListeners(target = window) {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      this.ensureContext();
      if (!this.muted) this.context?.resume?.();
      target.removeEventListener('pointerdown', unlock);
      target.removeEventListener('keydown', unlock);
      target.removeEventListener('touchstart', unlock);
    };

    target.addEventListener('pointerdown', unlock, { passive: true });
    target.addEventListener('keydown', unlock, { passive: true });
    target.addEventListener('touchstart', unlock, { passive: true });
  }

  ensureContext() {
    if (!this.context) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      this.context = AudioContextCtor ? new AudioContextCtor() : null;
      if (this.context) {
        // Todo pasa por un compresor: muchas armas a la vez no saturan.
        const { threshold, knee, ratio, attack, release, gain } = AUDIO_CONFIG.master;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = threshold;
        compressor.knee.value = knee;
        compressor.ratio.value = ratio;
        compressor.attack.value = attack;
        compressor.release.value = release;
        this.master = this.context.createGain();
        this.master.gain.value = gain;
        compressor.connect(this.master).connect(this.context.destination);
        this.output = compressor;
        for (const [id, data] of this.encoded) this.decode(id, data);
        this.encoded.clear();
      }
    }
    return this.context;
  }

  decode(id, data) {
    return this.context.decodeAudioData(data.slice(0)).then((buffer) => {
      this.buffers.set(id, buffer);
      return buffer;
    });
  }

  async load(id, url) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    if (this.pendingLoads.has(id)) return this.pendingLoads.get(id);

    // Se descarga ya; se decodifica cuando haya contexto (tras el primer clic o tecla), para no crear
    // uno antes de que el navegador lo permita.
    const loadPromise = (async () => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.pendingLoads.delete(id);
      if (this.context) return this.decode(id, arrayBuffer);
      this.encoded.set(id, arrayBuffer);
      return null;
    })();

    this.pendingLoads.set(id, loadPromise);
    return loadPromise;
  }

  // Los sonidos usan el contexto si ya existe: lo crea el primer clic o tecla (attachUnlockListeners).
  play(id, options = {}) {
    const context = this.context;
    const buffer = this.buffers.get(id);
    if (!context || !buffer) return false;
    if (this.muted) return false;
    if (context.state === 'suspended') {
      context.resume?.();
    }

    const nowMs = performance.now();
    const cooldownMs = options.cooldownMs ?? 0;
    const lastPlay = this.lastPlayTimes.get(id) ?? 0;
    if (nowMs - lastPlay < cooldownMs) return false;
    this.lastPlayTimes.set(id, nowMs);

    const source = context.createBufferSource();
    source.buffer = buffer;
    // Una leve variación de tono en cada disparo, para que no suenen todos iguales.
    const jitter = options.rateJitter ?? 0;
    source.playbackRate.value = (options.playbackRate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);

    const gainNode = context.createGain();
    gainNode.gain.value = options.volume ?? DEFAULTS.playVolume;

    source.connect(gainNode);
    gainNode.connect(this.output);
    source.start();
    return true;
  }

  playLoop(id, options = {}) {
    const context = this.context;
    const buffer = this.buffers.get(id);
    if (!context || !buffer) return false;
    if (this.muted) return false;
    if (context.state === 'suspended') {
      context.resume?.();
    }
    if (this.activeLoops.has(id)) return true;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = options.playbackRate ?? 1;

    const gainNode = context.createGain();
    gainNode.gain.value = options.volume ?? DEFAULTS.loopVolume;

    source.connect(gainNode);
    gainNode.connect(this.output);
    // Cada bucle empieza en un punto distinto, así dos iguales no suenan en fase.
    source.start(0, Math.random() * buffer.duration);
    this.activeLoops.set(id, { source, gainNode });
    return true;
  }

  setLoopVolume(id, volume, rampMs = DEFAULTS.rampMs) {
    const context = this.context;
    const activeLoop = this.activeLoops.get(id);
    if (!context || !activeLoop) return false;

    const now = context.currentTime;
    activeLoop.gainNode.gain.cancelScheduledValues(now);
    activeLoop.gainNode.gain.setValueAtTime(activeLoop.gainNode.gain.value, now);
    activeLoop.gainNode.gain.linearRampToValueAtTime(volume, now + rampMs / 1000);
    return true;
  }

  stopLoop(id, fadeOutMs = DEFAULTS.fadeOutMs) {
    const context = this.context;
    const activeLoop = this.activeLoops.get(id);
    if (!context || !activeLoop) return false;

    const now = context.currentTime;
    activeLoop.gainNode.gain.cancelScheduledValues(now);
    activeLoop.gainNode.gain.setValueAtTime(activeLoop.gainNode.gain.value, now);
    activeLoop.gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeOutMs / 1000);
    activeLoop.source.stop(now + fadeOutMs / 1000 + DEFAULTS.stopDelay);
    // Se suelta ya: si vuelve a hacer falta durante el fundido, arranca otro.
    this.activeLoops.delete(id);
    activeLoop.source.onended = () => {
      activeLoop.source.disconnect();
      activeLoop.gainNode.disconnect();
    };
    return true;
  }
}
