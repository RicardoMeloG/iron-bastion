import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameConfig, createInitialState, getTowerLimit, placeTower, sellTower } from '../src/core/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const { base, perWave, max } = GAMEPLAY_CONFIG.simulation.towerLimit;

function freeCells(state) {
  const cells = [];
  state.grid.forEach((row, gy) => row.forEach((value, gx) => { if (value === 0) cells.push({ gx, gy }); }));
  return cells;
}

function fill(state) {
  let placed = 0;
  for (const cell of freeCells(state)) {
    if (placeTower(state, { towerTypeId: 'mg7-vulcan', ...cell })) placed += 1;
  }
  return placed;
}

test('el tope de torres crece con la oleada que se prepara y se detiene en el máximo', () => {
  const state = createInitialState(createGameConfig());
  assert.equal(getTowerLimit(state), base + perWave);
  state.wave = 9;
  assert.equal(getTowerLimit(state), base + perWave * 10, 'antes de la oleada 10 cuenta la 10');
  state.waveActive = true;
  assert.equal(getTowerLimit(state), base + perWave * 9, 'durante la oleada 9 cuenta la 9');
  state.wave = 19;
  assert.equal(getTowerLimit(state), max);
});

test('con créditos de sobra no se puede llenar el mapa de torres', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 1e6;
  assert.equal(fill(state), getTowerLimit(state));
  assert.ok(freeCells(state).length > 0, 'quedan celdas libres: el tope frenó, no el mapa');

  // Vender libera un lugar.
  sellTower(state, state.towers[0].id);
  assert.equal(fill(state), 1);
});

test('el modo desarrollo no tiene tope', () => {
  const state = createInitialState(createGameConfig());
  state.developerMode.enabled = true;
  state.credits = 1e6;
  assert.ok(fill(state) > max);
});
