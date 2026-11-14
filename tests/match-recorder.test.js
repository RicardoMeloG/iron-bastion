// Registro de partidas: en este computador graba siempre; publicado, solo con dirección remota y
// con el permiso del jugador.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createMatchRecorder, FIRST_MATCH_KEY } from '../src/app/match-recorder.js';

const STATE = { towers: [], enemies: [], waveActive: true };

function playWave(recorder) {
  recorder.handleEffects([{ type: 'wave-started', wave: 1, lives: 20, credits: 100, spawns: ['infantry-mg'] }], STATE);
  recorder.handleEffects([{ type: 'wave-ended', wave: 1, lives: 20, credits: 140 }], { ...STATE, waveActive: false });
}

// Almacén falso para simular localStorage.
function fakeStorage() {
  return {
    data: new Map(),
    getItem(k) { return this.data.has(k) ? this.data.get(k) : null; },
    setItem(k, v) { this.data.set(k, String(v)); },
  };
}

// Estado base para las órdenes del jugador.
const ORDER_STATE = { towers: [], enemies: [], waveActive: false, wave: 0, developerMode: { enabled: false } };

test('en este computador graba sin preguntar', () => {
  const sent = [];
  const recorder = createMatchRecorder({ location: { hostname: 'localhost' }, send: (log) => sent.push(log) });
  playWave(recorder);
  assert.equal(recorder.canShareRemotely, false);
  assert.equal(sent.length, 1);
});

test('publicado y sin dirección remota, no manda nada ni pide permiso', () => {
  const sent = [];
  const recorder = createMatchRecorder({ location: { hostname: 'ricardomelog.github.io' }, remoteUrl: null, send: (log) => sent.push(log) });
  playWave(recorder);
  assert.equal(recorder.canShareRemotely, false);
  assert.equal(sent.length, 0);
});

test('publicado y con dirección remota, manda solo después de que el jugador acepta', () => {
  const sent = [];
  const recorder = createMatchRecorder({ location: { hostname: 'ricardomelog.github.io' }, remoteUrl: 'https://registro.example/partidas', send: (log) => sent.push(log) });
  assert.equal(recorder.canShareRemotely, true);
  playWave(recorder);
  assert.equal(sent.length, 0, 'sin permiso, nada');
  recorder.setEnabled(true);
  playWave(recorder);
  assert.equal(sent.length, 1);
});

test('tick y order: registra el paso, la semilla y el paso fijo', () => {
  const sent = [];
  const storage = fakeStorage();
  const seed = 'abc-123';
  const fixedStep = 1 / 60;
  const recorder = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent.push(log),
    storage,
    seed,
    fixedStep,
  });

  // Tres pasos de simulación antes de la primera orden.
  recorder.tick();
  recorder.tick();
  recorder.tick();
  recorder.order(ORDER_STATE, 'torre', { torre: 'mg7-vulcan', celda: [2, 3] });
  playWave(recorder);

  const log = sent.at(-1);
  assert.deepEqual(log.ordenes[0], { paso: 3, tipo: 'torre', torre: 'mg7-vulcan', celda: [2, 3] });
  assert.equal(log.semilla, seed);
  assert.equal(log.pasoFijo, fixedStep);
  assert.equal(log.formato, 2);
  assert.ok(!('t0' in log), 'el log no debe llevar t0');
});

test('primer minuto: primera partida, segundos hasta torre, mejora y ayuda', () => {
  const sent = [];
  const storage = fakeStorage();
  const fixedStep = 1 / 60;
  const recorder = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent.push(log),
    storage,
    fixedStep,
  });

  // 120 ticks (2 s a 60 fps) antes de la primera torre.
  for (let i = 0; i < 120; i++) recorder.tick();

  // Primera orden: colocar torre.
  recorder.order(ORDER_STATE, 'torre', { torre: 'mg7-vulcan', celda: [1, 1] });
  assert.equal(storage.getItem(FIRST_MATCH_KEY), '1', 'después de la primera orden, el almacén guarda la bandera');

  // Dos mejoras de ataque: la primera queda registrada, la segunda no.
  recorder.order({ ...ORDER_STATE, wave: 2, waveActive: true }, 'ataque', { celda: [3, 3] });
  recorder.order({ ...ORDER_STATE, wave: 4, waveActive: false }, 'ataque', { celda: [4, 4] });

  // El jugador abre la ayuda.
  recorder.noteHelpOpened();

  playWave(recorder);
  const log = sent.at(-1);
  assert.equal(log.primerMinuto.primeraPartida, true);
  assert.equal(log.primerMinuto.segundosHastaPrimeraTorre, 2);
  assert.deepEqual(log.primerMinuto.primeraMejora, { oleada: 2, durante: true });
  assert.equal(log.primerMinuto.ayudaAbierta, true);

  // Un segundo registrador con el mismo almacén ya no es «primera partida».
  const sent2 = [];
  const recorder2 = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent2.push(log),
    storage,
    fixedStep,
  });
  recorder2.tick();
  playWave(recorder2);
  assert.equal(sent2.at(-1).primerMinuto.primeraPartida, false);
});

test('almacén que lanza: no rompe, primeraPartida es null y las órdenes se registran', () => {
  const sent = [];
  const throwingStorage = {
    getItem() { throw new Error('denegado'); },
    setItem() { throw new Error('denegado'); },
  };
  const recorder = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent.push(log),
    storage: throwingStorage,
  });

  // No debe lanzar excepción.
  recorder.tick();
  recorder.order(ORDER_STATE, 'torre', { torre: 'mg7-vulcan', celda: [0, 0] });
  playWave(recorder);

  const log = sent.at(-1);
  assert.equal(log.primerMinuto.primeraPartida, null);
  assert.equal(log.ordenes.length, 1);
  assert.equal(log.ordenes[0].tipo, 'torre');
});

test('errores: límite de 20 entradas y escucha de eventos del navegador', () => {
  const sent = [];
  const recorder = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent.push(log),
  });

  // 25 errores de 500 caracteres: solo caben 20 (recortados a 300).
  const msg = 'x'.repeat(500);
  for (let i = 0; i < 25; i++) recorder.recordError(msg);
  playWave(recorder);

  const log = sent.at(-1);
  assert.equal(log.errores.length, 20);
  assert.equal(log.errores[0].mensaje.length, 300);
  assert.equal(log.erroresOmitidos, 5);

  // listenForErrors: un objetivo falso captura los manejadores.
  const sent2 = [];
  const recorder2 = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent2.push(log),
  });
  const target = { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  recorder2.listenForErrors(target);
  target.listeners.error({ message: 'boom' });
  target.listeners.unhandledrejection({ reason: new Error('nope') });
  playWave(recorder2);

  const log2 = sent2.at(-1);
  assert.equal(log2.errores.length, 2);
  assert.equal(log2.errores[0].mensaje, 'boom');
  assert.equal(log2.errores[1].mensaje, 'nope');
});

test('modo desarrollo: una orden con developerMode activo lo marca en el registro', () => {
  const sent = [];
  const recorder = createMatchRecorder({
    location: { hostname: 'localhost' },
    send: (log) => sent.push(log),
  });

  const devState = { ...ORDER_STATE, developerMode: { enabled: true } };
  recorder.order(devState, 'torre', { torre: 'mg7-vulcan', celda: [5, 5] });
  playWave(recorder);

  const log = sent.at(-1);
  assert.equal(log.modoDesarrollo, true);
});
