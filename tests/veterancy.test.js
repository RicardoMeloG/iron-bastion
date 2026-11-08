// Veteranía: de 0 a 3 en todos los vehículos. Cuanto más avanza la partida, más veteranos salen, y
// son los que de verdad dañan a una torre a nivel máximo.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeEffects,
  createGameConfig,
  createInitialState,
  placeTower,
  startWave,
  tickSimulation,
  upgradeTowerDefense,
} from '../src/core/index.js';
import { enemyDefinitions } from '../src/content/enemies/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';
import { rigDefinitions } from '../src/content/rigs/index.js';
import { rollVeterancy } from '../src/core/simulation.js';

const DT = 1 / 60;
const { odds } = GAMEPLAY_CONFIG.veterancy;

function newGame() {
  const state = createInitialState(createGameConfig());
  state.credits = 1e5;
  state.lives = 1000;
  return state;
}

function launch(state, enemyTypeId, veterancy) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: [enemyTypeId], veterancy } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  return state.enemies[0];
}

function levelsAt(wave, samples = 2000) {
  const counts = [0, 0, 0, 0];
  for (let index = 0; index < samples; index++) counts[rollVeterancy(wave, (index + 0.5) / samples)]++;
  return counts;
}

test('al principio no sale ningún veterano, y al final ninguno sin veteranía', () => {
  assert.deepEqual(levelsAt(1), [2000, 0, 0, 0]);
  assert.equal(levelsAt(20)[0], 0);
  assert.ok(levelsAt(20)[3] > 0);
});

test('los veteranos crecen con las oleadas', () => {
  const average = (wave) => levelsAt(wave).reduce((sum, count, level) => sum + count * level, 0) / 2000;
  let last = -1;
  for (const { fromWave } of odds) {
    assert.ok(average(fromWave) > last, `oleada ${fromWave}`);
    last = average(fromWave);
  }
});

test('las probabilidades de cada tramo suman 1 y hay cuatro niveles', () => {
  for (const { chances } of odds) assert.equal(chances.length, 4);
  for (const { chances } of odds) assert.ok(Math.abs(chances.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
});

test('la moto sigue tu escalera: sin arma, fusil, un misil y dos misiles', () => {
  const armed = (level) => launch(newGame(), 'moto-recon', level);
  assert.equal(armed(0).isArmed, false);
  assert.equal(armed(1).weaponProfile.projectile, undefined);
  assert.equal(armed(2).weaponProfile.projectile, 'rocket');
  assert.equal(rigDefinitions[armed(2).rig].muzzles.length, 1);
  assert.equal(rigDefinitions[armed(3).rig].muzzles.length, 2);
});

test('cada nivel de moto tiene su modelo, y dispara desde su arma', () => {
  for (const level of [1, 2, 3]) {
    const state = newGame();
    const moto = launch(state, 'moto-recon', level);
    const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
    assert.ok(tower);
    const effects = [];
    for (let step = 0; step < 60 * 20 && moto.alive; step++) {
      tickSimulation(state, DT);
      effects.push(...consumeEffects(state));
      if (effects.some((effect) => effect.type === 'enemy-projectile-fired')) break;
    }
    assert.ok(effects.some((effect) => effect.type === 'enemy-projectile-fired' && effect.enemyId === moto.id), `nivel ${level}`);
  }
});

test('el arma de un veterano le hace mucho más a una torre con blindaje máximo', () => {
  const damageTo = (level) => {
    const state = newGame();
    const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
    upgradeTowerDefense(state, tower.id);
    upgradeTowerDefense(state, tower.id);
    launch(state, 'patrulla', level);
    for (let step = 0; step < 60 * 40; step++) {
      tickSimulation(state, DT);
      const hit = consumeEffects(state).find((effect) => effect.type === 'tower-hit');
      if (hit) return hit.damage;
    }
    throw new Error('no le pegó');
  };
  assert.ok(damageTo(3) >= damageTo(1) * 4, `${damageTo(3)} contra ${damageTo(1)}`);
});

test('el tanque y el 8x8 no ganan vida ni daño por veteranía: ganan capacidades', () => {
  for (const id of ['tank-heavy', 'apc-8x8']) {
    const rookie = launch(newGame(), id, 0);
    const veteran = launch(newGame(), id, 3);
    assert.equal(veteran.maxHp, rookie.maxHp, id);
    assert.equal(veteran.weaponProfile.damage, rookie.weaponProfile.damage, id);
  }
});

test('el 8x8 sin veteranía no lleva a nadie; después, como un camión con menos gente', () => {
  const crew = (level) => launch(newGame(), 'apc-8x8', level).crew.length;
  assert.deepEqual([0, 1, 2, 3].map(crew), [0, 3, 6, 9]);
  for (const level of [1, 2, 3]) {
    assert.ok(crew(level) < launch(newGame(), 'truck-transport', level).crew.length, `nivel ${level}`);
  }
});

test('un soldado suelto y los drones no tienen veteranía: la tiene su unidad', () => {
  for (const id of ['infantry-mg', 'infantry-rpg', 'dron-fpv', 'dron-ala']) {
    assert.equal(launch(newGame(), id, 3).veterancy, 0, id);
  }
});

test('todos los vehículos terrestres la tienen', () => {
  for (const id of ['moto-recon', 'patrulla', 'truck-transport', 'apc-8x8', 'tank-heavy']) {
    assert.equal(launch(newGame(), id, 2).veterancy, 2, id);
  }
});

function killAndCollect(state, vehicle) {
  vehicle.hp = 1;
  const before = new Set(state.enemies);
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
  assert.ok(tower);
  for (let step = 0; step < 60 * 40 && vehicle.alive; step++) tickSimulation(state, DT);
  assert.equal(vehicle.alive, false);
  return state.enemies.filter((enemy) => !before.has(enemy) && enemy.alive);
}

const teamsOf = (soldiers) => Object.values(Object.groupBy(soldiers, (soldier) => soldier.teamId));
const missileers = (team) => team.filter((soldier) => soldier.enemyTypeId === 'infantry-rpg').length;

test('los que bajan de un camión veterano forman unidades de su mismo nivel', () => {
  const state = newGame();
  const truck = launch(state, 'truck-transport', 2);
  const crew = killAndCollect(state, truck);
  assert.ok(crew.length > enemyDefinitions['truck-transport'].dismount.length, 'lleva más gente');
  for (const team of teamsOf(crew)) {
    assert.equal(team.length, 3);
    assert.equal(missileers(team), 2);
  }
  assert.ok(crew.every((soldier) => soldier.veterancy === 2));
});

for (const level of [0, 1, 2, 3]) {
  test(`una unidad de nivel ${level} son 3 soldados con ${level} misilero(s), sin pisarse`, () => {
    const state = newGame();
    startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: Array(3).fill('infantry-mg'), veterancy: level, infantryTeams: true } });
    for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
    assert.equal(state.enemies.length, 3);
    assert.equal(missileers(state.enemies), level);
    assert.equal(new Set(state.enemies.map(({ teamId }) => teamId)).size, 1);
    assert.equal(new Set(state.enemies.map(({ teamSlot }) => `${teamSlot.side}/${teamSlot.back}`)).size, 3);
    assert.ok(state.enemies.every((soldier) => soldier.veterancy === level));
  });
}

