// Spec 002 (D-1): la LM-2. Dispara sus tubos uno tras otro y recarga; su misil vuela derecho y solo
// daña a lo que golpea; la carga hueca castiga al blindaje pesado y le hace poco a los
// ligeros. La puntería la mide tools/balance/missile-accuracy.mjs (una LM-2 en cuatro celdas
// junto al camino contra columnas de un solo tipo).
import test from 'node:test';
import assert from 'node:assert/strict';

import { consumeEffects, createGameConfig, createInitialState, placeTower, startWave, tickSimulation } from '../src/core/index.js';
import { DAMAGE_MATRIX, MUNITION_CLASSES } from '../src/content/enemies/vehicle-combat.js';
import { lm2TowerDefinition } from '../src/content/towers/lm2.js';
import { mg7TowerDefinition } from '../src/content/towers/mg7.js';
import { measureMissileAccuracy } from '../tools/balance/missile-accuracy.mjs';

const DT = 1 / 60;

/** Una LM-2 del nivel pedido en (5, 4), junto al camino, contra una columna; devuelve los efectos con su hora. */
function play(level, spawns, interval, seconds) {
  const state = createInitialState(createGameConfig());
  state.credits = 100000;
  state.lives = 1000;
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 6, gy: 4 });
  assert.ok(tower, 'la LM-2 se puede poner en (5, 4)');
  tower.level = level;
  startWave(state, { overrideWaveDefinition: { interval, spawns } });
  const effects = [];
  for (let t = 0; t < seconds && state.waveActive; t += DT) {
    tickSimulation(state, DT);
    for (const enemy of state.enemies) enemy.isArmed = false;
    for (const effect of consumeEffects(state)) effects.push({ ...effect, t });
  }
  return effects;
}

test('cada nivel le suma un tubo: de 2 a 6', () => {
  assert.deepEqual(lm2TowerDefinition.levels.map((level) => level.magazine), [2, 3, 4, 5, 6]);
});

test('dispara los tubos uno tras otro y, vacío el cargador, recarga', () => {
  const stats = lm2TowerDefinition.levels[1];
  const shots = play(1, Array(6).fill('tank-heavy'), 2, 60).filter((effect) => effect.type === 'projectile-fired');
  assert.ok(shots.length >= stats.magazine * 2, `disparó ${shots.length} misiles`);
  const gaps = shots.slice(1, stats.magazine * 2).map((shot, index) => shot.t - shots[index].t);
  // Dentro del ciclo, un tubo cada salvoInterval; entre ciclos, al menos la recarga.
  for (let index = 0; index < gaps.length; index++) {
    const reloading = (index + 1) % stats.magazine === 0;
    if (reloading) assert.ok(gaps[index] >= stats.reload - DT, `recarga de ${gaps[index].toFixed(2)} s`);
    else assert.ok(Math.abs(gaps[index] - stats.salvoInterval) < 0.05, `entre tubos ${gaps[index].toFixed(2)} s`);
  }
  // Las bocas se usan por turno: el primer ciclo sale por los tres tubos.
  assert.deepEqual(shots.slice(0, stats.magazine).map((shot) => shot.fireIndex % stats.magazine), [0, 1, 2]);
});

test('contra una columna derecha casi siempre acierta: al tanque lento y también a la patrulla rápida', () => {
  for (const enemyTypeId of ['tank-heavy', 'patrulla']) {
    const { accuracy, fired } = measureMissileAccuracy(enemyTypeId);
    assert.ok(fired > 20, `disparó ${fired}`);
    assert.ok(accuracy >= 0.85, `${enemyTypeId}: ${(accuracy * 100).toFixed(0)} %`);
  }
});

test('la carga hueca castiga al blindaje pesado y le hace poco a los ligeros', () => {
  const shaped = DAMAGE_MATRIX[MUNITION_CLASSES.shapedCharge];
  assert.ok(shaped.heavy > 1 && shaped.light < 1, JSON.stringify(shaped));
});

test('el misil solo daña a su blanco, aunque los vehículos vayan juntos', () => {
  const effects = play(0, Array(10).fill('patrulla'), 0.25, 40);
  const hits = effects.filter((effect) => effect.type === 'hit');
  const fired = effects.filter((effect) => effect.type === 'projectile-fired');
  assert.ok(hits.length > 0);
  assert.ok(hits.length <= fired.length, `${fired.length} misiles causaron ${hits.length} daños`);
  for (const effect of hits) assert.equal(effect.rawDamage, lm2TowerDefinition.levels[0].damage);
});

