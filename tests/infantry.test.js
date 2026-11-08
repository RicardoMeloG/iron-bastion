// La infantería cruza el campo a pie, derecho a la base y sin usar el camino. Si una torre le
// cierra el paso, se detiene y le dispara hasta destruirla; después sigue.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearCover,
  consumeEffects,
  createGameConfig,
  createInitialState,
  placeTower,
  startWave,
  tickSimulation,
  upgradeTower,
  upgradeTowerDefense,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const SOLDIERS = ['infantry-mg', 'infantry-rpg'];
// Sin rocas (las prueba rocks.test.js). (11, 5) queda en la línea recta entre la entrada (0, 6) y la base (23, 5), fuera del camino.
const IN_THE_WAY = { gx: 11, gy: 5 };

function startSoldier(enemyTypeId, towers = []) {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  for (const item of [...state.rocks, ...state.trees]) clearCover(state, item.id);
  state.bushes = [];
  const placed = towers.map((tower) => placeTower(state, tower));
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  return { state, soldier: state.enemies[0], towers: placed };
}

/** Avanza hasta que `done()` se cumpla o pase el tiempo; las torres no disparan si `silent`. */
function run(state, towers, seconds, done, silent = true) {
  for (let step = 0; step < seconds * 60 && !done(); step++) {
    if (silent) for (const tower of towers) tower.cooldown = 999;
    tickSimulation(state, DT);
  }
}

test('va derecho a la base, por el pasto, y llega mucho antes que por el camino', () => {
  const { state, soldier } = startSoldier('infantry-mg');
  const { baseGrid, groundTileHeightWorld, halfHeight, halfWidth, worldScale } = state.config;
  let onGrass = 0;
  let seconds = 0;
  while (soldier.alive && seconds < 200) {
    tickSimulation(state, DT);
    seconds += DT;
    const gx = Math.floor(soldier.position.x / worldScale + halfWidth);
    const gy = Math.floor(soldier.position.z / worldScale + halfHeight);
    if (baseGrid[gy][gx] !== 1) {
      onGrass += 1;
      if (onGrass === 120) assert.ok(Math.abs(soldier.position.y - groundTileHeightWorld) < 0.01 * worldScale, 'pisa el pasto, más bajo que el camino');
    }
  }
  assert.equal(state.lives, 19, 'al llegar a la base quita una vida');
  assert.ok(onGrass > 60 * 5, `camina por el pasto: ${(onGrass / 60).toFixed(1)} s`);
  // 23 celdas en línea recta, contra las 48 del camino.
  const straightSeconds = 23 / enemyDefinitions['infantry-mg'].stats.speed;
  assert.ok(seconds < straightSeconds * 1.1, `tardó ${seconds.toFixed(1)} s; en línea recta son ${straightSeconds.toFixed(1)} s`);
});

test('una torre en el paso lo detiene: le dispara hasta destruirla y sigue a la base', () => {
  const { state, soldier, towers: [tower] } = startSoldier('infantry-mg', [{ towerTypeId: 'mg7-vulcan', ...IN_THE_WAY }]);
  run(state, [tower], 60, () => soldier.blockedBy !== null);
  assert.equal(soldier.blockedBy, tower.id);

  const stoppedAt = { ...soldier.position };
  run(state, [tower], 5, () => false);
  assert.ok(Math.hypot(soldier.position.x - stoppedAt.x, soldier.position.z - stoppedAt.z) < 0.01, 'se queda quieto');
  assert.ok(tower.hp < tower.maxHp, 'le dispara');
  const distance = Math.hypot(soldier.position.x - tower.wx, soldier.position.z - tower.wz);
  assert.ok(distance >= 0.55 * state.config.worldScale, 'no se mete dentro de la torre');

  run(state, [tower], 300, () => tower.destroyed);
  assert.ok(tower.destroyed, 'la destruye');
  run(state, [tower], 1, () => false);
  assert.equal(soldier.blockedBy, null);
  assert.ok(Math.hypot(soldier.position.x - stoppedAt.x, soldier.position.z - stoppedAt.z) > 0.1, 'sigue caminando');

  run(state, [tower], 60, () => !soldier.alive);
  assert.equal(state.lives, 19, 'llega a la base');
});

