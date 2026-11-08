// Lo que vuela: los drones salen de la niebla y van derecho, el FPV a la torre más cercana y el
// el de ala delta a la más cara. La MG-7 les dispara y rara vez acierta, la AA-3 casi siempre, y la LM-2 y
// la RK-40 no pueden.
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
  upgradeTowerDefense,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { towerDefinitions } from '../src/content/towers/index.js';

const DT = 1 / 60;
const DRONES = ['dron-fpv', 'dron-ala'];

function newGame(seed = 0) {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  state.combatRandomSeed = seed;
  return state;
}

function launch(state, enemyTypeId) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId] } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  return state.enemies[0];
}

/** Lo deja a una celda de la torre, inmortal, para contar disparos. */
function hover(state, drone, tower) {
  drone.speed = 0;
  drone.hp = drone.maxHp = 1e9;
  drone.position.x = tower.wx + state.config.worldScale * 1.5;
  drone.position.z = tower.wz;
}

function shotsAt(state, seconds) {
  let fired = 0;
  let hits = 0;
  let missed = 0;
  consumeEffects(state);
  for (let step = 0; step < 60 * seconds; step++) {
    tickSimulation(state, DT);
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'projectile-fired') fired += 1;
      if (effect.type === 'hit') hits += 1;
      if (effect.type === 'air-shot-missed') missed += 1;
    }
  }
  return { fired, hits, missed };
}

for (const enemyTypeId of DRONES) {
  test(`${enemyTypeId} sale del lado de la niebla y vuela sobre el terreno`, () => {
    const { column, allRows: [first, last] } = createGameConfig().mapDefinition.infantrySpawn;
    for (let seed = 0; seed < 30; seed++) {
      const state = newGame(seed * 7919);
      const drone = launch(state, enemyTypeId);
      const { halfHeight, halfWidth, worldScale, pathSurfaceY } = state.config;
      const x = drone.position.x / worldScale + halfWidth;
      const row = drone.position.z / worldScale + halfHeight;
      assert.ok(Math.abs(x - column - 0.5) < 0.2, `columna ${x}`);
      assert.ok(row >= first && row <= last + 1, `fila ${row}`);
      assert.ok(drone.position.y > pathSurfaceY + worldScale * 0.3, 'va por el suelo');
    }
  });
}

test('el FPV va a la torre más cercana y estalla ahí, sin costar vidas ni dar recompensa', () => {
  const state = newGame();
  const near = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  const far = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 20, gy: 7 });
  const credits = state.credits;
  launch(state, 'dron-fpv');
  const effects = [];
  for (let step = 0; step < 60 * 30 && state.waveActive; step++) {
    tickSimulation(state, DT);
    effects.push(...consumeEffects(state));
  }
  assert.equal(state.enemies.length, 0);
  const hits = effects.filter((effect) => effect.type === 'tower-hit');
  assert.deepEqual(hits.map((effect) => effect.towerId), [near.id], 'solo recibe daño la torre cercana');
  assert.notEqual(near.id, far.id);
  assert.equal(state.lives, 1000);
  assert.equal(state.credits, credits);
  assert.ok(effects.some((effect) => effect.type === 'drone-exploded'));
});

test('sin torres en pie, el FPV sigue a la base y cuesta su vida', () => {
  const state = newGame();
  launch(state, 'dron-fpv');
  for (let step = 0; step < 60 * 60 && state.waveActive; step++) tickSimulation(state, DT);
  assert.equal(state.lives, 1000 - enemyDefinitions['dron-fpv'].flight.lives);
});

function flyUntilDone(state) {
  const effects = [];
  for (let step = 0; step < 60 * 90 && state.waveActive; step++) {
    tickSimulation(state, DT);
    effects.push(...consumeEffects(state));
  }
  return effects;
}

test('el FPV le quita la mitad de la vida total a una torre sin blindaje agregado, sin importar su blindaje base', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  upgradeTower(state, tower.id);
  upgradeTower(state, tower.id);
  const { maxHp } = tower;
  launch(state, 'dron-fpv');
  const effects = flyUntilDone(state);
  // Al terminar la oleada las torres se reparan: lo que le hizo se lee en el efecto.
  const [hit] = effects.filter((effect) => effect.type === 'tower-hit');
  assert.equal(hit.damage, maxHp / 2);
  assert.ok(!effects.some((effect) => effect.type === 'tower-destroyed'));
});

