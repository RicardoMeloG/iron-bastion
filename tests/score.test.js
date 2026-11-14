import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SCORE_CONFIG } from '../src/content/score.js';
import { createScore, scoreEffects } from '../src/core/score.js';
import {
  createGameConfig,
  createInitialState,
  startWave,
  tickSimulation,
  consumeEffects,
  placeTower,
} from '../src/core/index.js';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';

// ─── Pruebas unitarias con efectos manuales ───────────────────────────────────

test('enemigo eliminado: reward 8, veterancia 0 → 80', () => {
  const score = createScore();
  const pops = scoreEffects(score, [{ type: 'enemy-killed', reward: 8, veterancy: 0 }]);
  assert.equal(score.byCategory.enemigos, 80);
  assert.equal(score.total, 80);
  assert.deepEqual(pops, [{ category: 'enemigos', points: 80 }]);
});

test('enemigo eliminado: reward 8, veterancia 3 → 240', () => {
  const score = createScore();
  scoreEffects(score, [{ type: 'enemy-killed', reward: 8, veterancy: 3 }]);
  assert.equal(score.byCategory.enemigos, 240);
});

test('fuga de 2 vidas → −1000 y sinPerdidas no se otorga al terminar la oleada', () => {
  const score = createScore();
  scoreEffects(score, [{ type: 'wave-started', wave: 1, countdownLeft: 0 }]);
  scoreEffects(score, [{ type: 'enemy-leaked', livesLost: 2 }]);
  assert.equal(score.byCategory.vidasPerdidas, -1000);
  assert.equal(score.waveLivesLost, 2);

  scoreEffects(score, [{ type: 'wave-ended', wave: 1, seconds: 30 }]);
  assert.equal(score.byCategory.oleadas, 100);
  assert.equal(score.byCategory.sinPerdidas, 0);
});

test('oleada 3 terminada sin pérdidas en 20 s → oleadas 300, sinPerdidas 75, rapidez 570', () => {
  const score = createScore();
  scoreEffects(score, [{ type: 'wave-started', wave: 3, countdownLeft: 0 }]);
  scoreEffects(score, [{ type: 'wave-ended', wave: 3, seconds: 20 }]);

  assert.equal(score.byCategory.oleadas, 300);
  assert.equal(score.byCategory.sinPerdidas, 75);
  // referencia = 40 + 3×6 = 58; bonus = (58−20)×3×5 = 570
  assert.equal(score.byCategory.rapidez, 570);
});

test('wave-started con countdownLeft 12.7 en oleada 2 → adelanto 240', () => {
  const score = createScore();
  const pops = scoreEffects(score, [{ type: 'wave-started', wave: 2, countdownLeft: 12.7 }]);
  assert.equal(score.byCategory.adelanto, 240);
  assert.ok(pops.some((p) => p.category === 'adelanto' && p.points === 240));
});

test('wave-started con countdownLeft 0 → nada', () => {
  const score = createScore();
  const pops = scoreEffects(score, [{ type: 'wave-started', wave: 2, countdownLeft: 0 }]);
  assert.equal(score.byCategory.adelanto, 0);
  assert.equal(pops.length, 0);
});

test('torre destruida con inversión 135 → −270', () => {
  const score = createScore();
  scoreEffects(score, [{ type: 'tower-destroyed', invested: 135 }]);
  assert.equal(score.byCategory.torresPerdidas, -270);
});

test('victoria con 17 vidas → 27000', () => {
  const score = createScore();
  scoreEffects(score, [{ type: 'game-ended', victory: true, lives: 17 }]);
  assert.equal(score.byCategory.victoria, 27000);
});

test('tower-sold no modifica el puntaje', () => {
  const score = createScore();
  const pops = scoreEffects(score, [{ type: 'tower-sold', towerId: 't-1', refund: 50 }]);
  assert.equal(score.total, 0);
  assert.equal(pops.length, 0);
});

test('total es la suma de byCategory', () => {
  const score = createScore();
  scoreEffects(score, [
    { type: 'enemy-killed', reward: 5, veterancy: 1 },
    { type: 'enemy-leaked', livesLost: 1 },
    { type: 'wave-started', wave: 1, countdownLeft: 5 },
    { type: 'wave-ended', wave: 1, seconds: 30 },
  ]);
  const sum = Object.values(score.byCategory).reduce((a, b) => a + b, 0);
  assert.equal(score.total, sum);
});

test('pops lista solo puntos no nulos', () => {
  const score = createScore();
  const pops = scoreEffects(score, [
    { type: 'enemy-killed', reward: 0, veterancy: 0 },
    { type: 'enemy-killed', reward: 3, veterancy: 0 },
  ]);
  assert.equal(pops.length, 1);
  assert.equal(pops[0].points, 30);
});

// ─── Prueba de integración con el núcleo real ─────────────────────────────────

function findFreeCell(state) {
  const grid = state.grid;
  let best = null;
  let bestCount = -1;
  for (let gy = 0; gy < grid.length; gy++) {
    for (let gx = 0; gx < grid[gy].length; gx++) {
      if (grid[gy][gx] !== 0) continue;
      let count = 0;
      for (let py = 0; py < grid.length; py++) {
        for (let px = 0; px < grid[py].length; px++) {
          if (grid[py][px] === 1 && Math.hypot(px - gx, py - gy) <= 3) count++;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        best = { gx, gy };
      }
    }
  }
  return best;
}

test('integración: oleada 1 con mg7-vulcan → oleadas 100, enemigos > 0, waveSeconds = pasos × paso', () => {
  const config = createGameConfig();
  const state = createInitialState(config);
  const score = createScore();
  const fixedStep = GAMEPLAY_CONFIG.simulation.fixedStep;

  // Coloca una mg7-vulcan en la celda libre con más celdas de camino a radio ≤ 3.
  const cell = findFreeCell(state);
  assert.ok(cell, 'debe existir al menos una celda libre');
  assert.ok(placeTower(state, { towerTypeId: 'mg7-vulcan', gx: cell.gx, gy: cell.gy }), 'la torre debe quedar puesta');

  // Inicia la oleada y consume el efecto wave-started.
  startWave(state);
  scoreEffects(score, consumeEffects(state));

  // Avanza hasta que la oleada termine (máx. 20 000 pasos).
  let steps = 0;
  while (state.waveActive && steps < 20000) {
    tickSimulation(state, fixedStep);
    scoreEffects(score, consumeEffects(state));
    steps += 1;
  }

  assert.ok(!state.waveActive, 'la oleada debe haber terminado');
  assert.ok(steps < 20000, 'debe terminar antes del límite de pasos');
  assert.equal(score.byCategory.oleadas, 100);
  assert.ok(score.byCategory.enemigos > 0, 'al menos un enemigo debe haber sido eliminado');

  // El tiempo de simulación debe ser exactamente pasos × paso fijo.
  assert.ok(
    Math.abs(state.waveSeconds - steps * fixedStep) < 1e-9,
    `waveSeconds (${state.waveSeconds}) debe ser pasos (${steps}) × fixedStep (${fixedStep})`,
  );
});
