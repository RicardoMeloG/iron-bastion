// La partida no depende de la tasa de cuadros: el bucle (src/app/main.js) da pasos fijos con
// createFixedStepper y las armas conservan el sobrante de su enfriamiento.
import test from 'node:test';
import assert from 'node:assert/strict';

import { GAMEPLAY_CONFIG } from '../src/content/gameplay.js';
import { towerDefinitions } from '../src/content/towers/index.js';
import { consumeEffects, createFixedStepper, createGameConfig, createInitialState, placeTower, startWave, tickSimulation, upgradeTower } from '../src/core/index.js';

const { fixedStep, maxStepsPerFrame } = GAMEPLAY_CONFIG.simulation;
const FRAME_RATES = [30, 60, 144];

test('da un paso cada 1/60 s a cualquier tasa de cuadros', () => {
  for (const fps of FRAME_RATES) {
    const stepper = createFixedStepper({ step: fixedStep, maxStepsPerFrame });
    let steps = 0;
    for (let frame = 0; frame < fps * 10; frame++) steps += stepper.advance(1 / fps);
    assert.ok(Math.abs(steps - 600) <= 1, `${fps} fps: ${steps} pasos en 10 s`);
  }
});

test('el multiplicador de velocidad da más pasos y sube el tope con él', () => {
  const stepper = createFixedStepper({ step: fixedStep, maxStepsPerFrame });
  assert.equal(stepper.advance(1 / 60, 4), 4);
  assert.equal(stepper.advance(1000, 4), maxStepsPerFrame * 4);
});

test('tras un cuadro muy largo se detiene en el tope y no arrastra la deuda', () => {
  const stepper = createFixedStepper({ step: fixedStep, maxStepsPerFrame });
  assert.equal(stepper.advance(60), maxStepsPerFrame);
  assert.equal(stepper.advance(1 / 60), 1);
});

// Una oleada de la partida con el bucle a una tasa fija: lo que el jugador vería a esos fps.
function playAt(fps) {
  const state = createInitialState(createGameConfig());
  state.credits = 5000;
  const towers = [placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 }), placeTower(state, { towerTypeId: 'lm2-lanza', gx: 8, gy: 3 })];
  for (const tower of towers) upgradeTower(state, tower.id);
  startWave(state, { overrideWaveDefinition: { interval: 1, spawns: ['patrulla', 'apc-8x8', 'tank-heavy'] } });
  const stepper = createFixedStepper({ step: fixedStep, maxStepsPerFrame });
  let shots = 0;
  for (let frame = 0; frame < fps * 120 && state.waveActive && !state.gameOver; frame++) {
    const steps = stepper.advance(1 / fps);
    for (let step = 0; step < steps; step++) tickSimulation(state, fixedStep);
    shots += consumeEffects(state).filter((effect) => effect.type === 'projectile-fired').length;
  }
  return { shots, lives: state.lives, credits: state.credits, towerHp: towers.map((tower) => tower.hp) };
}

test('una misma oleada termina igual a 30, 60 y 144 fps', () => {
  const [reference, ...others] = FRAME_RATES.map(playAt);
  assert.ok(reference.shots > 0);
  for (const other of others) assert.deepEqual(other, reference);
});

// Una torre del nivel pedido contra un vehículo quieto en su alcance, que no muere ni dispara.
function firingOverSeconds(towerTypeId, level, seconds) {
  const state = createInitialState(createGameConfig());
  state.credits = 1e6;
  const tower = placeTower(state, { towerTypeId, gx: 6, gy: 4 });
  for (let upgrade = 0; upgrade < level; upgrade++) upgradeTower(state, tower.id);
  startWave(state, { overrideWaveDefinition: { interval: 1, spawns: ['tank-heavy'] } });
  const steps = Math.round(seconds / fixedStep);
  const times = [];
  for (let step = 0; step < steps; step++) {
    tickSimulation(state, fixedStep);
    for (const enemy of state.enemies) {
      enemy.hp = enemy.maxHp = 1e9;
      enemy.isArmed = false;
      enemy.pathIndex = state.config.pathWorld.length - 1;
      enemy.position = { x: tower.wx + 2 * state.config.worldScale, y: state.config.pathSurfaceY, z: tower.wz };
    }
    for (const effect of consumeEffects(state)) if (effect.type === 'projectile-fired') times.push(step * fixedStep);
  }
  return times;
}

test('la Gatling dispara a sus 10,5 tiros por segundo nominales', () => {
  const times = firingOverSeconds('mg7-vulcan', 4, 30);
  const rate = (times.length - 1) / (times.at(-1) - times[0]);
  assert.ok(Math.abs(rate - 10.5) < 0.1, `${rate.toFixed(2)} disparos/s`);
});

test('la LM-2 repite su ciclo de salva y recarga sin perder tiempo', () => {
  // Nivel 1: los tubos salen separados por `salvoInterval` y después recarga.
  const { magazine, salvoInterval, reload } = towerDefinitions['lm2-lanza'].levels[0];
  const expected = (magazine - 1) * salvoInterval + reload;
  const times = firingOverSeconds('lm2-lanza', 0, 60);
  const cycles = Math.floor((times.length - 1) / magazine);
  const cycle = (times[cycles * magazine] - times[0]) / cycles;
  assert.ok(Math.abs(cycle - expected) < 0.02, `ciclo de ${cycle.toFixed(3)} s; se esperaban ${expected.toFixed(3)}`);
});

test('un arma ociosa no acumula disparos para soltarlos de golpe', () => {
  const state = createInitialState(createGameConfig());
  state.credits = 1e6;
  const tower = placeTower(state, { towerTypeId: 'mg7-vulcan', gx: 6, gy: 4 });
  for (let step = 0; step < 600; step++) tickSimulation(state, fixedStep);
  assert.ok(tower.cooldown >= -fixedStep, `enfriamiento ${tower.cooldown}`);
});
