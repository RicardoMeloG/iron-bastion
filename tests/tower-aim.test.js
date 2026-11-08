// T08 (CA-3): la MG-7 le acierta a un vehículo que cruza de lado.
//
// La torre está en (5, 4), dentro de una U del camino: tres tramos rectos le pasan a 2 celdas,
// así que el vehículo la cruza siempre de costado. Cuentan todos los disparos de la pasada,
// también los que salen justo antes de una curva.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameConfig, createInitialState, placeTower, startWave, tickSimulation } from '../src/core/index.js';

function crossingAccuracy(enemyTypeId) {
  const state = createInitialState(createGameConfig());
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 });
  assert.ok(tower, 'la torre se puede poner en (5, 4)');
  startWave(state, { overrideWaveDefinition: { interval: 3.5, spawns: Array(3).fill(enemyTypeId) } });

  const fired = new Set();
  const hits = new Set();
  for (let step = 0; step < 60 * 60 && (state.waveActive || state.enemies.length); step++) {
    // Que el vehículo aguante toda la pasada, la torre siga disparando y no la destruyan.
    for (const enemy of state.enemies) enemy.hp = enemy.maxHp = 1e9;
    tower.hp = tower.maxHp = 1e9;
    tickSimulation(state, 1 / 60);
    for (const effect of state.effects) {
      if (effect.type === 'projectile-fired') {
        fired.add(state.projectiles.at(-1).id);
      }
      if (effect.type === 'hit') hits.add(effect.projectileId);
    }
    state.effects = [];
  }
  const landed = [...fired].filter((id) => hits.has(id)).length;
  return { shots: fired.size, landed, accuracy: landed / fired.size };
}

for (const enemyTypeId of ['patrulla', 'apc-8x8']) {
  test(`la MG-7 acierta 80 % o más a un ${enemyTypeId} que cruza de lado`, () => {
    const { shots, landed, accuracy } = crossingAccuracy(enemyTypeId);
    assert.ok(shots >= 20, `la torre dispara durante la pasada (${shots} disparos)`);
    assert.ok(accuracy >= 0.8, `acierta ${landed} de ${shots} (${Math.round(accuracy * 100)} %)`);
  });
}

test('sin blanco, una torre mira a la entrada del enemigo, y vuelve a mirarla después de pelear', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
  const [entrance] = state.config.pathWorld;
  const rest = Math.atan2(entrance.x - tower.wx, entrance.z - tower.wz);
  assert.equal(tower.aimAngle, rest, 'recién puesta');

  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['patrulla'] } });
  let turned = false;
  for (let step = 0; step < 60 * 60 && !(turned && !tower.targetEnemyId); step++) {
    tickSimulation(state, 1 / 60);
    turned ||= Boolean(tower.targetEnemyId) && Math.abs(tower.aimAngle - rest) > 0.3;
  }
  assert.ok(turned, 'giró hacia su blanco');
  for (let step = 0; step < 60 * 5; step++) tickSimulation(state, 1 / 60);
  assert.ok(Math.abs(tower.aimAngle - rest) < 1e-9, `quedó en ${tower.aimAngle}, y la entrada está en ${rest}`);
});
