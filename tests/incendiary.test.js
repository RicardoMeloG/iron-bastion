// La RK-40: cohetes en arco a un punto del suelo, de lejos y no de cerca. Cada uno deja una zona
// ardiendo, que barre a los soldados y a las motos y casi no le hace nada a lo blindado.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeEffects,
  createGameConfig,
  createInitialState,
  placeTower,
  resetWave,
  startWave,
  tickSimulation,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { towerDefinitions } from '../src/content/towers/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';
import { resolveEnemyBurnDamage } from '../src/core/simulation.js';
import { getTowerLevel } from '../src/core/state.js';
import { getLoadedRockets } from '../src/core/tower-geometry.js';
import { rigDefinitions } from '../src/content/rigs/index.js';

const DT = 1 / 60;
const RK = towerDefinitions['rk40-brasa'];
const { damageType } = RK.combatModel;

function newGame(seed = 0) {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  state.combatRandomSeed = seed;
  state.rocks = [];
  state.trees = [];
  state.bushes = [];
  return state;
}

/** Un enemigo quieto, a `cells` celdas de la torre, en la misma fila. */
function targetAt(state, tower, enemyTypeId, cells, hp = null) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [enemy] = state.enemies;
  enemy.speed = 0;
  enemy.pathIndex = 0;
  enemy.position.x = tower.wx + state.config.worldScale * cells;
  enemy.position.z = tower.wz;
  if (hp) enemy.hp = enemy.maxHp = hp;
  return enemy;
}

function fired(state, seconds) {
  let count = 0;
  consumeEffects(state);
  for (let step = 0; step < 60 * seconds; step++) {
    tickSimulation(state, DT);
    count += consumeEffects(state).filter((effect) => effect.type === 'projectile-fired').length;
  }
  return count;
}

test('no dispara a lo que tiene cerca, y sí a lo que está lejos', () => {
  const close = newGame();
  const tower = placeTower(close, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  targetAt(close, tower, 'infantry-mg', RK.levels[0].minRange - 0.5, 1e9);
  assert.equal(fired(close, 10), 0);

  const far = newGame();
  const other = placeTower(far, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  other.hp = other.maxHp = 1e9;
  targetAt(far, other, 'infantry-mg', RK.levels[0].minRange + 1, 1e9);
  assert.ok(fired(far, 10) >= RK.levels[0].magazine);
});

test('dispara el cargador entero y recarga', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  targetAt(state, tower, 'infantry-mg', 4, 1e9);
  const { magazine, salvoInterval, reload } = RK.levels[0];
  const window = (magazine - 1) * salvoInterval + reload * 0.5;
  assert.equal(fired(state, window), magazine);
});

test('el cohete vuela en arco y deja una zona que arde en el suelo, que se apaga', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  targetAt(state, tower, 'infantry-mg', 4, 1e9);
  const towerHeight = state.config.worldScale;
  let highest = 0;
  let zones = 0;
  let impacts = 0;
  consumeEffects(state);
  for (let step = 0; step < 60 * 8; step++) {
    tickSimulation(state, DT);
    for (const projectile of state.projectiles) if (projectile.targetType === 'ground') highest = Math.max(highest, projectile.y);
    zones = Math.max(zones, state.fireZones.length);
    impacts += consumeEffects(state).filter((effect) => effect.type === 'incendiary-impact').length;
  }
  assert.ok(highest > towerHeight, `llegó a ${highest}`);
  assert.ok(impacts >= 1);
  assert.ok(zones >= 1);
});

test('la zona se apaga sola, y al terminar la oleada no queda ninguna', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  const enemy = targetAt(state, tower, 'infantry-mg', 4, 1);
  for (let step = 0; step < 60 * 5 && enemy.alive; step++) tickSimulation(state, DT);
  assert.equal(enemy.alive, false, 'no lo alcanzó');
  for (let step = 0; step < 60 * 30 && state.waveActive; step++) tickSimulation(state, DT);
  assert.equal(state.fireZones.length, 0);
});

