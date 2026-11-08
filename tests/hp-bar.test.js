// La barra de vida avisa igual en unidades y torres: naranja desde la mitad y rojo desde un cuarto.
import test from 'node:test';
import assert from 'node:assert/strict';

import { HP_BAR_COLORS, hpBarColor } from '../src/render/config/rendering.js';

test('verde sobre la mitad, naranja desde la mitad, rojo desde un cuarto', () => {
  assert.equal(hpBarColor(1), HP_BAR_COLORS.healthy);
  assert.equal(hpBarColor(0.51), HP_BAR_COLORS.healthy);
  assert.equal(hpBarColor(0.5), HP_BAR_COLORS.low);
  assert.equal(hpBarColor(0.26), HP_BAR_COLORS.low);
  assert.equal(hpBarColor(0.25), HP_BAR_COLORS.critical);
  assert.equal(hpBarColor(0.01), HP_BAR_COLORS.critical);
});
