import { aa3TowerDefinition } from './aa3.js';
import { lm2TowerDefinition } from './lm2.js';
import { mg7TowerDefinition } from './mg7.js';
import { rk40TowerDefinition } from './rk40.js';

// En el orden en que aparecen en la barra de torres.
export const towerDefinitions = {
  [mg7TowerDefinition.id]: mg7TowerDefinition,
  [lm2TowerDefinition.id]: lm2TowerDefinition,
  [rk40TowerDefinition.id]: rk40TowerDefinition,
  [aa3TowerDefinition.id]: aa3TowerDefinition,
};