test('reintentar la oleada apaga las zonas', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  targetAt(state, tower, 'infantry-mg', 4, 1e9);
  for (let step = 0; step < 60 * 8 && state.fireZones.length === 0; step++) tickSimulation(state, DT);
  assert.ok(state.fireZones.length > 0);
  resetWave(state);
  assert.equal(state.fireZones.length, 0);
});

test('barre a soldados y motos; lo blindado recibe poco o nada', () => {
  const burn = (id) => {
    const { armorClass, stats } = enemyDefinitions[id];
    return resolveEnemyBurnDamage(100, damageType, armorClass, stats.armor);
  };
  assert.equal(burn('infantry-mg'), 100);
  assert.ok(burn('moto-recon') >= 70, `moto ${burn('moto-recon')}`);
  assert.ok(burn('patrulla') <= 50, `patrulla ${burn('patrulla')}`);
  // El daño a un blindado es mínimo, pero no cero.
  for (const id of ['apc-8x8', 'tank-heavy']) {
    assert.ok(burn(id) > 0 && burn(id) <= 10, `${id}: ${burn(id)}`);
  }
});

test('una salva de nivel 1 mata a un grupo de soldados que está en la zona', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: Array(3).fill('infantry-mg') } });
  for (let step = 0; step < 60 && state.enemies.length < 3; step++) tickSimulation(state, DT);
  const soldiers = [...state.enemies];
  soldiers.forEach((soldier, index) => {
    soldier.speed = 0;
    soldier.position.x = tower.wx + state.config.worldScale * 4;
    soldier.position.z = tower.wz + index * 0.15 * state.config.worldScale;
  });
  for (let step = 0; step < 60 * 12 && state.enemies.length; step++) tickSimulation(state, DT);
  assert.equal(state.enemies.length, 0, `quedaron ${state.enemies.length}`);
});

test('el fuego no le hace nada a lo que vuela', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 12, gy: 7 });
  tower.cooldown = 1e9;
  const drone = targetAt(state, tower, 'dron-ala', 4, 100);
  state.fireZones.push({ id: 'prueba', x: drone.position.x, z: drone.position.z, groundY: 0, radius: 100, remaining: 5, seconds: 5, burnPerSecond: 1000, damageType, towerId: tower.id });
  for (let step = 0; step < 60; step++) {
    tower.cooldown = 1e9;
    tickSimulation(state, DT);
  }
  assert.equal(drone.hp, 100);
});

test('quema árboles y arbustos, pero no las rocas', () => {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  const [rock] = state.rocks;
  const [tree] = state.trees;
  const [bush] = state.bushes;
  startWave(state, { overrideWaveDefinition: { interval: 100, spawns: ['tank-heavy'] } });
  for (const cover of [rock, tree, bush]) {
    state.fireZones.push({ id: cover.id, x: cover.wx, z: cover.wz, groundY: 0, radius: 1, remaining: 600, seconds: 600, burnPerSecond: 5, damageType, towerId: null });
  }
  const treeHp = tree.hp;
  for (let step = 0; step < 60 * 20; step++) tickSimulation(state, DT);
  assert.ok(state.rocks.includes(rock), 'la roca cayó');
  assert.equal(rock.hp, rock.maxHp);
  assert.ok(!state.bushes.includes(bush), 'el arbusto no se quemó');
  assert.ok(tree.hp < treeHp, 'el árbol no se quemó');
});

test('la cobertura no protege del fuego', () => {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  const [rock] = state.rocks;
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['infantry-mg'] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [soldier] = state.enemies;
  soldier.speed = 0;
  soldier.position.x = rock.wx;
  soldier.position.z = rock.wz;
  tickSimulation(state, DT);
  assert.equal(soldier.inCover, true);
  state.fireZones.push({ id: 'prueba', x: rock.wx, z: rock.wz, groundY: 0, radius: 1, remaining: 5, seconds: 5, burnPerSecond: 100, damageType, towerId: null });
  for (let step = 0; step < 60 && soldier.alive; step++) tickSimulation(state, DT);
  assert.equal(soldier.alive, false);
});

