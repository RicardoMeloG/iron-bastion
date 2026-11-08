// La cobertura: cada disparo a quien se cubre, también un misil, tiene una probabilidad de pegarle a
// ella y no al soldado. Roca, árbol y arbusto reciben ese daño según su blindaje y caen; los soldados
// los buscan mientras avanzan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { resolveDamage } from '../src/core/simulation.js';

const DT = 1 / 60;
const MG7 = 'mg7-vulcan';
const LM2 = 'lm2-lanza';
const RULES = { rock: GAMEPLAY_CONFIG.rocks, tree: GAMEPLAY_CONFIG.trees, bush: GAMEPLAY_CONFIG.bushes };
const KINDS = [['rock', 'rocks'], ['tree', 'trees'], ['bush', 'bushes']];

function newGame() {
  const state = createInitialState(createGameConfig());
  state.credits = 5000;
  state.lives = 1000;
  return state;
}

function startSoldier(state, spawns = ['infantry-mg']) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  return state.enemies[0];
}

/** Sin otra cobertura en el mapa, para medir solo esta. */
function onlyCover(state, cover) {
  state.rocks = state.rocks.filter((item) => item === cover);
  state.trees = state.trees.filter((item) => item === cover);
  state.bushes = state.bushes.filter((item) => item === cover);
}

function soldierOn(state, cover) {
  onlyCover(state, cover);
  const soldier = startSoldier(state);
  soldier.speed = 0;
  soldier.hp = soldier.maxHp = 1e9;
  soldier.position.x = cover.wx;
  soldier.position.z = cover.wz;
  tickSimulation(state, DT);
  return soldier;
}

/** Una torre en la primera celda libre junto a la cobertura, que no se destruye. */
function towerNextTo(state, cover, towerTypeId = MG7) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const tower = placeTower(state, { towerTypeId, gx: cover.gx + dx, gy: cover.gy + dy });
    if (tower) {
      tower.hp = tower.maxHp = 1e9;
      return tower;
    }
  }
  throw new Error('no hay celda libre junto a la cobertura');
}

function withChance(kind, chance, run) {
  const before = RULES[kind].absorbChance;
  RULES[kind].absorbChance = chance;
  try {
    run();
  } finally {
    RULES[kind].absorbChance = before;
  }
}

/** Avanza hasta el primer efecto de ese tipo. */
function firstEffect(state, type, seconds = 30) {
  for (let step = 0; step < 60 * seconds; step++) {
    tickSimulation(state, DT);
    const found = consumeEffects(state).find((effect) => effect.type === type);
    if (found) return found;
  }
  return null;
}

test('árboles y rocas ocupan su celda; el arbusto la deja libre, y una torre lo aplasta', () => {
  const state = newGame();
  assert.ok(state.trees.length >= 10);
  assert.ok(state.bushes.length >= 10);
  for (const tree of state.trees) {
    assert.equal(state.grid[tree.gy][tree.gx], 4);
    assert.equal(placeTower(state, { towerTypeId: MG7, gx: tree.gx, gy: tree.gy }), null);
  }
  const [bush] = state.bushes;
  assert.equal(state.grid[bush.gy][bush.gx], 0);
  consumeEffects(state);
  assert.ok(placeTower(state, { towerTypeId: MG7, gx: bush.gx, gy: bush.gy }));
  assert.ok(!state.bushes.includes(bush));
  assert.ok(consumeEffects(state).some((effect) => effect.type === 'cover-removed' && effect.kind === 'bush'));
});

for (const list of ['trees', 'bushes']) {
  test(`${list}: fuera de una celda libre es un error del mapa`, () => {
    const { mapDefinition } = newGame().config;
    const [x, y] = mapDefinition.pathPoints[1];
    mapDefinition[list].push([x, y]);
    try {
      assert.throws(() => createGameConfig(), /no está en una celda libre/);
    } finally {
      mapDefinition[list].pop();
    }
  });
}

test('ningún árbol quita una celda de la partida de referencia, que mide el balance', () => {
  const { compras } = JSON.parse(readFileSync(new URL('../tools/balance/reference-game.json', import.meta.url), 'utf8'));
  const used = new Set(compras.filter((buy) => buy[0] === 'torre').map((buy) => `${buy[3]},${buy[4]}`));
  for (const tree of newGame().trees) assert.ok(!used.has(`${tree.gx},${tree.gy}`), tree.id);
});

test('la roca protege más que el árbol, y el árbol más que el arbusto, en vida y en probabilidad', () => {
  const { rocks, trees, bushes } = GAMEPLAY_CONFIG;
  assert.ok(rocks.absorbChance > trees.absorbChance && trees.absorbChance > bushes.absorbChance);
  assert.ok(rocks.maxHp > trees.maxHp && trees.maxHp > bushes.maxHp);
  assert.deepEqual([rocks.armorClass, trees.armorClass, bushes.armorClass], ['heavy', 'medium', 'light']);
});

