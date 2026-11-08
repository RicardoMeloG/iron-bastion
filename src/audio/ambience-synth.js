// Ambiente del campo: viento a ráfagas, retumbo grave y, al azar, una explosión (grabada), disparos a
// lo lejos o pájaros. Lo demás se genera en vivo con Web Audio y usa el AudioContext de SfxPlayer, así
// que el silencio (M) también lo apaga.
import { AUDIO_CONFIG } from './audio-config.js';

const AMBIENCE = AUDIO_CONFIG.ambience;
const SEAM_SECONDS = 1;

/** Cuánto esperar hasta el próximo sonido de fondo. */
function nextAmbientDelay(random = Math.random) {
  return AMBIENCE.events.everySecondsMin + random() * AMBIENCE.events.everySecondsRange;
}

/** Qué sonido de fondo toca: al azar, sin repetir el anterior. */
function pickAmbientEvent(previous, random = Math.random) {
  const options = AMBIENCE.events.names.filter((name) => name !== previous);
  return options[Math.floor(random() * options.length)];
}

/**
 * Ruido café en estéreo que se repite sin que se note la unión: el final se funde con el
 * principio. Cada canal es distinto, para que el viento se sienta alrededor y no al centro.
 */
function createWindBuffer(context, seconds) {
  const rate = context.sampleRate;
  const seam = Math.floor(rate * SEAM_SECONDS);
  const length = Math.floor(rate * seconds);
  const buffer = context.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const raw = new Float32Array(length + seam);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      raw[i] = last * 3.5;
    }
    const data = buffer.getChannelData(channel);
    data.set(raw.subarray(0, length));
    for (let i = 0; i < seam; i++) {
      const fade = i / seam;
      data[i] = raw[length + i] * Math.cos(fade * Math.PI * 0.5) + raw[i] * Math.sin(fade * Math.PI * 0.5);
    }
  }
  return buffer;
}

/** Ruido blanco para los disparos lejanos: el café casi no tiene los agudos del estampido. */
function createShotBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function createPanner(context, maxPan) {
  const panner = context.createStereoPanner();
  panner.pan.value = (Math.random() * 2 - 1) * maxPan;
  return panner;
}

export class AmbienceSynth {
  constructor(sfxPlayer) {
    this.sfxPlayer = sfxPlayer;
    this.ready = false;
    this.nextAt = 0;
    this.lastEvent = null;
  }

  // Se arma la primera vez que el contexto está corriendo (tras un clic o tecla).
  ensureReady() {
    const context = this.sfxPlayer.context;
    if (!context || context.state !== 'running') return null;
    if (this.ready) return context;
    this.ready = true;
    this.master = context.createGain();
    this.master.gain.setValueAtTime(0, context.currentTime);
    this.master.gain.linearRampToValueAtTime(AMBIENCE.master, context.currentTime + AMBIENCE.fadeInSeconds);
    this.master.connect(this.sfxPlayer.output ?? context.destination);
    this.wind = createWindBuffer(context, AMBIENCE.bufferSeconds);
    this.createWind(context);
    this.shot = createShotBuffer(context);
    this.createRumble(context);
    this.nextAt = context.currentTime + nextAmbientDelay();
    return context;
  }

  /** Viento: dos osciladores lentos mueven el filtro y el volumen, para que venga a ráfagas. */
  createWind(context) {
    const { level, highpassHz, cutoffHz, gustHz, gustCutoffHz, gustLevel } = AMBIENCE.wind;
    const source = context.createBufferSource();
    source.buffer = this.wind;
    source.loop = true;
    // Sin el highpass, casi toda la energía quedaría en graves que un parlante chico no da.
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = highpassHz;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    const gain = context.createGain();
    gain.gain.value = level;
    source.connect(highpass).connect(filter).connect(gain).connect(this.master);
    source.start();
    for (const hz of gustHz) {
      const gust = context.createOscillator();
      gust.frequency.value = hz;
      const toCutoff = context.createGain();
      toCutoff.gain.value = gustCutoffHz;
      const toLevel = context.createGain();
      toLevel.gain.value = gustLevel;
      gust.connect(toCutoff).connect(filter.frequency);
      gust.connect(toLevel).connect(gain.gain);
      gust.start();
    }
  }

