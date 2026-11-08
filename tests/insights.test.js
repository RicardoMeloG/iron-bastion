import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeEffects, createGameConfig, createInitialState, estimateTowerEffectiveness, placeTower, selectTargets, startWave, summarizeWave, tickSimulation } from '../src/core/index.js';
import { defaultWaveSetDefinition } from '../src/content/waves/defaultWaveSet.js';
import { enemyDefinitions as GAME_ENEMIES } from '../src/content/enemies/index.js';

test('el resumen de la oleada cuenta los tipos, suma la recompensa y pone primero a los más blindados', () => {
  const { enemyDefinitions } = createGameConfig();
  const spawns = ['patrulla', 'tank-heavy', 'patrulla', 'apc-8x8'];
  const summary = summarizeWave(spawns, enemyDefinitions);

  assert.equal(summary.total, 4);
  assert.equal(summary.reward, spawns.reduce((sum, id) => sum + enemyDefinitions[id].stats.reward, 0));
  assert.deepEqual(summary.rows.map((row) => [row.id, row.count]), [['tank-heavy', 1], ['apc-8x8', 1], ['patrulla', 2]]);
});

test('el resumen cuenta a los soldados por unidad, y el total sigue siendo de soldados', () => {
  const { enemyDefinitions } = createGameConfig();
  const summary = summarizeWave([...Array(54).fill('infantry-mg'), 'patrulla'], enemyDefinitions);
  assert.equal(summary.total, 55);
  const soldiers = summary.rows.find((row) => row.id === 'infantry-mg');
  assert.equal(soldiers.count, 18);
  assert.equal(soldiers.name, 'Unidades de soldados');
  assert.equal(summarizeWave(Array(3).fill('infantry-mg'), enemyDefinitions).rows[0].name, 'Unidad de soldados');
});

test('la efectividad cuenta la munición y la armadura: la LM-2 castiga tanques y la MG-7 casi no les hace nada', () => {
  const { enemyDefinitions, towerDefinitions } = createGameConfig();
  const lm2 = estimateTowerEffectiveness(towerDefinitions['lm2-lanza'], 0, enemyDefinitions);
  assert.ok(lm2.heavy > 0, `LM-2 contra pesados: ${lm2.heavy}`);
  assert.ok(lm2.light < -0.5, `LM-2 contra ligeros: ${lm2.light}`);

  const mg7 = estimateTowerEffectiveness(towerDefinitions['mg7-vulcan'], 4, enemyDefinitions);
  assert.equal(mg7.heavy, (28 * 0.5 - 12) / 28 - 1);
  assert.ok(mg7.light > mg7.medium && mg7.medium > mg7.heavy);
});

test('la MG-7 de nivel 1 no le hace daño a un tanque, y así lo anuncia', () => {
  const { enemyDefinitions, towerDefinitions } = createGameConfig();
  assert.equal(estimateTowerEffectiveness(towerDefinitions['mg7-vulcan'], 0, enemyDefinitions).heavy, -1);
});

test('en territorio enemigo no se construye, y ninguna torre alcanza el punto de aparición', () => {
  const config = createGameConfig();
  const state = createInitialState(config);
  state.credits = 99999;
  const { enemyTerritory, pathPoints } = config.mapDefinition;
  const [spawnX, spawnY] = pathPoints[0];

  assert.equal(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: enemyTerritory.columns - 1, gy: 9 }), null);
  assert.ok(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: enemyTerritory.columns, gy: 9 }));

  // La antiaérea no le dispara a nada que vaya por tierra: su alcance no cuenta.
  const groundTowers = Object.values(config.towerDefinitions).filter((tower) => tower.combatModel.targets?.ground !== false);
  const maxRange = Math.max(...groundTowers.flatMap((tower) => tower.levels.map((level) => level.range)));
  config.baseGrid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell === 0) assert.ok(Math.hypot(x - spawnX, y - spawnY) > maxRange, `la celda ${x},${y} alcanza la entrada`);
  }));
});

test('la masa crece hasta la oleada 18; el cierre cambia soldados a pie por vehículos y drones', () => {
  const { waves } = defaultWaveSetDefinition;
  const total = (wave) => wave.spawns.reduce((sum, id) => sum + 1 + (GAME_ENEMIES[id].dismount?.length ?? 0), 0);
  assert.deepEqual(waves.map(total), [9, 12, 18, 25, 34, 41, 55, 62, 65, 77, 80, 82, 89, 97, 111, 129, 148, 168, 162, 154]);
  const heavy = (wave) => wave.spawns.filter((id) => !id.startsWith('infantry-')).length;
  assert.ok(heavy(waves[18]) > heavy(waves[17]) && heavy(waves[19]) > heavy(waves[18]), 'la 19 y la 20 traen cada vez más vehículos y drones');
  const tanks = (wave) => wave.spawns.filter((id) => id === 'tank-heavy').length;
  assert.equal(Math.max(...waves.map(tanks)), tanks(waves[19]), 'la última trae la mayor cantidad de tanques');
});

