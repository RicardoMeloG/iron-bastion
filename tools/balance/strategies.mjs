// Estrategias fijas para medir el balance sin pantalla (spec 001, CA-4). Las usan
// npm run simulate (que muestra la tabla) y tests/balance.test.js (que exige las metas).
// Juegan las 10 oleadas solo con el núcleo (src/core) y miden vidas, créditos y aciertos
// de las torres y de los vehículos (impactos / disparos).
import { readFileSync } from 'node:fs';

import { GAMEPLAY_CONFIG } from '../../src/content/gameplay.js';
import { createDefaultWaveSet } from '../../src/content/waves/defaultWaveSet.js';
import { clearCover, consumeEffects, createGameConfig, createInitialState, placeTower, startWave, tickSimulation, upgradeTower, upgradeTowerDefense } from '../../src/core/index.js';

const DT = GAMEPLAY_CONFIG.simulation.fixedStep;
const VARIANT_SEEDS = [1337, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MAX_WAVE_SECONDS = 600;

function cellsByCoverage(state, towerTypeId) {
  const grid = state.grid;
  const range = state.config.towerDefinitions[towerTypeId].levels[0].range;
  const cells = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] !== 0) continue;
      let coverage = 0;
      for (let py = 0; py < grid.length; py++) {
        for (let px = 0; px < grid[0].length; px++) {
          if (grid[py][px] === 1 && Math.hypot(px - x, py - y) <= range) coverage++;
        }
      }
      // Y la línea recta de la entrada a la base, por donde cruza la infantería.
      const [fromX, fromY] = state.config.mapDefinition.pathPoints[0];
      const [toX, toY] = state.config.mapDefinition.pathPoints.at(-1);
      for (let px = 0; px <= toX; px++) {
        if (Math.hypot(px - x, fromY + ((toY - fromY) * (px - fromX)) / (toX - fromX) - y) <= range) coverage += 2;
      }
      cells.push({ x, y, coverage });
    }
  }
  return cells.sort((a, b) => b.coverage - a.coverage);
}

function placeBest(state, towerTypeId = 'mg7-vulcan') {
  const best = cellsByCoverage(state, towerTypeId)[0];
  return Boolean(best && placeTower(state, { towerTypeId, gx: best.x, gy: best.y }));
}

const count = (state, towerTypeId) => state.towers.filter((tower) => tower.towerTypeId === towerTypeId).length;

/** Pone torres hasta tener las del plan ({ tipo: cantidad }) y con lo que sobra mejora la más débil. */
function buildAndUpgrade(state, plan) {
  for (;;) {
    const missing = Object.entries(plan).find(([towerTypeId, wanted]) => count(state, towerTypeId) < wanted);
    if (missing && placeBest(state, missing[0])) continue;
    if (missing) break;
    const weakest = [...state.towers].sort((a, b) => a.level - b.level)[0];
    if (weakest && upgradeTower(state, weakest.id)) continue;
    break;
  }
}

/** Compra en orden lo que falte de la lista [tipo, número de torre, nivel, blindaje]; ahorra si no le alcanza. */
function buyInOrder(state, order) {
  for (const [towerTypeId, index, level, tier = 0] of order) {
    const towers = () => state.towers.filter((tower) => tower.towerTypeId === towerTypeId);
    if (towers().length <= index && !placeBest(state, towerTypeId)) return;
    const tower = towers()[index];
    while (tower.level < level) {
      if (!upgradeTower(state, tower.id)) return;
    }
    while (tower.defenseTier < tier) {
      if (!upgradeTowerDefense(state, tower.id)) return;
    }
  }
}

const readPurchases = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')).compras;
const referenceProgress = new WeakMap();

/** Repite las compras de una partida real, en su orden y con el dinero que haya; también durante la oleada. */
function replayPurchases(purchases) {
  const buy = (state) => {
    const progress = referenceProgress.get(state) ?? { next: 0, towers: [] };
    referenceProgress.set(state, progress);
    for (; progress.next < purchases.length; progress.next++) {
      const [kind, wave, a, b, c] = purchases[progress.next];
      if (wave > state.wave + (state.waveActive ? 0 : 1)) return;
      if (kind === 'torre') {
        if (state.grid[c][b] !== 0) continue;
        const tower = placeTower(state, { towerTypeId: a, gx: b, gy: c });
        if (!tower) return;
        progress.towers.push(tower);
      } else if (kind === 'roca') {
        const rock = state.rocks.find((item) => item.gx === a && item.gy === b);
        if (rock && !clearCover(state, rock.id)) return;
      } else {
        const tower = progress.towers[a];
        if (tower && !(kind === 'ataque' ? upgradeTower : upgradeTowerDefense)(state, tower.id)) return;
      }
    }
  };
  buy.duringWave = true;
  return buy;
}
const buyAsReferenceGame = replayPurchases(readPurchases('./reference-game.json'));

