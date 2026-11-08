import { MUNITION_CLASSES } from '../enemies/vehicle-combat.js';

// RK-40 BRASA: artillería de cohetes incendiarios, de diseño ficticio. Dispara salvas en arco a
// donde va a estar su blanco, con alcance largo pero sin poder tirar cerca, y cada cohete deja una
// zona ardiendo. Barre a los soldados y a las motos; a lo blindado le hace poco, pero le recalienta el
// motor: frena al pasar por el fuego. Solo terrestre.

/** Un nivel de ataque. `damage`: lo que hace el impacto; `burnPerSecond`, la zona que deja. */
function level({ label, magazine, damage, burnPerSecond, burnSeconds, burnRadius, salvoInterval, reload, range, scale, upgradeCost }) {
  const cycle = (magazine - 1) * salvoInterval + reload;
  return {
    label, magazine, damage, burnPerSecond, burnSeconds, burnRadius, salvoInterval, reload, range, minRange: 2.5, scale, upgradeCost,
    rate: Math.round((magazine / cycle) * 100) / 100,
  };
}

export const rk40TowerDefinition = {
  id: 'rk40-brasa',
  displayName: 'RK-40 BRASA',
  shortName: 'RK-40',
  targeting: {
    default: 'infantry',
  },
  economy: {
    baseCost: 140,
    sellRatio: 0.6,
    destroyedSellRatio: 0.25,
  },
  combatModel: {
    damageType: MUNITION_CLASSES.areaIncendiary,
    projectileSpeed: 4.5,
    hitThreshold: 0.1,
    // Vuela en arco a un punto del suelo, no a un blanco: `scatter` es cuánto se abre la salva.
    artillery: { elevation: 0.42, arcHeight: 2, scatter: 0.45, impactRadius: 0.6 },
    impactBlast: 0.3,
    launch: true,
    yawSpeed: Math.PI * 0.42,
    readyAngle: 0.08,
    elevationLimits: { min: 0, max: 1 },
  },
  model: {
    rigs: ['rk40-brasa-n1', 'rk40-brasa-n2', 'rk40-brasa-n3', 'rk40-brasa-n4', 'rk40-brasa-n5'],
    wreck: 'rk40-brasa-destruida',
    scale: 0.85,
  },
  panelModel: {
    className: 'Incendiaria',
    description: 'Salvas de cohetes incendiarios en arco: dejan el suelo ardiendo. Barre soldados y motos, frena a los vehículos que pasan por el fuego, casi no daña lo blindado, no alcanza lo que tiene cerca ni dispara a lo que vuela.',
    idealTarget: 'grupos de soldados y motos, a distancia.',
    maxStats: {
      damage: 16,
      rate: 1.65,
      range: 5.8,
      scale: 1.08,
      armor: 12,
      hp: 360,
    },
  },
  defenseLevels: [
    {
      label: 'Blindaje ligero',
      armorClass: 'light',
      maxHp: 180,
      armor: 3,
      upgradeCost: 140,
    },
    {
      label: 'Blindaje medio',
      armorClass: 'medium',
      maxHp: 260,
      armor: 7,
      upgradeCost: 220,
    },
    {
      label: 'Blindaje pesado',
      armorClass: 'heavy',
      maxHp: 360,
      armor: 12,
      upgradeCost: null,
    },
  ],
  levels: [
    level({ label: 'Salva de 4', magazine: 4, damage: 6, burnPerSecond: 8, burnSeconds: 3.5, burnRadius: 0.55, salvoInterval: 0.35, reload: 7, range: 5, scale: 1, upgradeCost: 100 }),
    level({ label: 'Salva de 6', magazine: 6, damage: 8, burnPerSecond: 10, burnSeconds: 3.5, burnRadius: 0.58, salvoInterval: 0.3, reload: 7, range: 5.2, scale: 1.02, upgradeCost: 180 }),
    level({ label: 'Salva de 9', magazine: 9, damage: 10, burnPerSecond: 13, burnSeconds: 4, burnRadius: 0.62, salvoInterval: 0.25, reload: 7, range: 5.4, scale: 1.04, upgradeCost: 280 }),
    level({ label: 'Salva de 12', magazine: 12, damage: 13, burnPerSecond: 16, burnSeconds: 4, burnRadius: 0.66, salvoInterval: 0.22, reload: 7, range: 5.6, scale: 1.06, upgradeCost: 420 }),
    level({ label: 'Salva de 16', magazine: 16, damage: 16, burnPerSecond: 20, burnSeconds: 4.5, burnRadius: 0.7, salvoInterval: 0.18, reload: 7, range: 5.8, scale: 1.08, upgradeCost: null }),
  ],
};