  createRumble(context) {
    const { level, cutoffHz } = AMBIENCE.rumble;
    const source = context.createBufferSource();
    source.buffer = this.wind;
    source.loop = true;
    source.playbackRate.value = 0.6;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    const gain = context.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  /** Una explosión a lo lejos: la grabación, baja y con algo de variación. */
  distantBlast() {
    const { volume, rateJitter } = AMBIENCE.distantBlast;
    this.sfxPlayer.play('explosion-lejana', { volume: volume * (0.5 + Math.random() * 0.5), rateJitter });
  }

  /** Una ráfaga corta a lo lejos: golpes apagados, de un costado, y su eco. */
  distantGunfire(context) {
    const { shotsMin, shotsRange, shotInterval, shotJitter, shotSeconds, level, bandHz, lowpassHz, echoSeconds, echoLevel, maxPan } = AMBIENCE.distantGunfire;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = lowpassHz;
    const panner = createPanner(context, maxPan);
    lowpass.connect(panner).connect(this.master);
    const delay = context.createDelay(1);
    delay.delayTime.value = echoSeconds;
    const echo = context.createGain();
    echo.gain.value = echoLevel;
    lowpass.connect(delay).connect(echo).connect(panner);

    const shots = shotsMin + Math.floor(Math.random() * shotsRange);
    const strength = 0.5 + Math.random() * 0.5;
    let at = context.currentTime;
    for (let index = 0; index < shots; index++) {
      const source = context.createBufferSource();
      source.buffer = this.shot;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = bandHz * (0.85 + Math.random() * 0.3);
      const gain = context.createGain();
      gain.gain.setValueAtTime(level * strength, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + shotSeconds);
      source.connect(band).connect(gain).connect(lowpass);
      source.start(at, Math.random() * 0.8);
      source.stop(at + shotSeconds);
      at += shotInterval + Math.random() * shotJitter;
    }
  }

  /** Un pájaro: unos trinos cortos que suben y caen, cada canto en su propio tono. */
  birds(context) {
    const { chirpsMin, chirpsRange, chirpSeconds, gapMin, gapRange, callHzMin, callHzRange, level, maxPan } = AMBIENCE.birds;
    const panner = createPanner(context, maxPan);
    panner.connect(this.master);
    const callHz = callHzMin + Math.random() * callHzRange;
    const chirps = chirpsMin + Math.floor(Math.random() * chirpsRange);
    let at = context.currentTime;
    for (let index = 0; index < chirps; index++) {
      const hz = callHz * (0.92 + Math.random() * 0.16);
      const oscillator = context.createOscillator();
      oscillator.frequency.setValueAtTime(hz * 0.85, at);
      oscillator.frequency.exponentialRampToValueAtTime(hz * 1.2, at + chirpSeconds * 0.5);
      oscillator.frequency.exponentialRampToValueAtTime(hz * 0.95, at + chirpSeconds);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + chirpSeconds * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + chirpSeconds);
      oscillator.connect(gain).connect(panner);
      oscillator.start(at);
      oscillator.stop(at + chirpSeconds);
      at += chirpSeconds + gapMin + Math.random() * gapRange;
    }
  }

  update() {
    const context = this.ensureReady();
    if (!context) return;
    // Una sola espera para todos: con la pestaña oculta esto no corre, y con un reloj por sonido
    // todos los vencidos sonaban juntos al volver.
    if (context.currentTime < this.nextAt) return;
    this.lastEvent = pickAmbientEvent(this.lastEvent);
    this[this.lastEvent](context);
    this.nextAt = context.currentTime + nextAmbientDelay();
  }
}
