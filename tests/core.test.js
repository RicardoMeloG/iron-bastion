import { getAimPoint, getBarrelDirection } from '../src/core/rig-geometry.js';
import { getTowerSize } from '../src/core/tower-geometry.js';
import { rigDefinitions } from '../src/content/rigs/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCombatStep,
  consumeEffects,
  createGameConfig,
  createInitialState,
  gridToWorld,
  placeTower,
  resetWave,
  selectTargets,
  sellTower,
  startWave,
  tickSimulation,
  upgradeTower,
  upgradeTowerDefense,
  worldToGrid,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { defaultWaveSetDefinition } from '../src/content/waves/defaultWaveSet.js';
import { MUNITION_CLASSES } from '../src/content/enemies/vehicle-combat.js';
import { resolveDamage } from '../src/core/simulation.js';

function setupState(worldScale = 10) {
  const config = createGameConfig({ worldScale });
  return createInitialState(config);
}

function freeCell(state) {
  for (let y = 0; y < state.grid.length; y += 1) {
    for (let x = 0; x < state.grid[0].length; x += 1) {
      if (state.grid[y][x] === 0) return [x, y];
    }
  }
  throw new Error('no hay celdas libres');
}

function createStaticEnemy(overrides = {}) {
  return {
    id: 'enemy-test',
    enemyTypeId: 'patrulla',
    hp: 80,
    maxHp: 80,
    armor: 0,
    armorClass: 'light',
    speed: 0,
    reward: 12,
    pathIndex: 0,
    progress: 0,
    alive: true,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    damageType: MUNITION_CLASSES.lightBallistic,
    isArmed: false,
    weaponProfile: null,
    weaponCooldown: 0,
    targetTowerId: null,
    aimAngle: 0,
    aimPitch: 0,
    ...overrides,
  };
}

test('comprar, mejorar y vender torre respeta economia base', () => {
  const state = setupState();
  state.credits = 300;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 2 });
  assert.ok(tower);
  assert.equal(state.credits, 240);
  assert.equal(upgradeTower(state, tower.id), true);
  assert.equal(tower.level, 1);
  assert.equal(tower.invested, 150);
  assert.equal(state.credits, 150);
  startWave(state);
  assert.equal(sellTower(state, tower.id), true);
  assert.equal(state.credits, 240);
});

test('solo alcanza para una torre, y la oleada 1 se puede con ella sin mejorar', () => {
  const state = createInitialState(createGameConfig());
  const { towerDefinitions } = state.config;
  assert.equal(state.credits, towerDefinitions['mg7-vulcan'].economy.baseCost);
  assert.ok(state.credits < towerDefinitions['lm2-lanza'].economy.baseCost);
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 11, gy: 4 });
  assert.ok(tower);
  assert.equal(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 11, gy: 6 }), null, 'no alcanza para otra');
  const lives = state.lives;
  startWave(state);
  for (let step = 0; step < 60 * 90 && state.waveActive; step++) tickSimulation(state, 1 / 60);
  assert.equal(state.waveActive, false);
  assert.equal(state.lives, lives, 'no pasa nadie');
  assert.ok(!tower.destroyed, 'la torre sigue en pie');
});

test('enemigo armado dispara y dania torre en rango mientras avanza', () => {
  const state = setupState();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 });
  const initialHp = tower.hp;
  const enemy = createStaticEnemy({
    id: 'enemy-armed',
    enemyTypeId: 'apc-8x8',
    armorClass: 'light',
    position: { x: tower.wx + 8, y: state.config.pathSurfaceY, z: tower.wz + 1 },
    isArmed: true,
    weaponProfile: {
      damage: 12,
      rate: 3.8,
      range: 2.4,
      projectileSpeed: 12,
      hitThreshold: 0.25,
      damageType: MUNITION_CLASSES.heavyBallistic,
    },
  });
  state.enemies.push(enemy);

  for (let step = 0; step < 80; step += 1) {
    applyCombatStep(state, 0.016);
  }

  assert.ok(tower.hp < initialHp);
  assert.ok(state.effects.some((effect) => effect.type === 'tower-hit'));
});

