// El nivel de una torre se ve por su color y se puede contar, sin depender solo del color.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { towerDefinitions } from '../src/content/towers/index.js';
import { RENDERING_CONFIG } from '../src/render/config/rendering.js';
import { addLevelLights } from '../src/render/tower-level-lights.js';

const { colors, offColor, slots } = RENDERING_CONFIG.tower.levelLights;
const MG7 = towerDefinitions['mg7-vulcan'];

function lightsAt(level) {
  const group = addLevelLights(new THREE.Group(), level);
  const isRing = (mesh) => mesh.geometry.type === 'TorusGeometry';
  const pieces = group.children.filter((mesh) => !isRing(mesh));
  return {
    rings: group.children.filter(isRing),
    on: pieces.filter((mesh) => mesh.material.color.getHex() !== offColor),
    pieces,
  };
}

test('hay un color por nivel, distinto en cada uno, y el nivel 1 no lleva luz', () => {
  assert.equal(colors.length, MG7.levels.length);
  assert.equal(colors[0], null);
  assert.equal(new Set(colors).size, colors.length);
});

test('el nivel 1 no lleva anillo y tiene todas las ranuras apagadas', () => {
  const { on, pieces, rings } = lightsAt(0);
  assert.equal(rings.length, 0);
  assert.equal(on.length, 0);
  assert.equal(pieces.length, slots.angles.length);
});

for (let level = 1; level < 5; level++) {
  test(`el nivel ${level + 1} lleva su anillo y ${level} ranura(s) encendida(s), de su color`, () => {
    const { on, pieces, rings } = lightsAt(level);
    assert.equal(rings.length, 1);
    assert.equal(on.length, level);
    assert.equal(pieces.length, slots.angles.length);
    for (const mesh of [...on, ...rings]) assert.equal(mesh.material.color.getHex(), colors[level]);
  });
}

test('hay una ranura por cada mejora posible', () => {
  assert.equal(slots.angles.length, MG7.levels.length - 1);
});

test('las luces comparten recursos: quitar una torre no las rompe en las demás', () => {
  const group = addLevelLights(new THREE.Group(), 4);
  assert.ok(group.children.every((mesh) => mesh.userData.sharedResources));
});

test('todas las torres tienen un color por nivel y una ranura por mejora', () => {
  for (const definition of Object.values(towerDefinitions)) {
    assert.equal(definition.levels.length, colors.length, definition.id);
    assert.equal(definition.levels.length - 1, slots.angles.length, definition.id);
  }
});
