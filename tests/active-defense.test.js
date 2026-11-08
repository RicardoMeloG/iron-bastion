// El sistema de defensa activa del tanque: intercepta misiles antes de que lleguen y tarda en recargar.
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
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

const DT = 1 / 60;
const { cooldownSeconds, interceptSeconds, range } = GAMEPLAY_CONFIG.veterancy.activeDefense;

function newGame() {
  const state = createInitialState(createGameConfig());
  state.credits = 1e6;
  state.lives = 1000;
  return state;
}

function launchTank(state, veterancy) {
  startWave(state, { overrideWaveDefinition: { interval: 0.1, spawns: ['tank-heavy'], veterancy } });
  for (let step = 0; step < 60 && state.enemies.length === 0; step++) tickSimulation(state, DT);
  const [tank] = state.enemies;
  tank.hp = tank.maxHp = 1e9;
  return tank;
}

/** Los resultados de los misiles de una LM-2 grande, en orden, hasta que le pegue `until` veces. */
function missileOutcomes(state, until = 2) {
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 7 });
  for (let level = 0; level < 4; level++) upgradeTower(state, tower.id);
  const outcomes = [];
  for (let step = 0; step < 60 * 90 && outcomes.filter((type) => type === 'hit').length < until; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'missile-intercepted' || effect.type === 'hit') outcomes.push(effect.type);
    }
  }
  return outcomes;
}

test('sin veteranía, el tanque no intercepta nada', () => {
  const state = newGame();
  launchTank(state, 0);
  assert.equal(missileOutcomes(state)[0], 'hit');
});

for (const level of [1, 2, 3]) {
  test(`en el nivel ${level} detiene ${level} misil(es) antes de que el siguiente le pegue`, () => {
    const state = newGame();
    const tank = launchTank(state, level);
    assert.equal(tank.defenseCharges, level);
    const outcomes = missileOutcomes(state, 1);
    assert.deepEqual(outcomes.slice(0, level), Array(level).fill('missile-intercepted'));
    assert.ok(outcomes.includes('hit'), 'después de gastarlas, el misil llega');
  });
}

test('el misil estalla antes de llegar, y no le hace daño', () => {
  const state = newGame();
  const tank = launchTank(state, 1);
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 7 });
  let intercepted = null;
  for (let step = 0; step < 60 * 60 && !intercepted; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    intercepted = consumeEffects(state).find((effect) => effect.type === 'missile-intercepted');
  }
  assert.ok(intercepted);
  assert.equal(tank.hp, tank.maxHp);
  assert.equal(tank.defenseCharges, 0);
  const distance = Math.hypot(intercepted.position.x - tank.position.x, intercepted.position.z - tank.position.z);
  assert.ok(distance > state.config.worldScale * 0.3, `estalló a ${distance}`);
  assert.ok(distance <= state.config.worldScale * (range + 0.3), `estalló a ${distance}`);
});

test('recarga de a una, con su espera', () => {
  const state = newGame();
  const tank = launchTank(state, 2);
  tank.defenseCharges = 0;
  tank.defenseReload = cooldownSeconds;
  for (let step = 0; step < Math.round((cooldownSeconds - 0.5) * 60); step++) tickSimulation(state, DT);
  assert.equal(tank.defenseCharges, 0, 'todavía no');
  for (let step = 0; step < 60; step++) tickSimulation(state, DT);
  assert.equal(tank.defenseCharges, 1, 'una');
  for (let step = 0; step < Math.round(cooldownSeconds * 60); step++) tickSimulation(state, DT);
  assert.equal(tank.defenseCharges, 2, 'las dos');
  for (let step = 0; step < Math.round(cooldownSeconds * 60); step++) tickSimulation(state, DT);
  assert.equal(tank.defenseCharges, 2, 'no pasa de su nivel');
});

test('las balas no se interceptan: solo los misiles', () => {
  const state = newGame();
  const tank = launchTank(state, 3);
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 7 });
  for (let level = 0; level < 4; level++) upgradeTower(state, tower.id);
  let hit = false;
  for (let step = 0; step < 60 * 60 && !hit; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    hit = consumeEffects(state).some((effect) => effect.type === 'hit' && effect.enemyId === tank.id);
  }
  assert.ok(hit);
  assert.equal(tank.defenseCharges, 3);
});

test('primero sale el interceptor, y el misil estalla cuando este llega, cerca de donde apuntó', () => {
  const state = newGame();
  const tank = launchTank(state, 1);
  const tower = placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 7 });
  let fired = null;
  let firedAt = 0;
  let intercepted = null;
  for (let step = 0; step < 60 * 60 && !intercepted; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'defense-fired') { fired = effect; firedAt = step; }
      if (effect.type === 'missile-intercepted') intercepted = { ...effect, step };
    }
    if (fired && !intercepted) assert.equal(tank.defenseCharges, 0, 'la carga se gasta al lanzarlo');
  }
  assert.ok(fired, 'salió el interceptor');
  assert.equal(fired.enemyId, tank.id);
  assert.equal(fired.seconds, interceptSeconds);
  assert.ok(Math.abs((intercepted.step - firedAt) * DT - interceptSeconds) < 0.05, 'estalla cuando llega');
  const off = Math.hypot(intercepted.position.x - fired.to.x, intercepted.position.y - fired.to.y, intercepted.position.z - fired.to.z);
  assert.ok(off < state.config.worldScale * 0.15, `estalló a ${off} de donde apuntó`);
  assert.equal(tank.hp, tank.maxHp);
});

/** Una RK-40 le tira a un tanque hasta `seconds`. Cuenta los cohetes detenidos y los que caen. */
function rocketsAgainstTank(veterancy, seconds = 40) {
  const state = newGame();
  const tank = launchTank(state, veterancy);
  const tower = placeTower(state, { towerTypeId: 'rk40-brasa', gx: 8, gy: 7 });
  let intercepted = 0;
  let landed = 0;
  const heights = [];
  for (let step = 0; step < 60 * seconds; step++) {
    tower.hp = tower.maxHp;
    tickSimulation(state, DT);
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'missile-intercepted') {
        intercepted += 1;
        heights.push(effect.position.y);
      }
      if (effect.type === 'incendiary-impact') landed += 1;
    }
  }
  return { intercepted, landed, tank, heights, worldScale: state.config.worldScale };
}

test('también detiene los cohetes de la RK-40: estallan en el aire, sin dejar fuego', () => {
  const veteran = rocketsAgainstTank(3);
  assert.ok(veteran.intercepted > 0, 'detuvo cohetes');
  const rookie = rocketsAgainstTank(0);
  assert.equal(rookie.intercepted, 0, 'sin veteranía, no');
  assert.ok(rookie.landed > veteran.landed, `${rookie.landed} contra ${veteran.landed} que cayeron`);
});

test('el cohete estalla en lo alto: el interceptor le gana a la caída', () => {
  const { heights, worldScale } = rocketsAgainstTank(3);
  assert.ok(heights.length > 0);
  const lowest = Math.min(...heights);
  assert.ok(lowest > 0.8 * worldScale, `el más bajo estalló a ${lowest}`);
});

test('una salva grande agota las cargas: el resto de los cohetes cae', () => {
  const { intercepted, landed } = rocketsAgainstTank(1, 25);
  assert.ok(intercepted > 0);
  assert.ok(landed > 0, 'con una carga no alcanza para toda la salva');
});