test('todas las oleadas traen soldados a pie', () => {
  for (const wave of defaultWaveSetDefinition.waves) {
    assert.ok(wave.spawns.some((id) => id.startsWith('infantry-')), wave.id);
  }
});

test('cada oleada suma algo: infantería, motos, vehículos, blindados y tanques', () => {
  const { waves } = defaultWaveSetDefinition;
  const firstWaveWith = (id) => waves.findIndex((wave) => wave.spawns.includes(id)) + 1;
  assert.deepEqual([...new Set(waves[0].spawns)].sort(), ['infantry-mg'], 'la primera oleada es solo infantería con fusil');
  assert.deepEqual([
    'infantry-mg', 'moto-recon', 'patrulla', 'truck-transport', 'apc-8x8', 'tank-heavy',
  ].map(firstWaveWith), [1, 3, 4, 5, 8, 10]);
  assert.equal(firstWaveWith('dron-fpv'), 7, 'los drones empiezan en la 7');
  // Desde que aparecen, las motos están en todas.
  for (const wave of waves.slice(2)) assert.ok(wave.spawns.includes('moto-recon'), wave.id);
  // Lo que hay que destruir (la vida que traen) nunca baja, salvo donde cambia la amenaza: la 9 y la 11
  // traen menos blindados a cambio de otra cosa (tanques y drones), y la 11 empieza a sumar vida a todos.
  const toughness = waves.map((wave) => wave.spawns.reduce((sum, id) => sum + GAME_ENEMIES[id].stats.hp, 0));
  toughness.slice(1).forEach((value, index) => {
    if (index + 2 === 9 || index + 2 === 10 || index + 2 === 11) return;
    assert.ok(value > toughness[index], `oleada ${index + 2}: ${value} contra ${toughness[index]}`);
  });
});

test('los tanques entran separados, y mientras tanto pasan los demás', () => {
  const state = createInitialState(createGameConfig());
  state.lives = 1000;
  const gap = state.config.enemyDefinitions['tank-heavy'].spawnGapSeconds;
  startWave(state, { overrideWaveDefinition: { interval: 0.5, spawns: ['tank-heavy', 'tank-heavy', 'patrulla', 'tank-heavy'] } });
  const spawned = [];
  for (let t = 0; t < 30 && state.spawnQueue.length > 0; t += 1 / 60) {
    tickSimulation(state, 1 / 60);
    for (const effect of consumeEffects(state)) if (effect.type === 'enemy-spawned') spawned.push({ id: effect.enemyTypeId, t });
  }
  assert.equal(spawned[1].id, 'patrulla', 'la patrulla no espera al segundo tanque');
  const tanks = spawned.filter((item) => item.id === 'tank-heavy');
  assert.equal(tanks.length, 3);
  for (let i = 1; i < tanks.length; i++) assert.ok(tanks[i].t - tanks[i - 1].t >= gap - 0.05, `separados ${tanks[i].t - tanks[i - 1].t} s`);
});

test('el HE del tanque alcanza a las torres vecinas con menos daño, y no a las lejanas', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 100000;
  state.lives = 1000;
  const hit = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 11, gy: 4 });
  const neighbor = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 12, gy: 4 });
  const far = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 15, gy: 4 });
  const { worldScale } = state.config;
  const { blast, damage } = state.config.enemyDefinitions['tank-heavy'].combatModel.weaponProfile;
  state.projectiles.push({
    targetType: 'tower', targetId: hit.id, sourceId: 'enemy-1',
    x: hit.wx, y: state.config.pathSurfaceY + worldScale * 0.24, z: hit.wz, vx: 0, vy: 0, vz: 0,
    speed: 0, hitThreshold: worldScale, maxDistance: 100 * worldScale,
    damage, damageType: 'piercing', blastRadius: blast.radius * worldScale, blastFraction: blast.fraction, alive: true,
  });
  tickSimulation(state, 1 / 60);
  assert.ok(hit.hp < hit.maxHp, 'la torre impactada recibe daño');
  assert.ok(neighbor.hp < neighbor.maxHp, 'la vecina también');
  assert.ok(hit.maxHp - hit.hp > neighbor.maxHp - neighbor.hp, 'la vecina recibe menos');
  assert.equal(far.hp, far.maxHp, 'la lejana no');
});

test('la MG-7 prefiere un vehículo que pueda dañar a un tanque más cercano', () => {
  const state = createInitialState(createGameConfig());
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 11, gy: 4 });
  const near = { x: tower.wx + state.config.worldScale * 0.5, y: 0, z: tower.wz };
  const far = { x: tower.wx + state.config.worldScale * 2, y: 0, z: tower.wz };
  state.enemies = [
    { id: 'tank', alive: true, armorClass: 'heavy', armor: 12, position: near },
    { id: 'patrulla', alive: true, armorClass: 'light', armor: 2, position: far },
  ];
  selectTargets(state);
  assert.equal(tower.targetEnemyId, 'patrulla');
  state.enemies = [state.enemies[0]];
  selectTargets(state);
  assert.equal(tower.targetEnemyId, 'tank', 'si no hay otro, sigue apuntando al tanque');
});