for (const [kind, list] of KINDS) {
  test(`${kind}: da cobertura sin cambiar la armadura del soldado, y frena según su tipo`, () => {
    const state = newGame();
    const cover = state[list][0];
    onlyCover(state, cover);
    const soldier = startSoldier(state);
    soldier.position.x = cover.wx;
    soldier.position.z = cover.wz;
    tickSimulation(state, DT);
    assert.equal(soldier.coverId, cover.id);
    assert.equal(soldier.inCover, true);
    assert.equal(soldier.exposed, false);
    assert.equal(soldier.armor, enemyDefinitions['infantry-mg'].stats.armor);
    const before = { x: soldier.position.x, z: soldier.position.z };
    tickSimulation(state, DT);
    const walked = Math.hypot(soldier.position.x - before.x, soldier.position.z - before.z);
    assert.ok(Math.abs(walked - soldier.speed * RULES[kind].coverSpeed * DT) < 1e-6, `avanzó ${walked}`);
  });

  test(`${kind}: el disparo que absorbe no le hace nada al soldado, y a ella según su blindaje`, () => {
    withChance(kind, 1, () => {
      const state = newGame();
      const cover = state[list][0];
      const soldier = soldierOn(state, cover);
      towerNextTo(state, cover);
      consumeEffects(state);
      const hit = firstEffect(state, 'cover-hit');
      assert.ok(hit, 'la cobertura no recibió el disparo');
      const expected = resolveDamage(hit.rawDamage, hit.damageType, RULES[kind].armorClass, RULES[kind].armor);
      assert.equal(hit.kind, kind);
      assert.equal(hit.damage, expected);
      assert.equal(soldier.hp, 1e9);
    });
  });

  test(`${kind}: el disparo que no absorbe le pega al soldado, no a ella`, () => {
    withChance(kind, 0, () => {
      const state = newGame();
      const cover = state[list][0];
      const soldier = soldierOn(state, cover);
      towerNextTo(state, cover);
      assert.ok(firstEffect(state, 'hit'), 'el soldado no recibió el disparo');
      assert.ok(soldier.hp < 1e9);
      assert.equal(cover.hp, cover.maxHp);
    });
  });

  test(`${kind}: con la vida en cero cae, avisa y deja de cubrir`, () => {
    withChance(kind, 1, () => {
      const state = newGame();
      const cover = state[list][0];
      const soldier = soldierOn(state, cover);
      towerNextTo(state, cover, LM2);
      cover.hp = 0.1;
      consumeEffects(state);
      const removed = firstEffect(state, 'cover-removed');
      assert.ok(removed, 'no cayó');
      assert.deepEqual([removed.coverId, removed.kind, removed.cost], [cover.id, kind, 0]);
      assert.ok(!state[list].includes(cover));
      assert.equal(state.grid[cover.gy][cover.gx], 0);
      tickSimulation(state, DT);
      assert.equal(soldier.coverId, null);
      assert.equal(soldier.inCover, false);
    });
  });
}

test('la ametralladora casi no daña una roca: solo la Gatling, y poco; un misil sí', () => {
  const { armorClass, armor, maxHp } = GAMEPLAY_CONFIG.rocks;
  const { levels: mg, combatModel: mgModel } = createGameConfig().towerDefinitions[MG7];
  const { levels: lm, combatModel: lmModel } = createGameConfig().towerDefinitions[LM2];
  const onRock = (damage, type) => resolveDamage(damage, type, armorClass, armor);
  mg.slice(0, -1).forEach((level, index) => assert.equal(onRock(level.damage, mgModel.damageType), 0, `nivel ${index + 1}`));
  assert.ok(onRock(mg.at(-1).damage, mgModel.damageType) / maxHp < 0.01);
  assert.ok(onRock(lm[0].damage, lmModel.damageType) / maxHp > 0.2);
});

test('un misil también puede pegarle a la cobertura', () => {
  withChance('rock', 1, () => {
    const state = newGame();
    const rock = state.rocks[0];
    const soldier = soldierOn(state, rock);
    towerNextTo(state, rock, LM2);
    consumeEffects(state);
    const hit = firstEffect(state, 'cover-hit', 60);
    assert.ok(hit, 'el misil no le pegó a la roca');
    assert.equal(hit.damageType, 'shaped-charge');
    assert.ok(hit.impactBlast > 0, 'explota al pegar');
    assert.ok(rock.hp < rock.maxHp);
    assert.equal(soldier.hp, 1e9);
  });
});

test('reintentar la oleada devuelve lo caído, con la vida que tenía al empezarla', () => {
  const state = newGame();
  const [rock] = state.rocks;
  const [tree] = state.trees;
  const [bush] = state.bushes;
  rock.hp = 200;
  startWave(state, { overrideWaveDefinition: { interval: 1, spawns: ['infantry-mg'] } });
  clearCover(state, tree.id);
  placeTower(state, { towerTypeId: MG7, gx: bush.gx, gy: bush.gy });
  state.rocks.find((item) => item.id === rock.id).hp = 5;
  resetWave(state);
  assert.equal(state.rocks.find((item) => item.id === rock.id).hp, 200);
  assert.equal(state.trees.find((item) => item.id === tree.id).hp, tree.maxHp);
  assert.ok(state.bushes.some((item) => item.id === bush.id));
  assert.equal(state.grid[tree.gy][tree.gx], 4);
  assert.equal(state.grid[bush.gy][bush.gx], 0);
});

