import { MUNITION_CLASSES } from '../enemies/vehicle-combat.js';

export const mg7TowerDefinition = {
  id: 'mg7-vulcan',
  displayName: 'MG-7 VULCAN',
  shortName: 'MG-7',
  targeting: {
    default: 'nearest',
  },
  economy: {
    baseCost: 60,
    sellRatio: 0.6,
    // Vender una torre destruida no puede ser una reparación barata.
    destroyedSellRatio: 0.25,
  },
  combatModel: {
    damageType: MUNITION_CLASSES.lightBallistic,
    projectileSpeed: 14,
    projectileSizeBase: 0.02,
    projectileSizePerLevel: 0.004,
    hitThreshold: 0.12,
    // También le dispara a lo que vuela, pero rara vez le acierta.
    targets: { ground: true, air: true, airHitChance: 0.2, smallAirHitChance: 0.1 },
    // La torreta gira a yawSpeed (rad/s) y solo dispara alineada con el blanco (readyAngle).
    yawSpeed: Math.PI * 1.2,
    readyAngle: 0.05,
    // Elevación del cañón, positiva hacia arriba.
    elevationLimits: {
      min: -0.5,
      max: 0.72,
    },
  },
  // Un rig por nivel, con una boca por cañón, y sus restos. Mide `scale` celdas de largo en el nivel 1.
  model: {
    rigs: ['mg7-n1', 'mg7-n2', 'mg7-n3', 'mg7-n4', 'mg7-n5'],
    wreck: 'mg7-destruida',
    scale: 0.85,
  },
  panelModel: {
    className: 'Anti-ligeros',
    description: 'Ametralladora de cadencia rápida. Barre vehículos ligeros, pero su munición casi no atraviesa un blindaje pesado.',
    idealTarget: 'vehículos ligeros y rápidos, como las patrullas.',
    maxStats: {
      damage: 28,
      rate: 13,
      range: 4.3,
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
    // Cada nivel rinde más por crédito que poner torres básicas (tools/balance/level-value.mjs).
    { label: 'Cañón simple', damage: 5, rate: 2.5, range: 3.2, scale: 1, upgradeCost: 90 },
    { label: 'Cañón doble', damage: 8, rate: 4, range: 3.4, scale: 1.04, upgradeCost: 190 },
    { label: 'Triple cañón', damage: 13, rate: 5.5, range: 3.6, scale: 1.08, upgradeCost: 420 },
    { label: 'Cuádruple cañón', damage: 22, rate: 7.5, range: 3.9, scale: 1.12, upgradeCost: 630 },
    { label: 'Gatling', damage: 28, rate: 10.5, range: 4.3, scale: 1.16, upgradeCost: null },
  ],
};
