// T11 (CA-4) y spec 002: el balance es justo. Con las estrategias de npm run simulate
// (tools/balance/strategies.mjs): las compras de una partida real ganan las 10 oleadas sin que
// el final sobre, poner muchas básicas o un solo tipo de torre no alcanza y cada nivel rinde
// más por crédito que el anterior nivel básico.
import test from 'node:test';
import assert from 'node:assert/strict';

import { enemyDefinitions } from '../src/content/enemies/index.js';
import { towerDefinitions } from '../src/content/towers/index.js';
import { createGameConfig, createInitialState, placeTower, startWave, tickSimulation } from '../src/core/index.js';
import { resolveDamage } from '../src/core/simulation.js';
import { levelValueAgainstBasic } from '../tools/balance/level-value.mjs';
import { runMatchup, runSeeds, runStrategy } from '../tools/balance/strategies.mjs';

const lives = (run) => run.waves.at(-1)?.lives;
const MG7 = towerDefinitions['mg7-vulcan'];
const LM2 = towerDefinitions['lm2-lanza'];
const TANK = enemyDefinitions['tank-heavy'];
const ARMORED = new Set(['apc-8x8', 'tank-heavy']);

function shotDamage(tower, level, enemy) {
  return resolveDamage(tower.levels[level].damage, tower.combatModel.damageType, enemy.armorClass, enemy.stats.armor);
}

// El resultado es caótico: cambiar el carril de un vehículo mueve esta partida de 5 a 14 vidas. Por
// eso se mide con varios órdenes de enemigos y no con uno.
test('las compras de una partida real, más lo que falta para las oleadas 11 a 20, suelen ganar sin que el final les sobre', { skip: 'calibración pendiente: se retoma al final, con partidas reales (Ricardo, 07-11-2026)' }, () => {
  const { runs, wins, lives: left, medianLives } = runSeeds('partida-completa');
  assert.ok(wins >= runs.length * 0.6, `gana ${wins} de ${runs.length}`);
  assert.ok(wins < runs.length, 'gana siempre');
  assert.ok(medianLives >= 4, `mediana de ${medianLives} vidas: ${left}`);
  assert.ok(medianLives <= 15, `el final es holgado: mediana de ${medianLives} vidas: ${left}`);
  // Las primeras oleadas cuestan poco: lo caro viene después.
  const lostPerWave = (from, to) => runs.flatMap((run) => run.waves.slice(from, to)).reduce((sum, wave) => sum + wave.livesLost, 0) / (to - from);
  assert.ok(lostPerWave(7, 20) >= lostPerWave(0, 7) * 2, `oleadas 1 a 7: ${lostPerWave(0, 7)}; 8 a 20: ${lostPerWave(7, 20)}`);
});

test('en la última oleada hay mucho más de 26 enemigos a la vez, el máximo que se sentía poco', { skip: 'calibración pendiente: se retoma al final, con partidas reales (Ricardo, 07-11-2026)' }, () => {
  const { peakAlive } = runStrategy('partida-completa').waves.at(-1);
  assert.ok(peakAlive >= 35, `máximo ${peakAlive} a la vez`);
});

test('sin torres nuevas no se llega al final: las compras hasta la oleada 10 ya no alcanzan', { skip: 'calibración pendiente: se retoma al final, con partidas reales (Ricardo, 07-11-2026)' }, () => {
  const { runs, wins } = runSeeds('partida-real');
  assert.equal(wins, 0, `gana ${wins} de ${runs.length}`);
  assert.ok(runs.every((run) => run.lastWave >= 10), `pierde en ${runs.map((run) => run.lastWave)}`);
});

test('poner solo torres básicas no alcanza: hay que evolucionar', () => {
  for (const strategy of ['mixta-sin-mejorar', 'solo-torres']) {
    assert.equal(runStrategy(strategy).result, 'derrota', strategy);
  }
});

