// Los soldados en combate: un disparo basta sin cobertura, el suelo protege a la unidad, y lanzan granadas.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeEffects,
  createGameConfig,
  createInitialState,
  placeTower,
  startWave,
  tickSimulation,
  upgradeTower,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const { coverDamage, grenade, kneel, prone } = GAMEPLAY_CONFIG.infantryCombat;

function newGame() {
  const state = createInitialState(createGameConfig());
  state.credits = 1e6;
  state.lives = 1000;
  state.rocks = [];
  state.trees = [];
  state.bushes = [];
  return state;
}

function launchUnit(state, veterancy) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: Array(3).fill('infantry-mg'), veterancy, infantryTeams: true } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  return [...state.enemies];
}

/** Una MG-7 grande le pega al soldado que esté más cerca, y devuelve el primer impacto. */
function firstHit(state, unit) {
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
  assert.ok(tower, 'hay lugar para la torre');
  unit.forEach((soldier, index) => {
    soldier.position.x = tower.wx - 2 * state.config.worldScale;
    soldier.position.z = tower.wz + index * 0.3 * state.config.worldScale;
  });
  for (let level = 0; level < 2; level++) upgradeTower(state, tower.id);
  for (let step = 0; step < 60 * 30; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    const hit = consumeEffects(state).find((effect) => effect.type === 'hit');
    if (hit) return { hit, tower };
  }
  throw new Error('no le pegó');
}

test('sin cobertura, un soldado muere de un solo disparo', () => {
  const state = newGame();
  const unit = launchUnit(state, 0);
  const { hit } = firstHit(state, unit);
  const soldier = unit.find((item) => item.id === hit.enemyId);
  assert.equal(soldier.alive, false);
  assert.equal(hit.damage, enemyDefinitions['infantry-mg'].stats.hp);
});

test('sin veteranía, los que quedan siguen de pie', () => {
  const state = newGame();
  const unit = launchUnit(state, 0);
  const { hit } = firstHit(state, unit);
  for (const soldier of unit.filter((item) => item.id !== hit.enemyId)) assert.ok(!(soldier.proneSeconds > 0));
});

for (const level of [1, 2, 3]) {
  test(`desde el nivel 1: el primer disparo tira al suelo a toda la unidad (nivel ${level})`, () => {
    const state = newGame();
    const unit = launchUnit(state, level);
    assert.ok(unit.every((soldier) => !(soldier.proneSeconds > 0)), 'antes, de pie');
    firstHit(state, unit);
    for (const soldier of unit) assert.ok(soldier.proneSeconds > 0, soldier.id);
  });
}

test('cuerpo a tierra, un soldado entero no muere de un disparo', () => {
  const state = newGame();
  const unit = launchUnit(state, 1);
  for (const soldier of unit) soldier.proneSeconds = 60;
  const { hit } = firstHit(state, unit);
  const soldier = unit.find((item) => item.id === hit.enemyId);
  assert.equal(soldier.alive, true);
  assert.ok(soldier.hp >= 1);
  assert.equal(hit.exposed, false);
});

test('cuatro niveles: en la calle y el pasto un disparo lo mata; tras una cobertura, recibe menos daño', () => {
  assert.equal(coverDamage.length, 4);
  assert.equal(coverDamage[0], null);
  assert.equal(coverDamage[1], null);
  assert.ok(coverDamage[2] < 1 && coverDamage[3] <= coverDamage[2]);
});

test('tirado se arrastra más lento, y después se levanta', () => {
  const state = newGame();
  const [leader, ...rest] = launchUnit(state, 1);
  const walked = (seconds) => {
    const from = { ...leader.position };
    for (let step = 0; step < 60 * seconds; step++) tickSimulation(state, DT);
    return Math.hypot(leader.position.x - from.x, leader.position.z - from.z);
  };
  const standing = walked(1);
  for (const soldier of [leader, ...rest]) soldier.proneSeconds = prone.seconds;
  const crawling = walked(1);
  assert.ok(Math.abs(crawling / standing - prone.speed) < 0.1, `${crawling} contra ${standing}`);
  for (let step = 0; step < 60 * prone.seconds; step++) tickSimulation(state, DT);
  assert.ok(!(leader.proneSeconds > 0), 'se levantó');
});

for (const level of [0, 3]) {
  test(`quien baja de un vehículo empieza cuerpo a tierra, sin inmunidad (nivel ${level})`, () => {
    const state = newGame();
    startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['truck-transport'], veterancy: level } });
    for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
    const [truck] = state.enemies;
    truck.hp = 1;
    const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
    for (let step = 0; step < 60 * 40 && truck.alive; step++) tickSimulation(state, DT);
    assert.equal(truck.alive, false);
    const crew = state.enemies.filter((enemy) => enemy.alive && enemy.armorClass === 'infantry');
    assert.ok(crew.length > 0);
    assert.ok(crew.every((soldier) => soldier.proneSeconds > 0));
    assert.equal(crew[0].dismountProtection, undefined);
    // La torre les dispara enseguida: nada los protege salvo el suelo.
    let hit = null;
    for (let step = 0; step < 60 * 5 && !hit; step++) {
      tower.hp = tower.maxHp;
      tickSimulation(state, DT);
      hit = consumeEffects(state).find((effect) => effect.type === 'hit' && crew.some((soldier) => soldier.id === effect.enemyId));
    }
    assert.ok(hit, 'les puede pegar apenas bajan');
  });
}

test('el camión veterano es más rápido en cada nivel, y el 8x8 no cambia', () => {
  const speedOf = (id, level) => {
    const state = newGame();
    startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [id], veterancy: level } });
    for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
    return state.enemies[0].speed;
  };
  for (const level of [1, 2, 3]) assert.ok(speedOf('truck-transport', level) > speedOf('truck-transport', level - 1), `nivel ${level}`);
  assert.equal(speedOf('apc-8x8', 3), speedOf('apc-8x8', 0));
});