test('matriz de dano y armadura plana se aplica en ambos sentidos', () => {
  const state = setupState();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 2 });
  state.credits = 10000;
  assert.equal(upgradeTowerDefense(state, tower.id), true);
  assert.equal(upgradeTowerDefense(state, tower.id), true);
  const fullHp = tower.hp;

  state.projectiles.push({
    id: 'proj-light-vs-heavy',
    sourceType: 'enemy',
    sourceId: 'enemy-x',
    targetType: 'tower',
    targetId: tower.id,
    x: tower.wx,
    y: state.config.pathSurfaceY + state.config.worldScale * 0.26,
    z: tower.wz,
    vx: 0,
    vy: 0,
    vz: 1,
    speed: 0,
    hitThreshold: state.config.worldScale,
    damage: 20,
    damageType: MUNITION_CLASSES.lightBallistic,
    alive: true,
  });

  applyCombatStep(state, 0.016);
  assert.equal(tower.hp, fullHp - 1, 'el blindaje pesado reduce el impacto al mínimo, sin inmunidad');
  const hpAfterLightHit = tower.hp;

  state.projectiles.push({
    id: 'proj-piercing-vs-heavy',
    sourceType: 'enemy',
    sourceId: 'enemy-y',
    targetType: 'tower',
    targetId: tower.id,
    x: tower.wx,
    y: state.config.pathSurfaceY + state.config.worldScale * 0.26,
    z: tower.wz,
    vx: 0,
    vy: 0,
    vz: 1,
    speed: 0,
    hitThreshold: state.config.worldScale,
    damage: 20,
    damageType: MUNITION_CLASSES.piercing,
    alive: true,
  });
  applyCombatStep(state, 0.016);
  assert.ok(tower.hp < hpAfterLightHit);

  const enemy = createStaticEnemy({
    id: 'enemy-heavy',
    armorClass: 'heavy',
    armor: 0,
    hp: 40,
    maxHp: 40,
    position: { x: tower.wx, y: state.config.pathSurfaceY, z: tower.wz + 2 },
  });
  state.enemies.push(enemy);
  state.projectiles.push({
    id: 'proj-light-vs-heavy-enemy',
    sourceType: 'tower',
    sourceId: tower.id,
    targetType: 'enemy',
    targetId: enemy.id,
    x: enemy.position.x,
    y: enemy.position.y,
    z: enemy.position.z,
    vx: 0,
    vy: 0,
    vz: 1,
    speed: 0,
    hitThreshold: state.config.worldScale,
    damage: 5,
    damageType: MUNITION_CLASSES.lightBallistic,
    alive: true,
  });
  applyCombatStep(state, 0.016);
  assert.ok(enemy.hp <= 37.5 && enemy.hp >= 37.4);
});

test('durante la oleada se construye, mejora y vende, y lo comprado sobrevive a su fin', () => {
  const state = setupState();
  state.credits = 5000;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 3 });
  const sold = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
  startWave(state);

  const [freeX, freeY] = freeCell(state);
  const placed = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: freeX, gy: freeY });
  assert.ok(placed);
  assert.equal(upgradeTower(state, tower.id), true);
  assert.equal(upgradeTowerDefense(state, tower.id), true);
  assert.equal(sellTower(state, sold.id), true);

  state.spawnQueue = [];
  state.enemies = [];
  tickSimulation(state, 0.016);
  assert.equal(state.waveActive, false);
  const after = state.towers.find((item) => item.id === tower.id);
  assert.equal(after.level, 1);
  assert.equal(after.defenseTier, 1);
  assert.ok(state.towers.some((item) => item.id === placed.id), 'la torre puesta en la oleada sigue');
  assert.ok(!state.towers.some((item) => item.id === sold.id), 'la torre vendida en la oleada no vuelve');
});

