// El tanque según por dónde le pegan: 60 % menos de frente y 50 % más por atrás.
import test from 'node:test';
import assert from 'node:assert/strict';

import { enemyDefinitions } from '../src/content/enemies/index.js';
import { MUNITION_CLASSES } from '../src/content/enemies/vehicle-combat.js';
import { getFacingMultiplier } from '../src/core/simulation.js';

const { facing } = enemyDefinitions['tank-heavy'];
// Rumbo 0: el tanque mira hacia +z.
const shotTravelling = (vx, vz, rotation = 0) => getFacingMultiplier(facing, rotation, vx, vz);

test('de frente recibe 60 % menos y por atrás 50 % más', () => {
  assert.equal(facing.front, 0.4);
  assert.equal(facing.rear, 1.5);
  assert.equal(shotTravelling(0, -1), 0.4, 'el disparo viene hacia su frente');
  assert.equal(shotTravelling(0, 1), 1.5, 'el disparo llega desde atrás');
});

test('los costados reciben el daño normal', () => {
  assert.equal(shotTravelling(1, 0), 1);
  assert.equal(shotTravelling(-1, 0), 1);
});

test('cuenta el rumbo del tanque, no la dirección del mapa', () => {
  assert.equal(shotTravelling(-1, 0, Math.PI / 2), 0.4, 'mira hacia +x y el disparo viaja hacia -x');
  assert.equal(shotTravelling(1, 0, Math.PI / 2), 1.5);
  assert.equal(shotTravelling(0, 1, Math.PI / 2), 1);
});

test('el largo del vector de viaje no cambia el resultado', () => {
  assert.equal(shotTravelling(0, -30), 0.4);
  assert.equal(shotTravelling(0, 0), 1, 'sin dirección no hay costado que valga');
});

test('el blindado medio frena 80 % de las armas ligeras de frente, y solo esas y solo ahí', () => {
  const armored = enemyDefinitions['apc-8x8'].facing;
  assert.equal(getFacingMultiplier(armored, 0, 0, -1, MUNITION_CLASSES.lightBallistic), 0.2);
  assert.equal(getFacingMultiplier(armored, 0, 0, -1, MUNITION_CLASSES.heavyBallistic), 1);
  assert.equal(getFacingMultiplier(armored, 0, 0, 1, MUNITION_CLASSES.lightBallistic), 1);
  assert.equal(getFacingMultiplier(armored, 0, 1, 0, MUNITION_CLASSES.lightBallistic), 1);
});

test('los demás vehículos no tienen esta regla', () => {
  assert.equal(enemyDefinitions.patrulla.facing, null);
  assert.equal(getFacingMultiplier(null, 0, 0, 1), 1);
});
