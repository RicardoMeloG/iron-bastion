// Las rocas: el soldado pasa encima más lento y sigue disparándole a las torres; en la calle queda
// expuesto y recibe más daño. No se construye sobre una roca sin pagar por sacarla. La cobertura en
// sí está en tests/cover.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearCover,
  consumeEffects,
  createGameConfig,
  createInitialState,
  placeTower,
  resetWave,
  startWave,
  tickSimulation,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const ROCKS = GAMEPLAY_CONFIG.rocks;
const SOLDIERS = ['infantry-mg', 'infantry-rpg'];

function newGame() {
  const state = createInitialState(createGameConfig());
  state.credits = 5000;
  state.lives = 1000;
  return state;
}

function startSoldier(state, enemyTypeId) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  return state.enemies[0];
}

/** Lo deja en el centro de la celda. */
function putOnCell(state, soldier, gx, gy) {
  const { halfWidth, halfHeight, worldScale } = state.config;
  soldier.position.x = (gx + 0.5 - halfWidth) * worldScale;
  soldier.position.z = (gy + 0.5 - halfHeight) * worldScale;
}

/** Un soldado a 1,5 celdas de la roca, del lado contrario a la base: va a pasar por encima. */
function soldierBefore(state, rock, enemyTypeId) {
  const soldier = startSoldier(state, enemyTypeId);
  const base = state.config.pathWorld.at(-1);
  const distance = Math.hypot(base.x - rock.wx, base.z - rock.wz);
  const away = 1.5 * state.config.worldScale;
  soldier.position.x = rock.wx - ((base.x - rock.wx) / distance) * away;
  soldier.position.z = rock.wz - ((base.z - rock.wz) / distance) * away;
  return soldier;
}

function onlyRock(state, rock) {
  for (const other of [...state.rocks, ...state.trees]) if (other !== rock) clearCover(state, other.id);
  state.bushes = [];
}

/** Una celda de pasto sin rocas cerca, para medir sin cobertura ni exposición. */
function grassCell(state) {
  const { baseGrid, halfWidth, halfHeight, worldScale } = state.config;
  for (let gy = 0; gy < baseGrid.length; gy++) {
    for (let gx = 6; gx < baseGrid[0].length; gx++) {
      if (baseGrid[gy][gx] !== 0) continue;
      const x = (gx + 0.5 - halfWidth) * worldScale;
      const z = (gy + 0.5 - halfHeight) * worldScale;
      const cover = [...state.rocks, ...state.trees, ...state.bushes];
      if (cover.every((item) => Math.hypot(item.wx - x, item.wz - z) > 1 * worldScale)) return { gx, gy };
    }
  }
  throw new Error('no hay pasto libre');
}

test('las rocas del mapa ocupan celdas que no son camino ni territorio enemigo, y no dejan construir', () => {
  const state = newGame();
  assert.ok(state.rocks.length > 0);
  for (const rock of state.rocks) {
    assert.equal(state.grid[rock.gy][rock.gx], 4);
    assert.equal(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: rock.gx, gy: rock.gy }), null);
  }
});

test('una roca fuera de una celda libre es un error del mapa', () => {
  const state = newGame();
  const { mapDefinition } = state.config;
  const [x, y] = mapDefinition.pathPoints[1];
  mapDefinition.rocks.push([x, y]);
  try {
    assert.throws(() => createGameConfig(), /no está en una celda libre/);
  } finally {
    mapDefinition.rocks.pop();
  }
});

test('las rocas están en las rutas de la infantería: la que entra pasa por varias', () => {
  const state = newGame();
  const soldier = startSoldier(state, 'infantry-mg');
  let walked = 0;
  let covered = 0;
  while (soldier.alive) {
    tickSimulation(state, DT);
    if (soldier.position.x / state.config.worldScale + state.config.halfWidth < 6) continue;
    walked += DT;
    if (soldier.inCover) covered += DT;
  }
  assert.ok(covered / walked >= 0.2, `${(covered / walked).toFixed(2)} del tiempo a cubierto`);
});

test('sacar una roca cuesta $50 y deja la celda libre para construir', () => {
  const state = newGame();
  const [rock] = state.rocks;
  const before = state.credits;
  assert.equal(ROCKS.clearCost, 50);
  assert.equal(clearCover(state, rock.id), true);
  assert.equal(state.credits, before - 50);
  assert.equal(state.grid[rock.gy][rock.gx], 0);
  assert.ok(!state.rocks.includes(rock));
  assert.ok(consumeEffects(state).some((effect) => effect.type === 'cover-removed' && effect.kind === 'rock' && effect.cost === 50));
  assert.ok(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: rock.gx, gy: rock.gy }));
});

