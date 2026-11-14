import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAffordUpgrade,
  createFirstMinuteHints,
  HINT_TEXTS,
} from '../src/app/first-minute-hints.js';

// ─── Auxiliares ────────────────────────────────────────────────────────────────

function makeState({
  credits = 0,
  towers = [],
  gameOver = false,
  developerMode = { enabled: false },
} = {}) {
  return {
    credits,
    towers,
    gameOver,
    developerMode,
    config: {
      towerDefinitions: {
        mg7: {
          levels: [
            { upgradeCost: 60 },
            { upgradeCost: 90 },
            { upgradeCost: null },
          ],
        },
      },
    },
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function makeRecorder() {
  const calls = [];
  return {
    calls,
    show: (id, text) => calls.push(['show', id, text]),
    hide: () => calls.push(['hide']),
  };
}

// ─── (a) Consejo "place": aparece una vez, se oculta al poner torre, no repite ─

test('place hint: muestra una vez al inicio, se oculta al colocar torre, no repite con misma storage', () => {
  const storage = makeStorage();
  const rec = makeRecorder();
  const hints = createFirstMinuteHints({ storage, ...rec });

  // Al inicio (sin torres) debe mostrar el consejo "place".
  hints.update(makeState({ towers: [] }));
  assert.equal(hints.current, 'place');
  assert.deepEqual(rec.calls, [['show', 'place', HINT_TEXTS.place]]);

  // Al colocar la primera torre, el consejo se oculta.
  const tower = { towerTypeId: 'mg7', level: 0, destroyed: false };
  hints.update(makeState({ towers: [tower] }));
  assert.equal(hints.current, null);
  assert.deepEqual(rec.calls, [
    ['show', 'place', HINT_TEXTS.place],
    ['hide'],
  ]);

  // Segunda instancia con la misma storage: no debe mostrar "place" de nuevo.
  const rec2 = makeRecorder();
  const hints2 = createFirstMinuteHints({ storage, ...rec2 });
  hints2.update(makeState({ towers: [] }));
  assert.equal(hints2.current, null);
  assert.equal(rec2.calls.length, 0);
});

// ─── (b) Bloqueado: nada se muestra mientras hay modal ────────────────────────

test('blocked: no muestra nada mientras está bloqueado; al desbloquear sí muestra', () => {
  const storage = makeStorage();
  const rec = makeRecorder();
  const hints = createFirstMinuteHints({ storage, ...rec });

  // Bloqueado: no debe mostrar.
  hints.update(makeState({ towers: [] }), { blocked: true });
  assert.equal(hints.current, null);
  assert.equal(rec.calls.length, 0);

  // Desbloqueado: ahora sí muestra.
  hints.update(makeState({ towers: [] }), { blocked: false });
  assert.equal(hints.current, 'place');
  assert.deepEqual(rec.calls, [['show', 'place', HINT_TEXTS.place]]);
});

// ─── (c) Consejo "upgrade": créditos 59 no, 60 sí; se oculta al nivel 1 ──────

test('upgrade hint: 59 créditos no, 60 sí; se oculta cuando una torre llega a nivel 1', () => {
  const storage = makeStorage();
  const rec = makeRecorder();
  const hints = createFirstMinuteHints({ storage, ...rec });

  // Primero se muestra "place" (sin torres).
  hints.update(makeState({ towers: [] }));
  assert.equal(hints.current, 'place');

  // Se coloca una torre → "place" se oculta.
  const tower = { towerTypeId: 'mg7', level: 0, destroyed: false };
  hints.update(makeState({ towers: [tower] }));
  assert.equal(hints.current, null);

  // 59 créditos: no alcanza para upgrade.
  hints.update(makeState({ credits: 59, towers: [tower] }));
  assert.equal(hints.current, null);

  // 60 créditos: sí alcanza.
  hints.update(makeState({ credits: 60, towers: [tower] }));
  assert.equal(hints.current, 'upgrade');
  assert.ok(rec.calls.some((c) => c[0] === 'show' && c[1] === 'upgrade'));

  // La torre llega a nivel 1 → "upgrade" se oculta.
  const towerL1 = { towerTypeId: 'mg7', level: 1, destroyed: false };
  hints.update(makeState({ credits: 60, towers: [towerL1] }));
  assert.equal(hints.current, null);
  assert.ok(rec.calls.some((c) => c[0] === 'hide'));
});

// ─── (d) Modo desarrollador / créditos infinitos ──────────────────────────────

test('no muestra en modo desarrollador; upgrade no muestra con créditos infinitos', () => {
  // Modo desarrollador: nada se muestra.
  const storage1 = makeStorage();
  const rec1 = makeRecorder();
  const hints1 = createFirstMinuteHints({ storage: storage1, ...rec1 });
  hints1.update(makeState({ towers: [], developerMode: { enabled: true } }));
  assert.equal(hints1.current, null);
  assert.equal(rec1.calls.length, 0);

  // Créditos infinitos: "place" sí puede mostrarse, pero "upgrade" no.
  const storage2 = makeStorage();
  const rec2 = makeRecorder();
  const hints2 = createFirstMinuteHints({ storage: storage2, ...rec2 });

  // Sin torres: "place" se muestra (no depende de créditos).
  hints2.update(makeState({ credits: Infinity, towers: [] }));
  assert.equal(hints2.current, 'place');

  // Con torre: "place" se oculta, pero "upgrade" NO se muestra (créditos infinitos).
  const tower = { towerTypeId: 'mg7', level: 0, destroyed: false };
  hints2.update(makeState({ credits: Infinity, towers: [tower] }));
  assert.equal(hints2.current, null);
  assert.ok(!rec2.calls.some((c) => c[0] === 'show' && c[1] === 'upgrade'));
});

// ─── (e) dismiss: oculta y no vuelve a aparecer en la misma instancia ─────────

test('dismiss: oculta el consejo y no vuelve a mostrarse en la misma instancia', () => {
  const storage = makeStorage();
  const rec = makeRecorder();
  const hints = createFirstMinuteHints({ storage, ...rec });

  hints.update(makeState({ towers: [] }));
  assert.equal(hints.current, 'place');

  hints.dismiss();
  assert.equal(hints.current, null);
  assert.ok(rec.calls.some((c) => c[0] === 'hide'));

  // Llamar update de nuevo con el mismo estado: no debe re-mostrar.
  hints.update(makeState({ towers: [] }));
  assert.equal(hints.current, null);
  const showCalls = rec.calls.filter((c) => c[0] === 'show');
  assert.equal(showCalls.length, 1);
});

// ─── (f) Storage que lanza: sin excepción, cada consejo una sola vez ──────────

test('storage que lanza: no hay excepción y cada consejo se muestra una sola vez', () => {
  const throwingStorage = {
    getItem: () => {
      throw new Error('storage no disponible');
    },
    setItem: () => {
      throw new Error('storage no disponible');
    },
  };

  const rec = makeRecorder();
  const hints = createFirstMinuteHints({ storage: throwingStorage, ...rec });

  // No debe lanzar.
  assert.doesNotThrow(() => {
    hints.update(makeState({ towers: [] }));
  });
  assert.equal(hints.current, 'place');

  // Colocar torre → oculta.
  const tower = { towerTypeId: 'mg7', level: 0, destroyed: false };
  assert.doesNotThrow(() => {
    hints.update(makeState({ towers: [tower] }));
  });
  assert.equal(hints.current, null);

  // "place" no debe volver a mostrarse (el Set en memoria lo garantiza).
  assert.doesNotThrow(() => {
    hints.update(makeState({ towers: [] }));
  });
  const showPlace = rec.calls.filter((c) => c[0] === 'show' && c[1] === 'place');
  assert.equal(showPlace.length, 1);
});

// ─── (g) canAffordUpgrade: torre destruida / nivel máximo ─────────────────────

test('canAffordUpgrade: false para torre destruida y para torre en nivel máximo', () => {
  // Torre destruida.
  const stateDestroyed = makeState({
    credits: 200,
    towers: [{ towerTypeId: 'mg7', level: 0, destroyed: true }],
  });
  assert.equal(canAffordUpgrade(stateDestroyed), false);

  // Torre en nivel máximo (level 2 = levels.length - 1).
  const stateMaxLevel = makeState({
    credits: 200,
    towers: [{ towerTypeId: 'mg7', level: 2, destroyed: false }],
  });
  assert.equal(canAffordUpgrade(stateMaxLevel), false);
});
