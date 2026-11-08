// Vehículos con soldados adentro: bajan al destruirlos y tardan en poder disparar; si el vehículo
// llega a la base, cuesta una vida por cada uno. Y lo que protege a las torres: cada nivel de ataque
// les suma vida, y vender una destruida no sirve de reparación barata.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeEffects,
  createGameConfig,
  createInitialState,
  getSellRefund,
  getTowerMaxHp,
  placeTower,
  selectTargets,
  sellTower,
  startWave,
  tickSimulation,
  upgradeTower,
  upgradeTowerDefense,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const { dismountDelay } = GAMEPLAY_CONFIG.simulation.infantry;
const CARRIERS = { 'moto-recon': 2, 'truck-transport': 6 };

function newGame() {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  return state;
}

/** El vehículo cerca de una torre, con un solo golpe de vida: la torre lo destruye enseguida. */
function killNextToTower(enemyTypeId, wave = 0) {
  const state = newGame();
  state.wave = wave;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
  // La básica no le hace nada a un 8x8.
  for (let level = 0; level < 3; level++) upgradeTower(state, tower.id);
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
  const effects = [];
  for (let step = 0; step < 60 * 60 && state.enemies.every((enemy) => enemy.enemyTypeId === enemyTypeId); step++) {
    tower.hp = tower.maxHp;
    for (const enemy of state.enemies) if (enemy.hp > 1) enemy.hp = 1;
    tickSimulation(state, DT);
    effects.push(...consumeEffects(state));
  }
  return { state, tower, effects };
}

for (const [enemyTypeId, crew] of Object.entries(CARRIERS)) {
  test(`de ${enemyTypeId} destruido bajan ${crew} soldados, que no disparan enseguida`, () => {
    const { state, effects } = killNextToTower(enemyTypeId);
    assert.equal(effects.filter((effect) => effect.type === 'enemy-dismounted').length, crew);
    const soldiers = state.enemies.filter((enemy) => enemy.offRoad);
    assert.equal(soldiers.length, crew);
    for (const soldier of soldiers) {
      assert.ok(soldier.weaponCooldown > dismountDelay - 0.1, `recién baja: ${soldier.weaponCooldown}`);
    }
  });


  test(`${enemyTypeId} que llega a la base quita una vida por cada escuadra adentro`, () => {
    const state = newGame();
    const lives = state.lives;
    startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
    for (let step = 0; step < 60 * 200 && state.waveActive; step++) tickSimulation(state, DT);
    assert.equal(lives - state.lives, Math.ceil(crew / 3));
  });
}

test('un vehículo sin soldados que llega a la base quita una sola vida', () => {
  const state = newGame();
  const lives = state.lives;
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['patrulla'] } });
  for (let step = 0; step < 60 * 100 && state.waveActive; step++) tickSimulation(state, DT);
  assert.equal(lives - state.lives, 1);
});

for (const towerTypeId of ['mg7-vulcan', 'lm2-lanza']) {
  test(`${towerTypeId}: cada nivel de ataque le suma vida, y recibe lo que gana`, () => {
    const state = newGame();
    const tower = placeTower(state, { towerTypeId, gx: 8, gy: 5 });
    const definition = state.config.towerDefinitions[towerTypeId];
    const base = definition.defenseLevels[0].maxHp;
    assert.equal(tower.maxHp, base);
    tower.hp = 100;
    upgradeTower(state, tower.id);
    assert.equal(tower.maxHp, Math.round(base * 1.25));
    assert.equal(tower.hp, 100 + Math.round(base * 0.25));
    upgradeTowerDefense(state, tower.id);
    assert.equal(tower.maxHp, Math.round(definition.defenseLevels[1].maxHp * 1.25));
    assert.equal(tower.maxHp, getTowerMaxHp(definition, tower));
  });

  test(`${towerTypeId}: vender una destruida devuelve mucho menos`, () => {
    const state = newGame();
    const tower = placeTower(state, { towerTypeId, gx: 8, gy: 5 });
    const definition = state.config.towerDefinitions[towerTypeId];
    startWave(state);
    assert.equal(getSellRefund(definition, tower), Math.floor(tower.invested * 0.6));
    tower.destroyed = true;
    const refund = getSellRefund(definition, tower);
    assert.equal(refund, Math.floor(tower.invested * 0.25));
    const credits = state.credits;
    sellTower(state, tower.id);
    assert.equal(state.credits, credits + refund);
  });
}

test('cada vehículo con soldados los declara en el catálogo', () => {
  for (const [enemyTypeId, crew] of Object.entries(CARRIERS)) {
    assert.equal(enemyDefinitions[enemyTypeId].dismount.length, crew, enemyTypeId);
  }
});