test('sin créditos, la roca se queda', () => {
  const state = newGame();
  const [rock] = state.rocks;
  state.credits = 49;
  assert.equal(clearCover(state, rock.id), false);
  assert.equal(state.credits, 49);
  assert.equal(state.grid[rock.gy][rock.gx], 4);
  assert.ok(state.rocks.includes(rock));
});

test('reintentar la oleada devuelve la roca sacada en ella y sus créditos', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 1, spawns: ['patrulla'] } });
  const [rock] = state.rocks;
  const before = state.credits;
  clearCover(state, rock.id);
  resetWave(state);
  assert.equal(state.credits, before);
  assert.equal(state.grid[rock.gy][rock.gx], 4);
  assert.ok(state.rocks.some((item) => item.id === rock.id));
});

// De donde sea que venga: una roca nunca lo detiene, y la oleada siempre termina.
for (const enemyTypeId of SOLDIERS) {
  test(`${enemyTypeId} pasa por encima de cualquier roca, desde cualquier ángulo, sin detenerse ni dañarla`, () => {
    for (const cell of createGameConfig().mapDefinition.rocks) {
      for (let turn = 0; turn < 8; turn++) {
        const state = newGame();
        const rock = state.rocks.find((item) => item.id === `rock-${cell[0]}-${cell[1]}`);
        onlyRock(state, rock);
        const soldier = soldierBefore(state, rock, enemyTypeId);
        const angle = (turn / 8) * Math.PI * 2;
        soldier.position.x = rock.wx + Math.cos(angle) * 0.8 * state.config.worldScale;
        soldier.position.z = rock.wz + Math.sin(angle) * 0.8 * state.config.worldScale;
        for (let step = 0; step < 60 * 120 && state.waveActive; step++) {
          tickSimulation(state, DT);
          assert.equal(soldier.blockedBy, null);
        }
        assert.equal(state.waveActive, false, `quedó trabado junto a la roca de (${cell})`);
        assert.ok(state.rocks.includes(rock), 'la roca sigue ahí');
      }
    }
  });
}

test('sobre una roca camina más lento y sube; al bajar vuelve a lo normal', () => {
  const state = newGame();
  const rock = state.rocks[0];
  onlyRock(state, rock);
  const soldier = soldierBefore(state, rock, 'infantry-mg');
  const distanceWalked = () => {
    const before = { ...soldier.position };
    tickSimulation(state, DT);
    return Math.hypot(soldier.position.x - before.x, soldier.position.z - before.z);
  };

  const groundStep = distanceWalked();
  const groundY = soldier.position.y;
  for (let step = 0; step < 60 * 10 && !soldier.inCover; step++) tickSimulation(state, DT);
  assert.ok(Math.abs(distanceWalked() / groundStep - ROCKS.coverSpeed) < 0.05, 'va más lento');
  for (let step = 0; step < 30; step++) tickSimulation(state, DT);
  assert.ok(soldier.position.y > groundY, 'sube a la roca');

  for (let step = 0; step < 60 * 20 && soldier.inCover; step++) tickSimulation(state, DT);
  tickSimulation(state, DT);
  assert.equal(soldier.inCover, false);
});

test('desde la roca le dispara a la torre, no a la roca', () => {
  const state = newGame();
  const rock = state.rocks[0];
  onlyRock(state, rock);
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: rock.gx, gy: rock.gy + 2 });
  assert.ok(tower);
  const soldier = startSoldier(state, 'infantry-mg');
  soldier.position.x = rock.wx;
  soldier.position.z = rock.wz;
  soldier.speed = 0;
  const hp = tower.hp;
  for (let step = 0; step < 60 * 5; step++) {
    tower.cooldown = 999;
    tickSimulation(state, DT);
  }
  assert.equal(soldier.inCover, true);
  assert.equal(soldier.targetTowerId, tower.id);
  assert.ok(tower.hp < hp, 'le hace daño');
  assert.ok(state.rocks.includes(rock));
});

test('en la calle, sin cobertura, un disparo de la MG-7 lo mata', () => {
  const state = newGame();
  for (const item of [...state.rocks, ...state.trees]) clearCover(state, item.id);
  state.bushes = [];
  placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 12, gy: 4 });
  const soldier = startSoldier(state, 'infantry-mg');
  const { hp } = soldier;
  soldier.speed = 0;
  // (13, 4) es del tramo vertical del camino.
  putOnCell(state, soldier, 13, 4);
  assert.equal(state.config.baseGrid[4][13], 1);
  let hit = null;
  for (let step = 0; step < 60 * 5 && !hit; step++) {
    tickSimulation(state, DT);
    hit = consumeEffects(state).find((effect) => effect.type === 'hit') ?? null;
  }
  assert.ok(hit, 'la torre le acierta');
  assert.equal(soldier.exposed, true);
  assert.equal(hit.exposed, true);
  assert.equal(hit.damage, hp);
  assert.equal(soldier.alive, false);
});

