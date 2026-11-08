// La oleada sale sola al terminar el contador. Y antes de que salga, una torre mal puesta se devuelve entera.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGameConfig,
  createInitialState,
  getSellRefund,
  placeTower,
  resetWave,
  sellTower,
  startWave,
  consumeEffects,
  tickSimulation,
  tickWaveCountdown,
  upgradeTower,
  upgradeTowerDefense,
} from '../src/core/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const { firstSeconds, betweenSeconds } = GAMEPLAY_CONFIG.waves.countdown;
const newGame = (credits = 1e5) => {
  const state = createInitialState(createGameConfig());
  state.credits = credits;
  return state;
};
const secondsUntilDue = (state) => {
  let ticks = 0;
  while (!tickWaveCountdown(state, DT)) ticks += 1;
  return (ticks + 1) * DT;
};

test('el contador de la primera oleada se cumple a su tiempo, y no antes', () => {
  assert.ok(Math.abs(secondsUntilDue(newGame()) - firstSeconds) < 2 * DT);
});

test('avisa una vez por segundo solo en los últimos segundos', () => {
  const state = newGame();
  consumeEffects(state);
  while (!tickWaveCountdown(state, DT));
  const beeps = consumeEffects(state).filter((effect) => effect.type === 'wave-countdown-beep').map((effect) => effect.seconds);
  const { urgentSeconds } = GAMEPLAY_CONFIG.waves.countdown;
  assert.deepEqual(beeps, Array.from({ length: urgentSeconds }, (_, index) => urgentSeconds - index));
});

test('al terminar una oleada vuelve a contar, y no cuenta durante la oleada', () => {
  const state = newGame();
  placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 10, gy: 5 });
  startWave(state);
  assert.equal(state.waveCountdown, null);
  assert.equal(tickWaveCountdown(state, 1000), false);
  for (let step = 0; step < 60 * 300 && state.waveActive; step++) tickSimulation(state, DT);
  assert.equal(state.waveActive, false);
  assert.equal(state.waveCountdown, betweenSeconds);
});

test('el núcleo no lanza la oleada por sí solo: tickSimulation no descuenta', () => {
  const state = newGame();
  for (let step = 0; step < 60 * (firstSeconds + 5); step++) tickSimulation(state, DT);
  assert.equal(state.waveActive, false);
  assert.equal(state.waveCountdown, firstSeconds);
});

test('reiniciar la oleada vuelve a dar tiempo', () => {
  const state = newGame();
  startWave(state);
  resetWave(state);
  assert.equal(state.waveCountdown, firstSeconds);
  startWave(state);
  state.waveSnapshot.wave = 3;
  resetWave(state);
  assert.equal(state.waveCountdown, betweenSeconds);
});

for (const towerTypeId of ['mg7-vulcan', 'lm2-lanza']) {
  test(`${towerTypeId}: antes de la oleada se devuelve todo, mejoras incluidas`, () => {
    const state = newGame();
    const before = state.credits;
    const tower = placeTower(state, { towerTypeId, gx: 10, gy: 5 });
    upgradeTower(state, tower.id);
    upgradeTowerDefense(state, tower.id);
    assert.equal(getSellRefund(state.config.towerDefinitions[towerTypeId], tower), tower.invested);
    sellTower(state, tower.id);
    assert.equal(state.credits, before);
  });

  test(`${towerTypeId}: lo gastado antes de la oleada anterior vuelve a precio de venta`, () => {
    const state = newGame();
    const definition = state.config.towerDefinitions[towerTypeId];
    const tower = placeTower(state, { towerTypeId, gx: 10, gy: 5 });
    const baseCost = tower.invested;
    startWave(state);
    assert.equal(getSellRefund(definition, tower), Math.floor(baseCost * 0.6));
    // Lo comprado durante la oleada tampoco vuelve entero.
    upgradeTower(state, tower.id);
    assert.equal(getSellRefund(definition, tower), Math.floor(tower.invested * 0.6));
    state.enemies = [];
    state.spawnQueue = [];
    tickSimulation(state, DT);
    assert.equal(state.waveActive, false);
    // Entre oleadas: lo nuevo vuelve entero; lo anterior, a precio de venta.
    const paid = tower.invested;
    upgradeTowerDefense(state, tower.id);
    const fresh = tower.invested - paid;
    assert.equal(getSellRefund(definition, tower), fresh + Math.floor(paid * 0.6));
  });
}

test('una torre puesta durante la oleada no se devuelve entera', () => {
  const state = newGame();
  startWave(state);
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 10, gy: 5 });
  assert.equal(getSellRefund(state.config.towerDefinitions['mg7-vulcan'], tower), Math.floor(tower.invested * 0.6));
});

test('en modo desarrollo no corre el tiempo; al salir sigue donde estaba', () => {
  const state = newGame();
  state.developerMode.enabled = true;
  const before = state.waveCountdown;
  assert.equal(tickWaveCountdown(state, 1000), false);
  assert.equal(state.waveCountdown, before);
  assert.deepEqual(consumeEffects(state), []);
  state.developerMode.enabled = false;
  assert.equal(tickWaveCountdown(state, 1), false);
  assert.equal(state.waveCountdown, before - 1);
});
