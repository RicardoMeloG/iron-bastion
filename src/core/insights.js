// Lo que la interfaz le cuenta al jugador sobre las oleadas y las torres, calculado con las
// mismas reglas del combate para que nunca se desfase de lo que de verdad pasa.
import { GAMEPLAY_CONFIG } from '../content/gameplay.js';
import { resolveDamage, resolveEnemyBurnDamage } from './simulation.js';

const ARMOR_ORDER = ['heavy', 'medium', 'light', 'infantry'];

/** Qué trae una oleada: cuántos vehículos, de qué tipos (los más blindados primero) y cuánto paga. */
// Los soldados se cuentan por unidad: quién lleva misil lo decide su nivel, al salir.
function asSoldierUnits(row) {
  if (row.armorClass !== 'infantry') return row;
  const { frontPerTeam, rearPerTeam } = GAMEPLAY_CONFIG.infantryTeams;
  const count = Math.ceil(row.count / (frontPerTeam + rearPerTeam));
  return { ...row, count, name: count === 1 ? 'Unidad de soldados' : 'Unidades de soldados' };
}

export function summarizeWave(spawns, enemyDefinitions) {
  const rows = new Map();
  let reward = 0;
  for (const enemyTypeId of spawns) {
    const definition = enemyDefinitions[enemyTypeId];
    if (!definition) continue;
    reward += definition.stats.reward;
    const row = rows.get(enemyTypeId);
    if (row) row.count += 1;
    else rows.set(enemyTypeId, { id: enemyTypeId, name: definition.displayName, armorClass: definition.armorClass, count: 1 });
  }
  return {
    total: spawns.length,
    reward,
    rows: [...rows.values()].map(asSoldierUnits).sort((a, b) => ARMOR_ORDER.indexOf(a.armorClass) - ARMOR_ORDER.indexOf(b.armorClass)),
  };
}

/**
 * Cuánto daño hace de verdad un disparo de este nivel contra cada clase de blindaje, respecto
 * del daño que anuncia la torre: 0.28 es +28 %, -1 es sin daño. Cuenta la munición y también
 * la armadura media de los vehículos de esa clase, que es lo que frena a la MG-7 ante un tanque.
 */
export function estimateTowerEffectiveness(towerDefinition, level, enemyDefinitions) {
  const { damage } = towerDefinition.levels[level];
  const result = {};
  for (const armorClass of ARMOR_ORDER) {
    const armors = Object.values(enemyDefinitions)
      .filter((definition) => definition.armorClass === armorClass)
      .map((definition) => definition.stats.armor);
    if (armors.length === 0) continue;
    const averageArmor = armors.reduce((sum, armor) => sum + armor, 0) / armors.length;
    const resolve = towerDefinition.combatModel.artillery ? resolveEnemyBurnDamage : resolveDamage;
    // Lo que no dispara a tierra no le hace nada a ningún blindaje de tierra.
    const reaches = towerDefinition.combatModel.targets?.ground ?? true;
    result[armorClass] = !reaches ? 0 : resolve(damage, towerDefinition.combatModel.damageType, armorClass, averageArmor) / damage - 1;
  }
  return result;
}
