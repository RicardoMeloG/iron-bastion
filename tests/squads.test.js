// Las últimas oleadas llegan en grupos, con los vehículos en dos carriles; las primeras, una unidad tras otra.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameConfig, createInitialState, startWave, tickSimulation } from '../src/core/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';
import { defaultWaveSetDefinition } from '../src/content/waves/defaultWaveSet.js';

const DT = 1 / 60;
const W = GAMEPLAY_CONFIG.waves;

function newWave(wave) {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  state.wave = wave - 1;
  startWave(state);
  return state;
}

test('solo las últimas oleadas llegan en grupos', () => {
  const withSquads = defaultWaveSetDefinition.waves.flatMap((wave, index) => (wave.squad ? [index + 1] : []));
  assert.deepEqual(withSquads, Object.keys(W.squads.byWave).map(Number));
  assert.ok(withSquads[0] >= 7, 'el inicio no cambia');
});

test('la oleada 9 hace una pausa cada tantas unidades', () => {
  const state = newWave(9);
  const { size, pause } = state.activeWaveDefinition.squad;
  while (state.spawnedThisWave < size) tickSimulation(state, DT);
  assert.ok(state.spawnTimer > pause - 0.1, `espera ${state.spawnTimer}`);
  const spawned = state.spawnedThisWave;
  for (let step = 0; step < 60 * (pause - 0.5); step++) tickSimulation(state, DT);
  assert.equal(state.spawnedThisWave, spawned, 'nadie sale durante la pausa');
});

test('los vehículos de un grupo van en carriles alternados, separados en el camino', () => {
  const state = newWave(10);
  for (let step = 0; step < 60 * 12; step++) tickSimulation(state, DT);
  const vehicles = state.enemies.filter((enemy) => !enemy.offRoad);
  const lanes = vehicles.map((enemy) => Math.sign(enemy.lane));
  assert.ok(lanes.includes(1) && lanes.includes(-1), `carriles ${lanes}`);
  for (const enemy of vehicles) assert.equal(Math.abs(enemy.lane), W.squads.laneOffset);
  const [first] = vehicles.filter((enemy) => enemy.pathIndex === 0);
  const center = state.config.pathWorld[0].z;
  assert.ok(Math.abs(Math.abs(first.position.z - center) - W.squads.laneOffset * state.config.worldScale) < 1e-6, 'va a un costado del centro');
});

test('una oleada sin grupos no usa carriles', () => {
  const state = newWave(5);
  for (let step = 0; step < 60 * 12; step++) tickSimulation(state, DT);
  for (const enemy of state.enemies) assert.ok(!enemy.lane, enemy.enemyTypeId);
});