for (const level of [0, 1, 2]) {
  test(`si un soldado de nivel ${level} destruye una torre, sube su unidad entera y uno más toma un lanzamisiles`, () => {
    const state = newGame();
    const crew = killAndCollect(state, launch(state, 'truck-transport', level));
    for (const soldier of crew) soldier.hp = soldier.maxHp = 1e9;
    const [tower] = state.towers;
    tower.hp = 1;
    const effects = [];
    for (let step = 0; step < 60 * 60 && !tower.destroyed; step++) {
      tower.cooldown = 999;
      tickSimulation(state, DT);
      effects.push(...consumeEffects(state));
    }
    assert.equal(tower.destroyed, true, 'cayó la torre');
    const promoted = effects.filter((effect) => effect.type === 'enemy-promoted');
    assert.equal(promoted.length, 1, 'un solo ascenso, el de la unidad');
    const killer = crew.find((soldier) => soldier.id === promoted[0].enemyId);
    assert.equal(killer.enemyTypeId, 'infantry-rpg', 'quien la destruyó lleva misil');
    for (const team of teamsOf(crew)) {
      const own = team.includes(killer);
      assert.equal(missileers(team), own ? level + 1 : level);
      assert.ok(team.every((soldier) => soldier.veterancy === (own ? level + 1 : level)));
    }
  });
}

test('los de un camión sin veteranía bajan como siempre', () => {
  const state = newGame();
  const crew = killAndCollect(state, launch(state, 'truck-transport', 0));
  assert.ok(crew.some((soldier) => soldier.enemyTypeId === 'infantry-mg'));
  assert.ok(crew.every((soldier) => soldier.veterancy === 0));
});

const MOTO_CREWS = [
  ['infantry-mg', 'infantry-mg'],
  ['infantry-mg', 'infantry-rpg'],
  ['infantry-rpg', 'infantry-rpg'],
  ['infantry-rpg', 'infantry-rpg'],
];
MOTO_CREWS.forEach((types, level) => {
  test(`la moto de nivel ${level} baja a una unidad de su nivel, a la que le falta un soldado`, () => {
    const state = newGame();
    const crew = killAndCollect(state, launch(state, 'moto-recon', level));
    assert.deepEqual(crew.map((soldier) => soldier.enemyTypeId).sort(), types);
    assert.equal(new Set(crew.map(({ teamId }) => teamId)).size, 1, 'una sola unidad: vale un punto');
    assert.ok(crew.every((soldier) => soldier.veterancy === level));
  });
});