test('la RK-40 prefiere lo que puede quemar: entre un tanque y un soldado, tira al soldado', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: ['tank-heavy', 'infantry-mg'] } });
  for (let step = 0; step < 120 && state.enemies.length < 2; step++) tickSimulation(state, DT);
  const tank = state.enemies.find((enemy) => enemy.enemyTypeId === 'tank-heavy');
  const soldier = state.enemies.find((enemy) => enemy.enemyTypeId === 'infantry-mg');
  for (const [enemy, cells] of [[tank, 3], [soldier, 5]]) {
    enemy.speed = 0;
    enemy.hp = enemy.maxHp = 1e9;
    enemy.position.x = tower.wx + state.config.worldScale * cells;
    enemy.position.z = tower.wz;
  }
  tickSimulation(state, DT);
  assert.equal(tower.targetEnemyId, soldier.id);
});

test('la RK-40 tira primero a los soldados: entre una moto más cerca y un soldado más lejos, al soldado', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 12, gy: 7 });
  tower.hp = tower.maxHp = 1e9;
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: ['moto-recon', 'infantry-mg'] } });
  for (let step = 0; step < 120 && state.enemies.length < 2; step++) tickSimulation(state, DT);
  const moto = state.enemies.find((enemy) => enemy.enemyTypeId === 'moto-recon');
  const soldier = state.enemies.find((enemy) => enemy.enemyTypeId === 'infantry-mg');
  moto.speed = 0;
  soldier.speed = 0;
  soldier.position.x = tower.wx + state.config.worldScale * 4.5;
  soldier.position.z = tower.wz;
  moto.position.x = tower.wx + state.config.worldScale * 3;
  moto.position.z = tower.wz;
  tickSimulation(state, DT);
  assert.equal(tower.targetEnemyId, soldier.id);
});

test('el vehículo que pasa por el fuego frena porque se le recalienta el motor', () => {
  const walked = (burning) => {
    const state = newGame();
    startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['tank-heavy'] } });
    for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
    const [tank] = state.enemies;
    tank.hp = tank.maxHp = 1e9;
    if (burning) state.fireZones.push({ id: 'prueba', x: tank.position.x, z: tank.position.z, groundY: 0, radius: 1000, remaining: 5, seconds: 5, burnPerSecond: 5, damageType, towerId: null });
    const before = tank.progress + tank.pathIndex;
    for (let step = 0; step < 60; step++) tickSimulation(state, DT);
    return tank.progress + tank.pathIndex - before;
  };
  const ratio = walked(true) / walked(false);
  assert.ok(Math.abs(ratio - GAMEPLAY_CONFIG.fire.overheatSpeed) < 0.05, `va a ${ratio} de su velocidad`);
});

test('el motor se enfría un rato después de salir del fuego, y el soldado no frena', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: ['tank-heavy', 'infantry-mg'] } });
  for (let step = 0; step < 120 && state.enemies.length < 2; step++) tickSimulation(state, DT);
  const tank = state.enemies.find((enemy) => enemy.enemyTypeId === 'tank-heavy');
  const soldier = state.enemies.find((enemy) => enemy.enemyTypeId === 'infantry-mg');
  tank.hp = tank.maxHp = soldier.hp = soldier.maxHp = 1e9;
  state.fireZones.push({ id: 'prueba', x: tank.position.x, z: tank.position.z, groundY: 0, radius: 1000, remaining: 0.5, seconds: 0.5, burnPerSecond: 5, damageType, towerId: null });
  for (let step = 0; step < 20; step++) tickSimulation(state, DT);
  assert.ok(tank.overheatSeconds > 0, 'no se recalentó');
  assert.ok(!(soldier.overheatSeconds > 0), 'el soldado no tiene motor');
  for (let step = 0; step < 60 * (0.5 + GAMEPLAY_CONFIG.fire.overheatSeconds); step++) tickSimulation(state, DT);
  assert.ok(!(tank.overheatSeconds > 0), 'no se enfrió');
});

