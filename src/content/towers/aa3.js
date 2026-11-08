import { MUNITION_CLASSES } from '../enemies/vehicle-combat.js';

// AA-3 HALCÓN: ametralladora antiaérea, de diseño ficticio. Solo dispara a lo que vuela, y casi
// siempre le acierta. Contra los soldados y los vehículos no sirve.

export const aa3TowerDefinition = {
  id: 'aa3-halcon',
  displayName: 'AA-3 HALCÓN',
  shortName: 'AA-3',
  targeting: {
    default: 'nearest',
  },
  economy: {
    baseCost: 110,
    sellRatio: 0.6,
    destroyedSellRatio: 0.25,
  },
  combatModel: {
    damageType: MUNITION_CLASSES.lightBallistic,
    projectileSpeed: 16,
    projectileSizeBase: 0.016,
    projectileSizePerLevel: 0.003,
    hitThreshold: 0.12,
    targets: { ground: false, air: true, airHitChance: 0.85 },
    // Sus balas estallan en el aire: al blanco le pega entera y a los que vuelan cerca, `share` de su daño.
    flak: { radius: 0.7, share: 0.5, blast: 0.3 },
    yawSpeed: Math.PI * 1.5,
    readyAngle: 0.06,
    elevationLimits: { min: -0.1, max: 1.3 },
  },
  model: {
    // Los niveles 4 y 5 usan el modelo del 3, más grande: faltan sus conceptos.
    rigs: ['aa3-halcon-n1', 'aa3-halcon-n2', 'aa3-halcon-n3', 'aa3-halcon-n4', 'aa3-halcon-n5'],
    wreck: 'aa3-halcon-destruida',
    scale: 0.85,
  },
  panelModel: {
    className: 'Antiaérea',
    description: 'Ametralladora de largo alcance contra drones: casi no falla. No puede dispararle a nada que vaya por tierra.',
    idealTarget: 'drones FPV y de ala delta.',
    maxStats: {
      damage: 24,
      rate: 16,
      range: 6.5,
      scale: 1.16,
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
    { label: 'Cañón simple', damage: 6, rate: 3, range: 5, scale: 1, upgradeCost: 110 },
    { label: 'Cañón doble', damage: 9, rate: 3.5, range: 5.4, scale: 1.04, upgradeCost: 190 },
    { label: 'Cuádruple cañón', damage: 13, rate: 4.5, range: 5.8, scale: 1.08, upgradeCost: 300 },
    { label: 'Cuádruple reforzado', damage: 18, rate: 5.5, range: 6.2, scale: 1.12, upgradeCost: 450 },
    { label: 'Cuádruple pesado', damage: 24, rate: 7, range: 6.5, scale: 1.16, upgradeCost: null },
  ],
};