test('en una oleada real, cada unidad lleva tantos misileros como su nivel', () => {
  const state = newGame();
  state.wave = 18;
  startWave(state);
  const teams = new Map();
  for (let step = 0; step < 60 * 6; step++) {
    tickSimulation(state, DT);
    for (const enemy of state.enemies) {
      if (enemy.teamId && !teams.has(enemy.id)) teams.set(enemy.id, enemy);
    }
  }
  const soldiers = [...teams.values()];
  assert.ok(soldiers.length > 0);
  for (const team of teamsOf(soldiers)) {
    if (team.length === 3) assert.equal(missileers(team), team[0].veterancy);
  }
  assert.ok(soldiers.some((soldier) => soldier.veterancy > 0));
});

test('un pelotón de misileros forma en triángulo, sin pisarse', () => {
  const state = newGame();
  const crew = killAndCollect(state, launch(state, 'truck-transport', 3));
  const team = crew.filter((soldier) => soldier.teamId === crew[0].teamId);
  assert.equal(team.length, 3);
  assert.equal(new Set(team.map((soldier) => `${soldier.teamSlot.side}/${soldier.teamSlot.back}`)).size, 3);
});

test('la patrulla sigue la misma escalera: sin arma, ametralladora, un misil y dos misiles', () => {
  const at = (level) => launch(newGame(), 'patrulla', level);
  assert.equal(at(0).isArmed, false, 'el nivel 0 no hace daño');
  assert.equal(at(1).weaponProfile.projectile, undefined);
  assert.equal(at(2).weaponProfile.projectile, 'rocket');
  assert.equal(rigDefinitions[at(1).rig].muzzles.length, 1);
  assert.equal(rigDefinitions[at(2).rig].muzzles.length, 1);
  assert.equal(rigDefinitions[at(3).rig].muzzles.length, 2);
});

test('una patrulla más veterana es más dura y paga más', () => {
  const at = (level) => launch(newGame(), 'patrulla', level);
  for (const level of [1, 2, 3]) {
    assert.ok(at(level).maxHp > at(level - 1).maxHp, `vida del nivel ${level}`);
    assert.ok(at(level).reward > at(level - 1).reward, `paga el nivel ${level}`);
  }
});

test('antes de la oleada 6 ninguna patrulla dispara: no hay veteranos', () => {
  for (const wave of [1, 2, 3, 4, 5]) assert.deepEqual(levelsAt(wave), [2000, 0, 0, 0], `oleada ${wave}`);
});

/** Lleva a un enemigo a disparar hasta que caiga una torre con muy poca vida. */
function destroyTowerWith(state, shooter, hpShare = 1) {
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 5 });
  tower.hp = 1;
  shooter.maxHp = 1e9;
  shooter.hp = 1e9 * hpShare;
  const effects = [];
  for (let step = 0; step < 60 * 40 && !tower.destroyed; step++) {
    tower.cooldown = 999;
    tickSimulation(state, DT);
    effects.push(...consumeEffects(state));
  }
  assert.equal(tower.destroyed, true, 'cayó la torre');
  return effects;
}

test('quien destruye una torre gana un nivel de veteranía, con su arma y su modelo', () => {
  const state = newGame();
  const patrol = launch(state, 'patrulla', 1);
  assert.equal(patrol.rig, 'patrulla-ametralladora');
  const effects = destroyTowerWith(state, patrol);
  assert.equal(patrol.veterancy, 2);
  assert.equal(patrol.rig, 'patrulla-misil');
  assert.equal(patrol.weaponProfile.projectile, 'rocket');
  assert.ok(effects.some((effect) => effect.type === 'enemy-promoted' && effect.enemyId === patrol.id));
});

test('ganar veteranía no le cura la vida: conserva la misma parte', () => {
  const state = newGame();
  const moto = launch(state, 'moto-recon', 1);
  destroyTowerWith(state, moto, 0.5);
  assert.equal(moto.veterancy, 2);
  assert.equal(moto.rig, 'moto-recon-n2');
  assert.ok(moto.maxHp < 1e9, 'toma la vida de su nuevo nivel');
  assert.ok(Math.abs(moto.hp / moto.maxHp - 0.5) < 1e-9);
});

test('la veteranía tiene tope: un nivel 3 sigue en 3 aunque destruya otra torre', () => {
  const state = newGame();
  const veteran = launch(state, 'apc-8x8', 3);
  destroyTowerWith(state, veteran);
  assert.equal(veteran.veterancy, 3);
});

test('un tanque que destruye una torre gana una carga de su defensa activa', () => {
  const state = newGame();
  const tank = launch(state, 'tank-heavy', 0);
  assert.equal(tank.defenseCharges, 0);
  destroyTowerWith(state, tank);
  assert.equal(tank.veterancy, 1);
  assert.equal(tank.defenseCharges, 1);
});

test('en la oleada 20 todos los vehículos son veteranos', () => {
  assert.equal(levelsAt(20)[0], 0);
  assert.equal(levelsAt(18)[0], 0);
});