test('el FPV le rompe un nivel de blindaje a una torre mejorada, en vez de quitarle la mitad', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  upgradeTowerDefense(state, tower.id);
  upgradeTowerDefense(state, tower.id);
  const hardened = tower.maxHp;
  launch(state, 'dron-fpv');
  const effects = flyUntilDone(state);
  assert.equal(tower.defenseTier, 1);
  assert.ok(effects.some((effect) => effect.type === 'tower-armor-lost' && effect.towerId === tower.id));
  assert.ok(tower.maxHp < hardened);
  assert.equal(tower.hp, tower.maxHp, 'no le saca más que el nivel');
  assert.equal(tower.armor, towerDefinitions['lm2-lanza'].defenseLevels[1].armor);
});

test('dos FPV destruyen una torre sin blindaje agregado', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['dron-fpv', 'dron-fpv'] } });
  const effects = flyUntilDone(state);
  assert.ok(effects.some((effect) => effect.type === 'tower-destroyed' && effect.towerId === tower.id));
});

test('el dron de ala delta va a la torre más cara aunque otra le quede más cerca, y su explosión alcanza a las vecinas', () => {
  const state = newGame();
  const cheap = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 6, gy: 5 });
  const priciest = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 20, gy: 7 });
  upgradeTower(state, priciest.id);
  const neighbor = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 19, gy: 7 });
  const credits = state.credits;
  const { flight } = enemyDefinitions['dron-ala'];
  launch(state, 'dron-ala');
  const effects = flyUntilDone(state);
  const shareOf = (tower) => effects.filter((effect) => effect.type === 'tower-hit' && effect.towerId === tower.id).reduce((sum, effect) => sum + effect.damage, 0) / tower.maxHp;
  assert.equal(shareOf(cheap), 0, 'no toca la barata');
  assert.ok(Math.abs(shareOf(priciest) - flight.hpShare) < 1e-9, 'centro de la explosión');
  assert.ok(shareOf(neighbor) > 0, 'la vecina también la sufre');
  assert.ok(shareOf(neighbor) < flight.hpShare, 'lejos del centro duele menos');
  assert.equal(state.lives, 1000);
  assert.equal(state.credits, credits);
  assert.ok(effects.some((effect) => effect.type === 'drone-exploded'));
});

test('sin torres en pie, el dron de ala delta sigue a la base y cuesta más vidas', () => {
  const state = newGame();
  launch(state, 'dron-ala');
  flyUntilDone(state);
  assert.equal(state.lives, 1000 - enemyDefinitions['dron-ala'].flight.lives);
  assert.ok(enemyDefinitions['dron-ala'].flight.lives > enemyDefinitions['dron-fpv'].flight.lives);
});

test('la LM-2 y la RK-40 no le disparan a lo que vuela', () => {
  for (const towerTypeId of ['lm2-lanza', 'rk40-brasa']) {
    const state = newGame();
    const tower = placeTower(state, { towerTypeId, gx: 10, gy: 5 });
    const drone = launch(state, 'dron-ala');
    hover(state, drone, tower);
    // A distancia de tiro también para la RK-40, que no alcanza lo cercano.
    drone.position.x = tower.wx + state.config.worldScale * 3.5;
    const { fired } = shotsAt(state, 10);
    assert.equal(fired, 0, towerTypeId);
    assert.equal(tower.targetEnemyId, null);
  }
});

test('la AA-3 solo le dispara a lo que vuela: a un soldado o a un tanque, nunca', () => {
  for (const enemyTypeId of ['infantry-mg', 'tank-heavy']) {
    const state = newGame();
    const tower = placeTower(state, { towerTypeId: 'aa3-halcon', gx: 10, gy: 5 });
    const enemy = launch(state, enemyTypeId);
    enemy.speed = 0;
    enemy.position.x = tower.wx + state.config.worldScale;
    enemy.position.z = tower.wz;
    tower.hp = tower.maxHp = 1e9;
    const { fired } = shotsAt(state, 8);
    assert.equal(fired, 0, enemyTypeId);
  }
});

test('la MG-7 le dispara a un dron, pero acierta rara vez', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 10, gy: 5 });
  const drone = launch(state, 'dron-ala');
  hover(state, drone, tower);
  const { hits, missed } = shotsAt(state, 40);
  assert.ok(hits + missed > 60, `solo ${hits + missed} disparos llegaron`);
  const share = hits / (hits + missed);
  assert.ok(share > 0.1 && share < 0.3, `acierta ${(share * 100).toFixed(0)} %`);
});

test('la AA-3 casi siempre acierta', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'aa3-halcon', gx: 10, gy: 5 });
  const drone = launch(state, 'dron-ala');
  hover(state, drone, tower);
  const { hits, missed } = shotsAt(state, 20);
  assert.ok(hits + missed > 40);
  const share = hits / (hits + missed);
  assert.ok(share > 0.75, `acierta ${(share * 100).toFixed(0)} %`);
});

