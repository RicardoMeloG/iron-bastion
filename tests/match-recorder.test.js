// Registro de partidas: en este computador graba siempre; publicado, solo con dirección remota y
// con el permiso del jugador.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createMatchRecorder } from '../src/app/match-recorder.js';

const STATE = { towers: [], enemies: [], waveActive: true };

function playWave(recorder) {
  recorder.handleEffects([{ type: 'wave-started', wave: 1, lives: 20, credits: 100, spawns: ['infantry-mg'] }], STATE);
  recorder.handleEffects([{ type: 'wave-ended', wave: 1, lives: 20, credits: 140 }], { ...STATE, waveActive: false });
}

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
