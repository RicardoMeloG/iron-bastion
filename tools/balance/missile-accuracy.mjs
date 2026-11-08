// Puntería del misil guiado de la LM-2 según el vehículo (spec 002). Pone una LM-2 junto al
// camino (en varias celdas, una por prueba), le manda una columna de un solo tipo y cuenta
// misiles disparados, impactos y fallos. La usan tests/missile.test.js y npm run simulate.
import { consumeEffects, createGameConfig, createInitialState, placeTower, startWave, tickSimulation } from '../../src/core/index.js';

const DT = 1 / 60;

/** Celdas libres junto al camino, de la que más camino ve a la que menos. */
function cellsNextToPath(state) {
  const grid = state.grid;
  const cells = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] !== 0) continue;
      let coverage = 0;
      for (let py = 0; py < grid.length; py++) {
        for (let px = 0; px < grid[0].length; px++) {
          if (grid[py][px] === 1 && Math.hypot(px - x, py - y) <= 4) coverage++;
        }
      }
      cells.push({ x, y, coverage });
    }
  }
  return cells.sort((a, b) => b.coverage - a.coverage);
}

/** Suma de varias pruebas, una por cada una de las `positions` celdas que más camino ven. */
export function measureMissileAccuracy(enemyTypeId, { positions = 4, ...options } = {}) {
  const runs = Array.from({ length: positions }, (_, index) => measureFromCell(enemyTypeId, index, options));
  const total = (key) => runs.reduce((sum, run) => sum + run[key], 0);
  const fired = total('fired');
  return { enemyTypeId, fired, hits: total('hits'), missed: total('missed'), accuracy: fired ? total('hits') / fired : null };
}

function measureFromCell(enemyTypeId, cellIndex, { count = 8, towerTypeId = 'lm2-lanza', level = 0 } = {}) {
  const state = createInitialState(createGameConfig());
  state.credits = 100000;
  state.lives = 1000;
  const cell = cellsNextToPath(state)[cellIndex];
  const tower = placeTower(state, { towerTypeId, gx: cell.x, gy: cell.y });
  tower.level = level;
  startWave(state, { overrideWaveDefinition: { interval: 2.5, spawns: Array.from({ length: count }, () => enemyTypeId) } });
  // Los vehículos no le disparan a la torre: se mide solo la puntería del misil.
  for (const enemy of state.enemies) enemy.isArmed = false;
  let fired = 0;
  let hits = 0;
  let missed = 0;
  for (let seconds = 0; state.waveActive && seconds < 900; seconds += DT) {
    tickSimulation(state, DT);
    for (const enemy of state.enemies) enemy.isArmed = false;
    for (const effect of consumeEffects(state)) {
      if (effect.type === 'projectile-fired') fired++;
      else if (effect.type === 'hit') hits++;
      else if (effect.type === 'missile-missed') missed++;
    }
  }
  return { fired, hits, missed };
}
