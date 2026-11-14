import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder, createGameConfig, createInitialState } from '../src/core/index.js';

const setup = () => createInitialState(createGameConfig());

/** Devuelve la primera celda libre `[x, y]` donde `state.grid[y][x] === 0`. */
function freeCell(state) {
  for (let y = 0; y < state.grid.length; y++) {
    for (let x = 0; x < state.grid[y].length; x++) {
      if (state.grid[y][x] === 0) return [x, y];
    }
  }
  throw new Error('No hay celdas libres');
}

test('torre: coloca en celda libre y rechaza duplicado', (t) => {
  const state = setup();
  const [gx, gy] = freeCell(state);

  const ok = applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: [gx, gy] });
  assert.equal(ok, true);
  assert.equal(state.towers.length, 1);
  assert.equal(state.towers[0].gx, gx);
  assert.equal(state.towers[0].gy, gy);

  const dup = applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: [gx, gy] });
  assert.equal(dup, false);
});

test('ataque: mejora nivel a 1; celda vacía devuelve false', (t) => {
  const state = setup();
  const [gx, gy] = freeCell(state);
  applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: [gx, gy] });

  state.credits = 10000;
  const ok = applyOrder(state, { tipo: 'ataque', celda: [gx, gy] });
  assert.equal(ok, true);
  assert.equal(state.towers[0].level, 1);

  // Celda vacía (sin torre)
  const empty = freeCell(state);
  const fail = applyOrder(state, { tipo: 'ataque', celda: empty });
  assert.equal(fail, false);
});

test('blindaje: eleva defenseTier a 1', (t) => {
  const state = setup();
  const [gx, gy] = freeCell(state);
  applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: [gx, gy] });

  state.credits = 10000;
  const ok = applyOrder(state, { tipo: 'blindaje', celda: [gx, gy] });
  assert.equal(ok, true);
  assert.equal(state.towers[0].defenseTier, 1);
});

test('vender: elimina la torre y libera la celda', (t) => {
  const state = setup();
  const [gx, gy] = freeCell(state);
  applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: [gx, gy] });
  assert.equal(state.towers.length, 1);

  const ok = applyOrder(state, { tipo: 'vender', celda: [gx, gy] });
  assert.equal(ok, true);
  assert.equal(state.towers.length, 0);
  assert.equal(state.grid[gy][gx], 0);
});

test('despejar: elimina la roca de state.rocks', (t) => {
  const state = setup();
  assert.ok(state.rocks.length > 0, 'Se espera al menos una roca');
  const rock = state.rocks[0];
  const [gx, gy] = [rock.gx, rock.gy];

  state.credits = 10000;
  const ok = applyOrder(state, { tipo: 'despejar', celda: [gx, gy] });
  assert.equal(ok, true);
  assert.equal(state.rocks.some((r) => r.id === rock.id), false);
});

test('oleada y reintentar: ciclo de activación y reinicio', (t) => {
  const state = setup();

  const started = applyOrder(state, { tipo: 'oleada' });
  assert.equal(started, true);
  assert.equal(state.waveActive, true);

  const retried = applyOrder(state, { tipo: 'reintentar' });
  assert.equal(retried, true);
  assert.equal(state.waveActive, false);

  const retriedAgain = applyOrder(state, { tipo: 'reintentar' });
  assert.equal(retriedAgain, false);
});

test('órdenes inválidas: tipo desconocido, celda nula o no entera → false sin lanzar', (t) => {
  const state = setup();

  assert.equal(applyOrder(state, { tipo: 'inexistente', celda: [0, 0] }), false);
  assert.equal(applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: null }), false);
  assert.equal(applyOrder(state, { tipo: 'torre', torre: 'mg7-vulcan', celda: [1.5, 2] }), false);
});
