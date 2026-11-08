// Las motos esquivan la mayoría de los misiles: contra ellas sirve la ametralladora.
import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeEffects, createGameConfig, createInitialState, placeTower, startWave, tickSimulation } from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';

const DT = 1 / 60;
const CHANCE = enemyDefinitions['moto-recon'].combatModel.missileDodge;

/** Una torre junto al camino contra una columna que no muere: devuelve los efectos que deja. */
function play(towerTypeId, enemyTypeId, count = 12) {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  const tower = placeTower(state, { towerTypeId, gx: 6, gy: 4 });
  startWave(state, { overrideWaveDefinition: { interval: 1.5, spawns: Array(count).fill(enemyTypeId) } });
  const effects = [];
  for (let step = 0; step < 60 * 300 && state.waveActive; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    for (const enemy of state.enemies) {
      enemy.isArmed = false;
      enemy.hp = enemy.maxHp = 1e9;
    }
    effects.push(...consumeEffects(state));
  }
  return effects;
}

const countOf = (effects, type) => effects.filter((effect) => effect.type === type).length;

test('la moto esquiva la mayoría de los misiles', () => {
  assert.ok(CHANCE >= 0.7, `probabilidad: ${CHANCE}`);
  const effects = play('lm2-lanza', 'moto-recon', 180);
  const dodged = countOf(effects, 'enemy-dodged');
  const hits = countOf(effects, 'hit');
  assert.ok(dodged + hits >= 40, `${dodged} esquivados y ${hits} impactos`);
  assert.ok(Math.abs(dodged / (dodged + hits) - CHANCE) < 0.12, `${dodged} esquivados y ${hits} impactos`);
});

test('el misil esquivado no hace daño, no busca otro blanco y estalla al errar', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 6, gy: 4 });
  startWave(state, { overrideWaveDefinition: { interval: 0.4, spawns: Array(6).fill('moto-recon') } });
  let dodgedMissile = null;
  let targetId = null;
  let missed = 0;
  for (let step = 0; step < 60 * 60 && !(dodgedMissile && !dodgedMissile.alive); step++) {
    tower.hp = tower.maxHp;
    const wasFlying = dodgedMissile?.alive;
    tickSimulation(state, DT);
    dodgedMissile ??= state.projectiles.find((item) => item.dodged) ?? null;
    targetId ??= dodgedMissile?.targetId ?? null;
    const effects = consumeEffects(state);
    if (dodgedMissile) {
      assert.equal(dodgedMissile.targetId, targetId, 'no cambia de blanco');
      if (wasFlying && !dodgedMissile.alive) missed += countOf(effects, 'missile-missed');
    }
  }
  assert.ok(dodgedMissile, 'esquivó alguno');
  assert.ok(missed > 0, 'el misil estalla al errar');
  assert.equal(dodgedMissile.alive, false);
});

test('las balas no se esquivan: la MG-7 le acierta a la moto', () => {
  const effects = play('mg7-vulcan', 'moto-recon');
  assert.equal(countOf(effects, 'enemy-dodged'), 0);
  const fired = countOf(effects, 'projectile-fired');
  assert.ok(fired > 10, `${fired} disparos`);
  assert.ok(countOf(effects, 'hit') / fired >= 0.85, `${countOf(effects, 'hit')} de ${fired}`);
});

test('solo la moto esquiva: la patrulla y el tanque se comen el misil', () => {
  for (const enemyTypeId of ['patrulla', 'tank-heavy']) {
    const effects = play('lm2-lanza', enemyTypeId, 4);
    assert.equal(countOf(effects, 'enemy-dodged'), 0, enemyTypeId);
    assert.ok(countOf(effects, 'hit') > 0, enemyTypeId);
  }
});

test('la partida es reproducible: los mismos misiles esquivan igual', () => {
  const summary = () => {
    const effects = play('lm2-lanza', 'moto-recon', 10);
    return effects.filter((effect) => effect.type === 'enemy-dodged' || effect.type === 'hit').map((effect) => effect.type);
  };
  assert.deepEqual(summary(), summary());
});