test('entre dos torres, sigue disparándole a la que le cierra el paso', () => {
  const { state, soldier, towers } = startSoldier('infantry-mg', [
    { towerTypeId: 'mg7-vulcan', ...IN_THE_WAY },
    { towerTypeId: 'mg7-vulcan', gx: 10, gy: 3 },
  ]);
  const [wall, other] = towers;
  run(state, towers, 60, () => soldier.blockedBy !== null);
  assert.equal(soldier.blockedBy, wall.id);
  other.hp = other.maxHp;
  run(state, towers, 10, () => false);
  assert.equal(soldier.targetTowerId, wall.id);
  assert.equal(other.hp, other.maxHp);
});

test('vender la torre que le cierra el paso le abre el camino', () => {
  const { state, soldier, towers: [tower] } = startSoldier('infantry-mg', [{ towerTypeId: 'mg7-vulcan', ...IN_THE_WAY }]);
  run(state, [tower], 60, () => soldier.blockedBy !== null);
  state.towers.length = 0;
  run(state, [], 1, () => false);
  assert.equal(soldier.blockedBy, null);
});

// Con la torre encima, ni el arma del soldado ni la de la torre pueden quedar en un ángulo muerto:
// la partida se trabaría, porque la oleada no termina mientras quede alguien en pie.
for (const enemyTypeId of SOLDIERS) {
  for (const towerTypeId of ['mg7-vulcan', 'lm2-lanza']) {
    for (const [level, tier] of [[0, 0], [4, 2]]) {
      for (const [gx, gy] of [[11, 5], [11, 6], [16, 5]]) {
        const name = `${enemyTypeId} contra ${towerTypeId} (nivel ${level + 1}, blindaje ${tier + 1}) en (${gx}, ${gy})`;

        const prepare = () => {
          const { state, soldier, towers: [tower] } = startSoldier(enemyTypeId, [{ towerTypeId, gx, gy }]);
          for (let index = 0; index < level; index++) upgradeTower(state, tower.id);
          for (let index = 0; index < tier; index++) upgradeTowerDefense(state, tower.id);
          run(state, [tower], 60, () => soldier.blockedBy !== null);
          assert.equal(soldier.blockedBy, tower.id, 'la torre le cierra el paso');
          return { state, soldier, tower };
        };

        test(`${name}: el soldado la destruye`, () => {
          const { state, soldier, tower } = prepare();
          tower.hp = 2;
          soldier.hp = soldier.maxHp = 1e9;
          run(state, [tower], 30, () => tower.destroyed);
          assert.ok(tower.destroyed);
        });

        test(`${name}: la torre lo mata`, () => {
          const { state, soldier, tower } = prepare();
          tower.hp = tower.maxHp = 1e9;
          tower.cooldown = 0;
          run(state, [tower], 30, () => !soldier.alive, false);
          assert.equal(soldier.alive, false);
        });
      }
    }
  }
}

test('las balas de la MG-7 le aciertan a un soldado que cruza el campo', () => {
  const { state, soldier, towers: [tower] } = startSoldier('infantry-mg', [{ towerTypeId: 'mg7-vulcan', gx: 11, gy: 3 }]);
  soldier.hp = soldier.maxHp = 1e9;
  // Sin morir de un disparo en ningún nivel, así se cuentan muchos. Una bala que el soldado esquiva
  // en el pasto también llegó a él: cuenta como acierto de la torre.
  const { coverDamage } = GAMEPLAY_CONFIG.infantryCombat;
  const before = [...coverDamage];
  coverDamage.fill(1);
  let shots = 0;
  let hits = 0;
  try {
    for (let step = 0; step < 60 * 40 && soldier.alive; step++) {
      tower.hp = tower.maxHp;
      tickSimulation(state, DT);
      for (const effect of consumeEffects(state)) {
        if (effect.type === 'projectile-fired') shots += 1;
        if (effect.type === 'hit' || effect.type === 'shot-deflected') hits += 1;
      }
    }
  } finally {
    coverDamage.splice(0, coverDamage.length, ...before);
  }
  assert.ok(shots > 10, `${shots} disparos`);
  assert.ok(hits / shots >= 0.85, `${hits} de ${shots} aciertos`);
});

test('los soldados no caminan uno dentro del otro', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  for (const item of [...state.rocks, ...state.trees]) clearCover(state, item.id);
  state.bushes = [];
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['infantry-mg', 'infantry-mg'] } });
  for (let step = 0; step < 60 && state.enemies.length < 2; step++) tickSimulation(state, DT);
  const [a, b] = state.enemies;
  b.position = { ...a.position, x: a.position.x + 0.01 };
  for (let step = 0; step < 60 * 3; step++) tickSimulation(state, DT);
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > 0.15 * state.config.worldScale);
});
