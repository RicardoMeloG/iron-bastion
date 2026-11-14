// Un vehículo sube como máximo un nivel de veteranía por oleada destruyendo torres (14-11-2026): dos
// tanques que ganaban un nivel por torre llegaban a la defensa activa completa y nada los mataba.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameConfig, createInitialState, startWave, tickSimulation } from '../src/core/index.js';
import { promoteEnemy } from '../src/core/simulation.js';

const DT = 1 / 60;

function launch(enemyTypeId) {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId], veterancy: 0 } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [enemy] = state.enemies;
  enemy.hp = enemy.maxHp = 1e9;
  return { state, enemy };
}

test('un tanque sube un solo nivel aunque destruya varias torres en la misma oleada', () => {
  const { state, enemy } = launch('tank-heavy');
  assert.equal(enemy.veterancy, 0);
  promoteEnemy(state, enemy);
  promoteEnemy(state, enemy);
  promoteEnemy(state, enemy);
  assert.equal(enemy.veterancy, 1);
});

test('en la oleada siguiente puede volver a subir un nivel', () => {
  const { state, enemy } = launch('tank-heavy');
  promoteEnemy(state, enemy);
  state.wave += 1;
  promoteEnemy(state, enemy);
  assert.equal(enemy.veterancy, 2);
});

test('los soldados siguen subiendo por cada torre que destruyen', () => {
  const { state, enemy } = launch('infantry-mg');
  promoteEnemy(state, enemy);
  promoteEnemy(state, enemy);
  assert.equal(enemy.veterancy, 2);
});