const TARGETS = {
  'mg7-vulcan': ['infantry-mg', 'moto-recon', 'patrulla'],
  'lm2-lanza': ['apc-8x8', 'tank-heavy'],
};
for (const [towerTypeId, enemies] of Object.entries(TARGETS)) {
  for (const enemyTypeId of enemies) {
    test(`${towerTypeId}: contra ${enemyTypeId}, evolucionar rinde más por crédito que poner básicas`, () => {
      for (const row of levelValueAgainstBasic(towerDefinitions[towerTypeId], enemyTypeId).slice(1)) {
        assert.ok(row.againstBasic > 1, `nivel ${row.level}: ${row.againstBasic.toFixed(2)} veces una básica`);
      }
    });
  }
}

test('con la misma plata, una LM-2 evolucionada le hace más a los blindados que varias básicas', () => {
  const spawns = [...Array(6).fill('apc-8x8'), ...Array(3).fill('tank-heavy')];
  const damage = (level, count) => {
    const { byEnemy } = runMatchup([{ towerTypeId: 'lm2-lanza', level, count }], spawns);
    return Object.values(byEnemy).reduce((sum, row) => sum + (row.damageBy['lm2-lanza'] ?? 0), 0);
  };
  // $280: una de nivel 2 contra dos básicas ($300).
  assert.ok(damage(1, 1) >= damage(0, 2) * 0.95, `nivel 2: ${damage(1, 1)}; dos básicas: ${damage(0, 2)}`);
});

test('en la estrategia ganadora, los tanques caen por los misiles', { skip: 'calibración pendiente: se retoma al final, con partidas reales (Ricardo, 07-11-2026)' }, () => {
  const tanks = runStrategy('partida-completa').waves.flatMap((wave) => wave.byEnemy['tank-heavy'] ?? []);
  assert.ok(tanks.length > 0, 'hay oleadas con tanques');
  assert.ok(tanks.reduce((sum, { killed }) => sum + killed, 0) > 0, 'destruye alguno');
  // En toda la partida: en una oleada suelta puede haber altibajos, con misiles que van en línea recta.
  const damageBy = (tower) => tanks.reduce((sum, { damageBy: dealt }) => sum + (dealt[tower] ?? 0), 0);
  assert.ok(damageBy('mg7-vulcan') <= damageBy('lm2-lanza') * 0.05, `MG-7 ${damageBy('mg7-vulcan')}, LM-2 ${damageBy('lm2-lanza')}`);
});

test('una MG-7 básica alcanza para las dos primeras oleadas, y sin evolucionar se pierde pronto', () => {
  // Bien puesta: en el frente, por donde cruza la infantería, y lejos de las rocas. Por dónde entra
  // cada escuadra es al azar, así que se mide con muchas semillas y no con una.
  const GAMES = 60;
  let cleanFirst = 0;
  let cleanBoth = 0;
  for (let seed = 0; seed < GAMES; seed++) {
    const firstWaves = createInitialState(createGameConfig());
    firstWaves.combatRandomSeed = seed * 7919;
    placeTower(firstWaves, { towerTypeId: 'mg7-vulcan', gx: 8, gy: 5 });
    const { maxLives } = firstWaves.config.mapDefinition;
    for (const wave of [1, 2]) {
      startWave(firstWaves);
      for (let step = 0; step < 60 * 120 && firstWaves.waveActive; step++) tickSimulation(firstWaves, 1 / 60);
      if (wave === 1 && firstWaves.lives === maxLives) cleanFirst += 1;
      if (wave === 2 && firstWaves.lives === maxLives) cleanBoth += 1;
    }
  }
  assert.ok(cleanFirst >= GAMES * 0.95, `oleada 1 sin perder vidas: ${cleanFirst} de ${GAMES}`);
  assert.ok(cleanBoth >= GAMES * 0.85, `oleadas 1 y 2 sin perder vidas: ${cleanBoth} de ${GAMES}`);
  const run = runStrategy('una-torre');
  assert.ok(run.waves[2].livesLost > 0, 'la oleada 3 ya le queda grande');
  assert.equal(run.result, 'derrota');
  assert.ok(run.lastWave <= 5, `pierde en la oleada ${run.lastWave}`);
});

for (const strategy of ['solo-torres', 'solo-lm2']) {
  test(`un solo tipo de torre sin mejorar no gana (${strategy})`, () => {
    const run = runStrategy(strategy);
    assert.equal(run.result, 'derrota', `${strategy} termina en ${run.result}`);
    assert.ok(run.waves.every((wave) => wave.towerLevels.every((level) => level === 0)), 'ninguna torre se mejoró');
  });
}