/** Un misil en vuelo hacia +x, desde ese punto, con un blanco que ya no existe. */
function missileIn(state, x, z, targetId = 'ya-destruido') {
  const { worldScale, pathSurfaceY } = state.config;
  const missile = {
    id: 'misil-prueba', sourceType: 'tower', sourceId: 'ninguna', targetType: 'enemy', targetId, missile: true,
    x, y: pathSurfaceY + worldScale * 0.2, z, vx: 1, vy: 0, vz: 0, speed: 5 * worldScale,
    hitThreshold: 0.1 * worldScale, maxDistance: 6 * worldScale, damage: 55, damageType: MUNITION_CLASSES.shapedCharge,
    impactBlast: 0, origin: { x, y: 0, z }, alive: true,
  };
  state.projectiles.push(missile);
  return missile;
}

function quietEnemy(state, enemyTypeId) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [enemy] = state.enemies;
  enemy.speed = 0;
  enemy.hp = enemy.maxHp = 1e6;
  return enemy;
}

test('si su blanco cae en vuelo, el misil sigue derecho: no busca a otro que esté cerca', () => {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  const enemy = quietEnemy(state, 'tank-heavy');
  const { worldScale } = state.config;
  // El tanque queda a 1,5 celdas del costado de su línea.
  const missile = missileIn(state, enemy.position.x - 2 * worldScale, enemy.position.z + 1.5 * worldScale);
  const { y } = missile;
  for (let step = 0; step < 60 && missile.alive; step++) tickSimulation(state, DT);
  assert.equal(enemy.hp, 1e6, 'lo persiguió');
  assert.equal(missile.vx, 1);
  assert.equal(missile.vz, 0);
  assert.equal(missile.y, y);
});

test('sin guía, le pega a cualquier vehículo que se cruce en su línea', () => {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  const enemy = quietEnemy(state, 'tank-heavy');
  const center = enemy.position;
  const missile = missileIn(state, center.x - 2 * state.config.worldScale, center.z);
  for (let step = 0; step < 60 && missile.alive; step++) tickSimulation(state, DT);
  assert.equal(missile.alive, false);
  assert.ok(enemy.hp < 1e6, 'no le pegó');
});

test('a un soldado que no era su blanco lo pasa de largo', () => {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  const soldier = quietEnemy(state, 'infantry-mg');
  const missile = missileIn(state, soldier.position.x - 2 * state.config.worldScale, soldier.position.z);
  for (let step = 0; step < 40; step++) tickSimulation(state, DT);
  assert.equal(soldier.hp, 1e6);
  assert.ok(missile.traveled > 2 * state.config.worldScale, 'se detuvo');
});

test('la LM-2 tiene menos vida que la MG-7 en todos sus blindajes', () => {
  lm2TowerDefinition.defenseLevels.forEach((defense, index) => {
    assert.ok(defense.maxHp < mg7TowerDefinition.defenseLevels[index].maxHp, `blindaje ${index + 1}`);
  });
});

test('la LM-2 no le dispara a lo que vuela', () => {
  assert.ok(!lm2TowerDefinition.combatModel.targets?.air);
});

test('el misil explota al impactar, pero solo daña a su blanco', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 5000;
  placeTower(state, { towerTypeId: 'lm2-lanza', gx: 10, gy: 5 });
  startWave(state, { overrideWaveDefinition: { interval: 0.05, spawns: ['patrulla', 'patrulla'] } });
  let hit = null;
  for (let i = 0; i < 60 * 60 && !hit; i++) {
    tickSimulation(state, DT);
    hit = consumeEffects(state).find((effect) => effect.type === 'hit') ?? null;
  }
  assert.ok(hit, 'el misil impactó');
  assert.equal(hit.impactBlast, lm2TowerDefinition.combatModel.impactBlast * state.config.worldScale);
  const [target, other] = hit.enemyId === state.enemies[0].id ? state.enemies : [...state.enemies].reverse();
  assert.ok(target.hp < target.maxHp);
  assert.equal(other.hp, other.maxHp, 'el vehículo de al lado queda intacto');
});