test('las primeras veteranas son de infantería, y el nivel 2 de vehículos sale después de la 13', () => {
  const { odds, squadOdds } = GAMEPLAY_CONFIG.veterancy;
  const firstVeteran = (table) => table.find(({ chances }) => chances[0] < 1).fromWave;
  assert.ok(firstVeteran(squadOdds) < firstVeteran(odds));
  const firstHigh = odds.find(({ chances }) => chances[2] + chances[3] > 0).fromWave;
  assert.ok(firstHigh > 13, `oleada ${firstHigh}`);
  assert.equal(squadOdds.at(-1).chances[0], 0, 'al final, ninguna unidad de nivel 0');
});

/** Una unidad detenida a `cells` de una torre: devuelve las granadas, con el segundo en que salió cada una. */
function grenadesAt(cells, seconds) {
  const state = newGame();
  const unit = launchUnit(state, 0);
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  tower.cooldown = 1e6;
  unit.forEach((soldier, index) => {
    soldier.speed = 0;
    soldier.hp = soldier.maxHp = 1e9;
    soldier.position.x = tower.wx - cells * state.config.worldScale;
    soldier.position.z = tower.wz + index * 0.01;
  });
  const thrown = [];
  for (let step = 0; step < 60 * seconds; step++) {
    tower.hp = tower.maxHp;
    tower.cooldown = 1e6;
    tickSimulation(state, DT);
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'enemy-projectile-fired' && effect.projectile === 'grenade') thrown.push({ ...effect, at: step / 60 });
    }
  }
  return { thrown, tower, state };
}

test(`el soldado lanza su granada a los ${grenade.delay} segundos de entrar en combate, no antes`, () => {
  const { thrown } = grenadesAt(1.5, grenade.delay + 1);
  assert.equal(thrown.length, 3, 'una por soldado');
  for (const { at } of thrown) assert.ok(at >= grenade.delay - 0.05 && at < grenade.delay + 0.5, `a los ${at} s`);
});

test('después lanza otra cada tanto', () => {
  const { thrown } = grenadesAt(1.5, grenade.delay + grenade.cooldown + 1);
  assert.equal(thrown.length, 6);
});

test('fuera del alcance de la granada, no la lanza aunque dispare', () => {
  const { thrown } = grenadesAt(grenade.range + 0.2, grenade.delay + 3);
  assert.equal(thrown.length, 0);
});

/** Un misilero a tiro de una torre, y el momento en que dispara su primer cohete. */
function firstRocket(startProne) {
  const state = newGame();
  const [soldier] = launchUnit(state, 3);
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  soldier.hp = soldier.maxHp = 1e9;
  soldier.grenadeCooldown = 1e9;
  soldier.position.x = tower.wx - 2.5 * state.config.worldScale;
  soldier.position.z = tower.wz;
  soldier.proneSeconds = startProne ? 1e6 : 0;
  soldier.weaponCooldown = 0;
  const seen = [];
  for (let step = 0; step < 60 * 20; step++) {
    tower.hp = tower.maxHp;
    tower.cooldown = 1e6;
    soldier.weaponCooldown = Math.min(soldier.weaponCooldown, 1);
    const before = { ...soldier.position };
    tickSimulation(state, DT);
    seen.push({ kneeling: soldier.kneelSeconds > 0, moved: Math.hypot(soldier.position.x - before.x, soldier.position.z - before.z) });
    const fired = consumeEffects(state).find((effect) => effect.type === 'enemy-projectile-fired' && effect.projectile === 'rocket' && effect.enemyId === soldier.id);
    if (fired) return { state, soldier, seen };
  }
  throw new Error('no disparó');
}

for (const startProne of [false, true]) {
  test(`el misil solo sale de rodilla (${startProne ? 'estaba tirado' : 'estaba de pie'})`, () => {
    const { soldier, seen } = firstRocket(startProne);
    assert.ok(soldier.kneelSeconds > 0, 'está de rodilla al disparar');
    assert.ok(soldier.kneelSeconds <= kneel.hold + 1e-9, 'ya terminó de arrodillarse');
    const kneeled = seen.filter((item) => item.kneeling);
    assert.ok(kneeled.length >= kneel.rise * 60 - 2, `se arrodilló ${kneeled.length} pasos antes`);
    assert.ok(kneeled.slice(1).every((item) => item.moved === 0), 'de rodilla no avanza');
  });
}

test('de rodilla no tiene la cobertura del suelo: queda a lo sumo en nivel 1 y el disparo lo mata', () => {
  const { state, soldier } = firstRocket(true);
  assert.ok(soldier.kneelSeconds > 0);
  tickSimulation(state, DT);
  assert.ok(soldier.coverLevel <= 1, `nivel ${soldier.coverLevel}`);
});

test('quien tiene ametralladora no se arrodilla: dispara tirado', () => {
  const state = newGame();
  const unit = launchUnit(state, 0);
  const [soldier] = unit;
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  soldier.hp = soldier.maxHp = 1e9;
  soldier.grenadeCooldown = 1e9;
  soldier.position.x = tower.wx - 2 * state.config.worldScale;
  soldier.position.z = tower.wz;
  soldier.proneSeconds = 1e6;
  let fired = false;
  for (let step = 0; step < 60 * 10 && !fired; step++) {
    tower.hp = tower.maxHp;
    tower.cooldown = 1e6;
    tickSimulation(state, DT);
    fired = consumeEffects(state).some((effect) => effect.type === 'enemy-projectile-fired' && effect.enemyId === soldier.id);
  }
  assert.ok(fired);
  assert.ok(!(soldier.kneelSeconds > 0));
});
