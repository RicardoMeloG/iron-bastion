// El eje del modelo: el juego mueve a cada vehículo por su +Z, y el normalizador lleva a 1 lo que
// mide ese eje. Un manifiesto con el frente mal puesto no falla en ningún otro lado: el vehículo
// va de costado y, como se escala por su ancho, además sale gigante.
import test from 'node:test';
import assert from 'node:assert/strict';

import { enemyDefinitions } from '../src/content/enemies/index.js';
import { rigDefinitions } from '../src/content/rigs/index.js';

const vehicles = Object.values(enemyDefinitions).filter((definition) => !definition.id.startsWith('infantry'));

for (const definition of vehicles) {
  for (const rigId of [definition.model.rig, definition.model.wreck].filter(Boolean)) {
    test(`${definition.id}: ${rigId} es más largo que ancho y va a lo largo`, () => {
      const rig = rigDefinitions[rigId];
      assert.ok(rig, `sin rig ${rigId}`);
      // hitRadius es la mitad del lado horizontal mayor, cañón incluido: el del tanque sobresale 1,24.
      assert.ok(rig.hitRadius * 2 <= rig.hullLength * 1.3, `lado mayor ${rig.hitRadius * 2}, largo ${rig.hullLength}`);
      assert.ok(rig.height <= rig.hullLength, `alto ${rig.height}, largo ${rig.hullLength}`);
    });
  }
}