const { compras: WHOLE_GAME_PURCHASES } = JSON.parse(readFileSync(new URL('./reference-game-20.json', import.meta.url), 'utf8'));

/** Pone la torre en su celda; si hoy está ocupada, en la libre más cercana. */
function placeNear(state, towerTypeId, gx, gy) {
  for (let distance = 0; distance < 6; distance++) {
    for (let dy = -distance; dy <= distance; dy++) {
      for (let dx = -distance; dx <= distance; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== distance) continue;
        if (state.grid[gy + dy]?.[gx + dx] !== 0) continue;
        const tower = placeTower(state, { towerTypeId, gx: gx + dx, gy: gy + dy });
        if (tower) return tower;
      }
    }
  }
  return null;
}

// Antes de que lleguen más drones, antiaérea cerca de por donde entran: oleada, celda.
const ANTI_AIR_PLAN = [[9, 8, 7], [12, 12, 4], [14, 8, 3], [17, 19, 7]];

// Quien juega como una persona: las compras de una partida real de 20 oleadas, en su orden. Compra lo
// que toca, y espera si no alcanza. Esa partida se ganó sin apenas antiaérea, y eso ya no alcanza:
// se adapta comprándola a tiempo. Con lo que sobra, recupera el blindaje que le rompieron los drones
// y mejora la torre más débil.
function buyForTheWholeGame(state) {
  const progress = referenceProgress.get(state) ?? { next: 0, towers: [], antiAir: [] };
  referenceProgress.set(state, progress);
  for (let index = progress.antiAir.length; index < ANTI_AIR_PLAN.length; index++) {
    const [wave, gx, gy] = ANTI_AIR_PLAN[index];
    if (wave > state.wave + (state.waveActive ? 0 : 1)) break;
    if (state.credits < state.config.towerDefinitions['aa3-halcon'].economy.baseCost) return;
    const tower = placeNear(state, 'aa3-halcon', gx, gy);
    if (!tower) return;
    progress.antiAir.push(tower);
  }
  for (const tower of progress.antiAir) {
    const wanted = Math.min(state.wave >= 16 ? 3 : state.wave >= 13 ? 2 : state.wave >= 10 ? 1 : 0, tower.level + 1);
    if (tower.level < wanted && !upgradeTower(state, tower.id)) return;
  }
  for (; progress.next < WHOLE_GAME_PURCHASES.length; progress.next++) {
    const [kind, wave, a, b, c] = WHOLE_GAME_PURCHASES[progress.next];
    if (wave > state.wave + (state.waveActive ? 0 : 1)) break;
    if (kind === 'torre') {
      if (state.credits < state.config.towerDefinitions[a].economy.baseCost) return;
      const tower = placeNear(state, a, b, c);
      if (!tower) return;
      progress.towers.push(tower);
    } else if (kind === 'roca') {
      const rock = state.rocks.find((item) => item.gx === a && item.gy === b);
      if (rock && !clearCover(state, rock.id)) return;
    } else {
      const tower = progress.towers[a];
      if (!tower) continue;
      const atMaximum = kind === 'ataque' ? tower.level >= state.config.towerDefinitions[tower.towerTypeId].levels.length - 1 : tower.defenseTier >= 2;
      if (!atMaximum && !(kind === 'ataque' ? upgradeTower : upgradeTowerDefense)(state, tower.id)) return;
    }
  }
  const leastArmored = [...progress.towers].sort((x, y) => x.defenseTier - y.defenseTier);
  for (const tower of leastArmored) if (tower.defenseTier < 1 && upgradeTowerDefense(state, tower.id)) return;
  const weakest = [...progress.towers, ...progress.antiAir].sort((x, y) => x.level - y.level);
  for (const tower of weakest) if (upgradeTower(state, tower.id)) return;
  for (const tower of leastArmored) if (upgradeTowerDefense(state, tower.id)) return;
}
buyForTheWholeGame.duringWave = true;

