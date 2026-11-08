import { GAMEPLAY_CONFIG } from '../gameplay.js';

const W = GAMEPLAY_CONFIG.waves;

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return function next() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

// La oleada trae lo que dice GAMEPLAY_CONFIG.waves.composition; el azar (fijo) solo decide el orden.
function createWave(composition, index, seed) {
  const random = createSeededRandom(seed + index);
  const spawns = shuffle(Object.entries(composition).flatMap(([enemyTypeId, count]) => Array(count).fill(enemyTypeId)), random);
  const { byWave, ...squadRules } = W.squads;
  const squad = byWave[index + 1] ? { ...squadRules, ...byWave[index + 1] } : null;
  return {
    id: `wave-${index + 1}`,
    count: spawns.length,
    interval: squad?.interval ?? Math.max(W.interval.min, W.interval.base - index * W.interval.decayPerWave),
    squad,
    infantryTeams: true,
    spawns,
  };
}

/** Con otra semilla, las mismas oleadas en otro orden: mide el balance con más de una corrida. */
export function createDefaultWaveSet(seed = W.seed) {
  return {
    id: 'default-waves',
    waves: W.composition.map((composition, index) => createWave(composition, index, seed)),
  };
}

export const defaultWaveSetDefinition = createDefaultWaveSet();