test('reintentar la oleada deshace lo comprado durante ella', () => {
  const state = setupState();
  state.credits = 5000;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 3 });
  const credits = state.credits;
  startWave(state);
  upgradeTower(state, tower.id);
  const [freeX, freeY] = freeCell(state);
  assert.ok(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: freeX, gy: freeY }));

  resetWave(state);
  assert.equal(state.credits, credits);
  assert.equal(state.towers.length, 1);
  assert.equal(state.towers[0].level, 0);
});

test('un vehículo sigue combatiendo si le venden la torre que apuntaba', () => {
  const state = setupState();
  state.credits = 5000;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 3 });
  startWave(state);
  for (let step = 0; step < 300; step += 1) tickSimulation(state, 0.016);
  assert.equal(sellTower(state, tower.id), true);
  for (let step = 0; step < 300; step += 1) tickSimulation(state, 0.016);
  assert.equal(state.towers.length, 0);
});

test('torre pasa a destruida y al fin de oleada revive desde baseline', () => {
  const state = setupState();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 3 });
  state.credits = 5000;
  upgradeTower(state, tower.id);
  upgradeTowerDefense(state, tower.id);
  const baselineLevel = tower.level;
  const baselineDefense = tower.defenseTier;

  startWave(state);
  tower.hp = 0;
  tower.destroyed = true;
  state.spawnQueue = [];
  state.enemies = [];
  state.waveActive = true;
  tickSimulation(state, 0.016);

  const restored = state.towers.find((item) => item.id === tower.id);
  assert.ok(restored);
  assert.equal(restored.destroyed, false);
  assert.equal(restored.hp, restored.maxHp);
  assert.equal(restored.level, baselineLevel);
  assert.equal(restored.defenseTier, baselineDefense);
});

test('resetWave restaura snapshot completo sin romper campos defensivos', () => {
  const state = setupState();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 2 });
  startWave(state);
  tower.hp = Math.max(1, tower.hp - 30);
  tower.destroyed = true;
  resetWave(state);

  assert.equal(state.wave, 0);
  assert.equal(state.towers.length, 1);
  assert.equal(state.towers[0].destroyed, false);
});

test('enemy-killed incluye reward y enemyTypeId', () => {
  const state = setupState();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 2 });
  const enemy = createStaticEnemy({
    id: 'enemy-kill',
    hp: 3,
    maxHp: 3,
    armor: 0,
    armorClass: 'light',
    enemyTypeId: 'patrulla',
    reward: 12,
    position: { x: tower.wx, y: state.config.pathSurfaceY, z: tower.wz + 20 },
  });
  state.enemies.push(enemy);
  selectTargets(state);
  for (let step = 0; step < 60; step += 1) applyCombatStep(state, 0.016);

  const killEffect = state.effects.find((effect) => effect.type === 'enemy-killed');
  assert.ok(killEffect);
  assert.equal(killEffect.reward, 12);
  assert.equal(killEffect.enemyTypeId, 'patrulla');
});

test('pathWorld escala correctamente con worldScale', () => {
  const baseConfig = createGameConfig({ worldScale: 1 });
  const scaledConfig = createGameConfig({ worldScale: 10 });
  for (let index = 0; index < baseConfig.pathWorld.length; index += 1) {
    assert.equal(scaledConfig.pathWorld[index].x, baseConfig.pathWorld[index].x * 10);
    assert.equal(scaledConfig.pathWorld[index].y, baseConfig.pathWorld[index].y * 10);
    assert.equal(scaledConfig.pathWorld[index].z, baseConfig.pathWorld[index].z * 10);
  }
});

test('conversion grid/world mantiene celda correcta en escala 10', () => {
  const config = createGameConfig({ worldScale: 10 });
  const world = gridToWorld(7, 3, config.worldScale, config.halfWidth, config.halfHeight);
  const grid = worldToGrid(world.x + 0.1, world.z - 0.1, config.worldScale, config.halfWidth, config.halfHeight);
  assert.equal(grid.gx, 7);
  assert.equal(grid.gy, 3);
});

