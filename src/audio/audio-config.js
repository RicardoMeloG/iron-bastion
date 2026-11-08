// Niveles del sonido (spec 002). Las grabaciones son CC0 de Freesound, procesadas con
// tools/audio/procesar.py: los disparos con el pico a -1 dB y los bucles al mismo volumen medio, así
// que aquí solo se reparte cuánto pesa cada uno en la mezcla.
export const AUDIO_CONFIG = {
  defaults: {
    playVolume: 0.45,
    loopVolume: 0.2,
    rampMs: 120,
    fadeOutMs: 120,
    stopDelay: 0.02,
  },

  // Todo pasa por este compresor antes de salir: muchas armas a la vez no saturan.
  master: { threshold: -18, knee: 12, ratio: 4, attack: 0.004, release: 0.25, gain: 0.9 },

  // Disparos y golpes: volumen, espera mínima entre dos iguales (ms) y variación de tono (±).
  shots: {
    'mg7-disparo': { volume: 0.42, cooldownMs: 45, rateJitter: 0.05 },
    // La gatling suena como ráfaga: mientras dispara, una cada tanto.
    'mg7-gatling': { volume: 0.45, cooldownMs: 1700, rateJitter: 0.03 },
    'enemigo-fusil': { volume: 0.22, cooldownMs: 70, rateJitter: 0.08 },
    'canon-automatico': { volume: 0.4, cooldownMs: 90, rateJitter: 0.05 },
    // La AA-3 usa el mismo cañón automático, más agudo.
    'canon-automatico-aa': { volume: 0.34, cooldownMs: 70, rateJitter: 0.05, playbackRate: 1.18 },
    'tanque-canon': { volume: 0.75, cooldownMs: 120, rateJitter: 0.04 },
    'misil-lanzamiento': { volume: 0.45, cooldownMs: 80, rateJitter: 0.06 },
    'cohete-salva': { volume: 0.5, cooldownMs: 160, rateJitter: 0.08 },
    'rpg-disparo': { volume: 0.4, cooldownMs: 90, rateJitter: 0.06 },
    'interceptor': { volume: 0.42, cooldownMs: 60, rateJitter: 0.05 },
    'explosion-grande': { volume: 0.7, cooldownMs: 120, rateJitter: 0.08 },
    'explosion-media': { volume: 0.5, cooldownMs: 70, rateJitter: 0.1 },
    // Lo que estalla sin pegarle a nada, o un misil interceptado: más bajo.
    'explosion-chica': { volume: 0.3, cooldownMs: 60, rateJitter: 0.12, playbackRate: 1.15 },
    'impacto-blindaje': { volume: 0.18, cooldownMs: 140, rateJitter: 0.12 },
    'soldado-cae': { volume: 0.28, cooldownMs: 110, rateJitter: 0.1 },
  },
  // Qué grabación usa cada nombre de `shots` (cuando no es la del mismo nombre).
  shotFiles: { 'canon-automatico-aa': 'canon-automatico', 'explosion-chica': 'explosion-media' },

  // Bucles mientras haya algo que los haga sonar: el volumen sube con la cantidad, hasta `max`.
  loops: {
    'moto-motor': { perUnit: 0.12, max: 0.32 },
    'patrulla-motor': { perUnit: 0.1, max: 0.34 },
    'blindado-motor': { perUnit: 0.16, max: 0.45 },
    orugas: { perUnit: 0.14, max: 0.38 },
    'dron-fpv': { perUnit: 0.1, max: 0.3 },
    'dron-ala': { perUnit: 0.14, max: 0.36 },
    fuego: { perUnit: 0.07, max: 0.3 },
    fadeOutMs: 400,
  },

  // Ambiente del campo (ambience-synth.js): viento a ráfagas, retumbo lejano y, de vez en
  // cuando, una explosión, disparos a lo lejos o pájaros. Va bajo para no competir con el combate.
  ambience: {
    master: 0.33,
    fadeInSeconds: 3,
    bufferSeconds: 12,
    // De a uno y bien separados: la espera mínima supera al sonido más largo, así no se pisan.
    events: { names: ['distantBlast', 'distantGunfire', 'birds'], everySecondsMin: 7, everySecondsRange: 13 },
    wind: {
      level: 0.27,
      highpassHz: 170,
      cutoffHz: 1100,
      gustHz: [0.07, 0.17],
      gustCutoffHz: 500,
      gustLevel: 0.078,
    },
    rumble: { level: 0.3, cutoffHz: 95 },
    // La grabación de una explosión lejana (explosion-lejana), baja.
    distantBlast: { volume: 0.35, rateJitter: 0.12 },
    distantGunfire: {
      shotsMin: 3,
      shotsRange: 6,
      shotInterval: 0.1,
      shotJitter: 0.04,
      shotSeconds: 0.09,
      level: 2.4,
      bandHz: 850,
      lowpassHz: 1700,
      echoSeconds: 0.24,
      echoLevel: 0.35,
      maxPan: 0.7,
    },
    birds: {
      chirpsMin: 2,
      chirpsRange: 4,
      chirpSeconds: 0.09,
      gapMin: 0.07,
      gapRange: 0.16,
      callHzMin: 2600,
      callHzRange: 1500,
      level: 0.16,
      maxPan: 0.8,
    },
  },

  // El pitido de los últimos segundos antes de la oleada; el último, más agudo.
  countdownBeep: { hz: 880, lastHz: 1320, seconds: 0.14, level: 0.32 },
};