test('evolucionar la RK-40 rinde más por crédito que poner básicas', () => {
  const value = (level) => {
    const { magazine, salvoInterval, reload, damage, burnPerSecond, burnSeconds } = level;
    return (magazine * (damage + burnPerSecond * burnSeconds)) / ((magazine - 1) * salvoInterval + reload);
  };
  let cost = RK.economy.baseCost;
  const basic = value(RK.levels[0]) / cost;
  RK.levels.forEach((level, index) => {
    if (index === 0) return;
    cost += RK.levels[index - 1].upgradeCost;
    assert.ok(value(level) / cost > basic, `nivel ${index + 1}: ${value(level) / cost} frente a ${basic}`);
  });
});

test('los cohetes salen de a uno, faltan durante la recarga y vuelven todos al terminarla', () => {
  const stats = getTowerLevel(RK, 2);
  const tower = { ammo: null, cooldown: 0 };
  assert.equal(getLoadedRockets(tower, stats), stats.magazine, 'recién puesta, está llena');
  tower.ammo = stats.magazine - 1;
  tower.cooldown = stats.salvoInterval;
  assert.equal(getLoadedRockets(tower, stats), stats.magazine - 1, 'tras el primer disparo falta uno');
  tower.ammo = stats.magazine;
  tower.cooldown = stats.reload;
  assert.equal(getLoadedRockets(tower, stats), 0, 'al salir el último queda vacía');
  tower.cooldown = stats.reload / 2;
  assert.equal(getLoadedRockets(tower, stats), Math.floor(stats.magazine / 2), 'a media recarga va a la mitad');
  tower.cooldown = 0;
  assert.equal(getLoadedRockets(tower, stats), stats.magazine, 'al terminar, todos');
});

test('cada nivel de la RK-40 tiene una boca por cada cohete del cargador', () => {
  RK.levels.forEach((stats, level) => {
    const rig = RK.model.rigs[level];
    assert.equal(rigDefinitions[rig].muzzles.length, stats.magazine, rig);
  });
});

test('el registro sabe cuánto retrasó el napalm a un vehículo: lo que dejó de avanzar mientras estuvo recalentado', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['patrulla'] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [patrol] = state.enemies;
  patrol.hp = patrol.maxHp = 1e9;
  const { overheatSpeed } = GAMEPLAY_CONFIG.fire;
  patrol.overheatSeconds = 1;
  for (let step = 0; step < 60 * 2; step++) tickSimulation(state, DT);
  assert.ok(Math.abs(patrol.fireDelaySeconds - (1 - overheatSpeed)) < 0.03, `${patrol.fireDelaySeconds} s`);
});

test('un cohete de más nivel que cae sobre un fuego lo agranda', () => {
  const state = newGame();
  state.credits = 1e6;
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 8, gy: 7 });
  const big = getTowerLevel(RK, RK.levels.length - 1).burnRadius * state.config.worldScale;
  state.fireZones.push({ id: 'fuego-chico', x: 0, z: 0, groundY: 0, radius: big / 2, remaining: 3, burnPerSecond: 1, damageType, towerId: tower.id });
  state.projectiles.push({
    id: 'cohete', sourceType: 'tower', sourceId: tower.id, targetType: 'ground', look: 'rocket', alive: true,
    x: 0, y: 5, z: 0, vx: 0, vy: -1, vz: 0, speed: 1, origin: { x: 0, y: 5, z: 0 }, to: { x: 0, z: 0 }, groundY: 0,
    flightSeconds: 0.01, elapsed: 0, arcHeight: 0, impactRadius: 1, damage: 1, damageType, burnPerSecond: 1, burnSeconds: 3, burnRadius: big, impactBlast: 0,
  });
  tickSimulation(state, DT);
  const zone = state.fireZones.find((item) => item.id === 'fuego-chico');
  assert.ok(zone, 'se fusionó con el fuego que había');
  assert.equal(zone.radius, big);
});