const MG7 = 'mg7-vulcan';
const LM2 = 'lm2-lanza';
// Lo que haría quien juega bien: evoluciona la primera torre, suma lanzamisiles para los blindados
// y blinda las que reciben el fuego.
const GOOD_PLAYER_ORDER = [
  [MG7, 0, 0], [MG7, 0, 1], [MG7, 1, 0], [MG7, 1, 1], [MG7, 0, 2], [LM2, 0, 0], [MG7, 1, 2], [LM2, 1, 0], [LM2, 0, 1], [LM2, 0, 1, 1], [LM2, 1, 1], [LM2, 1, 1, 1],
  [MG7, 0, 2, 1], [MG7, 1, 2, 1], [LM2, 0, 2, 1], [LM2, 1, 2, 1], [MG7, 2, 1], [LM2, 2, 0], [LM2, 2, 1, 1], [MG7, 2, 2, 1], [LM2, 0, 3, 1], [LM2, 1, 3, 1], [LM2, 2, 2, 1], [MG7, 0, 3, 1],
  [MG7, 3, 2, 1], [LM2, 3, 2, 1], [MG7, 1, 3, 1], [LM2, 2, 3, 1], [LM2, 3, 3, 1], [MG7, 2, 3, 1],
];

export const STRATEGIES = {
  'una-torre': (state) => {
    if (state.towers.length === 0) placeBest(state);
  },
  'solo-torres': (state) => {
    while (placeBest(state));
  },
  // Seis MG-7 mejoradas y nada contra blindaje: los tanques no deberían caer (spec 002, CA-2).
  'solo-mg7': (state) => buildAndUpgrade(state, { 'mg7-vulcan': 6 }),
  // Solo lanzamisiles: gastar misiles en ligeros tiene que salir mal, con muchas torres sin
  // mejorar y con pocas muy mejoradas.
  'solo-lm2': (state) => {
    while (placeBest(state, 'lm2-lanza'));
  },
  'solo-lm2-mejoradas': (state) => buildAndUpgrade(state, { 'lm2-lanza': 5 }),
  // Las dos torres en la proporción de la mixta, pero sin una sola mejora.
  'mixta-sin-mejorar': (state) => {
    for (let placed = true; placed;) {
      const mg7 = count(state, 'mg7-vulcan');
      placed = mg7 < 4 || mg7 < count(state, 'lm2-lanza') ? placeBest(state, 'mg7-vulcan') : placeBest(state, 'lm2-lanza');
    }
  },
  'buen-jugador': (state) => buyInOrder(state, GOOD_PLAYER_ORDER),
  'partida-real': buyAsReferenceGame,
  'partida-completa': buyForTheWholeGame,
  // La primera ganada con la LM-2 lenta y la defensa activa (07-11-2026): mide el final de la partida.
  'partida-ganada': replayPurchases(readPurchases('./reference-game-0711.json')),
};

function playWave(state, duringWave = null) {
  let shots = 0;
  let hits = 0;
  let enemyShots = 0;
  let enemyHits = 0;
  let towersDestroyed = 0;
  let seconds = 0;
  // Por tipo de vehículo: daño recibido por tipo de torre, destruidos y los que llegaron a la base.
  const byEnemy = {};
  const enemyRow = (enemyTypeId) => (byEnemy[enemyTypeId] ??= { damageBy: {}, killed: 0, leaked: 0 });
  const towerTypes = new Map(state.towers.map((tower) => [tower.id, tower.towerTypeId]));
  consumeEffects(state);
  let peakAlive = 0;
  while (state.waveActive && !state.gameOver && seconds < MAX_WAVE_SECONDS) {
    duringWave?.(state);
    tickSimulation(state, DT);
    peakAlive = Math.max(peakAlive, state.enemies.length);
    seconds += DT;
    // Los disparos se cuentan por su evento: una bala que pega en el mismo paso en que sale ya
    // no está en state.projectiles al terminarlo. 'hit' directo: una bala de torre le pegó a un
    // vehículo (el daño de área no cuenta); 'tower-hit': una de vehículo, a una torre.
    const effects = consumeEffects(state);
    shots += effects.filter((effect) => effect.type === 'projectile-fired').length;
    hits += effects.filter((effect) => effect.type === 'hit' || effect.type === 'cover-hit').length;
    enemyShots += effects.filter((effect) => effect.type === 'enemy-projectile-fired').length;
    enemyHits += effects.filter((effect) => effect.type === 'tower-hit' && !effect.splash).length;
    towersDestroyed += effects.filter((effect) => effect.type === 'tower-destroyed').length;
    for (const effect of effects) {
      if (effect.type === 'hit') {
        const { damageBy } = enemyRow(effect.enemyTypeId);
        const towerTypeId = towerTypes.get(effect.towerId);
        damageBy[towerTypeId] = (damageBy[towerTypeId] ?? 0) + effect.damage;
      } else if (effect.type === 'enemy-killed') {
        enemyRow(effect.enemyTypeId).killed += 1;
      } else if (effect.type === 'enemy-leaked') {
        enemyRow(effect.enemyTypeId).leaked += 1;
      }
    }
  }
  return {
    shots,
    accuracy: shots > 0 ? hits / shots : null,
    enemyShots,
    enemyAccuracy: enemyShots > 0 ? enemyHits / enemyShots : null,
    towersDestroyed,
    peakAlive,
    byEnemy,
  };
}

