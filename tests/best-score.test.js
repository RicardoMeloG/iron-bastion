import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { BEST_SCORE_KEY, loadBestScore, saveBestScore } from '../src/app/best-score.js';

/** Almacenamiento falso basado en Map. */
function makeFakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** Almacenamiento que siempre lanza. */
function makeThrowingStorage() {
  const boom = () => { throw new Error('bloqueado'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

describe('best-score', () => {
  it('devuelve null cuando el almacenamiento está vacío', () => {
    const storage = makeFakeStorage();
    assert.equal(loadBestScore(storage), null);
  });

  it('guarda 1200 → isNew true; load devuelve 1200', () => {
    const storage = makeFakeStorage();
    const { best, isNew } = saveBestScore(storage, 1200);
    assert.equal(isNew, true);
    assert.equal(best, 1200);
    assert.equal(loadBestScore(storage), 1200);
  });

  it('guarda 900 → isNew false, best 1200, valor almacenado no cambia', () => {
    const storage = makeFakeStorage();
    saveBestScore(storage, 1200);
    const { best, isNew } = saveBestScore(storage, 900);
    assert.equal(isNew, false);
    assert.equal(best, 1200);
    assert.equal(storage.getItem(BEST_SCORE_KEY), '1200');
  });

  it('guarda 1500 → isNew true', () => {
    const storage = makeFakeStorage();
    saveBestScore(storage, 1200);
    const { best, isNew } = saveBestScore(storage, 1500);
    assert.equal(isNew, true);
    assert.equal(best, 1500);
  });

  it('almacenamiento que lanza → load null, save no lanza y devuelve { best: total, isNew: true }', () => {
    const storage = makeThrowingStorage();
    assert.equal(loadBestScore(storage), null);
    const result = saveBestScore(storage, 500);
    assert.deepEqual(result, { best: 500, isNew: true });
  });

  it('almacenamiento null → load null, save no lanza', () => {
    assert.equal(loadBestScore(null), null);
    const result = saveBestScore(null, 300);
    assert.deepEqual(result, { best: 300, isNew: true });
  });

  it('valor almacenado "abc" → load null', () => {
    const storage = makeFakeStorage();
    storage.setItem(BEST_SCORE_KEY, 'abc');
    assert.equal(loadBestScore(storage), null);
  });
});
