// Las escuadras de infantería: 2 ametralladoras adelante y un RPG atrás, siempre juntos. Salen de la
// niebla, por el centro de ese borde y después por todo él. Valen una vida, lleguen los que lleguen.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createGameConfig,
  createInitialState,
  placeTower,
  startWave,
  tickSimulation,
} from '../src/core/index.js';
import { defaultWaveSetDefinition } from '../src/content/waves/defaultWaveSet.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const TEAMS = GAMEPLAY_CONFIG.infantryTeams;

function newGame(seed = 0) {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  state.combatRandomSeed = seed;
  // Sin cobertura, para medir solo la escuadra.
  state.rocks = [];
  state.trees = [];
  state.bushes = [];
  return state;
}

/** Inicia la oleada `wave` (desde 1) y espera a que salga la primera escuadra. */
function startRealWave(state, wave) {
  state.wave = wave - 1;
  assert.ok(startWave(state));
  for (let step = 0; step < 60 * 20 && !state.enemies.some((enemy) => enemy.teamId); step++) tickSimulation(state, DT);
  return state.enemies.filter((enemy) => enemy.teamId === state.enemies.find((item) => item.teamId).teamId);
}

function forwardOf(rotation) {
  return { x: Math.sin(rotation), z: Math.cos(rotation) };
}

test('las oleadas solo cuentan soldados: quién lleva misil lo decide el nivel. La primera, 3 unidades', () => {
  for (const wave of defaultWaveSetDefinition.waves) assert.ok(!wave.spawns.includes(TEAMS.rear), wave.id);
  assert.equal(defaultWaveSetDefinition.waves[0].spawns.length, 9);
});

test('la unidad sale completa: sin veteranía, 3 ametralladoras', () => {
  const team = startRealWave(newGame(), 1);
  assert.deepEqual(team.map((soldier) => soldier.enemyTypeId), Array(3).fill('infantry-mg'));
});

test('todos los soldados de la primera oleada quedan en escuadras de 3', () => {
  const state = newGame();
  state.wave = 0;
  startWave(state);
  const teams = new Map();
  for (let step = 0; step < 60 * 20 && state.spawnQueue.length; step++) {
    tickSimulation(state, DT);
    for (const soldier of state.enemies) teams.set(soldier.id, soldier.teamId);
  }
  const sizes = {};
  for (const teamId of teams.values()) sizes[teamId] = (sizes[teamId] ?? 0) + 1;
  assert.deepEqual(Object.values(sizes), [3, 3, 3]);
});

/** Fila y columna (con decimales) por donde entra la primera escuadra de la oleada `wave`. */
function entryOf(seed, wave) {
  const state = newGame(seed * 7919);
  const [leader] = startRealWave(state, wave);
  const { halfHeight, halfWidth, worldScale } = state.config;
  return { x: leader.position.x / worldScale + halfWidth, row: Math.floor(leader.position.z / worldScale + halfHeight) };
}

test('en las primeras oleadas salen de la niebla por las filas centrales, al azar', () => {
  const { column, earlyRows: [first, last], openFromWave } = createGameConfig().mapDefinition.infantrySpawn;
  const rows = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const { x, row } = entryOf(seed, openFromWave - 1);
    assert.ok(Math.abs(x - (column + 0.5)) < 0.5, `columna ${x}`);
    assert.ok(row >= first && row <= last, `fila ${row}`);
    rows.add(row);
  }
  assert.equal(rows.size, last - first + 1);
});

test('después salen por cualquier fila del mismo borde, esquinas incluidas, y por ningún otro lado', () => {
  const { column, allRows: [first, last], openFromWave } = createGameConfig().mapDefinition.infantrySpawn;
  const rows = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const { x, row } = entryOf(seed, openFromWave);
    assert.ok(Math.abs(x - (column + 0.5)) < 0.5, `columna ${x}`);
    assert.ok(row >= first && row <= last, `fila ${row}`);
    rows.add(row);
  }
  assert.equal(rows.size, last - first + 1);
});

test('el borde por donde salen está bajo la niebla del territorio enemigo', () => {
  const { column } = createGameConfig().mapDefinition.infantrySpawn;
  assert.ok(column < createGameConfig().mapDefinition.enemyTerritory.columns);
});

test('una misma semilla repite por dónde entran', () => {
  const first = startRealWave(newGame(1234), 5)[0].position;
  const again = startRealWave(newGame(1234), 5)[0].position;
  assert.deepEqual(again, first);
});

test('caminan juntos en triángulo, con el RPG atrás, durante todo el camino', () => {
  const state = newGame();
  const [left, right, rpg] = startRealWave(state, 1);
  const span = (TEAMS.slotSide * 2 + TEAMS.slotBack) * state.config.worldScale;
  let measured = 0;
  for (let step = 0; step < 60 * 25 && left.alive && right.alive && rpg.alive; step++) {
    tickSimulation(state, DT);
    if (step < 120) continue;
    const forward = forwardOf(left.rotation);
    const centerX = (left.position.x + right.position.x) / 2;
    const centerZ = (left.position.z + right.position.z) / 2;
    const ahead = (rpg.position.x - centerX) * forward.x + (rpg.position.z - centerZ) * forward.z;
    assert.ok(ahead < 0, `el RPG va adelante: ${ahead}`);
    assert.ok(Math.hypot(left.position.x - rpg.position.x, left.position.z - rpg.position.z) < span);
    assert.ok(Math.hypot(left.position.x - right.position.x, left.position.z - right.position.z) < span);
    measured += 1;
  }
  assert.ok(measured > 300, `midió ${measured} pasos`);
});