export function runStrategy(name, strategy = STRATEGIES[name], { seed } = {}) {
  const state = createInitialState(createGameConfig());
  if (seed !== undefined) state.config.waveSet = createDefaultWaveSet(seed);
  const waves = [];
  const total = state.config.waveSet.waves.length;
  for (let wave = 1; wave <= total && !state.gameOver; wave++) {
    strategy(state);
    const livesBefore = state.lives;
    if (!startWave(state)) break;
    const enemies = state.spawnQueue.length;
    const { shots, accuracy, enemyShots, enemyAccuracy, towersDestroyed, peakAlive, byEnemy } = playWave(state, strategy.duringWave ? strategy : null);
    waves.push({
      wave,
      enemies,
      livesLost: livesBefore - state.lives,
      lives: state.lives,
      credits: state.credits,
      towers: state.towers.length,
      shots,
      accuracy,
      enemyShots,
      enemyAccuracy,
      towersDestroyed,
      peakAlive,
      treesLeft: state.trees.length,
      byEnemy,
      towerLevels: state.towers.map((tower) => tower.level),
    });
  }
  const result = state.victory ? 'victoria' : state.gameOver ? 'derrota' : 'incompleta';
  return { strategy: name, result, lastWave: waves.at(-1)?.wave ?? 0, waves };
}

/**
 * Una oleada a medida contra torres puestas a mano: `towers` son { towerTypeId, level, count } y
 * `spawns`, los vehículos. Para medir un cruce concreto (cuánto le hacen seis MG-7 a un tanque)
 * sin depender de que la estrategia llegue viva a esa oleada.
 */
export function runMatchup(towers, spawns) {
  const state = createInitialState(createGameConfig());
  state.credits = Number.POSITIVE_INFINITY;
  state.lives = spawns.length + 1;
  for (const { towerTypeId, level, count: wanted } of towers) {
    for (let index = 0; index < wanted; index++) {
      assert(placeBest(state, towerTypeId), `no cabe la torre ${towerTypeId}`);
      const tower = state.towers.at(-1);
      for (let upgrade = 0; upgrade < level; upgrade++) upgradeTower(state, tower.id);
    }
  }
  assert(startWave(state, { overrideWaveDefinition: { interval: 1, spawns } }), 'no empezó la oleada');
  return { ...playWave(state), livesLost: spawns.length + 1 - state.lives };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** El resultado es caótico: una sola corrida no dice mucho. Juega la estrategia con varios órdenes de enemigos. */
export function runSeeds(name, seeds = VARIANT_SEEDS) {
  const runs = seeds.map((seed) => runStrategy(name, STRATEGIES[name], { seed }));
  const lives = runs.map((run) => Math.max(0, run.waves.at(-1).lives)).sort((a, b) => a - b);
  const middle = lives.length / 2;
  return {
    runs,
    wins: runs.filter((run) => run.result === 'victoria').length,
    lives,
    medianLives: (lives[Math.floor(middle - 0.5)] + lives[Math.floor(middle)]) / 2,
  };
}

export function runAll() {
  return Object.entries(STRATEGIES).map(([name, strategy]) => runStrategy(name, strategy));
}
