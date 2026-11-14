// Reproduce una partida grabada (spec 003 M2 / spec 002 T05): el simulador repite la
// partida (semilla + órdenes con su paso) a través del mismo applyOrder que el juego,
// y debe llegar a la misma oleada con las mismas vidas.
//
// Nota: los créditos se reportan pero NO forman parte de «exacta» (el registro se envía
// en un límite de fotograma y las recompensas de matanza del mismo fotograma pueden
// diferir en un paso; las oleadas y las vidas no cambian entre el fin de una oleada
// y el inicio de la siguiente).
import { GAMEPLAY_CONFIG } from '../../src/content/gameplay.js';
import { createDefaultWaveSet } from '../../src/content/waves/defaultWaveSet.js';
import {
  applyOrder,
  consumeEffects,
  createGameConfig,
  createInitialState,
  startWave,
  tickSimulation,
  tickWaveCountdown,
} from '../../src/core/index.js';

/** Repite una partida grabada sin pantalla. */
export function replayMatch(log, { untilStep = log.pasos } = {}) {
  if (log.formato !== 2) {
    throw new Error(`formato de registro no soportado: se esperaba 2, se recibió ${log.formato}`);
  }
  if (log.modoDesarrollo) {
    throw new Error('una partida en modo desarrollo no se puede repetir');
  }
  if (log.pasoFijo !== GAMEPLAY_CONFIG.simulation.fixedStep) {
    throw new Error(
      `paso fijo del registro (${log.pasoFijo}) no coincide con la configuración (${GAMEPLAY_CONFIG.simulation.fixedStep})`,
    );
  }

  const state = createInitialState(createGameConfig());
  if (typeof log.semilla === 'number' && log.semilla !== GAMEPLAY_CONFIG.waves.seed) {
    state.config.waveSet = createDefaultWaveSet(log.semilla);
  }

  const step = GAMEPLAY_CONFIG.simulation.fixedStep;
  const orders = log.ordenes;
  let steps = 0;
  let next = 0;
  let rejected = 0;
  const oleadas = [];
  let currentWave = null;

  while (true) {
    // Aplica las órdenes del paso actual.
    while (next < orders.length && orders[next].paso === steps) {
      if (!applyOrder(state, orders[next])) rejected++;
      next++;
    }
    // Una orden cuyo paso es menor al actual se saltó por error: se cuenta como
    // rechazada y se avanza para no entrar en bucle infinito.
    while (next < orders.length && orders[next].paso < steps) {
      rejected++;
      next++;
    }
    if (steps >= untilStep) break;
    tickSimulation(state, step);
    steps++;
    if (tickWaveCountdown(state, step)) startWave(state);
    const effects = consumeEffects(state);
    for (const effect of effects) {
      if (effect.type === 'wave-started') {
        currentWave = { oleada: effect.wave, vidasFin: null, creditosFin: null, dano: 0 };
        oleadas.push(currentWave);
      } else if (effect.type === 'hit' && currentWave) {
        currentWave.dano += effect.damage;
      } else if (effect.type === 'burn-damage' && currentWave) {
        for (const dmg of Object.values(effect.byEnemy ?? {})) {
          currentWave.dano += dmg;
        }
      } else if (effect.type === 'wave-ended' && currentWave) {
        currentWave.vidasFin = effect.lives;
        currentWave.creditosFin = effect.credits;
        currentWave = null;
      } else if (effect.type === 'game-ended' && currentWave && currentWave.vidasFin === null) {
        currentWave.vidasFin = effect.lives;
        currentWave.creditosFin = effect.credits;
        currentWave = null;
      }
    }
  }

  for (const w of oleadas) {
    w.dano = Math.round(w.dano * 1000) / 1000;
  }

  return {
    oleada: state.wave,
    vidas: Math.max(0, state.lives),
    creditos: state.credits,
    victoria: state.victory,
    derrota: state.gameOver && !state.victory,
    pasos: steps,
    ordenesRechazadas: rejected,
    oleadas,
  };
}

/** Lo que el registro dice que pasó, para comparar. */
export function recordedOutcome(log) {
  if (log.resultado) {
    return {
      oleada: log.resultado.oleada,
      vidas: Math.max(0, log.resultado.vidas),
      creditos: log.resultado.creditos,
    };
  }
  for (let i = log.oleadas.length - 1; i >= 0; i--) {
    const w = log.oleadas[i];
    if (w && w.vidasFin !== null) {
      return { oleada: w.oleada, vidas: w.vidasFin, creditos: w.creditosFin };
    }
  }
  return { oleada: 0, vidas: null, creditos: null };
}

/** Extrae las oleadas del registro (última entrada por número de oleada). */
export function recordedWaves(log) {
  const map = new Map();
  for (const entry of log.oleadas) {
    map.set(entry.oleada, entry);
  }
  const result = [];
  for (const [oleada, entry] of map) {
    const dano = Object.values(entry.enemigos ?? {}).reduce((sum, e) => sum + e.dano, 0);
    result.push({
      oleada,
      vidasFin: entry.vidasFin,
      creditosFin: entry.creditosFin,
      dano: Math.round(dano * 1000) / 1000,
    });
  }
  return result;
}

/** Repite y compara: { exacta, grabada, repetida, primeraDiferencia }. */
export function verifyReplay(log) {
  const repetida = replayMatch(log);
  const grabada = recordedOutcome(log);
  const exacta =
    repetida.oleada === grabada.oleada &&
    repetida.vidas === grabada.vidas &&
    repetida.ordenesRechazadas === 0;

  // Comparación por oleada (solo las presentes en el registro).
  const grabadas = recordedWaves(log);
  const repetidasMap = new Map();
  for (const w of repetida.oleadas) {
    repetidasMap.set(w.oleada, w);
  }

  let primeraDiferencia = null;
  let oleadasExactas = true;
  for (const g of grabadas) {
    const r = repetidasMap.get(g.oleada);
    if (!r) {
      oleadasExactas = false;
      primeraDiferencia = primeraDiferencia ?? { oleada: g.oleada, campo: 'oleada', grabado: g.vidasFin, repetido: null };
      continue;
    }
    if (g.vidasFin !== r.vidasFin) {
      oleadasExactas = false;
      primeraDiferencia = primeraDiferencia ?? { oleada: g.oleada, campo: 'vidasFin', grabado: g.vidasFin, repetido: r.vidasFin };
    }
    if (g.creditosFin !== r.creditosFin) {
      oleadasExactas = false;
      primeraDiferencia = primeraDiferencia ?? { oleada: g.oleada, campo: 'creditosFin', grabado: g.creditosFin, repetido: r.creditosFin };
    }
    if (Math.abs(g.dano - r.dano) >= 0.01) {
      oleadasExactas = false;
      primeraDiferencia = primeraDiferencia ?? { oleada: g.oleada, campo: 'dano', grabado: g.dano, repetido: r.dano };
    }
  }

  return { exacta: exacta && oleadasExactas, grabada, repetida, primeraDiferencia };
}