test('las bajas de una torre se conservan al terminar la oleada', () => {
  const state = setupState();
  state.credits = 9999;
  for (const [gx, gy] of [[6, 4], [6, 3], [8, 5], [10, 3], [12, 4]]) {
    const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx, gy });
    upgradeTower(state, tower.id);
    upgradeTower(state, tower.id);
  }
  startWave(state);
  let destroyed = 0;
  for (let step = 0; step < 60 * 120 && state.waveActive; step += 1) {
    tickSimulation(state, 1 / 60);
    destroyed += state.effects.filter((effect) => effect.type === 'enemy-killed').length;
    state.effects = [];
  }
  assert.ok(destroyed > 0, 'las torres destruyen vehículos en la oleada 1');
  assert.equal(state.waveActive, false);
  assert.equal(state.towers.reduce((sum, tower) => sum + tower.kills, 0), destroyed);
});


test('un tanque no dispara a una torre demasiado cerca para apuntarle (check:aim)', () => {
  const firedAt = (distanceCells) => {
    const state = setupState();
    state.credits = 5000;
    const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 3 });
    tower.hp = tower.maxHp = 1e9;
    startWave(state, { overrideWaveDefinition: { interval: 1, spawns: ['tank-heavy'] } });
    const shots = [];
    for (let step = 0; step < 60 * 8; step++) {
      tickSimulation(state, 1 / 60);
      const [enemy] = state.enemies;
      if (enemy) {
        // Quieto a esa distancia, con el frente hacia la torre.
        enemy.hp = enemy.maxHp = 1e9;
        enemy.pathIndex = state.config.pathWorld.length - 1;
        enemy.rotation = -Math.PI / 2;
        enemy.position = { x: tower.wx + distanceCells * state.config.worldScale, y: state.config.pathSurfaceY, z: tower.wz };
      }
      for (const effect of state.effects) {
        if (effect.type !== 'enemy-projectile-fired') continue;
        const rig = rigDefinitions[state.config.towerDefinitions[tower.towerTypeId].model.rigs[tower.level]];
        const target = getAimPoint(rig, { x: tower.wx, y: 0, z: tower.wz, scale: getTowerSize(state.config.towerDefinitions[tower.towerTypeId], tower.level) * state.config.worldScale });
        const barrel = getBarrelDirection(enemy.aimAngle, enemy.aimPitch);
        const to = { x: target.x - effect.position.x, y: target.y - effect.position.y, z: target.z - effect.position.z };
        const cosine = (to.x * barrel.x + to.y * barrel.y + to.z * barrel.z) / Math.hypot(to.x, to.y, to.z);
        shots.push((Math.acos(Math.min(1, cosine)) * 180) / Math.PI);
      }
      state.effects.length = 0;
    }
    return shots;
  };

  assert.ok(firedAt(3).length > 0, 'a 3 celdas dispara');
  for (let distance = 0.3; distance < 3; distance += 0.05) {
    for (const angle of firedAt(distance)) {
      assert.ok(angle <= 10, `a ${distance.toFixed(2)} celdas dispara con el cañón a ${angle.toFixed(1)}°`);
    }
  }
});

test('reiniciar la oleada no hace nada si ya terminó: no devuelve vidas', () => {
  const state = setupState();
  startWave(state);
  state.lives -= 3;
  const lives = state.lives;
  state.spawnQueue = [];
  state.enemies = [];
  tickSimulation(state, 0.016);
  assert.equal(state.waveActive, false);

  resetWave(state);
  assert.equal(state.lives, lives);
  assert.equal(state.wave, 1);
});

test('el mínimo de daño rige para las torres, no para los vehículos', () => {
  const state = setupState();
  state.credits = 5000;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 3 });
  const tank = createStaticEnemy({
    id: 'enemy-floor',
    armorClass: 'heavy',
    armor: 12,
    hp: 100,
    maxHp: 100,
    position: { x: tower.wx, y: state.config.pathSurfaceY, z: tower.wz + 2 },
  });
  state.enemies.push(tank);
  state.projectiles.push({
    id: 'proj-floor',
    sourceType: 'tower',
    sourceId: tower.id,
    targetType: 'enemy',
    targetId: tank.id,
    x: tank.position.x,
    y: tank.position.y,
    z: tank.position.z,
    vx: 0,
    vy: 0,
    vz: 1,
    speed: 0,
    hitThreshold: state.config.worldScale,
    damage: 5,
    damageType: MUNITION_CLASSES.lightBallistic,
    alive: true,
  });
  applyCombatStep(state, 0.016);
  assert.equal(tank.hp, 100);
});