test('una AA-3 básica baja a un FPV que viene a ella antes de que llegue, casi siempre', () => {
  let survived = 0;
  for (let seed = 0; seed < 20; seed++) {
    const state = newGame(seed * 7919);
    placeTower(state, { towerTypeId: 'aa3-halcon', gx: 10, gy: 5 });
    launch(state, 'dron-fpv');
    let hit = false;
    for (let step = 0; step < 60 * 30 && state.waveActive; step++) {
      tickSimulation(state, DT);
      hit ||= consumeEffects(state).some((effect) => effect.type === 'tower-hit');
    }
    if (!hit) survived += 1;
  }
  assert.ok(survived >= 15, `la torre salió ilesa ${survived} de 20 veces`);
});

test('la bala que falla sigue de largo y no daña al dron', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 10, gy: 5 });
  const drone = launch(state, 'dron-ala');
  hover(state, drone, tower);
  const hpBefore = drone.hp;
  let missed = false;
  consumeEffects(state);
  for (let step = 0; step < 60 * 20 && !missed; step++) {
    const hpNow = drone.hp;
    tickSimulation(state, DT);
    const effects = consumeEffects(state);
    if (effects.some((effect) => effect.type === 'air-shot-missed')) {
      assert.equal(drone.hp <= hpNow, true);
      missed = !effects.some((effect) => effect.type === 'hit');
    }
  }
  assert.ok(missed, 'no falló nunca');
  assert.ok(drone.hp <= hpBefore);
});

test('las torres que tiran a lo que vuela son las que lo dicen: su definición es la regla', () => {
  assert.equal(towerDefinitions['mg7-vulcan'].combatModel.targets.air, true);
  assert.equal(towerDefinitions['aa3-halcon'].combatModel.targets.ground, false);
  assert.ok(!towerDefinitions['lm2-lanza'].combatModel.targets?.air);
  assert.ok(!towerDefinitions['rk40-brasa'].combatModel.targets?.air);
});

test('la ametralladora normal le acierta al FPV solo un 10 %, y al de ala delta lo de siempre', () => {
  const mg = towerDefinitions['mg7-vulcan'].combatModel.targets;
  assert.equal(mg.smallAirHitChance, 0.1);
  assert.equal(enemyDefinitions['dron-fpv'].flight.small, true);
  assert.notEqual(enemyDefinitions['dron-ala'].flight.small, true);
  assert.ok(mg.airHitChance > mg.smallAirHitChance);
});

test('la bala antiaérea estalla en el aire: si acierta, también daña a lo que vuela cerca', () => {
  const state = newGame();
  const tower = placeTower(state, { towerTypeId: 'aa3-halcon', gx: 10, gy: 5 });
  startWave(state, { overrideWaveDefinition: { interval: 0.01, spawns: ['dron-ala', 'dron-ala'] } });
  for (let step = 0; step < 60 && state.enemies.length < 2; step++) tickSimulation(state, DT);
  const [first, second] = state.enemies;
  hover(state, first, tower);
  hover(state, second, tower);
  second.position.x += state.config.worldScale * 0.3;
  const effects = [];
  for (let step = 0; step < 60 * 6 && first.alive && second.alive; step++) {
    tickSimulation(state, DT);
    effects.push(...consumeEffects(state));
    if (effects.some((effect) => effect.type === 'hit')) break;
  }
  assert.ok(effects.some((effect) => effect.type === 'flak-burst'), 'estalla');
  const hits = effects.filter((effect) => effect.type === 'hit');
  assert.ok(new Set(hits.map((effect) => effect.enemyId)).size === 2, 'alcanza a los dos');
  const { share } = towerDefinitions['aa3-halcon'].combatModel.flak;
  assert.ok(share > 0 && share < 1);
});

test('si la antiaérea falla, estalla igual pero no le hace daño a nadie', () => {
  const state = newGame();
  state.config.towerDefinitions['aa3-halcon'] = {
    ...towerDefinitions['aa3-halcon'],
    combatModel: { ...towerDefinitions['aa3-halcon'].combatModel, targets: { ground: false, air: true, airHitChance: 0 } },
  };
  const tower = placeTower(state, { towerTypeId: 'aa3-halcon', gx: 10, gy: 5 });
  const drone = launch(state, 'dron-ala');
  hover(state, drone, tower);
  const effects = [];
  for (let step = 0; step < 60 * 4; step++) {
    tickSimulation(state, DT);
    effects.push(...consumeEffects(state));
    if (effects.some((effect) => effect.type === 'flak-burst')) break;
  }
  assert.ok(effects.some((effect) => effect.type === 'flak-burst'));
  assert.ok(effects.some((effect) => effect.type === 'air-shot-missed'));
  assert.ok(!effects.some((effect) => effect.type === 'hit'));
  assert.equal(drone.hp, drone.maxHp);
});
