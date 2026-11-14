// Pruebas de repetición de partidas (spec 003 M2 / spec 002 T05).
// Se construyen logs programáticamente sin navegador y se verifica que la
// simulación reproduce la misma oleada y las mismas vidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';
import {
  applyOrder,
  consumeEffects,
  createGameConfig,
  createInitialState,
  startWave,
  tickSimulation,
  tickWaveCountdown,
} from '../src/core/index.js';
import { replayMatch, recordedOutcome, verifyReplay } from '../tools/balance/replay.mjs';

/** Busca una celda libre (valor 0) en la cuadrícula de un estado fresco. */
function findFreeCell(state) {
  for (let r = 0; r < state.grid.length; r++) {
    for (let c = 0; c < state.grid[r].length; c++) {
      if (state.grid[r][c] === 0) return { fila: r, columna: c };
    }
  }
  throw new Error('no hay celda libre en la cuadrícula');
}

/**
 * Simula una partida como lo haría el juego y devuelve un log válido.
 * ordersByStep: objeto { paso: [orden, ...] } — solo se registran las aceptadas.
 */
function record(ordersByStep, totalSteps) {
  const state = createInitialState(createGameConfig());
  const step = GAMEPLAY_CONFIG.simulation.fixedStep;
  const ordenes = [];
  const oleadas = [];
  let currentWave = null;

  for (let s = 0; s < totalSteps; s++) {
    const orders = ordersByStep[s] || [];
    for (const order of orders) {
      if (applyOrder(state, order)) {
        ordenes.push({ paso: s, ...order });
      }
    }
    tickSimulation(state, step);
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
      }
    }
  }

  // Forma del grabador: { oleada, vidasFin, creditosFin, enemigos: { total: { dano } } }
  const oleadasGrabadas = oleadas.map((w) => ({
    oleada: w.oleada,
    vidasFin: w.vidasFin,
    creditosFin: w.creditosFin,
    enemigos: { total: { dano: Math.round(w.dano * 1000) / 1000 } },
  }));

  return {
    formato: 2,
    semilla: GAMEPLAY_CONFIG.waves.seed,
    pasoFijo: GAMEPLAY_CONFIG.simulation.fixedStep,
    pasos: totalSteps,
    modoDesarrollo: false,
    ordenes,
    oleadas: oleadasGrabadas,
    resultado: {
      victoria: state.victory,
      oleada: state.wave,
      vidas: Math.max(0, state.lives),
      creditos: state.credits,
      segundos: 0,
      pasos: totalSteps,
    },
  };
}

test('a) torre en paso 0 + oleada en paso 60: repetición exacta', () => {
  const fresh = createInitialState(createGameConfig());
  const cell = findFreeCell(fresh);

  const log = record(
    {
      0: [{ tipo: 'torre', id: 'mg7-vulcan', fila: cell.fila, columna: cell.columna }],
      60: [{ tipo: 'oleada' }],
    },
    3000,
  );

  const { exacta, repetida } = verifyReplay(log);
  assert.equal(exacta, true, 'la repetición debe ser exacta');
  assert.ok(repetida.oleada >= 1, `se esperaba oleada >= 1, se obtuvo ${repetida.oleada}`);
});

test('b) dos corridas de replayMatch sobre el mismo log dan resultados idénticos', () => {
  const fresh = createInitialState(createGameConfig());
  const cell = findFreeCell(fresh);

  const log = record(
    {
      0: [{ tipo: 'torre', id: 'mg7-vulcan', fila: cell.fila, columna: cell.columna }],
      60: [{ tipo: 'oleada' }],
    },
    2000,
  );

  const primera = replayMatch(log);
  const segunda = replayMatch(log);
  assert.deepEqual(segunda, primera, 'dos corridas deben ser idénticas');
});

test('c) modoDesarrollo y formato inválido lanzan error', () => {
  const base = {
    formato: 2,
    semilla: GAMEPLAY_CONFIG.waves.seed,
    pasoFijo: GAMEPLAY_CONFIG.simulation.fixedStep,
    pasos: 100,
    modoDesarrollo: false,
    ordenes: [],
    oleadas: [],
    resultado: null,
  };

  assert.throws(
    () => replayMatch({ ...base, modoDesarrollo: true }),
    /modo desarrollo/,
  );
  assert.throws(
    () => replayMatch({ ...base, formato: 1 }),
    /formato/,
  );
});