test('la escuadra camina al paso del más lento, incluso si muere él', () => {
  const state = newGame();
  const team = startRealWave(state, 1);
  const { stats: mg } = state.config.enemyDefinitions['infantry-mg'];
  const { stats: rpg } = state.config.enemyDefinitions['infantry-rpg'];
  assert.ok(rpg.speed < mg.speed);
  for (const soldier of team) assert.equal(soldier.speed, team[2].speed);
});

test('si muere quien manda, los demás siguen juntos hacia la base', () => {
  const state = newGame();
  const [leader, other, rpg] = startRealWave(state, 1);
  for (let step = 0; step < 120; step++) tickSimulation(state, DT);
  leader.alive = false;
  const before = other.position.x;
  for (let step = 0; step < 60 * 5; step++) tickSimulation(state, DT);
  assert.ok(other.position.x > before, 'dejó de avanzar');
  const span = (TEAMS.slotSide * 2 + TEAMS.slotBack) * state.config.worldScale;
  assert.ok(Math.hypot(other.position.x - rpg.position.x, other.position.z - rpg.position.z) < span);
});

function playToEnd(state) {
  for (let step = 0; step < 60 * 300 && state.waveActive; step++) tickSimulation(state, DT);
  assert.equal(state.waveActive, false, `quedaron ${state.enemies.length}`);
}

test('una escuadra vale una vida aunque lleguen los tres', () => {
  const state = newGame();
  state.wave = 0;
  startWave(state);
  playToEnd(state);
  assert.equal(state.lives, 1000 - 3);
});

test('si sobrevive uno solo, la escuadra cuesta su vida completa', () => {
  const state = newGame();
  const [leader, other] = startRealWave(state, 1);
  leader.alive = false;
  other.alive = false;
  playToEnd(state);
  assert.equal(state.lives, 1000 - 3);
});

test('si cae entera, no cuesta nada', () => {
  const state = newGame();
  const team = startRealWave(state, 1);
  for (const soldier of team) soldier.alive = false;
  playToEnd(state);
  assert.equal(state.lives, 1000 - 2);
});

test('una torre en el camino detiene a toda la escuadra, y le disparan', () => {
  const state = newGame();
  const team = startRealWave(state, 1);
  // La torre va en la línea que sigue la escuadra hacia la base: por dónde entra lo decide el azar.
  const { halfHeight, halfWidth, pathWorld, worldScale } = state.config;
  const [{ position: from }] = team;
  const base = pathWorld.at(-1);
  const gx = 11;
  const along = ((gx + 0.5 - halfWidth) * worldScale - from.x) / (base.x - from.x);
  const gy = Math.floor((from.z + along * (base.z - from.z)) / worldScale + halfHeight);
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx, gy });
  assert.ok(tower, `hay lugar en la fila ${gy}`);
  const hp = tower.hp;
  team.forEach((soldier) => { soldier.hp = soldier.maxHp = 1e9; });
  for (const other of state.enemies) other.hp = other.maxHp = 1e9;
  let stopped = false;
  for (let step = 0; step < 60 * 60 && !stopped; step++) {
    tickSimulation(state, DT);
    stopped = team.every((soldier) => soldier.blockedBy === tower.id);
    tower.cooldown = 999;
    // Tiene que seguir en pie cuando lleguen: de camino le tiran granadas.
    tower.hp = hp;
    state.spawnQueue.length = 0;
  }
  assert.ok(stopped, 'no se detuvieron todos');
  for (let step = 0; step < 60 * 5; step++) {
    tickSimulation(state, DT);
    tower.cooldown = 999;
  }
  assert.ok(tower.hp < hp, 'no le hacen daño');
});

test('la tripulación forma escuadras: el camión de 6, dos de 3, y cada una vale una vida', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['truck-transport'] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [truck] = state.enemies;
  truck.pathIndex = 3;
  truck.hp = 0.01;
  placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 12, gy: 4 });
  for (let step = 0; step < 60 * 30 && truck.alive; step++) tickSimulation(state, DT);
  assert.equal(truck.alive, false);
  const crew = state.enemies.filter((enemy) => enemy.offRoad);
  assert.equal(crew.length, 6);
  const teams = {};
  for (const soldier of crew) (teams[soldier.teamId] ??= []).push(soldier.enemyTypeId);
  assert.deepEqual(Object.values(teams), [Array(3).fill('infantry-mg'), Array(3).fill('infantry-mg')]);
  state.towers.length = 0;
  playToEnd(state);
  assert.equal(state.lives, 1000 - 2);
});

test('un soldado de una oleada a medida sigue suelto y cuesta su vida', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['infantry-mg', 'infantry-mg'] } });
  playToEnd(state);
  assert.equal(state.lives, 1000 - 2);
});