test('en el pasto tiene el nivel 1: no está expuesto como en la calle, pero tampoco a cubierto', () => {
  const state = newGame();
  const { gx, gy } = grassCell(state);
  const soldier = startSoldier(state, 'infantry-mg');
  putOnCell(state, soldier, gx, gy);
  tickSimulation(state, DT);
  assert.equal(soldier.inCover, false);
  assert.equal(soldier.exposed, false);
  assert.equal(soldier.coverLevel, 1);
  assert.equal(soldier.armor, enemyDefinitions['infantry-mg'].stats.armor);
  // Cuerpo a tierra suma un nivel.
  soldier.proneSeconds = 10;
  tickSimulation(state, DT);
  assert.equal(soldier.coverLevel, 2);
});

/**
 * Un soldado quieto en una celda de pasto y una torre al lado que le dispara: cada vez que la bala o
 * el misil llega, se anota si lo esquivó o si murió, y se pone otro soldado. Sin cobertura cerca.
 */
function shotsOnGrass(towerTypeId, count) {
  const state = newGame();
  state.credits = 1e6;
  for (const item of [...state.rocks, ...state.trees]) clearCover(state, item.id);
  state.bushes = [];
  const { gx, gy } = grassCell(state);
  const tower = placeTower(state, { towerTypeId, gx: gx + 2, gy });
  // Salen todos de una vez y se usan de a uno: los demás esperan fuera de la lista.
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: Array(count).fill('infantry-mg') } });
  for (let step = 0; step < 60 * 10 && state.spawnQueue.length; step++) tickSimulation(state, DT);
  const soldiers = [...state.enemies];
  let deflected = 0;
  let killed = 0;
  for (const soldier of soldiers) {
    state.enemies = [soldier];
    soldier.speed = 0;
    soldier.isArmed = false;
    let done = false;
    for (let step = 0; step < 60 * 20 && !done; step++) {
      putOnCell(state, soldier, gx, gy);
      tower.hp = tower.maxHp;
      tickSimulation(state, DT);
      for (const effect of consumeEffects(state)) {
        if (effect.enemyId !== soldier.id) continue;
        if (effect.type === 'shot-deflected') { deflected += 1; done = true; }
        if (effect.type === 'hit') { if (soldier.hp <= 0) killed += 1; done = true; }
      }
    }
  }
  return { deflected, killed };
}

test('en el pasto esquiva algunas balas, y si le pegan muere de un disparo', () => {
  const SHOTS = 150;
  const { deflected, killed } = shotsOnGrass('mg7-vulcan', SHOTS);
  const { grassDeflect } = GAMEPLAY_CONFIG.infantryCombat;
  assert.ok(Math.abs(deflected / SHOTS - grassDeflect) < 0.08, `${deflected} de ${SHOTS} esquivadas`);
  assert.equal(deflected + killed, SHOTS, 'la bala que no esquiva lo mata');
});

test('en el pasto no esquiva misiles', () => {
  const { deflected, killed } = shotsOnGrass('lm2-lanza', 12);
  assert.equal(deflected, 0);
  assert.equal(killed, 12);
});

test('la cobertura es de los soldados: una moto en la calle recibe el daño normal', () => {
  const state = newGame();
  placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['moto-recon'] } });
  let hit = null;
  for (let step = 0; step < 60 * 30 && !hit; step++) {
    tickSimulation(state, DT);
    hit = consumeEffects(state).find((effect) => effect.type === 'hit') ?? null;
  }
  assert.ok(hit, 'la torre le acierta');
  assert.equal(hit.exposed, false);
  const mgDamage = state.config.towerDefinitions['mg7-vulcan'].levels[0].damage;
  assert.equal(hit.damage, mgDamage - enemyDefinitions['moto-recon'].stats.armor);
});

test('los vehículos no se detienen por las rocas', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['moto-recon'] } });
  const rocks = state.rocks.length;
  for (let step = 0; step < 60 * 40 && state.waveActive; step++) tickSimulation(state, DT);
  assert.ok(state.lives < 1000, 'la moto llega a la base');
  assert.equal(state.rocks.length, rocks);
});