test('d) cambiar el paso de la oleada (60→600) no produce órdenes rechazadas', () => {
  const fresh = createInitialState(createGameConfig());
  const cell = findFreeCell(fresh);

  const log = record(
    {
      0: [{ tipo: 'torre', id: 'mg7-vulcan', fila: cell.fila, columna: cell.columna }],
      60: [{ tipo: 'oleada' }],
    },
    3000,
  );

  // Modifica el paso de la orden de oleada de 60 a 600.
  const logModificado = {
    ...log,
    ordenes: log.ordenes.map((o) => (o.tipo === 'oleada' ? { ...o, paso: 600 } : o)),
  };

  const resultado = replayMatch(logModificado);
  assert.equal(resultado.ordenesRechazadas, 0, 'no debe haber órdenes rechazadas');
});

test('e) una orden con paso mayor que «pasos» nunca se aplica', () => {
  const fresh = createInitialState(createGameConfig());
  const cell = findFreeCell(fresh);

  const log = {
    formato: 2,
    semilla: GAMEPLAY_CONFIG.waves.seed,
    pasoFijo: GAMEPLAY_CONFIG.simulation.fixedStep,
    pasos: 100,
    modoDesarrollo: false,
    ordenes: [
      { tipo: 'torre', id: 'mg7-vulcan', fila: cell.fila, columna: cell.columna, paso: 200 },
    ],
    oleadas: [],
    resultado: null,
  };

  const resultado = replayMatch(log);
  assert.equal(resultado.pasos, 100, 'la repetición debe terminar en «pasos»');
  assert.equal(resultado.ordenesRechazadas, 0, 'la orden no se procesó, no se rechazó');
});

test('g) verifyReplay con oleadas grabadas: exacta y sin primeraDiferencia', () => {
  const fresh = createInitialState(createGameConfig());
  const cell = findFreeCell(fresh);

  const log = record(
    {
      0: [{ tipo: 'torre', id: 'mg7-vulcan', fila: cell.fila, columna: cell.columna }],
      60: [{ tipo: 'oleada' }],
    },
    3000,
  );

  const { exacta, primeraDiferencia } = verifyReplay(log);
  assert.equal(exacta, true, 'la repetición debe ser exacta incluyendo oleadas');
  assert.equal(primeraDiferencia, null, 'no debe haber ninguna diferencia');
});

test('h) alterar creditosFin de la primera oleada: exacta=false y campo=creditosFin', () => {
  const fresh = createInitialState(createGameConfig());
  const cell = findFreeCell(fresh);

  const log = record(
    {
      0: [{ tipo: 'torre', id: 'mg7-vulcan', fila: cell.fila, columna: cell.columna }],
      60: [{ tipo: 'oleada' }],
    },
    3000,
  );

  // Altera creditosFin de la primera oleada grabada.
  log.oleadas[0] = { ...log.oleadas[0], creditosFin: (log.oleadas[0].creditosFin ?? 0) + 999 };

  const { exacta, primeraDiferencia } = verifyReplay(log);
  assert.equal(exacta, false, 'la repetición no debe ser exacta');
  assert.equal(primeraDiferencia.campo, 'creditosFin', 'el campo divergente debe ser creditosFin');
});

test('f) recordedOutcome usa la última oleada terminada cuando resultado es null', () => {
  const log = {
    formato: 2,
    semilla: GAMEPLAY_CONFIG.waves.seed,
    pasoFijo: GAMEPLAY_CONFIG.simulation.fixedStep,
    pasos: 500,
    modoDesarrollo: false,
    ordenes: [],
    oleadas: [
      { oleada: 1, vidasFin: 7, creditosFin: 250 },
      { oleada: 2, vidasFin: null, creditosFin: null },
    ],
    resultado: null,
  };

  const out = recordedOutcome(log);
  assert.equal(out.oleada, 1);
  assert.equal(out.vidas, 7);
  assert.equal(out.creditos, 250);
});