test('una moto destruida deja a sus dos soldados donde cayó, separados', () => {
  const state = createInitialState(createGameConfig());
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['moto-recon'] } });
  while (state.enemies.length === 0) tickSimulation(state, 1 / 60);
  for (let i = 0; i < 120; i++) tickSimulation(state, 1 / 60);
  const [moto] = state.enemies;
  const { position } = moto;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 10, gy: 5 });
  moto.hp = 1;
  state.projectiles.push({
    id: 'prueba', targetType: 'enemy', targetId: moto.id, sourceId: tower.id, x: position.x, y: position.y, z: position.z,
    vx: 0, vy: 0, vz: 0, origin: { ...position }, speed: 1, hitThreshold: 1000, maxDistance: 1000, damage: 50, damageType: 'light-ballistic', alive: true,
  });
  tickSimulation(state, 1 / 60);
  const soldiers = state.enemies.filter((enemy) => enemy.armorClass === 'infantry');
  assert.deepEqual(soldiers.map((soldier) => soldier.enemyTypeId), ['infantry-mg', 'infantry-mg']);
  const worldScale = state.config.worldScale;
  assert.ok(soldiers.every((soldier) => Math.hypot(soldier.position.x - position.x, soldier.position.z - position.z) < 0.3 * worldScale));
  tickSimulation(state, 1 / 60);
  const [a, b] = soldiers;
  assert.ok(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > 0.1 * state.config.worldScale, 'no caminan uno encima del otro');
  assert.ok(soldiers.every((soldier) => soldier.alive));
});

test('una bala de MG-7 básica daña a un soldado y un misil lo mata de un golpe, sin rendir más', () => {
  const soldier = enemyDefinitions['infantry-mg'];
  assert.ok(resolveDamage(5, 'light-ballistic', 'infantry', soldier.stats.armor) === 5);
  assert.ok(resolveDamage(55, 'shaped-charge', 'infantry', soldier.stats.armor) >= soldier.stats.hp);
});

test('el RPG dispara un cohete: explota al impactar, pero solo daña a su blanco', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 5000;
  const near = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 10, gy: 5 });
  const neighbor = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 11, gy: 5 });
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['infantry-rpg'] } });
  let fired = null;
  let flying = null;
  let hit = null;
  for (let i = 0; i < 60 * 120 && !hit; i++) {
    // Las torres no disparan: el soldado tiene que llegar a usar su arma. Y sin granadas, que sí tienen onda.
    near.cooldown = 999;
    neighbor.cooldown = 999;
    for (const enemy of state.enemies) enemy.grenadeCooldown = 999;
    tickSimulation(state, 1 / 60);
    flying ??= state.projectiles.find((projectile) => projectile.look === 'rocket') ?? null;
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'enemy-projectile-fired') fired ??= effect;
      if (effect.type === 'tower-hit') hit ??= effect;
    }
  }
  assert.ok(flying, 'hay un cohete en vuelo');
  assert.equal(fired.projectile, 'rocket');
  assert.equal(fired.enemyTypeId, 'infantry-rpg');
  assert.equal(hit.enemyTypeId, 'infantry-rpg');
  assert.ok(hit.impactBlast > 0, 'se dibuja una explosión');
  assert.equal(hit.blastRadius, 0, 'no tiene daño de área');
  const [target, other] = hit.towerId === near.id ? [near, neighbor] : [neighbor, near];
  assert.ok(target.hp < target.maxHp);
  assert.equal(other.hp, other.maxHp, 'la torre de al lado queda intacta');
});
