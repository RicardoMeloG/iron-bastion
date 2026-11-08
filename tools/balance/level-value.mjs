// Cuánto rinde cada nivel de una torre: daño por segundo contra cada enemigo, por crédito invertido
// en total. Si un nivel rindiera menos por crédito que el nivel 1, poner varias torres básicas
// siempre sería mejor que evolucionar una, y evolucionar no tendría sentido. Lo usan
// npm run simulate (que muestra la tabla) y tests/balance.test.js (que exige que no pase).
import { enemyDefinitions } from '../../src/content/enemies/index.js';
import { resolveDamage } from '../../src/core/simulation.js';

/** Por cada nivel: costo total, y daño por segundo y rendimiento por crédito contra el enemigo. */
export function levelValue(tower, enemyTypeId) {
  const { armorClass, stats } = enemyDefinitions[enemyTypeId];
  let totalCost = 0;
  return tower.levels.map((level, index) => {
    totalCost += index === 0 ? tower.economy.baseCost : tower.levels[index - 1].upgradeCost;
    const damagePerSecond = resolveDamage(level.damage, tower.combatModel.damageType, armorClass, stats.armor) * level.rate;
    return { level: index + 1, totalCost, damagePerSecond, perCredit: damagePerSecond / totalCost };
  });
}

/** Cada nivel contra el nivel 1: 1,2 significa que rinde por crédito un 20 % más que poner básicas. */
export function levelValueAgainstBasic(tower, enemyTypeId) {
  const rows = levelValue(tower, enemyTypeId);
  const basic = rows[0].perCredit;
  return rows.map((row) => ({ ...row, againstBasic: basic > 0 ? row.perCredit / basic : null }));
}