test('solo con MG-7 se llega con vidas a la oleada 8, pero los blindados pasan y no se gana (spec 002, CA-2)', () => {
  const run = runStrategy('solo-mg7');
  assert.equal(run.result, 'derrota', `seis MG-7 mejoradas terminan en ${run.result}`);
  assert.ok(run.lastWave >= 8, `pierde en la oleada ${run.lastWave}`);
  assert.ok(run.waves[6].lives >= 5, `llega a la oleada 8 con ${run.waves[6].lives} vidas`);
  // Lo que termina la partida son los blindados: desde la oleada 8, pasan más que todos los demás.
  // Algún soldado se cuela, según el orden de los enemigos: por eso se mide con varios.
  const { runs, wins } = runSeeds('solo-mg7');
  assert.equal(wins, 0, `gana ${wins} de ${runs.length}`);
  assert.ok(runs.every((other) => other.lastWave >= 8), `pierde en ${runs.map((other) => other.lastWave)}`);
});

test('con solo MG-7, lo que más pasa desde la oleada 8 son los blindados', { skip: 'calibración pendiente: se retoma al final, con partidas reales (Ricardo, 07-11-2026)' }, () => {
  const { runs } = runSeeds('solo-mg7');
  const leaks = runs.flatMap((other) => other.waves.slice(7)).flatMap((wave) => Object.entries(wave.byEnemy));
  const leakedIf = (matches) => leaks.filter(([enemyTypeId]) => matches(ARMORED.has(enemyTypeId))).reduce((sum, [, { leaked }]) => sum + leaked, 0);
  const armored = leakedIf((isArmored) => isArmored);
  const others = leakedIf((isArmored) => !isArmored);
  assert.ok(armored > others, `pasaron ${armored} blindados y ${others} más`);
});

test('la MG-7 no le hace daño a un tanque hasta la Gatling, y esta casi nada por disparo', () => {
  MG7.levels.slice(0, -1).forEach((_, level) => assert.equal(shotDamage(MG7, level, TANK), 0, `nivel ${level + 1}`));
  const gatling = shotDamage(MG7, MG7.levels.length - 1, TANK);
  assert.ok(gatling / TANK.stats.hp <= 0.005, `la Gatling le quita ${gatling} de ${TANK.stats.hp} por disparo`);
});

test('seis MG-7 sin llegar a la Gatling no detienen a cuatro tanques; seis LM-2 de nivel 3, sí (de frente, el tanque es un ariete)', () => {
  const tanks = Array(4).fill('tank-heavy');
  const level = MG7.levels.length - 2;

  const withMg7 = runMatchup([{ towerTypeId: 'mg7-vulcan', level, count: 6 }], tanks).byEnemy['tank-heavy'];
  assert.equal(withMg7.leaked, 4);
  assert.equal(withMg7.damageBy['mg7-vulcan'] ?? 0, 0);

  const withLm2 = runMatchup([{ towerTypeId: 'lm2-lanza', level: 2, count: 6 }], tanks).byEnemy['tank-heavy'];
  assert.equal(withLm2.killed, 4);
});

for (const strategy of ['solo-lm2', 'solo-lm2-mejoradas']) {
  test(`solo con LM-2 no se gana (${strategy})`, () => {
    const run = runStrategy(strategy);
    assert.equal(run.result, 'derrota', `${strategy} termina en ${run.result} con ${lives(run)} vidas`);
  });
}

test('gastar misiles en ligeros es un mal negocio: la MG-7 rinde más del doble por crédito', () => {
  const patrol = enemyDefinitions['patrulla'];
  const damagePerSecondPerCredit = (tower) => (shotDamage(tower, 0, patrol) * tower.levels[0].rate) / tower.economy.baseCost;
  assert.ok(shotDamage(LM2, 0, patrol) < patrol.stats.hp / 3, 'hacen falta más de tres misiles para una patrulla');
  assert.ok(damagePerSecondPerCredit(MG7) > 2 * damagePerSecondPerCredit(LM2));
});