test('sacar un árbol cuesta lo suyo y deja la celda libre; sin créditos, se queda; el arbusto no se saca', () => {
  const state = newGame();
  const [first, second] = state.trees;
  const before = state.credits;
  assert.equal(clearCover(state, first.id), true);
  assert.equal(state.credits, before - RULES.tree.clearCost);
  assert.equal(state.grid[first.gy][first.gx], 0);
  assert.ok(consumeEffects(state).some((effect) => effect.type === 'cover-removed' && effect.cost === RULES.tree.clearCost));
  assert.equal(clearCover(state, state.bushes[0].id), false);
  state.credits = RULES.tree.clearCost - 1;
  assert.equal(clearCover(state, second.id), false);
  assert.equal(state.grid[second.gy][second.gx], 4);
});

test('el soldado se desvía a la cobertura cercana que queda de camino, y sigue hacia la base', () => {
  const state = newGame();
  const tree = state.trees.find((item) => item.id === 'tree-15-5');
  onlyCover(state, tree);
  const soldier = startSoldier(state);
  const { worldScale } = state.config;
  // A 1,5 celdas del árbol, hacia un costado y antes de llegar a él.
  soldier.position.x = tree.wx - 1 * worldScale;
  soldier.position.z = tree.wz + 1.1 * worldScale;
  soldier.coverDetour = worldScale;
  let covered = false;
  for (let step = 0; step < 60 * 60 && soldier.alive; step++) {
    tickSimulation(state, DT);
    if (soldier.coverId === tree.id) covered = true;
  }
  assert.ok(covered, 'no pasó por el árbol');
  assert.ok(soldier.usedCover.includes(tree.id));
  assert.ok(state.lives < 1000, 'no llegó a la base');
});

test('no se desvía más de lo que acepta: sin margen, sigue derecho', () => {
  const state = newGame();
  const tree = state.trees.find((item) => item.id === 'tree-15-5');
  onlyCover(state, tree);
  const soldier = startSoldier(state);
  const { worldScale } = state.config;
  soldier.position.x = tree.wx - 1 * worldScale;
  soldier.position.z = tree.wz + 1.1 * worldScale;
  soldier.coverDetour = 0;
  tickSimulation(state, DT);
  assert.equal(soldier.coverGoalId, null);
});

test('cada soldado acepta un desvío distinto, dentro del máximo', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: Array(6).fill('infantry-mg') } });
  for (let step = 0; step < 60 && state.enemies.length < 6; step++) tickSimulation(state, DT);
  const detours = state.enemies.map((soldier) => soldier.coverDetour);
  assert.equal(new Set(detours).size, detours.length);
  const most = GAMEPLAY_CONFIG.coverSeek.maxDetour * state.config.worldScale;
  assert.ok(detours.every((detour) => detour >= 0 && detour <= most), `${detours}`);
});

test('no vuelve atrás por una cobertura que ya pasó', () => {
  const state = newGame();
  const tree = state.trees.find((item) => item.id === 'tree-15-5');
  onlyCover(state, tree);
  const soldier = startSoldier(state);
  const base = state.config.pathWorld.at(-1);
  // Del lado de la base, a una celda del árbol.
  const away = Math.hypot(base.x - tree.wx, base.z - tree.wz);
  soldier.position.x = tree.wx + ((base.x - tree.wx) / away) * state.config.worldScale;
  soldier.position.z = tree.wz + ((base.z - tree.wz) / away) * state.config.worldScale;
  soldier.coverDetour = state.config.worldScale * 10;
  tickSimulation(state, DT);
  assert.equal(soldier.coverGoalId, null);
});

test('si muchos van a la misma cobertura no se traban: todos llegan a la base', () => {
  const state = newGame();
  const rock = state.rocks[0];
  onlyCover(state, rock);
  startWave(state, { overrideWaveDefinition: { interval: 0.05, spawns: Array(30).fill('infantry-mg') } });
  for (let step = 0; step < 30; step++) tickSimulation(state, DT);
  const { worldScale } = state.config;
  for (let step = 0; step < 60 * 180 && state.waveActive; step++) {
    for (const soldier of state.enemies) {
      if (soldier.placed) continue;
      soldier.placed = true;
      soldier.position.x = rock.wx - 1 * worldScale;
      soldier.position.z = rock.wz;
    }
    tickSimulation(state, DT);
  }
  assert.equal(state.waveActive, false, `quedaron ${state.enemies.length}`);
});

test('la cobertura es de los soldados: un vehículo no la busca ni la usa', () => {
  const state = newGame();
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['moto-recon'] } });
  for (let step = 0; step < 60; step++) tickSimulation(state, DT);
  const [moto] = state.enemies;
  for (let step = 0; step < 60 * 5 && moto.alive; step++) {
    tickSimulation(state, DT);
    assert.equal(moto.inCover, false);
    assert.equal(moto.coverId, null);
  }
});
